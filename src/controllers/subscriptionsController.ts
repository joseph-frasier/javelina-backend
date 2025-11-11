import { Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AuthenticatedRequest } from "../types";
import { sendSuccess, sendError } from "../utils/response";

// =====================================================
// GET CURRENT SUBSCRIPTION
// =====================================================

export const getCurrentSubscription = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const org_id = req.query.org_id as string;

    if (!org_id) {
      sendError(res, "org_id is required", 400);
      return;
    }

    // Verify user has access to organization
    console.log(`[Subscriptions] Checking membership for user ${userId} in org ${org_id}`);
    const { data: member, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", org_id)
      .eq("user_id", userId)
      .single();

    console.log('[Subscriptions] Membership query result:', { member, memberError });

    if (memberError || !member) {
      console.error(`[Subscriptions] Access denied for user ${userId} to org ${org_id}:`, memberError);
      sendError(res, "Access denied", 403);
      return;
    }

    // Call get_org_subscription function
    const { data: subscriptionDataArray, error: subError } =
      await supabaseAdmin.rpc("get_org_subscription", { org_uuid: org_id });

    console.log("RPC get_org_subscription result:", subscriptionDataArray);
    console.log("RPC error:", subError);

    if (subError) {
      console.error("Error getting subscription:", subError);
      sendError(res, "Failed to fetch subscription", 500);
      return;
    }

    // RPC returns an array, get first element
    const subscriptionData =
      subscriptionDataArray && subscriptionDataArray.length > 0
        ? subscriptionDataArray[0]
        : null;

    console.log("Extracted subscription object:", subscriptionData);

    // Get plan details
    let plan = null;
    if (subscriptionData && subscriptionData.plan_code) {
      const { data: planData, error: planError } = await supabaseAdmin
        .from("plans")
        .select("*")
        .eq("code", subscriptionData.plan_code)
        .single();

      console.log("Plan lookup for code:", subscriptionData.plan_code);
      console.log("Plan data:", planData);
      console.log("Plan error:", planError);

      if (!planError && planData) {
        plan = planData;
      }
    } else {
      console.log("No subscription data or plan_code to lookup");
    }

    // Get entitlements
    const { data: entitlements, error: entError } = await supabaseAdmin.rpc(
      "get_org_entitlements",
      { org_uuid: org_id }
    );

    if (entError) {
      console.error("Error getting entitlements:", entError);
    }

    sendSuccess(
      res,
      {
        subscription: subscriptionData,
        plan,
        entitlements: entitlements || [],
      },
      "Subscription retrieved successfully"
    );
  } catch (error: any) {
    console.error("Error in current subscription API:", error);
    sendError(res, error.message || "Internal server error", 500);
  }
};

// =====================================================
// CHECK CAN CREATE RESOURCE
// =====================================================

export const canCreateResource = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const org_id = req.query.org_id as string;
    const resource_type = req.query.resource_type as string;

    if (!org_id) {
      sendError(res, "org_id is required", 400);
      return;
    }

    if (!resource_type) {
      sendError(res, "resource_type is required", 400);
      return;
    }

    // Validate resource type
    const validTypes = ["environment", "zone", "member"];
    if (!validTypes.includes(resource_type)) {
      sendError(
        res,
        "Invalid resource_type. Must be: environment, zone, or member",
        400
      );
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

    // Call can_create_resource function
    const { data, error } = await supabaseAdmin.rpc("can_create_resource", {
      org_uuid: org_id,
      resource_type: resource_type,
    });

    if (error) {
      console.error("Error checking can_create_resource:", error);
      sendError(res, "Failed to check resource creation permission", 500);
      return;
    }

    // Get current count and limit for more detailed response
    let current_count = 0;
    let limit: number | null = null;
    let entitlement_key = "";

    // Map resource type to entitlement key
    switch (resource_type) {
      case "environment":
        entitlement_key = "environments_limit";
        break;
      case "zone":
        entitlement_key = "zones_limit";
        break;
      case "member":
        entitlement_key = "team_members_limit";
        break;
    }

    // Get the limit
    const { data: entitlement } = await supabaseAdmin.rpc("check_entitlement", {
      org_uuid: org_id,
      entitlement_key: entitlement_key,
    });

    if (entitlement?.value) {
      limit = parseInt(entitlement.value, 10);
    }

    // Get current count based on resource type
    if (resource_type === "environment") {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("environments_count")
        .eq("id", org_id)
        .single();
      current_count = org?.environments_count || 0;
    } else if (resource_type === "zone") {
      // Sum zones_count from all environments in this org
      const { data: environments } = await supabaseAdmin
        .from("environments")
        .select("zones_count")
        .eq("org_id", org_id);
      current_count =
        environments?.reduce((sum, env) => sum + (env.zones_count || 0), 0) ||
        0;
    } else if (resource_type === "member") {
      const { count } = await supabaseAdmin
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org_id);
      current_count = count || 0;
    }

    const can_create = data === true;
    let reason = "";

    if (!can_create) {
      if (limit === -1) {
        reason = "Unlimited resources available";
      } else if (limit !== null && current_count >= limit) {
        reason = `Limit reached: ${current_count}/${limit} ${resource_type}s used`;
      } else {
        reason = "Resource creation not allowed by plan";
      }
    }

    sendSuccess(
      res,
      {
        org_id,
        resource_type,
        can_create,
        current_count,
        limit,
        reason: can_create ? undefined : reason,
      },
      "Resource creation check completed"
    );
  } catch (error: any) {
    console.error("Error in can-create API:", error);
    sendError(res, error.message || "Internal server error", 500);
  }
};

// =====================================================
// GET SUBSCRIPTION STATUS
// =====================================================

// =====================================================
// GET ALL USER'S ORGANIZATIONS WITH SUBSCRIPTION DATA
// =====================================================

export const getAllOrganizationsWithSubscriptions = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Get all organizations where user is Admin or SuperAdmin
    const { data: memberships, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select(`
        organization_id,
        role,
        organizations!inner(
          id,
          name,
          stripe_customer_id
        )
      `)
      .eq("user_id", userId)
      .in("role", ["Admin", "SuperAdmin"]);

    if (memberError) {
      console.error("Error fetching memberships:", memberError);
      sendError(res, "Failed to fetch organizations", 500);
      return;
    }

    if (!memberships || memberships.length === 0) {
      sendSuccess(res, [], "No organizations found");
      return;
    }

    // Get subscription data for each organization
    const orgIds = memberships.map((m) => m.organization_id);

    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("org_id, status, current_period_end, plan_id")
      .in("org_id", orgIds);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
    }

    // Get all plans
    const { data: allPlans } = await supabaseAdmin
      .from("plans")
      .select("id, code, name")
      .eq("is_active", true);

    // Combine data
    const orgsWithSubscriptions = memberships.map((m) => {
      const org = (m.organizations as any);
      const sub = subscriptions?.find((s) => s.org_id === m.organization_id);
      const plan = sub?.plan_id
        ? allPlans?.find((p) => p.id === sub.plan_id)
        : null;

      return {
        org_id: org.id,
        organization_name: org.name,
        plan_name: plan?.name || "Free",
        status: sub?.status || "active",
        current_period_end: sub?.current_period_end || null,
        stripe_customer_id: org.stripe_customer_id,
      };
    });

    sendSuccess(
      res,
      orgsWithSubscriptions,
      "Organizations with subscriptions retrieved successfully"
    );
  } catch (error: any) {
    console.error("Error in get all organizations with subscriptions:", error);
    sendError(res, error.message || "Internal server error", 500);
  }
};

// =====================================================
// GET SUBSCRIPTION STATUS
// =====================================================

export const getSubscriptionStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const org_id = req.query.org_id as string;

    if (!org_id) {
      sendError(res, "Organization ID is required", 400);
      return;
    }

    // Verify user has access to this organization
    console.log(`[Subscriptions Status] Checking membership for user ${userId} in org ${org_id}`);
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", org_id)
      .eq("user_id", userId)
      .single();

    console.log('[Subscriptions Status] Membership query result:', { membership, memberError });

    if (memberError || !membership) {
      console.error(`[Subscriptions Status] Access denied for user ${userId} to org ${org_id}:`, memberError);
      sendError(res, "You do not have access to this organization", 403);
      return;
    }

    // Get subscription status
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, plan_id")
      .eq("org_id", org_id)
      .single();

    if (subError) {
      // No subscription yet - might still be processing
      sendSuccess(
        res,
        {
          org_id,
          status: null,
          is_active: false,
          is_processing: true,
        },
        "No subscription found"
      );
      return;
    }

    const isActive = ["active", "trialing"].includes(subscription.status);

    sendSuccess(
      res,
      {
        org_id,
        subscription_id: subscription.id,
        status: subscription.status,
        is_active: isActive,
        is_processing: false,
      },
      "Subscription status retrieved"
    );
  } catch (error: any) {
    console.error("Error fetching subscription status:", error);
    sendError(res, error.message || "Failed to fetch subscription status", 500);
  }
};


