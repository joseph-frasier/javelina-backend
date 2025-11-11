import { Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AuthenticatedRequest } from "../types";
import { sendSuccess, sendError } from "../utils/response";

// Helper function to parse entitlement values
function parseEntitlementValue(value: string, valueType: string): any {
  switch (valueType) {
    case "boolean":
      return value === "true" || value === "1";
    case "number":
      return parseInt(value, 10);
    case "string":
      return value;
    default:
      return value;
  }
}

// =====================================================
// CHECK ENTITLEMENT
// =====================================================

export const checkEntitlement = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const org_id = req.query.org_id as string;
    const entitlement_key = req.query.entitlement_key as string;

    if (!org_id) {
      sendError(res, "org_id is required", 400);
      return;
    }

    if (!entitlement_key) {
      sendError(res, "entitlement_key is required", 400);
      return;
    }

    // Verify user has access to organization
    const { data: member, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", org_id)
      .eq("user_id", userId)
      .single();

    if (memberError || !member) {
      sendError(res, "Access denied", 403);
      return;
    }

    // Call check_entitlement function
    const { data, error } = await supabaseAdmin.rpc("check_entitlement", {
      org_uuid: org_id,
      entitlement_key: entitlement_key,
    });

    if (error) {
      console.error("Error checking entitlement:", error);
      sendError(res, "Failed to check entitlement", 500);
      return;
    }

    // Parse the value based on type
    let parsed_value = null;
    if (data && data.value && data.value_type) {
      parsed_value = parseEntitlementValue(data.value, data.value_type);
    }

    sendSuccess(
      res,
      {
        org_id,
        entitlement_key,
        value: data?.value || null,
        value_type: data?.value_type || null,
        parsed_value,
      },
      "Entitlement checked successfully"
    );
  } catch (error: any) {
    console.error("Error in check entitlement API:", error);
    sendError(res, error.message || "Internal server error", 500);
  }
};

