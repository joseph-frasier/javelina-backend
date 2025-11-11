import { Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AuthenticatedRequest, AuthError } from "../types";

/**
 * Middleware to validate Supabase JWT token and attach user to request
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthError("Missing or invalid authorization header");
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate token with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      throw new AuthError("Invalid or expired token");
    }

    // Attach user to request object
    req.user = {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role || user.app_metadata?.role,
    };

    next();
  } catch (error) {
    if (error instanceof AuthError) {
      next(error);
    } else {
      next(new AuthError("Authentication failed"));
    }
  }
};

/**
 * Optional authentication - attaches user if token is present but doesn't fail if not
 */
export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(token);

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.user_metadata?.role || user.app_metadata?.role,
        };
      }
    }

    next();
  } catch (error) {
    // Silent fail for optional auth
    next();
  }
};
