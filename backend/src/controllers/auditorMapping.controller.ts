import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { AuditorOrganization } from "../models/AuditorOrganization.js";
import { Company } from "../models/Company.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { sendSuccess, sendError } from "../utils/response.js";
import {
  getAssignedOrganizationIds,
  isAuditorAssignedToOrg,
} from "../middlewares/companyScope.js";
import { isAuditorRole, isTenantAdminRole } from "../middlewares/auth.js";

async function resolveTenantOrgIds(req: Request): Promise<Types.ObjectId[]> {
  if (!req.user?.userId) return [];
  return getAssignedOrganizationIds(req.user.userId, req.user.tenantId);
}

async function assertOrgInTenant(req: Request, organizationId: string): Promise<boolean> {
  if (!isTenantAdminRole(req.user?.role)) return false;
  const allowed = await resolveTenantOrgIds(req);
  return allowed.some((id) => id.toString() === organizationId.toString());
}

/**
 * Assign an Auditor to an Organization (Tenant Admin module)
 * POST /api/v1/admin/auditor-mappings
 */
export async function assignAuditor(req: Request, res: Response, next: NextFunction) {
  try {
    const { organizationId, auditorId } = req.body;
    const adminId = req.user?.userId;
    const adminEmail = req.user?.email || "unknown";

    const organization = await Company.findById(organizationId);
    if (!organization) {
      return sendError(res, "Organization not found", 404, "ORGANIZATION_NOT_FOUND");
    }

    if (!(await assertOrgInTenant(req, organizationId.toString()))) {
      return sendError(
        res,
        "Access denied. You can only assign auditors to organizations in your tenant.",
        403,
        "CROSS_TENANT_ACCESS_DENIED"
      );
    }

    const auditor = await User.findById(auditorId);
    if (!auditor) {
      return sendError(res, "Auditor user not found", 404, "AUDITOR_NOT_FOUND");
    }
    if (!isAuditorRole(auditor.role) && auditor.role !== "Assessor") {
      return sendError(
        res,
        `User ${auditor.email} does not have the Assessor/Auditor role.`,
        400,
        "INVALID_AUDITOR_ROLE"
      );
    }

    // Auditor must belong to the same tenant when tenanted
    if (req.user?.tenantId && auditor.tenantId) {
      if (auditor.tenantId.toString() !== req.user.tenantId.toString()) {
        return sendError(
          res,
          "Access denied. Auditor is outside your tenant workspace.",
          403,
          "CROSS_TENANT_ACCESS_DENIED"
        );
      }
    }

    let mapping = await AuditorOrganization.findOne({
      organizationId: new Types.ObjectId(organizationId),
      auditorId: new Types.ObjectId(auditorId),
    });

    if (mapping) {
      if (mapping.status === "Active") {
        return sendError(
          res,
          "Auditor is already actively mapped to this organization.",
          409,
          "AUDITOR_MAPPING_ALREADY_EXISTS"
        );
      }
      mapping.status = "Active";
      mapping.assignedBy = new Types.ObjectId(adminId);
      await mapping.save();
    } else {
      mapping = await AuditorOrganization.create({
        organizationId: new Types.ObjectId(organizationId),
        auditorId: new Types.ObjectId(auditorId),
        assignedBy: new Types.ObjectId(adminId),
        status: "Active",
      });
    }

    await AuditLog.create({
      actorId: adminId,
      actorEmail: adminEmail,
      action: "AUDITOR_ASSIGNED_TO_ORGANIZATION",
      entity: "AuditorOrganization",
      entityId: mapping._id.toString(),
      after: {
        organizationId,
        organizationName: organization.name,
        auditorId,
        auditorEmail: auditor.email,
        assignedBy: adminId,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const populated = await AuditorOrganization.findById(mapping._id)
      .populate("organizationId", "name domain verificationStatus status")
      .populate("auditorId", "name email phone role status")
      .populate("assignedBy", "name email");

    return sendSuccess(
      res,
      { mapping: populated, message: "Auditor successfully assigned to organization." },
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * List auditor-organization mappings for the active tenant
 * GET /api/v1/admin/auditor-mappings
 */
export async function getAuditorMappings(req: Request, res: Response, next: NextFunction) {
  try {
    const { status = "Active", organizationId, auditorId, page = "1", limit = "20" } = req.query;
    const filter: Record<string, any> = {};

    if (status && status !== "All") {
      filter.status = status;
    }

    const allowedOrgIds = await resolveTenantOrgIds(req);
    if (allowedOrgIds.length === 0) {
      return sendSuccess(res, {
        mappings: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    }

    if (organizationId) {
      const requested = String(organizationId);
      if (!allowedOrgIds.some((id) => id.toString() === requested)) {
        return sendError(
          res,
          "Access denied. Organization is outside your tenant scope.",
          403,
          "CROSS_TENANT_ACCESS_DENIED"
        );
      }
      filter.organizationId = new Types.ObjectId(requested);
    } else {
      filter.organizationId = { $in: allowedOrgIds };
    }

    if (auditorId) {
      filter.auditorId = new Types.ObjectId(auditorId as string);
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [mappings, total] = await Promise.all([
      AuditorOrganization.find(filter)
        .populate("organizationId", "name domain verificationStatus status")
        .populate("auditorId", "name email phone role status")
        .populate("assignedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AuditorOrganization.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      mappings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get all auditors assigned to a specific organization
 * GET /api/v1/admin/auditor-mappings/org/:organizationId
 */
export async function getAuditorsForOrganization(req: Request, res: Response, next: NextFunction) {
  try {
    const { organizationId } = req.params;

    if (isTenantAdminRole(req.user?.role)) {
      if (!(await assertOrgInTenant(req, organizationId))) {
        return sendError(
          res,
          "Access denied. Organization is outside your tenant scope.",
          403,
          "CROSS_TENANT_ACCESS_DENIED"
        );
      }
    } else if (isAuditorRole(req.user?.role)) {
      const allowed = await isAuditorAssignedToOrg(
        req.user!.userId,
        organizationId,
        req.user?.tenantId
      );
      if (!allowed) {
        return sendError(
          res,
          "Access denied. You are not assigned to this organization.",
          403,
          "CROSS_COMPANY_ACCESS_DENIED"
        );
      }
    }

    const mappings = await AuditorOrganization.find({
      organizationId: new Types.ObjectId(organizationId),
      status: "Active",
    })
      .populate("auditorId", "name email phone role status lastLogin")
      .populate("assignedBy", "name email")
      .sort({ createdAt: -1 });

    return sendSuccess(res, {
      organizationId,
      totalAuditors: mappings.length,
      auditors: mappings.map((m) => ({
        mappingId: m._id,
        auditor: m.auditorId,
        assignedBy: m.assignedBy,
        assignedAt: m.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get all organizations assigned to a specific auditor
 * GET /api/v1/admin/auditor-mappings/auditor/:auditorId
 */
export async function getOrganizationsForAuditor(req: Request, res: Response, next: NextFunction) {
  try {
    const { auditorId } = req.params;

    if (
      !isTenantAdminRole(req.user?.role) &&
      req.user?.userId !== auditorId
    ) {
      return sendError(
        res,
        "You do not have permission to view assignments for another auditor.",
        403,
        "CROSS_AUDITOR_ACCESS_DENIED"
      );
    }

    const filter: Record<string, any> = {
      auditorId: new Types.ObjectId(auditorId),
      status: "Active",
    };

    if (isTenantAdminRole(req.user?.role)) {
      const allowedOrgIds = await resolveTenantOrgIds(req);
      filter.organizationId = { $in: allowedOrgIds };
    }

    const mappings = await AuditorOrganization.find(filter)
      .populate("organizationId", "name domain verificationStatus status industry country")
      .sort({ createdAt: -1 });

    return sendSuccess(res, {
      auditorId,
      totalOrganizations: mappings.length,
      organizations: mappings.map((m) => ({
        mappingId: m._id,
        organization: m.organizationId,
        assignedAt: m.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Remove an auditor from an organization (unassign)
 * DELETE /api/v1/admin/auditor-mappings/:id
 */
export async function removeAuditorMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const adminId = req.user?.userId;
    const adminEmail = req.user?.email || "unknown";

    const mapping = await AuditorOrganization.findById(id);
    if (!mapping) {
      return sendError(res, "Auditor mapping not found", 404, "MAPPING_NOT_FOUND");
    }

    if (!(await assertOrgInTenant(req, mapping.organizationId.toString()))) {
      return sendError(
        res,
        "Access denied. You can only unassign auditors from organizations in your tenant.",
        403,
        "CROSS_TENANT_ACCESS_DENIED"
      );
    }

    mapping.status = "Inactive";
    await mapping.save();

    await AuditLog.create({
      actorId: adminId,
      actorEmail: adminEmail,
      action: "AUDITOR_UNASSIGNED_FROM_ORGANIZATION",
      entity: "AuditorOrganization",
      entityId: mapping._id.toString(),
      before: {
        organizationId: mapping.organizationId,
        auditorId: mapping.auditorId,
        previousStatus: "Active",
      },
      after: {
        status: "Inactive",
        unassignedBy: adminId,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return sendSuccess(
      res,
      { message: "Auditor successfully unassigned from organization.", mappingId: id }
    );
  } catch (err) {
    next(err);
  }
}
