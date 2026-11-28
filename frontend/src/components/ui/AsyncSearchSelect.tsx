"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

export type SearchSelectOption = { value: string; label: string };

export type AsyncSearchSelectLoader = (params: {
  search: string;
  page: number;
  limit: number;
}) => Promise<{ items: SearchSelectOption[]; hasMore: boolean }>;

type AsyncSearchSelectProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  loadOptions?: AsyncSearchSelectLoader;
  staticOptions?: SearchSelectOption[];
  allowCustom?: boolean;
  disabled?: boolean;
  pageSize?: number;
  className?: string;
  compact?: boolean;
  emptyValue?: string;
  /** Dropdown panel is at least this wide (portal); useful for compact header triggers. */
  panelMinWidth?: number;
};

const DEFAULT_PAGE_SIZE = 8;
const PANEL_Z_INDEX = 10000;
const PANEL_SEARCH_HEADER_PX = 52;

function paginateStatic(
  options: SearchSelectOption[],
  search: string,
  page: number,
  limit: number
) {
  const term = search.trim().toLowerCase();
  const filtered = term
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term)
      )
    : options;
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  return {
    items: filtered.slice(start, start + limit),
    hasMore: safePage < totalPages,
    page: safePage,
  };
}

export function AsyncSearchSelect({
  id: idProp,
  label,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  loadOptions,
  staticOptions,
  allowCustom = false,
  disabled,
  pageSize = DEFAULT_PAGE_SIZE,
  className = "",
  compact = false,
  emptyValue = "",
  panelMinWidth,
}: AsyncSearchSelectProps) {
  const autoId = useId();
  const controlId = idProp ?? autoId;
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const labelMapRef = useRef<Map<string, string>>(new Map());

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<SearchSelectOption[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const updatePanelPosition = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const preferredMax = 272;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(
      preferredMax,
      Math.max(120, openBelow ? spaceBelow - 4 : spaceAbove - 4)
    );
    const top = openBelow ? rect.bottom + 4 : Math.max(margin, rect.top - maxHeight - 4);
    const width = Math.max(rect.width, panelMinWidth ?? 0);
    let left = rect.left;
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - width);
    }
    setPanelPos({
      top,
      left,
      width,
      maxHeight,
    });
  }, [panelMinWidth]);

  useEffect(() => {
    staticOptions?.forEach((o) => labelMapRef.current.set(o.value, o.label));
  }, [staticOptions]);

  const resolvedLabel = useMemo(() => {
    if (!value || value === emptyValue) return "";
    return (
      labelMapRef.current.get(value) ||
      staticOptions?.find((o) => o.value === value)?.label ||
      items.find((o) => o.value === value)?.label ||
      value
    );
  }, [value, emptyValue, staticOptions, items]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (nextPage: number, append: boolean, term: string) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setLoadError(null);
      try {
        if (staticOptions) {
          const result = paginateStatic(staticOptions, term, nextPage, pageSize);
          setItems((prev) => (append ? [...prev, ...result.items] : result.items));
          result.items.forEach((o) => labelMapRef.current.set(o.value, o.label));
          setHasMore(result.hasMore);
          setPage(result.page);
        } else if (loadOptions) {
          const res = await loadOptions({ search: term, page: nextPage, limit: pageSize });
          setItems((prev) => (append ? [...prev, ...res.items] : res.items));
          res.items.forEach((o) => labelMapRef.current.set(o.value, o.label));
          setHasMore(res.hasMore);
          setPage(nextPage);
        }
      } catch {
        setLoadError("Could not load options.");
        if (!append) setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [loadOptions, staticOptions, pageSize]
  );

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setPage(1);
    setHasMore(false);
    void fetchPage(1, false, debouncedSearch);
  }, [open, debouncedSearch, fetchPage]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition, items.length, loading]);

  useEffect(() => {
    if (!open) return;
    function onDocMouse(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouse);
    const t = setTimeout(() => searchRef.current?.focus(), 40);
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      clearTimeout(t);
    };
  }, [open]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el || loading || loadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
      void fetchPage(page + 1, true, debouncedSearch);
    }
  };

  const customTerm = search.trim();
  const showCustom =
    allowCustom &&
    customTerm.length > 0 &&
    !items.some(
      (i) =>
        i.value.toLowerCase() === customTerm.toLowerCase() ||
        i.label.toLowerCase() === customTerm.toLowerCase()
    );

  const displayValue = resolvedLabel || placeholder;
  const triggerCls = compact
    ? "text-xs font-medium py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg"
    : "text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label ? (
        <label htmlFor={controlId} className="block text-xs font-semibold text-slate-700 mb-1">
          {label}
        </label>
      ) : null}
      <button
        id={controlId}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 text-left focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50 ${triggerCls}`}
      >
        <span
          className={
            resolvedLabel && value !== emptyValue ? "text-slate-900 truncate" : "text-slate-400 truncate"
          }
        >
          {displayValue}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        panelPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{
              position: "fixed",
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              maxHeight: panelPos.maxHeight,
              zIndex: PANEL_Z_INDEX,
            }}
            className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col"
          >
            <div className="p-2 border-b border-slate-100 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div
              ref={listRef}
              onScroll={handleScroll}
              className="flex-1 min-h-0 overflow-y-auto py-1 [scrollbar-width:thin]"
              style={{ maxHeight: Math.max(80, panelPos.maxHeight - PANEL_SEARCH_HEADER_PX) }}
            >
              {showCustom && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(customTerm);
                    labelMapRef.current.set(customTerm, customTerm);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-teal-800 hover:bg-teal-50 border-b border-slate-50"
                >
                  Use &ldquo;{customTerm}&rdquo;
                </button>
              )}
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : loadError ? (
                <p className="px-3 py-4 text-xs text-rose-600">{loadError}</p>
              ) : items.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-500">No matches.</p>
              ) : (
                items.map((item, idx) => {
                  const selected = value === item.value;
                  return (
                    <button
                      key={`${idx}-${item.value}`}
                      type="button"
                      onClick={() => {
                        onChange(item.value);
                        labelMapRef.current.set(item.value, item.label);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left hover:bg-slate-50 ${
                        selected ? "bg-teal-50/80 text-teal-900 font-medium" : "text-slate-800"
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                      {selected ? <Check className="h-3.5 w-3.5 text-teal-600 shrink-0" /> : null}
                    </button>
                  );
                })
              )}
              {loadingMore && (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}