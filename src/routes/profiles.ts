import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import * as controller from "../controllers/profilesController";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Profile routes
router.get("/me", asyncHandler(controller.getCurrentProfile));
router.put("/me", asyncHandler(controller.updateCurrentProfile));
router.get("/:id", asyncHandler(controller.getProfile));

export default router;
