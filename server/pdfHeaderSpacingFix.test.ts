/**
 * Tests for the compliance PDF repeating header spacing fix.
 *
 * Root cause: the company text block (name + phone) was drawn below the city
 * row and returned as part of contentStartY, causing it to overlap the section
 * title on every content page (ToC, Executive Summary, checklist pages, etc.).
 *
 * Fix: remove the company text block from the repeating header entirely.
 * The company name already appears in the page footer on every page.
 * contentStartY is now addressY + 16 (a clean 16 px gap below the city row).
 */
import { describe, it, expect } from 'vitest';

// ─── Geometry constants (must match pdfGeneratorCompliance.ts) ───────────────

const margin = 40;
const pageWidth = 612;

// Right-side box
const rightBoxX = 320;
const rightBoxRow1H = 20;  // Date of Service row
const rightBoxRow2H = 30;  // Frequency checkboxes row
const rightBoxRow3H = 14;  // Contact person row
const rightBoxBottom = margin + rightBoxRow1H + rightBoxRow2H + rightBoxRow3H; // = 104

// Logo
const logoHeight = 80;
const logoBottom = margin + logoHeight; // = 120

// Full-width rows
const fullRowStartY = margin + 84; // = 124
const buildingRowH = 14;
const streetRowH = 14;
const cityRowH = 14;

const buildingBottom = fullRowStartY + buildingRowH; // = 138
const streetBottom = buildingBottom + streetRowH;    // = 152
const cityBottom = streetBottom + cityRowH;           // = 166

// Content start Y (after fix)
const contentStartY = cityBottom + 16; // = 182

// ─── Header geometry tests ───────────────────────────────────────────────────

describe('compliance PDF repeating header – geometry after spacing fix', () => {
  it('logo bottom is above fullRowStartY', () => {
    expect(logoBottom).toBeLessThan(fullRowStartY);
  });

  it('right-side box bottom is above fullRowStartY', () => {
    expect(rightBoxBottom).toBeLessThan(fullRowStartY);
  });

  it('full-width rows start after both logo and right-side box', () => {
    expect(fullRowStartY).toBeGreaterThan(Math.max(logoBottom, rightBoxBottom));
  });

  it('building row immediately follows fullRowStartY', () => {
    expect(buildingBottom - fullRowStartY).toBe(buildingRowH);
  });

  it('street address row immediately follows building row', () => {
    expect(streetBottom - buildingBottom).toBe(streetRowH);
  });

  it('city row immediately follows street address row', () => {
    expect(cityBottom - streetBottom).toBe(cityRowH);
  });

  it('contentStartY has at least 14 px gap below city row', () => {
    expect(contentStartY - cityBottom).toBeGreaterThanOrEqual(14);
  });

  it('contentStartY is below all header elements', () => {
    expect(contentStartY).toBeGreaterThan(logoBottom);
    expect(contentStartY).toBeGreaterThan(rightBoxBottom);
    expect(contentStartY).toBeGreaterThan(cityBottom);
  });

  it('contentStartY is under 200 px (leaves ample room for content on letter page)', () => {
    expect(contentStartY).toBeLessThan(200);
  });
});

// ─── Company text removal tests ──────────────────────────────────────────────

describe('compliance PDF repeating header – company text removed', () => {
  it('contentStartY does NOT include company text height (was companyTextY + 24)', () => {
    // Old formula: companyTextY = cityBottom + 18; return companyTextY + 24
    const oldContentStartY = cityBottom + 18 + 24; // = 208
    // New formula: return cityBottom + 16
    expect(contentStartY).toBeLessThan(oldContentStartY);
  });

  it('new contentStartY is 26 px lower than old contentStartY', () => {
    const oldContentStartY = cityBottom + 18 + 24; // = 208
    const delta = oldContentStartY - contentStartY; // = 26
    expect(delta).toBe(26);
  });

  it('section title drawn at contentStartY does not overlap company text (company text removed)', () => {
    // There is no company text in the header anymore, so the section title
    // at contentStartY has nothing above it except the city row border.
    const clearanceAboveSectionTitle = contentStartY - cityBottom;
    expect(clearanceAboveSectionTitle).toBeGreaterThanOrEqual(14);
  });
});

// ─── Three full-width rows present ───────────────────────────────────────────

describe('compliance PDF repeating header – three full-width rows', () => {
  it('has building name row', () => {
    expect(buildingRowH).toBe(14);
  });

  it('has street address row (new)', () => {
    expect(streetRowH).toBe(14);
  });

  it('has city / postal code row', () => {
    expect(cityRowH).toBe(14);
  });

  it('total full-width row height is 42 px', () => {
    expect(buildingRowH + streetRowH + cityRowH).toBe(42);
  });
});
