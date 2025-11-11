import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createSubscriptionIntent,
  createPortalSession,
  updateSubscription,
  handleWebhook,
} from "../controllers/stripeController";

const router = Router();

/**
 * POST /api/stripe/subscriptions
 * Create a new subscription intent
 * Protected route - requires authentication
 */
router.post(
  "/subscriptions",
  authenticate,
  asyncHandler(createSubscriptionIntent)
);

/**
 * POST /api/stripe/portal-session
 * Create a billing portal session
 * Protected route - requires authentication
 */
router.post(
  "/portal-session",
  authenticate,
  asyncHandler(createPortalSession)
);

/**
 * PUT /api/stripe/subscriptions/:id
 * Update an existing subscription
 * Protected route - requires authentication
 */
router.put(
  "/subscriptions/:id",
  authenticate,
  asyncHandler(updateSubscription)
);

/**
 * POST /api/stripe/webhooks
 * Handle Stripe webhooks
 * Public route - uses Stripe signature for verification
 * 
 * NOTE: This route needs raw body parsing, which is handled
 * by a special middleware in index.ts
 */
router.post(
  "/webhooks",
  asyncHandler(handleWebhook)
);

export default router;

