export const SUBSCRIPTION_TIERS = ["Bronze", "Silver", "Gold"] as const;
export const COMPANY_STATUSES = ["Active", "Suspended"] as const;
export const VERIFICATION_STATUSES = ["Verified", "Pending", "Rejected"] as const;
export const TENANT_STATUSES = ["Pending", "Active", "Suspended", "Retired"] as const;
export const USER_STATUSES = ["Active", "Deactivated"] as const;
export const AUDITOR_MAPPING_STATUSES = ["Active", "Inactive"] as const;
export const PAGE_SIZE_OPTIONS = ["10", "20", "50", "100"] as const;

export const AUDIT_LOG_ENTITIES = [
  "User",
  "Company",
  "AssessmentSession",
  "AssessmentFramework",
  "AuditorOrganization",
  "ApiKey",
] as const;

export const AUDIT_LOG_ACTIONS = [
  "USER_LOGIN",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "AUTHORIZATION_DENIED",
  "USER_INVITED",
  "COMPANY_CREATED",
  "COMPANY_ONBOARDED",
  "ASSESSMENT_SUBMITTED",
] as const;

export function userRolesForActor(actorRole: string): string[] {
  switch (actorRole) {
    case "SuperAdmin":
      return ["TenantAdmin", "Assessor"];
    case "TenantAdmin":
      return ["Assessor"];
    default:
      return ["Assessor"];
  }
}

export const USER_ROLE_LABELS: Record<string, string> = {
  SuperAdmin: "Super Admin",
  TenantAdmin: "Tenant Admin",
  Admin: "Tenant Admin",
  Assessor: "Assessor",
  Auditor: "Assessor",
  MembershipApprover: "Assessor",
};