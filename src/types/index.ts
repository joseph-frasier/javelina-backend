import { Request } from "express";

// Extend Express Request to include user
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Error Types
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(400, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

// Database Types (matching Supabase schema)
export type OrganizationRole = "SuperAdmin" | "Admin" | "Editor" | "Viewer";
export type EnvironmentType = "production" | "staging" | "development";
export type EnvironmentStatus = "active" | "disabled" | "archived";
export type ZoneType = "primary" | "secondary" | "redirect";
export type VerificationStatus =
  | "verified"
  | "pending"
  | "failed"
  | "unverified";
export type DNSRecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "MX"
  | "NS"
  | "TXT"
  | "SOA"
  | "SRV"
  | "CAA";
// Removed RecordStatus - using active boolean instead
export type AuditAction = "INSERT" | "UPDATE" | "DELETE";

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  created_at: string;
}

export interface Environment {
  id: string;
  organization_id: string;
  name: string;
  environment_type: EnvironmentType;
  location: string | null;
  status: EnvironmentStatus;
  description: string | null;
  health_status?: "healthy" | "degraded" | "down" | "unknown";
  last_deployed_at?: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Zone {
  id: string;
  environment_id: string;
  name: string;
  zone_type: ZoneType;
  description: string | null;
  active: boolean;
  verification_status?: VerificationStatus;
  last_verified_at?: string | null;
  nameservers?: string[] | null;
  ttl?: number | null;
  records_count?: number | null;
  soa_serial?: number;
  metadata?: any;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface DNSRecord {
  id: string;
  zone_id: string;
  name: string;
  type: DNSRecordType;
  value: string;
  ttl: number;
  priority: number | null;
  active: boolean;
  comment: string | null;
  metadata: any;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  display_name: string | null;
  title: string | null;
  phone: string | null;
  timezone: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: "user" | "superuser";
  mfa_enabled: boolean | null;
  sso_connected: boolean | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: AuditAction;
  old_data: any;
  new_data: any;
  user_id: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: any;
  created_at: string;
}
