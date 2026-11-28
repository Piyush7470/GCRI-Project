import { Types } from "mongoose";
import { AuditLog } from "../models/AuditLog.js";
import { Company } from "../models/Company.js";

export type NotificationCategory = "security" | "platform" | "all";
export type NotificationSeverity = "critical" | "high" | "medium" | "info";

export interface PlatformNotificationItem {
  id: string;
  category: Exclude<NotificationCategory, "all">;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  action: string;
  entity: string;
}

const SECURITY_ACTIONS = new Set([
  "LOGIN_FAILED",
  "AUTHORIZATION_DENIED",
  "MFA_ENROLLED",
  "MFA_DISABLED",
  "PASSWORD_RESET",
  "USER_SUSPENDED",
  "USER_DEACTIVATED",
]);

function classifySeverity(action: string): NotificationSeverity {
  if (action.includes("DENIED") || action.includes("FAILED") || action.includes("SUSPEND")) {
    return "critical";
  }
  if (action.includes("DEACTIVATED") || action.includes("REVOKED")) {
    return "high";
  }
  if (action.includes("INVITED") || action.includes("CREATED") || action.includes("SUBMITTED")) {
    return "medium";
  }
  return "info";
}

function categoryForAction(action: string): Exclude<NotificationCategory, "all"> {
  return SECURITY_ACTIONS.has(action) || /DENIED|FAILED|LOGIN|MFA|PASSWORD/i.test(action)
    ? "security"
    : "platform";
}

function titleForLog(action: string, entity: string): string {
  return action.replace(/_/g, " ");
}

function messageForLog(action: string, actorEmail?: string, entity?: string, entityId?: string) {
  const actor = actorEmail || "System";
  const target = entityId ? `${entity || "Entity"} #${entityId.slice(-6)}` : entity || "platform";
  return `${actor} · ${target}`;
}

export async function buildPlatformNotifications(options: {
  userId: string;
  role?: string;
  tenantId?: string;
  category?: NotificationCategory;
  search?: string;
  limit?: number;
  hours?: number;
}): Promise<{
  items: PlatformNotificationItem[];
  summary: {
    total: number;
    security: number;
    platform: number;
    critical: number;
    high: number;
  };
}> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 40));
  const hours = Math.min(24 * 30, Math.max(1, options.hours ?? 24 * 7));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const filter: Record<string, unknown> = {
    timestamp: { $gte: since },
  };

  if (options.role === "SuperAdmin") {
    // Platform-wide feed (same visibility as audit trail explorer for Super Admin).
  } else if (options.role === "TenantAdmin" && options.tenantId) {
    const tenantId = new Types.ObjectId(options.tenantId);
    const tenantCompanies = await Company.find({ tenantId }).select("_id").lean();
    const companyIds = tenantCompanies.map((c) => String(c._id));
    const tenantScope: Record<string, unknown>[] = [
      { actorId: options.userId },
      ...(companyIds.length ? [{ "after.companyId": { $in: companyIds } }] : []),
    ];
    filter.$and = [{ $or: tenantScope }];
  } else if (options.role === "Auditor") {
    filter.actorId = options.userId;
  }

  const logs = await AuditLog.find(filter).sort({ timestamp: -1 }).limit(250).lean();

  const categoryFilter = options.category && options.category !== "all" ? options.category : null;
  const search = options.search?.trim().toLowerCase();

  const mapped: PlatformNotificationItem[] = [];
  for (const log of logs) {
    const action = String(log.action || "");
    const category = categoryForAction(action);
    if (categoryFilter && category !== categoryFilter) continue;

    const title = titleForLog(action, log.entity || "");
    const message = messageForLog(action, log.actorEmail, log.entity, log.entityId);
    if (search) {
      const hay = `${title} ${message} ${action} ${log.actorEmail || ""}`.toLowerCase();
      if (!hay.includes(search)) continue;
    }

    mapped.push({
      id: String(log._id),
      category,
      severity: classifySeverity(action),
      title,
      message,
      timestamp: new Date(log.timestamp).toISOString(),
      action,
      entity: log.entity || "",
    });
    if (mapped.length >= limit) break;
  }

  const summary = {
    total: mapped.length,
    security: mapped.filter((n) => n.category === "security").length,
    platform: mapped.filter((n) => n.category === "platform").length,
    critical: mapped.filter((n) => n.severity === "critical").length,
    high: mapped.filter((n) => n.severity === "high").length,
  };

  return { items: mapped, summary };
}