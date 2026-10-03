/**
 * Context layer: every railway in a state as OpenStreetMap knows it today,
 * shown in all years until each line gets a researched history.
 *
 *   npm run import-malha               # use cached Overpass data when present
 *   npm run import-malha -- --refresh  # download again
 *
 * Writes public/data/malha-<uf>.geojson. Data © OpenStreetMap contributors, ODbL 1.0.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Feature, LineString, Position } from 'geojson';
import { haversine } from '../src/lib/geo';
import { ROOT } from './lib/content';
import { cachedWays } from './lib/overpass';
import type { OverpassWay } from './lib/osm-graph';

const STATES = [{ uf: 'sp', iso: 'BR-SP' }];

/** Main lines only: no yards, sidings, metro, trams or industrial spurs. */
function query(iso: string): string {
  return `[out:json][timeout:600][maxsize:1073741824];
area["ISO3166-2"="${iso}"]["admin_level"="4"]->.uf;
(
  way["railway"~"^(rail|narrow_gauge|preserved|disused|abandoned|razed)$"]["service"!~"^(yard|siding|spur|crossover)$"](area.uf);
);
out tags geom;`;
}

const EXCLUDED_USAGE = new Set(['industrial', 'military', 'test']);

/** a = in use today, d = tracks still there but disused, o = old bed (abandoned or razed). */
type Kind = 'a' | 'd' | 'o';
function kindOf(railway: string): Kind {
  if (railway === 'disused') return 'd';
  if (railway === 'abandoned' || railway === 'razed') return 'o';
  return 'a';
}

export interface MalhaProps {
  /** OSM way id. */
  id: number;
  k: Kind;
  /** Railway name: old_name for beds that became streets, otherwise name. */
  n?: string;
  /** What the old bed is today (street or road name), when known. */
  hoje?: string;
  op?: string;
  /** OSM start_date tag: a lead, not a sourced date. */
  sd?: string;
  gauge?: string;
}

function propsOf(w: OverpassWay): MalhaProps {
  const t = w.tags;
  const k = kindOf(t.railway);
  const isRoad = Boolean(t.highway);
  const p: MalhaProps = { id: w.id, k };
  if (k === 'o' && isRoad && t.old_name) {
    p.n = t.old_name;
    if (t.name) p.hoje = t.name;
  } else {
    p.n = t.name ?? t.old_name;
  }
  if (t.operator) p.op = t.operator;
  if (t.start_date) p.sd = t.start_date;
  if (t.gauge) p.gauge = t.gauge;
  return p;
}

/** Ramer–Douglas–Peucker simplification in metres. */
function simplify(pts: Position[], toleranceM: number): Position[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const kx = Math.cos((a[1] * Math.PI) / 180) * 111_320;
  const ky = 110_574;
  const dist = (p: Position) => {
    const ax = (b[0] - a[0]) * kx, ay = (b[1] - a[1]) * ky;
    const px = (p[0] - a[0]) * kx, py = (p[1] - a[1]) * ky;
    const len = Math.hypot(ax, ay);
    return len === 0 ? Math.hypot(px, py) : Math.abs(ax * py - ay * px) / len;
  };
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(pts[i]);
    if (d > max) [max, idx] = [d, i];
  }
  if (max <= toleranceM) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), toleranceM).slice(0, -1), ...simplify(pts.slice(idx), toleranceM)];
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;
const refresh = process.argv.includes('--refresh');

for (const { uf, iso } of STATES) {
  console.log(`\n[${uf}] malha ferroviária (OpenStreetMap)`);
  const ways = await cachedWays(`malha-${uf}`, query(iso), refresh, 620_000);
  const features: Feature<LineString, MalhaProps>[] = [];
  const km: Record<Kind, number> = { a: 0, d: 0, o: 0 };
  for (const w of ways) {
    if (EXCLUDED_USAGE.has(w.tags.usage ?? '') || w.geometry.length < 2) continue;
    const coords = simplify(
      w.geometry.map((g) => [g.lon, g.lat]),
      8,
    ).map(([x, y]) => [round(x), round(y)]);
    const props = propsOf(w);
    for (let i = 1; i < coords.length; i++) km[props.k] += haversine(coords[i - 1], coords[i]) / 1000;
    features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
  }
  const out = {
    type: 'FeatureCollection',
    attribution: '© colaboradores do OpenStreetMap (ODbL 1.0)',
    generated: new Date().toISOString().slice(0, 10),
    features,
  };
  const dir = join(ROOT, 'public/data');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `malha-${uf}.geojson`);
  const text = JSON.stringify(out);
  writeFileSync(file, text + '\n');
  console.log(
    `  ${features.length} trechos: ${km.a.toFixed(0)} km em uso, ${km.d.toFixed(0)} km desativados, ${km.o.toFixed(0)} km de leitos antigos`,
  );
  console.log(`  wrote public/data/malha-${uf}.geojson (${(text.length / 1e6).toFixed(1)} MB)`);
}
