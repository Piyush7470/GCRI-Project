import { Router } from "express";
import {
  assignAuditor,
  getAuditorMappings,
  getAuditorsForOrganization,
  getOrganizationsForAuditor,
  removeAuditorMapping,
} from "../controllers/auditorMapping.controller.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validateRequest } from "../middlewares/validate.js";
import {
  AssignAuditorSchema,
  AuditorParamSchema,
  OrganizationParamSchema,
  MappingIdParamSchema,
} from "../schemas/auditorMapping.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/admin/auditor-mappings:
 *   post:
 *     summary: Assign an Auditor to an Organization
 *     description: Tenant Admin module — maps assessors to client organizations in the active tenant.
 *     tags:
 *       - Auditor Assignments
 *     security:
 *       - BearerAuth: []
 */
router.post(
  "/",
  authenticate,
  authorize("TenantAdmin", "Admin"),
  validateRequest(AssignAuditorSchema),
  assignAuditor
);

/**
 * @openapi
 * /api/v1/admin/auditor-mappings:
 *   get:
 *     summary: List auditor-organization mappings for the active tenant
 *     tags:
 *       - Auditor Assignments
 *     security:
 *       - BearerAuth: []
 */
router.get("/", authenticate, authorize("TenantAdmin", "Admin"), getAuditorMappings);

/**
 * @openapi
 * /api/v1/admin/auditor-mappings/org/{organizationId}:
 *   get:
 *     summary: List all auditors assigned to a specific organization
 *     tags:
 *       - Auditor Assignments
 *     security:
 *       - BearerAuth: []
 */
router.get(
  "/org/:organizationId",
  authenticate,
  authorize("TenantAdmin", "Admin", "Assessor", "Auditor"),
  validateRequest(OrganizationParamSchema),
  getAuditorsForOrganization
);

/**
 * @openapi
 * /api/v1/admin/auditor-mappings/auditor/{auditorId}:
 *   get:
 *     summary: List all organizations assigned to a specific auditor
 *     tags:
 *       - Auditor Assignments
 *     security:
 *       - BearerAuth: []
 */
router.get(
  "/auditor/:auditorId",
  authenticate,
  authorize("TenantAdmin", "Admin", "Assessor", "Auditor"),
  validateRequest(AuditorParamSchema),
  getOrganizationsForAuditor
);

/**
 * @openapi
 * /api/v1/admin/auditor-mappings/{id}:
 *   delete:
 *     summary: Remove/unassign an auditor from an organization
 *     tags:
 *       - Auditor Assignments
 *     security:
 *       - BearerAuth: []
 */
router.delete(
  "/:id",
  authenticate,
  authorize("TenantAdmin", "Admin"),
  validateRequest(MappingIdParamSchema),
  removeAuditorMapping
);

export default router;
