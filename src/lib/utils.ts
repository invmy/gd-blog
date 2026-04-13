// import slugify from "limax";
// export function toSlug(text: string): string {
//   if (!text) return "";

//   return slugify(text, {
//     tone: false,
//   });
// }

/**
 * 格式化 GitHub Discussions 的 ISO 日期字符串
 * 输出示例: Oct 24, 2023, 10:30 AM GMT+8
 */
import { i18n } from "astro:config/client";
export function formatDate(dateString: string | Date) {
  if (!dateString) return "";

  const date = new Date(dateString);

  return date.toLocaleDateString(i18n?.defaultLocale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // timeZoneName: "short",
  });
}
