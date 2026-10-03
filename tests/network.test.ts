import { describe, expect, it } from 'vitest';
import { changeBetween, segmentPeriods, statusAt, stationFeatures, OPEN_END } from '../src/lib/network';
import { endOfYear } from '../src/lib/dates';
import { stationSchema, type Segment } from '../src/lib/schemas';

const oldBirigui: Pick<Segment, 'id' | 'status_history'> = {
  id: 'old',
  status_history: [
    { status: 'open', from: '1908-12-02', sources: ['s'] },
    {
      status: 'closed',
      from: [
        { value: '1969-02-16', source: 'a', preferred: true },
        { value: '1969-03-18', source: 'b' },
      ],
      sources: [],
    },
  ],
};

describe('segment periods', () => {
  it('chains periods so each ends where the next begins', () => {
    const [open, closed] = segmentPeriods(oldBirigui);
    expect(open.end).toBe(closed.start);
    expect(closed.end).toBe(OPEN_END);
    expect(closed.disputed).toBe(true);
    expect(open.disputed).toBe(false);
  });

  it('answers the status in a given year', () => {
    expect(statusAt(oldBirigui, endOfYear(1907))).toBeNull();
    expect(statusAt(oldBirigui, endOfYear(1950))).toBe('open');
    expect(statusAt(oldBirigui, endOfYear(1969))).toBe('closed');
  });

  it('rejects histories out of order', () => {
    expect(() =>
      segmentPeriods({
        id: 'bad',
        status_history: [
          { status: 'closed', from: '1970', sources: ['s'] },
          { status: 'open', from: '1908', sources: ['s'] },
        ],
      }),
    ).toThrow(/chronological/);
  });
});

describe('compare mode', () => {
  it('classifies changes between two years', () => {
    expect(changeBetween(null, 'open')).toBe('added');
    expect(changeBetween('open', 'removed')).toBe('removed');
    expect(changeBetween('open', 'freight_only')).toBe('unchanged');
    expect(changeBetween('closed', 'flooded')).toBe('absent');
  });
});

describe('station features', () => {
  it('emits one feature per site, clipped to the opening date', () => {
    const data = stationSchema.parse({
      name: 'Birigui',
      line: 'nob',
      summary: '',
      opened: [{ value: '1912-12-13', source: 's' }],
      sites: [
        { id: 'centro', coords: [-50.33, -21.29], from: '1908', to: '1969-01-30', confidence: 'low', sources: ['s'] },
        { id: 'nova', coords: [-50.35, -21.3], from: '1969-01-30', confidence: 'high', sources: ['s'] },
      ],
      status_now: 'cultural',
    });
    const fc = stationFeatures([{ id: 'birigui', data }]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties.start).toBeGreaterThan(1912.9);
    expect(fc.features[0].properties.end).toBe(fc.features[1].properties.start);
  });
});
