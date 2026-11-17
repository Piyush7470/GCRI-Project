"use client";

import React from "react";
import { Layers } from "lucide-react";
import { useTenant } from "@/context/TenantContext";
import { useAuth } from "@/context/AuthContext";

export function TenantWorkspaceSwitcher() {
  const { isSuperAdmin } = useAuth();
  const {
    memberships,
    activeTenantId,
    setActiveTenantId,
    loading,
    showTenantSwitcher,
    platformMode,
  } = useTenant();

  if (!showTenantSwitcher) return null;

  return (
    <div
      className="hidden md:flex items-center gap-1.5 min-w-0 max-w-[9.5rem] sm:max-w-[11rem] lg:max-w-[13.5rem] xl:max-w-[16rem] shrink"
      title="Active tenant workspace"
    >
      <Layers className="h-4 w-4 text-teal-600 shrink-0" aria-hidden />
      <select
        value={activeTenantId ?? ""}
        onChange={(e) => setActiveTenantId(e.target.value || null)}
        disabled={loading}
        className="min-w-0 w-full text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 pl-2 pr-7 truncate focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        aria-label="Active tenant workspace"
      >
        {isSuperAdmin && <option value="">Platform</option>}
        {memberships.map((m) => (
          <option key={m.tenant._id} value={m.tenant._id}>
            {m.tenant.name}
          </option>
        ))}
      </select>
      {platformMode && isSuperAdmin && (
        <span className="hidden xl:inline text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800 shrink-0">
          Global
        </span>
      )}
    </div>
  );
}