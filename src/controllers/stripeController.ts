import { Response } from "express";
import Stripe from "stripe";
import { supabaseAdmin } from "../config/supabase";
import { stripe, webhookSecret } from "../config/stripe";
import {
  createSubscriptionRecord,
  updateSubscriptionRecord,
  updateSubscriptionStatus,
  cancelSubscriptionRecord,
  updateOrgStripeCustomer,
  getSubscriptionByStripeId,
} from "../utils/stripe-helpers";
import { AuthenticatedRequest } from "../types";
import { sendSuccess, sendError } from "../utils/response";

// =====================================================
// SUBSCRIPTION CREATION
// =====================================================

export const createSubscriptionIntent = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { org_id, price_id } = req.body;

    // Validate required fields
    if (!org_id || !price_id) {
      sendError(res, "Organization ID and Price ID are required", 400);
      return;
    }

    if (!stripe) {
      sendError(res, "Stripe is not configured", 500);
      return;
    }

    const userId = req.user!.id;

    // Verify user has access to this organization
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", org_id)
      .eq("user_id", userId)
      .single();

    if (memberError || !membership) {
      sendError(res, "You do not have access to this organization", 403);
      return;
    }

    // Only admins can manage billing
    if (!["SuperAdmin", "Admin"].includes(membership.role)) {
      sendError(res, "Only organization admins can manage billing", 403);
      return;
    }

    // Get organization details
    const { data: organization, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id, name, stripe_customer_id")
      .eq("id", org_id)
      .single();

    if (orgError || !organization) {
      sendError(res, "Organization not found", 404);
      return;
    }

    // Create or retrieve Stripe customer
    let customerId = organization.stripe_customer_id;

    if (!customerId) {
      // Get user email
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
        userId
      );
      const userEmail = userData?.user?.email;

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          org_id: organization.id,
          user_id: userId,
        },
        name: organization.name,
      });

      customerId = customer.id;

      // Update organization with Stripe customer ID
      const { error: updateError } = await supabaseAdmin
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", org_id);

      if (updateError) {
        console.error(
          "Error updating organization with stripe_customer_id:",
          updateError
        );
      }
    }

    // Check for existing active subscriptions
    const { data: existingSubscriptions, error: existingSubError } =
      await supabaseAdmin
        .from("subscriptions")
        .select("stripe_subscription_id, status")
        .eq("org_id", org_id)
        .in("status", ["active", "trialing", "past_due"]);

    if (
      !existingSubError &&
      existingSubscriptions &&
      existingSubscriptions.length > 0
    ) {
      console.log(
        `⚠️ Organization ${org_id} already has ${existingSubscriptions.length} active subscription(s)`
      );

      // Cancel all existing subscriptions in Stripe before creating new one
      for (const existingSub of existingSubscriptions) {
        if (existingSub.stripe_subscription_id) {
          try {
            console.log(
              `🗑️ Canceling existing subscription: ${existingSub.stripe_subscription_id}`
            );
            await stripe.subscriptions.cancel(
              existingSub.stripe_subscription_id
            );
            console.log(
              `✅ Canceled old subscription: ${existingSub.stripe_subscription_id}`
            );
          } catch (cancelError: any) {
            console.error(
              `Error canceling subscription ${existingSub.stripe_subscription_id}:`,
              cancelError.message
            );
          }
        }
      }
    }

    // Get plan code from price ID for metadata
    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("code")
      .eq("metadata->>price_id", price_id)
      .single();

    const planCode = plan?.code || "unknown";

    // Create subscription with payment_behavior='default_incomplete'
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price_id }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
      metadata: {
        org_id: organization.id,
        user_id: userId,
        plan_code: planCode,
      },
    });

    console.log("✅ Subscription created:", subscription.id);

    // Try PaymentIntent path first (first invoice requires payment)
    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    const pi = (latestInvoice as any)?.payment_intent as
      | Stripe.PaymentIntent
      | null
      | undefined;

    if (pi?.client_secret) {
      console.log("💳 Returning PaymentIntent client_secret");
      sendSuccess(
        res,
        {
          subscriptionId: subscription.id,
          clientSecret: pi.client_secret,
          flow: "payment_intent",
        },
        "Subscription intent created successfully"
      );
      return;
    }

    // If first invoice is $0 (trial/coupon), a SetupIntent will exist
    const si = subscription.pending_setup_intent as Stripe.SetupIntent | null;

    if (si?.client_secret) {
      console.log("🔧 Returning SetupIntent client_secret (trial/coupon)");
      sendSuccess(
        res,
        {
          subscriptionId: subscription.id,
          clientSecret: si.client_secret,
          flow: "setup_intent",
        },
        "Subscription intent created successfully"
      );
      return;
    }

    // Defensive: expand invoice again if needed
    if (latestInvoice?.id) {
      console.log("🔄 Attempting fallback: re-fetching invoice");
      const refreshed = await stripe.invoices.retrieve(latestInvoice.id, {
        expand: ["payment_intent"],
      });
      const fallbackPi = (refreshed as any).payment_intent as
        | Stripe.PaymentIntent
        | null
        | undefined;

      if (fallbackPi?.client_secret) {
        console.log("💳 Returning PaymentIntent client_secret (fallback)");
        sendSuccess(
          res,
          {
            subscriptionId: subscription.id,
            clientSecret: fallbackPi.client_secret,
            flow: "payment_intent",
          },
          "Subscription intent created successfully"
        );
        return;
      }
    }

    console.error("❌ Could not obtain client_secret from subscription");
    sendError(
      res,
      "Could not obtain client secret for subscription checkout",
      500
    );
  } catch (error: any) {
    console.error("Error creating subscription intent:", error);
    sendError(res, error.message || "Failed to create subscription intent", 500);
  }
};

// =====================================================
// BILLING PORTAL
// =====================================================

export const createPortalSession = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!stripe) {
      sendError(res, "Billing is not configured. Please contact support.", 503);
      return;
    }

    const userId = req.user!.id;
    const { org_id } = req.body;

    if (!org_id) {
      sendError(res, "org_id is required", 400);
      return;
    }

    // Verify user is admin of the organization
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

    // Only admins can access billing portal
    if (!["SuperAdmin", "Admin", "admin"].includes(member.role)) {
      sendError(res, "Only organization admins can access billing settings", 403);
      return;
    }

    // Get organization's Stripe customer ID
    const { data: organization, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", org_id)
      .single();

    if (orgError || !organization) {
      sendError(res, "Organization not found", 404);
      return;
    }

    if (!organization.stripe_customer_id) {
      sendError(res, "No billing account found for this organization", 400);
      return;
    }

    // Create Stripe billing portal session
    const returnUrl = `${req.headers.origin || "http://localhost:3000"}/settings/billing/${org_id}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripe_customer_id,
      return_url: returnUrl,
    });

    sendSuccess(res, { url: session.url }, "Portal session created successfully");
  } catch (error: any) {
    console.error("Error creating portal session:", error);
    sendError(res, error.message || "Failed to create portal session", 500);
  }
};

// =====================================================
// SUBSCRIPTION UPDATE
// =====================================================

export const updateSubscription = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!stripe) {
      sendError(res, "Billing is not configured. Please contact support.", 503);
      return;
    }

    const userId = req.user!.id;
    const { org_id, new_price_id } = req.body;

    if (!org_id || !new_price_id) {
      sendError(res, "Organization ID and new price ID are required", 400);
      return;
    }

    // Verify user has admin access to this organization
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", org_id)
      .eq("user_id", userId)
      .single();

    if (memberError || !membership) {
      sendError(res, "You do not have access to this organization", 403);
      return;
    }

    if (!["SuperAdmin", "Admin"].includes(membership.role)) {
      sendError(res, "Only organization admins can manage billing", 403);
      return;
    }

    // Get current subscription
    const { data: subscriptionData, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("org_id", org_id)
      .in("status", ["active", "trialing"])
      .single();

    if (subError || !subscriptionData?.stripe_subscription_id) {
      sendError(
        res,
        "No active subscription found. Please create a new subscription.",
        404
      );
      return;
    }

    // Get the current subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(
      subscriptionData.stripe_subscription_id
    );

    // Update the subscription with the new price
    const updatedSubscription = await stripe.subscriptions.update(
      subscriptionData.stripe_subscription_id,
      {
        items: [
          {
            id: subscription.items.data[0].id,
            price: new_price_id,
          },
        ],
        proration_behavior: "create_prorations",
      }
    );

    console.log("✅ Subscription updated:", updatedSubscription.id);

    sendSuccess(
      res,
      {
        success: true,
        subscription_id: updatedSubscription.id,
      },
      "Subscription updated successfully"
    );
  } catch (error: any) {
    console.error("Error updating subscription:", error);
    sendError(res, error.message || "Failed to update subscription", 500);
  }
};

// =====================================================
// WEBHOOK HANDLING
// =====================================================

export const handleWebhook = async (
  req: any,
  res: Response
): Promise<void> => {
  try {
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      sendError(res, "No signature provided", 400);
      return;
    }

    if (!stripe) {
      sendError(res, "Stripe is not configured", 500);
      return;
    }

    if (!webhookSecret) {
      sendError(res, "Webhook secret not configured", 500);
      return;
    }

    let event: Stripe.Event;

    try {
      // req.body is already the raw body string from middleware
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      sendError(res, `Webhook Error: ${err.message}`, 400);
      return;
    }

    // Handle the event
    switch (event.type) {
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(
          event.data.object as Stripe.Invoice,
          stripe
        );
        break;

      case "invoice.paid":
        await handleInvoicePaymentSucceeded(
          event.data.object as Stripe.Invoice,
          stripe
        );
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(
          event.data.object as Stripe.Subscription,
          stripe
        );
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          stripe
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default: {
        if (process.env.NODE_ENV === "development") {
          console.log(`Unhandled event type: ${event.type}`);
        }
        break;
      }
    }

    sendSuccess(res, { received: true }, "Webhook processed successfully");
  } catch (error: any) {
    console.error("Webhook error:", error);
    sendError(res, error.message || "Webhook handler failed", 500);
  }
};

// =====================================================
// WEBHOOK EVENT HANDLERS
// =====================================================

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  stripeClient: Stripe
) {
  console.log("💰 Invoice payment succeeded:", invoice.id);

  const resolveSubscriptionId = async (): Promise<string | null> => {
    const invoiceAny = invoice as any;
    if (invoiceAny.subscription) {
      return typeof invoiceAny.subscription === "string"
        ? invoiceAny.subscription
        : invoiceAny.subscription.id;
    }

    const lineWithSub: any | undefined = invoice.lines?.data?.find(
      (l: any) => !!l.subscription
    );
    if (lineWithSub?.subscription) {
      return typeof lineWithSub.subscription === "string"
        ? lineWithSub.subscription
        : lineWithSub.subscription.id;
    }

    try {
      const full = await stripeClient.invoices.retrieve(invoice.id, {
        expand: ["subscription", "lines.data.subscription"],
      });
      const fullAny = full as any;
      if (fullAny.subscription) {
        return typeof fullAny.subscription === "string"
          ? fullAny.subscription
          : fullAny.subscription.id;
      }
      const expandedLine: any | undefined = full.lines?.data?.find(
        (l: any) => !!l.subscription
      );
      if (expandedLine?.subscription) {
        return typeof expandedLine.subscription === "string"
          ? expandedLine.subscription
          : expandedLine.subscription.id;
      }
    } catch (e) {
      console.warn(
        "Failed to refetch invoice for subscription linkage:",
        invoice.id,
        e
      );
    }

    try {
      if (invoice.customer && typeof invoice.customer === "string") {
        const subs = await stripeClient.subscriptions.list({
          customer: invoice.customer,
          status: "all",
          limit: 10,
          expand: ["data.items.data.price"],
        });
        const invPriceId = (invoice.lines?.data?.[0] as any)?.price?.id;
        const match = subs.data.find((s) =>
          s.items.data.some((it) => it.price?.id === invPriceId)
        );
        if (match) return match.id;
      }
    } catch (e) {
      console.warn("Failed to infer subscription from customer:", invoice.id, e);
    }

    return null;
  };

  const subscriptionId = await resolveSubscriptionId();
  if (!subscriptionId) {
    console.warn("Unable to associate invoice with a subscription:", invoice.id);
    return;
  }

  try {
    const existingSubscription = await getSubscriptionByStripeId(subscriptionId);

    if (existingSubscription) {
      await updateSubscriptionStatus(
        subscriptionId,
        "active",
        new Date(invoice.period_end * 1000)
      );
      console.log("✅ Subscription activated:", subscriptionId);
    } else {
      const stripeSubscription =
        await stripeClient.subscriptions.retrieve(subscriptionId);
      const orgId = stripeSubscription.metadata?.org_id;

      if (orgId) {
        await createSubscriptionRecord(orgId, stripeSubscription);
        console.log("✅ Subscription created and activated:", subscriptionId);
      } else {
        console.error("Cannot create subscription: missing org_id in metadata");
      }
    }
  } catch (error) {
    console.error("Error handling invoice.payment_succeeded:", error);
    throw error;
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log("❌ Invoice payment failed:", invoice.id);

  const invoiceAny = invoice as any;
  if (!invoiceAny.subscription) {
    return;
  }

  const subscriptionId =
    typeof invoiceAny.subscription === "string"
      ? invoiceAny.subscription
      : invoiceAny.subscription.id;

  try {
    await updateSubscriptionStatus(subscriptionId, "past_due");
    console.log("⚠️ Subscription marked as past_due:", subscriptionId);
  } catch (error) {
    console.error("Error handling invoice.payment_failed:", error);
    throw error;
  }
}

async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  stripeClient: Stripe
) {
  console.log("✅ Subscription created:", subscription.id);

  try {
    const orgId = subscription.metadata?.org_id;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    if (!orgId) {
      console.error("Cannot create subscription: missing org_id in metadata");
      return;
    }

    const existingSubscription = await getSubscriptionByStripeId(subscription.id);

    if (!existingSubscription) {
      const { data: activeSubscriptions, error: subError } = await supabaseAdmin
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("org_id", orgId)
        .in("status", ["active", "trialing"])
        .neq("stripe_subscription_id", subscription.id);

      if (!subError && activeSubscriptions && activeSubscriptions.length > 0) {
        console.log(
          `⚠️ Found ${activeSubscriptions.length} existing active subscription(s) for org ${orgId}`
        );

        for (const oldSub of activeSubscriptions) {
          if (oldSub.stripe_subscription_id) {
            try {
              console.log(
                `🗑️ Canceling old subscription in Stripe: ${oldSub.stripe_subscription_id}`
              );
              await stripeClient.subscriptions.cancel(
                oldSub.stripe_subscription_id
              );
              console.log(
                `✅ Successfully canceled old subscription: ${oldSub.stripe_subscription_id}`
              );
            } catch (cancelError: any) {
              console.error(
                `❌ Error canceling old subscription ${oldSub.stripe_subscription_id}:`,
                cancelError.message
              );
            }
          }
        }
      }
    }

    await updateOrgStripeCustomer(orgId, customerId);
    await createSubscriptionRecord(orgId, subscription);

    console.log("✅ Subscription record synced:", subscription.id);
  } catch (error) {
    console.error("Error handling customer.subscription.created:", error);
    throw error;
  }
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  _stripeClient: Stripe
) {
  console.log("🔄 Subscription updated:", subscription.id);

  try {
    const existing = await getSubscriptionByStripeId(subscription.id);

    if (existing) {
      await updateSubscriptionRecord(subscription.id, subscription);
      console.log("✅ Subscription record updated:", subscription.id);
    } else {
      const orgId = subscription.metadata?.org_id;
      if (orgId) {
        await createSubscriptionRecord(orgId, subscription);
        console.log("✅ Subscription record created from update:", subscription.id);
      } else {
        console.error(
          "Cannot create subscription from update: missing org_id in metadata"
        );
      }
    }
  } catch (error) {
    console.error("Error handling customer.subscription.updated:", error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("🗑️ Subscription deleted:", subscription.id);

  try {
    await cancelSubscriptionRecord(subscription.id);
    console.log("✅ Subscription marked as canceled:", subscription.id);
  } catch (error) {
    console.error("Error handling customer.subscription.deleted:", error);
    throw error;
  }
}

