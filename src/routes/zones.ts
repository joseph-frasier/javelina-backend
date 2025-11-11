import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import * as controller from "../controllers/zonesController";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Zone routes
router.get("/", asyncHandler(controller.listZones));
router.post("/", asyncHandler(controller.createZone));
router.get(
  "/environment/:envId",
  asyncHandler(controller.listZonesByEnvironment)
);
router.get("/:id", asyncHandler(controller.getZone));
router.put("/:id", asyncHandler(controller.updateZone));
router.delete("/:id", asyncHandler(controller.deleteZone));
router.post("/:id/verify", asyncHandler(controller.verifyZone));

export default router;
