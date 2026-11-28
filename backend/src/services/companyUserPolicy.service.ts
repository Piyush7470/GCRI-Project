import { Types } from "mongoose";
import { Company } from "../models/Company.js";

/**
 * Organizations in Suspended status must not receive new users or assessor mappings.
 */
export async function assertCompanyAllowsUserAssignment(
  companyId?: string | Types.ObjectId | null
): Promise<void> {
  if (!companyId) return;

  const company = await Company.findById(companyId).select("status name");
  if (!company) {
    const err = new Error("Organization not found.") as Error & { statusCode?: number; code?: string };
    err.statusCode = 404;
    err.code = "ORGANIZATION_NOT_FOUND";
    throw err;
  }

  if (company.status === "Suspended") {
    const err = new Error(
      `Organization "${company.name}" is suspended. New users cannot be added or assigned until it is reactivated.`
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 403;
    err.code = "ORGANIZATION_SUSPENDED";
    throw err;
  }
}