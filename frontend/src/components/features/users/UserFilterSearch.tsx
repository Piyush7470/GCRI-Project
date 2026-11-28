"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { referenceHasMore, referenceService } from "@/services/reference.service";

type Suggestion = { name: string; email: string; label: string };

type UserFilterSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Narrow suggestion list (e.g. Assessor, Admin) */
  role?: string;
};

const SUGGEST_LIMIT = 8;
const DEBOUNCE_MS = 280;

function buildLabel(name: string, email: string) {
  if (name && email) return `${name} · ${email}`;
  return name || email;
}

export function UserFilterSearch({
  value,
  onChange,
  placeholder = "Search users by name or email...",
  className = "",
  role,
}: UserFilterSearchProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const fetchSuggestions = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await referenceService.searchUsers({
          search: trimmed,
          page: 1,
          limit: SUGGEST_LIMIT,
          ...(role && role !== "all" ? { role } : {}),
        });
        const rows = Array.isArray(res.data) ? res.data : [];
        setSuggestions(
          rows.map((row) => {
            if (typeof row === "string") {
              return { name: row, email: "", label: row };
            }
            const label = row.label || "";
            const [namePart = "", emailPart = ""] = label.split(" · ");
            const name = namePart || emailPart || String(row.value || "");
            const email = emailPart || "";
            return { name, email, label: label || buildLabel(name, email) };
          })
        );
        if (referenceHasMore(res) && rows.length === 0) {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [role]
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void fetchSuggestions(value);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, open, fetchSuggestions]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const pickSuggestion = (item: Suggestion) => {
    onChange(item.email || item.name);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const showPanel = open && (loading || suggestions.length > 0 || value.trim().length > 0);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          setOpen(true);
          if (value.trim()) void fetchSuggestions(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
            return;
          }
          if (!suggestions.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            pickSuggestion(suggestions[activeIndex]);
          }
        }}
        placeholder={placeholder}
        className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setSuggestions([]);
            setOpen(false);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}

      {showPanel ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto"
        >
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
              Searching…
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((item, index) => (
              <button
                key={`${item.email}-${item.name}-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full text-left px-3 py-2 text-xs transition ${
                  index === activeIndex
                    ? "bg-teal-50 text-teal-900"
                    : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                <span className="font-semibold text-slate-900">{item.name || item.email}</span>
                {item.email ? (
                  <span className="text-slate-400 ml-1.5">· {item.email}</span>
                ) : null}
              </button>
            ))
          ) : value.trim() ? (
            <p className="px-3 py-2.5 text-xs text-slate-400">
              No matching users — press Enter to filter by &ldquo;{value.trim()}&rdquo;
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}