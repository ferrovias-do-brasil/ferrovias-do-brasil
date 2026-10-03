import { describe, expect, it } from 'vitest';
import { RailGraph, type OverpassWay } from '../scripts/lib/osm-graph';

const way = (id: number, railway: string, coords: [number, number][]): OverpassWay => ({
  type: 'way',
  id,
  tags: { railway },
  geometry: coords.map(([lon, lat]) => ({ lon, lat })),
});

// A current line A–B–C and an old loop B–X–C with a 50 m hole in it.
const ways = [
  way(1, 'rail', [[0, 0], [0.01, 0], [0.02, 0]]),
  way(2, 'abandoned', [[0.01, 0], [0.015, 0.005]]),
  way(3, 'razed', [[0.0154, 0.005], [0.02, 0]]),
];

describe('RailGraph', () => {
  it('routes over current track only in current mode', () => {
    const r = new RailGraph(ways).route([[0, 0], [0.02, 0]], { mode: 'current' });
    expect(r.ways).toEqual([1]);
    expect(r.bridgedGapM).toBe(0);
  });

  it('follows old track through a via point and bridges small gaps', () => {
    const r = new RailGraph(ways).route([[0.01, 0], [0.015, 0.005], [0.02, 0]], { mode: 'old', maxGapM: 100 });
    expect(r.ways.sort()).toEqual([2, 3]);
    expect(r.bridgedGapM).toBeGreaterThan(30);
    expect(r.bridgedGapM).toBeLessThan(60);
  });

  it('fails when the gap is larger than allowed and no other track connects', () => {
    const isolated = [ways[1], ways[2]];
    expect(() => new RailGraph(isolated).route([[0.01, 0], [0.02, 0]], { mode: 'old', maxGapM: 10 })).toThrow(/no old path/);
    expect(new RailGraph(isolated).route([[0.01, 0], [0.02, 0]], { mode: 'old', maxGapM: 100 }).bridgedGapM).toBeGreaterThan(0);
  });
});
