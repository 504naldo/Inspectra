import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRoleBasedPath, getPostLoginPath } from '../client/src/lib/roleRedirect';

describe('roleRedirect', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('getRoleBasedPath', () => {
    it('should return /admin for admin role', () => {
      expect(getRoleBasedPath('admin')).toBe('/admin');
    });

    it('should return /admin for office role', () => {
      expect(getRoleBasedPath('office')).toBe('/admin');
    });

    it('should return /tech/jobs for technician role', () => {
      expect(getRoleBasedPath('technician')).toBe('/tech/jobs');
    });

    it('should return /customer for customer role', () => {
      expect(getRoleBasedPath('customer')).toBe('/customer');
    });

    it('should return / and warn for missing role', () => {
      expect(getRoleBasedPath(undefined)).toBe('/');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[roleRedirect] Missing user role, redirecting to home');
    });

    it('should return / and warn for unknown role', () => {
      expect(getRoleBasedPath('unknown')).toBe('/');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[roleRedirect] Unknown user role: unknown, redirecting to home');
    });
  });

  describe('getPostLoginPath', () => {
    it('should return returnTo path if provided and not home or login', () => {
      expect(getPostLoginPath('admin', '/admin/reports')).toBe('/admin/reports');
      expect(getPostLoginPath('technician', '/tech/jobs/123')).toBe('/tech/jobs/123');
    });

    it('should ignore returnTo if it is home page', () => {
      expect(getPostLoginPath('admin', '/')).toBe('/admin');
    });

    it('should ignore returnTo if it is login page', () => {
      expect(getPostLoginPath('technician', '/login')).toBe('/tech/jobs');
    });

    it('should return role-based path if no returnTo provided', () => {
      expect(getPostLoginPath('admin')).toBe('/admin');
      expect(getPostLoginPath('technician')).toBe('/tech/jobs');
      expect(getPostLoginPath('customer')).toBe('/customer');
    });

    it('should handle missing role gracefully', () => {
      expect(getPostLoginPath(undefined, '/some/path')).toBe('/some/path');
      expect(getPostLoginPath(undefined)).toBe('/');
    });
  });
});
