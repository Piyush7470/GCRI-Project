"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Loader2, Search, Shield, Layers, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  notificationService,
  NotificationCategory,
  PlatformNotificationItem,
} from "@/services/notification.service";
import { useAuth } from "@/context/AuthContext";

const READ_STORAGE_KEY = "graice_read_notification_ids";

function readStorageKey(userId?: string | null) {
  return userId ? `${READ_STORAGE_KEY}:${userId}` : READ_STORAGE_KEY;
}

function loadReadIds(userId?: string | null): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(readStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>, userId?: string | null) {
  if (!userId) return;
  localStorage.setItem(readStorageKey(userId), JSON.stringify(Array.from(ids).slice(-500)));
}

function severityDot(severity: PlatformNotificationItem["severity"]) {
  if (severity === "critical") return "bg-rose-500";
  if (severity === "high") return "bg-amber-500";
  if (severity === "medium") return "bg-blue-500";
  return "bg-slate-400";
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell({ isAdmin }: { isAdmin: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?._id ?? null;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<NotificationCategory>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PlatformNotificationItem[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    security: 0,
    platform: 0,
    critical: 0,
    high: 0,
  });
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) {
      setReadIds(new Set());
      setBadgeItems([]);
      return;
    }
    setReadIds(loadReadIds(userId));
  }, [userId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(t);
  }, [search]);

  /** Unread badge uses this feed — loaded without opening the panel. */
  const [badgeItems, setBadgeItems] = useState<PlatformNotificationItem[]>([]);

  const fetchBadgeFeed = useCallback(async () => {
    try {
      const res = await notificationService.getNotifications({
        category: "all",
        limit: 50,
        hours: 24 * 7,
      });
      const payload = res?.data;
      if (payload?.items) setBadgeItems(payload.items);
      if (payload?.summary) setSummary(payload.summary);
    } catch {
      /* badge prefetch — keep prior count on transient errors */
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationService.getNotifications({
        category,
        search: debouncedSearch || undefined,
        limit: 50,
        hours: 24 * 7,
      });
      const payload = res?.data;
      if (payload) {
        setItems(payload.items || []);
        setSummary(payload.summary || { total: 0, security: 0, platform: 0, critical: 0, high: 0 });
        if (category === "all" && !debouncedSearch) {
          setBadgeItems(payload.items || []);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [category, debouncedSearch]);

  useEffect(() => {
    if (authLoading || !userId) return;
    void fetchBadgeFeed();
    const interval = setInterval(() => void fetchBadgeFeed(), 60_000);
    return () => clearInterval(interval);
  }, [fetchBadgeFeed, authLoading, userId]);

  useEffect(() => {
    if (!open) return;
    void fetchNotifications();
  }, [open, category, debouncedSearch, fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => void fetchNotifications(), 60_000);
    return () => clearInterval(interval);
  }, [open, fetchNotifications]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const unreadCount = useMemo(
    () => badgeItems.filter((n) => !readIds.has(n.id)).length,
    [badgeItems, readIds]
  );

  const markRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadIds(next, userId);
      return next;
    });
  };

  const markAllRead = () => {
    setReadIds((prev) => {
      const next = new Set(prev);
      badgeItems.forEach((n) => next.add(n.id));
      items.forEach((n) => next.add(n.id));
      saveReadIds(next, userId);
      return next;
    });
  };

  const filters: { id: NotificationCategory; label: string }[] = [
    { id: "all", label: "All" },
    { id: "security", label: "Security" },
    { id: "platform", label: "Platform" },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative p-2 rounded-full transition shrink-0",
          open
            ? "text-blue-700 bg-blue-50"
            : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
        )}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(100vw-1.5rem,22rem)] sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-in fade-in zoom-in-95">
          <div className="px-3.5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Notifications</p>
              <p className="text-[10px] text-slate-500">Last 7 days · audit-derived</p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex gap-1">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setCategory(f.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-bold transition",
                  category === f.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {f.label}
                {f.id === "security" && summary.security > 0 ? ` (${summary.security})` : ""}
                {f.id === "platform" && summary.platform > 0 ? ` (${summary.platform})` : ""}
              </button>
            ))}
          </div>

          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter notifications…"
                className="w-full pl-8 pr-8 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="py-10 flex justify-center text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : error ? (
              <div className="p-4 text-xs text-rose-700">{error}</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">No notifications for this filter.</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((n) => {
                  const unread = !readIds.has(n.id);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition",
                          unread && "bg-blue-50/40 dark:bg-blue-950/20"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", severityDot(n.severity))} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {n.category === "security" ? (
                                <Shield className="h-3 w-3 text-rose-600 shrink-0" />
                              ) : (
                                <Layers className="h-3 w-3 text-blue-600 shrink-0" />
                              )}
                              <p className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {n.title}
                              </p>
                              <span className="ml-auto text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                                {formatWhen(n.timestamp)}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
            <Link
              href={isAdmin ? "/admin/audit-logs" : "/assessments"}
              onClick={() => setOpen(false)}
              className="block text-center text-[11px] font-semibold text-blue-600 hover:text-blue-800"
            >
              {isAdmin ? "Open full audit trail →" : "Open assessments →"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}