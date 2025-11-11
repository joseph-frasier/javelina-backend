import express, { Application } from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { corsMiddleware } from "./middleware/cors";
import { requestLogger } from "./middleware/logger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import routes from "./routes";

// Initialize Express app
const app: Application = express();

// Security middleware
app.use(helmet());

// CORS middleware
app.use(corsMiddleware);

// Request logging
app.use(requestLogger);

// Special handling for Stripe webhooks - needs raw body
app.use(
  "/api/stripe/webhooks",
  express.raw({ type: "application/json" })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// API routes
app.use("/api", routes);

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "Javelina DNS Management API",
    version: "1.0.0",
    status: "running",
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = env.port;
const server = app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log("🚀 Javelina Backend API Server");
  console.log("=".repeat(50));
  console.log(`Environment: ${env.nodeEnv}`);
  console.log(`Port: ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log("=".repeat(50));
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

export default app;
