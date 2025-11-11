import { Router, Request, Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { sendSuccess, sendError } from "../utils/response";
import { AuthenticatedRequest } from "../types";

const router = Router();

/**
 * GET /api/health
 * Basic health check
 */
router.get("/", (_req: Request, res: Response) => {
  sendSuccess(
    res,
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    "Service is healthy"
  );
});

/**
 * GET /api/health/ping
 * Simple ping endpoint
 */
router.get("/ping", (_req: Request, res: Response) => {
  sendSuccess(res, { message: "pong" });
});

/**
 * GET /api/health/db
 * Test database connection
 */
router.get(
  "/db",
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      // Simple query to test database connection
      const { error } = await supabaseAdmin
        .from("profiles")
        .select("count")
        .limit(1);

      if (error) {
        throw error;
      }

      sendSuccess(
        res,
        {
          database: "connected",
          timestamp: new Date().toISOString(),
        },
        "Database connection successful"
      );
    } catch (error: any) {
      sendError(res, `Database connection failed: ${error.message}`, 503);
    }
  })
);

/**
 * GET /api/health/auth
 * Test authentication middleware (protected route)
 */
router.get(
  "/auth",
  authenticate,
  (req: AuthenticatedRequest, res: Response) => {
    sendSuccess(
      res,
      {
        authenticated: true,
        user: req.user,
        timestamp: new Date().toISOString(),
      },
      "Authentication successful"
    );
  }
);

export default router;
