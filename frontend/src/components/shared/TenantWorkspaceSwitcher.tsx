"use client";

import React, { useEffect, useMemo } from "react";
import { AsyncSearchSelect } from "@/components/ui/AsyncSearchSelect";
import type { SearchSelectOption } from "@/components/ui/AsyncSearchSelect";
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
    refreshTenants,
  } = useTenant();

  useEffect(() => {
    if (!showTenantSwitcher || loading) return;
    if (memberships.length === 0) {
      void refreshTenants();
    }
  }, [showTenantSwitcher, memberships.length, loading, refreshTenants]);

  const tenantOptions: SearchSelectOption[] = useMemo(
    () => [
      ...(isSuperAdmin ? [{ value: "", label: "Platform" }] : []),
      ...memberships.map((m) => ({ value: m.tenant._id, label: m.tenant.name })),
    ],
    [isSuperAdmin, memberships]
  );

  if (!showTenantSwitcher) return null;

  return (
    <div
      className="hidden md:flex items-center gap-1.5 shrink-0 w-[11.5rem] sm:w-48 md:w-52 lg:w-56"
      title="Active tenant workspace"
    >
      <Layers className="h-4 w-4 text-teal-600 shrink-0" aria-hidden />
      <AsyncSearchSelect
        compact
        className="min-w-0 flex-1"
        value={activeTenantId ?? ""}
        onChange={(v) => setActiveTenantId(v || null)}
        disabled={loading}
        staticOptions={tenantOptions}
        placeholder="Select workspace…"
        searchPlaceholder="Search workspaces…"
        allowCustom={false}
        emptyValue=""
        pageSize={10}
        panelMinWidth={288}
      />
      {platformMode && isSuperAdmin && (
        <span className="hidden xl:inline text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800 shrink-0">
          Global
        </span>
      )}
    </div>
  );
}