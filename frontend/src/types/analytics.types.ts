export type AnalyticsRange = "30d" | "90d" | "6m" | "1y";

export interface AnalyticsKpi {
  value: number;
  deltaPct: number;
  hint?: string;
  suffix?: string;
  outlier?: boolean;
}

export interface OrganizationAccountAnalytics {
  _id: string;
  name: string;
  domain: string;
  industry: string;
  accountType: "Client" | "Organization";
  tenantId: string | null;
  tenantName: string | null;
  tenantStatus: string | null;
  tenantsCount: number;
  customersCount: number;
  assessmentsDone: number;
  assessmentsPending: number;
  assessmentVolume: number;
  exceptionsVolume: number;
  complianceScore: number;
  activePlan: string;
  status: string;
  verificationStatus: string;
  pillarWise: Array<{
    key: string;
    name: string;
    percentage: number;
    exceptions: number;
  }>;
}

export interface DashboardAnalytics {
  range: AnalyticsRange;
  periodDays: number;
  periodStart: string;
  generatedAt: string;
  kpis: {
    totalUsers: AnalyticsKpi;
    totalAuditors: AnalyticsKpi;
    totalOrganizations: AnalyticsKpi;
    totalAssessments: AnalyticsKpi;
    complianceScore: AnalyticsKpi;
    openRisks: AnalyticsKpi;
  };
  assessmentsByStatus: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
  };
  riskSeverity: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  complianceTrend: Array<{ date: string; value: number }>;
  securityEventsTrend: Array<{ date: string; count: number }>;
  organizationGrowth: Array<{ month: string; count: number }>;
  subscriptionDistribution: {
    total: number;
    bronze: number;
    silver: number;
    gold: number;
  };
  complianceByPillar: Array<{ key: string; name: string; percentage: number }>;
  topOrganizations: Array<{
    _id: string;
    name: string;
    assessmentCount: number;
    complianceScore: number;
    activePlan: string;
    status: string;
  }>;
  organizationAccounts?: OrganizationAccountAnalytics[];
  clientOrganizationSplit?: {
    clients: number;
    organizations: number;
    totalAccounts: number;
    uniqueTenants: number;
    totalCustomers: number;
  };
  auditorPerformance: Array<{
    id?: string;
    name: string;
    email: string;
    assigned: number;
    completed: number;
    pending?: number;
    completionRate: number;
  }>;
  /** Directory rows matching totalUsers / totalAuditors KPI filters (for drill-down modals). */
  kpiDirectories?: {
    users: Array<{
      _id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      companyName?: string;
      avatarUrl?: string;
      createdAt?: string;
    }>;
    auditors: Array<{
      _id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      companyName?: string;
      avatarUrl?: string;
      createdAt?: string;
    }>;
  };
  assessmentPipeline: {
    completed: number;
    inProgress: number;
    notStarted: number;
    completedPct: number;
    inProgressPct: number;
    notStartedPct: number;
  };
  recentOrganizations: Array<{
    _id: string;
    name: string;
    activePlan: string;
    assessmentCount: number;
    status: string;
  }>;
  recentActivity: Array<{
    id: string;
    title: string;
    description: string;
    type: string;
    actorEmail?: string;
    timestamp: string;
  }>;
  assessmentTypeMix: {
    light: number;
    full: number;
    total: number;
  };
  outliers: Array<{
    type: "organization" | "auditor" | "risk" | "compliance";
    label: string;
    detail: string;
    severity: "critical" | "high" | "medium";
    value?: number;
  }>;
}
