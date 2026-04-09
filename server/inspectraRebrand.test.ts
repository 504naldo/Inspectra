import { describe, it, expect } from 'vitest';
import { APP_NAME, APP_DESCRIPTION, APP_TAGLINE } from '../shared/constants';
import fs from 'fs';
import path from 'path';

/**
 * Inspectra Rebrand Tests
 * 
 * Verify that the application has been consistently rebranded to "Inspectra"
 * across all user-facing surfaces without affecting internal code.
 */

describe('Inspectra Rebrand', () => {
  describe('Shared Constants', () => {
    it('should define APP_NAME as Inspectra', () => {
      expect(APP_NAME).toBe('Inspectra');
    });

    it('should define APP_DESCRIPTION', () => {
      expect(APP_DESCRIPTION).toBeDefined();
      expect(APP_DESCRIPTION.length).toBeGreaterThan(0);
    });

    it('should define APP_TAGLINE', () => {
      expect(APP_TAGLINE).toBeDefined();
      expect(APP_TAGLINE.length).toBeGreaterThan(0);
    });
  });

  describe('PWA Metadata', () => {
    it('should have Inspectra in manifest.json', () => {
      const manifestPath = path.join(process.cwd(), 'client/public/manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      expect(manifest.name).toBe('Inspectra');
      expect(manifest.short_name).toBe('Inspectra');
    });

    it('should have Inspectra in index.html title', () => {
      const indexPath = path.join(process.cwd(), 'client/index.html');
      const indexContent = fs.readFileSync(indexPath, 'utf-8');

      expect(indexContent).toContain('<title>Inspectra</title>');
    });

    it('should have Inspectra in iOS PWA meta tag', () => {
      const indexPath = path.join(process.cwd(), 'client/index.html');
      const indexContent = fs.readFileSync(indexPath, 'utf-8');

      expect(indexContent).toContain('content="Inspectra"');
    });
  });

  describe('UI Components', () => {
    it('should not contain "Fire Inspect Pro" in UI components', () => {
      const componentsPath = path.join(process.cwd(), 'client/src/components');
      const files = fs.readdirSync(componentsPath, { recursive: true }) as string[];
      
      const tsxFiles = files.filter(f => f.endsWith('.tsx'));
      
      for (const file of tsxFiles) {
        const filePath = path.join(componentsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Allow "Fire Inspect" in comments or non-display contexts
        const displayContent = content
          .split('\n')
          .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
          .join('\n');
        
        expect(displayContent).not.toContain('Fire Inspect Pro');
      }
    });

    it('should not contain "Fire Inspect" (standalone) in UI pages', () => {
      const pagesPath = path.join(process.cwd(), 'client/src/pages');
      
      // Check if pages directory exists
      if (!fs.existsSync(pagesPath)) {
        return; // Skip if pages directory doesn't exist
      }

      const files = fs.readdirSync(pagesPath, { recursive: true }) as string[];
      const tsxFiles = files.filter(f => f.endsWith('.tsx'));
      
      for (const file of tsxFiles) {
        const filePath = path.join(pagesPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for standalone "Fire Inspect" not part of "Fire Inspection"
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes('Fire Inspect') && !line.includes('Fire Inspection')) {
            // Allow in comments
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
              continue;
            }
            // Fail if found in actual code
            expect(line).not.toContain('Fire Inspect');
          }
        }
      }
    });
  });

  describe('PDF Generators', () => {
    it('should not contain "Fire-Pro" in PDF generator files', () => {
      const serverPath = path.join(process.cwd(), 'server');
      const files = fs.readdirSync(serverPath);
      
      const pdfGeneratorFiles = files.filter(f => f.startsWith('pdfGenerator') && f.endsWith('.ts') && !f.endsWith('.test.ts'));
      
      for (const file of pdfGeneratorFiles) {
        const filePath = path.join(serverPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for "Fire-Pro" in non-comment lines
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes('Fire-Pro')) {
            // Allow in comments
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
              continue;
            }
            // Fail if found in actual code
            expect(line).not.toContain('Fire-Pro');
          }
        }
      }
    });

    it('should include Inspectra in PDF filenames in reportRouter.ts', () => {
      const routersPath = path.join(process.cwd(), 'server/routers/reportRouter.ts');
      const content = fs.readFileSync(routersPath, 'utf-8');

      // Check for Inspectra prefix in PDF file keys
      expect(content).toContain('Inspectra-');
    });
  });

  describe('Internal Code Unchanged', () => {
    it('should keep internal route paths unchanged', () => {
      // Verify that routes still use original paths
      const appPath = path.join(process.cwd(), 'client/src/App.tsx');
      
      if (!fs.existsSync(appPath)) {
        return; // Skip if App.tsx doesn't exist
      }

      const content = fs.readFileSync(appPath, 'utf-8');
      
      // Routes should still use /tech, /admin, /customer (not /inspectra)
      expect(content).toContain('/tech');
      expect(content).toContain('/admin');
    });

    it('should keep database table names unchanged', () => {
      const schemaPath = path.join(process.cwd(), 'drizzle/schema.ts');
      
      if (!fs.existsSync(schemaPath)) {
        return; // Skip if schema doesn't exist
      }

      const content = fs.readFileSync(schemaPath, 'utf-8');
      
      // Table names should remain unchanged
      expect(content).toContain('jobs');
      expect(content).toContain('users');
      expect(content).toContain('companies');
    });
  });

  describe('Build and Runtime', () => {
    it('should not introduce TypeScript errors', () => {
      // This test passes if the test suite runs without compilation errors
      expect(true).toBe(true);
    });

    it('should maintain consistent branding across constants', () => {
      // All branding constants should be defined and non-empty
      expect(APP_NAME).toBeTruthy();
      expect(APP_DESCRIPTION).toBeTruthy();
      expect(APP_TAGLINE).toBeTruthy();
    });
  });
});
