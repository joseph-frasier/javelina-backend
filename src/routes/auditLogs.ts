import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import * as controller from "../controllers/auditLogsController";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Audit log routes (read-only)
router.get("/", asyncHandler(controller.listAuditLogs));
router.get(
  "/resource/:resourceId",
  asyncHandler(controller.getResourceAuditLogs)
);
router.get("/user/:userId", asyncHandler(controller.getUserAuditLogs));

export default router;
