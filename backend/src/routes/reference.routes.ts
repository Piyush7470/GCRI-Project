import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import {
  getReferenceAuditActions,
  getReferenceAuditEntities,
  getReferenceCompanyStatuses,
  getReferenceCountries,
  getReferenceIndustries,
  getReferenceOrganizations,
  getReferencePageSizes,
  getReferenceSubscriptionTiers,
  getReferenceTenantStatuses,
  getReferenceTenants,
  getReferenceUserRoles,
  getReferenceUsers,
  getReferenceUserStatuses,
  getReferenceVerificationStatuses,
} from "../controllers/reference.controller.js";

const router = Router();

router.get("/industries", authenticate, getReferenceIndustries);
router.get("/countries", authenticate, getReferenceCountries);
router.get("/subscription-tiers", authenticate, getReferenceSubscriptionTiers);
router.get("/company-statuses", authenticate, getReferenceCompanyStatuses);
router.get("/verification-statuses", authenticate, getReferenceVerificationStatuses);
router.get("/tenant-statuses", authenticate, getReferenceTenantStatuses);
router.get("/user-statuses", authenticate, getReferenceUserStatuses);
router.get("/page-sizes", authenticate, getReferencePageSizes);
router.get("/audit-entities", authenticate, getReferenceAuditEntities);
router.get("/audit-actions", authenticate, getReferenceAuditActions);
router.get("/user-roles", authenticate, getReferenceUserRoles);
router.get("/organizations", authenticate, getReferenceOrganizations);
router.get("/users", authenticate, getReferenceUsers);
router.get("/tenants", authenticate, getReferenceTenants);

export default router;