import { apiClient } from "./apiClient";
import type { SearchSelectOption } from "@/components/ui/AsyncSearchSelect";

type ReferenceListResponse = {
  data?: SearchSelectOption[] | string[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages?: number;
    pages?: number;
  };
};

type RefParams = { search?: string; page?: number; limit?: number; role?: string };

function getRef(path: string, params?: RefParams) {
  return apiClient.get<SearchSelectOption[] | string[]>(path, { params });
}

export const referenceService = {
  searchIndustries: (params?: RefParams) => getRef("/reference/industries", params),
  searchCountries: (params?: RefParams) => getRef("/reference/countries", params),
  searchSubscriptionTiers: (params?: RefParams) => getRef("/reference/subscription-tiers", params),
  searchCompanyStatuses: (params?: RefParams) => getRef("/reference/company-statuses", params),
  searchVerificationStatuses: (params?: RefParams) => getRef("/reference/verification-statuses", params),
  searchTenantStatuses: (params?: RefParams) => getRef("/reference/tenant-statuses", params),
  searchUserStatuses: (params?: RefParams) => getRef("/reference/user-statuses", params),
  searchPageSizes: (params?: RefParams) => getRef("/reference/page-sizes", params),
  searchAuditEntities: (params?: RefParams) => getRef("/reference/audit-entities", params),
  searchAuditActions: (params?: RefParams) => getRef("/reference/audit-actions", params),
  searchUserRoles: (params?: RefParams) => getRef("/reference/user-roles", params),
  searchOrganizations: (params?: RefParams) => getRef("/reference/organizations", params),
  searchUsers: (params?: RefParams) => getRef("/reference/users", params),
  searchTenants: (params?: RefParams) => getRef("/reference/tenants", params),
};

export function referenceHasMore(res: ReferenceListResponse | undefined): boolean {
  const p = res?.pagination;
  if (!p) return false;
  const totalPages =
    (p as { totalPages?: number; pages?: number }).totalPages ??
    (p as { pages?: number }).pages ??
    1;
  return p.page < totalPages;
}