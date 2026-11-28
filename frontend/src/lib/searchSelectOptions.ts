import type { SearchSelectOption } from "@/components/ui/AsyncSearchSelect";

/** Toolbar / filter dropdowns with an “all” row — paginated locally in AsyncSearchSelect. */
export const orgStatusFilterOptions: SearchSelectOption[] = [
  { value: "all", label: "All statuses" },
  { value: "Active", label: "Active" },
  { value: "Suspended", label: "Suspended" },
];

export const orgVerificationFilterOptions: SearchSelectOption[] = [
  { value: "all", label: "All verification" },
  { value: "Verified", label: "Verified" },
  { value: "Pending", label: "Pending" },
  { value: "Rejected", label: "Rejected" },
];

export const orgTierFilterOptions: SearchSelectOption[] = [
  { value: "all", label: "All tiers" },
  { value: "Gold", label: "Gold" },
  { value: "Silver", label: "Silver" },
  { value: "Bronze", label: "Bronze" },
];

export const userRoleFilterOptions = (includeSuperAdmin: boolean): SearchSelectOption[] => [
  { value: "all", label: "All roles" },
  ...(includeSuperAdmin ? [{ value: "SuperAdmin", label: "Super Admin" }] : []),
  { value: "TenantAdmin", label: "Tenant Admin" },
  { value: "Assessor", label: "Assessor" },
];

export const userStatusFilterOptions: SearchSelectOption[] = [
  { value: "all", label: "All statuses" },
  { value: "Active", label: "Active" },
  { value: "Deactivated", label: "Deactivated" },
];

export const tenantStatusFilterOptions: SearchSelectOption[] = [
  { value: "", label: "All statuses" },
  { value: "Pending", label: "Pending" },
  { value: "Active", label: "Active" },
  { value: "Suspended", label: "Suspended" },
  { value: "Retired", label: "Retired" },
];

export const auditorMappingStatusOptions: SearchSelectOption[] = [
  { value: "All", label: "All statuses" },
  { value: "Active", label: "Active only" },
  { value: "Inactive", label: "Inactive only" },
];

export const noneOrganizationOption: SearchSelectOption = {
  value: "",
  label: "None / independent",
};

export const noneUserScopeOption: SearchSelectOption = {
  value: "",
  label: "None / tenant-scoped",
};

export const allAssessorsFilterOption: SearchSelectOption = {
  value: "all",
  label: "All assessors",
};

export const allOrganizationsFilterOption: SearchSelectOption = {
  value: "all",
  label: "All organizations",
};

export const assessmentStatusFilterOptions: SearchSelectOption[] = [
  { value: "All", label: "All statuses" },
  { value: "InProgress", label: "In progress" },
  { value: "Submitted", label: "Submitted (locked)" },
  { value: "Archived", label: "Archived" },
];

export const assessmentTypeFilterOptions: SearchSelectOption[] = [
  { value: "All", label: "All types" },
  { value: "Light", label: "Light assessment (30 Q)" },
  { value: "Full", label: "Full framework" },
];