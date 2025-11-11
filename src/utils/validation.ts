import { ValidationError } from "../types";

export const validateRequired = (
  fields: Record<string, any>,
  requiredFields: string[]
): void => {
  const missing = requiredFields.filter(
    (field) =>
      fields[field] === undefined ||
      fields[field] === null ||
      fields[field] === ""
  );

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(", ")}`);
  }
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateUUID = (uuid: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

export const validateDomainName = (domain: string): boolean => {
  const domainRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return domainRegex.test(domain) && domain.length <= 253;
};

export const sanitizeString = (str: string, maxLength?: number): string => {
  let sanitized = str.trim();
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  return sanitized;
};

export const validateOrganizationName = (name: string): void => {
  const nameRegex = /^[a-zA-Z0-9\s\-_]{1,100}$/;
  if (!nameRegex.test(name)) {
    throw new ValidationError(
      "Organization name must be 1-100 characters and contain only letters, numbers, spaces, hyphens, and underscores"
    );
  }
};

export const validateEnvironmentType = (
  type: string
): type is "production" | "staging" | "development" => {
  return ["production", "staging", "development"].includes(type);
};

export const validateZoneType = (
  type: string
): type is "primary" | "secondary" | "redirect" => {
  return ["primary", "secondary", "redirect"].includes(type);
};

export const validateDNSRecordType = (
  type: string
): type is
  | "A"
  | "AAAA"
  | "CNAME"
  | "MX"
  | "NS"
  | "TXT"
  | "SOA"
  | "SRV"
  | "CAA" => {
  return [
    "A",
    "AAAA",
    "CNAME",
    "MX",
    "NS",
    "TXT",
    "SOA",
    "SRV",
    "CAA",
  ].includes(type);
};
