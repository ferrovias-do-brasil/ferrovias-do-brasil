/**
 * A routable graph built from OpenStreetMap railway ways (Overpass `out geom`).
 *
 * Used to derive the geometry of each historical track segment as the
 * shortest path between its two nodes, either over the railway in use today
 * ("current") or over the remains of old track ("old": railway=abandoned,
 * razed, disused), bridging the small gaps where the old bed was built over.
 */
import type { Position } from 'geojson';
import { haversine } from '../../src/lib/geo';

export interface OverpassWay {
  type: 'way';
  id: number;
  tags: Record<string, string>;
  geometry: { lat: number; lon: number }[];
}

export type WayClass = 'current' | 'old';

export function classifyWay(tags: Record<string, string>): WayClass | null {
  const r = tags.railway;
  if (r === 'rail') return 'current';
  if (r === 'abandoned' || r === 'razed' || r === 'disused') return 'old';
  return null;
}

interface Edge {
  to: number;
  length: number;
  cls: WayClass | 'gap';
  way: number | null;
}

export interface RouteOptions {
  mode: 'current' | 'old';
  /** Max length of a synthetic edge joining loose ends of old track (old mode only). */
  maxGapM?: number;
}

export interface Route {
  coordinates: Position[];
  ways: number[];
  lengthM: number;
  bridgedGapM: number;
}

const key = (p: Position) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

export class RailGraph {
  readonly positions: Position[] = [];
  readonly classes: Set<WayClass>[] = [];
  private readonly index = new Map<string, number>();
  private readonly adj: Edge[][] = [];
  private gapsBuiltFor = -1;

  constructor(ways: OverpassWay[]) {
    for (const way of ways) {
      const cls = classifyWay(way.tags);
      if (!cls || way.geometry.length < 2) continue;
      let prev = -1;
      for (const g of way.geometry) {
        const v = this.vertex([g.lon, g.lat]);
        this.classes[v].add(cls);
        if (prev >= 0 && prev !== v) {
          const length = haversine(this.positions[prev], this.positions[v]);
          this.adj[prev].push({ to: v, length, cls, way: way.id });
          this.adj[v].push({ to: prev, length, cls, way: way.id });
        }
        prev = v;
      }
    }
  }

  private vertex(p: Position): number {
    const k = key(p);
    let v = this.index.get(k);
    if (v === undefined) {
      v = this.positions.length;
      this.positions.push(p);
      this.classes.push(new Set());
      this.adj.push([]);
      this.index.set(k, v);
    }
    return v;
  }

  /** Nearest vertex carrying the given class (linear scan: graphs here are small). */
  nearest(p: Position, cls: WayClass | 'any'): { vertex: number; distance: number } {
    let best = -1;
    let bestD = Infinity;
    for (let v = 0; v < this.positions.length; v++) {
      if (cls !== 'any' && !this.classes[v].has(cls)) continue;
      const d = haversine(p, this.positions[v]);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    if (best < 0) throw new Error(`no ${cls} vertex in graph`);
    return { vertex: best, distance: bestD };
  }

  /** Adds synthetic edges between loose ends of old track and any nearby vertex. */
  private buildGaps(maxGapM: number) {
    if (this.gapsBuiltFor === maxGapM) return;
    for (const edges of this.adj) for (let i = edges.length - 1; i >= 0; i--) if (edges[i].cls === 'gap') edges.splice(i, 1);
    const cell = maxGapM / 111_000;
    const grid = new Map<string, number[]>();
    const cellKey = (p: Position) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    this.positions.forEach((p, v) => {
      const k = cellKey(p);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(v);
    });
    for (let v = 0; v < this.positions.length; v++) {
      const realDegree = this.adj[v].filter((e) => e.cls !== 'gap').length;
      if (realDegree !== 1 || !this.classes[v].has('old')) continue;
      const p = this.positions[v];
      const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
      const neighbourOf = new Set(this.adj[v].map((e) => e.to));
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const u of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (u === v || neighbourOf.has(u)) continue;
            const length = haversine(p, this.positions[u]);
            if (length > maxGapM) continue;
            this.adj[v].push({ to: u, length, cls: 'gap', way: null });
            this.adj[u].push({ to: v, length, cls: 'gap', way: null });
          }
    }
    this.gapsBuiltFor = maxGapM;
  }

  private weight(e: Edge, mode: RouteOptions['mode']): number {
    if (mode === 'current') return e.cls === 'current' ? e.length : Infinity;
    if (e.cls === 'old') return e.length;
    if (e.cls === 'current') return e.length * 1.6;
    return e.length * 3; // bridged gap
  }

  private dijkstra(from: number, to: number, mode: RouteOptions['mode']): number[] | null {
    const dist = new Float64Array(this.positions.length).fill(Infinity);
    const prev = new Int32Array(this.positions.length).fill(-1);
    const heap = new MinHeap();
    dist[from] = 0;
    heap.push(from, 0);
    while (heap.size) {
      const [v, d] = heap.pop();
      if (v === to) break;
      if (d > dist[v]) continue;
      for (const e of this.adj[v]) {
        const w = this.weight(e, mode);
        if (!Number.isFinite(w)) continue;
        const nd = d + w;
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          prev[e.to] = v;
          heap.push(e.to, nd);
        }
      }
    }
    if (!Number.isFinite(dist[to])) return null;
    const path = [to];
    while (path[path.length - 1] !== from) path.push(prev[path[path.length - 1]]);
    return path.reverse();
  }

  route(stops: Position[], opts: RouteOptions): Route {
    if (opts.mode === 'old') this.buildGaps(opts.maxGapM ?? 400);
    const cls: WayClass = opts.mode === 'current' ? 'current' : 'old';
    // In old mode every stop may sit on today's track (junctions, stations kept by a later line),
    // so snap to any track; the path between stops still prefers old beds.
    const vertices = stops.map((p) => this.nearest(p, opts.mode === 'old' ? 'any' : cls).vertex);
    const path: number[] = [];
    for (let i = 1; i < vertices.length; i++) {
      const leg = this.dijkstra(vertices[i - 1], vertices[i], opts.mode);
      if (!leg) throw new Error(`no ${opts.mode} path between stop ${i - 1} and ${i}`);
      path.push(...(path.length ? leg.slice(1) : leg));
    }
    const ways = new Set<number>();
    let lengthM = 0;
    let bridgedGapM = 0;
    for (let i = 1; i < path.length; i++) {
      const candidates = this.adj[path[i - 1]].filter((e) => e.to === path[i]);
      const e = candidates.sort((a, b) => this.weight(a, opts.mode) - this.weight(b, opts.mode))[0];
      lengthM += e.length;
      if (e.cls === 'gap') bridgedGapM += e.length;
      else if (e.way !== null) ways.add(e.way);
    }
    return { coordinates: path.map((v) => this.positions[v]), ways: [...ways], lengthM, bridgedGapM };
  }
}

class MinHeap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(v: number, d: number) {
    const a = this.items;
    a.push([v, d]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][1] <= a[i][1]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][1] < a[m][1]) m = l;
        if (r < a.length && a[r][1] < a[m][1]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}
