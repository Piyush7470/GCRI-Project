import { z } from "zod";

export const AdminUserIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ObjectId"),
  }),
});

export const AdminUpdateUserSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ObjectId"),
  }),
  body: z.object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().optional(),
    companyId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Company ObjectId").nullable().optional(),
    // SuperAdmin cannot be assigned here — sole platform role is seed-only
    role: z.enum(["TenantAdmin", "Assessor", "Auditor"]).optional(),
    status: z.enum(["Active", "Deactivated"]).optional(),
  }),
});

export const AdminDirectCreateUserSchema = z.object({
  body: z.object({
    email: z.string().trim().email("Invalid email address").toLowerCase(),
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: z.enum(["TenantAdmin", "Assessor", "Auditor"], {
      message: "Role must be TenantAdmin or Assessor",
    }),
    companyId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid Company ObjectId")
      .optional(),
    tenantId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid tenant ID format")
      .optional(),
  }),
});