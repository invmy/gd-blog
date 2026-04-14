## 📝 Project Overview

A modern, high-performance blog engine built with **Astro v6**, utilizing **GitHub Discussions** as a headless CMS and deployed globally on **Cloudflare Workers**.

### ✨ Key Features

- **Static & Server-side Rendering**: Leveraging Astro 6's optimized rendering modes for lightning-fast speeds.
- **GitHub Discussions as CMS**: Create, edit, and manage your blog posts directly from GitHub; no external database required.
- **Edge Deployment**: Optimized for Cloudflare Workers, ensuring low-latency access worldwide.
- **Paper-style UI**: A clean, typography-focused design with native light/dark mode support.
- **SEO Ready**: Automatic sitemap generation, RSS feeds, and AI-optimized meta tags.
- **Dynamic OG Images**: Automated Open Graph image generation using Satori.

### 🛠️ Tech Stack

- **Framework**: [Astro v6](https://www.google.com/search?q=https://astro.build/)
- **CMS**: GitHub GraphQL API (Discussions)
- **Deployment**: [Cloudflare Workers](https://www.google.com/search?q=https://workers.cloudflare.com/)
- **Styling**: CSS Variables with `light-dark()` support

## 🛠️ Configuration

### Environment Variables

Create a `.env` file in your root directory:

```env
GITHUB_TOKEN=your_personal_access_token
GITHUB_USER=your_username
GITHUB_REPO=your_repo_name
SITE_TITLE=your_site_title
SITE_DESCRIPTION=your_site_description
```

### Local Development

```bash
# Install dependencies
bun i

# Build and Deploy to Cloudflare
bun wrangler deploy

# Run locally
bun dev

# Build
bun astro build
```

#### wrangler

```
  "vars": {
    "GITHUB_TOKEN": "",
    "GITHUB_USER": "",
    "GITHUB_REPO": "",
    "SITE_TITLE": "",
    "SITE_DESCRIPTION": "",
  },
```
