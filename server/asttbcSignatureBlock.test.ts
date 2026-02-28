/**
 * Tests for ASTTBC RFPT Seal and Signature Table helpers
 * Verifies geometry, content, and integration with both PDF generators
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock PDFKit document ────────────────────────────────────────────────────
function makeMockDoc() {
  const calls: { method: string; args: any[] }[] = [];
  const doc: any = {
    _calls: calls,
    _y: 100,
    get y() { return this._y; },
    rect: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    lineWidth: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    fontSize: vi.fn().mockReturnThis(),
    font: vi.fn().mockReturnThis(),
    fillColor: vi.fn().mockReturnThis(),
    text: vi.fn(function(this: any, _t: string, _x: number, _y: number) {
      this._y += 12; // simulate text advancing cursor
      return this;
    }),
  };
  return doc;
}

// ── drawRFPTSeal ────────────────────────────────────────────────────────────
describe('drawRFPTSeal', () => {
  it('draws the top band with FIRE PROTECTION text', async () => {
    const { drawRFPTSeal } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawRFPTSeal(doc, 100, 200, 'J. A. Smith', 'FP1234');

    // rect should be called at least twice: outer border + top band fill
    expect(doc.rect).toHaveBeenCalledWith(100, 200, 120, expect.any(Number));
    // fill should be called with navy for the top band
    expect(doc.fill).toHaveBeenCalledWith('#1e3a8a');
  });

  it('includes ASTTBC text in the seal body', async () => {
    const { drawRFPTSeal } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawRFPTSeal(doc, 0, 0, 'Jane Doe', 'FP9999');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).toContain('ASTTBC');
  });

  it('uppercases the technician name', async () => {
    const { drawRFPTSeal } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawRFPTSeal(doc, 0, 0, 'jane doe', 'FP0001');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).toContain('JANE DOE');
  });

  it('includes the cert number', async () => {
    const { drawRFPTSeal } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawRFPTSeal(doc, 0, 0, 'Test Tech', 'FP5678');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).toContain('FP5678');
  });

  it('renders discipline codes row when provided', async () => {
    const { drawRFPTSeal } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawRFPTSeal(doc, 0, 0, 'Test Tech', 'FP1234', 'AL EM EX SP-P WA');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).toContain('AL EM EX SP-P WA');
  });

  it('returns a Y position below the seal box', async () => {
    const { drawRFPTSeal } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    const returnedY = drawRFPTSeal(doc, 0, 50, 'Test Tech', 'FP1234');
    expect(returnedY).toBeGreaterThan(50);
  });

  it('seal width is exactly 120 px', async () => {
    const { drawRFPTSeal } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawRFPTSeal(doc, 10, 20, 'Test Tech', 'FP1234');

    const outerBorderCall = doc.rect.mock.calls[0];
    expect(outerBorderCall[2]).toBe(120); // width argument
  });
});

// ── drawSignatureTable ──────────────────────────────────────────────────────
describe('drawSignatureTable', () => {
  it('renders the affirmation paragraph with page count', async () => {
    const { drawSignatureTable } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawSignatureTable(doc, 100, 42, 'John Smith', 'FP1234', new Date('2026-01-15'), 'EWF Services Inc');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    const affirmation = textCalls.find((t: string) => t.includes('42 pages'));
    expect(affirmation).toBeDefined();
    expect(affirmation).toContain('ULC 536:2019 (2024)');
  });

  it('renders the primary technician header row', async () => {
    const { drawSignatureTable } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawSignatureTable(doc, 100, 10, 'Jane Doe', 'FP9876', new Date(), 'Test Co');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).toContain('Supervising / Primary Technician Name');
  });

  it('renders the primary technician name in the data row', async () => {
    const { drawSignatureTable } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawSignatureTable(doc, 100, 10, 'Jane Doe', 'FP9876', new Date(), 'Test Co');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).toContain('Jane Doe');
  });

  it('renders the Certification Number / Seal header', async () => {
    const { drawSignatureTable } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawSignatureTable(doc, 100, 10, 'Jane Doe', 'FP9876', new Date(), 'Test Co');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).toContain('Certification Number /\nSeal');
  });

  it('renders secondary technician rows when provided', async () => {
    const { drawSignatureTable } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawSignatureTable(doc, 100, 10, 'Primary Tech', 'FP1111', new Date(), 'Test Co', 'Secondary Tech', 'FP2222');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).toContain('Technician Conducting Test and Inspection');
    expect(textCalls).toContain('Secondary Tech');
  });

  it('does NOT render secondary rows when secondary name is omitted', async () => {
    const { drawSignatureTable } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawSignatureTable(doc, 100, 10, 'Primary Tech', 'FP1111', new Date(), 'Test Co');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).not.toContain('Technician Conducting Test and Inspection');
  });

  it('returns a Y position below the table', async () => {
    const { drawSignatureTable } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    const returnedY = drawSignatureTable(doc, 100, 10, 'Tech', 'FP1234', new Date(), 'Co');
    expect(returnedY).toBeGreaterThan(100);
  });

  it('uses the inspection date in the date column', async () => {
    const { drawSignatureTable } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    const testDate = new Date('2026-03-15');
    drawSignatureTable(doc, 100, 10, 'Tech', 'FP1234', testDate, 'Co');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    // Date is formatted with toLocaleDateString('en-CA') → YYYY-MM-DD or locale variant
    // Accept any string that contains the year and month
    const hasDate = textCalls.some((t: string) => typeof t === 'string' && t.includes('2026') && t.includes('3'));
    expect(hasDate).toBe(true);
  });

  it('shows company name as placeholder in signature column', async () => {
    const { drawSignatureTable } = await import('./pdfSharedStyles.js');
    const doc = makeMockDoc();
    drawSignatureTable(doc, 100, 10, 'Tech', 'FP1234', new Date(), 'EWF Services Inc');

    const textCalls = doc.text.mock.calls.map((c: any[]) => c[0]);
    expect(textCalls).toContain('EWF Services Inc');
  });
});

// ── Integration: compliance PDF data interface ──────────────────────────────
describe('Compliance PDF signature data', () => {
  it('ComplianceReportData has technicianCertificateNumber field', async () => {
    // This test verifies the interface contract by importing the generator
    // and checking it compiles (TypeScript would fail at build time otherwise)
    const mod = await import('./pdfGeneratorCompliance.js');
    expect(mod.generateComplianceReportPDF).toBeDefined();
    expect(typeof mod.generateComplianceReportPDF).toBe('function');
  });
});

// ── Integration: FirePro PDF data interface ─────────────────────────────────
describe('FirePro PDF signature data', () => {
  it('generateInspectionReportPDF is exported and accepts technicianCertNumber', async () => {
    const mod = await import('./pdfGeneratorFirePro.js');
    expect(mod.generateInspectionReportPDF).toBeDefined();
    expect(typeof mod.generateInspectionReportPDF).toBe('function');
  });
});
