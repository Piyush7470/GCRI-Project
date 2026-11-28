"use client";

import React, { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from "@/lib/listPagination";

export interface ListPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
  itemLabel?: string;
  className?: string;
  /** Hide when there is nothing to paginate (0 items). Still shows for 1 page. */
  hideWhenEmpty?: boolean;
  /** Current page size (rows per page). */
  pageSize?: number;
  /** Called when user picks a new page size — resets to page 1 in the parent. */
  onPageSizeChange?: (size: number) => void;
  /** Override selectable page sizes (default 10, 20, 50, 100). */
  pageSizeOptions?: readonly number[];
}

export function ListPagination({
  page,
  totalPages,
  total,
  from,
  to,
  onPrevious,
  onNext,
  disabled = false,
  itemLabel = "items",
  className,
  hideWhenEmpty = true,
  pageSize = DEFAULT_LIST_PAGE_SIZE,
  onPageSizeChange,
  pageSizeOptions = LIST_PAGE_SIZE_OPTIONS,
}: ListPaginationProps) {
  const selectId = useId();
  if (hideWhenEmpty && total === 0) return null;

  return (
    <div
      className={cn(
        "py-2.5 px-3.5 bg-slate-50/70 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-slate-300",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div>
          Showing{" "}
          <span className="font-semibold text-slate-900 dark:text-white">{from}</span> to{" "}
          <span className="font-semibold text-slate-900 dark:text-white">{to}</span> of{" "}
          <span className="font-semibold text-slate-900 dark:text-white">{total}</span> {itemLabel}
        </div>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 pl-0 sm:pl-2 sm:border-l border-slate-200 dark:border-slate-600">
            <label htmlFor={selectId} className="text-[11px] text-slate-500 whitespace-nowrap">
              Rows per page
            </label>
            <select
              id={selectId}
              value={String(pageSize)}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="text-xs py-1 px-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 min-w-[4.5rem]"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPrevious}
          disabled={disabled || page <= 1}
          className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none transition font-medium text-xs text-slate-700 dark:text-slate-100"
        >
          <ChevronLeft className="h-3 w-3" />
          Previous
        </button>

        <span className="px-2 font-semibold text-slate-700 dark:text-slate-200 text-xs">
          Page {page} of {Math.max(1, totalPages)}
        </span>

        <button
          type="button"
          onClick={onNext}
          disabled={disabled || page >= totalPages}
          className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none transition font-medium text-xs text-slate-700 dark:text-slate-100"
        >
          Next
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}