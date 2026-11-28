"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { UsersTableSkeleton } from "@/components/shared/PageSkeletons";
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  MoreVertical,
  Edit3,
  Key,
  Building2,
  Phone,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  X,
  UserCheck,
  Lock,
} from "lucide-react";
import {
  userService,
  InviteUserResponse,
  AdminResetPasswordResponse,
} from "@/services/user.service";
import { User, UserRole, UserStatus } from "@/types/auth.types";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { EntityImage } from "@/components/shared/EntityImage";
import { SummaryMetricTile } from "@/components/shared/SummaryMetricTile";
import { fieldPlaceholder } from "@/lib/formPlaceholders";
import { getAppOrigin } from "@/lib/appUrl";
import { formatDurationFromMinutes, formatDurationUntil } from "@/lib/utils";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { isPasswordAcceptable } from "@/lib/passwordStrength";
import { AsyncSearchSelect } from "@/components/ui/AsyncSearchSelect";
import {
  loadOrganizationPicklist,
  loadPageSizeOptions,
  loadUserRoleOptions,
  loadUserStatusOptions,
} from "@/lib/searchSelectLoaders";
import {
  noneOrganizationOption,
  noneUserScopeOption,
  userRoleFilterOptions,
  userStatusFilterOptions,
} from "@/lib/searchSelectOptions";
import { UserFilterSearch } from "@/components/features/users/UserFilterSearch";

export default function AdminAssessorsPage() {
  const { isSuperAdmin, isOrgAdmin, isTenantAdmin, user: currentUser } = useAuth();

  const loadOrgInviteOptions = useCallback(
    async (params: { search: string; page: number; limit: number }) => {
      const res = await loadOrganizationPicklist(params);
      if (params.page === 1 && !params.search.trim()) {
        return { items: [noneUserScopeOption, ...res.items], hasMore: res.hasMore };
      }
      return res;
    },
    []
  );

  const loadOrgDirectOptions = useCallback(
    async (params: { search: string; page: number; limit: number }) => {
      const res = await loadOrganizationPicklist(params);
      if (params.page === 1 && !params.search.trim()) {
        return { items: [noneOrganizationOption, ...res.items], hasMore: res.hasMore };
      }
      return res;
    },
    []
  );
  const { activeTenantId } = useTenant();
  // Live State
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [paginationMeta, setPaginationMeta] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal 1: 48h Invitation Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<InviteUserResponse | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: "",
    email: "",
    role: "Assessor" as UserRole,
    companyId: "",
  });

  // Modal 2: Direct Add User (with initial credentials)
  const [directAddModalOpen, setDirectAddModalOpen] = useState(false);
  const [directAddLoading, setDirectAddLoading] = useState(false);
  const [directAddError, setDirectAddError] = useState<string | null>(null);
  const [directAddForm, setDirectAddForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Assessor" as UserRole,
    companyId: "",
  });

  // Modal 3: Edit User Profile
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    role: "Assessor" as UserRole,
    status: "Active" as UserStatus,
    companyId: "",
  });

  // Modal 4: Password Reset Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<AdminResetPasswordResponse | null>(null);
  const [copiedReset, setCopiedReset] = useState(false);

  // Active Dropdown Action Row
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  const scrollToList = () => {
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyMetricTile = (preset: "all" | "active" | "assessors" | "admins") => {
    setPage(1);
    setSearch("");
    switch (preset) {
      case "active":
        setRoleFilter("all");
        setStatusFilter("Active");
        break;
      case "assessors":
        setRoleFilter("Assessor");
        setStatusFilter("all");
        break;
      case "admins":
        setRoleFilter("TenantAdmin");
        setStatusFilter("all");
        break;
      default:
        setRoleFilter("all");
        setStatusFilter("all");
        break;
    }
    scrollToList();
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Users Live from Backend
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: {
        page: number;
        limit: number;
        search?: string;
        role?: string;
        status?: string;
      } = {
        page,
        limit,
      };

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (roleFilter !== "all") {
        params.role = roleFilter;
      }
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      const res = await userService.getUsers(params);
      if (res && res.data) {
        setUsers(res.data);
        if (res.pagination) {
          const p = res.pagination as any;
          setPaginationMeta({
            page: p.page || page,
            limit: p.limit || limit,
            total: p.total || 0,
            totalPages:
              p.totalPages ||
              p.pages ||
              Math.max(1, Math.ceil((p.total || 0) / (p.limit || limit))),
          });
        } else {
          setPaginationMeta({
            page,
            limit,
            total: res.data.length,
            totalPages: Math.max(1, Math.ceil(res.data.length / limit)),
          });
        }
      }
    } catch (err: any) {
      console.error("Failed to fetch users from backend:", err);
      setError(
        err?.message ||
          "Unable to load users from the server. Please check your credentials or backend connection."
      );
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Close open dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".action-menu-container")) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  // Handle Status Toggle
  const handleToggleStatus = async (user: User) => {
    setActiveMenuId(null);
    const newStatus: UserStatus = user.status === "Active" ? "Deactivated" : "Active";
    try {
      await userService.updateUserStatus(user._id, newStatus);
      setActionSuccess(`User ${user.email} marked as ${newStatus}`);
      setTimeout(() => setActionSuccess(null), 4000);
      fetchUsers();
    } catch (err: any) {
      setError(err?.message || `Failed to update status for ${user.email}`);
      setTimeout(() => setError(null), 5000);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (user: User) => {
    setActiveMenuId(null);
    setEditingUser(user);
    const companyIdStr =
      typeof user.companyId === "string"
        ? user.companyId
        : user.companyId?._id || "";

    setEditForm({
      name: user.name || "",
      phone: user.phone || "",
      role: user.role || "Assessor",
      status: user.status || "Active",
      companyId: companyIdStr,
    });
    setEditError(null);
    setEditModalOpen(true);
  };

  // Submit Edit Form
  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditLoading(true);
    setEditError(null);

    try {
      await userService.adminUpdateUser(editingUser._id, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || undefined,
        // Sole Super Admin cannot be reassigned or created via this form
        ...(editingUser.role === "SuperAdmin" || editForm.role === "SuperAdmin"
          ? {}
          : { role: editForm.role }),
        status: editForm.status,
        companyId: editForm.companyId ? editForm.companyId : null,
      });

      setEditModalOpen(false);
      setActionSuccess(`User ${editingUser.email} updated successfully!`);
      setTimeout(() => setActionSuccess(null), 4000);
      fetchUsers();
    } catch (err: any) {
      console.error("Edit user error:", err);
      setEditError(err?.message || "Failed to update user details.");
    } finally {
      setEditLoading(false);
    }
  };

  // Direct Add User
  const handleSubmitDirectAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setDirectAddLoading(true);
    setDirectAddError(null);

    if (!isPasswordAcceptable(directAddForm.password)) {
      setDirectAddError(
        "Password must be at least 8 characters with mixed character types (not weak)."
      );
      setDirectAddLoading(false);
      return;
    }

    if (
      isSuperAdmin &&
      directAddForm.role === "TenantAdmin" &&
      !activeTenantId
    ) {
      setDirectAddError(
        "Select a tenant in the header workspace switcher before creating a Tenant Admin."
      );
      setDirectAddLoading(false);
      return;
    }

    try {
      await userService.registerDirectUser({
        name: directAddForm.name.trim(),
        email: directAddForm.email.trim(),
        password: directAddForm.password,
        role: directAddForm.role,
        companyId: directAddForm.companyId || undefined,
        tenantId:
          directAddForm.role === "TenantAdmin" && activeTenantId
            ? activeTenantId
            : (isTenantAdmin || isOrgAdmin) && activeTenantId
              ? activeTenantId
              : undefined,
      });

      setDirectAddModalOpen(false);
      setActionSuccess(`Account created successfully for ${directAddForm.email}!`);
      setTimeout(() => setActionSuccess(null), 4000);
      fetchUsers();
    } catch (err: any) {
      console.error("Direct add user error:", err);
      setDirectAddError(err?.message || "Failed to register user. Email may already exist.");
    } finally {
      setDirectAddLoading(false);
    }
  };

  // Open Reset Password Modal
  const handleOpenReset = (user: User) => {
    setActiveMenuId(null);
    setResetTargetUser(user);
    setResetResult(null);
    setResetError(null);
    setCopiedReset(false);
    setResetModalOpen(true);
  };

  // Submit Password Reset Request
  const handleExecuteResetPassword = async () => {
    if (!resetTargetUser) return;
    setResetLoading(true);
    setResetError(null);

    try {
      const res = await userService.adminResetPassword(resetTargetUser._id);
      if (res && res.data) {
        setResetResult(res.data);
      }
    } catch (err: any) {
      console.error("Password reset error:", err);
      setResetError(err?.message || "Failed to generate password reset token.");
    } finally {
      setResetLoading(false);
    }
  };

  // Submit Invite Form
  const handleSubmitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError(null);

    try {
      const apiRole =
        inviteForm.role === "Assessor" ? "Auditor" : inviteForm.role;
      const res = await userService.inviteUser({
        name: inviteForm.name.trim(),
        email: inviteForm.email.trim(),
        role: apiRole as UserRole,
        companyId: inviteForm.companyId ? inviteForm.companyId : undefined,
        tenantId:
          apiRole === "TenantAdmin" && activeTenantId
            ? activeTenantId
            : (isTenantAdmin || isOrgAdmin) && activeTenantId
              ? activeTenantId
              : undefined,
      });

      if (res && res.data) {
        setInviteResult(res.data);
        setActionSuccess(`Invitation generated for ${inviteForm.email}`);
        setTimeout(() => setActionSuccess(null), 4000);
        fetchUsers();
      }
    } catch (err: any) {
      console.error("Invite user error:", err);
      setInviteError(
        err?.message ||
          "Failed to send user invitation. Please ensure the email is unique."
      );
    } finally {
      setInviteLoading(false);
    }
  };

  // Helper for Role Badges
  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "SuperAdmin":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-50/80 text-rose-700 border border-rose-200/80 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Super Admin
          </span>
        );
      case "Admin":
      case "TenantAdmin":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-purple-50/80 text-purple-700 border border-purple-200/80 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            Tenant Admin
          </span>
        );
      case "Assessor":
      case "Auditor":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50/80 text-blue-700 border border-blue-200/80 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Assessor
          </span>
        );
      case "MembershipApprover":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50/80 text-blue-700 border border-blue-200/80 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Assessor
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {role}
          </span>
        );
    }
  };

  // Helper for Status Badges
  const getStatusBadge = (status?: UserStatus) => {
    const isActive = status === "Active";
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
          isActive
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-slate-100 text-slate-600 border-slate-200"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
          }`}
        />
        {isActive ? "Active" : "Deactivated"}
      </span>
    );
  };

  // Helper for Initials
  const getInitials = (name?: string, email?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return "US";
  };

  // Compact metrics calculated from real data
  const totalCount = paginationMeta.total;
  const activeCount = users.filter((u) => u.status === "Active").length;
  const adminCount = users.filter(
    (u) => u.role === "Admin" || u.role === "TenantAdmin" || u.role === "SuperAdmin"
  ).length;
  const assessorCount = users.filter(
    (u) => u.role === "Assessor" || u.role === "Auditor"
  ).length;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 space-y-3 overflow-hidden">
      {/* Global Alerts */}
      {actionSuccess && (
        <div className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium shrink-0 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium shrink-0">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchUsers()}
            className="text-[11px] font-semibold px-2.5 py-1 bg-rose-100 hover:bg-rose-200 rounded-md transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Compact 4-Card Metric Grid (click → list popup) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <SummaryMetricTile
          tone="cyan"
          icon={Users}
          value={totalCount}
          label="Total Users"
          subtext="▲ Live in DB · Filter list below"
          onClick={() => applyMetricTile("all")}
        />
        <SummaryMetricTile
          tone="emerald"
          icon={CheckCircle2}
          value={activeCount}
          label="Active Users"
          subtext="Filter: Active status"
          onClick={() => applyMetricTile("active")}
        />
        <SummaryMetricTile
          tone="teal"
          icon={UserCheck}
          value={assessorCount}
          label="Assessors"
          subtext="Filter: Assessor role"
          onClick={() => applyMetricTile("assessors")}
        />
        <SummaryMetricTile
          tone="blue"
          icon={Shield}
          value={adminCount}
          label="Admins"
          subtext="Filter: Tenant Admin role"
          onClick={() => applyMetricTile("admins")}
        />
      </div>

      {/* Filter & Action Toolbar (Fixed) */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-2.5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 shrink-0">
        {/* Left: Search & Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          {/* Search Input */}
          <UserFilterSearch
            className="flex-1 min-w-[180px] max-w-xs"
            value={search}
            onChange={setSearch}
            role={roleFilter !== "all" ? roleFilter : undefined}
          />

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <div className="flex items-center text-[11px] text-slate-500 px-1">
              <Filter className="h-3 w-3 text-slate-400" />
            </div>

            <AsyncSearchSelect
              compact
              className="min-w-[7.5rem]"
              value={roleFilter}
              onChange={(v) => {
                setRoleFilter(v);
                setPage(1);
              }}
              staticOptions={userRoleFilterOptions(isSuperAdmin)}
              searchPlaceholder="Search roles…"
              allowCustom={false}
              pageSize={8}
            />

            <AsyncSearchSelect
              compact
              className="min-w-[7.5rem]"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              staticOptions={userStatusFilterOptions}
              searchPlaceholder="Search status…"
              allowCustom={false}
              pageSize={8}
            />

            {(roleFilter !== "all" || statusFilter !== "all" || search) && (
              <button
                onClick={() => {
                  setSearch("");
                  setRoleFilter("all");
                  setStatusFilter("all");
                  setPage(1);
                }}
                className="text-[11px] text-teal-600 hover:text-teal-800 font-semibold hover:underline px-1 py-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Right: Actions Lockup */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          <button
            onClick={() => fetchUsers()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg transition shadow-2xs disabled:opacity-50"
            title="Refresh Users"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => {
              setInviteForm({
                name: "",
                email: "",
                role: "Assessor",
                companyId: "",
              });
              setInviteResult(null);
              setInviteError(null);
              setCopiedInvite(false);
              setInviteModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-teal-600/90 bg-white hover:bg-teal-50/70 text-teal-700 font-semibold text-xs rounded-lg shadow-2xs transition"
          >
            <Mail className="h-3.5 w-3.5 text-teal-600" />
            <span>Send 48h Invite</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => {
                setDirectAddForm({
                  name: "",
                  email: "",
                  password: "",
                  role: "Assessor",
                  companyId: "",
                });
                setDirectAddError(null);
                setDirectAddModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Add Assessor</span>
            </button>
          )}
        </div>
      </div>

      {/* Users Data Table - Fixed Header & Scrollable Body */}
      <div
        ref={listRef}
        className="bg-white rounded-xl border border-slate-200/90 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden scroll-mt-4"
      >
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 [scrollbar-width:thin]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-xs border-b border-slate-200">
              <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-3 w-12 text-center bg-slate-50">S.N.</th>
                <th className="py-2.5 px-3.5 bg-slate-50">User</th>
                <th className="py-2.5 px-3 bg-slate-50">Role</th>
                <th className="py-2.5 px-3 bg-slate-50">Organization</th>
                <th className="py-2.5 px-3 bg-slate-50">Status</th>
                <th className="py-2.5 px-3 bg-slate-50">MFA</th>
                <th className="py-2.5 px-3 bg-slate-50">Created</th>
                <th className="py-2.5 px-3 text-right bg-slate-50">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <UsersTableSkeleton rows={6} />
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <div className="max-w-xs mx-auto flex flex-col items-center justify-center text-slate-400">
                      <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                        <Users className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">No users found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {debouncedSearch || roleFilter !== "all" || statusFilter !== "all"
                          ? "No user accounts match your search filters."
                          : "No users registered in this system yet."}
                      </p>
                      {(debouncedSearch || roleFilter !== "all" || statusFilter !== "all") && (
                        <button
                          onClick={() => {
                            setSearch("");
                            setRoleFilter("all");
                            setStatusFilter("all");
                          }}
                          className="mt-3 px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((u, index) => {
                  const companyObj =
                    typeof u.companyId === "object" && u.companyId !== null
                      ? u.companyId
                      : null;
                  const companyName = companyObj?.name || "Unassigned";

                  const formattedDate = u.createdAt
                    ? new Date(u.createdAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—";

                  const hasMfa = u.mfa?.enabled || u.mfaEnabled;
                  const serialNumber = (page - 1) * limit + index + 1;

                  return (
                    <tr
                      key={u._id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* S.N. Column */}
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400 font-medium">
                        {serialNumber}
                      </td>

                      {/* User Column */}
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <EntityImage
                            src={u.avatar?.url}
                            name={u.name || u.email}
                            variant="avatar"
                            size="sm"
                            cacheKey={u.updatedAt || u.avatar?.publicId}
                          />
                          <div>
                            <div className="font-semibold text-slate-900 group-hover:text-teal-700 transition-colors leading-tight">
                              {u.name || "Unnamed User"}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono leading-tight">
                              {u.email}
                            </div>
                            {u.phone && (
                              <div className="text-[10px] text-slate-400 font-sans flex items-center gap-1 mt-0.5 leading-tight">
                                <Phone className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                                <span>{u.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role Column */}
                      <td className="py-2.5 px-3">{getRoleBadge(u.role)}</td>

                      {/* Organization Column */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                          <span
                            className={
                              companyObj
                                ? "font-medium text-slate-700"
                                : "text-slate-400 italic text-[11px]"
                            }
                          >
                            {companyName}
                          </span>
                        </div>
                        {companyObj?.domain && (
                          <span className="text-[10px] text-slate-400 font-mono ml-4 block leading-tight">
                            {companyObj.domain}
                          </span>
                        )}
                      </td>

                      {/* Status Column */}
                      <td className="py-2.5 px-3">{getStatusBadge(u.status)}</td>

                      {/* MFA Column */}
                      <td className="py-2.5 px-3">
                        {hasMfa ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                            <ShieldCheck className="h-3 w-3 text-emerald-600" />
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <ShieldAlert className="h-3 w-3 text-slate-300" />
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Created Date */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium text-[11px]">
                          <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{formattedDate}</span>
                        </div>
                      </td>

                      {/* Actions Menu */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="relative inline-block text-left action-menu-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === u._id ? null : u._id);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>

                          {activeMenuId === u._id && (
                            <div className="origin-top-right absolute right-0 mt-1 w-44 rounded-xl shadow-lg bg-white border border-slate-200 z-30 py-1 focus:outline-none divide-y divide-slate-100 text-xs animate-in fade-in zoom-in-95">
                              <div className="py-0.5">
                                <button
                                  onClick={() => handleOpenEdit(u)}
                                  className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                                >
                                  <Edit3 className="h-3 w-3 text-slate-400" />
                                  Edit User
                                </button>
                                <button
                                  onClick={() => handleOpenReset(u)}
                                  className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                                >
                                  <Key className="h-3 w-3 text-slate-400" />
                                  Reset Password
                                </button>
                              </div>

                              <div className="py-0.5">
                                <button
                                  onClick={() => handleToggleStatus(u)}
                                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 font-medium ${
                                    u.status === "Active"
                                      ? "text-rose-600 hover:bg-rose-50"
                                      : "text-emerald-600 hover:bg-emerald-50"
                                  }`}
                                >
                                  {u.status === "Active" ? (
                                    <>
                                      <XCircle className="h-3 w-3 text-rose-500" />
                                      Deactivate
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                      Activate
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Live Pagination Footer (Fixed at Table Bottom) */}
        <div className="py-2.5 px-3.5 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              Showing{" "}
              <span className="font-semibold text-slate-900">
                {users.length > 0 ? (page - 1) * limit + 1 : 0}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-slate-900">
                {Math.min(page * limit, paginationMeta.total)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-900">{paginationMeta.total}</span> users
            </div>

            {/* Rows Per Page Selector (20, 50, 100) */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
              <span className="text-[11px] text-slate-500">Rows:</span>
              <AsyncSearchSelect
                compact
                className="w-28"
                value={String(limit)}
                onChange={(v) => {
                  setLimit(Number(v));
                  setPage(1);
                }}
                loadOptions={loadPageSizeOptions}
                searchPlaceholder="Rows per page…"
                allowCustom={false}
                pageSize={8}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition font-medium text-xs"
            >
              <ChevronLeft className="h-3 w-3" />
              Previous
            </button>

            <span className="px-2 font-semibold text-slate-700 text-xs">
              Page {paginationMeta.page} of {Math.max(1, paginationMeta.totalPages)}
            </span>

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= paginationMeta.totalPages || loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition font-medium text-xs"
            >
              Next
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODAL 1: SEND 48-HOUR INVITATION MODAL                         */}
      {/* ============================================================== */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Send 48h Invitation</h3>
                  <p className="text-[11px] text-slate-500">
                    Generates a cryptographic pre-registration invitation token.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              {inviteResult ? (
                <div className="space-y-3.5">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">{inviteResult.message}</p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Invited {inviteResult.user.name} ({inviteResult.user.email}) as{" "}
                        <span className="font-semibold">{inviteResult.user.role}</span>.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Invitation link
                      {inviteResult.user.invitationExpires
                        ? ` (valid for ${formatDurationUntil(inviteResult.user.invitationExpires)})`
                        : ` (valid for ${formatDurationFromMinutes(48 * 60)})`}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={`${getAppOrigin()}/accept-invite?token=${inviteResult.invitationToken}`}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const link = `${getAppOrigin()}/accept-invite?token=${inviteResult.invitationToken}`;
                          navigator.clipboard.writeText(link);
                          setCopiedInvite(true);
                          setTimeout(() => setCopiedInvite(false), 3000);
                        }}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 transition"
                      >
                        {copiedInvite ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => setInviteModalOpen(false)}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg transition"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitInvite} className="space-y-3.5">
                  {inviteError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                      <span>{inviteError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={inviteForm.name}
                      onChange={(e) =>
                        setInviteForm({ ...inviteForm, name: e.target.value })
                      }
                      placeholder={fieldPlaceholder.name}
                      className="w-full text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={inviteForm.email}
                      onChange={(e) =>
                        setInviteForm({ ...inviteForm, email: e.target.value })
                      }
                      placeholder={fieldPlaceholder.email}
                      className="w-full text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <AsyncSearchSelect
                      label="System role *"
                      value={inviteForm.role}
                      onChange={(role) =>
                        setInviteForm({
                          ...inviteForm,
                          role: role as UserRole,
                        })
                      }
                      loadOptions={loadUserRoleOptions}
                      searchPlaceholder="Search roles…"
                      allowCustom={false}
                      pageSize={8}
                    />

                    <AsyncSearchSelect
                      label="Organization"
                      value={inviteForm.companyId}
                      onChange={(companyId) => setInviteForm({ ...inviteForm, companyId })}
                      disabled={isTenantAdmin}
                      placeholder="None / tenant-scoped"
                      emptyValue=""
                      loadOptions={loadOrgInviteOptions}
                      searchPlaceholder="Search organizations…"
                      allowCustom={false}
                      pageSize={8}
                    />
                  </div>
                  {isSuperAdmin && inviteForm.role === "TenantAdmin" && !activeTenantId && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      Select a tenant in the header workspace switcher before inviting a Tenant Admin.
                    </p>
                  )}

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviteLoading}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5"
                    >
                      {inviteLoading ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="h-3 w-3" />
                          Generate Invite
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: DIRECT ADD USER MODAL                                 */}
      {/* ============================================================== */}
      {directAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Direct Add User</h3>
                  <p className="text-[11px] text-slate-500">
                    Creates an active account with initial credentials directly.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDirectAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitDirectAdd} className="p-5 space-y-3.5">
              {directAddError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  <span>{directAddError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={directAddForm.name}
                  onChange={(e) =>
                    setDirectAddForm({ ...directAddForm, name: e.target.value })
                  }
                  placeholder={fieldPlaceholder.name}
                  className="w-full text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={directAddForm.email}
                  onChange={(e) =>
                    setDirectAddForm({ ...directAddForm, email: e.target.value })
                  }
                  placeholder={fieldPlaceholder.email}
                  className="w-full text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              <PasswordInput
                label="Initial password * (min. 8 characters)"
                value={directAddForm.password}
                onChange={(password) => setDirectAddForm({ ...directAddForm, password })}
                required
                minLength={8}
                showStrength
                showRequirementsInfo
              />

              <div className="grid grid-cols-2 gap-3">
                <AsyncSearchSelect
                  label="Initial role *"
                  value={directAddForm.role}
                  onChange={(role) =>
                    setDirectAddForm({
                      ...directAddForm,
                      role: role as UserRole,
                    })
                  }
                  loadOptions={loadUserRoleOptions}
                  searchPlaceholder="Search roles…"
                  allowCustom={false}
                  pageSize={8}
                />

                <AsyncSearchSelect
                  label="Organization"
                  value={directAddForm.companyId}
                  onChange={(companyId) => setDirectAddForm({ ...directAddForm, companyId })}
                  placeholder="None / independent"
                  emptyValue=""
                  loadOptions={loadOrgDirectOptions}
                  searchPlaceholder="Search organizations…"
                  allowCustom={false}
                  pageSize={8}
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDirectAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={directAddLoading}
                  className="px-3.5 py-1.5 bg-[#0c162c] hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5"
                >
                  {directAddLoading ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3 w-3" />
                      Create User
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: EDIT USER DETAILS                                     */}
      {/* ============================================================== */}
      {editModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Edit3 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Edit User Profile</h3>
                  <p className="text-[11px] text-slate-500">{editingUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitEdit} className="p-5 space-y-3.5">
              {editError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              <PhoneInput
                label="Phone number"
                value={editForm.phone}
                onChange={(phone) => setEditForm({ ...editForm, phone })}
                placeholder="Enter number without country code"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      System Role *
                    </label>
                    {editingUser?.role === "SuperAdmin" ? (
                      <span className="text-[10px] text-amber-600 font-medium">
                        Sole platform role
                      </span>
                    ) : !isSuperAdmin ? (
                      <span className="text-[10px] text-amber-600 font-medium">
                        Super Admin only
                      </span>
                    ) : null}
                  </div>
                  <AsyncSearchSelect
                    value={editForm.role}
                    onChange={(role) => setEditForm({ ...editForm, role: role as UserRole })}
                    disabled={!isSuperAdmin || editingUser?.role === "SuperAdmin"}
                    loadOptions={loadUserRoleOptions}
                    searchPlaceholder="Search roles…"
                    allowCustom={false}
                    pageSize={8}
                  />
                </div>

                <AsyncSearchSelect
                  label="Status *"
                  value={editForm.status}
                  onChange={(status) => setEditForm({ ...editForm, status: status as UserStatus })}
                  loadOptions={loadUserStatusOptions}
                  searchPlaceholder="Search status…"
                  allowCustom={false}
                  pageSize={8}
                />
              </div>

              <AsyncSearchSelect
                label="Organization"
                value={editForm.companyId}
                onChange={(companyId) => setEditForm({ ...editForm, companyId })}
                placeholder="None / independent assessor"
                emptyValue=""
                loadOptions={loadOrgDirectOptions}
                searchPlaceholder="Search organizations…"
                allowCustom={false}
                pageSize={8}
              />

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: ADMIN PASSWORD RESET MODAL                            */}
      {/* ============================================================== */}
      {resetModalOpen && resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <Key className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Admin Password Reset</h3>
                  <p className="text-[11px] text-slate-500">{resetTargetUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setResetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              {resetResult ? (
                <div className="space-y-3.5">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">{resetResult.message}</p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Token generated for {resetResult.user.name} ({resetResult.user.email}).
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Password reset URL
                      {resetResult.expiresAt
                        ? ` (expires in ${formatDurationUntil(resetResult.expiresAt)})`
                        : ` (expires in ${formatDurationFromMinutes(24 * 60)})`}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={resetResult.resetUrl}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(resetResult.resetUrl);
                          setCopiedReset(true);
                          setTimeout(() => setCopiedReset(false), 3000);
                        }}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 transition"
                      >
                        {copiedReset ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => setResetModalOpen(false)}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {resetError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                      <span>{resetError}</span>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Generate a secure 24-hour cryptographic password reset URL for{" "}
                    <span className="font-semibold text-slate-900">
                      {resetTargetUser.name || resetTargetUser.email}
                    </span>
                    .
                  </p>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setResetModalOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteResetPassword}
                      disabled={resetLoading}
                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5"
                    >
                      {resetLoading ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Key className="h-3 w-3" />
                          Generate Reset Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
