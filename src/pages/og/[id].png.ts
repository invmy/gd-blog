import type { APIRoute } from "astro";
import { fontData } from "astro:assets";
import { env } from "cloudflare:workers";
import { getLiveEntry } from "astro:content";
import { formatDate } from "@/lib/utils";

import satori, { init } from "satori/standalone";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

// @ts-ignore
import yogaWasm from "satori/yoga.wasm?module";
// @ts-ignore
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm?module";

let wasmInitPromise: Promise<void> | null = null;
let fontCache: ArrayBuffer | null = null;

async function initializeWasm(yogaWasm: any, resvgWasm: any) {
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      await Promise.all([init(yogaWasm), initWasm(resvgWasm)]);
      console.log("WASM Initialized successfully");
    } catch (e: any) {
      if (
        e.message?.includes("already initialized") ||
        e.message?.includes("used only once")
      ) {
        return;
      }

      wasmInitPromise = null;
      throw e;
    }
  })();

  return wasmInitPromise;
}

export const GET: APIRoute = async ({ params, request, cache }) => {
  const { entry, error, cacheHint } = await getLiveEntry(
    "data",
    params.id as string,
  );
  if (error || !entry) return new Response("Not Found", { status: 404 });
  if (cacheHint) {
    cache.set(cacheHint);
  }

  cache.set({ maxAge: 86400, swr: 3600 });
  try {
    await initializeWasm(yogaWasm, resvgWasm);

    if (!fontCache) {
      const fontPath = fontData["--font-noto-sans-sc"]?.[0]?.src?.[0]?.url;
      console.log("🔍 Font Path from fontData:", fontPath);

      if (!fontPath) {
        throw new Error("can't find the fontData url");
      }
      const fontUrl = new URL(fontPath, request.url);
      const fontRes = await env.ASSETS.fetch(fontUrl);

      if (!fontRes.ok) {
        throw new Error(`can't Get font for Assets API ${fontRes.status}`);
      }

      fontCache = await fontRes.arrayBuffer();
    }

    const svg = await satori(
      {
        type: "div",
        props: {
          style: {
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#000",
            color: "#fff",
            fontFamily: "MiSans",
            border: "1px solid #222",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  padding: "30px 40px",
                  borderBottom: "1px solid #222",
                  alignItems: "center",
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        border: "1px solid #444",
                        borderRadius: "8px",
                        padding: "4px 12px",
                        color: "#888",
                        fontSize: "24px",
                      },
                      children: "#" + entry.id,
                    },
                  },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flex: 1,
                  padding: "0 40px",
                  alignItems: "center",
                  justifyContent: "center",
                },
                children: {
                  type: "h1",
                  props: {
                    style: {
                      fontSize: "85px",
                      fontWeight: "300",
                      textAlign: "center",
                      lineHeight: "1.3",
                    },
                    children: entry.data.title,
                  },
                },
              },
            },
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "30px 40px",
                  borderTop: "1px solid #222",
                  color: "#666",
                },
                children: [
                  {
                    type: "span",
                    props: { children: formatDate(entry.data.createdAt) },
                  },
                  {
                    type: "span",
                    props: { children: entry.data.category.name },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: "MiSans",
            data: fontCache,
            weight: 400,
            style: "normal",
          },
        ],
      },
    );

    // 4. Resvg 渲染 PNG
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: 1200 },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    const finalHeaders: Record<string, string> = {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    if ((cacheHint as any)?.etag) {
      finalHeaders["ETag"] = (cacheHint as any).etag;
    }
    if (cacheHint?.lastModified) {
      finalHeaders["Last-Modified"] = cacheHint.lastModified.toUTCString();
    }

    return new Response(new Uint8Array(pngBuffer) as any, {
      headers: finalHeaders,
    });
  } catch (e: any) {
    console.error("OG Error:", e.message);
    return new Response(`Error generating image: ${e.message}`, {
      status: 500,
    });
  }
};
