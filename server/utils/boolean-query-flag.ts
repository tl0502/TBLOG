/**
 * Parse common query-string boolean shapes (`1`/`0`, `true`/`false`, real booleans).
 * Missing / blank values use `defaultValue` so optional flags stay backward-compatible.
 */
export function parseBooleanQueryFlag(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return defaultValue
}
