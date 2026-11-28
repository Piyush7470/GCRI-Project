"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { auditLogService } from "@/services/auditLog.service";
import { DataTableSkeleton } from "@/components/shared/PageSkeletons";
import { ListPagination } from "@/components/shared/ListPagination";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/listPagination";
import { AuditLogEntry, AuditLogStats } from "@/types/auditLog.types";
import {
  History,
  Shield,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Activity,
  Ban,
  Layers,
  X,
} from "lucide-react";
import { SummaryMetricTile } from "@/components/shared/SummaryMetricTile";
import { cn } from "@/lib/utils";
import { AsyncSearchSelect } from "@/components/ui/AsyncSearchSelect";
import { loadAuditActionOptions, loadAuditEntityOptions } from "@/lib/searchSelectLoaders";

type TilePreset = "all24h" | "denials" | "all" | "topAction";


function iso24hAgo() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export default function AdminAuditLogsPage() {
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [paginationMeta, setPaginationMeta] = useState({
    page: 1,
    limit: DEFAULT_LIST_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tilePreset, setTilePreset] = useState<TilePreset | null>(null);

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const logsTableRef = useRef<HTMLDivElement>(null);

  const scrollToLogs = () => {
    logsTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fetchAuditData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logsRes, statsRes] = await Promise.all([
        auditLogService.getAuditLogs({
          entity: entityFilter || undefined,
          action: actionFilter || undefined,
          search: debouncedSearch || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          page,
          limit,
        }),
        auditLogService.getAuditLogStats(),
      ]);

      const logList = Array.isArray(logsRes?.data) ? logsRes.data : [];
      setLogs(logList);
      if (statsRes?.data) setStats(statsRes.data);

      const p = logsRes.pagination;
      if (p) {
        setPaginationMeta({
          page: p.page || page,
          limit: p.limit || limit,
          total: p.total ?? logList.length,
          totalPages: p.pages || Math.max(1, Math.ceil((p.total ?? logList.length) / limit)),
        });
      } else {
        setPaginationMeta({
          page,
          limit,
          total: logList.length,
          totalPages: 1,
        });
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [entityFilter, actionFilter, debouncedSearch, startDate, endDate, page, limit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    void fetchAuditData();
  }, [fetchAuditData]);

  const applyTilePreset = (preset: TilePreset) => {
    setPage(1);
    setTilePreset(preset);
    setSearchQuery("");

    switch (preset) {
      case "all24h":
        setEntityFilter("");
        setActionFilter("");
        setStartDate(iso24hAgo());
        setEndDate("");
        break;
      case "denials":
        setEntityFilter("");
        setActionFilter("AUTHORIZATION_DENIED");
        setStartDate(iso24hAgo());
        setEndDate("");
        break;
      case "all":
        setEntityFilter("");
        setActionFilter("");
        setStartDate("");
        setEndDate("");
        break;
      case "topAction": {
        const top = stats?.topActions?.[0]?.action;
        setEntityFilter("");
        setActionFilter(top || "");
        setStartDate(iso24hAgo());
        setEndDate("");
        break;
      }
    }
    scrollToLogs();
  };

  const clearTilePreset = () => {
    setTilePreset(null);
    setEntityFilter("");
    setActionFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const presetLabel =
    tilePreset === "all24h"
      ? "Events in the last 24 hours"
      : tilePreset === "denials"
        ? "Authorization denials in the last 24 hours"
        : tilePreset === "topAction"
          ? `Top action (24h): ${stats?.topActions?.[0]?.action || actionFilter || "—"}`
          : tilePreset === "all"
            ? "All recorded audit events"
            : null;

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 surface-panel text-center space-y-3">
        <Shield className="h-8 w-8 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500">Only Platform Administrators have access to the immutable security audit trail.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title font-editorial">Security Audit Trail Explorer</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Immutable Ledger
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Complete cryptographic audit trail for compliance verification, authentication events, and administrative actions.
          </p>
        </div>

        <button
          onClick={() => void fetchAuditData()}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Trail
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryMetricTile
            tone="slate"
            icon={Activity}
            value={stats.eventsLast24Hours}
            label="24h Event Velocity"
            subtext="Apply 24h filter below"
            onClick={() => applyTilePreset("all24h")}
            className={cn(tilePreset === "all24h" && "ring-2 ring-teal-500/50 border-teal-400")}
          />
          <SummaryMetricTile
            tone="rose"
            icon={Ban}
            value={stats.authorizationDenialsCount}
            label="Auth Denials (24h)"
            subtext="AUTHORIZATION_DENIED · 24h"
            onClick={() => applyTilePreset("denials")}
            className={cn(tilePreset === "denials" && "ring-2 ring-rose-500/50 border-rose-400")}
          />
          <SummaryMetricTile
            tone="blue"
            icon={History}
            value={stats.totalEvents}
            label="Total Recorded Logs"
            subtext="Show full trail"
            onClick={() => applyTilePreset("all")}
            className={cn(tilePreset === "all" && "ring-2 ring-blue-500/50 border-blue-400")}
          />
          <SummaryMetricTile
            tone="cyan"
            icon={Layers}
            value={stats.topActions?.[0]?.count ?? 0}
            label="Top Action (24h)"
            subtext={stats.topActions?.[0]?.action || "—"}
            onClick={() => applyTilePreset("topAction")}
            className={cn(tilePreset === "topAction" && "ring-2 ring-cyan-500/50 border-cyan-400")}
          />
        </div>
      )}

      {presetLabel && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-2.5 text-xs text-indigo-900">
          <span>
            <span className="font-bold">Tile filter:</span> {presetLabel}
            <span className="text-indigo-700 ml-2 tabular-nums">
              ({paginationMeta.total.toLocaleString()} matching events)
            </span>
          </span>
          <button
            type="button"
            onClick={clearTilePreset}
            className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900"
          >
            <X className="h-3.5 w-3.5" />
            Clear tile filter
          </button>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by actor email or entity ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setTilePreset(null);
            }}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
            <Filter className="h-3.5 w-3.5 text-slate-400" /> Entity:
          </div>
          <AsyncSearchSelect
            compact
            className="min-w-[9rem]"
            value={entityFilter}
            onChange={(v) => {
              setEntityFilter(v);
              setTilePreset(null);
              setPage(1);
            }}
            placeholder="All entities"
            emptyValue=""
            loadOptions={loadAuditEntityOptions}
            searchPlaceholder="Search entity…"
            allowCustom={false}
            pageSize={8}
          />

          <AsyncSearchSelect
            compact
            className="min-w-[9rem]"
            value={actionFilter}
            onChange={(v) => {
              setActionFilter(v);
              setTilePreset(null);
              setPage(1);
            }}
            placeholder="All actions"
            emptyValue=""
            loadOptions={loadAuditActionOptions}
            searchPlaceholder="Search action…"
            allowCustom={false}
            pageSize={8}
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {error}
        </div>
      )}

      <div
        ref={logsTableRef}
        className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden scroll-mt-4"
      >
        {loading ? (
          <div className="p-4">
            <DataTableSkeleton rows={8} columns={6} className="border-0 shadow-none" />
          </div>
        ) : paginationMeta.total > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] font-semibold text-slate-400 uppercase bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target Entity</th>
                    <th className="py-3 px-4">IP &amp; Client</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => {
                    const isExpanded = expandedLogId === log._id;
                    const actorEmail =
                      log.actorEmail ||
                      (typeof log.actorId === "object" ? log.actorId?.email : "") ||
                      "System";

                    let actionColor = "bg-slate-100 text-slate-700 border-slate-200";
                    if (log.action.includes("DENIED") || log.action.includes("FAILED")) {
                      actionColor = "bg-rose-50 text-rose-700 border-rose-200";
                    } else if (log.action.includes("SUCCESS") || log.action.includes("SUBMITTED")) {
                      actionColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    } else if (log.action.includes("CREATED") || log.action.includes("INVITED")) {
                      actionColor = "bg-blue-50 text-blue-700 border-blue-200";
                    }

                    return (
                      <React.Fragment key={log._id}>
                        <tr className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{actorEmail}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${actionColor}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                            {log.entity} {log.entityId ? `(#${log.entityId.slice(-6)})` : ""}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px] font-mono">
                            {log.ipAddress || "127.0.0.1"}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                            >
                              {isExpanded ? "Close" : "Inspect"}
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={6} className="p-4 text-xs space-y-2 border-b border-slate-200">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                                {log.before && (
                                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                                    <span className="font-bold text-slate-700 block mb-1">Before State:</span>
                                    <pre className="text-slate-600 overflow-x-auto">
                                      {JSON.stringify(log.before, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.after && (
                                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                                    <span className="font-bold text-slate-700 block mb-1">After State:</span>
                                    <pre className="text-slate-600 overflow-x-auto">
                                      {JSON.stringify(log.after, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                              {log.userAgent && (
                                <div className="text-[10px] text-slate-400">
                                  <strong>User Agent:</strong> {log.userAgent}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListPagination
              page={paginationMeta.page}
              totalPages={paginationMeta.totalPages}
              total={paginationMeta.total}
              from={
                paginationMeta.total === 0
                  ? 0
                  : (paginationMeta.page - 1) * paginationMeta.limit + 1
              }
              to={Math.min(paginationMeta.page * paginationMeta.limit, paginationMeta.total)}
              onPrevious={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(paginationMeta.totalPages, p + 1))}
              itemLabel="audit events"
              disabled={loading}
              pageSize={limit}
              onPageSizeChange={(size) => {
                setLimit(size);
                setPage(1);
              }}
            />
          </>
        ) : (
          <div className="p-12 text-center space-y-2">
            <History className="h-8 w-8 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900">No audit records found</h3>
            <p className="text-xs text-slate-500">No events matched the selected filter query.</p>
          </div>
        )}
      </div>
    </div>
  );
}