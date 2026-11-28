import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { AuditLog } from "../models/AuditLog.js";
import { Company } from "../models/Company.js";
import { sendSuccess, sendError } from "../utils/response.js";

/**
 * Query and filter audit trail logs (Admin Only)
 */
export async function getAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const {
      actorId,
      actorEmail,
      action,
      entity,
      entityId,
      startDate,
      endDate,
      search,
    } = req.query as Record<string, string | undefined>;

    const filter: Record<string, any> = {};

    if (actorId) filter.actorId = actorId;
    if (actorEmail) filter.actorEmail = { $regex: actorEmail.trim(), $options: "i" };
    if (action) filter.action = action;
    if (entity) filter.entity = entity;
    if (entityId) filter.entityId = entityId;

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        // If date-only format YYYY-MM-DD, set to end of day
        const end = new Date(endDate);
        if (endDate.length === 10) {
          end.setHours(23, 59, 59, 999);
        }
        filter.timestamp.$lte = end;
      }
    }

    if (search) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { actorEmail: regex },
        { action: regex },
        { entity: regex },
        { entityId: regex },
      ];
    }

    if (req.user?.role === "TenantAdmin" && req.user.tenantId) {
      const tenantId = new Types.ObjectId(req.user.tenantId);
      const tenantCompanies = await Company.find({ tenantId }).select("_id").lean();
      const companyIds = tenantCompanies.map((c) => String(c._id));
      const tenantScope: Record<string, unknown>[] = [
        { actorId: req.user.userId },
        ...(companyIds.length ? [{ "after.companyId": { $in: companyIds } }] : []),
      ];
      filter.$and = [...(filter.$and ? (filter.$and as unknown[]) : []), { $or: tenantScope }];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate("actorId", "name email role"),
      AuditLog.countDocuments(filter),
    ]);

    return sendSuccess(res, logs, 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get audit log summary metrics for platform overview
 */
export async function getAuditLogStats(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let baseFilter: Record<string, unknown> = {};
    if (req.user?.role === "TenantAdmin" && req.user.tenantId) {
      const tenantId = new Types.ObjectId(req.user.tenantId);
      const tenantCompanies = await Company.find({ tenantId }).select("_id").lean();
      const companyIds = tenantCompanies.map((c) => String(c._id));
      const tenantScope: Record<string, unknown>[] = [
        { actorId: req.user.userId },
        ...(companyIds.length ? [{ "after.companyId": { $in: companyIds } }] : []),
      ];
      baseFilter = { $or: tenantScope };
    }

    const [
      totalEvents,
      eventsLast24Hours,
      authorizationDenialsCount,
      topActions,
      topEntities,
    ] = await Promise.all([
      AuditLog.countDocuments(baseFilter),
      AuditLog.countDocuments({ ...baseFilter, timestamp: { $gte: oneDayAgo } }),
      AuditLog.countDocuments({
        ...baseFilter,
        action: "AUTHORIZATION_DENIED",
        timestamp: { $gte: oneDayAgo },
      }),
      AuditLog.aggregate([
        ...(Object.keys(baseFilter).length ? [{ $match: baseFilter }] : []),
        { $match: { timestamp: { $gte: oneDayAgo } } },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      AuditLog.aggregate([
        ...(Object.keys(baseFilter).length ? [{ $match: baseFilter }] : []),
        { $group: { _id: "$entity", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
    ]);

    return sendSuccess(res, {
      totalEvents,
      eventsLast24Hours,
      authorizationDenialsCount,
      topActions: topActions.map((a) => ({ action: a._id, count: a.count })),
      topEntities: topEntities.map((e) => ({ entity: e._id, count: e.count })),
    });
  } catch (err) {
    next(err);
  }
}
