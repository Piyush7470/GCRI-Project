import type { SearchSelectOption } from "@/components/ui/AsyncSearchSelect";
import { referenceHasMore, referenceService } from "@/services/reference.service";

function mapPicklist(
  res: Awaited<ReturnType<typeof referenceService.searchIndustries>>
): { items: SearchSelectOption[]; hasMore: boolean } {
  const rows = Array.isArray(res.data) ? res.data : [];
  const items: SearchSelectOption[] = rows.map((row) => {
    if (typeof row === "string") return { value: row, label: row };
    const opt = row as SearchSelectOption;
    return { value: opt.value, label: opt.label };
  });
  return { items, hasMore: referenceHasMore(res) };
}

function makeRefLoader(path: keyof typeof referenceService, extra?: Record<string, string>) {
  return async (params: { search: string; page: number; limit: number }) => {
    const fn = referenceService[path] as (
      p: Record<string, string | number>
    ) => ReturnType<typeof referenceService.searchIndustries>;
    const res = await fn({
      search: params.search,
      page: params.page,
      limit: params.limit,
      ...extra,
    });
    return mapPicklist(res);
  };
}

export const loadIndustryOptions = makeRefLoader("searchIndustries");
export const loadCountryOptions = makeRefLoader("searchCountries");
export const loadSubscriptionTierOptions = makeRefLoader("searchSubscriptionTiers");
export const loadCompanyStatusOptions = makeRefLoader("searchCompanyStatuses");
export const loadVerificationStatusOptions = makeRefLoader("searchVerificationStatuses");
export const loadTenantStatusOptions = makeRefLoader("searchTenantStatuses");
export const loadUserStatusOptions = makeRefLoader("searchUserStatuses");
export const loadPageSizeOptions = makeRefLoader("searchPageSizes");
export const loadAuditEntityOptions = makeRefLoader("searchAuditEntities");
export const loadAuditActionOptions = makeRefLoader("searchAuditActions");
export const loadUserRoleOptions = makeRefLoader("searchUserRoles");
export const loadOrganizationPicklist = makeRefLoader("searchOrganizations");

export function loadUserPicklist(role?: string) {
  return makeRefLoader("searchUsers", role && role !== "all" ? { role } : undefined);
}

export const loadTenantPicklist = makeRefLoader("searchTenants");