import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  getCurrentSubscription,
  canCreateResource,
  getSubscriptionStatus,
  getAllOrganizationsWithSubscriptions,
} from "../controllers/subscriptionsController";

const router = Router();

/**
 * GET /api/subscriptions/current?org_id=X
 * Get current subscription for an organization
 * Protected route - requires authentication
 */
router.get(
  "/current",
  authenticate,
  asyncHandler(getCurrentSubscription)
);

/**
 * GET /api/subscriptions/can-create?org_id=X&resource_type=Y
 * Check if organization can create a resource
 * Protected route - requires authentication
 */
router.get(
  "/can-create",
  authenticate,
  asyncHandler(canCreateResource)
);

/**
 * GET /api/subscriptions/status?org_id=X
 * Get subscription status for an organization
 * Protected route - requires authentication
 */
router.get(
  "/status",
  authenticate,
  asyncHandler(getSubscriptionStatus)
);

/**
 * GET /api/subscriptions/all
 * Get all user's organizations with subscription data
 * Protected route - requires authentication
 * Used by settings page to show billing for all orgs user has admin access to
 */
router.get(
  "/all",
  authenticate,
  asyncHandler(getAllOrganizationsWithSubscriptions)
);

export default router;

