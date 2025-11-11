import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import * as controller from "../controllers/dnsRecordsController";

const router = Router();

// All routes require authentication
router.use(authenticate);

// DNS record routes
router.get("/zone/:zoneId", asyncHandler(controller.listDNSRecordsByZone));
router.post("/", asyncHandler(controller.createDNSRecord));
router.get("/:id", asyncHandler(controller.getDNSRecord));
router.put("/:id", asyncHandler(controller.updateDNSRecord));
router.delete("/:id", asyncHandler(controller.deleteDNSRecord));

export default router;
