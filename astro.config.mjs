// @ts-check
import {
  defineConfig,
  fontProviders,
  memoryCache,
  envField,
} from "astro/config";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "http://localhost:4321/",
  output: "server",
  i18n: {
    defaultLocale: "zh-cn",
    locales: ["zh-cn", "en", "fr", "pt-br", "es"],
  },
  adapter: cloudflare({
    sessionKVBindingName: "KV",
    imageService: { build: "compile", runtime: "passthrough" },
  }),

  experimental: {
    rustCompiler: true,
    cache: {
      provider: memoryCache(),
    },
  },
  env: {
    schema: {
      GITHUB_TOKEN: envField.string({
        context: "server",
        access: "secret",
        optional: false,
      }),
      GITHUB_USER: envField.string({
        context: "server",
        access: "public",
        optional: false,
      }),
      GITHUB_REPO: envField.string({
        context: "server",
        access: "public",
        optional: false,
      }),
      SITE_TITLE: envField.string({
        context: "server",
        access: "public",
        optional: false,
      }),
      SITE_DESCRIPTION: envField.string({
        context: "server",
        access: "public",
        optional: false,
      }),
    },
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Geist",
      cssVariable: "--font-geist",
      weights: [300, 400, 500, 700],
      styles: ["normal", "italic"],
      fallbacks: [
        "Inter",
        "-apple-system",
        "BlinkMacSystemFont",
        "Segoe UI",
        "Roboto",
        "Helvetica Neue",
        "Arial",
        "sans-serif",
      ],
    },
    {
      provider: fontProviders.google(),
      name: "Geist Mono",
      cssVariable: "--font-geist-mono",
      weights: [300, 400, 500, 700],
      styles: ["normal", "italic"],
      fallbacks: [
        "ui-monospace",
        "SFMono-Regular",
        "Menlo",
        "Monaco",
        "Consolas",
        "Liberation Mono",
        "Courier New",
        "monospace",
      ],
    },
    {
      provider: fontProviders.google(),
      name: "Noto Sans SC",
      cssVariable: "--font-noto-sans-sc",
      weights: [300, 400, 500, 700],
      styles: ["normal", "italic"],
      formats: ["ttf"],
    },
  ],
});
