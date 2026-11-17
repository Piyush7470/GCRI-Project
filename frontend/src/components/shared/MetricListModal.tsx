"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { EntityImage } from "@/components/shared/EntityImage";
import { ListPagination } from "@/components/shared/ListPagination";
import { useClientPagination } from "@/hooks/useClientPagination";

export type MetricListRow = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  details?: string[];
  badge?: string;
  badgeTone?: "neutral" | "success" | "warning" | "danger" | "info";
  imageUrl?: string | null;
  imageName?: string;
  imageVariant?: "logo" | "avatar";
  href?: string;
  onClick?: () => void;
};

export type MetricListModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  rows: MetricListRow[];
  emptyMessage?: string;
  footerHref?: string;
  footerLabel?: string;
  pageSize?: number;
  size?: "md" | "lg" | "xl";
};

const badgeClass: Record<NonNullable<MetricListRow["badgeTone"]>, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  info: "bg-teal-50 text-teal-800 border-teal-200",
};

const sizeClass: Record<NonNullable<MetricListModalProps["size"]>, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

/**
 * Popup list for dashboard / organizations metric cards — client-paginated.
 */
export function MetricListModal({
  open,
  onClose,
  title,
  description,
  rows,
  emptyMessage = "No items to display.",
  footerHref,
  footerLabel = "Open full page",
  pageSize = 8,
  size = "md",
}: MetricListModalProps) {
  const pagination = useClientPagination(rows, pageSize);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="metric-list-modal-title"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full ${sizeClass[size]} max-h-[min(85vh,720px)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 id="metric-list-modal-title" className="font-bold text-slate-900 text-sm">
              {title}
            </h3>
            {description && (
              <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
            )}
            <p className="text-[11px] font-semibold text-teal-700 mt-1">
              {rows.length} item{rows.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin]">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500">{emptyMessage}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pagination.pageItems.map((row) => {
                const content = (
                  <div className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/90 transition">
                    <EntityImage
                      src={row.imageUrl}
                      name={row.imageName || row.title}
                      variant={row.imageVariant || "logo"}
                      size="md"
                      className="h-9 w-9 mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {row.title}
                        </span>
                        {row.badge && (
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                              badgeClass[row.badgeTone || "neutral"]
                            }`}
                          >
                            {row.badge}
                          </span>
                        )}
                      </div>
                      {row.subtitle && (
                        <p className="text-[11px] text-slate-500 mt-0.5 whitespace-normal">
                          {row.subtitle}
                        </p>
                      )}
                      {row.meta && (
                        <p className="text-[10px] text-slate-400 mt-0.5 whitespace-normal">
                          {row.meta}
                        </p>
                      )}
                      {row.details && row.details.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {row.details.map((line) => (
                            <li
                              key={`${row.id}-${line}`}
                              className="text-[10px] text-slate-600 leading-snug"
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {(row.href || row.onClick) && (
                      <ExternalLink className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-1" />
                    )}
                  </div>
                );

                if (row.href) {
                  return (
                    <li key={row.id}>
                      <Link href={row.href} onClick={onClose} className="block">
                        {content}
                      </Link>
                    </li>
                  );
                }

                if (row.onClick) {
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          row.onClick?.();
                          onClose();
                        }}
                      >
                        {content}
                      </button>
                    </li>
                  );
                }

                return <li key={row.id}>{content}</li>;
              })}
            </ul>
          )}
        </div>

        <ListPagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          from={pagination.from}
          to={pagination.to}
          onPrevious={pagination.goPrev}
          onNext={pagination.goNext}
          itemLabel="items"
          className="shrink-0 rounded-none border-x-0 border-b-0"
        />

        {footerHref && (
          <div className="px-4 py-3 border-t border-slate-100 shrink-0 flex justify-end">
            <Link
              href={footerHref}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              {footerLabel}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
