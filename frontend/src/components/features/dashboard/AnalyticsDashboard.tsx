"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  FileCheck2,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Minus,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalyticsRange, DashboardAnalytics } from "@/types/analytics.types";
import {
  downloadAdminDashboardExport,
  downloadAuditorDashboardExport,
} from "@/lib/dashboardDownloads";
import { getApiErrorMessage } from "@/lib/authUser";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { MetricListModal, MetricListRow } from "@/components/shared/MetricListModal";
import { userService } from "@/services/user.service";

const RANGES: AnalyticsRange[] = ["30d", "90d", "6m", "1y"];

/** Drop subtitle when it only repeats the card title (case-insensitive). */
function kpiCardSubtitle(label: string, hint?: string, fallback?: string): string {
  const text = (hint || fallback || "").trim();
  if (!text) return "";
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  if (norm(text) === norm(label)) return "";
  return text;
}
const STATUS_COLORS = ["#10b981", "#3b82f6", "#94a3b8"];
const RISK_COLORS = ["#e11d48", "#f97316", "#eab308", "#22c55e"];
const PLAN_COLORS = ["#b45309", "#64748b", "#ca8a04"];
const PILLAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#14b8a6", "#f43f5e"];

function formatShortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short" });
}

type KpiTileMetricKey =
  | "users"
  | "auditors"
  | "orgs"
  | "assessments"
  | "compliance"
  | "risks";

type OutlierItem = NonNullable<DashboardAnalytics["outliers"]>[number];

const OUTLIER_TYPE_LABEL: Record<OutlierItem["type"], string> = {
  organization: "Client organization",
  auditor: "Assessor",
  risk: "Risk",
  compliance: "Compliance",
};

const SEVERITY_RANK: Record<OutlierItem["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

const INSIGHTS_VISIBLE_MAX = 5;

function displayOutlierLabel(label: string) {
  const trimmed = label.replace(/\s*\d{10,}\s*$/, "").trim();
  return trimmed || label;
}

function outlierSummaryLine(o: OutlierItem) {
  if (typeof o.value === "number" && (o.type === "organization" || o.type === "auditor")) {
    return `${o.value}%`;
  }
  const short = o.detail.split("·")[0]?.trim() || o.detail;
  return short.length > 48 ? `${short.slice(0, 45)}…` : short;
}

function severityDotClass(severity: OutlierItem["severity"]) {
  if (severity === "critical") return "bg-rose-500";
  if (severity === "high") return "bg-amber-500";
  return "bg-slate-400";
}

function InsightsOutliersPanel({ outliers }: { outliers: OutlierItem[] }) {
  const visible = useMemo(
    () =>
      [...outliers]
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
        .slice(0, INSIGHTS_VISIBLE_MAX),
    [outliers]
  );

  if (visible.length === 0) return null;

  const hidden = outliers.length - visible.length;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-xs">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="text-sm font-bold text-slate-900">Insights</h3>
        <span className="text-[10px] font-medium text-slate-500 tabular-nums">
          {outliers.length} flag{outliers.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="space-y-1.5">
        {visible.map((o, idx) => (
          <li
            key={`${o.type}-${o.label}-${idx}`}
            className="flex items-center gap-2 rounded-lg bg-slate-50/80 border border-slate-100 px-2.5 py-2 text-[11px]"
          >
            <span
              className={cn("h-2 w-2 rounded-full shrink-0", severityDotClass(o.severity))}
              title={o.severity}
            />
            <span className="font-semibold text-slate-800 truncate min-w-0 max-w-[38%] sm:max-w-[42%]">
              {displayOutlierLabel(o.label)}
            </span>
            <span className="hidden sm:inline text-[10px] font-medium text-slate-400 uppercase tracking-wide shrink-0">
              {OUTLIER_TYPE_LABEL[o.type]}
            </span>
            <span className="flex-1 text-slate-500 truncate text-right tabular-nums">{outlierSummaryLine(o)}</span>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="text-[10px] text-slate-400 mt-2">+{hidden} more — use dashboard export for the full list.</p>
      )}
    </div>
  );
}

function kpiTileHref(
  key: KpiTileMetricKey,
  { isAuditor, isSuperAdmin }: { isAuditor: boolean; isSuperAdmin: boolean }
): string {
  if (isSuperAdmin) {
    const map: Record<KpiTileMetricKey, string> = {
      users: "/admin/users",
      auditors: "/admin/users",
      orgs: "/admin/tenants",
      assessments: "/admin/audit-logs",
      compliance: "/admin/frameworks",
      risks: "/admin/audit-logs",
    };
    return map[key];
  }
  if (isAuditor) {
    const map: Record<KpiTileMetricKey, string> = {
      users: "/assessments",
      auditors: "/assessments",
      orgs: "/organizations",
      assessments: "/assessments",
      compliance: "/assessments",
      risks: "/assessments",
    };
    return map[key];
  }
  const map: Record<KpiTileMetricKey, string> = {
    users: "/admin/users",
    auditors: "/admin/assessors",
    orgs: "/organizations",
    assessments: "/assessments",
    compliance: "/admin/frameworks",
    risks: "/assessments",
  };
  return map[key];
}

function DeltaBadge({ delta, invert }: { delta: number; invert?: boolean }) {
  const positive = invert ? delta < 0 : delta > 0;
  const negative = invert ? delta > 0 : delta < 0;
  const Icon = delta === 0 ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
        positive && "text-emerald-600",
        negative && "text-rose-600",
        delta === 0 && "text-slate-500"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {delta > 0 ? "+" : ""}
      {delta}%
    </span>
  );
}

function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-5 flex flex-col min-h-[280px]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle ? <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  color,
  meta,
}: {
  label: string;
  value: number;
  color: string;
  meta?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-700 truncate">{label}</span>
        <span className="tabular-nums font-semibold text-slate-900 shrink-0">
          {value}%{meta ? <span className="text-slate-400 font-medium"> · {meta}</span> : null}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export interface AnalyticsDashboardProps {
  data: DashboardAnalytics | null;
  loading?: boolean;
  error?: string | null;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  onRefresh?: () => void;
  title?: string;
  subtitle?: string;
  isAuditor?: boolean;
  analyticsCompanyId?: string;
}

export function AnalyticsDashboard({
  data,
  loading,
  error,
  range,
  onRangeChange,
  onRefresh,
  title = "Platform Operations & Governance",
  subtitle = "Analytics · trends · outliers · operational telemetry",
  isAuditor = false,
  analyticsCompanyId,
}: AnalyticsDashboardProps) {
  const toast = useToast();
  const { isSuperAdmin } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [metricModal, setMetricModal] = useState<
    | null
    | "users"
    | "auditors"
    | "orgs"
    | "assessments"
    | "compliance"
    | "risks"
    | "auditorPerf"
    | "pipeline"
  >(null);
  const [userModalRows, setUserModalRows] = useState<MetricListRow[]>([]);
  const [userModalLoading, setUserModalLoading] = useState(false);

  useEffect(() => {
    if (metricModal !== "users" && metricModal !== "auditors") return;
    let cancelled = false;

    const fromAnalytics =
      metricModal === "auditors"
        ? data?.kpiDirectories?.auditors
        : data?.kpiDirectories?.users;

    // Prefer analytics KPI directories so modal rows match the tile count
    // (especially for auditor "Scoped Users" which /users cannot return).
    if (fromAnalytics && fromAnalytics.length >= 0) {
      setUserModalLoading(false);
      setUserModalRows(
        fromAnalytics.map((u) => ({
          id: u._id,
          title: u.name || u.email,
          subtitle: u.email,
          meta: u.companyName ? `${u.role} · ${u.companyName}` : u.role,
          badge: u.status,
          badgeTone: (u.status === "Active" ? "success" : "warning") as
            | "success"
            | "warning",
          imageUrl: u.avatarUrl,
          imageName: u.name,
          imageVariant: "avatar" as const,
          href: isAuditor ? undefined : "/admin/users",
        }))
      );
      return;
    }

    (async () => {
      setUserModalLoading(true);
      try {
        const res = await userService.getUsers({
          limit: 200,
          ...(metricModal === "auditors" ? { role: "Assessor" } : {}),
          ...(analyticsCompanyId ? { companyId: analyticsCompanyId } : {}),
        });
        const list = Array.isArray(res.data) ? res.data : [];
        if (cancelled) return;
        setUserModalRows(
          list.map((u) => ({
            id: u._id,
            title: u.name || u.email,
            subtitle: u.email,
            meta:
              typeof u.companyId === "object" && u.companyId?.name
                ? `${u.role} · ${u.companyId.name}`
                : u.role,
            badge: u.status,
            badgeTone: u.status === "Active" ? "success" : "warning",
            imageUrl: u.avatar?.url,
            imageName: u.name,
            imageVariant: "avatar" as const,
            href: isAuditor ? undefined : "/admin/users",
          }))
        );
      } catch (err) {
        if (!cancelled) {
          setUserModalRows([]);
          toast.error(getApiErrorMessage(err, "Could not load users"));
        }
      } finally {
        if (!cancelled) setUserModalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metricModal, analyticsCompanyId, toast, data?.kpiDirectories, isAuditor]);

  const handleExport = async (format: "pdf" | "xlsx") => {
    if (exporting) return;
    setExporting(format);
    setExportOpen(false);
    try {
      if (isAuditor) {
        await downloadAuditorDashboardExport({ format, range });
      } else {
        await downloadAdminDashboardExport({
          format,
          range,
          companyId: analyticsCompanyId,
        });
      }
      toast.success(
        format === "pdf"
          ? "Dashboard analytics PDF downloaded (branded executive pack)."
          : "Dashboard analytics Excel workbook downloaded."
      );
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to export dashboard report."));
    } finally {
      setExporting(null);
    }
  };

  const typeMixBar = useMemo(() => {
    const mix = data?.assessmentTypeMix ?? { light: 0, full: 0, total: 0 };
    return [
      { name: "Light", count: mix.light, fill: "#0ea5e9" },
      { name: "Full", count: mix.full, fill: "#6366f1" },
    ];
  }, [data]);
  const statusPie = useMemo(() => {
    if (!data) return [];
    const s = data.assessmentsByStatus;
    return [
      { name: "Completed", value: s.completed },
      { name: "In Progress", value: s.inProgress },
      { name: "Not Started", value: s.notStarted },
    ].filter((x) => x.value > 0);
  }, [data]);

  const riskPie = useMemo(() => {
    if (!data) return [];
    const r = data.riskSeverity;
    return [
      { name: "Critical", value: r.critical },
      { name: "High", value: r.high },
      { name: "Medium", value: r.medium },
      { name: "Low", value: r.low },
    ].filter((x) => x.value > 0);
  }, [data]);

  const planPie = useMemo(() => {
    if (!data) return [];
    const p = data.subscriptionDistribution;
    return [
      { name: "Bronze", value: p.bronze },
      { name: "Silver", value: p.silver },
      { name: "Gold", value: p.gold },
    ].filter((x) => x.value > 0);
  }, [data]);

  const scopedUserCount =
    data?.kpiDirectories?.users?.length ?? data?.kpis.totalUsers.value ?? 0;
  const scopedAuditorCount =
    data?.kpiDirectories?.auditors?.length ?? data?.kpis.totalAuditors.value ?? 0;
  const scopedOrgCount =
    data?.organizationAccounts?.length ?? data?.kpis.totalOrganizations.value ?? 0;

  const kpiCards = data
    ? [
        {
          key: "users",
          label: isAuditor ? "Scoped Users" : "Total Platform Users",
          kpi: {
            ...data.kpis.totalUsers,
            // Prefer directory length so tile matches popup rows.
            value: data.kpiDirectories?.users
              ? scopedUserCount
              : data.kpis.totalUsers.value,
            hint: isAuditor
              ? `${scopedUserCount} user${scopedUserCount === 1 ? "" : "s"} on assigned orgs`
              : data.kpis.totalUsers.hint || `${data.kpis.totalUsers.value} platform accounts`,
          },
          icon: Users,
          theme: "bg-blue-50 text-blue-700",
        },
        {
          key: "auditors",
          label: isAuditor ? "Active assessor" : "Accredited assessors",
          kpi: {
            ...data.kpis.totalAuditors,
            value: data.kpiDirectories?.auditors
              ? scopedAuditorCount
              : data.kpis.totalAuditors.value,
            hint: isAuditor
              ? `${scopedAuditorCount} assessor${scopedAuditorCount === 1 ? "" : "s"} in scope`
              : data.kpis.totalAuditors.hint || "Assessor & Auditor platform accounts",
          },
          icon: UserCheck,
          theme: "bg-emerald-50 text-emerald-700",
        },
        {
          key: "orgs",
          label: isAuditor ? "Assigned Organizations" : "Client Organizations",
          kpi: {
            ...data.kpis.totalOrganizations,
            value: data.organizationAccounts
              ? scopedOrgCount
              : data.kpis.totalOrganizations.value,
            hint: isAuditor
              ? `${scopedOrgCount} assigned organization${scopedOrgCount === 1 ? "" : "s"}`
              : data.kpis.totalOrganizations.hint || `${scopedOrgCount} in scope`,
          },
          icon: Building2,
          theme: "bg-indigo-50 text-indigo-700",
        },
        {
          key: "assessments",
          label: "Total Assessments",
          kpi: {
            ...data.kpis.totalAssessments,
            hint:
              data.kpis.totalAssessments.hint ||
              `${data.assessmentPipeline.completed} done · ${data.assessmentPipeline.inProgress} in progress · ${data.assessmentPipeline.notStarted} pending`,
          },
          icon: FileCheck2,
          theme: "bg-teal-50 text-teal-700",
        },
        {
          key: "compliance",
          label: "Compliance Score",
          kpi: {
            ...data.kpis.complianceScore,
            hint:
              data.kpis.complianceScore.hint ||
              "Average maturity % across submitted assessments",
          },
          icon: TrendingUp,
          theme: "bg-violet-50 text-violet-700",
        },
        {
          key: "risks",
          label: "Open Security Risks",
          kpi: {
            ...data.kpis.openRisks,
            hint:
              data.kpis.openRisks.hint ||
              `${data.riskSeverity.critical} critical · ${data.riskSeverity.high} high · ${data.riskSeverity.medium} medium · ${data.riskSeverity.low} low`,
          },
          icon: ShieldAlert,
          theme: data.kpis.openRisks.outlier
            ? "bg-rose-50 text-rose-700 ring-1 ring-rose-300"
            : "bg-amber-50 text-amber-800",
          invertDelta: true,
        },
      ]
    : [];

  const orgAccounts = data?.organizationAccounts ?? [];
  const split = data?.clientOrganizationSplit;

  const orgModalRows: MetricListRow[] = orgAccounts.map((org) => {
    const pillarSummary = org.pillarWise
      .filter((p) => p.percentage > 0 || p.exceptions > 0)
      .map((p) => `${p.key} ${p.percentage}%${p.exceptions ? ` · ${p.exceptions} exc` : ""}`)
      .join(" · ");
    return {
      id: org._id,
      title: org.name,
      subtitle: [
        org.accountType,
        org.domain || null,
        org.tenantName ? `Tenant: ${org.tenantName}` : "No tenant link",
        org.activePlan,
      ]
        .filter(Boolean)
        .join(" · "),
      meta: `Customers ${org.customersCount} · Tenants under account ${org.tenantsCount} · Assessments ${org.assessmentsDone} done / ${org.assessmentsPending} pending · Volume ${org.assessmentVolume} · Exceptions ${org.exceptionsVolume} · Compliance ${org.complianceScore}%`,
      details: pillarSummary
        ? [`Pillar-wise: ${pillarSummary}`]
        : ["Pillar-wise: no scored controls yet"],
      badge: org.accountType,
      badgeTone: org.accountType === "Client" ? "info" : "neutral",
      imageName: org.name,
      imageVariant: "logo",
      href: `/organizations/${org._id}`,
    };
  });

  const auditorModalRows: MetricListRow[] = (data?.auditorPerformance ?? []).map((a, idx) => ({
    id: a.id || `${a.email}-${idx}`,
    title: a.name,
    subtitle: a.email,
    meta: `Assigned ${a.assigned} · Completed ${a.completed} · Pending ${a.pending ?? Math.max(0, a.assigned - a.completed)} · Rate ${a.completionRate}%`,
    badge: `${a.completionRate}%`,
    badgeTone:
      a.completionRate >= 70 ? "success" : a.completionRate >= 40 ? "warning" : "danger",
    imageName: a.name,
    imageVariant: "avatar",
    href: "/admin/assessors",
  }));

  const assessmentModalRows: MetricListRow[] = data
    ? [
        {
          id: "pipeline-completed",
          title: "Completed assessments",
          subtitle: `${data.assessmentPipeline.completed} sessions · ${data.assessmentPipeline.completedPct}% of portfolio`,
          badge: "Done",
          badgeTone: "success",
          href: "/assessments",
        },
        {
          id: "pipeline-progress",
          title: "In progress",
          subtitle: `${data.assessmentPipeline.inProgress} sessions · ${data.assessmentPipeline.inProgressPct}%`,
          badge: "Active",
          badgeTone: "info",
          href: "/assessments",
        },
        {
          id: "pipeline-pending",
          title: "Not started / pending",
          subtitle: `${data.assessmentPipeline.notStarted} sessions · ${data.assessmentPipeline.notStartedPct}%`,
          badge: "Pending",
          badgeTone: "warning",
          href: "/assessments",
        },
        {
          id: "type-light",
          title: "Light assessments",
          subtitle: `${data.assessmentTypeMix.light} of ${data.assessmentTypeMix.total} total`,
          badge: "Light",
          badgeTone: "neutral",
          href: "/assessments",
        },
        {
          id: "type-full",
          title: "Full assessments",
          subtitle: `${data.assessmentTypeMix.full} of ${data.assessmentTypeMix.total} total`,
          badge: "Full",
          badgeTone: "info",
          href: "/assessments",
        },
        ...orgAccounts.map((org) => ({
          id: `acct-assess-${org._id}`,
          title: org.name,
          subtitle: `${org.accountType} · ${org.assessmentsDone} done · ${org.assessmentsPending} pending`,
          meta: `Assessment volume ${org.assessmentVolume} · Exceptions ${org.exceptionsVolume}`,
          badge: org.status,
          badgeTone: (org.status === "Active" ? "success" : "warning") as MetricListRow["badgeTone"],
          href: `/organizations/${org._id}`,
        })),
      ]
    : [];

  const complianceModalRows: MetricListRow[] = data
    ? [
        {
          id: "overall-compliance",
          title: "Average submitted maturity",
          subtitle: `${data.kpis.complianceScore.value}% across scored sessions`,
          badge: `${data.kpis.complianceScore.value}%`,
          badgeTone:
            data.kpis.complianceScore.value >= 70
              ? "success"
              : data.kpis.complianceScore.value >= 45
                ? "warning"
                : "danger",
        } satisfies MetricListRow,
        ...data.complianceByPillar.map(
          (p): MetricListRow => ({
            id: `pillar-${p.key}`,
            title: `${p.key} · ${p.name}`,
            subtitle: `Portfolio completion ${p.percentage}%`,
            badge: `${p.percentage}%`,
            badgeTone:
              p.percentage >= 70 ? "success" : p.percentage >= 40 ? "warning" : "danger",
          })
        ),
        ...orgAccounts.map(
          (org): MetricListRow => ({
            id: `acct-comp-${org._id}`,
            title: org.name,
            subtitle: `Account compliance ${org.complianceScore}%`,
            meta: org.pillarWise.map((p) => `${p.key} ${p.percentage}%`).join(" · "),
            badge: org.accountType,
            badgeTone: "info",
            href: `/organizations/${org._id}`,
          })
        ),
      ]
    : [];

  const riskModalRows: MetricListRow[] = data
    ? [
        {
          id: "risk-critical",
          title: "Critical exceptions",
          subtitle: `${data.riskSeverity.critical} open`,
          badge: "Critical",
          badgeTone: "danger",
        },
        {
          id: "risk-high",
          title: "High exceptions",
          subtitle: `${data.riskSeverity.high} open`,
          badge: "High",
          badgeTone: "warning",
        },
        {
          id: "risk-medium",
          title: "Medium exceptions",
          subtitle: `${data.riskSeverity.medium} open`,
          badge: "Medium",
          badgeTone: "neutral",
        },
        {
          id: "risk-low",
          title: "Low exceptions",
          subtitle: `${data.riskSeverity.low} open`,
          badge: "Low",
          badgeTone: "success",
        },
        ...orgAccounts
          .filter((o) => o.exceptionsVolume > 0)
          .map((org) => ({
            id: `acct-risk-${org._id}`,
            title: org.name,
            subtitle: `${org.exceptionsVolume} exception(s) · ${org.accountType}`,
            meta: org.pillarWise
              .filter((p) => p.exceptions > 0)
              .map((p) => `${p.key}: ${p.exceptions}`)
              .join(" · ") || "No pillar-tagged exceptions",
            badge: String(org.exceptionsVolume),
            badgeTone: "danger" as const,
            href: `/organizations/${org._id}`,
          })),
      ]
    : [];

  const openMetric = (
    key:
      | "users"
      | "auditors"
      | "orgs"
      | "assessments"
      | "compliance"
      | "risks"
      | "auditorPerf"
      | "pipeline"
  ) => setMetricModal(key);

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title page-title-lg font-editorial">{title}</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
              Analytics
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r)}
                className={cn(
                  "px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition",
                  range === r
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              disabled={!data || !!exporting}
              onClick={() => setExportOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#102C3A] text-white hover:bg-[#145568] disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              Export report
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
                <button
                  type="button"
                  onClick={() => void handleExport("pdf")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <FileDown className="h-3.5 w-3.5" /> PDF (branded)
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport("xlsx")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel workbook
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : null}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-stretch">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              const modalKey =
                card.key === "users"
                  ? "users"
                  : card.key === "auditors"
                    ? "auditors"
                    : card.key === "orgs"
                      ? "orgs"
                      : card.key === "assessments"
                        ? "assessments"
                        : card.key === "compliance"
                          ? "compliance"
                          : "risks";
              const subtitle = kpiCardSubtitle(
                card.label,
                card.kpi.hint,
                `vs prior ${range}`
              );
              return (
                <Link
                  key={card.key}
                  href={kpiTileHref(modalKey, {
                    isAuditor,
                    isSuperAdmin: Boolean(isSuperAdmin),
                  })}
                  className={cn(
                    "flex h-full flex-col rounded-2xl border-2 border-slate-300 bg-white p-3.5 shadow-xs text-left transition hover:border-teal-500 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
                    card.kpi.outlier && "border-rose-400 shadow-[0_0_0_1px_rgba(244,63,94,0.12)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center border border-slate-200/80", card.theme)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <DeltaBadge delta={card.kpi.deltaPct} invert={card.invertDelta} />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mt-3">
                    {card.label}
                  </p>
                  <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5 tracking-tight">
                    {card.kpi.value}
                    {card.kpi.suffix || ""}
                  </p>
                  <div className="mt-1 min-h-[2.25rem] flex-1">
                    {subtitle ? (
                      <p className="text-[10px] text-slate-600 line-clamp-2 font-medium">{subtitle}</p>
                    ) : null}
                  </div>
                  <p className="text-[10px] font-bold text-teal-700 pt-1.5 leading-none">Open module →</p>
                </Link>
              );
            })}
          </div>

          {(data.outliers ?? []).length > 0 && (
            <InsightsOutliersPanel outliers={data.outliers} />
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <ChartCard
              className="xl:col-span-6"
              title="Compliance Performance Trend"
              subtitle={`Average submitted maturity · last ${data.periodDays} days`}
              action={
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                  {data.kpis.complianceScore.value}%
                </span>
              }
            >
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.complianceTrend}>
                    <defs>
                      <linearGradient id="complianceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      minTickGap={28}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} width={32} />
                    <Tooltip
                      labelFormatter={(v) => formatShortDate(String(v))}
                      formatter={(v) => [`${v}%`, "Compliance"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#4f46e5"
                      strokeWidth={2.5}
                      fill="url(#complianceFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              className="xl:col-span-3"
              title="Assessment Status"
              subtitle={`${data.assessmentsByStatus.total} total sessions`}
            >
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {statusPie.map((_, i) => (
                        <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-1">
                {[
                  ["Completed", data.assessmentsByStatus.completed, STATUS_COLORS[0]],
                  ["In Progress", data.assessmentsByStatus.inProgress, STATUS_COLORS[1]],
                  ["Not Started", data.assessmentsByStatus.notStarted, STATUS_COLORS[2]],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="flex items-center justify-between text-[11px]">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="h-2 w-2 rounded-full" style={{ background: String(color) }} />
                      {label}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-900">{value as number}</span>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard
              className="xl:col-span-3"
              title="Risk Severity Distribution"
              subtitle={`${data.riskSeverity.total} open exceptions`}
            >
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskPie.length ? riskPie : [{ name: "None", value: 1 }]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {(riskPie.length ? riskPie : [{ name: "None", value: 1 }]).map((_, i) => (
                        <Cell
                          key={i}
                          fill={riskPie.length ? RISK_COLORS[i % RISK_COLORS.length] : "#e2e8f0"}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {[
                  ["Critical", data.riskSeverity.critical, RISK_COLORS[0]],
                  ["High", data.riskSeverity.high, RISK_COLORS[1]],
                  ["Medium", data.riskSeverity.medium, RISK_COLORS[2]],
                  ["Low", data.riskSeverity.low, RISK_COLORS[3]],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="flex items-center justify-between text-[11px] px-1.5 py-1 rounded-lg bg-slate-50">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: String(color) }} />
                      {label}
                    </span>
                    <span className="font-bold tabular-nums">{value as number}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <ChartCard
              className="xl:col-span-4"
              title="Security Events Timeline"
              subtitle="Audit trail volume over the selected period"
            >
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.securityEventsTrend}>
                    <defs>
                      <linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      minTickGap={28}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} width={28} />
                    <Tooltip labelFormatter={(v) => formatShortDate(String(v))} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      fill="url(#eventsFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              className="xl:col-span-4"
              title="Organization Growth"
              subtitle="Cumulative tenant growth (6 months)"
            >
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.organizationGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={formatMonth}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} width={28} />
                    <Tooltip labelFormatter={(v) => formatMonth(String(v))} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#059669" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              className="xl:col-span-2"
              title="Assessment type mix"
              subtitle={`${data.assessmentTypeMix?.total ?? 0} sessions in scope`}
            >
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeMixBar} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="name" width={44} tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {typeMixBar.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              className="xl:col-span-2"
              title="SaaS plans"
              subtitle={`${data.subscriptionDistribution.total} tenants`}
            >
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={planPie.length ? planPie : [{ name: "None", value: 1 }]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={36}
                      outerRadius={52}
                      paddingAngle={2}
                    >
                      {(planPie.length ? planPie : [{ name: "None", value: 1 }]).map((_, i) => (
                        <Cell
                          key={i}
                          fill={planPie.length ? PLAN_COLORS[i % PLAN_COLORS.length] : "#e2e8f0"}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 mt-1">
                {[
                  ["Bronze", data.subscriptionDistribution.bronze, PLAN_COLORS[0]],
                  ["Silver", data.subscriptionDistribution.silver, PLAN_COLORS[1]],
                  ["Gold", data.subscriptionDistribution.gold, PLAN_COLORS[2]],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="flex items-center justify-between text-[11px]">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="h-2 w-2 rounded-full" style={{ background: String(color) }} />
                      {label}
                    </span>
                    <span className="font-semibold tabular-nums">{value as number}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <ChartCard
              className="xl:col-span-4"
              title="Compliance by GRAICE Pillar"
              subtitle="Control completion across seven pillars"
            >
              <div className="space-y-3">
                {data.complianceByPillar.map((p, i) => (
                  <ProgressRow
                    key={p.key}
                    label={`${p.key} · ${p.name}`}
                    value={p.percentage}
                    color={PILLAR_COLORS[i % PILLAR_COLORS.length]}
                  />
                ))}
              </div>
            </ChartCard>

            <ChartCard
              className="xl:col-span-4"
              title="Organization Compliance (Top 5)"
              subtitle="Highest maturity scores among tenants"
              action={
                <button
                  type="button"
                  onClick={() => openMetric("orgs")}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  All accounts
                </button>
              }
            >
              <div className="space-y-3">
                {data.topOrganizations.length === 0 ? (
                  <p className="text-xs text-slate-500">No scored organizations yet.</p>
                ) : (
                  data.topOrganizations.map((org) => (
                    <button
                      key={org._id}
                      type="button"
                      onClick={() => openMetric("orgs")}
                      className="space-y-1.5 w-full text-left rounded-lg hover:bg-slate-50 px-1 py-0.5 transition"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{org.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {org.assessmentCount} assessments · {org.activePlan}
                          </p>
                        </div>
                        <span className="font-bold tabular-nums text-slate-900">
                          {org.complianceScore}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${org.complianceScore}%` }}
                        />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ChartCard>

            <ChartCard
              className="xl:col-span-4"
              title="Assessor performance"
              subtitle="Assigned vs completed assessment workload"
              action={
                <button
                  type="button"
                  onClick={() => openMetric("auditorPerf")}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  View all
                </button>
              }
            >
              <div className="space-y-3">
                {data.auditorPerformance.length === 0 ? (
                  <p className="text-xs text-slate-500">No assessor activity yet.</p>
                ) : (
                  data.auditorPerformance.slice(0, 6).map((a) => (
                    <button
                      key={`${a.email}-${a.name}`}
                      type="button"
                      onClick={() => openMetric("auditorPerf")}
                      className="flex items-center gap-3 w-full text-left rounded-xl hover:bg-slate-50 px-1 py-0.5 transition"
                    >
                      <div className="h-8 w-8 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {initials(a.name) || "A"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-800 truncate">{a.name}</p>
                          <span className="text-[11px] font-bold text-emerald-700 tabular-nums">
                            {a.completionRate}%
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-1">
                          {a.completed}/{a.assigned} completed
                          {typeof a.pending === "number" ? ` · ${a.pending} pending` : ""}
                        </p>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${a.completionRate}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <ChartCard
              className="xl:col-span-4"
              title="Assessment Pipeline"
              subtitle="Completion mix across the portfolio"
              action={
                <button
                  type="button"
                  onClick={() => openMetric("pipeline")}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  View details
                </button>
              }
            >
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-slate-700">Overall completion</span>
                    <span className="font-bold text-slate-900">
                      {data.assessmentPipeline.completedPct}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${data.assessmentPipeline.completedPct}%` }}
                    />
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${data.assessmentPipeline.inProgressPct}%` }}
                    />
                    <div
                      className="h-full bg-slate-300"
                      style={{ width: `${data.assessmentPipeline.notStartedPct}%` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openMetric("pipeline")}
                  className="grid grid-cols-3 gap-2 text-center w-full"
                >
                  {[
                    ["Completed", data.assessmentPipeline.completed, "text-emerald-700 bg-emerald-50"],
                    ["In Progress", data.assessmentPipeline.inProgress, "text-blue-700 bg-blue-50"],
                    ["Not Started", data.assessmentPipeline.notStarted, "text-slate-700 bg-slate-50"],
                  ].map(([label, value, tone]) => (
                    <div key={String(label)} className={cn("rounded-xl px-2 py-3", tone)}>
                      <p className="text-lg font-bold tabular-nums">{value as number}</p>
                      <p className="text-[10px] font-semibold">{label}</p>
                    </div>
                  ))}
                </button>
              </div>
            </ChartCard>

            <ChartCard
              className="xl:col-span-4"
              title="Recent Client Organizations"
              subtitle="Newest tenants in scope"
              action={
                <Link href="/organizations" className="text-[11px] font-semibold text-indigo-600 hover:underline">
                  View all
                </Link>
              }
            >
              <div className="space-y-2">
                {data.recentOrganizations.map((org) => (
                  <div
                    key={org._id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{org.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {org.activePlan} · {org.assessmentCount} assessments
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        org.status === "Active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-800"
                      )}
                    >
                      {org.status}
                    </span>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard
              className="xl:col-span-4"
              title="Recent Security Audit Trail"
              subtitle="Latest non-denied platform events"
              action={
                !isAuditor ? (
                  <Link
                    href="/admin/audit-logs"
                    className="text-[11px] font-semibold text-indigo-600 hover:underline"
                  >
                    View all
                  </Link>
                ) : null
              }
            >
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {data.recentActivity.map((evt) => (
                  <div key={evt.id} className="rounded-xl border border-slate-100 px-3 py-2.5">
                    <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                      {evt.title}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {evt.actorEmail || evt.description}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {new Date(evt.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <MetricListModal
            open={metricModal === "users" || metricModal === "auditors"}
            onClose={() => setMetricModal(null)}
            title={
              metricModal === "auditors"
                ? isAuditor
                  ? "Active Assessor"
                  : "Accredited assessors"
                : isAuditor
                  ? "Scoped Users"
                  : "Platform Users"
            }
            description={
              userModalLoading
                ? "Loading directory…"
                : isAuditor
                  ? metricModal === "auditors"
                    ? `${userModalRows.length} assessor(s) in your analytics scope`
                    : `${userModalRows.length} user(s) linked to your assigned organizations`
                  : "Paginated directory — open a row for user management"
            }
            rows={userModalRows}
            emptyMessage={userModalLoading ? "Loading…" : "No users found."}
            footerHref={isAuditor ? undefined : "/admin/users"}
            footerLabel={isAuditor ? undefined : "Open Users"}
            size="lg"
          />

          <MetricListModal
            open={metricModal === "orgs"}
            onClose={() => setMetricModal(null)}
            title="Client Organizations"
            description={
              split
                ? `${split.clients} linked clients · ${split.organizations} standalone orgs · ${split.uniqueTenants} tenants · ${split.totalCustomers} customers — per-account customers, tenants, assessments, exceptions, and pillar scores`
                : "Per-account customers, tenants, assessments done/pending, exception volume, and pillar-wise maturity"
            }
            rows={orgModalRows}
            emptyMessage="No client organizations in scope."
            footerHref="/organizations"
            footerLabel="Open Organizations"
            size="xl"
            pageSize={6}
          />

          <MetricListModal
            open={metricModal === "assessments" || metricModal === "pipeline"}
            onClose={() => setMetricModal(null)}
            title={metricModal === "pipeline" ? "Assignment Pipeline" : "Total Assessments"}
            description="Pipeline stages plus per-account assessment volume (done / pending)"
            rows={assessmentModalRows}
            emptyMessage="No assessments in scope."
            footerHref="/assessments"
            footerLabel="Open Assessments"
            size="lg"
          />

          <MetricListModal
            open={metricModal === "compliance"}
            onClose={() => setMetricModal(null)}
            title="Compliance Score"
            description="Portfolio pillar completion and per-account maturity"
            rows={complianceModalRows}
            emptyMessage="No compliance data yet."
            footerHref="/admin/frameworks"
            footerLabel="Open Frameworks"
            size="lg"
          />

          <MetricListModal
            open={metricModal === "risks"}
            onClose={() => setMetricModal(null)}
            title="Open Security Risks"
            description="Severity breakdown and per-account exception volume (pillar-wise where tagged)"
            rows={riskModalRows}
            emptyMessage="No open exceptions in scope."
            footerHref="/assessments"
            footerLabel="Open Assessments"
            size="lg"
          />

          <MetricListModal
            open={metricModal === "auditorPerf"}
            onClose={() => setMetricModal(null)}
            title="Assessor performance"
            description="Assigned vs completed workload for every assessor in scope"
            rows={auditorModalRows}
            emptyMessage="No auditor activity yet."
            footerHref="/admin/assessors"
            footerLabel="Open Assessors"
            size="lg"
          />
        </>
      )}
    </div>
  );
}
