import { Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import {
  AuthenticatedRequest,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../types";
import { sendSuccess, sendPaginated } from "../utils/response";
import { validateUUID } from "../utils/validation";

/**
 * Check if user is a superadmin
 */
const checkSuperuser = async (userId: string): Promise<boolean> => {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("superadmin")
    .eq("id", userId)
    .single();

  return data?.superadmin === true;
};

/**
 * GET /api/admin/users
 * List all users (superuser only)
 */
export const listAllUsers = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { page = "1", limit = "50", search } = req.query;

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 100);
  const offset = (pageNum - 1) * limitNum;

  let query = supabaseAdmin
    .from("profiles")
    .select(
      "id, name, email, display_name, title, role, mfa_enabled, last_login, created_at",
      { count: "exact" }
    );

  // Search by name or email
  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limitNum - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`);
  }

  sendPaginated(res, data || [], {
    page: pageNum,
    limit: limitNum,
    total: count || 0,
  });
};

/**
 * GET /api/admin/stats
 * Get system statistics (superuser only)
 */
export const getSystemStats = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  // Get counts from various tables
  const [
    { count: usersCount },
    { count: orgsCount },
    { count: envsCount },
    { count: zonesCount },
    { count: dnsRecordsCount },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("organizations")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("environments")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin.from("zones").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("zone_records")
      .select("*", { count: "exact", head: true }),
  ]);

  // Get recent activity (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { count: recentAuditLogs } = await supabaseAdmin
    .from("audit_logs")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo.toISOString());

  // Get active users (logged in within last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { count: activeUsers } = await supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .gte("last_login", thirtyDaysAgo.toISOString());

  sendSuccess(res, {
    users: {
      total: usersCount || 0,
      active: activeUsers || 0,
    },
    organizations: orgsCount || 0,
    environments: envsCount || 0,
    zones: zonesCount || 0,
    dnsRecords: dnsRecordsCount || 0,
    activity: {
      recentAuditLogs: recentAuditLogs || 0,
    },
    timestamp: new Date().toISOString(),
  });
};

/**
 * GET /api/admin/organizations
 * List all organizations (superuser only)
 */
export const listAllOrganizations = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { page = "1", limit = "50", search } = req.query;

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 100);
  const offset = (pageNum - 1) * limitNum;

  let query = supabaseAdmin
    .from("organizations")
    .select("*, organization_members(count)", { count: "exact" });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limitNum - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch organizations: ${error.message}`);
  }

  sendPaginated(res, data || [], {
    page: pageNum,
    limit: limitNum,
    total: count || 0,
  });
};

/**
 * DELETE /api/admin/users/:id
 * Delete a user (superuser only)
 */
export const deleteUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid user ID");
  }

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  // Prevent self-deletion
  if (id === userId) {
    throw new ValidationError("You cannot delete your own account");
  }

  // Delete user from Supabase Auth
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);

  if (authError) {
    throw new Error(`Failed to delete user: ${authError.message}`);
  }

  sendSuccess(res, { id }, "User deleted successfully");
};

/**
 * PUT /api/admin/users/:id/role
 * Update user role (superuser only)
 */
export const updateUserRole = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { role } = req.body;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid user ID");
  }

  if (!["user", "superuser"].includes(role)) {
    throw new ValidationError('Invalid role. Must be "user" or "superuser"');
  }

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  // Prevent self-demotion from superuser
  if (id === userId && role !== "superuser") {
    throw new ValidationError("You cannot change your own role");
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ role })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update user role: ${error.message}`);
  }

  if (!data) {
    throw new NotFoundError("User not found");
  }

  sendSuccess(res, data, "User role updated successfully");
};

/**
 * GET /api/admin/audit-logs
 * Get all audit logs (superuser only)
 */
export const getAllAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { page = "1", limit = "50", table_name, action } = req.query;

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 100);
  const offset = (pageNum - 1) * limitNum;

  let query = supabaseAdmin.from("audit_logs").select(
    `
      *,
      profiles:user_id(name, email)
    `,
    { count: "exact" }
  );

  if (table_name) {
    query = query.eq("table_name", table_name);
  }

  if (action) {
    query = query.eq("action", action);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limitNum - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  sendPaginated(res, data || [], {
    page: pageNum,
    limit: limitNum,
    total: count || 0,
  });
};

/**
 * PUT /api/admin/users/:id/disable
 * Disable a user (superuser only)
 */
export const disableUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid user ID");
  }

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  // Prevent self-disable
  if (id === userId) {
    throw new ValidationError("You cannot disable your own account");
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ status: "disabled" })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to disable user: ${error.message}`);
  }

  if (!data) {
    throw new NotFoundError("User not found");
  }

  sendSuccess(res, data, "User disabled successfully");
};

/**
 * PUT /api/admin/users/:id/enable
 * Enable a user (superuser only)
 */
export const enableUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid user ID");
  }

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ status: "active" })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to enable user: ${error.message}`);
  }

  if (!data) {
    throw new NotFoundError("User not found");
  }

  sendSuccess(res, data, "User enabled successfully");
};

/**
 * POST /api/admin/users/password-reset
 * Send password reset email (superuser only)
 */
export const sendPasswordResetEmail = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { email } = req.body;

  if (!email) {
    throw new ValidationError("Email is required");
  }

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  // Generate password reset link using Supabase Admin API
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: email,
  });

  if (error) {
    throw new Error(`Failed to generate password reset link: ${error.message}`);
  }

  sendSuccess(res, { email, link: data.properties.action_link }, "Password reset email sent successfully");
};

/**
 * POST /api/admin/organizations
 * Create an organization (superuser only)
 */
export const createOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    throw new ValidationError("Organization name is required");
  }

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create organization: ${error.message}`);
  }

  sendSuccess(res, data, "Organization created successfully", 201);
};

/**
 * PUT /api/admin/organizations/:id/soft-delete
 * Soft delete an organization (superuser only)
 */
export const softDeleteOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid organization ID");
  }

  const isSuperuser = await checkSuperuser(userId);
  if (!isSuperuser) {
    throw new ForbiddenError("This endpoint requires superuser access");
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to soft delete organization: ${error.message}`);
  }

  if (!data) {
    throw new NotFoundError("Organization not found");
  }

  sendSuccess(res, data, "Organization soft deleted successfully");
};
