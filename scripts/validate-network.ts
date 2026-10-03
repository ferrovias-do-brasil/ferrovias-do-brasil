/**
 * Checks the track network geometry against itself and against history.
 *
 *   npm run validate-network
 *
 * Errors (exit 1): segments without geometry, geometry that does not start/end
 * at its nodes.
 * Warnings (research leads, exit 0):
 *  - years in which the operating network splits into disconnected pieces;
 *  - distances measured on the map that disagree with historical kilometre
 *    posts by more than KM_TOLERANCE.
 */
import type { LineString, MultiLineString, Position } from 'geojson';
import { networkSchema, stationSchema, type Network, type Station } from '../src/lib/schemas';
import { OPERATING, statusAt } from '../src/lib/network';
import { endOfYear, toDecimalYear } from '../src/lib/dates';
import { haversine } from '../src/lib/geo';
import { RailGraph, type OverpassWay } from './lib/osm-graph';
import { loadCollection, networkDirs, readGeometry, readNetworkYaml } from './lib/content';

const ENDPOINT_TOLERANCE_M = 300;
const KM_TOLERANCE = 0.05;

const errors: string[] = [];
const warnings: string[] = [];

const stations = loadCollection('stations').map((e) => ({ id: e.id, data: stationSchema.parse(e.data) as Station }));

for (const dir of networkDirs()) {
  const net: Network = networkSchema.parse(readNetworkYaml(dir));
  const geo = new Map(
    (readGeometry(dir)?.features ?? []).map((f) => [f.properties?.id as string, f.geometry as LineString | MultiLineString]),
  );
  const nodes = new Map(net.nodes.map((n) => [n.id, n]));
  console.log(`\n[${net.line}] ${net.segments.length} trechos, ${net.nodes.length} nós`);

  // ------------------------------------------------ geometry vs nodes
  for (const s of net.segments) {
    const g = geo.get(s.id);
    if (!g) {
      errors.push(`${s.id}: sem geometria (rode npm run import-osm)`);
      continue;
    }
    const coords = g.type === 'LineString' ? g.coordinates : g.coordinates.flat();
    const ends: [string, Position][] = [
      [s.from, coords[0]],
      [s.to, coords[coords.length - 1]],
    ];
    for (const [nodeId, p] of ends) {
      const node = nodes.get(nodeId)!;
      const d = haversine(node.coords, p);
      if (d > ENDPOINT_TOLERANCE_M) errors.push(`${s.id}: extremidade a ${d.toFixed(0)} m do nó "${nodeId}"`);
    }
  }

  // ------------------------------------------------ connectivity per year
  const firstYear = Math.floor(Math.min(...net.segments.map((s) => toDecimalYear(firstFrom(s)))));
  let lastComponents = -1;
  for (let year = firstYear; year <= new Date().getFullYear(); year++) {
    const t = endOfYear(year);
    const operating = net.segments.filter((s) => {
      const st = statusAt(s, t);
      return st !== null && OPERATING.has(st);
    });
    const components = countComponents(operating.map((s) => [s.from, s.to]));
    if (components !== lastComponents && components > 1) {
      warnings.push(`${year}: a rede em operação está dividida em ${components} partes`);
    }
    lastComponents = components;
  }

  // ------------------------------------------------ distances vs historical km posts
  const lineStations = stations.filter((s) => s.data.line === net.line && s.data.km?.length);
  const posts = lineStations.flatMap((s) => s.data.km!.map((k) => ({ station: s, km: k })));
  const years = [...new Set(posts.map((p) => p.km.year))].sort();
  for (const year of years) {
    const t = endOfYear(year);
    const operating = net.segments.filter((s) => {
      const st = statusAt(s, t);
      return st !== null && OPERATING.has(st);
    });
    const ways: OverpassWay[] = operating.map((s, i) => {
      const g = geo.get(s.id)!;
      const coords = g.type === 'LineString' ? g.coordinates : g.coordinates.flat();
      return { type: 'way', id: i, tags: { railway: 'rail' }, geometry: coords.map(([lon, lat]) => ({ lat, lon })) };
    });
    if (!ways.length) continue;
    const graph = new RailGraph(ways);
    const yearPosts = posts
      .filter((p) => p.km.year === year)
      .map((p) => ({ ...p, pos: siteAt(p.station.data, t) }))
      .filter((p) => p.pos !== null)
      .sort((a, b) => a.km.value - b.km.value);
    for (let i = 1; i < yearPosts.length; i++) {
      const a = yearPosts[i - 1];
      const b = yearPosts[i];
      const expected = b.km.value - a.km.value;
      let measured: number;
      try {
        measured = graph.route([a.pos!, b.pos!], { mode: 'current' }).lengthM / 1000;
      } catch {
        warnings.push(`${year}: sem caminho no mapa entre ${a.station.data.name} e ${b.station.data.name}`);
        continue;
      }
      const diff = (measured - expected) / expected;
      const line = `${year}: ${a.station.data.name} (km ${a.km.value}) → ${b.station.data.name} (km ${b.km.value}): esperado ${expected.toFixed(2)} km, medido ${measured.toFixed(2)} km (${(diff * 100).toFixed(1)}%)`;
      if (Math.abs(diff) > KM_TOLERANCE) warnings.push(`quilometragem divergente — ${line}`);
      else console.log(`  ✓ ${line}`);
    }
  }
}

function firstFrom(s: Network['segments'][number]): string {
  const f = s.status_history[0].from;
  return typeof f === 'string' ? f : f[0].value;
}

function siteAt(station: Station, t: number): Position | null {
  const site = station.sites.find((s) => toDecimalYear(s.from) <= t && (!s.to || toDecimalYear(s.to) > t));
  return site?.coords ?? null;
}

function countComponents(edges: [string, string][]): number {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const [a, b] of edges) parent.set(find(a), find(b));
  return new Set([...parent.keys()].map(find)).size;
}

for (const w of warnings) console.warn(`  ! ${w}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} erro(s):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`\n✓ rede válida${warnings.length ? ` (${warnings.length} aviso(s) — pistas de pesquisa, ver acima)` : ''}`);
