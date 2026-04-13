export interface PaginateOptions {
  pageSize: number;
  currentPage: number;
  baseUrl: string;
}

/**
 * A standard SSR pagination helper that mimics Astro's Page object.
 */
export function paginateSSR<T>(data: T[], options: PaginateOptions) {
  const { pageSize, currentPage, baseUrl } = options;
  const total = data.length;
  const lastPage = Math.ceil(total / pageSize);

  // Perform slice
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const slicedData = data.slice(start, end);

  // Helper to build consistent pagination URLs
  const getUrl = (p: number) => {
    if (p < 1 || p > lastPage) return undefined;
    // Ensure baseUrl doesn't end with a slash for consistent joining
    const cleanBase = baseUrl.replace(/\/$/, "");
    // Typical pattern: page 1 is the base, others have /pageNumber
    return p === 1 ? cleanBase : `${cleanBase}/${p}`;
  };

  return {
    data: slicedData,
    total,
    currentPage,
    lastPage,
    pageSize,
    url: {
      current: getUrl(currentPage),
      prev: getUrl(currentPage - 1),
      next: getUrl(currentPage + 1),
      first: getUrl(1),
      last: getUrl(lastPage),
    },
  };
}
