import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import * as controller from "../controllers/organizationsController";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Organization routes
router.get("/", asyncHandler(controller.listOrganizations));
router.post("/", asyncHandler(controller.createOrganization));
router.get("/:id", asyncHandler(controller.getOrganization));
router.put("/:id", asyncHandler(controller.updateOrganization));
router.delete("/:id", asyncHandler(controller.deleteOrganization));
router.get("/:id/members", asyncHandler(controller.getOrganizationMembers));

export default router;
