import { Router } from "express";
import { getAllPlans, getPlanByCode } from "../controllers/plansController";
import { authenticate } from "../middleware/auth";

const router = Router();

/**
 * GET /api/plans
 * Get all active plans with their entitlements
 */
router.get("/", authenticate, getAllPlans);

/**
 * GET /api/plans/:code
 * Get a specific plan by code
 */
router.get("/:code", authenticate, getPlanByCode);

export default router;

