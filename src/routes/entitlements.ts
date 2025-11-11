import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { checkEntitlement } from "../controllers/entitlementsController";

const router = Router();

/**
 * GET /api/entitlements/check?org_id=X&entitlement_key=Y
 * Check a specific entitlement for an organization
 * Protected route - requires authentication
 */
router.get(
  "/check",
  authenticate,
  asyncHandler(checkEntitlement)
);

export default router;

