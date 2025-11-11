import cors from "cors";
import { env } from "../config/env";

/**
 * Configure CORS middleware
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) {
      return callback(null, true);
    }

    // Build allowed origins based on environment
    const allowedOrigins: string[] = [];
    
    // Always add the configured frontend URL
    allowedOrigins.push(env.frontendUrl);
    
    // In development, also allow localhost variants
    if (env.nodeEnv === "development") {
      allowedOrigins.push(
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001"
      );
    }

    // Log for debugging (remove in production if desired)
    if (env.nodeEnv === "development") {
      console.log(`CORS check: origin=${origin}, allowed=${allowedOrigins.join(", ")}`);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 600, // 10 minutes
});
