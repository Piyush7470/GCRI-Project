import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { AssessmentSession } from "../models/AssessmentSession.js";
import { Company } from "../models/Company.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { TenantMembership } from "../models/TenantMembership.js";
import { AssessmentFramework } from "../models/AssessmentFramework.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { getAssignedOrganizationIds } from "../middlewares/companyScope.js";
import {
  AnalyticsRange,
  buildDashboardAnalytics,
} from "../services/dashboardAnalytics.service.js";
import { DashboardAnalyticsExportService } from "../services/dashboardAnalyticsExport.service.js";

const CANONICAL_GRAICE_PILLARS = [
  { key: "P1", pillarId: "ethical-leadership", number: 1, name: "Ethical Leadership", defaultControls: 10 },
  { key: "P2", pillarId: "purpose-driven-innovation", number: 2, name: "Purpose-Driven Innovation", defaultControls: 9 },
  { key: "P3", pillarId: "human-centric-use", number: 3, name: "Human-Centric Use", defaultControls: 9 },
  { key: "P4", pillarId: "responsible-implementation", number: 4, name: "Responsible Implementation", defaultControls: 10 },
  { key: "P5", pillarId: "ai-literacy-workforce-readiness", number: 5, name: "AI Literacy & Workforce Readiness", defaultControls: 8 },
  { key: "P6", pillarId: "data-governance-integrity", number: 6, name: "Data Governance & Integrity", defaultControls: 10 },
  { key: "P7", pillarId: "transparency-auditability", number: 7, name: "Transparency & Auditability", defaultControls: 9 },
] as const;

function resolvePillarInfo(pillarId?: string, pillarNumber?: number) {
  if (pillarId === "ai-landscape" || pillarNumber === 0) {
    return { key: "P0", pillarId: "ai-landscape", number: 0, name: "Organization & AI Landscape" };
  }
  const byId = CANONICAL_GRAICE_PILLARS.find(
    (p) =>
      p.pillarId === pillarId ||
      p.key.toLowerCase() === (pillarId || "").toLowerCase() ||
      p.number === pillarNumber
  );
  return byId || CANONICAL_GRAICE_PILLARS[0];
}

const AUDITOR_ROLES = { $in: ["Assessor", "Auditor"] };

function isDashboardAdminRole(role?: string) {
  return role === "SuperAdmin" || role === "Admin" || role === "TenantAdmin";
}

type DashboardAdminFilters = {
  isSuperAdmin: boolean;
  userFilter: Record<string, unknown>;
  auditorFilter: Record<string, unknown>;
  orgFilter: Record<string, unknown>;
  sessionFilter: Record<string, unknown>;
  auditLogFilter: Record<string, unknown>;
  tenantCompanyIds: Types.ObjectId[];
};

async function buildDashboardAdminFilters(req: Request): Promise<DashboardAdminFilters | null> {
  const role = req.user?.role;
  if (!req.user) return null;

  if (role === "SuperAdmin") {
    return {
      isSuperAdmin: true,
      userFilter: {},
      auditorFilter: { role: AUDITOR_ROLES },
      orgFilter: {},
      sessionFilter: {},
      auditLogFilter: { action: { $ne: "AUTHORIZATION_DENIED" } },
      tenantCompanyIds: [],
    };
  }

  if (role === "TenantAdmin") {
    let tenantIdStr = req.user.tenantId;
    if (!tenantIdStr) {
      const membership = await TenantMembership.findOne({
        userId: req.user.userId,
        role: "TenantAdmin",
        status: "Active",
      })
        .select("tenantId")
        .lean();
      tenantIdStr = membership?.tenantId?.toString();
    }
    if (!tenantIdStr) {
      return null;
    }
    const tenantId = new Types.ObjectId(tenantIdStr);
    const tenantCompanies = await Company.find({ tenantId }).select("_id").lean();
    const tenantCompanyIds = tenantCompanies.map((c) => c._id);

    const membershipAuditors = await TenantMembership.find({
      tenantId,
      role: "Auditor",
      status: "Active",
    })
      .select("userId")
      .lean();
    const auditorIds = membershipAuditors.map((m) => m.userId);

    const userOr: Record<string, unknown>[] = [{ tenantId }];
    if (tenantCompanyIds.length) {
      userOr.push({ companyId: { $in: tenantCompanyIds } });
    }

    const auditorFilter: Record<string, unknown> = { role: AUDITOR_ROLES };
    if (auditorIds.length) {
      auditorFilter._id = { $in: auditorIds };
    } else {
      auditorFilter.tenantId = tenantId;
    }

    const auditOr: Record<string, unknown>[] = [{ actorId: req.user.userId }];
    if (tenantCompanyIds.length) {
      auditOr.push({ "after.companyId": { $in: tenantCompanyIds.map(String) } });
    }

    return {
      isSuperAdmin: false,
      userFilter: { $or: userOr },
      auditorFilter,
      orgFilter: { tenantId },
      sessionFilter: { tenantId },
      auditLogFilter: { action: { $ne: "AUTHORIZATION_DENIED" }, $or: auditOr },
      tenantCompanyIds,
    };
  }

  if (req.user.companyId && (role === "Admin" || role === "TenantAdmin")) {
    const companyId = req.user.companyId;
    return {
      isSuperAdmin: false,
      userFilter: { companyId },
      auditorFilter: { companyId, role: AUDITOR_ROLES },
      orgFilter: { _id: companyId },
      sessionFilter: { companyId },
      auditLogFilter: { actorId: req.user.userId },
      tenantCompanyIds: [],
    };
  }

  return null;
}

/**
 * Admin Operational Dashboard Summary (Screen 7 Alignment)
 * Exposes high-level administrative numbers without any confidential assessment content.
 */
export async function getAdminDashboardSummary(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isDashboardAdminRole(req.user?.role)) {
      return sendError(res, "Access denied. Administrators only.", 403, "ADMIN_ROLE_REQUIRED");
    }

    const scope = await buildDashboardAdminFilters(req);
    if (!scope) {
      return sendError(
        res,
        "Access denied. Tenant or organization scope is required.",
        403,
        "ADMIN_SCOPE_REQUIRED"
      );
    }

    const {
      isSuperAdmin,
      userFilter,
      auditorFilter,
      orgFilter,
      sessionFilter,
      auditLogFilter,
    } = scope;

    const [
      totalUsers,
      totalAuditors,
      totalOrganizations,
      totalAssessments,
      submittedCount,
      inProgressCount,
      frameworkCount,
      companies,
      recentLogs,
    ] = await Promise.all([
      User.countDocuments(userFilter),
      User.countDocuments(auditorFilter),
      Company.countDocuments(orgFilter),
      AssessmentSession.countDocuments(sessionFilter),
      AssessmentSession.countDocuments({ ...sessionFilter, status: "Submitted" }),
      AssessmentSession.countDocuments({ ...sessionFilter, status: "InProgress" }),
      AssessmentFramework.distinct("version").then((v) => v.length),
      Company.find(orgFilter).sort({ createdAt: -1 }).limit(5),
      AuditLog.find(auditLogFilter).sort({ timestamp: -1 }).limit(6),
    ]);

    // Plan distributions
    const [bronzeCount, silverCount, goldCount] = await Promise.all([
      Company.countDocuments({ ...orgFilter, $or: [{ activePlan: "Bronze" }, { activePlan: { $exists: false } }] }),
      Company.countDocuments({ ...orgFilter, activePlan: "Silver" }),
      Company.countDocuments({ ...orgFilter, activePlan: "Gold" }),
    ]);

    // Assessment count by company for recent organizations widget
    const recentOrgsWithStats = await Promise.all(
      companies.map(async (comp) => {
        const [assessCount, userCount] = await Promise.all([
          AssessmentSession.countDocuments({ companyId: comp._id }),
          User.countDocuments({ companyId: comp._id }),
        ]);
        return {
          _id: comp._id,
          name: comp.name,
          activePlan: comp.activePlan || "Bronze",
          assessmentCount: assessCount,
          userCount,
          status: comp.status,
          createdAt: comp.createdAt,
        };
      })
    );

    // Formatted non-confidential activity stream
    const recentActivity = recentLogs.map((log) => ({
      id: log._id,
      title: log.action.replace(/_/g, " "),
      description: `${log.actorEmail} performed ${log.action} on ${log.entity}`,
      type: log.action,
      timestamp: log.timestamp,
    }));

    return sendSuccess(res, {
      stats: {
        totalUsers,
        totalAuditors,
        totalOrganizations,
        totalAssessments,
        frameworkVersions: frameworkCount || 1,
        pillarsCount: 7,
        controlsCount: 65,
        questionsCount: 95,
        evidenceItemsCount: await AssessmentSession.countDocuments({
          ...sessionFilter,
          "answers.evidenceAttachmentUrl": { $exists: true, $ne: "" },
        }),
        reportsCount: await AssessmentSession.countDocuments({
          ...sessionFilter,
          reportMetadata: { $exists: true },
        }),
        activeSubscriptions: bronzeCount + silverCount + goldCount,
        permissionRolesCount: 2,
      },
      assessmentsByStatus: {
        total: totalAssessments,
        completed: submittedCount,
        inProgress: inProgressCount,
        notStarted: Math.max(0, totalAssessments - (submittedCount + inProgressCount)),
        overdue: 0,
      },
      subscriptionDistribution: {
        total: totalOrganizations,
        bronze: bronzeCount,
        silver: silverCount,
        gold: goldCount,
      },
      recentOrganizations: recentOrgsWithStats,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Searchable organization list for dashboard scope control (SuperAdmin / Tenant Admin / Org Admin).
 */
export async function getAdminScopeOrganizations(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isDashboardAdminRole(req.user?.role)) {
      return sendError(res, "Access denied. Administrators only.", 403, "ADMIN_ROLE_REQUIRED");
    }

    const scope = await buildDashboardAdminFilters(req);
    if (!scope) {
      return sendError(
        res,
        "Access denied. Tenant or organization scope is required.",
        403,
        "ADMIN_SCOPE_REQUIRED"
      );
    }

    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 100));
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const filter: Record<string, unknown> = { ...scope.orgFilter };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      filter.$or = [{ name: regex }, { domain: regex }, { industry: regex }];
    }

    const companies = await Company.find(filter)
      .select("name domain industry status activePlan logo")
      .sort({ name: 1 })
      .limit(limit)
      .lean();

    const payload = companies.map((c) => ({
      _id: String(c._id),
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      status: c.status,
      activePlan: c.activePlan || "Bronze",
      logoUrl:
        c.logo && typeof c.logo === "object" && "url" in c.logo
          ? String((c.logo as { url?: string }).url || "")
          : null,
    }));

    return sendSuccess(res, payload);
  } catch (err) {
    next(err);
  }
}

/**
 * Rich analytics for Admin / SuperAdmin dashboards (charts, trends, outliers).
 * Query: ?range=30d|90d|6m|1y&companyId=<optional scope>
 */
export async function getAdminDashboardAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isDashboardAdminRole(req.user?.role)) {
      return sendError(res, "Access denied. Administrators only.", 403, "ADMIN_ROLE_REQUIRED");
    }

    const scope = await buildDashboardAdminFilters(req);
    if (!scope) {
      return sendError(
        res,
        "Access denied. Tenant or organization scope is required.",
        403,
        "ADMIN_SCOPE_REQUIRED"
      );
    }

    const range = (String(req.query.range || "30d") as AnalyticsRange);
    const validRanges: AnalyticsRange[] = ["30d", "90d", "6m", "1y"];
    const safeRange = validRanges.includes(range) ? range : "30d";

    let companyId: string | undefined;
    const scopeParam = typeof req.query.companyId === "string" ? req.query.companyId : "";

    if (scope.isSuperAdmin && scopeParam && /^[0-9a-fA-F]{24}$/.test(scopeParam)) {
      companyId = scopeParam;
    } else if (
      scopeParam &&
      /^[0-9a-fA-F]{24}$/.test(scopeParam) &&
      req.user?.role === "TenantAdmin" &&
      scope.tenantCompanyIds.some((id) => id.toString() === scopeParam)
    ) {
      companyId = scopeParam;
    } else if (!scope.isSuperAdmin && req.user?.companyId && !req.user.tenantId) {
      companyId = req.user.companyId;
    } else if (!scope.isSuperAdmin && req.user?.role === "Admin" && req.user.companyId) {
      companyId = req.user.companyId;
    }

    const analytics = await buildDashboardAnalytics({
      companyId: companyId || undefined,
      tenantId:
        !companyId && req.user?.role === "TenantAdmin" && req.user.tenantId
          ? req.user.tenantId
          : undefined,
      isSuperAdmin: scope.isSuperAdmin,
      range: safeRange,
      tenantAdminUserId: req.user?.userId,
    });

    return sendSuccess(res, analytics);
  } catch (err) {
    next(err);
  }
}

/**
 * Rich analytics for Assessor dashboards (scoped to assigned orgs).
 */
export async function getAuditorDashboardAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const auditorId = req.user?.userId;
    if (!auditorId) {
      return sendError(res, "Authentication required", 401, "UNAUTHORIZED");
    }

    const range = (String(req.query.range || "30d") as AnalyticsRange);
    const validRanges: AnalyticsRange[] = ["30d", "90d", "6m", "1y"];
    const safeRange = validRanges.includes(range) ? range : "30d";
    const assignedCompanyIds = await getAssignedOrganizationIds(auditorId);

    const analytics = await buildDashboardAnalytics({
      assignedCompanyIds,
      auditorUserId: auditorId,
      range: safeRange,
    });

    return sendSuccess(res, analytics);
  } catch (err) {
    next(err);
  }
}

/**
 * Admin Filterable Assessment Metadata Table (Screen 7 Alignment)
 * Strictly excludes answers, scores, and evidence URLs.
 */
export async function getAdminDashboardAssessments(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role === "SuperAdmin") {
      return sendError(
        res,
        "Super Admin sees tenant metadata only and cannot list assessment operational data.",
        403,
        "SUPER_ADMIN_CONTENT_ACCESS_RESTRICTED"
      );
    }
    const actorRole = req.user?.role;
    if (actorRole !== "Admin" && actorRole !== "TenantAdmin") {
      return sendError(res, "Access denied. Administrators only.", 403, "ADMIN_ROLE_REQUIRED");
    }

    const { status, search, assessmentType } = req.query as {
      status?: string;
      search?: string;
      assessmentType?: string;
    };
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const query: any = {};

    // Tenant / org admins: scope by active tenant or legacy company
    if (req.user?.role === "TenantAdmin" && req.user.tenantId) {
      query.tenantId = req.user.tenantId;
    } else if (req.user?.role === "Admin") {
      query.companyId = req.user.companyId;
    }

    if (status && status !== "all") {
      query.status = status;
    }
    if (assessmentType && assessmentType !== "all") {
      query.assessmentType = assessmentType;
    }

    if (search) {
      const companySearch: Record<string, unknown> = {
        name: { $regex: search, $options: "i" },
      };
      if (req.user?.role === "TenantAdmin" && req.user.tenantId) {
        companySearch.tenantId = req.user.tenantId;
      }
      const matchingCompanies = await Company.find(companySearch).select("_id");
      const companyIds = matchingCompanies.map((c) => c._id);
      if (req.user?.role === "Admin") {
        query.companyId = req.user.companyId;
      } else if (req.user?.role === "TenantAdmin") {
        query.companyId = { $in: companyIds };
        if (req.user.tenantId) {
          query.tenantId = req.user.tenantId;
        }
      } else {
        query.companyId = { $in: companyIds };
      }
    }

    const [total, sessions] = await Promise.all([
      AssessmentSession.countDocuments(query),
      AssessmentSession.find(query)
        .select("-answers -scoreSnapshot") // Critical: Strip all confidential content
        .populate("companyId", "name domain industry country activePlan")
        .populate("conductedByUserId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const formattedSessions = sessions.map((s) => ({
      _id: s._id,
      organization: s.companyId,
      auditor: s.conductedByUserId,
      assessmentType: s.assessmentType,
      status: s.status,
      clientContact: s.clientContact,
      frameworkVersion: s.frameworkVersion,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      submittedAt: s.submittedAt,
    }));

    return sendSuccess(
      res,
      {
        assessments: formattedSessions,
      },
      200,
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Auditor Workload Dashboard Summary (Screen 1 Alignment)
 * Exposes active client stats, overall progress %, 7-pillar bars, and resumption cards.
 */
export async function getAuditorDashboardSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const auditorId = req.user?.userId;
    if (!auditorId) {
      return sendError(res, "Authentication required", 401, "UNAUTHORIZED");
    }

    const assignedOrgIds = await getAssignedOrganizationIds(auditorId);

    const sessionQuery = {
      $or: [
        { conductedByUserId: auditorId },
        { companyId: { $in: assignedOrgIds } },
      ],
    };

    const [allSessions, assignedCompanies] = await Promise.all([
      AssessmentSession.find(sessionQuery).populate("companyId", "name domain industry status activePlan"),
      Company.find({ _id: { $in: assignedOrgIds } }),
    ]);

    const totalAssessments = allSessions.length;
    const inProgressSessions = allSessions.filter((s) => s.status === "InProgress");
    const completedSessions = allSessions.filter((s) => s.status === "Submitted");

    // Findings count (exceptions noted)
    let totalFindings = 0;
    const latestFindings: any[] = [];

    allSessions.forEach((s) => {
      const compName = (s.companyId as any)?.name || "Organization";
      s.answers?.forEach((a) => {
        if (a.exceptionStatus === "ExceptionNoted" || a.selectedOptionCode === "EXCEPTION_NOTED") {
          totalFindings++;
          if (latestFindings.length < 5) {
            latestFindings.push({
              findingId: `FND-${new Date(a.answeredAt).getFullYear()}-${String(latestFindings.length + 1).padStart(3, "0")}`,
              controlId: a.questionId,
              title: a.evidenceNotes ? a.evidenceNotes.slice(0, 50) : `Exception noted for control ${a.questionId}`,
              organizationName: compName,
              severity: a.scoreValue && a.scoreValue > 0 ? "Medium" : "High",
              status: "Open",
            });
          }
        }
      });
    });

    // 7 GRAICE Pillars aggregate performance (aligned with official GRAICE Pillars 1-7)
    const pillarTotals: Record<
      string,
      { pillarId: string; name: string; number: number; complete: number; total: number }
    > = {};

    for (const p of CANONICAL_GRAICE_PILLARS) {
      pillarTotals[p.key] = {
        pillarId: p.pillarId,
        name: p.name,
        number: p.number,
        complete: 0,
        total: 0,
      };
    }

    allSessions.forEach((s) => {
      s.answers?.forEach((a) => {
        if (a.pillarId === "ai-landscape" || a.pillarNumber === 0) {
          return; // Section 1 context questions are tracked separately from the 7 Pillars
        }
        const matchedPillar = CANONICAL_GRAICE_PILLARS.find(
          (p) =>
            p.pillarId === a.pillarId ||
            p.key.toLowerCase() === (a.pillarId || "").toLowerCase() ||
            p.number === a.pillarNumber
        );
        if (matchedPillar) {
          const bucket = pillarTotals[matchedPillar.key];
          bucket.total++;
          const isAnswered =
            a.testStatus === "Complete" ||
            !!a.selectedOptionCode ||
            (typeof a.scoreValue === "number" && a.scoreValue > 0) ||
            a.exceptionStatus === "NoExceptionNoted" ||
            a.exceptionStatus === "ExceptionNoted";
          if (isAnswered) {
            bucket.complete++;
          }
        }
      });
    });

    const pillarPerformance = CANONICAL_GRAICE_PILLARS.map((p) => {
      const data = pillarTotals[p.key];
      const pct = data.total > 0 ? Math.round((data.complete / data.total) * 100) : 0;
      return {
        pillarId: p.key,
        canonicalPillarId: p.pillarId,
        pillarNumber: data.number,
        name: data.name,
        completionPercentage: pct,
      };
    });

    // Overall completion percentage
    const avgCompletion =
      totalAssessments > 0
        ? Math.round((completedSessions.length / totalAssessments) * 100)
        : 0;

    // Full vs Light split
    const fullCount = allSessions.filter((s) => s.assessmentType === "Full").length;
    const lightCount = allSessions.filter((s) => s.assessmentType === "Light").length;

    // Resumption Cards ("Continue Your Assessment")
    const activeAssessments = inProgressSessions.slice(0, 3).map((s) => {
      const answeredCount =
        s.answers?.filter(
          (a) => a.testStatus === "Complete" || !!a.selectedOptionCode
        ).length || 0;
      const totalCount =
        s.answers?.length || (s.assessmentType === "Full" ? 65 : 30);
      const pct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

      const nextUnanswered =
        s.answers?.find(
          (a) => a.testStatus !== "Complete" && !a.selectedOptionCode
        ) || s.answers?.[s.answers.length - 1];
      const resolvedPillar = resolvePillarInfo(
        nextUnanswered?.pillarId,
        nextUnanswered?.pillarNumber
      );

      return {
        _id: s._id,
        organizationName: (s.companyId as any)?.name || "Assigned Company",
        assessmentType: s.assessmentType,
        completionPercentage: pct,
        resumptionAid: {
          currentPillarId: resolvedPillar.pillarId,
          currentPillarName: resolvedPillar.name,
          currentQuestionIndex: answeredCount,
        },
      };
    });

    return sendSuccess(res, {
      stats: {
        totalAssessments,
        inProgressAssessments: inProgressSessions.length,
        completedAssessments: completedSessions.length,
        totalFindings,
        assignedOrganizations: assignedCompanies.length,
      },
      overallCompletionPercentage: avgCompletion,
      pillarPerformance,
      assessmentTypes: {
        total: totalAssessments,
        fullCount,
        fullPercentage: totalAssessments > 0 ? Math.round((fullCount / totalAssessments) * 100) : 0,
        lightCount,
        lightPercentage: totalAssessments > 0 ? Math.round((lightCount / totalAssessments) * 100) : 0,
      },
      myOrganizations: assignedCompanies.slice(0, 5).map((c) => ({
        _id: c._id,
        name: c.name,
        industry: c.industry || "General",
        status: c.status,
        assessmentCount: allSessions.filter((s) => s.companyId?.toString() === c._id.toString()).length,
      })),
      latestFindings,
      activeAssessments,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Auditor Assessment Listing with Status Filter & Deep-Linking Aid
 */
export async function getAuditorDashboardAssessments(req: Request, res: Response, next: NextFunction) {
  try {
    const auditorId = req.user?.userId;
    if (!auditorId) {
      return sendError(res, "Authentication required", 401, "UNAUTHORIZED");
    }

    const { status, organizationId, assessmentType } = req.query as {
      status?: string;
      organizationId?: string;
      assessmentType?: string;
    };
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const assignedOrgIds = await getAssignedOrganizationIds(auditorId);

    const query: any = {
      $or: [
        { conductedByUserId: auditorId },
        { companyId: { $in: assignedOrgIds } },
      ],
    };

    if (status && status !== "all") {
      query.status = status;
    }
    if (organizationId) {
      query.companyId = organizationId;
    }
    if (assessmentType && assessmentType !== "all") {
      query.assessmentType = assessmentType;
    }

    const [total, sessions] = await Promise.all([
      AssessmentSession.countDocuments(query),
      AssessmentSession.find(query)
        .populate("companyId", "name domain industry country activePlan")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const formatted = sessions.map((s) => {
      const answeredCount =
        s.answers?.filter(
          (a) => a.testStatus === "Complete" || !!a.selectedOptionCode
        ).length || 0;
      const totalCount =
        s.answers?.length || (s.assessmentType === "Full" ? 65 : 30);
      const pct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

      const nextUnanswered =
        s.answers?.find(
          (a) => a.testStatus !== "Complete" && !a.selectedOptionCode
        ) || s.answers?.[s.answers.length - 1];
      const resolvedPillar = resolvePillarInfo(
        nextUnanswered?.pillarId,
        nextUnanswered?.pillarNumber
      );

      return {
        _id: s._id,
        organization: s.companyId,
        assessmentType: s.assessmentType,
        status: s.status,
        completionPercentage: pct,
        clientContact: s.clientContact,
        scoreSnapshot: s.scoreSnapshot,
        resumptionAid: {
          currentQuestionIndex: answeredCount,
          currentPillarId: resolvedPillar.pillarId,
          currentPillarName: resolvedPillar.name,
        },
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        submittedAt: s.submittedAt,
      };
    });

    return sendSuccess(
      res,
      { assessments: formatted },
      200,
      { page, limit, total, totalPages: Math.ceil(total / limit) }
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Auditor Accessible Organizations Directory (Screen 2 Alignment)
 * Returns companies assigned to the auditor with active assessment statistics and drawer metadata.
 */
export async function getAuditorOrganizations(req: Request, res: Response, next: NextFunction) {
  try {
    const auditorId = req.user?.userId;
    if (!auditorId) {
      return sendError(res, "Authentication required", 401, "UNAUTHORIZED");
    }

    const assignedOrgIds = await getAssignedOrganizationIds(auditorId);
    const companies = await Company.find({ _id: { $in: assignedOrgIds } }).sort({ name: 1 });

    const organizationsWithStats = await Promise.all(
      companies.map(async (c) => {
        const [total, inProgress, completed, latest] = await Promise.all([
          AssessmentSession.countDocuments({ companyId: c._id }),
          AssessmentSession.countDocuments({ companyId: c._id, status: "InProgress" }),
          AssessmentSession.countDocuments({ companyId: c._id, status: "Submitted" }),
          AssessmentSession.findOne({ companyId: c._id }).sort({ createdAt: -1 }),
        ]);

        return {
          _id: c._id,
          name: c.name,
          domain: c.domain,
          industry: c.industry || "General",
          country: c.country,
          status: c.status,
          activePlan: c.activePlan || "Bronze",
          size: c.size || "100-500 employees",
          logo: c.logo?.url ? { url: c.logo.url, publicId: c.logo.publicId } : null,
          assessmentsSummary: {
            total,
            inProgress,
            completed,
            notStarted: Math.max(0, total - (inProgress + completed)),
          },
          latestAssessment: latest
            ? {
                _id: latest._id,
                assessmentType: latest.assessmentType,
                status: latest.status,
                createdAt: latest.createdAt,
                completionPercentage: Math.round(
                  ((latest.answers?.filter(
                    (a) => a.testStatus === "Complete" || !!a.selectedOptionCode
                  ).length || 0) /
                    (latest.answers?.length ||
                      (latest.assessmentType === "Full" ? 65 : 30))) *
                    100
                ),
              }
            : null,
        };
      })
    );

    return sendSuccess(res, { organizations: organizationsWithStats });
  } catch (err) {
    next(err);
  }
}

function parseAnalyticsExportFormat(raw: unknown): "pdf" | "xlsx" | null {
  const f = String(raw || "pdf").toLowerCase();
  if (f === "pdf") return "pdf";
  if (f === "xlsx" || f === "excel") return "xlsx";
  return null;
}

function parseAnalyticsRange(raw: unknown): AnalyticsRange {
  const range = String(raw || "30d") as AnalyticsRange;
  const valid: AnalyticsRange[] = ["30d", "90d", "6m", "1y"];
  return valid.includes(range) ? range : "30d";
}

export async function exportAdminDashboardAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return sendError(res, "Authentication required", 401, "UNAUTHORIZED");
    }
    if (!isDashboardAdminRole(user.role)) {
      return sendError(res, "Access denied. Administrators only.", 403, "ADMIN_ROLE_REQUIRED");
    }

    const scope = await buildDashboardAdminFilters(req);
    if (!scope) {
      return sendError(
        res,
        "Access denied. Tenant or organization scope is required.",
        403,
        "ADMIN_SCOPE_REQUIRED"
      );
    }

    const format = parseAnalyticsExportFormat(req.query.format);
    if (!format) {
      return sendError(res, "Invalid format. Use format=pdf or format=xlsx", 400, "INVALID_FORMAT");
    }

    const safeRange = parseAnalyticsRange(req.query.range);
    let companyId: string | undefined;
    const scopeParam = typeof req.query.companyId === "string" ? req.query.companyId : "";
    if (scope.isSuperAdmin && scopeParam && /^[0-9a-fA-F]{24}$/.test(scopeParam)) {
      companyId = scopeParam;
    } else if (
      scopeParam &&
      /^[0-9a-fA-F]{24}$/.test(scopeParam) &&
      user.role === "TenantAdmin" &&
      scope.tenantCompanyIds.some((id) => id.toString() === scopeParam)
    ) {
      companyId = scopeParam;
    } else if (user.role === "Admin" && user.companyId) {
      companyId = user.companyId;
    }

    const analytics = await buildDashboardAnalytics({
      companyId: companyId || undefined,
      tenantId:
        !companyId && user.role === "TenantAdmin" && user.tenantId ? user.tenantId : undefined,
      isSuperAdmin: scope.isSuperAdmin,
      range: safeRange,
      tenantAdminUserId: user.userId,
    });

    let scopeLabel = "All organizations";
    if (companyId) {
      const org = await Company.findById(companyId).select("name").lean();
      scopeLabel = org?.name || "Scoped organization";
    } else if (user.role === "TenantAdmin" && user.tenantId) {
      scopeLabel = "Tenant workspace";
    }

    const ctx = {
      scopeLabel,
      roleLabel:
        user.role === "SuperAdmin"
          ? "Super Administrator"
          : user.role === "TenantAdmin"
            ? "Tenant Administrator"
            : "Organization Administrator",
      requestedBy: user.email,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "pdf") {
      const buffer = await DashboardAnalyticsExportService.buildPdf(analytics, ctx);
      const fileName = `GCRAI_Analytics_${safeRange}_${stamp}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.send(buffer);
    }

    const buffer = await DashboardAnalyticsExportService.buildExcel(analytics, ctx);
    const fileName = `GCRAI_Analytics_${safeRange}_${stamp}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportAuditorDashboardAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const auditorId = user?.userId;
    if (!user || !auditorId) {
      return sendError(res, "Authentication required", 401, "UNAUTHORIZED");
    }

    const format = parseAnalyticsExportFormat(req.query.format);
    if (!format) {
      return sendError(res, "Invalid format. Use format=pdf or format=xlsx", 400, "INVALID_FORMAT");
    }

    const safeRange = parseAnalyticsRange(req.query.range);
    const assignedCompanyIds = await getAssignedOrganizationIds(auditorId);

    const analytics = await buildDashboardAnalytics({
      assignedCompanyIds,
      auditorUserId: auditorId,
      range: safeRange,
    });

    const ctx = {
      scopeLabel: `Assigned portfolio (${assignedCompanyIds.length} organization(s))`,
      roleLabel: "Accredited Assessor",
      requestedBy: user.email,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "pdf") {
      const buffer = await DashboardAnalyticsExportService.buildPdf(analytics, ctx);
      const fileName = `GCRAI_Assessor_Analytics_${safeRange}_${stamp}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.send(buffer);
    }

    const buffer = await DashboardAnalyticsExportService.buildExcel(analytics, ctx);
    const fileName = `GCRAI_Assessor_Analytics_${safeRange}_${stamp}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
}
