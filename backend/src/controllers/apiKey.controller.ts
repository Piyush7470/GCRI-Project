import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { Types } from "mongoose";
import { ApiKey } from "../models/ApiKey.js";
import { AuditLog } from "../models/AuditLog.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { Company } from "../models/Company.js";
import { getAssignedOrganizationIds } from "../middlewares/companyScope.js";
import { isTenantAdminRole } from "../middlewares/auth.js";

async function resolveTenantCompanyIds(req: Request): Promise<Types.ObjectId[]> {
  if (!req.user?.userId || !isTenantAdminRole(req.user.role)) return [];
  return getAssignedOrganizationIds(req.user.userId, req.user.tenantId);
}

/**
 * Generate a new Machine-to-Machine (M2M) API Key (Tenant Admin module)
 */
export async function createApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, companyId, role = "ReadOnly", expiresInDays, permissions = [] } = req.body;

    if (!name || !companyId) {
      return sendError(res, "Key name and companyId are required", 400, "MISSING_REQUIRED_FIELDS");
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return sendError(res, "Company not found", 404, "COMPANY_NOT_FOUND");
    }

    const allowedOrgIds = await resolveTenantCompanyIds(req);
    if (!allowedOrgIds.some((id) => id.toString() === companyId.toString())) {
      return sendError(
        res,
        "Access denied. You can only create API keys for organizations in your tenant.",
        403,
        "CROSS_TENANT_ACCESS_DENIED"
      );
    }

    const prefix = `grc_${crypto.randomBytes(4).toString("hex")}`;
    const rawSecret = crypto.randomBytes(24).toString("hex");
    const fullKey = `${prefix}_${rawSecret}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");

    let expiresAt: Date | undefined;
    if (expiresInDays && Number(expiresInDays) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000);
    }

    const apiKey = await ApiKey.create({
      name,
      prefix,
      keyHash,
      companyId: company._id,
      role,
      permissions,
      expiresAt,
      isActive: true,
      createdBy: req.user!.userId,
    });

    await AuditLog.create({
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      action: "API_KEY_CREATED",
      entity: "ApiKey",
      entityId: apiKey._id.toString(),
      after: { name, prefix, role, companyId },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return sendSuccess(
      res,
      {
        message:
          "API key generated successfully. Store this secret securely; it will NOT be displayed again.",
        apiKey: {
          id: apiKey._id,
          name: apiKey.name,
          prefix: apiKey.prefix,
          rawKey: fullKey,
          role: apiKey.role,
          companyId: apiKey.companyId,
          expiresAt: apiKey.expiresAt,
          createdAt: apiKey.createdAt,
        },
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * List API keys for organizations in the active tenant
 */
export async function listApiKeys(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.query;
    const allowedOrgIds = await resolveTenantCompanyIds(req);
    if (allowedOrgIds.length === 0) {
      return sendSuccess(res, { keys: [] });
    }

    const filter: Record<string, unknown> = {
      companyId: { $in: allowedOrgIds },
    };

    if (companyId) {
      const requested = String(companyId);
      if (!allowedOrgIds.some((id) => id.toString() === requested)) {
        return sendError(
          res,
          "Access denied. Organization is outside your tenant scope.",
          403,
          "CROSS_TENANT_ACCESS_DENIED"
        );
      }
      filter.companyId = requested;
    }

    const keys = await ApiKey.find(filter)
      .select("-keyHash")
      .populate("companyId", "name domain")
      .sort({ createdAt: -1 });

    return sendSuccess(res, { keys });
  } catch (err) {
    next(err);
  }
}

/**
 * Revoke/Deactivate an API Key in the active tenant
 */
export async function revokeApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const key = await ApiKey.findById(id);

    if (!key) {
      return sendError(res, "API key not found", 404, "API_KEY_NOT_FOUND");
    }

    const allowedOrgIds = await resolveTenantCompanyIds(req);
    if (!allowedOrgIds.some((id) => id.toString() === key.companyId.toString())) {
      return sendError(
        res,
        "Access denied. You can only revoke API keys for organizations in your tenant.",
        403,
        "CROSS_TENANT_ACCESS_DENIED"
      );
    }

    key.isActive = false;
    await key.save();

    await AuditLog.create({
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      action: "API_KEY_REVOKED",
      entity: "ApiKey",
      entityId: key._id.toString(),
      after: { isActive: false },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return sendSuccess(res, {
      message: `API key "${key.name}" (${key.prefix}) has been revoked.`,
    });
  } catch (err) {
    next(err);
  }
}
