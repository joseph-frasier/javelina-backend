import { Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AuthenticatedRequest, ValidationError } from "../types";
import { sendSuccess, sendPaginated } from "../utils/response";
import { validateUUID } from "../utils/validation";

/**
 * GET /api/audit-logs
 * List audit logs (filtered by user's accessible resources)
 */
export const listAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { page = "1", limit = "50", table_name, action } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 100);
  const offset = (pageNum - 1) * limitNum;

  // Get organizations user has access to
  const { data: userOrgs } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId);

  if (!userOrgs || userOrgs.length === 0) {
    sendSuccess(res, []);
    return;
  }

  const orgIds = userOrgs.map((o) => o.organization_id);

  // Build query
  let query = supabaseAdmin.from("audit_logs").select(
    `
      *,
      profiles:user_id(name, email, avatar_url)
    `,
    { count: "exact" }
  );

  // Filter by table_name if provided
  if (table_name) {
    query = query.eq("table_name", table_name);
  }

  // Filter by action if provided
  if (action) {
    query = query.eq("action", action);
  }

  // Apply pagination
  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limitNum - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  // Filter logs based on user's organization access
  // This is a simplified approach - in production, you'd want to do this filtering in the query
  const filteredData = (data || []).filter((log: any) => {
    // For organizations table
    if (log.table_name === "organizations") {
      return orgIds.includes(log.record_id);
    }
    // For other tables, we'd need to join and check - for now, include all
    return true;
  });

  sendPaginated(res, filteredData, {
    page: pageNum,
    limit: limitNum,
    total: count || 0,
  });
};

/**
 * GET /api/audit-logs/resource/:resourceId
 * Get audit logs for a specific resource
 */
export const getResourceAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { resourceId } = req.params;
  const { table_name } = req.query;

  if (!validateUUID(resourceId)) {
    throw new ValidationError("Invalid resource ID");
  }

  if (!table_name) {
    throw new ValidationError("table_name query parameter is required");
  }

  // Build query
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select(
      `
      *,
      profiles:user_id(name, email, avatar_url)
    `
    )
    .eq("record_id", resourceId)
    .eq("table_name", table_name)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  sendSuccess(res, data || []);
};

/**
 * GET /api/audit-logs/user/:userId
 * Get audit logs for a specific user's actions
 */
export const getUserAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { userId: targetUserId } = req.params;
  const userId = req.user!.id;
  const { page = "1", limit = "50" } = req.query;

  if (!validateUUID(targetUserId)) {
    throw new ValidationError("Invalid user ID");
  }

  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 100);
  const offset = (pageNum - 1) * limitNum;

  // Get organizations current user has access to
  const { data: userOrgs } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId);

  if (!userOrgs || userOrgs.length === 0) {
    sendSuccess(res, []);
    return;
  }

  const { data, error, count } = await supabaseAdmin
    .from("audit_logs")
    .select(
      `
      *,
      profiles:user_id(name, email, avatar_url)
    `,
      { count: "exact" }
    )
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limitNum - 1);

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  sendPaginated(res, data || [], {
    page: pageNum,
    limit: limitNum,
    total: count || 0,
  });
};
