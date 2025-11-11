import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import * as controller from "../controllers/environmentsController";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Environment routes
router.get("/", asyncHandler(controller.listEnvironments));
router.post("/", asyncHandler(controller.createEnvironment));
router.get(
  "/organization/:orgId",
  asyncHandler(controller.listEnvironmentsByOrganization)
);
router.get("/:id", asyncHandler(controller.getEnvironment));
router.put("/:id", asyncHandler(controller.updateEnvironment));
router.delete("/:id", asyncHandler(controller.deleteEnvironment));

export default router;
