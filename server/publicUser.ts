import type { User } from "../drizzle/schema";

/** Public profile allowlist. Internal auth/Workspace and push credentials stay server-side. */
export function toPublicUser(user: User) {
  const {
    id,
    openId,
    name,
    email,
    loginMethod,
    role,
    isActive,
    companyId,
    customerOrgId,
    createdAt,
    updatedAt,
    lastSignedIn,
    seenAssignmentsAt,
    certNumber,
    certificationLevel,
    certExpiry,
    isOnCall,
    onCallUntil,
  } = user;
  return {
    id,
    openId,
    name,
    email,
    loginMethod,
    role,
    isActive,
    companyId,
    customerOrgId,
    createdAt,
    updatedAt,
    lastSignedIn,
    seenAssignmentsAt,
    certNumber,
    certificationLevel,
    certExpiry,
    isOnCall,
    onCallUntil,
  };
}
