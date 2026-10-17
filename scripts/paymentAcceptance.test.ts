import { describe, expect, it } from 'vitest';
import { assertCurrentPaymentSchema, disposableDatabaseUrl, paymentGuardNames } from './lib/paymentAcceptance.mjs';

describe('destructive synthetic database acceptance boundary', () => {
  it('requires explicit disposable intent before parsing or opening a database', () => {
    expect(() => disposableDatabaseUrl({ DATABASE_URL: 'mysql://root@127.0.0.1/inspectra_ci' })).toThrow(/DISPOSABLE_DB_ACCEPTANCE/);
  });

  it.each([
    'mysql://root@production.example/inspectra_ci',
    'mysql://root@127.0.0.1/production',
    'mysql://root@127.0.0.1/inspectra_ci?socketPath=/run/mysql.sock',
    'mysql://root@127.0.0.1/inspectra_ci?host=production.example',
    'mysql://root@127.0.0.1/inspectra_ci#override',
    'mysql://root@127.0.0.1/inspectra_ci/other',
    'postgres://root@127.0.0.1/inspectra_ci',
    'mysql://127.0.0.1/inspectra_ci',
    'not-a-url',
  ])('refuses unsafe target %s before database work', target => {
    expect(() => disposableDatabaseUrl({ DISPOSABLE_DB_ACCEPTANCE: 'true', DATABASE_URL: target })).toThrow(/isolated loopback/);
  });

  it.each(['localhost', '127.0.0.1'])('preserves explicitly supplied disposable connection settings for %s', hostname => {
    const target = `mysql://fixture:synthetic%2Fpassword@${hostname}:3307/inspectra_ci`;
    expect(disposableDatabaseUrl({ DISPOSABLE_DB_ACCEPTANCE: 'true', DATABASE_URL: target }).toString()).toBe(target);
  });
});

const currentColumns = [
  { tableName: 'jobs', columnName: 'finalizationHashVersion' },
  { tableName: 'jobs', columnName: 'tech_signature_key' },
  { tableName: 'jobs', columnName: 'contact_signature_key' },
  { tableName: 'deficiencies', columnName: 'deviceSnapshot' },
  { tableName: 'inspection_results', columnName: 'deviceSnapshot' },
  { tableName: 'inspection_template_responses', columnName: 'itemSnapshot' },
];

describe('current acceptance schema preflight', () => {
  function connection(columns = currentColumns, guards = [...paymentGuardNames]) {
    return { query: async (query: string) => [query.includes('information_schema.COLUMNS') ? columns : guards.map(name => ({ name }))] };
  }

  it('accepts current migrated evidence fields and all six payment guards', async () => {
    await expect(assertCurrentPaymentSchema(connection())).resolves.toBeUndefined();
  });

  it('rejects a historical four-guard schema', async () => {
    await expect(assertCurrentPaymentSchema(connection(currentColumns, paymentGuardNames.filter(name => !name.endsWith('_v3'))))).rejects.toThrow();
  });

  it.each(currentColumns)('rejects missing $tableName.$columnName before server startup', missing => {
    return expect(assertCurrentPaymentSchema(connection(currentColumns.filter(column => column !== missing)))).rejects.toThrow();
  });
});
