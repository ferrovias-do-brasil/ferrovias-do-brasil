/**
 * Sources often disagree. Instead of silently picking one date, the data keeps
 * every sourced claim; these helpers pick the one to display and tell whether
 * the sources diverge.
 */
import type { DateClaim } from './schemas';
import { formatDatePt } from './dates';

export interface Claim<T> {
  value: T;
  source: string;
  page?: string;
  note?: string;
  circa?: boolean;
  preferred?: boolean;
}

/** The claim marked `preferred`, or the first one listed. */
export function preferredClaim<T>(claims: Claim<T>[]): Claim<T> {
  if (claims.length === 0) throw new Error('preferredClaim: empty claim list');
  return claims.find((c) => c.preferred) ?? claims[0];
}

/** True when the claims do not all state the same value. */
export function hasConflict<T>(claims: Claim<T>[]): boolean {
  return new Set(claims.map((c) => JSON.stringify(c.value))).size > 1;
}

export type DateOrClaims = string | DateClaim[];

/** Normalises a plain date (backed by `sources`) or a claim list into claims. */
export function toDateClaims(value: DateOrClaims, sources: string[] = [], circa?: boolean): DateClaim[] {
  if (typeof value !== 'string') return value;
  return sources.map((source) => ({ value, source, circa }));
}

export function preferredDate(value: DateOrClaims): string {
  return typeof value === 'string' ? value : preferredClaim(value).value;
}

export function formatClaimDate(c: Pick<DateClaim, 'value' | 'circa'>): string {
  return formatDatePt(c.value, c.circa);
}
