import {
  getCollectionData,
  getEntryData,
  type GitHubDiscussion,
} from "./github";

interface CollectionFilter {
  category?: string;
  pinned?: boolean;
  author?: string;
  tags?: string[];
}

interface EntryFilter {
  id: string;
}

// Minimal definition for LiveLoader if not available globally
type LiveLoader<TData, TEntryFilter, TCollectionFilter> = {
  name: string;
  loadCollection: (args: {
    filter?: TCollectionFilter;
  }) => Promise<{ entries: any[] } | { error: any }>;
  loadEntry: (args: { filter?: TEntryFilter }) => Promise<any>;
};

export function Loader(): LiveLoader<
  GitHubDiscussion,
  EntryFilter,
  CollectionFilter
> {
  return {
    name: "GithubLoader",

    // ── loadCollection ────────────────────────────────────────────
    loadCollection: async ({ filter }) => {
      try {
        const filterKey = buildFilterKey(filter);

        // Sync and get all discussions and current etag from KV
        const { discussions: allDiscussions, etag: syncEtag } =
          await getCollectionData();

        // Apply filters (including category, author, tags)
        let filtered = applyPostFilters(allDiscussions, filter);

        // Handle pins specifically if requested in filter
        if (filter?.pinned) {
          filtered = filtered.filter((d) => d.isPinned);
        }

        const latestUpdateTimestamp = filtered.reduce(
          (max, d) =>
            Math.max(max, new Date(d.updatedAt || d.createdAt).getTime()),
          0,
        );
        const latestUpdate = new Date(latestUpdateTimestamp || Date.now());

        return {
          entries: filtered.map((discussion) => {
            return {
              id: discussion.number.toString(),
              data: discussion,
              rendered: { html: "" },
              cacheHint: {
                tags: ["entry", `entry:${discussion.number}`],
              },
            };
          }),
        };
      } catch (e: any) {
        console.error(`[GithubLoader LoadCollection Failed] ${e.message || e}`);
        return { error: e };
      }
    },

    // ── loadEntry ─────────────────────────────────────────────────
    loadEntry: async ({ filter }) => {
      const discussionNumber = filter?.id;
      if (!discussionNumber) return undefined;

      try {
        const { discussion, etag: syncEtag } =
          await getEntryData(discussionNumber);

        if (!discussion) return undefined;

        // Fetch neighbors for pagination
        const { next, prev } = await (
          await import("./github")
        ).getEntryNeighbors(discussionNumber);

        return {
          id: discussion.number.toString(),
          data: {
            ...discussion,
            next: next
              ? {
                  id: next.number.toString(),
                  title: next.title,
                  categorySlug: next.category.slug,
                }
              : null,
            prev: prev
              ? {
                  id: prev.number.toString(),
                  title: prev.title,
                  categorySlug: prev.category.slug,
                }
              : null,
          },
          rendered: {
            html: await transformContent(
              discussion.bodyHTML || discussion.bodyText || "",
            ),
          },
          cacheHint: {
            tags: ["entry", `entry:${discussion.number}`],
            lastModified: new Date(
              discussion.updatedAt || discussion.createdAt,
            ),
          },
        };
      } catch (e: any) {
        console.error(`[GithubLoader LoadEntry Failed] ${e.message || e}`);
        return { error: e };
      }
    },
  };
}

// ── Helper Functions ──────────────────────────────────────────────

function buildFilterKey(filter?: CollectionFilter): string {
  if (!filter) return "default";
  return Object.entries(filter)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("-");
}

function applyPostFilters(
  discussions: GitHubDiscussion[],
  filter?: CollectionFilter,
): GitHubDiscussion[] {
  let result = [...discussions];

  if (filter?.category) {
    result = result.filter(
      (d) =>
        d.category.slug === filter.category ||
        d.category.name === filter.category,
    );
  }

  if (filter?.author) {
    result = result.filter((d) => d.author.login === filter.author);
  }

  if (filter?.tags && filter.tags.length > 0) {
    result = result.filter((d) =>
      filter.tags!.every((tag) => d.labels.nodes.some((l) => l.name === tag)),
    );
  }

  return result;
}

async function transformContent(html: string): Promise<string> {
  // Simple pass-through for now.
  return html;
}
