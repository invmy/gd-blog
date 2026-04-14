import { SITE_TITLE } from "astro:env/server";

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
      const fontPath = fontData["--og-font"]?.[0]?.src?.[0]?.url;
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
            backgroundColor: "#100f0f",
            color: "#cecdc3",
            fontFamily: "font",
            padding: "40px",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundImage:
                    "radial-gradient(circle at 2px 2px, #222 1px, transparent 0)",
                  backgroundSize: "40px 40px",
                  opacity: 0.3,
                },
              },
            },
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  border: "1px solid rgba(255, 252, 240, 0.1)",
                  borderRadius: "12px",
                  backgroundColor: "rgba(16, 15, 15, 0.8)",
                  overflow: "hidden",
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "30px 40px",
                        borderBottom: "1px solid rgba(255, 252, 240, 0.05)",
                      },
                      children: [
                        {
                          type: "div",
                          props: {
                            style: {
                              fontSize: "24px",
                              letterSpacing: "-0.05em",
                              display: "flex",
                              alignItems: "center",
                            },
                            children: [SITE_TITLE],
                          },
                        },
                        {
                          type: "div",
                          props: {
                            style: {
                              padding: "4px 12px",
                              fontSize: "18px",
                            },
                            children: `${entry.data.category.name}`,
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
                        flexDirection: "column",
                        flex: 1,
                        padding: "0 60px",
                        justifyContent: "center",
                      },
                      children: [
                        {
                          type: "div",
                          props: {
                            style: {
                              fontSize: "48px",
                              marginBottom: "16px",
                            },
                            children: `# ${entry.data.number}`,
                          },
                        },
                        {
                          type: "h1",
                          props: {
                            style: {
                              fontSize: "72px",
                              lineHeight: "1.1",
                              margin: 0,
                              letterSpacing: "-0.04em",
                              color: "#fff",
                            },
                            children: entry.data.title,
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
                        justifyContent: "space-between",
                        padding: "30px 40px",
                        backgroundColor: "rgba(255, 252, 240, 0.02)",
                        color: "#666",
                        fontSize: "20px",
                      },
                      children: [
                        {
                          type: "span",
                          props: { children: formatDate(entry.data.createdAt) },
                        },
                      ],
                    },
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
        fonts: [{ name: "font", data: fontCache }],
      },
    );
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
