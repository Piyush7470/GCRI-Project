/**
 * Canonical user-facing terminology (UI copy only — API/DB may still use legacy `Auditor`).
 */
export const TERMS = {
  clientOrganization: "Client organization",
  clientOrganizations: "Client organizations",
  assessor: "Assessor",
  assessors: "Assessors",
  accreditedAssessors: "Accredited assessors",
  assessorMappings: "Assessor mappings",
  assignedAssessors: "Assigned assessors",
  tenantWorkspace: "Tenant workspace",
} as const;

export function displayUserRole(role?: string | null): string {
  if (!role) return "User";
  switch (role) {
    case "SuperAdmin":
      return "Super Admin";
    case "TenantAdmin":
    case "Admin":
      return "Tenant Admin";
    case "Assessor":
    case "Auditor":
    case "MembershipApprover":
      return TERMS.assessor;
    default:
      return role;
  }
}