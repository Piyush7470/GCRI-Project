import { Request, Response, NextFunction } from "express";
import { buildPlatformNotifications, NotificationCategory } from "../services/platformNotification.service.js";
import { sendSuccess } from "../utils/response.js";

const VALID_CATEGORIES: NotificationCategory[] = ["all", "security", "platform"];

/**
 * In-app notification feed (derived from immutable audit trail).
 * Query: category, search, limit, hours
 */
export async function getPlatformNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const category = VALID_CATEGORIES.includes(req.query.category as NotificationCategory)
      ? (req.query.category as NotificationCategory)
      : "all";
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "10"), 10) || 10));
    const hours = parseInt(String(req.query.hours || String(24 * 7)), 10);

    const result = await buildPlatformNotifications({
      userId: req.user!.userId,
      role: req.user?.role,
      tenantId: req.user?.tenantId,
      category,
      search,
      limit,
      hours,
    });

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}