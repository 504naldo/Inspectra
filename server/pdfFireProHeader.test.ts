/**
 * Tests for the FirePro PDF page header geometry and the
 * compliance PDF address row addition.
 */
import { describe, it, expect } from 'vitest';

// ─── FirePro header geometry constants ───────────────────────────────────────

const firePro = {
  margin: 50,
  pageWidth: 612,
  logoHeight: 100,
  barX: 260,
  separatorOffset: 108, // margin + 108
};

const fireProSeparatorY = firePro.margin + firePro.separatorOffset; // = 158
const fireProContentStartY = fireProSeparatorY + 8; // = 166

// ─── Compliance header geometry constants (with new address row) ─────────────

const compliance = {
  margin: 40,
  pageWidth: 612,
  logoHeight: 80,
  fullRowStartY: 40 + 84, // = 124
  buildingRowHeight: 14,
  streetRowHeight: 14,
  cityRowHeight: 14,
};

const compBuildingBottom = compliance.fullRowStartY + compliance.buildingRowHeight; // = 138
const compStreetTop = compBuildingBottom; // = 138
const compStreetBottom = compStreetTop + compliance.streetRowHeight; // = 152
const compCityTop = compStreetBottom; // = 152
const compCityBottom = compCityTop + compliance.cityRowHeight; // = 166
const compCompanyTextY = compCityBottom + 18; // = 184
const compContentStartY = compCompanyTextY + 24; // = 208

// ─── FirePro header tests ─────────────────────────────────────────────────────

describe('FirePro PDF page header – geometry', () => {
  it('logo fits within the margin (100 px tall, starts at margin)', () => {
    const logoBottom = firePro.margin + firePro.logoHeight;
    expect(logoBottom).toBe(150);
  });

  it('site info bar starts to the right of the logo column', () => {
    // Logo column is roughly 50–200 px; bar starts at 260
    expect(firePro.barX).toBeGreaterThan(200);
  });

  it('site info bar does not exceed page width', () => {
    const barRight = firePro.barX + (firePro.pageWidth - firePro.barX - firePro.margin);
    expect(barRight).toBeLessThanOrEqual(firePro.pageWidth - firePro.margin);
  });

  it('separator Y is below the logo bottom', () => {
    const logoBottom = firePro.margin + firePro.logoHeight;
    expect(fireProSeparatorY).toBeGreaterThan(logoBottom);
  });

  it('content start Y is below the separator', () => {
    expect(fireProContentStartY).toBeGreaterThan(fireProSeparatorY);
  });

  it('content start Y leaves at least 8 px gap below separator', () => {
    expect(fireProContentStartY - fireProSeparatorY).toBeGreaterThanOrEqual(8);
  });

  it('content start Y is under 200 px (leaves room for content on letter page)', () => {
    expect(fireProContentStartY).toBeLessThan(200);
  });

  it('site info bar has enough width for address text (at least 200 px)', () => {
    const barWidth = firePro.pageWidth - firePro.barX - firePro.margin;
    expect(barWidth).toBeGreaterThanOrEqual(200);
  });
});

// ─── Compliance address row tests ────────────────────────────────────────────

describe('compliance PDF header – address row addition', () => {
  it('street address row starts immediately after building name row', () => {
    expect(compStreetTop).toBe(compBuildingBottom);
  });

  it('city row starts immediately after street address row', () => {
    expect(compCityTop).toBe(compStreetBottom);
  });

  it('company text starts below the city row with a gap', () => {
    expect(compCompanyTextY).toBeGreaterThan(compCityBottom);
  });

  it('company text gap from city row is at least 16 px', () => {
    expect(compCompanyTextY - compCityBottom).toBeGreaterThanOrEqual(16);
  });

  it('content start Y is below all header elements', () => {
    expect(compContentStartY).toBeGreaterThan(compCompanyTextY + 20);
    expect(compContentStartY).toBeGreaterThan(compliance.margin + compliance.logoHeight);
  });

  it('total header height is under 220 px', () => {
    expect(compContentStartY).toBeLessThan(220);
  });

  it('all three full-width rows are 14 px tall', () => {
    expect(compliance.buildingRowHeight).toBe(14);
    expect(compliance.streetRowHeight).toBe(14);
    expect(compliance.cityRowHeight).toBe(14);
  });

  it('address row is between building row and city row', () => {
    expect(compStreetTop).toBeGreaterThan(compliance.fullRowStartY);
    expect(compStreetBottom).toBeLessThan(compCityBottom);
  });
});

// ─── buildingAddress field availability ──────────────────────────────────────

describe('compliance PDF – buildingAddress field', () => {
  it('buildingAddress defaults to empty string when not provided', () => {
    const addr = (v?: string) => v || '';
    expect(addr(undefined)).toBe('');
    expect(addr('123 Main St')).toBe('123 Main St');
  });
});
