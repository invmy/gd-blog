## 📝 项目简介

这是一个基于 **Astro v6** 构建的现代化、高性能博客引擎。它创新性地使用 **GitHub Discussions** 作为 Headless CMS，并无缝部署于 **Cloudflare Workers** 边缘网络。

### ✨ 核心特性

- **极致性能**: 利用 Astro 6 优化的渲染模式，实现近乎瞬时的加载速度。
- **Discussions 驱动**: 直接在 GitHub 上发布和编辑文章，无需管理额外的数据库或后台。
- **边缘计算**: 针对 Cloudflare Workers 深度优化，全球范围低延迟响应。
- **人文设计**: 极简纸张感（Paper-style）设计，支持原生深色/浅色模式切换。
- **SEO 友好**: 自动生成 Sitemap、RSS 订阅源，以及针对 AI 爬虫优化的 Meta 标签。
- **动态分享图**: 使用 Satori 自动为每篇文章生成 Vercel 风格的 OG 预览图。

### 🛠️ 技术栈

- **框架**: [Astro v6](https://www.google.com/search?q=https://astro.build/)
- **内容管理**: GitHub GraphQL API (Discussions)
- **部署平台**: [Cloudflare Workers](https://www.google.com/search?q=https://workers.cloudflare.com/)
- **样式方案**: 原生 CSS 变量 (支持 `light-dark()` 函数)

---

## 🛠️ Configuration / 配置

### Environment Variables / 环境变量

在根目录创建 `.env` 文件：

```env
GITHUB_TOKEN=your_personal_access_token
GITHUB_USER=your_username
GITHUB_REPO=your_repo_name
SITE_TITLE=your_site_title
SITE_DESCRIPTION=your_site_description
```

### Local Development / 本地开发

```bash
# Install dependencies / 安装依赖
bun i

# Build and Deploy to Cloudflare / 构建并部署至 Cloudflare
bun wrangler deploy

# Run locally / 本地运行
bun dev

# Build / 构建
bun astro build
```
