import Stripe from "stripe";
import { env } from "./env";

/**
 * Stripe configuration for backend API
 * Uses STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET from environment
 */

export const STRIPE_API_VERSION = "2024-06-20" as const;

// Initialize Stripe client if secret key is provided
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION as any,
    })
  : null;

export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

// Validate configuration on startup
if (process.env.NODE_ENV !== "production") {
  if (stripe) {
    console.log(`✅ Stripe client initialized with API version: ${STRIPE_API_VERSION}`);
  } else {
    console.warn("⚠️ Stripe is not configured. Billing features will be disabled.");
  }

  if (!webhookSecret && stripe) {
    console.warn("⚠️ STRIPE_WEBHOOK_SECRET not set. Webhook verification will fail.");
  }
}

