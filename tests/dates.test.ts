import { describe, expect, it } from 'vitest';
import { endOfYear, formatDatePt, isValidPartialDate, parsePartialDate, toDecimalYear } from '../src/lib/dates';

describe('partial dates', () => {
  it('parses year, month and day precision', () => {
    expect(parsePartialDate('1910').precision).toBe('year');
    expect(parsePartialDate('1906-09').precision).toBe('month');
    expect(parsePartialDate('1908-12-02')).toEqual({ year: 1908, month: 12, day: 2, precision: 'day' });
  });

  it('rejects impossible dates', () => {
    expect(isValidPartialDate('1908-13')).toBe(false);
    expect(isValidPartialDate('1969-02-30')).toBe(false);
    expect(isValidPartialDate('1900-02-29')).toBe(false); // 1900 was not a leap year
    expect(isValidPartialDate('c. 1910')).toBe(false);
  });

  it('converts to decimal years at the start of the period', () => {
    expect(toDecimalYear('1910')).toBe(1910);
    expect(toDecimalYear('1908-12-02')).toBeCloseTo(1908 + 336 / 366, 6);
    expect(toDecimalYear('1969-02-16')).toBeLessThan(toDecimalYear('1969-03-18'));
  });

  it('shows the state at the end of the selected year', () => {
    // A line opened on 2 Dec 1908 is visible when the slider is on 1908.
    expect(toDecimalYear('1908-12-02')).toBeLessThan(endOfYear(1908));
    expect(toDecimalYear('1909')).toBeGreaterThan(endOfYear(1908));
  });

  it('formats in Brazilian Portuguese', () => {
    expect(formatDatePt('1912-12-13')).toBe('13 de dezembro de 1912');
    expect(formatDatePt('1906-09')).toBe('setembro de 1906');
    expect(formatDatePt('1995', true)).toBe('c. 1995');
  });
});
