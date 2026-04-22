/**
 * Shared test fixture for fire alarm router tests.
 * Builds the template fixture from seed data and provides a mock DB factory.
 */
import { FIRE_ALARM_CHECKLIST_TEMPLATE } from './seeds/fireAlarmChecklist';

// Convert seed format to DB row format (mirrors what 0020_seed_fire_alarm_checklist_template.sql inserts)
let _itemId = 1;
export const TEMPLATE_FIXTURE = (FIRE_ALARM_CHECKLIST_TEMPLATE as unknown as any[]).flatMap((section: any) =>
  section.items.map((item: any) => ({
    id: _itemId++,
    sectionName: section.section,
    sectionOrder: section.sectionOrder,
    itemLetter: item.itemId,
    itemDescription: item.description,
    requirementType: 'both',
    inputType: item.hasNumericField ? 'text' : 'checkbox',
    numericLabel: item.numericLabel ?? null,
    numericUnit: null,
    isRequired: true,
    hasSubItems: item.hasSubItems ?? false,
    subItems: item.subItems ?? null,
    notApplicableNote: section.notApplicableNote ?? null,
    headerFields: section.headerFields ?? null,
    standardId: 'ulc_s536',
    standardVersion: '2019',
    effectiveDate: '2019-01-01',
    isActive: true,
    createdAt: new Date(),
  }))
);

const DRIZZLE_NAME = Symbol.for('drizzle:Name');

function getTableName(table: any): string {
  return table?.[DRIZZLE_NAME] ?? '';
}

// Parse Drizzle eq()/and() condition SQL into a field->value map by walking queryChunks
function parseCondition(cond: any): Record<string, any> {
  const conditions: Record<string, any> = {};

  function walk(node: any) {
    if (!node?.queryChunks) return;
    let lastField: string | null = null;
    for (const chunk of node.queryChunks) {
      if (!chunk) continue;
      if (Array.isArray(chunk.value)) continue; // StringChunk — its .value is string[]
      if (chunk.name && typeof chunk.name === 'string' && !chunk.queryChunks) {
        // Column object: has .name, no .queryChunks
        lastField = chunk.name;
      } else if (chunk.queryChunks) {
        // Nested SQL (e.g., inner body of and())
        walk(chunk);
        lastField = null;
      } else if (lastField !== null && chunk.value !== undefined) {
        // Param object: has .value, not an array
        conditions[lastField] = chunk.value;
        lastField = null;
      }
    }
  }

  walk(cond);
  return conditions;
}

/**
 * Creates an in-memory mock of the Drizzle database returned by getDb().
 * Handles select/insert/update patterns used by fireAlarmRouter.
 */
export function createMockDb(templateFixture: any[] = TEMPLATE_FIXTURE) {
  const systems: any[] = [];
  const inspectionResults: any[] = [];
  let systemNextId = 1;
  let resultNextId = 1;

  function getStore(table: any): any[] {
    const name = getTableName(table);
    if (name === 'fire_alarm_systems') return systems;
    if (name === 'fire_alarm_checklist_templates') return templateFixture;
    if (name === 'fire_alarm_inspection_results') return inspectionResults;
    return [];
  }

  function makeFilter(cond: any): (row: any) => boolean {
    if (!cond) return () => true;
    const conditions = parseCondition(cond);
    if (Object.keys(conditions).length === 0) return () => true;
    return (row: any) => Object.entries(conditions).every(([field, value]) => row[field] === value);
  }

  return {
    select(fields?: any) {
      let _table: any = null;
      let _filter: (row: any) => boolean = () => true;
      let _limitVal = Infinity;

      const chain: any = {
        from(t: any) { _table = t; return chain; },
        where(cond: any) { _filter = makeFilter(cond); return chain; },
        orderBy(..._args: any[]) { return chain; },
        limit(n: number) { _limitVal = n; return chain; },
        then(resolve: Function, reject: Function) {
          try {
            let rows = [...getStore(_table)].filter(_filter);
            if (_limitVal < Infinity) rows = rows.slice(0, _limitVal);
            if (fields) {
              rows = rows.map((row: any) => {
                const projected: any = {};
                for (const [alias, col] of Object.entries(fields as any)) {
                  projected[alias] = row[(col as any).name];
                }
                return projected;
              });
            }
            resolve(rows);
          } catch (e) { reject(e as Error); }
        },
      };
      return chain;
    },

    insert(table: any) {
      return {
        values(data: any | any[]) {
          const rows = Array.isArray(data) ? data : [data];
          const store = getStore(table);
          const name = getTableName(table);
          let lastId = 0;
          rows.forEach((row: any) => {
            const id = name === 'fire_alarm_systems' ? systemNextId++ : resultNextId++;
            store.push({ ...row, id });
            lastId = id;
          });
          return Promise.resolve([{ insertId: lastId }]);
        },
      };
    },

    update(table: any) {
      return {
        set(data: any) {
          return {
            where(cond: any) {
              const filter = makeFilter(cond);
              const store = getStore(table);
              store.forEach((row, i) => {
                if (filter(row)) store[i] = { ...row, ...data };
              });
              return Promise.resolve([{ affectedRows: 1 }]);
            },
          };
        },
      };
    },
  };
}
