import rss from "@astrojs/rss";
import { SITE_TITLE, SITE_DESCRIPTION } from "astro:env/server";
import { getLiveCollection } from "astro:content";
import { i18n } from "astro:config/client";
export async function GET(context) {
  const { entries } = await getLiveCollection("data", {
    filter: (entry) => entry.data.category.slug === context.params.category,
  });
  const headers = {
    "Cache-Control": "public, max-age=600, s-maxage=60",
  };

  return rss({
    title: SITE_TITLE + " - " + context.params.category,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description || "",
      pubDate: new Date(entry.data.createdAt || entry.data.pubDate),
      link: `${context.site}${entry.data.category.slug}/p/${entry.id}`,
      content: entry.data.bodyHTML,
    })),
    customData: `<language>${i18n?.defaultLocale}</language>`,
    // 注入缓存头部
    headers: headers,
  });
}
