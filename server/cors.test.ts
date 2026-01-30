import { describe, it, expect } from 'vitest';

/**
 * Unit tests for CORS origin validation
 * Tests the regex patterns used in server/_core/index.ts
 */

describe('CORS Origin Validation', () => {
  // These are the patterns from server/_core/index.ts
  const allowedOrigins = [
    /^https:\/\/[a-zA-Z0-9-]+\.manus\.space$/,
    /^https:\/\/[0-9]+-[a-zA-Z0-9-]+\.manusvm\.computer$/,  // Old dev server URLs
    /^https:\/\/[0-9]+-[a-zA-Z0-9-]+\.[a-z0-9]+\.manus\.computer$/,  // New dev server URLs
    /^http:\/\/localhost:\d+$/,
    /^https:\/\/localhost:\d+$/,
  ];

  function isOriginAllowed(origin: string): boolean {
    return allowedOrigins.some(pattern => pattern.test(origin));
  }

  describe('manus.space domains', () => {
    it('should allow valid manus.space subdomains', () => {
      expect(isOriginAllowed('https://fire-inspect.manus.space')).toBe(true);
      expect(isOriginAllowed('https://my-app-123.manus.space')).toBe(true);
      expect(isOriginAllowed('https://test.manus.space')).toBe(true);
    });

    it('should reject invalid manus.space domains', () => {
      expect(isOriginAllowed('http://fire-inspect.manus.space')).toBe(false); // http not https
      expect(isOriginAllowed('https://manus.space')).toBe(false); // no subdomain
      expect(isOriginAllowed('https://fire-inspect.manus.space.evil.com')).toBe(false); // subdomain attack
    });
  });

  describe('manusvm.computer domains (old format)', () => {
    it('should allow valid old dev server URLs', () => {
      expect(isOriginAllowed('https://3000-abc123def456.manusvm.computer')).toBe(true);
      expect(isOriginAllowed('https://8080-test123.manusvm.computer')).toBe(true);
    });

    it('should reject invalid old dev server URLs', () => {
      expect(isOriginAllowed('http://3000-abc123.manusvm.computer')).toBe(false); // http not https
      expect(isOriginAllowed('https://manusvm.computer')).toBe(false); // no port prefix
    });
  });

  describe('manus.computer domains (new format)', () => {
    it('should allow valid new dev server URLs', () => {
      expect(isOriginAllowed('https://3000-i9gxhbepst24hs1ejj9vo-38c1ab26.us2.manus.computer')).toBe(true);
      expect(isOriginAllowed('https://8080-abc123def456.eu1.manus.computer')).toBe(true);
      expect(isOriginAllowed('https://3000-test.dev.manus.computer')).toBe(true);
    });

    it('should reject invalid new dev server URLs', () => {
      expect(isOriginAllowed('http://3000-test.us2.manus.computer')).toBe(false); // http not https
      expect(isOriginAllowed('https://manus.computer')).toBe(false); // no port prefix
      expect(isOriginAllowed('https://3000-test.US2.manus.computer')).toBe(false); // uppercase region
    });
  });

  describe('localhost domains', () => {
    it('should allow localhost with any port (http)', () => {
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(isOriginAllowed('http://localhost:8080')).toBe(true);
      expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    });

    it('should allow localhost with any port (https)', () => {
      expect(isOriginAllowed('https://localhost:3000')).toBe(true);
      expect(isOriginAllowed('https://localhost:8080')).toBe(true);
    });

    it('should reject localhost without port', () => {
      expect(isOriginAllowed('http://localhost')).toBe(false);
      expect(isOriginAllowed('https://localhost')).toBe(false);
    });
  });

  describe('security - reject malicious origins', () => {
    it('should reject non-manus domains', () => {
      expect(isOriginAllowed('https://evil.com')).toBe(false);
      expect(isOriginAllowed('https://manus-space.evil.com')).toBe(false);
      expect(isOriginAllowed('https://fire-inspect.manus.computer.evil.com')).toBe(false);
    });

    it('should reject protocol-relative URLs', () => {
      expect(isOriginAllowed('//fire-inspect.manus.space')).toBe(false);
    });

    it('should reject URLs with paths', () => {
      expect(isOriginAllowed('https://fire-inspect.manus.space/admin')).toBe(false);
    });
  });
});
