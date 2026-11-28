import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/response.js";
import {
  searchAuditActions,
  searchAuditEntities,
  searchCompanyStatuses,
  searchCountries,
  searchIndustries,
  searchOrganizationsPicklist,
  searchPageSizes,
  searchScopedOrganizationsPicklist,
  searchSubscriptionTiers,
  searchTenantStatuses,
  searchTenantsPicklist,
  searchUserRoles,
  searchUsersPicklist,
  searchUserStatuses,
  searchVerificationStatuses,
  type PicklistOption,
} from "../services/referenceLookup.service.js";
import { normalizeUserRole } from "../middlewares/auth.js";

function parsePaging(req: Request) {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? "8"), 10) || 8;
  const limit = Math.min(20, Math.max(5, rawLimit));
  const search = typeof req.query.search === "string" ? req.query.search : "";
  return { page, limit, search };
}

function picklistResponse(res: Response, result: { items: PicklistOption[]; page: number; limit: number; total: number; totalPages: number }) {
  return sendSuccess(res, result.items, 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

function stringListResponse(
  res: Response,
  result: { items: string[]; page: number; limit: number; total: number; totalPages: number }
) {
  const options: PicklistOption[] = result.items.map((value) => ({ value, label: value }));
  return picklistResponse(res, { ...result, items: options });
}

export async function getReferenceIndustries(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    const result = await searchIndustries(search, page, limit);
    return stringListResponse(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getReferenceCountries(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    const result = searchCountries(search, page, limit);
    return stringListResponse(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getReferenceSubscriptionTiers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    return picklistResponse(res, searchSubscriptionTiers(search, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getReferenceCompanyStatuses(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    return picklistResponse(res, searchCompanyStatuses(search, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getReferenceVerificationStatuses(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    return picklistResponse(res, searchVerificationStatuses(search, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getReferenceTenantStatuses(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    return picklistResponse(res, searchTenantStatuses(search, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getReferenceUserStatuses(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    return picklistResponse(res, searchUserStatuses(search, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getReferencePageSizes(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    return picklistResponse(res, searchPageSizes(search, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getReferenceAuditEntities(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    return picklistResponse(res, searchAuditEntities(search, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getReferenceAuditActions(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    return picklistResponse(res, searchAuditActions(search, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getReferenceUserRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    const actorRole = normalizeUserRole(req.user?.role) || "Auditor";
    return picklistResponse(res, searchUserRoles(actorRole, search, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getReferenceOrganizations(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    const actorRole = normalizeUserRole(req.user?.role);
    const result =
      actorRole === "SuperAdmin"
        ? await searchScopedOrganizationsPicklist(req, search, page, limit)
        : await searchOrganizationsPicklist(req, search, page, limit);
    return picklistResponse(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getReferenceUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    const role =
      typeof req.query.role === "string" && req.query.role.trim() ? req.query.role.trim() : undefined;
    const result = await searchUsersPicklist(req, search, page, limit, role);
    return picklistResponse(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getReferenceTenants(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = parsePaging(req);
    const result = await searchTenantsPicklist(req, search, page, limit);
    return picklistResponse(res, result);
  } catch (err) {
    next(err);
  }
}