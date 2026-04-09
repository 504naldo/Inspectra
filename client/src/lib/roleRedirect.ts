/**
 * Role-based redirect utility
 * Determines the appropriate landing page for each user role
 */

export type UserRole = 'admin' | 'office' | 'technician' | 'customer';

/**
 * Get the default landing page for a given user role
 * @param role User role (may be undefined or invalid)
 * @returns The appropriate landing page path
 */
export function getRoleBasedPath(role?: string): string {
  // Handle missing or invalid roles
  if (!role) {
    console.warn('[roleRedirect] Missing user role, redirecting to home');
    return '/';
  }

  switch (role) {
    case 'admin':
    case 'office':
      return '/admin';
    case 'technician':
      return '/tech/jobs';
    case 'customer':
      return '/customer';
    default:
      // Fallback for unknown roles
      console.warn(`[roleRedirect] Unknown user role: ${role}, redirecting to home`);
      return '/';
  }
}

/**
 * Get the redirect path after login, respecting returnTo parameter
 * @param role User role (may be undefined or invalid)
 * @param returnTo Optional path to return to after login
 * @returns The path to redirect to
 */
export function getPostLoginPath(role?: string, returnTo?: string): string {
  // If returnTo is provided and not the login, home, or customer portal path, use it
  if (returnTo && returnTo !== '/' && returnTo !== '/login') {
    return returnTo;
  }
  
  // Otherwise, use role-based default
  return getRoleBasedPath(role);
}
