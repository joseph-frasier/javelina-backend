import { Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AuthenticatedRequest } from "../types";
import { sendSuccess, sendError } from "../utils/response";

/**
 * Get all active plans with their entitlements
 */
export const getAllPlans = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    // Fetch all active plans
    const { data: plans, error: plansError } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("code", { ascending: true });

    if (plansError) {
      console.error("Error fetching plans:", plansError);
      sendError(res, "Failed to fetch plans", 500);
      return;
    }

    // Fetch all entitlements
    const { data: entitlements, error: entitlementsError } = await supabaseAdmin
      .from("entitlements")
      .select("*");

    if (entitlementsError) {
      console.error("Error fetching entitlements:", entitlementsError);
      sendError(res, "Failed to fetch entitlements", 500);
      return;
    }

    // Fetch plan entitlements mapping
    const { data: planEntitlements, error: planEntitlementsError } =
      await supabaseAdmin
        .from("plan_entitlements")
        .select("*");

    if (planEntitlementsError) {
      console.error("Error fetching plan entitlements:", planEntitlementsError);
      sendError(res, "Failed to fetch plan entitlements", 500);
      return;
    }

    // Build a map of entitlement_id -> entitlement
    const entitlementsMap = new Map(
      entitlements.map((e) => [e.id, e])
    );

    // Build a map of plan_id -> entitlements
    const planEntitlementsMap = new Map<string, any[]>();
    planEntitlements.forEach((pe) => {
      const existing = planEntitlementsMap.get(pe.plan_id) || [];
      const entitlement = entitlementsMap.get(pe.entitlement_id);
      if (entitlement) {
        existing.push({
          key: entitlement.key,
          value: pe.value,
          value_type: entitlement.value_type,
          description: entitlement.description,
        });
      }
      planEntitlementsMap.set(pe.plan_id, existing);
    });

    // Combine plans with their entitlements
    const plansWithEntitlements = plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      stripe_product_id: plan.stripe_product_id,
      billing_interval: plan.billing_interval,
      metadata: plan.metadata,
      price: plan.metadata?.price || 0,
      price_id: plan.metadata?.price_id,
      description: plan.metadata?.description,
      entitlements: planEntitlementsMap.get(plan.id) || [],
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    }));

    sendSuccess(res, plansWithEntitlements, "Plans fetched successfully");
  } catch (error: any) {
    console.error("Error in getAllPlans:", error);
    sendError(res, error.message || "Failed to fetch plans", 500);
  }
};

/**
 * Get a specific plan by code
 */
export const getPlanByCode = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { code } = req.params;

    if (!code) {
      sendError(res, "Plan code is required", 400);
      return;
    }

    // Fetch plan
    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      sendError(res, "Plan not found", 404);
      return;
    }

    // Fetch plan's entitlements
    const { data: planEntitlements, error: planEntitlementsError } =
      await supabaseAdmin
        .from("plan_entitlements")
        .select(`
          value,
          entitlement:entitlements (
            id,
            key,
            description,
            value_type
          )
        `)
        .eq("plan_id", plan.id);

    if (planEntitlementsError) {
      console.error("Error fetching plan entitlements:", planEntitlementsError);
      sendError(res, "Failed to fetch plan entitlements", 500);
      return;
    }

    // Format entitlements
    const entitlements = planEntitlements.map((pe: any) => ({
      key: pe.entitlement.key,
      value: pe.value,
      value_type: pe.entitlement.value_type,
      description: pe.entitlement.description,
    }));

    // Combine plan with entitlements
    const planWithEntitlements = {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      stripe_product_id: plan.stripe_product_id,
      billing_interval: plan.billing_interval,
      metadata: plan.metadata,
      price: plan.metadata?.price || 0,
      price_id: plan.metadata?.price_id,
      description: plan.metadata?.description,
      entitlements,
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    };

    sendSuccess(res, planWithEntitlements, "Plan fetched successfully");
  } catch (error: any) {
    console.error("Error in getPlanByCode:", error);
    sendError(res, error.message || "Failed to fetch plan", 500);
  }
};

