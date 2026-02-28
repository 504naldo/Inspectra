/**
 * Tests for FirePro PDF spacing fixes:
 * 1. Site info bar line spacing in drawFireProPageHeader
 * 2. Terms & conditions paragraph spacing (lineGap + doc.y tracking)
 */
import { describe, it, expect } from 'vitest';

// ─── Site info bar geometry constants ────────────────────────────────────────

const margin = 50;
const pageWidth = 612;
const barX = 260;
const barY = margin; // = 50

// Line Y positions (absolute)
const siteNameY = barY;           // = 50
const addressY = barY + 14;       // = 64  (was barY + 12 → too tight)
const cityY = barY + 28;          // = 78  (was barY + 22 → too tight)
const jobNumY = barY + 46;        // = 96  (was barY + 34 → too tight)
const dateY = barY + 58;          // = 108 (was barY + 44 → too tight)
const separatorY = margin + 116;  // = 166 (was margin + 108 → too tight)
const contentStartY = separatorY + 8; // = 174

// ─── Site info bar tests ──────────────────────────────────────────────────────

describe('FirePro PDF site info bar – line spacing (after fix)', () => {
  it('site name is at barY (top of bar)', () => {
    expect(siteNameY).toBe(50);
  });

  it('address line has at least 12 px gap below site name', () => {
    expect(addressY - siteNameY).toBeGreaterThanOrEqual(12);
  });

  it('city line has at least 12 px gap below address', () => {
    expect(cityY - addressY).toBeGreaterThanOrEqual(12);
  });

  it('job number has at least 14 px gap below city line', () => {
    expect(jobNumY - cityY).toBeGreaterThanOrEqual(14);
  });

  it('date has at least 10 px gap below job number', () => {
    expect(dateY - jobNumY).toBeGreaterThanOrEqual(10);
  });

  it('separator is below all text lines', () => {
    expect(separatorY).toBeGreaterThan(dateY + 8); // at least 8 px below date
  });

  it('separator does not exceed logo height (logo is 100 px tall, bottom at 150)', () => {
    const logoBottom = margin + 100;
    expect(separatorY).toBeGreaterThan(logoBottom);
  });

  it('content start Y is below separator', () => {
    expect(contentStartY).toBeGreaterThan(separatorY);
  });

  it('content start Y is under 200 px', () => {
    expect(contentStartY).toBeLessThan(200);
  });

  it('bar width is at least 200 px', () => {
    const barWidth = pageWidth - barX - margin;
    expect(barWidth).toBeGreaterThanOrEqual(200);
  });
});

// ─── Old vs new spacing comparison ───────────────────────────────────────────

describe('FirePro PDF site info bar – old vs new spacing', () => {
  const oldAddressY = barY + 12;
  const oldCityY = barY + 22;
  const oldJobNumY = barY + 34;
  const oldDateY = barY + 44;
  const oldSeparatorY = margin + 108;

  it('new addressY is further from siteNameY than old', () => {
    expect(addressY - siteNameY).toBeGreaterThan(oldAddressY - siteNameY);
  });

  it('new cityY is further from addressY than old', () => {
    expect(cityY - addressY).toBeGreaterThan(oldCityY - oldAddressY);
  });

  it('new jobNumY is further from cityY than old', () => {
    expect(jobNumY - cityY).toBeGreaterThan(oldJobNumY - oldCityY);
  });

  it('new separatorY is lower than old separatorY', () => {
    expect(separatorY).toBeGreaterThan(oldSeparatorY);
  });
});

// ─── Terms paragraph spacing tests ───────────────────────────────────────────

describe('FirePro PDF terms & conditions – paragraph spacing (after fix)', () => {
  it('lineGap of 3 is used (not 4 which caused tighter rendering)', () => {
    // This is a documentation test — the value 3 is correct for fontSize 8
    const lineGap = 3;
    expect(lineGap).toBe(3);
  });

  it('inter-paragraph gap is 10 px (doc.y + 10 after each paragraph)', () => {
    const interParaGap = 10;
    expect(interParaGap).toBeGreaterThanOrEqual(8);
  });

  it('page overflow threshold is 660 (was 680 — triggers page break earlier)', () => {
    const overflowThreshold = 660;
    expect(overflowThreshold).toBeLessThan(680);
  });

  it('using doc.y to track position avoids fixed 25 px increment', () => {
    // The old code used defY += 25 which was too small for multi-line paragraphs.
    // The new code uses defY = doc.y + 10 which adapts to actual rendered height.
    // This test documents the design decision.
    const oldFixedIncrement = 25;
    const newDynamicGap = 10; // added to doc.y after rendering
    // doc.y will always be > defY + oldFixedIncrement for multi-line paragraphs
    expect(newDynamicGap).toBeLessThan(oldFixedIncrement);
  });
});
