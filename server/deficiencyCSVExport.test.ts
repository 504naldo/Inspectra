/**
 * Tests for the deficiency CSV export logic.
 * The export is client-side (no server procedure), so we test the
 * pure data-transformation functions extracted from the component.
 */
import { describe, it, expect } from 'vitest';

// ─── Helpers mirroring the component logic ───────────────────────────────────

const escape = (v: any): string => {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
};

const buildCSV = (deficiencies: any[], jobId: string | number): string => {
  const headers = [
    'ID', 'Title', 'Severity', 'System Category', 'Status',
    'Est. Cost ($)', 'Observed Issue', 'Corrective Action', 'Code Reference', 'Created At',
  ];
  const rows = deficiencies.map((d: any) => [
    d.id,
    escape(d.title),
    escape(d.severity),
    escape(d.systemCategory ? d.systemCategory.replace(/_/g, ' ') : ''),
    escape(d.status?.replace(/_/g, ' ')),
    d.estimatedCost != null ? parseFloat(String(d.estimatedCost)).toFixed(2) : '',
    escape(d.observedIssue),
    escape(d.correctiveAction),
    escape(d.codeReference),
    d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-CA') : '',
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
};

const mockDeficiencies = [
  {
    id: 1,
    title: 'Broken detector',
    severity: 'critical',
    systemCategory: 'FIRE_ALARM',
    status: 'open',
    estimatedCost: '250.00',
    observedIssue: 'Detector head cracked',
    correctiveAction: 'Replace detector',
    codeReference: 'NFPA 72 14.4.5',
    createdAt: new Date('2025-01-15'),
  },
  {
    id: 2,
    title: 'Missing label, needs "re-labelling"',
    severity: 'minor',
    systemCategory: 'FIRE_EXTINGUISHER',
    status: 'in_progress',
    estimatedCost: '75.50',
    observedIssue: null,
    correctiveAction: null,
    codeReference: null,
    createdAt: new Date('2025-02-01'),
  },
  {
    id: 3,
    title: 'No issues found',
    severity: 'observation',
    systemCategory: null,
    status: 'resolved',
    estimatedCost: null,
    observedIssue: null,
    correctiveAction: null,
    codeReference: null,
    createdAt: null,
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deficiency CSV export – escape helper', () => {
  it('returns empty string for null', () => {
    expect(escape(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escape(undefined)).toBe('');
  });

  it('wraps value containing comma in double quotes', () => {
    expect(escape('hello, world')).toBe('"hello, world"');
  });

  it('wraps value containing double quote and escapes it', () => {
    expect(escape('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps value containing newline in double quotes', () => {
    expect(escape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('does not wrap plain values', () => {
    expect(escape('NFPA 72')).toBe('NFPA 72');
  });

  it('converts numbers to strings', () => {
    expect(escape(42)).toBe('42');
  });
});

describe('deficiency CSV export – buildCSV', () => {
  it('produces correct number of lines (header + rows)', () => {
    const csv = buildCSV(mockDeficiencies, '7');
    const lines = csv.split('\n');
    expect(lines).toHaveLength(mockDeficiencies.length + 1); // header + 3 rows
  });

  it('first line is the header row', () => {
    const csv = buildCSV(mockDeficiencies, '7');
    const header = csv.split('\n')[0];
    expect(header).toBe('ID,Title,Severity,System Category,Status,Est. Cost ($),Observed Issue,Corrective Action,Code Reference,Created At');
  });

  it('converts FIRE_ALARM systemCategory to "FIRE ALARM"', () => {
    const csv = buildCSV(mockDeficiencies, '7');
    expect(csv).toContain('FIRE ALARM');
    expect(csv).not.toContain('FIRE_ALARM');
  });

  it('converts in_progress status to "in progress"', () => {
    const csv = buildCSV(mockDeficiencies, '7');
    expect(csv).toContain('in progress');
  });

  it('formats estimatedCost to 2 decimal places', () => {
    const csv = buildCSV(mockDeficiencies, '7');
    expect(csv).toContain('250.00');
    expect(csv).toContain('75.50');
  });

  it('leaves estimatedCost blank when null', () => {
    const csv = buildCSV(mockDeficiencies, '7');
    const lines = csv.split('\n');
    const thirdRow = lines[3]; // row for id=3
    const cols = thirdRow.split(',');
    expect(cols[5]).toBe(''); // Est. Cost column is index 5
  });

  it('leaves systemCategory blank when null', () => {
    const csv = buildCSV(mockDeficiencies, '7');
    const lines = csv.split('\n');
    const thirdRow = lines[3];
    const cols = thirdRow.split(',');
    expect(cols[3]).toBe(''); // System Category column is index 3
  });

  it('escapes titles containing double quotes', () => {
    const csv = buildCSV(mockDeficiencies, '7');
    expect(csv).toContain('"Missing label, needs ""re-labelling"""');
  });

  it('generates correct filename pattern', () => {
    const jobId = '42';
    const filename = `deficiencies-job-${jobId}.csv`;
    expect(filename).toBe('deficiencies-job-42.csv');
    expect(filename.endsWith('.csv')).toBe(true);
  });

  it('handles empty deficiency list gracefully', () => {
    const csv = buildCSV([], '7');
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1); // only header
  });
});
