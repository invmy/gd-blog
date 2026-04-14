import { getLiveEntry } from "astro:content";
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, cache }) => {
  const { id } = params;

  const { entry, error, cacheHint } = await getLiveEntry("data", id as string);

  if (error || !entry) {
    return new Response("Not Found", { status: 404 });
  }

  if (cacheHint) {
    cache.set(cacheHint);
  }
  cache.set({ maxAge: 86400, swr: 3600 });

  const { data } = entry;
  const tags = data.labels.nodes.map((label: { name: string }) => label.name);

  const markdown = `---
title: ${data.title}
date: ${data.createdAt}
updated: ${data.lastEditedAt || data.updatedAt}
category: ${data.category.name}
tags: [${tags.join(", ")}]
author: ${data.author.login}
---

${data.body}
`;

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
};
