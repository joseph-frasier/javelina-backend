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
  validateOrganizationName,
  validateUUID,
} from "../utils/validation";

/**
 * GET /api/organizations
 * List all organizations for the current user
 */
export const listOrganizations = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(
      `
      id,
      name,
      description,
      created_at,
      updated_at,
      organization_members!inner(role)
    `
    )
    .eq("organization_members.user_id", userId)
    .order("name");

  if (error) {
    throw new Error(`Failed to fetch organizations: ${error.message}`);
  }

  sendSuccess(res, data || []);
};

/**
 * GET /api/organizations/:id
 * Get organization details
 */
export const getOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid organization ID");
  }

  // Check if user is a member
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", id)
    .eq("user_id", userId)
    .single();

  if (!membership) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new NotFoundError("Organization not found");
  }

  sendSuccess(res, data);
};

/**
 * POST /api/organizations
 * Create a new organization
 */
export const createOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { name, description } = req.body;
  const userId = req.user!.id;

  validateRequired({ name }, ["name"]);
  validateOrganizationName(name);

  // Check for duplicate name
  const { data: existing } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .ilike("name", name)
    .limit(1);

  if (existing && existing.length > 0) {
    throw new ValidationError("An organization with this name already exists");
  }

  // Create organization
  const { data: org, error: orgError } = await supabaseAdmin
    .from("organizations")
    .insert({
      name,
      description: description || null,
    })
    .select()
    .single();

  if (orgError) {
    throw new Error(`Failed to create organization: ${orgError.message}`);
  }

  // Create membership for current user as Admin (upsert to handle retries)
  const { error: memberError } = await supabaseAdmin
    .from("organization_members")
    .upsert(
      {
        organization_id: org.id,
        user_id: userId,
        role: "Admin",
      },
      {
        onConflict: "organization_id,user_id",
      }
    );

  if (memberError) {
    // Rollback organization creation
    await supabaseAdmin.from("organizations").delete().eq("id", org.id);
    throw new Error(`Failed to create membership: ${memberError.message}`);
  }

  sendSuccess(res, org, "Organization created successfully", 201);
};

/**
 * PUT /api/organizations/:id
 * Update organization
 */
export const updateOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { name, description } = req.body;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid organization ID");
  }

  // Check if user has admin rights
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", id)
    .eq("user_id", userId)
    .single();

  if (!membership || !["SuperAdmin", "Admin"].includes(membership.role)) {
    throw new ForbiddenError(
      "You do not have permission to update this organization"
    );
  }

  const updates: any = {};
  if (name !== undefined) {
    validateOrganizationName(name);
    updates.name = name;
  }
  if (description !== undefined) {
    updates.description = description;
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update organization: ${error.message}`);
  }

  sendSuccess(res, data, "Organization updated successfully");
};

/**
 * DELETE /api/organizations/:id
 * Delete organization
 */
export const deleteOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid organization ID");
  }

  // Check if user has Admin or SuperAdmin rights
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", id)
    .eq("user_id", userId)
    .single();

  if (!membership || !["SuperAdmin", "Admin"].includes(membership.role)) {
    throw new ForbiddenError("Only SuperAdmin or Admin can delete organizations");
  }

  const { error } = await supabaseAdmin
    .from("organizations")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete organization: ${error.message}`);
  }

  sendSuccess(res, { id }, "Organization deleted successfully");
};

/**
 * GET /api/organizations/:id/members
 * List organization members
 */
export const getOrganizationMembers = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid organization ID");
  }

  // Check if user is a member
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", id)
    .eq("user_id", userId)
    .single();

  if (!membership) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select(
      `
      *,
      profiles:user_id (
        id,
        name,
        email,
        avatar_url
      )
    `
    )
    .eq("organization_id", id);

  if (error) {
    throw new Error(`Failed to fetch members: ${error.message}`);
  }

  sendSuccess(res, data || []);
};
