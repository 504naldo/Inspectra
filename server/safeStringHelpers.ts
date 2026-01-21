/**
 * Safe string operations that never throw on null/undefined
 */

export function safeToLower(str: any): string {
  try {
    if (str === null || str === undefined) return '';
    if (typeof str === 'string') return str.toLowerCase();
    return String(str).toLowerCase();
  } catch (error) {
    console.error('[safeToLower] Error:', { str, type: typeof str, error });
    return '';
  }
}

export function safeIncludes(str: any, search: string): boolean {
  try {
    const lower = safeToLower(str);
    return lower.includes(search);
  } catch (error) {
    console.error('[safeIncludes] Error:', { str, search, error });
    return false;
  }
}

export function safeTrim(str: any): string {
  try {
    if (str === null || str === undefined) return '';
    if (typeof str === 'string') return str.trim();
    return String(str).trim();
  } catch (error) {
    console.error('[safeTrim] Error:', { str, error });
    return '';
  }
}
