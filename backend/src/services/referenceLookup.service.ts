import { Types } from "mongoose";
import type { Request } from "express";
import { Company } from "../models/Company.js";
import { User } from "../models/User.js";
import { Tenant } from "../models/Tenant.js";
import { COUNTRY_NAMES } from "../data/referenceCountries.js";
import { DEFAULT_INDUSTRIES } from "../data/referenceIndustries.js";
import {
  AUDIT_LOG_ACTIONS,
  AUDIT_LOG_ENTITIES,
  COMPANY_STATUSES,
  PAGE_SIZE_OPTIONS,
  SUBSCRIPTION_TIERS,
  TENANT_STATUSES,
  USER_ROLE_LABELS,
  USER_STATUSES,
  userRolesForActor,
  VERIFICATION_STATUSES,
} from "../data/referenceEnums.js";
import { scopeQueryByCompany } from "../middlewares/companyScope.js";
import { normalizeUserRole } from "../middlewares/auth.js";

export type PicklistOption = { value: string; label: string };

export type ReferencePageResult<T = string> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

function paginateNames(
  all: string[],
  search: string,
  page: number,
  limit: number
): ReferencePageResult {
  const term = search.trim().toLowerCase();
  const filtered = term
    ? all.filter((name) => name.toLowerCase().includes(term))
    : all;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  const items = filtered.slice(start, start + limit);
  return {
    items,
    page: safePage,
    limit,
    total,
    totalPages,
    hasMore: safePage < totalPages,
  };
}

let industriesCache: { at: number; list: string[] } | null = null;
const INDUSTRIES_TTL_MS = 60_000;

async function allIndustryNames(): Promise<string[]> {
  const now = Date.now();
  if (industriesCache && now - industriesCache.at < INDUSTRIES_TTL_MS) {
    return industriesCache.list;
  }
  const fromDb = await Company.distinct("industry", {
    industry: { $exists: true, $nin: [null, ""] },
  });
  const merged = Array.from(
    new Set([
      ...DEFAULT_INDUSTRIES,
      ...fromDb.map((s) => String(s).trim()).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b));
  industriesCache = { at: now, list: merged };
  return merged;
}

export async function searchIndustries(
  search: string,
  page: number,
  limit: number
): Promise<ReferencePageResult> {
  const all = await allIndustryNames();
  return paginateNames(all, search, page, limit);
}

export function searchCountries(
  search: string,
  page: number,
  limit: number
): ReferencePageResult {
  return paginateNames(COUNTRY_NAMES, search, page, limit);
}

function paginatePicklistOptions(
  all: PicklistOption[],
  search: string,
  page: number,
  limit: number
): ReferencePageResult<PicklistOption> {
  const term = search.trim().toLowerCase();
  const filtered = term
    ? all.filter(
        (o) =>
          o.label.toLowerCase().includes(term) ||
          o.value.toLowerCase().includes(term)
      )
    : all;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  const items = filtered.slice(start, start + limit);
  return {
    items,
    page: safePage,
    limit,
    total,
    totalPages,
    hasMore: safePage < totalPages,
  };
}

function staticPicklist(
  values: readonly string[],
  labelFn: (v: string) => string = (v) => v
): PicklistOption[] {
  return values.map((value) => ({ value, label: labelFn(value) }));
}

export function searchSubscriptionTiers(search: string, page: number, limit: number) {
  return paginatePicklistOptions(staticPicklist(SUBSCRIPTION_TIERS), search, page, limit);
}

export function searchCompanyStatuses(search: string, page: number, limit: number) {
  return paginatePicklistOptions(staticPicklist(COMPANY_STATUSES), search, page, limit);
}

export function searchVerificationStatuses(search: string, page: number, limit: number) {
  return paginatePicklistOptions(staticPicklist(VERIFICATION_STATUSES), search, page, limit);
}

export function searchTenantStatuses(search: string, page: number, limit: number) {
  return paginatePicklistOptions(staticPicklist(TENANT_STATUSES), search, page, limit);
}

export function searchUserStatuses(search: string, page: number, limit: number) {
  return paginatePicklistOptions(staticPicklist(USER_STATUSES), search, page, limit);
}

export function searchPageSizes(search: string, page: number, limit: number) {
  return paginatePicklistOptions(
    staticPicklist(PAGE_SIZE_OPTIONS, (v) => `${v} per page`),
    search,
    page,
    limit
  );
}

export function searchAuditEntities(search: string, page: number, limit: number) {
  return paginatePicklistOptions(staticPicklist(AUDIT_LOG_ENTITIES), search, page, limit);
}

export function searchAuditActions(search: string, page: number, limit: number) {
  return paginatePicklistOptions(staticPicklist(AUDIT_LOG_ACTIONS), search, page, limit);
}

export function searchUserRoles(actorRole: string, search: string, page: number, limit: number) {
  const roles = userRolesForActor(actorRole);
  const options = roles.map((value) => ({
    value,
    label: USER_ROLE_LABELS[value] || value,
  }));
  return paginatePicklistOptions(options, search, page, limit);
}

export async function searchOrganizationsPicklist(
  req: Request,
  search: string,
  page: number,
  limit: number
): Promise<ReferencePageResult<PicklistOption>> {
  const actorRole = normalizeUserRole(req.user?.role);
  if (actorRole === "SuperAdmin") {
    return paginatePicklistOptions([], search, page, limit);
  }

  const filter: Record<string, unknown> = {
    ...scopeQueryByCompany(req, { status: "Active" }, "_id"),
    status: "Active",
  };
  if (search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ name: regex }, { domain: regex }];
  }

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    Company.find(filter).select("name domain").sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Company.countDocuments(filter),
  ]);

  const items = rows.map((c) => ({
    value: String(c._id),
    label: `${c.name} · ${c.domain || "—"}`,
  }));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

export async function searchUsersPicklist(
  req: Request,
  search: string,
  page: number,
  limit: number,
  roleFilter?: string
): Promise<ReferencePageResult<PicklistOption>> {
  const filter: Record<string, unknown> = {};
  const actorRole = normalizeUserRole(req.user?.role);

  if (actorRole === "TenantAdmin") {
    if (req.user?.tenantId) {
      filter.tenantId = new Types.ObjectId(req.user.tenantId);
    } else if (req.user?.companyId) {
      filter.companyId = new Types.ObjectId(req.user.companyId);
    } else {
      return paginatePicklistOptions([], search, page, limit);
    }
  }

  if (roleFilter && roleFilter !== "all") {
    if (roleFilter === "Assessor" || roleFilter === "Auditor") {
      filter.role = { $in: ["Assessor", "Auditor"] };
    } else {
      filter.role = roleFilter;
    }
  }

  if (search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    User.find(filter).select("name email role").sort({ name: 1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  const items = rows.map((u) => ({
    value: String(u._id),
    label: `${u.name || u.email} · ${u.email}`,
  }));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

export async function searchTenantsPicklist(
  req: Request,
  search: string,
  page: number,
  limit: number
): Promise<ReferencePageResult<PicklistOption>> {
  if (normalizeUserRole(req.user?.role) !== "SuperAdmin") {
    return paginatePicklistOptions([], search, page, limit);
  }

  const filter: Record<string, unknown> = {};
  if (search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ name: regex }, { slug: regex }];
  }

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    Tenant.find(filter).select("name slug status").sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Tenant.countDocuments(filter),
  ]);

  const items = rows.map((t) => ({
    value: String(t._id),
    label: `${t.name} (${t.slug || "—"})`,
  }));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

/** Super Admin org picklist via dashboard-style tenant header scope. */
export async function searchScopedOrganizationsPicklist(
  req: Request,
  search: string,
  page: number,
  limit: number
): Promise<ReferencePageResult<PicklistOption>> {
  const actorRole = normalizeUserRole(req.user?.role);
  const filter: Record<string, unknown> = {};

  if (actorRole === "SuperAdmin") {
    const tenantHeader = req.headers["x-tenant-id"];
    if (tenantHeader && Types.ObjectId.isValid(String(tenantHeader))) {
      filter.tenantId = new Types.ObjectId(String(tenantHeader));
    }
  } else {
    Object.assign(filter, scopeQueryByCompany(req, { status: "Active" }, "_id"));
  }

  if (!filter.status) {
    filter.status = "Active";
  }

  if (search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ name: regex }, { domain: regex }, { industry: regex }];
  }

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    Company.find(filter).select("name domain status").sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Company.countDocuments(filter),
  ]);

  const items = rows.map((c) => ({
    value: String(c._id),
    label: `${c.name} · ${c.domain || "—"}`,
  }));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}