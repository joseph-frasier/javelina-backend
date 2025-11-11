/**
 * Stripe Helper Functions for Backend API
 * 
 * Functions to sync Stripe data with Supabase database
 */

import Stripe from "stripe";
import { supabaseAdmin } from "../config/supabase";
import { stripe } from "../config/stripe";

// =====================================================
// TYPE DEFINITIONS
// =====================================================

type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

interface Subscription {
  id: string;
  org_id: string;
  stripe_subscription_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  trial_start: string | null;
  trial_end: string | null;
  cancel_at: string | null;
  cancel_at_period_end: boolean;
  created_by: string | null;
  metadata: any;
  updated_at: string;
}

// =====================================================
// PLAN LOOKUPS
// =====================================================

/**
 * Map Stripe Price ID to database plan ID
 */
export async function getPlanIdFromPriceId(
  priceId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("id, code, metadata")
    .eq("is_active", true);

  if (error) {
    console.error("Error fetching plans for price lookup:", error);
    return null;
  }

  console.log(`Looking up plan for price_id: ${priceId}`);

  // Find plan with matching price_id in metadata
  const plan = data?.find(
    (p: { id: string; code: string; metadata?: { price_id?: string } }) =>
      p.metadata?.price_id === priceId
  );

  if (plan) {
    console.log(`✅ Found plan ${plan.code} (${plan.id}) for price ${priceId}`);
  } else {
    console.error(`❌ No plan found for price_id: ${priceId}`);
  }

  return plan?.id || null;
}

// =====================================================
// SUBSCRIPTION OPERATIONS
// =====================================================

/**
 * Create subscription record in database
 * Uses upsert to handle concurrent webhook events for the same organization
 */
export async function createSubscriptionRecord(
  orgId: string,
  stripeData: Stripe.Subscription
): Promise<Subscription | null> {
  // Get plan ID from price ID
  const priceId = stripeData.items.data[0]?.price.id;
  const planId = priceId ? await getPlanIdFromPriceId(priceId) : null;

  const stripeAny = stripeData as any;

  const subscriptionData = {
    org_id: orgId,
    stripe_subscription_id: stripeData.id,
    plan_id: planId,
    status: stripeData.status as SubscriptionStatus,
    current_period_start: stripeAny.current_period_start
      ? new Date(stripeAny.current_period_start * 1000).toISOString()
      : new Date().toISOString(),
    current_period_end: stripeAny.current_period_end
      ? new Date(stripeAny.current_period_end * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    trial_start: stripeAny.trial_start
      ? new Date(stripeAny.trial_start * 1000).toISOString()
      : null,
    trial_end: stripeAny.trial_end
      ? new Date(stripeAny.trial_end * 1000).toISOString()
      : null,
    cancel_at: stripeAny.cancel_at
      ? new Date(stripeAny.cancel_at * 1000).toISOString()
      : null,
    cancel_at_period_end: stripeAny.cancel_at_period_end || false,
    created_by: stripeData.metadata?.user_id || null,
    metadata: stripeData.metadata || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(subscriptionData, { onConflict: "org_id" })
    .select()
    .single();

  if (error) {
    console.error("Error creating/updating subscription record:", error);
    return null;
  }

  // Create subscription items
  if (data && stripeData.items.data.length > 0) {
    await createSubscriptionItems(data.id, stripeData.items.data);
  }

  return data;
}

/**
 * Update subscription record from Stripe data
 */
export async function updateSubscriptionRecord(
  subscriptionId: string,
  stripeData: Stripe.Subscription
): Promise<Subscription | null> {
  // Get plan ID from price ID (in case plan changed)
  const priceId = stripeData.items.data[0]?.price.id;
  const planId = priceId ? await getPlanIdFromPriceId(priceId) : null;

  const stripeAny = stripeData as any;

  const updateData = {
    plan_id: planId,
    status: stripeData.status as SubscriptionStatus,
    current_period_start: stripeAny.current_period_start
      ? new Date(stripeAny.current_period_start * 1000).toISOString()
      : new Date().toISOString(),
    current_period_end: stripeAny.current_period_end
      ? new Date(stripeAny.current_period_end * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    trial_start: stripeAny.trial_start
      ? new Date(stripeAny.trial_start * 1000).toISOString()
      : null,
    trial_end: stripeAny.trial_end
      ? new Date(stripeAny.trial_end * 1000).toISOString()
      : null,
    cancel_at: stripeAny.cancel_at
      ? new Date(stripeAny.cancel_at * 1000).toISOString()
      : null,
    cancel_at_period_end: stripeAny.cancel_at_period_end || false,
    metadata: stripeData.metadata || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .update(updateData)
    .eq("stripe_subscription_id", subscriptionId)
    .select()
    .single();

  if (error) {
    console.error("Error updating subscription record:", error);
    return null;
  }

  // Update subscription items if plan changed
  if (data && stripeData.items.data.length > 0) {
    // Delete old items
    await supabaseAdmin
      .from("subscription_items")
      .delete()
      .eq("subscription_id", data.id);

    // Create new items
    await createSubscriptionItems(data.id, stripeData.items.data);
  }

  return data;
}

/**
 * Create subscription items
 */
async function createSubscriptionItems(
  subscriptionId: string,
  items: Stripe.SubscriptionItem[]
): Promise<void> {
  const itemsData = items.map((item) => ({
    subscription_id: subscriptionId,
    stripe_price_id: item.price.id,
    quantity: item.quantity || 1,
  }));

  const { error } = await supabaseAdmin
    .from("subscription_items")
    .insert(itemsData);

  if (error) {
    console.error("Error creating subscription items:", error);
  }
}

/**
 * Mark subscription as canceled
 */
export async function cancelSubscriptionRecord(
  subscriptionId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error("Error canceling subscription record:", error);
  }
}

/**
 * Update subscription status
 */
export async function updateSubscriptionStatus(
  subscriptionId: string,
  status: SubscriptionStatus,
  periodEnd?: Date
): Promise<void> {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (periodEnd) {
    updateData.current_period_end = periodEnd.toISOString();
  }

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update(updateData)
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error("Error updating subscription status:", error);
  }
}

/**
 * Get subscription by Stripe subscription ID
 */
export async function getSubscriptionByStripeId(
  stripeSubscriptionId: string
): Promise<Subscription | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching subscription by stripe ID:", error);
    return null;
  }

  return data;
}

/**
 * Update organization's Stripe customer ID
 */
export async function updateOrgStripeCustomer(
  orgId: string,
  customerId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("organizations")
    .update({ stripe_customer_id: customerId })
    .eq("id", orgId);

  if (error) {
    console.error("Error updating org stripe customer:", error);
  }
}

