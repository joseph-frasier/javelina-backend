import { Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import {
  AuthenticatedRequest,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../types";
import { sendSuccess } from "../utils/response";
import { validateUUID } from "../utils/validation";

/**
 * GET /api/profiles/me
 * Get current user's profile
 */
export const getCurrentProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Profile not found");
  }

  sendSuccess(res, data);
};

/**
 * PUT /api/profiles/me
 * Update current user's profile
 */
export const updateCurrentProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { name, display_name, title, phone, timezone, bio, avatar_url } =
    req.body;

  const updates: any = {};

  if (name !== undefined) updates.name = name;
  if (display_name !== undefined) updates.display_name = display_name;
  if (title !== undefined) updates.title = title;
  if (phone !== undefined) updates.phone = phone;
  if (timezone !== undefined) updates.timezone = timezone;
  if (bio !== undefined) updates.bio = bio;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  sendSuccess(res, data, "Profile updated successfully");
};

/**
 * GET /api/profiles/:id
 * Get user profile by ID (if accessible)
 */
export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid profile ID");
  }

  // Check if the requested profile shares any organization with current user
  const { data: sharedOrgs } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", id);

  const { data: currentUserOrgs } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId);

  const sharedOrgIds = sharedOrgs?.map((o) => o.organization_id) || [];
  const currentUserOrgIds =
    currentUserOrgs?.map((o) => o.organization_id) || [];

  const hasSharedOrg = sharedOrgIds.some((orgId) =>
    currentUserOrgIds.includes(orgId)
  );

  // Users can only view profiles of users in their organizations
  if (!hasSharedOrg && id !== userId) {
    throw new ForbiddenError("You do not have access to this profile");
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, display_name, title, email, avatar_url, created_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new NotFoundError("Profile not found");
  }

  sendSuccess(res, data);
};
