"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clampListPageSize, DEFAULT_LIST_PAGE_SIZE } from "@/lib/listPagination";

export { DEFAULT_LIST_PAGE_SIZE as DEFAULT_PAGE_SIZE };

export function useClientPagination<T>(
  items: T[],
  initialPageSize: number = DEFAULT_LIST_PAGE_SIZE
) {
  const [pageSize, setPageSizeState] = useState(() => clampListPageSize(initialPageSize));
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(clampListPageSize(size));
    setPage(1);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [pageSize, total]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    from,
    to,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    goPrev: () => setPage((p) => Math.max(1, p - 1)),
    goNext: () => setPage((p) => Math.min(totalPages, p + 1)),
  };
}