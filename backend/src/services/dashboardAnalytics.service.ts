import { Types } from "mongoose";
import { AssessmentSession } from "../models/AssessmentSession.js";
import { Company } from "../models/Company.js";
import { Tenant } from "../models/Tenant.js";
import { TenantMembership } from "../models/TenantMembership.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";

export type AnalyticsRange = "30d" | "90d" | "6m" | "1y";

const CANONICAL_PILLARS = [
  { key: "P1", pillarId: "ethical-leadership", name: "Ethical Leadership" },
  { key: "P2", pillarId: "purpose-driven-innovation", name: "Purpose-Driven Innovation" },
  { key: "P3", pillarId: "human-centric-use", name: "Human-Centric Use" },
  { key: "P4", pillarId: "responsible-implementation", name: "Responsible Implementation" },
  { key: "P5", pillarId: "ai-literacy-workforce-readiness", name: "AI Literacy & Workforce" },
  { key: "P6", pillarId: "data-governance-integrity", name: "Data Governance & Integrity" },
  { key: "P7", pillarId: "transparency-auditability", name: "Transparency & Auditability" },
] as const;

function rangeToDays(range: AnalyticsRange): number {
  switch (range) {
    case "90d":
      return 90;
    case "6m":
      return 180;
    case "1y":
      return 365;
    case "30d":
    default:
      return 30;
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pctDelta(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function classifySeverity(scoreValue?: number, notes?: string): "Critical" | "High" | "Medium" | "Low" {
  const n = (notes || "").toLowerCase();
  if (n.includes("critical") || n.includes("severe")) return "Critical";
  if (typeof scoreValue === "number" && scoreValue <= 0) return "High";
  if (n.includes("high")) return "High";
  if (n.includes("low")) return "Low";
  return "Medium";
}

export interface DashboardAnalyticsScope {
  /** When set, restrict company/session scope to this org (Org Admin / scoped SuperAdmin). */
  companyId?: string | Types.ObjectId;
  /** Tenant Admin: entire workspace (all client orgs in tenant). */
  tenantId?: string | Types.ObjectId;
  /** When set (Assessor), restrict to these org ids + conductedBy. */
  assignedCompanyIds?: Array<string | Types.ObjectId>;
  auditorUserId?: string;
  tenantAdminUserId?: string;
  isSuperAdmin?: boolean;
  range?: AnalyticsRange;
}

export async function buildDashboardAnalytics(scope: DashboardAnalyticsScope) {
  const range = scope.range || "30d";
  const days = rangeToDays(range);
  const now = new Date();
  const periodStart = startOfDay(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));

  const sessionFilter: Record<string, unknown> = {};
  const companyFilter: Record<string, unknown> = {};
  const userFilter: Record<string, unknown> = {};
  const auditorFilter: Record<string, unknown> = { role: "Assessor" };
  let auditFilter: Record<string, unknown> = {
    action: { $ne: "AUTHORIZATION_DENIED" },
  };

  if (scope.companyId) {
    sessionFilter.companyId = scope.companyId;
    companyFilter._id = scope.companyId;
    userFilter.companyId = scope.companyId;
    auditorFilter.companyId = scope.companyId;
  } else if (scope.tenantId) {
    const tenantId = new Types.ObjectId(scope.tenantId);
    sessionFilter.tenantId = tenantId;
    companyFilter.tenantId = tenantId;

    const tenantCompanies = await Company.find({ tenantId }).select("_id").lean();
    const tenantCompanyIds = tenantCompanies.map((c) => c._id);

    const userOr: Record<string, unknown>[] = [{ tenantId }];
    if (tenantCompanyIds.length) {
      userOr.push({ companyId: { $in: tenantCompanyIds } });
    }
    Object.assign(userFilter, { $or: userOr });

    const membershipAuditors = await TenantMembership.find({
      tenantId,
      role: "Auditor",
      status: "Active",
    })
      .select("userId")
      .lean();
    const auditorIds = membershipAuditors.map((m) => m.userId);
    auditorFilter.role = { $in: ["Assessor", "Auditor"] };
    if (auditorIds.length) {
      auditorFilter._id = { $in: auditorIds };
    } else {
      auditorFilter.tenantId = tenantId;
    }

    const auditOr: Record<string, unknown>[] = [];
    if (scope.tenantAdminUserId) {
      auditOr.push({ actorId: scope.tenantAdminUserId });
    }
    if (tenantCompanyIds.length) {
      auditOr.push({ "after.companyId": { $in: tenantCompanyIds.map(String) } });
    }
    auditFilter =
      auditOr.length > 0
        ? { action: { $ne: "AUTHORIZATION_DENIED" }, $or: auditOr }
        : { action: { $ne: "AUTHORIZATION_DENIED" } };
  } else if (scope.assignedCompanyIds?.length) {
    sessionFilter.$or = [
      { conductedByUserId: scope.auditorUserId },
      { companyId: { $in: scope.assignedCompanyIds } },
    ];
    companyFilter._id = { $in: scope.assignedCompanyIds };
    userFilter.companyId = { $in: scope.assignedCompanyIds };
    auditorFilter._id = scope.auditorUserId
      ? { $in: [scope.auditorUserId] }
      : { $exists: true };
    auditFilter = {
      ...auditFilter,
      $or: [
        { actorId: scope.auditorUserId },
        { "after.companyId": { $in: scope.assignedCompanyIds.map(String) } },
      ],
    };
  }

  // Assessor/Auditor role aliases — KPI + directory must use the same filter.
  if (auditorFilter.role === "Assessor") {
    auditorFilter.role = { $in: ["Assessor", "Auditor"] };
  }

  const [
    totalUsers,
    prevUsers,
    totalAuditors,
    prevAuditors,
    totalOrganizations,
    prevOrganizations,
    totalAssessments,
    prevAssessments,
    submittedCount,
    inProgressCount,
    notStartedCount,
    companies,
    sessionsForScores,
    recentLogs,
    usersCreatedInPeriod,
    orgsCreatedAll,
    auditLogsInPeriod,
    auditors,
    scopedUsersDirectory,
    scopedAuditorsDirectory,
  ] = await Promise.all([
    User.countDocuments(userFilter),
    User.countDocuments({ ...userFilter, createdAt: { $lt: periodStart } }),
    User.countDocuments(auditorFilter),
    User.countDocuments({ ...auditorFilter, createdAt: { $lt: periodStart } }),
    Company.countDocuments(companyFilter),
    Company.countDocuments({ ...companyFilter, createdAt: { $lt: periodStart } }),
    AssessmentSession.countDocuments(sessionFilter),
    AssessmentSession.countDocuments({
      ...sessionFilter,
      createdAt: { $lt: periodStart },
    }),
    AssessmentSession.countDocuments({ ...sessionFilter, status: "Submitted" }),
    AssessmentSession.countDocuments({ ...sessionFilter, status: "InProgress" }),
    AssessmentSession.countDocuments({
      ...sessionFilter,
      status: { $nin: ["Submitted", "InProgress"] },
    }),
    Company.find(companyFilter)
      .select("name domain industry activePlan status createdAt tenantId verificationStatus")
      .lean(),
    AssessmentSession.find(sessionFilter)
      .select(
        "companyId conductedByUserId status assessmentType scoreSnapshot answers createdAt submittedAt updatedAt"
      )
      .populate("companyId", "name activePlan status tenantId")
      .populate("conductedByUserId", "name email")
      .lean(),
    AuditLog.find(auditFilter).sort({ timestamp: -1 }).limit(12).lean(),
    User.countDocuments({ ...userFilter, createdAt: { $gte: periodStart } }),
    Company.find(companyFilter).select("createdAt activePlan").lean(),
    AuditLog.find({
      ...auditFilter,
      timestamp: { $gte: periodStart },
    })
      .select("timestamp action")
      .lean(),
    User.find(auditorFilter).select("name email").limit(100).lean(),
    // Same filter as totalUsers KPI — used by Scoped Users / Platform Users modal.
    User.find(userFilter)
      .select("name email role status companyId avatar createdAt")
      .populate("companyId", "name domain")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
    // Same filter as totalAuditors KPI — used by Active Assessor / Accredited Auditors modal.
    User.find(auditorFilter)
      .select("name email role status companyId avatar createdAt")
      .populate("companyId", "name domain")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  ]);

  // Compliance score from submitted sessions with scoreSnapshot
  const submittedWithScore = sessionsForScores.filter(
    (s) => s.status === "Submitted" && s.scoreSnapshot?.overallPercentage != null
  );
  const complianceScore =
    submittedWithScore.length > 0
      ? Math.round(
          submittedWithScore.reduce(
            (sum, s) => sum + (s.scoreSnapshot?.overallPercentage || 0),
            0
          ) / submittedWithScore.length
        )
      : 0;

  const prevSubmittedWithScore = submittedWithScore.filter((s) => {
    const t = s.submittedAt || s.updatedAt || s.createdAt;
    return t && new Date(t) < periodStart;
  });
  const prevCompliance =
    prevSubmittedWithScore.length > 0
      ? Math.round(
          prevSubmittedWithScore.reduce(
            (sum, s) => sum + (s.scoreSnapshot?.overallPercentage || 0),
            0
          ) / prevSubmittedWithScore.length
        )
      : 0;

  // Open risks from exception-noted answers
  const riskBuckets = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const s of sessionsForScores) {
    for (const a of s.answers || []) {
      if (
        a.exceptionStatus === "ExceptionNoted" ||
        a.selectedOptionCode === "EXCEPTION_NOTED"
      ) {
        const sev = classifySeverity(a.scoreValue, a.evidenceNotes);
        riskBuckets[sev]++;
      }
    }
  }
  const openRisks =
    riskBuckets.Critical + riskBuckets.High + riskBuckets.Medium + riskBuckets.Low;

  // Period deltas for KPIs
  const usersDelta = pctDelta(totalUsers, prevUsers);
  const auditorsDelta = pctDelta(totalAuditors, prevAuditors);
  const orgsDelta = pctDelta(totalOrganizations, prevOrganizations);
  const assessmentsDelta = pctDelta(totalAssessments, prevAssessments);
  const complianceDelta = pctDelta(complianceScore, prevCompliance || complianceScore);

  // Risks in previous period (approx: sessions updated before periodStart)
  let prevRisks = 0;
  for (const s of sessionsForScores) {
    const t = s.updatedAt || s.createdAt;
    if (!t || new Date(t) >= periodStart) continue;
    for (const a of s.answers || []) {
      if (
        a.exceptionStatus === "ExceptionNoted" ||
        a.selectedOptionCode === "EXCEPTION_NOTED"
      ) {
        prevRisks++;
      }
    }
  }
  const risksDelta = pctDelta(openRisks, prevRisks);

  // Compliance trend (daily avg of submitted overallPercentage)
  const complianceByDay = new Map<string, { sum: number; n: number }>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(periodStart.getTime() + i * 24 * 60 * 60 * 1000);
    complianceByDay.set(dayKey(d), { sum: 0, n: 0 });
  }
  for (const s of submittedWithScore) {
    const t = s.submittedAt || s.updatedAt || s.createdAt;
    if (!t) continue;
    const key = dayKey(new Date(t));
    const bucket = complianceByDay.get(key);
    if (!bucket) continue;
    bucket.sum += s.scoreSnapshot?.overallPercentage || 0;
    bucket.n += 1;
  }
  let running = complianceScore || 0;
  const complianceTrend = Array.from(complianceByDay.entries()).map(([date, v]) => {
    if (v.n > 0) running = Math.round(v.sum / v.n);
    return { date, value: running };
  });

  // Security events timeline
  const eventsByDay = new Map<string, number>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(periodStart.getTime() + i * 24 * 60 * 60 * 1000);
    eventsByDay.set(dayKey(d), 0);
  }
  for (const log of auditLogsInPeriod) {
    const key = dayKey(new Date(log.timestamp));
    if (eventsByDay.has(key)) {
      eventsByDay.set(key, (eventsByDay.get(key) || 0) + 1);
    }
  }
  const securityEventsTrend = Array.from(eventsByDay.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  // Organization growth (last 6 months cumulative)
  const growthMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    growthMonths.push(monthKey(d));
  }
  const orgGrowth = growthMonths.map((m) => {
    const count = orgsCreatedAll.filter((c) => {
      const created = c.createdAt ? monthKey(new Date(c.createdAt)) : null;
      return created && created <= m;
    }).length;
    return { month: m, count };
  });

  // Subscription distribution
  let bronze = 0;
  let silver = 0;
  let gold = 0;
  for (const c of companies) {
    const plan = c.activePlan || "Bronze";
    if (plan === "Gold") gold++;
    else if (plan === "Silver") silver++;
    else bronze++;
  }

  // Pillar compliance (from answers across sessions)
  const pillarStats = CANONICAL_PILLARS.map((p) => ({
    key: p.key,
    name: p.name,
    complete: 0,
    total: 0,
  }));
  for (const s of sessionsForScores) {
    for (const a of s.answers || []) {
      if (a.pillarId === "ai-landscape" || a.pillarNumber === 0) continue;
      const matched = CANONICAL_PILLARS.find(
        (p) =>
          p.pillarId === a.pillarId ||
          p.key.toLowerCase() === (a.pillarId || "").toLowerCase()
      );
      if (!matched) continue;
      const bucket = pillarStats.find((x) => x.key === matched.key)!;
      bucket.total++;
      const answered =
        a.testStatus === "Complete" ||
        !!a.selectedOptionCode ||
        a.exceptionStatus === "NoExceptionNoted" ||
        a.exceptionStatus === "ExceptionNoted";
      if (answered) bucket.complete++;
    }
  }
  const complianceByPillar = pillarStats.map((p) => ({
    key: p.key,
    name: p.name,
    percentage: p.total > 0 ? Math.round((p.complete / p.total) * 100) : 0,
  }));

  // Per-organization session rollups (done / pending / exceptions / pillars)
  type OrgAggRow = {
    name: string;
    assessments: number;
    done: number;
    pending: number;
    scoreSum: number;
    scored: number;
    plan: string;
    status: string;
    exceptions: number;
    pillars: Map<string, { name: string; complete: number; total: number; exceptions: number }>;
  };
  const orgAgg = new Map<string, OrgAggRow>();
  for (const s of sessionsForScores) {
    const org = s.companyId as {
      _id?: Types.ObjectId;
      name?: string;
      activePlan?: string;
      status?: string;
    } | null;
    const id = org?._id?.toString() || String(s.companyId);
    if (!id) continue;
    if (!orgAgg.has(id)) {
      orgAgg.set(id, {
        name: org?.name || "Organization",
        assessments: 0,
        done: 0,
        pending: 0,
        scoreSum: 0,
        scored: 0,
        plan: org?.activePlan || "Bronze",
        status: org?.status || "Active",
        exceptions: 0,
        pillars: new Map(),
      });
    }
    const row = orgAgg.get(id)!;
    row.assessments++;
    if (s.status === "Submitted") row.done++;
    else row.pending++;
    if (s.scoreSnapshot?.overallPercentage != null) {
      row.scoreSum += s.scoreSnapshot.overallPercentage;
      row.scored++;
    }
    for (const a of s.answers || []) {
      const isException =
        a.exceptionStatus === "ExceptionNoted" || a.selectedOptionCode === "EXCEPTION_NOTED";
      if (isException) row.exceptions++;
      if (a.pillarId === "ai-landscape" || a.pillarNumber === 0) continue;
      const matched = CANONICAL_PILLARS.find(
        (p) =>
          p.pillarId === a.pillarId ||
          p.key.toLowerCase() === (a.pillarId || "").toLowerCase()
      );
      if (!matched) continue;
      if (!row.pillars.has(matched.key)) {
        row.pillars.set(matched.key, {
          name: matched.name,
          complete: 0,
          total: 0,
          exceptions: 0,
        });
      }
      const pillar = row.pillars.get(matched.key)!;
      pillar.total++;
      if (isException) pillar.exceptions++;
      const answered =
        a.testStatus === "Complete" ||
        !!a.selectedOptionCode ||
        a.exceptionStatus === "NoExceptionNoted" ||
        a.exceptionStatus === "ExceptionNoted";
      if (answered) pillar.complete++;
    }
  }

  const companyIds = companies.map((c) => c._id);
  const tenantIds = [
    ...new Set(
      companies
        .map((c) => (c.tenantId ? String(c.tenantId) : null))
        .filter((id): id is string => !!id)
    ),
  ];

  const [customerCounts, tenants] = await Promise.all([
    companyIds.length
      ? User.aggregate<{ _id: Types.ObjectId; count: number }>([
          {
            $match: {
              companyId: { $in: companyIds },
              role: { $nin: ["SuperAdmin"] },
            },
          },
          { $group: { _id: "$companyId", count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
    tenantIds.length
      ? Tenant.find({ _id: { $in: tenantIds } }).select("name status").lean()
      : Promise.resolve([]),
  ]);

  const customersByCompany = new Map(
    customerCounts.map((r) => [String(r._id), r.count] as const)
  );
  const tenantById = new Map(
    tenants.map((t) => [String(t._id), { name: t.name, status: t.status }] as const)
  );
  const companiesPerTenant = new Map<string, number>();
  for (const c of companies) {
    if (!c.tenantId) continue;
    const tid = String(c.tenantId);
    companiesPerTenant.set(tid, (companiesPerTenant.get(tid) || 0) + 1);
  }

  const linkedClients = companies.filter((c) => !!c.tenantId).length;
  const standaloneOrganizations = companies.length - linkedClients;
  const clientOrganizationSplit = {
    clients: linkedClients,
    organizations: standaloneOrganizations,
    totalAccounts: companies.length,
    uniqueTenants: tenantIds.length,
    totalCustomers: Array.from(customersByCompany.values()).reduce((s, n) => s + n, 0),
  };

  const organizationAccounts = companies
    .map((c) => {
      const id = String(c._id);
      const stats = orgAgg.get(id);
      const tenantId = c.tenantId ? String(c.tenantId) : null;
      const tenantMeta = tenantId ? tenantById.get(tenantId) : undefined;
      const accountType = tenantId ? ("Client" as const) : ("Organization" as const);
      const pillarWise = CANONICAL_PILLARS.map((p) => {
        const bucket = stats?.pillars.get(p.key);
        return {
          key: p.key,
          name: p.name,
          percentage:
            bucket && bucket.total > 0
              ? Math.round((bucket.complete / bucket.total) * 100)
              : 0,
          exceptions: bucket?.exceptions || 0,
        };
      });
      return {
        _id: id,
        name: c.name,
        domain: c.domain || "",
        industry: c.industry || "",
        accountType,
        tenantId,
        tenantName: tenantMeta?.name || null,
        tenantStatus: tenantMeta?.status || null,
        tenantsCount: tenantId ? companiesPerTenant.get(tenantId) || 1 : 0,
        customersCount: customersByCompany.get(id) || 0,
        assessmentsDone: stats?.done || 0,
        assessmentsPending: stats?.pending || 0,
        assessmentVolume: stats?.assessments || 0,
        exceptionsVolume: stats?.exceptions || 0,
        complianceScore:
          stats && stats.scored > 0 ? Math.round(stats.scoreSum / stats.scored) : 0,
        activePlan: c.activePlan || "Bronze",
        status: c.status || "Active",
        verificationStatus: c.verificationStatus || "Pending",
        pillarWise,
      };
    })
    .sort(
      (a, b) =>
        b.assessmentVolume - a.assessmentVolume ||
        b.complianceScore - a.complianceScore ||
        a.name.localeCompare(b.name)
    );

  const topOrganizations = organizationAccounts
    .map((row) => ({
      _id: row._id,
      name: row.name,
      assessmentCount: row.assessmentVolume,
      complianceScore: row.complianceScore,
      activePlan: row.activePlan,
      status: row.status,
    }))
    .sort((a, b) => b.complianceScore - a.complianceScore || b.assessmentCount - a.assessmentCount)
    .slice(0, 5);

  // Auditor performance (full list for modal pagination; charts slice on the client)
  const auditorAgg = new Map<
    string,
    { id: string; name: string; email: string; assigned: number; completed: number; pending: number }
  >();
  for (const a of auditors) {
    auditorAgg.set(String(a._id), {
      id: String(a._id),
      name: a.name || "Auditor",
      email: a.email || "",
      assigned: 0,
      completed: 0,
      pending: 0,
    });
  }
  for (const s of sessionsForScores) {
    const auditor = s.conductedByUserId as {
      _id?: Types.ObjectId;
      name?: string;
      email?: string;
    } | null;
    const id = auditor?._id?.toString();
    if (!id) continue;
    if (!auditorAgg.has(id)) {
      auditorAgg.set(id, {
        id,
        name: auditor?.name || "Auditor",
        email: auditor?.email || "",
        assigned: 0,
        completed: 0,
        pending: 0,
      });
    }
    const row = auditorAgg.get(id)!;
    row.assigned++;
    if (s.status === "Submitted") row.completed++;
    else row.pending++;
  }
  const auditorPerformance = Array.from(auditorAgg.values())
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      assigned: row.assigned,
      completed: row.completed,
      pending: row.pending,
      completionRate: row.assigned > 0 ? Math.round((row.completed / row.assigned) * 100) : 0,
    }))
    .sort((a, b) => b.completionRate - a.completionRate || b.assigned - a.assigned);

  const recentOrganizations = [...companies]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 6)
    .map((c) => {
      const id = String(c._id);
      const stats = orgAgg.get(id);
      return {
        _id: id,
        name: c.name,
        activePlan: c.activePlan || "Bronze",
        assessmentCount: stats?.assessments || 0,
        status: c.status || "Active",
      };
    });

  const recentActivity = recentLogs.map((log) => ({
    id: String(log._id),
    title: String(log.action || "").replace(/_/g, " "),
    description: `${log.actorEmail || "system"} · ${log.entity || "Entity"}`,
    type: log.action,
    actorEmail: log.actorEmail,
    timestamp: log.timestamp,
  }));

  const pipelineTotal = totalAssessments || 1;
  const assessmentPipeline = {
    completed: submittedCount,
    inProgress: inProgressCount,
    notStarted: Math.max(0, notStartedCount),
    completedPct: Math.round((submittedCount / pipelineTotal) * 100),
    inProgressPct: Math.round((inProgressCount / pipelineTotal) * 100),
    notStartedPct: Math.round(
      (Math.max(0, notStartedCount) / pipelineTotal) * 100
    ),
  };

  let lightAssessments = 0;
  let fullAssessments = 0;
  for (const s of sessionsForScores) {
    if (s.assessmentType === "Full") fullAssessments++;
    else lightAssessments++;
  }
  const assessmentTypeMix = {
    light: lightAssessments,
    full: fullAssessments,
    total: sessionsForScores.length,
  };

  const outliers: Array<{
    type: "organization" | "auditor" | "risk" | "compliance";
    label: string;
    detail: string;
    severity: "critical" | "high" | "medium";
    value?: number;
    entityId?: string;
  }> = [];

  const orgOutliers: typeof outliers = [];
  for (const [orgId, row] of orgAgg.entries()) {
    const complianceScore = row.scored > 0 ? Math.round(row.scoreSum / row.scored) : 0;
    if (row.assessments > 0 && complianceScore < 55) {
      orgOutliers.push({
        type: "organization",
        label: row.name,
        detail: `${row.assessments} assessment session(s) · avg maturity ${complianceScore}%`,
        severity: complianceScore < 35 ? "critical" : "high",
        value: complianceScore,
        entityId: orgId,
      });
    }
  }
  orgOutliers.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  outliers.push(...orgOutliers.slice(0, 6));

  for (const a of auditorPerformance) {
    if (a.assigned >= 2 && a.completionRate < 50) {
      outliers.push({
        type: "auditor",
        label: a.name,
        detail: `Completion rate ${a.completionRate}% (${a.completed}/${a.assigned} assessments)`,
        severity: a.completionRate < 25 ? "critical" : "high",
        value: a.completionRate,
        entityId: a.id,
      });
    }
  }

  if (riskBuckets.Critical > 0) {
    outliers.push({
      type: "risk",
      label: "Critical exceptions",
      detail: `${riskBuckets.Critical} critical open finding(s) in scope`,
      severity: "critical",
      value: riskBuckets.Critical,
    });
  } else if (riskBuckets.High >= 3) {
    outliers.push({
      type: "risk",
      label: "Elevated high-severity risks",
      detail: `${riskBuckets.High} high-severity exceptions open`,
      severity: "high",
      value: riskBuckets.High,
    });
  }

  if (complianceTrend.length >= 2) {
    const startVal = complianceTrend[0]?.value ?? complianceScore;
    const endVal = complianceTrend[complianceTrend.length - 1]?.value ?? complianceScore;
    if (endVal < startVal - 8) {
      outliers.push({
        type: "compliance",
        label: "Compliance trend decline",
        detail: `Average maturity dropped from ${startVal}% to ${endVal}% over ${range}`,
        severity: endVal < startVal - 20 ? "critical" : "high",
        value: endVal - startVal,
      });
    }
  }

  if (openRisks > 0 && risksDelta > 15) {
    outliers.push({
      type: "risk",
      label: "Risk volume spike",
      detail: `Open exceptions up ${risksDelta}% vs prior period (${openRisks} total)`,
      severity: risksDelta > 35 ? "critical" : "medium",
      value: openRisks,
    });
  }

  outliers.sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2 };
    return rank[a.severity] - rank[b.severity];
  });

  return {
    range,
    periodDays: days,
    periodStart: periodStart.toISOString(),
    generatedAt: now.toISOString(),
    kpis: {
      totalUsers: {
        value: totalUsers,
        deltaPct: usersDelta,
        hint: `${usersCreatedInPeriod} new in period`,
      },
      totalAuditors: {
        value: totalAuditors,
        deltaPct: auditorsDelta,
        hint: "Accredited assessors",
      },
      totalOrganizations: {
        value: totalOrganizations,
        deltaPct: orgsDelta,
        hint: "Client organizations",
      },
      totalAssessments: {
        value: totalAssessments,
        deltaPct: assessmentsDelta,
        hint: "All assessment sessions",
      },
      complianceScore: {
        value: complianceScore,
        deltaPct: complianceDelta,
        hint: "Avg submitted maturity %",
        suffix: "%",
      },
      openRisks: {
        value: openRisks,
        deltaPct: risksDelta,
        hint: "Open exceptions / findings",
        outlier: openRisks > 0 && risksDelta >= 0,
      },
    },
    assessmentsByStatus: {
      total: totalAssessments,
      completed: submittedCount,
      inProgress: inProgressCount,
      notStarted: Math.max(0, notStartedCount),
    },
    riskSeverity: {
      total: openRisks,
      critical: riskBuckets.Critical,
      high: riskBuckets.High,
      medium: riskBuckets.Medium,
      low: riskBuckets.Low,
    },
    complianceTrend,
    securityEventsTrend,
    organizationGrowth: orgGrowth,
    subscriptionDistribution: {
      total: companies.length,
      bronze,
      silver,
      gold,
    },
    complianceByPillar,
    topOrganizations,
    organizationAccounts,
    clientOrganizationSplit,
    auditorPerformance,
    assessmentPipeline,
    recentOrganizations,
    recentActivity,
    assessmentTypeMix,
    outliers: outliers.slice(0, 12),
    kpiDirectories: {
      users: (scopedUsersDirectory || []).map((u) => ({
        _id: String(u._id),
        name: u.name || "",
        email: u.email || "",
        role: u.role || "",
        status: u.status || "Active",
        companyName:
          u.companyId && typeof u.companyId === "object" && "name" in u.companyId
            ? String((u.companyId as { name?: string }).name || "")
            : "",
        avatarUrl:
          u.avatar && typeof u.avatar === "object" && "url" in u.avatar
            ? String((u.avatar as { url?: string }).url || "")
            : undefined,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : undefined,
      })),
      auditors: (scopedAuditorsDirectory || []).map((u) => ({
        _id: String(u._id),
        name: u.name || "",
        email: u.email || "",
        role: u.role || "",
        status: u.status || "Active",
        companyName:
          u.companyId && typeof u.companyId === "object" && "name" in u.companyId
            ? String((u.companyId as { name?: string }).name || "")
            : "",
        avatarUrl:
          u.avatar && typeof u.avatar === "object" && "url" in u.avatar
            ? String((u.avatar as { url?: string }).url || "")
            : undefined,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : undefined,
      })),
    },
  };
}

export type DashboardAnalyticsPayload = Awaited<ReturnType<typeof buildDashboardAnalytics>>;
