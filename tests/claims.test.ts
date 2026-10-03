import { describe, expect, it } from 'vitest';
import { hasConflict, preferredClaim, preferredDate, toDateClaims } from '../src/lib/claims';

const birigui = [
  { value: '1912-12-13', source: 'giesbrecht-birigui', preferred: true },
  { value: '1908', source: 'wikipedia-en-birigui' },
];

describe('claims', () => {
  it('picks the preferred claim, or the first one', () => {
    expect(preferredClaim(birigui).value).toBe('1912-12-13');
    expect(preferredClaim([...birigui].reverse()).value).toBe('1912-12-13');
    expect(preferredClaim([{ value: 'a', source: 's' }, { value: 'b', source: 't' }]).value).toBe('a');
  });

  it('detects diverging sources', () => {
    expect(hasConflict(birigui)).toBe(true);
    expect(hasConflict([{ value: '1910-05-13', source: 'a' }, { value: '1910-05-13', source: 'b' }])).toBe(false);
  });

  it('normalises plain dates backed by sources', () => {
    expect(toDateClaims('1992', ['giesbrecht-aracatuba-4'])).toEqual([{ value: '1992', source: 'giesbrecht-aracatuba-4', circa: undefined }]);
    expect(preferredDate(birigui)).toBe('1912-12-13');
    expect(preferredDate('1937')).toBe('1937');
  });
});
