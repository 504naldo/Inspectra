import { describe, it, expect } from 'vitest';
import { resolveOAuthRedirectTarget } from './_core/oauth';

/**
 * Unit tests for OAuth callback role-based redirect logic.
 *
 * These exercise the real exported resolveOAuthRedirectTarget() from
 * server/_core/oauth.ts (previously this file re-implemented the logic as a
 * local copy, which had drifted: it asserted customer -> '/customer', but the
 * real code redirects customers to '/forbidden' since the customer portal is
 * disabled). Testing the real function closes that gap.
 */
describe('resolveOAuthRedirectTarget', () => {
  describe('role-based redirect when state route is empty', () => {
    it('redirects admin users to /admin', () => {
      expect(resolveOAuthRedirectTarget('', 'admin')).toBe('/admin');
    });

    it('redirects office users to /admin', () => {
      expect(resolveOAuthRedirectTarget('', 'office')).toBe('/admin');
    });

    it('redirects technician users to /tech/jobs', () => {
      expect(resolveOAuthRedirectTarget('', 'technician')).toBe('/tech/jobs');
    });

    it('redirects customer users to /forbidden (customer portal disabled)', () => {
      expect(resolveOAuthRedirectTarget('', 'customer')).toBe('/forbidden');
    });

    it('redirects unknown roles to /admin (fallback)', () => {
      expect(resolveOAuthRedirectTarget('', 'unknown')).toBe('/admin');
    });

    it('redirects undefined roles to /admin (fallback)', () => {
      expect(resolveOAuthRedirectTarget('', undefined)).toBe('/admin');
    });
  });

  describe('role-based redirect when state route is "/"', () => {
    it('redirects admin users to /admin when state route is "/"', () => {
      expect(resolveOAuthRedirectTarget('/', 'admin')).toBe('/admin');
    });

    it('redirects technician users to /tech/jobs when state route is "/"', () => {
      expect(resolveOAuthRedirectTarget('/', 'technician')).toBe('/tech/jobs');
    });

    it('redirects customer users to /forbidden when state route is "/"', () => {
      expect(resolveOAuthRedirectTarget('/', 'customer')).toBe('/forbidden');
    });
  });

  describe('respects an explicit safe return route in state', () => {
    it('redirects to /tech/jobs/123 if explicitly specified', () => {
      expect(resolveOAuthRedirectTarget('/tech/jobs/123', 'technician')).toBe('/tech/jobs/123');
    });

    it('redirects to /admin/users if explicitly specified', () => {
      expect(resolveOAuthRedirectTarget('/admin/users', 'admin')).toBe('/admin/users');
    });

    it('blocks /customer/* return routes regardless of role (portal disabled)', () => {
      expect(resolveOAuthRedirectTarget('/customer/reports', 'admin')).toBe('/forbidden');
      expect(resolveOAuthRedirectTarget('/customer/reports', 'customer')).toBe('/forbidden');
    });
  });

  describe('security — prevent open redirects', () => {
    it('falls back to role-based dashboard for protocol-relative URLs', () => {
      expect(resolveOAuthRedirectTarget('//evil.com', 'admin')).toBe('/admin');
    });

    it('falls back to role-based dashboard for absolute URLs', () => {
      expect(resolveOAuthRedirectTarget('https://evil.com', 'technician')).toBe('/tech/jobs');
    });
  });
});
