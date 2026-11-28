/** Default rows per page for module lists (tables, directories). */
export const DEFAULT_LIST_PAGE_SIZE = 10;

/** Standard page-size choices (matches backend reference picklist). */
export const LIST_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function clampListPageSize(size: number): number {
  const n = Number(size);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIST_PAGE_SIZE;
  if (n > 100) return 100;
  return Math.floor(n);
}

export function listOffset(page: number, limit: number): number {
  const p = Math.max(1, page);
  return (p - 1) * clampListPageSize(limit);
}