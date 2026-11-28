"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { tenantService } from "@/services/tenant.service";
import type { TenantRecord, TenantStatus } from "@/types/tenant.types";
import { getApiErrorMessage } from "@/lib/authUser";
import { fieldPlaceholder } from "@/lib/formPlaceholders";
import { AsyncSearchSelect } from "@/components/ui/AsyncSearchSelect";
import { tenantStatusFilterOptions } from "@/lib/searchSelectOptions";
import {
  FolderLock,
  Plus,
  RefreshCw,
  Search,
  AlertCircle,
  ChevronRight,
  X,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  Filter,
} from "lucide-react";
import { ListPagination } from "@/components/shared/ListPagination";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/listPagination";
import { SummaryMetricTile } from "@/components/shared/SummaryMetricTile";
import { TableBodySkeletonRows } from "@/components/shared/PageSkeletons";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

function statusPill(status: TenantStatus) {
  const map: Record<TenantStatus, string> = {
    Pending: "bg-amber-50 text-amber-800 border-amber-200",
    Active: "bg-emerald-50 text-emerald-800 border-emerald-200",
    Suspended: "bg-rose-50 text-rose-800 border-rose-200",
    Retired: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${map[status]}`}>
      {status}
    </span>
  );
}

export default function AdminTenantsPage() {
  const { isSuperAdmin } = useAuth();
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTenants, setTotalTenants] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    adminName: "",
    adminEmail: "",
  });
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToList = () => {
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await tenantService.listTenants({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
      });
      setTenants(Array.isArray(res.data) ? res.data : []);
      const p = res.pagination as {
        pages?: number;
        totalPages?: number;
        total?: number;
        page?: number;
      } | undefined;
      setTotalPages(p?.totalPages ?? p?.pages ?? 1);
      setTotalTenants(p?.total ?? 0);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Failed to load tenants.");
      setError(
        /failed to fetch|network|connection refused/i.test(msg)
          ? "Cannot reach the API. Start the backend (port 5090) and try again."
          : msg
      );
      if (debouncedSearch) {
        setTenants([]);
      }
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, page, limit, debouncedSearch, statusFilter]);

  useEffect(() => {
    if (!isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
    load();
  }, [isSuperAdmin, load, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setInviteToken(null);
    setCreating(true);
    try {
      const res = await tenantService.createTenant({
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        tenantAdmin:
          form.adminEmail.trim() && form.adminName.trim()
            ? { name: form.adminName.trim(), email: form.adminEmail.trim() }
            : undefined,
      });
      const token = res.data?.tenantAdmin?.invitationToken;
      if (token) setInviteToken(token);
      setModalOpen(false);
      setForm({ name: "", slug: "", adminName: "", adminEmail: "" });
      await load();
      if (res.data?.tenant?._id) {
        router.push(`/admin/tenants/${res.data.tenant._id}`);
      }
    } catch (err: unknown) {
      setCreateError(getApiErrorMessage(err, "Could not create tenant."));
    } finally {
      setCreating(false);
    }
  };

  const activeOnPage = useMemo(
    () => tenants.filter((t) => t.status === "Active").length,
    [tenants]
  );
  const pendingOnPage = useMemo(
    () => tenants.filter((t) => t.status === "Pending").length,
    [tenants]
  );
  const linkedOrgsOnPage = useMemo(
    () =>
      tenants.reduce((sum, t) => sum + (typeof t.metadata?.clientOrgCount === "number" ? t.metadata.clientOrgCount : 0), 0),
    [tenants]
  );

  const applyMetricTile = (preset: "all" | "active" | "pending" | "list") => {
    if (preset === "active") {
      setStatusFilter("Active");
      setPage(1);
    } else if (preset === "pending") {
      setStatusFilter("Pending");
      setPage(1);
    } else if (preset === "all") {
      setStatusFilter("");
      setPage(1);
    }
    scrollToList();
  };

  if (!isSuperAdmin) return null;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 space-y-3 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="page-title page-title-lg font-editorial">Tenant workspaces</h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Multi-Tenant Hub
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 max-w-2xl">
            Onboard isolated tenants, invite Tenant Admins, and link client organizations under each workspace.
          </p>
        </div>
      </div>

      {inviteToken && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 shrink-0">
          Tenant Admin invite token (share for accept-invite flow):{" "}
          <code className="font-mono font-bold break-all">{inviteToken}</code>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium shrink-0">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[11px] font-semibold px-2.5 py-1 bg-rose-100 hover:bg-rose-200 rounded-md transition"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <SummaryMetricTile
          tone="cyan"
          icon={Layers}
          value={<AnimatedNumber value={totalTenants} delay={0} />}
          label="Total Workspaces"
          subtext="All tenants · filter list below"
          onClick={() => applyMetricTile("all")}
        />
        <SummaryMetricTile
          tone="emerald"
          icon={CheckCircle2}
          value={<AnimatedNumber value={activeOnPage} delay={70} />}
          label="Active"
          subtext="Filter: Active status"
          onClick={() => applyMetricTile("active")}
        />
        <SummaryMetricTile
          tone="amber"
          icon={Clock}
          value={<AnimatedNumber value={pendingOnPage} delay={140} />}
          label="Pending"
          subtext="Filter: Pending activation"
          onClick={() => applyMetricTile("pending")}
        />
        <SummaryMetricTile
          tone="blue"
          icon={Building2}
          value={<AnimatedNumber value={linkedOrgsOnPage} delay={210} />}
          label="Linked Organizations"
          subtext="Client orgs on this page"
          onClick={() => applyMetricTile("list")}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 p-2.5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={fieldPlaceholder.searchTenants}
              aria-label="Search tenants by name or slug"
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200/90 rounded-lg bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 focus:bg-white"
            />
          </div>
          <div className="flex items-center text-[11px] text-slate-500 px-1">
            <Filter className="h-3 w-3 text-slate-400 mr-1" />
            <span>Status:</span>
          </div>
          <AsyncSearchSelect
            compact
            className="min-w-[9rem]"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            staticOptions={tenantStatusFilterOptions}
            searchPlaceholder="Search status…"
            allowCustom={false}
            emptyValue=""
            pageSize={8}
          />
          {(statusFilter || search) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
                setStatusFilter("");
                setPage(1);
              }}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 transition"
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            <span className="font-bold text-slate-800">{totalTenants}</span> workspaces
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="Refresh workspaces"
            className="p-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-teal-600" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#0c162c] hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            Create tenant
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden scroll-mt-4"
      >
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50/90 sticky top-0 z-10 border-b border-slate-200/80 backdrop-blur-xs">
              <tr className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Tenant workspace</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 hidden md:table-cell">Organizations</th>
                <th className="py-2.5 px-3 hidden md:table-cell">Assessments</th>
                <th className="py-2.5 px-3 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && tenants.length === 0 ? (
                <TableBodySkeletonRows rows={6} cols={6} />
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <FolderLock className="h-5 w-5" />
                      </div>
                      <p className="font-medium text-slate-600 text-sm">No tenant workspaces found</p>
                      <p className="text-[11px] text-slate-400">
                        {search || statusFilter
                          ? "Try adjusting search or status filters."
                          : "Create your first workspace to invite a Tenant Admin."}
                      </p>
                      {!search && !statusFilter && (
                        <button
                          type="button"
                          onClick={() => setModalOpen(true)}
                          className="mt-2 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                        >
                          Create tenant
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                tenants.map((t, idx) => {
                  const initial = t.name?.charAt(0)?.toUpperCase() || "T";
                  return (
                    <tr key={t._id} className="hover:bg-slate-50/75 transition-colors group">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {(page - 1) * limit + idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-teal-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{t.name}</div>
                            <div className="text-[11px] font-mono text-slate-500 truncate">{t.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">{statusPill(t.status)}</td>
                      <td className="py-2.5 px-3 hidden md:table-cell tabular-nums text-slate-700 font-medium">
                        {t.metadata?.clientOrgCount ?? "—"}
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell tabular-nums text-slate-700 font-medium">
                        {t.metadata?.assessmentCount ?? "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          href={`/admin/tenants/${t._id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-teal-700 border border-teal-200/80 bg-teal-50/50 hover:bg-teal-50 group-hover:border-teal-300 transition"
                        >
                          Open
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <ListPagination
          className="shrink-0 border-t border-slate-100"
          page={page}
          totalPages={Math.max(1, totalPages)}
          total={totalTenants}
          from={totalTenants > 0 ? (page - 1) * limit + 1 : 0}
          to={Math.min(page * limit, totalTenants)}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={loading}
          itemLabel="workspaces"
          pageSize={limit}
          onPageSizeChange={(size) => {
            setLimit(size);
            setPage(1);
          }}
          hideWhenEmpty={false}
        />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
          <div className="bg-white rounded-2xl shadow-2xl border max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-slate-900">Create tenant workspace</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            {createError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                {createError}
              </p>
            )}
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tenant name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={fieldPlaceholder.tenantName}
                  className="w-full text-sm border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Slug</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder={fieldPlaceholder.slugOptional}
                  className="w-full text-sm border rounded-lg px-3 py-2 font-mono"
                />
              </div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">First tenant admin (optional)</p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Admin name</label>
                <input
                  value={form.adminName}
                  onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                  placeholder={fieldPlaceholder.name}
                  className="w-full text-sm border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Admin email ID</label>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  placeholder={fieldPlaceholder.email}
                  className="w-full text-sm border rounded-lg px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-xs border rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}