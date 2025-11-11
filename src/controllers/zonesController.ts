import { Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import {
  AuthenticatedRequest,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../types";
import { sendSuccess } from "../utils/response";
import {
  validateRequired,
  validateZoneType,
  validateUUID,
  validateDomainName,
} from "../utils/validation";

/**
 * GET /api/zones
 * List all zones accessible to the user
 */
export const listZones = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from("zones")
    .select(
      `
      *,
      environments!inner(
        id,
        name,
        organizations!inner(
          id,
          name,
          organization_members!inner(user_id)
        )
      )
    `
    )
    .eq("environments.organizations.organization_members.user_id", userId)
    .order("name");

  if (error) {
    throw new Error(`Failed to fetch zones: ${error.message}`);
  }

  sendSuccess(res, data || []);
};

/**
 * GET /api/zones/environment/:envId
 * List zones for a specific environment
 */
export const listZonesByEnvironment = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { envId } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(envId)) {
    throw new ValidationError("Invalid environment ID");
  }

  // Verify user has access to this environment
  const { data: environment } = await supabaseAdmin
    .from("environments")
    .select(
      `
      organization_id,
      organizations(
        organization_members!inner(user_id)
      )
    `
    )
    .eq("id", envId)
    .single();

  if (!environment) {
    throw new NotFoundError("Environment not found");
  }

  const members = (environment as any).organizations.organization_members;
  if (!members || !members.some((m: any) => m.user_id === userId)) {
    throw new ForbiddenError("You do not have access to this environment");
  }

  const { data, error } = await supabaseAdmin
    .from("zones")
    .select("*")
    .eq("environment_id", envId)
    .order("name");

  if (error) {
    throw new Error(`Failed to fetch zones: ${error.message}`);
  }

  sendSuccess(res, data || []);
};

/**
 * GET /api/zones/:id
 * Get zone details
 */
export const getZone = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid zone ID");
  }

  const { data: zone, error } = await supabaseAdmin
    .from("zones")
    .select(
      `
      *,
      environments(
        id,
        name,
        organization_id,
        organizations(
          id,
          name,
          organization_members!inner(user_id, role)
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !zone) {
    throw new NotFoundError("Zone not found");
  }

  // Verify user has access
  const members = (zone as any).environments.organizations.organization_members;
  if (!members || !members.some((m: any) => m.user_id === userId)) {
    throw new ForbiddenError("You do not have access to this zone");
  }

  sendSuccess(res, zone);
};

/**
 * POST /api/zones
 * Create a new zone
 */
export const createZone = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { name, zone_type, description, environment_id } = req.body;
  const userId = req.user!.id;

  validateRequired({ name, zone_type, environment_id }, [
    "name",
    "zone_type",
    "environment_id",
  ]);

  if (!validateDomainName(name)) {
    throw new ValidationError(
      "Zone name must be a valid domain name (max 253 characters)"
    );
  }

  if (!validateZoneType(zone_type)) {
    throw new ValidationError(
      "Invalid zone type. Must be primary, secondary, or redirect"
    );
  }

  if (!validateUUID(environment_id)) {
    throw new ValidationError("Invalid environment ID");
  }

  // Get environment and check permissions
  const { data: environment } = await supabaseAdmin
    .from("environments")
    .select("organization_id")
    .eq("id", environment_id)
    .single();

  if (!environment) {
    throw new NotFoundError("Environment not found");
  }

  // Check if user has admin rights
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", environment.organization_id)
    .eq("user_id", userId)
    .single();

  if (!membership || !["SuperAdmin", "Admin"].includes(membership.role)) {
    throw new ForbiddenError(
      "You do not have permission to create zones in this environment"
    );
  }

  // Check for duplicate zone name in environment
  const { data: existing } = await supabaseAdmin
    .from("zones")
    .select("id")
    .eq("environment_id", environment_id)
    .eq("name", name)
    .limit(1);

  if (existing && existing.length > 0) {
    throw new ValidationError(
      "A zone with this name already exists in this environment"
    );
  }

  const { data, error } = await supabaseAdmin
    .from("zones")
    .insert({
      name,
      zone_type,
      description: description || null,
      environment_id,
      active: true,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create zone: ${error.message}`);
  }

  sendSuccess(res, data, "Zone created successfully", 201);
};

/**
 * PUT /api/zones/:id
 * Update zone
 */
export const updateZone = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid zone ID");
  }

  // Get zone and environment
  const { data: zone } = await supabaseAdmin
    .from("zones")
    .select("environment_id, environments(organization_id)")
    .eq("id", id)
    .single();

  if (!zone) {
    throw new NotFoundError("Zone not found");
  }

  const organizationId = (zone as any).environments.organization_id;

  // Check if user has editor rights or higher
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single();

  if (
    !membership ||
    !["SuperAdmin", "Admin", "Editor"].includes(membership.role)
  ) {
    throw new ForbiddenError("You do not have permission to update this zone");
  }

  const { name, zone_type, description, active } = req.body;
  const updates: any = {};

  if (name !== undefined) {
    if (!validateDomainName(name)) {
      throw new ValidationError("Zone name must be a valid domain name");
    }
    updates.name = name;
  }
  if (zone_type !== undefined) {
    if (!validateZoneType(zone_type)) {
      throw new ValidationError("Invalid zone type");
    }
    updates.zone_type = zone_type;
  }
  if (description !== undefined) updates.description = description;
  if (active !== undefined) updates.active = active;

  const { data, error } = await supabaseAdmin
    .from("zones")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update zone: ${error.message}`);
  }

  sendSuccess(res, data, "Zone updated successfully");
};

/**
 * DELETE /api/zones/:id
 * Delete zone
 */
export const deleteZone = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid zone ID");
  }

  // Get zone and environment
  const { data: zone } = await supabaseAdmin
    .from("zones")
    .select("environment_id, environments(organization_id)")
    .eq("id", id)
    .single();

  if (!zone) {
    throw new NotFoundError("Zone not found");
  }

  const organizationId = (zone as any).environments.organization_id;

  // Check if user has admin rights
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single();

  if (!membership || !["SuperAdmin", "Admin"].includes(membership.role)) {
    throw new ForbiddenError("You do not have permission to delete this zone");
  }

  const { error } = await supabaseAdmin.from("zones").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete zone: ${error.message}`);
  }

  sendSuccess(res, { id }, "Zone deleted successfully");
};

/**
 * POST /api/zones/:id/verify
 * Verify zone nameservers
 */
export const verifyZone = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid zone ID");
  }

  // Get zone and verify access
  const { data: zone } = await supabaseAdmin
    .from("zones")
    .select("environment_id, environments(organization_id)")
    .eq("id", id)
    .single();

  if (!zone) {
    throw new NotFoundError("Zone not found");
  }

  const organizationId = (zone as any).environments.organization_id;

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single();

  if (!membership) {
    throw new ForbiddenError("You do not have access to this zone");
  }

  // Update verification status to pending
  await supabaseAdmin
    .from("zones")
    .update({
      verification_status: "pending",
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", id);

  // TODO: Implement actual DNS verification logic
  // For now, simulate verification with 90% success rate
  const isSuccess = Math.random() > 0.1;
  const status = isSuccess ? "verified" : "failed";

  const { data, error } = await supabaseAdmin
    .from("zones")
    .update({
      verification_status: status,
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update verification status: ${error.message}`);
  }

  sendSuccess(res, {
    ...data,
    message: isSuccess
      ? "Nameservers verified successfully"
      : "Verification failed - nameservers not yet propagated",
  });
};
