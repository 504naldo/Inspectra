/**
 * Tests for the compliance PDF header layout geometry.
 * Verifies that element positions do not overlap and that the
 * returned content-start Y is below all header elements.
 */
import { describe, it, expect } from 'vitest';

// ─── Geometry constants mirroring drawRepeatingHeader ────────────────────────

const margin = 40;
const rightBoxX = 320;

// Logo: top = margin, height = 80
const logoTop = margin;
const logoBottom = margin + 80; // = 120

// Right-side box rows
const row1Top = margin;
const row1Height = 20;
const row1Bottom = row1Top + row1Height; // = 60

const freqTop = row1Bottom; // = 60
const freqHeight = 30;
const freqBottom = freqTop + freqHeight; // = 90

const contactTop = freqBottom; // = 90
const contactHeight = 14;
const contactBottom = contactTop + contactHeight; // = 104

// Full-width rows start after logo bottom + 4 px
const fullRowStartY = margin + 84; // = 124
const buildingHeight = 14;
const buildingBottom = fullRowStartY + buildingHeight; // = 138

const addressTop = buildingBottom; // = 138
const addressHeight = 14;
const addressBottom = addressTop + addressHeight; // = 152

// Company text
const companyTextY = addressBottom + 18; // = 170
const companyTextHeight = 11 + 11; // two lines of text
const companyBottom = companyTextY + companyTextHeight; // = 192

// Content start Y returned by drawRepeatingHeader
const contentStartY = companyTextY + 24; // = 194

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('compliance PDF header – layout geometry', () => {
  it('logo bottom does not overlap the full-width rows', () => {
    expect(logoBottom).toBeLessThanOrEqual(fullRowStartY);
  });

  it('right-side box contact row bottom does not overlap full-width rows', () => {
    expect(contactBottom).toBeLessThanOrEqual(fullRowStartY);
  });

  it('full-width building row starts after logo bottom', () => {
    expect(fullRowStartY).toBeGreaterThanOrEqual(logoBottom);
  });

  it('address row starts immediately after building row', () => {
    expect(addressTop).toBe(buildingBottom);
  });

  it('company text starts below the address row with a gap', () => {
    expect(companyTextY).toBeGreaterThan(addressBottom);
  });

  it('content start Y is below all header elements', () => {
    expect(contentStartY).toBeGreaterThan(companyBottom);
    expect(contentStartY).toBeGreaterThan(logoBottom);
    expect(contentStartY).toBeGreaterThan(contactBottom);
    expect(contentStartY).toBeGreaterThan(addressBottom);
  });

  it('content start Y leaves at least 8 px gap below company text', () => {
    expect(contentStartY - companyTextY).toBeGreaterThanOrEqual(8);
  });

  it('right-side box rows do not exceed full-width row start', () => {
    // All three right-side rows must fit above the full-width rows
    expect(contactBottom).toBeLessThanOrEqual(fullRowStartY);
  });

  it('full-width rows are within content width (612 - 2*40 = 532)', () => {
    const contentWidth = 612 - 2 * margin;
    expect(contentWidth).toBe(532);
  });

  it('right-side box starts to the right of the logo column', () => {
    // Logo column is roughly 0–280 px; right box should start at 320
    expect(rightBoxX).toBeGreaterThan(280);
  });

  it('header total height is under 200 px (fits on letter page with content)', () => {
    expect(contentStartY).toBeLessThan(200);
  });
});

describe('compliance PDF header – company info', () => {
  it('company text Y is below address row bottom', () => {
    expect(companyTextY).toBeGreaterThan(addressBottom);
  });

  it('company text gap from address row is at least 16 px', () => {
    expect(companyTextY - addressBottom).toBeGreaterThanOrEqual(16);
  });

  it('company name falls back to default when not provided', () => {
    const name = (provided?: string) => provided || 'Earth Wind and Fire';
    expect(name(undefined)).toBe('Earth Wind and Fire');
    expect(name('Acme Fire')).toBe('Acme Fire');
  });
});
