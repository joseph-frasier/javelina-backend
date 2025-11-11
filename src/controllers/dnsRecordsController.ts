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
  validateDNSRecordType,
  validateUUID,
} from "../utils/validation";

/**
 * GET /api/dns-records/zone/:zoneId
 * List DNS records for a zone
 */
export const listDNSRecordsByZone = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { zoneId } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(zoneId)) {
    throw new ValidationError("Invalid zone ID");
  }

  // Verify user has access to the zone
  const { data: zone } = await supabaseAdmin
    .from("zones")
    .select(
      `
      id,
      environments(
        organization_id,
        organizations(
          organization_members!inner(user_id)
        )
      )
    `
    )
    .eq("id", zoneId)
    .single();

  if (!zone) {
    throw new NotFoundError("Zone not found");
  }

  const members = (zone as any).environments.organizations.organization_members;
  if (!members || !members.some((m: any) => m.user_id === userId)) {
    throw new ForbiddenError("You do not have access to this zone");
  }

  const { data, error } = await supabaseAdmin
    .from("zone_records")
    .select("*")
    .eq("zone_id", zoneId)
    .order("name");

  if (error) {
    throw new Error(`Failed to fetch DNS records: ${error.message}`);
  }

  sendSuccess(res, data || []);
};

/**
 * GET /api/dns-records/:id
 * Get DNS record details
 */
export const getDNSRecord = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid DNS record ID");
  }

  const { data: record, error } = await supabaseAdmin
    .from("zone_records")
    .select(
      `
      *,
      zones(
        id,
        name,
        environments(
          organization_id,
          organizations(
            organization_members!inner(user_id)
          )
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !record) {
    throw new NotFoundError("DNS record not found");
  }

  // Verify user has access
  const members = (record as any).zones.environments.organizations
    .organization_members;
  if (!members || !members.some((m: any) => m.user_id === userId)) {
    throw new ForbiddenError("You do not have access to this DNS record");
  }

  sendSuccess(res, record);
};

/**
 * POST /api/dns-records
 * Create a new DNS record
 */
export const createDNSRecord = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { zone_id, name, type, value, ttl, priority, active } = req.body;
  const userId = req.user!.id;

  validateRequired({ zone_id, name, type, value, ttl }, [
    "zone_id",
    "name",
    "type",
    "value",
    "ttl",
  ]);

  if (!validateUUID(zone_id)) {
    throw new ValidationError("Invalid zone ID");
  }

  if (!validateDNSRecordType(type)) {
    throw new ValidationError("Invalid DNS record type");
  }

  if (typeof ttl !== "number" || ttl < 0) {
    throw new ValidationError("TTL must be a positive number");
  }

  // Get zone and check permissions
  const { data: zone } = await supabaseAdmin
    .from("zones")
    .select(
      `
      id,
      environments(
        organization_id,
        organizations(
          organization_members!inner(user_id, role)
        )
      )
    `
    )
    .eq("id", zone_id)
    .single();

  if (!zone) {
    throw new NotFoundError("Zone not found");
  }

  const members = (zone as any).environments.organizations.organization_members;
  const userMembership = members?.find((m: any) => m.user_id === userId);

  if (
    !userMembership ||
    !["SuperAdmin", "Admin", "Editor"].includes(userMembership.role)
  ) {
    throw new ForbiddenError(
      "You do not have permission to create DNS records in this zone"
    );
  }

  const { data, error } = await supabaseAdmin
    .from("zone_records")
    .insert({
      zone_id,
      name,
      type,
      value,
      ttl,
      priority: priority || null,
      active: active !== undefined ? active : true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create DNS record: ${error.message}`);
  }

  sendSuccess(res, data, "DNS record created successfully", 201);
};

/**
 * PUT /api/dns-records/:id
 * Update DNS record
 */
export const updateDNSRecord = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid DNS record ID");
  }

  // Get record and check permissions
  const { data: record } = await supabaseAdmin
    .from("zone_records")
    .select(
      `
      zone_id,
      zones(
        environments(
          organization_id,
          organizations(
            organization_members!inner(user_id, role)
          )
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (!record) {
    throw new NotFoundError("DNS record not found");
  }

  const members = (record as any).zones.environments.organizations
    .organization_members;
  const userMembership = members?.find((m: any) => m.user_id === userId);

  if (
    !userMembership ||
    !["SuperAdmin", "Admin", "Editor"].includes(userMembership.role)
  ) {
    throw new ForbiddenError(
      "You do not have permission to update this DNS record"
    );
  }

  const { name, type, value, ttl, priority, active } = req.body;
  const updates: any = {};

  if (name !== undefined) updates.name = name;
  if (type !== undefined) {
    if (!validateDNSRecordType(type)) {
      throw new ValidationError("Invalid DNS record type");
    }
    updates.type = type;
  }
  if (value !== undefined) updates.value = value;
  if (ttl !== undefined) {
    if (typeof ttl !== "number" || ttl < 0) {
      throw new ValidationError("TTL must be a positive number");
    }
    updates.ttl = ttl;
  }
  if (priority !== undefined) updates.priority = priority;
  if (active !== undefined) updates.active = active;

  const { data, error } = await supabaseAdmin
    .from("zone_records")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update DNS record: ${error.message}`);
  }

  sendSuccess(res, data, "DNS record updated successfully");
};

/**
 * DELETE /api/dns-records/:id
 * Delete DNS record
 */
export const deleteDNSRecord = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.id;

  if (!validateUUID(id)) {
    throw new ValidationError("Invalid DNS record ID");
  }

  // Get record and check permissions
  const { data: record } = await supabaseAdmin
    .from("zone_records")
    .select(
      `
      zone_id,
      zones(
        environments(
          organization_id,
          organizations(
            organization_members!inner(user_id, role)
          )
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (!record) {
    throw new NotFoundError("DNS record not found");
  }

  const members = (record as any).zones.environments.organizations
    .organization_members;
  const userMembership = members?.find((m: any) => m.user_id === userId);

  if (
    !userMembership ||
    !["SuperAdmin", "Admin", "Editor"].includes(userMembership.role)
  ) {
    throw new ForbiddenError(
      "You do not have permission to delete this DNS record"
    );
  }

  const { error } = await supabaseAdmin
    .from("zone_records")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete DNS record: ${error.message}`);
  }

  sendSuccess(res, { id }, "DNS record deleted successfully");
};
