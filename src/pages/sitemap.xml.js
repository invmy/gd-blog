import { getLiveCollection } from "astro:content";

export async function GET(context) {
  const { entries } = await getLiveCollection("data");
  const allPosts = entries || [];

  // 获取所有唯一的分类名，生成分类页链接
  const categories = [...new Set(allPosts.map((p) => p.data.category.slug))];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${context.site}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  ${categories
    .map(
      (cat) => `
  <url>
    <loc>${context.site}${cat}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join("")}

  ${allPosts
    .map(
      (post) => `
  <url>
    <loc>${context.site}categories/${post.data.category.slug}/p/${post.id}</loc>
    <lastmod>${new Date(post.data.lastEditedAt || post.data.createdAt).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`,
    )
    .join("")}
</urlset>`.trim();

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff", // 增强安全性
      "Cache-Control": "public, max-age=600, s-maxage=60",
    },
  });
}
