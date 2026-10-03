/**
 * Partial ISO dates ("1910", "1906-09", "1908-12-02") are the norm in historical
 * sources: we often know only the year or the month. This module parses them,
 * converts them to decimal years for time filtering, and formats them in PT-BR.
 */

export type DatePrecision = 'year' | 'month' | 'day';

export interface PartialDate {
  year: number;
  month?: number;
  day?: number;
  precision: DatePrecision;
}

export const PARTIAL_DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export function parsePartialDate(value: string): PartialDate {
  const m = PARTIAL_DATE_RE.exec(value);
  if (!m) throw new Error(`Invalid partial date: "${value}" (expected YYYY, YYYY-MM or YYYY-MM-DD)`);
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : undefined;
  const day = m[3] ? Number(m[3]) : undefined;
  if (month !== undefined && (month < 1 || month > 12)) throw new Error(`Invalid month in "${value}"`);
  if (day !== undefined && (day < 1 || day > daysInMonth(year, month!))) throw new Error(`Invalid day in "${value}"`);
  return { year, month, day, precision: day ? 'day' : month ? 'month' : 'year' };
}

export function isValidPartialDate(value: string): boolean {
  try {
    parsePartialDate(value);
    return true;
  } catch {
    return false;
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Decimal year at the *start* of the partial date: "1910" → 1910.0,
 * "1908-12-02" → ~1908.92. Used for both period starts and ends, so a period
 * that ends in "1961" is considered over from the beginning of 1961.
 */
export function toDecimalYear(value: string): number {
  const d = parsePartialDate(value);
  const month = d.month ?? 1;
  const day = d.day ?? 1;
  const dayOfYear = (Date.UTC(d.year, month - 1, day) - Date.UTC(d.year, 0, 1)) / 86_400_000;
  return d.year + dayOfYear / (isLeap(d.year) ? 366 : 365);
}

/**
 * The map shows the state of the network at the *end* of the selected year,
 * so a line opened on 1908-12-02 is visible when the slider is on 1908.
 */
export function endOfYear(year: number): number {
  return year + 0.9999;
}

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function formatDatePt(value: string, circa = false): string {
  const d = parsePartialDate(value);
  let out: string;
  if (d.precision === 'day') out = `${d.day} de ${MONTHS_PT[d.month! - 1]} de ${d.year}`;
  else if (d.precision === 'month') out = `${MONTHS_PT[d.month! - 1]} de ${d.year}`;
  else out = String(d.year);
  return circa ? `c. ${out}` : out;
}

export function compareDates(a: string, b: string): number {
  return toDecimalYear(a) - toDecimalYear(b);
}
