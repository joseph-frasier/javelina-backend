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
  validateEnvironmentType,
  validateUUID,
} from "../utils/validation";

/**
 * GET /api/environments
 * List all environments accessible to the user
 */
export const listEnvironments = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from("environments")
    .select(
      `
      *,
      organizations!inner(
        id,
        name,
        organization_members!inner(user_id)
      )
    `
    )
    .eq("organizations.organization_members.user_id", userId)
    .order("name");

  if (error) {
    throw new Error(`Failed to fetch environments: ${error.message}`);
  }

  sendSuccess(res, data || []);
};

/**
 * GET /api/environments/organization/:orgId
 * List environments for a specific organization
 */
export const listEnvironmentsByOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { orgId } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(orgId)) {
    throw new ValidationError("Invalid organization ID");
  }

  // Verify user has access to this organization
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .single();

  if (!membership) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  const { data, error } = await supabaseAdmin
    .from("environments")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  if (error) {
    throw new Error(`Failed to fetch environments: ${error.message}`);
  }

  sendSuccess(res, data || []);
};

/**
 * GET /api/environments/:id
 * Get environment details
 */
export const getEnvironment = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid environment ID");
  }

  const { data: environment, error } = await supabaseAdmin
    .from("environments")
    .select(
      `
      *,
      organizations(
        id,
        name,
        organization_members!inner(user_id, role)
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !environment) {
    throw new NotFoundError("Environment not found");
  }

  // Verify user has access
  const members = (environment as any).organizations.organization_members;
  if (!members || !members.some((m: any) => m.user_id === userId)) {
    throw new ForbiddenError("You do not have access to this environment");
  }

  sendSuccess(res, environment);
};

/**
 * POST /api/environments
 * Create a new environment
 */
export const createEnvironment = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { name, environment_type, location, description, organization_id } =
    req.body;
  const userId = req.user!.id;

  validateRequired({ name, environment_type, organization_id }, [
    "name",
    "environment_type",
    "organization_id",
  ]);

  if (!validateEnvironmentType(environment_type)) {
    throw new ValidationError(
      "Invalid environment type. Must be production, staging, or development"
    );
  }

  if (!validateUUID(organization_id)) {
    throw new ValidationError("Invalid organization ID");
  }

  // Check if user has admin rights in the organization
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", userId)
    .single();

  if (!membership || !["SuperAdmin", "Admin"].includes(membership.role)) {
    throw new ForbiddenError(
      "You do not have permission to create environments in this organization"
    );
  }

  // Check for duplicate name in organization
  const { data: existing } = await supabaseAdmin
    .from("environments")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("name", name)
    .limit(1);

  if (existing && existing.length > 0) {
    throw new ValidationError(
      `An environment with the name "${name}" already exists in this organization`
    );
  }

  const { data, error } = await supabaseAdmin
    .from("environments")
    .insert({
      name,
      environment_type,
      location: location || null,
      description: description || null,
      organization_id,
      status: "active",
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create environment: ${error.message}`);
  }

  sendSuccess(res, data, "Environment created successfully", 201);
};

/**
 * PUT /api/environments/:id
 * Update environment
 */
export const updateEnvironment = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid environment ID");
  }

  // Get environment
  const { data: environment } = await supabaseAdmin
    .from("environments")
    .select("organization_id")
    .eq("id", id)
    .single();

  if (!environment) {
    throw new NotFoundError("Environment not found");
  }

  // Check if user has editor rights or higher
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", environment.organization_id)
    .eq("user_id", userId)
    .single();

  if (
    !membership ||
    !["SuperAdmin", "Admin", "Editor"].includes(membership.role)
  ) {
    throw new ForbiddenError(
      "You do not have permission to update this environment"
    );
  }

  const { name, environment_type, location, description, status } = req.body;
  const updates: any = {};

  if (name !== undefined) updates.name = name;
  if (environment_type !== undefined) {
    if (!validateEnvironmentType(environment_type)) {
      throw new ValidationError("Invalid environment type");
    }
    updates.environment_type = environment_type;
  }
  if (location !== undefined) updates.location = location;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabaseAdmin
    .from("environments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update environment: ${error.message}`);
  }

  sendSuccess(res, data, "Environment updated successfully");
};

/**
 * DELETE /api/environments/:id
 * Delete environment
 */
export const deleteEnvironment = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid environment ID");
  }

  // Get environment
  const { data: environment } = await supabaseAdmin
    .from("environments")
    .select("organization_id")
    .eq("id", id)
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
      "You do not have permission to delete this environment"
    );
  }

  const { error } = await supabaseAdmin
    .from("environments")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete environment: ${error.message}`);
  }

  sendSuccess(res, { id }, "Environment deleted successfully");
};
