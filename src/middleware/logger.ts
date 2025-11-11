import morgan from "morgan";
import { Request } from "express";
import { env } from "../config/env";

/**
 * Configure morgan logger based on environment
 */
export const requestLogger = morgan(
  env.nodeEnv === "production" ? "combined" : "dev",
  {
    skip: (req: Request) => {
      // Skip logging for health check endpoints to reduce noise
      return req.path === "/api/health" || req.path === "/api/health/ping";
    },
  }
);
