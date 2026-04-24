import { GITHUB_TOKEN, GITHUB_REPO, GITHUB_USER } from "astro:env/server";
import { env } from "cloudflare:workers";
import temml from "temml";

interface Env {
  KV: KVNamespace;
}

// --- Interfaces ---
export interface GitHubAuthor {
  login: string;
  avatarUrl: string;
  url: string;
}

export interface GitHubCategory {
  id: string;
  name: string;
  emoji: string;
  emojiHTML: string;
  slug: string;
  description: string;
}

export interface GitHubDiscussion {
  id: string;
  number: number;
  title: string;
  bodyText: string;
  bodyHTML?: string;
  body: string;
  url: string;
  cover: string[] | null;
  bodyurl?: string | null;
  description?: string;
  createdAt: string;
  updatedAt: string;
  lastEditedAt: string | null;
  author: GitHubAuthor;
  category: GitHubCategory;
  labels: { nodes: { name: string }[] };
  isPinned: boolean;
  locked: boolean;
}

// --- Configuration & Constants ---
const GITHUB_API = "https://api.github.com/graphql";
const KV_KEYS = {
  DATA: "github_discussions_data",
  METADATA: "github_sync_metadata",
  README: "github_readme_data",
};

// --- In-memory Cache ---
let lastSyncTime = 0;
let lastFingerprint: string | null = null;
let lastReadmeTime = 0;
let cachedReadme: { html: string | null; etag: string | null } | null = null;
const CACHE_TTL = 60000; // 1 minute in ms

// --- API Helpers ---

async function fetchGH(query: string, variables: any) {
  const res = await fetch(GITHUB_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Astro-Loader",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors)
    throw new Error(`GraphQL Error: ${JSON.stringify(json.errors[0])}`);
  return json.data;
}

function rewriteAssetUrl(url: string) {
  // Convert private image links to permanent asset links
  // Pattern: https://private-user-images.githubusercontent.com/[User ID]/[Asset ID]-[UUID].png
  const privateMatch = url.match(
    /private-user-images\.githubusercontent\.com\/\d+\/[^-]+-([a-fA-F0-9-]+)\./,
  );
  if (privateMatch) {
    return `https://github.com/user-attachments/assets/${privateMatch[1]}`;
  }

  // Handle temporary S3-like links
  // Pattern: https://github-production-user-asset-6210df.s3.amazonaws.com/[User ID]/[Asset ID]/[Fingerprint]
  const s3Match = url.match(
    /github-production-user-asset-[^\/]+\/\d+\/\d+\/([a-fA-F0-9-]+)/,
  );
  if (s3Match) {
    return `https://github.com/user-attachments/assets/${s3Match[1]}`;
  }

  return url;
}

async function parseContent(html: string, text: string) {
  const cover: string[] = [];
  let bodyurl: string | null = null;

  // Pre-process to unwrap images for better figure wrapping
  const preProcessedHtml = html
    .replace(
      /<p dir="auto">\s*(?:<a [^>]*>\s*)?(<img [^>]*>)(?:\s*<\/a>)?\s*<\/p>/g,
      "$1",
    )
    .replace(/<a [^>]*>\s*(<img [^>]*>)\s*<\/a>/g, "$1");

  const rewriter = new HTMLRewriter()
    .on("img", {
      element(el) {
        // Prioritize data-canonical-src (original URL) over the Camo-proxied src
        const canonicalSrc = el.getAttribute("data-canonical-src");
        const src = el.getAttribute("src");
        const targetSrc = canonicalSrc || src;

        if (targetSrc) {
          const newSrc = rewriteAssetUrl(targetSrc);
          el.setAttribute("src", newSrc);
          el.setAttribute("loading", "lazy");
          el.removeAttribute("data-canonical-src"); // Clean up
          cover.push(newSrc);

          const alt = el.getAttribute("alt");
          el.before("<figure>", { html: true });
          if (alt) {
            el.after(`<figcaption>${alt}</figcaption></figure>`, {
              html: true,
            });
          } else {
            el.after("</figure>", { html: true });
          }
        }
      },
    })
    .on("a", {
      element(el) {
        const className = el.getAttribute("class") || "";
        const isIssueLink = className.includes("issue-link");

        if (isIssueLink) {
          const dataUrl = el.getAttribute("data-url");
          if (dataUrl) {
            const id = dataUrl.split("/discussions/").pop();
            if (id && /^\d+$/.test(id)) {
              el.setAttribute("href", `/categories/-/p/${id}`);
            }
          }
        }

        const currentHref = el.getAttribute("href");
        if (currentHref) {
          const newHref = rewriteAssetUrl(currentHref);
          el.setAttribute("href", newHref);

          // Only set bodyurl if it's an external link and NOT an image link
          const isImageLink = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(
            newHref,
          );
          if (
            !bodyurl &&
            !newHref.startsWith("/") &&
            !newHref.startsWith("#") &&
            !isImageLink &&
            !isIssueLink
          ) {
            bodyurl = newHref;
          }
        }
      },
    })
    .on("[data-snippet-clipboard-copy-content]", {
      element(el) {
        const copyButtonHtml = `
          <button class="copy-button" aria-label="Copy code" onclick="navigator.clipboard.writeText(this.parentElement.getAttribute('data-snippet-clipboard-copy-content')).then(() => {
            const originalText = this.innerText;
            this.innerText = 'Copied!';
            setTimeout(() => { this.innerText = originalText; }, 500);
          })">Copy</button>
        `.trim();
        el.prepend(copyButtonHtml, { html: true });
      },
    });

  // Math Rendering logic (Supports GitHub's <math-renderer>)
  let currentMath = "";

  rewriter.on("math-renderer, span.math-inline, div.math-display", {
    element(el) {
      const className = el.getAttribute("class") || "";
      const isInlineMode =
        className.includes("js-inline-math") || el.tagName === "span";
      currentMath = "";

      el.onEndTag((tag) => {
        try {
          // Cleanup: remove surrounding $$ or $ and decode basic entities
          let tex = currentMath.trim();
          if (tex.startsWith("$$") && tex.endsWith("$$")) {
            tex = tex.slice(2, -2).trim();
          } else if (tex.startsWith("$") && tex.endsWith("$")) {
            tex = tex.slice(1, -1).trim();
          }

          tex = tex
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");

          const rendered = temml.renderToString(tex, {
            displayMode: !isInlineMode,
          });
          tag.before(rendered, { html: true });
        } catch (e) {
          console.error("Temml error:", e);
        }
        tag.remove();
      });
    },
    text(t) {
      currentMath += t.text;
      t.remove();
    },
  });

  const transformedHTML = await rewriter
    .transform(new Response(preProcessedHtml))
    .text();

  // Extract description (first 200 chars) and normalize whitespace
  const cleanText = text.replace(/\s+/g, " ").trim();
  const description =
    cleanText.length > 200
      ? cleanText.substring(0, 200).trim() + "..."
      : cleanText;

  return {
    cover: cover.length > 0 ? cover : null,
    bodyurl,
    description,
    transformedHTML,
  };
}

async function mapPost(
  node: any,
  pinnedIds: Set<string>,
): Promise<GitHubDiscussion> {
  const extras = await parseContent(node.bodyHTML || "", node.bodyText || "");
  return {
    ...node,
    bodyHTML: extras.transformedHTML, // Store the proxied HTML
    cover: extras.cover,
    bodyurl: extras.bodyurl,
    description: extras.description,
    isPinned: pinnedIds.has(node.id),
  };
}

/**
 * Finds the previous and next discussions relative to a given discussion number.
 * Based on creation date (descending).
 */
export async function getEntryNeighbors(number: string) {
  const store = await getRawStore();
  if (!store || !store.discussions) return { prev: null, next: null };

  const sorted = [...store.discussions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const index = sorted.findIndex((d) => d.number.toString() === number);
  if (index === -1) return { prev: null, next: null };

  return {
    next: index > 0 ? sorted[index - 1] : null,
    prev: index < sorted.length - 1 ? sorted[index + 1] : null,
  };
}

// --- GraphQL Queries ---
const FRAGMENT = `
  id number title body bodyHTML bodyText url createdAt updatedAt lastEditedAt
  author { login avatarUrl url }
  category { id name emoji emojiHTML slug description }
  labels(first: 10) { nodes { name } }
  locked
`;

const INITIAL_QUERY = `
  query($owner: String!, $name: String!, $first: Int!) {
    repository(owner: $owner, name: $name) {
      pinnedDiscussions(first: 6) { nodes { discussion { ${FRAGMENT} } } }
      discussionCategories(first: 20) { nodes { id name emoji emojiHTML slug description } }
      discussions(first: $first, orderBy: {field: CREATED_AT, direction: DESC}) {
        pageInfo { hasNextPage endCursor }
        nodes { ${FRAGMENT} }
      }
    }
  }
`;

const PAGINATED_QUERY = `
  query($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      discussions(first: $first, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
        pageInfo { hasNextPage endCursor }
        nodes { ${FRAGMENT} }
      }
    }
  }
`;

const HEARTBEAT_QUERY = `
  query($owner: String!, $name: String!, $first: Int!) {
    repository(owner: $owner, name: $name) {
      discussions(first: $first, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes { id updatedAt }
      }
    }
  }
`;

// --- Sync & Storage Core ---

async function getKV() {
  const { KV } = env as any;
  return KV as KVNamespace;
}

/**
 * Performs heartbeat check and synchronizes with GitHub if necessary.
 * Always returns the current valid fingerprint (etag).
 */
export async function syncGitHubData(): Promise<string | null> {
  const now = Date.now();
  if (now - lastSyncTime < CACHE_TTL && lastFingerprint) {
    return lastFingerprint;
  }

  const kv = await getKV();
  const metadata = kv
    ? ((await kv.get(KV_KEYS.METADATA, "json")) as any)
    : null;
  const savedFingerprint = metadata?.fingerprint;

  // 1. Heartbeat
  const checkData = await fetchGH(HEARTBEAT_QUERY, {
    owner: GITHUB_USER,
    name: GITHUB_REPO,
    first: 5,
  });
  const nodes = checkData.repository.discussions.nodes;
  const currentFingerprint = nodes
    .map((n: any) => `${n.id}:${n.updatedAt}`)
    .join("|");

  if (savedFingerprint === currentFingerprint && kv) {
    lastSyncTime = now;
    lastFingerprint = currentFingerprint;
    return currentFingerprint;
  }

  // 2. Full Sync (Only if fingerprint changed)
  console.log("Syncing GitHub data...");
  const initial = await fetchGH(INITIAL_QUERY, {
    owner: GITHUB_USER,
    name: GITHUB_REPO,
    first: 100,
  });
  const repo = initial.repository;
  const categories = repo.discussionCategories.nodes;
  const pinnedIds = new Set(
    repo.pinnedDiscussions.nodes.map((n: any) => n.discussion.id),
  );

  let discussions: GitHubDiscussion[] = [];
  const existingIds = new Set<string>();

  // Add pinned discussions first to ensure they are always included
  for (const node of repo.pinnedDiscussions.nodes) {
    const discussion = await mapPost(node.discussion, pinnedIds);
    discussions.push(discussion);
    existingIds.add(discussion.id);
  }

  for (const node of repo.discussions.nodes) {
    if (!existingIds.has(node.id)) {
      discussions.push(await mapPost(node, pinnedIds));
      existingIds.add(node.id);
    }
  }

  let { hasNextPage, endCursor: after } = repo.discussions.pageInfo;
  while (hasNextPage) {
    const next = await fetchGH(PAGINATED_QUERY, {
      owner: GITHUB_USER,
      name: GITHUB_REPO,
      first: 100,
      after,
    });
    const disco = next.repository.discussions;
    for (const node of disco.nodes) {
      if (!existingIds.has(node.id)) {
        discussions.push(await mapPost(node, pinnedIds));
        existingIds.add(node.id);
      }
    }
    hasNextPage = disco.pageInfo.hasNextPage;
    after = disco.pageInfo.endCursor;
  }

  if (kv) {
    const result = { discussions, categories, etag: currentFingerprint };
    await kv.put(KV_KEYS.DATA, JSON.stringify(result));
    await kv.put(
      KV_KEYS.METADATA,
      JSON.stringify({ fingerprint: currentFingerprint }),
    );
  }

  lastSyncTime = now;
  lastFingerprint = currentFingerprint;
  return currentFingerprint;
}

/**
 * Low-level KV data retrieval
 */
async function getRawStore() {
  const kv = await getKV();
  return (kv ? await kv.get(KV_KEYS.DATA, "json") : null) as {
    discussions: GitHubDiscussion[];
    categories: GitHubCategory[];
    etag: string;
  } | null;
}

// --- Public API for Loader.ts ---

/**
 * Gets all discussions from KV after ensuring they are synced.
 */
export async function getCollectionData() {
  const etag = await syncGitHubData();
  const store = await getRawStore();
  return {
    discussions: store?.discussions || [],
    categories: store?.categories || [],
    etag: etag || store?.etag || null,
  };
}

/**
 * Gets a single discussion by its number from KV after ensuring they are synced.
 */
export async function getEntryData(number: string) {
  const etag = await syncGitHubData();
  const store = await getRawStore();
  const discussion = store?.discussions.find(
    (d) => d.number.toString() === number,
  );

  return {
    discussion,
    etag: etag || store?.etag || null,
  };
}

/**
 * Fetches the repository's README with KV caching and ETag validation.
 */
export async function getReadme() {
  const now = Date.now();
  if (now - lastReadmeTime < CACHE_TTL && cachedReadme) {
    return cachedReadme;
  }

  const kv = await getKV();
  const cached = kv ? ((await kv.get(KV_KEYS.README, "json")) as any) : null;

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/readme`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    "User-Agent": "Astro-Loader",
    Accept: "application/vnd.github.v3.html",
  };

  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  const res = await fetch(url, { headers });
  if (res.status === 304 && cached) {
    const result = { html: cached.html, etag: cached.etag };
    lastReadmeTime = now;
    cachedReadme = result;
    return result;
  }

  if (!res.ok) {
    const result = { html: cached?.html || null, etag: cached?.etag || null };
    lastReadmeTime = now;
    cachedReadme = result;
    return result;
  }

  const html = await res.text();
  const etag = res.headers.get("etag");

  // Transform content
  const extras = await parseContent(html, "");
  const transformedHTML = extras.transformedHTML;

  if (kv && etag) {
    await kv.put(
      KV_KEYS.README,
      JSON.stringify({
        html: transformedHTML,
        etag: etag,
      }),
    );
  }

  const result = { html: transformedHTML, etag };
  lastReadmeTime = now;
  cachedReadme = result;
  return result;
}
