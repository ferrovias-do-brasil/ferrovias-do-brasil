/**
 * Generates the geometry of every track segment from OpenStreetMap.
 *
 *   npm run import-osm               # use cached Overpass data when present
 *   npm run import-osm -- --refresh  # download again from Overpass
 *   npm run import-osm -- --fix-nodes  # move node coords in network.yaml onto the track
 *
 * For each network in src/content/network/<line>/network.yaml it writes
 * geometry.geojson next to it. Segments with `geometry.method: manual` keep
 * whatever geometry is already in that file.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { parseDocument } from 'yaml';
import { basename, join } from 'node:path';
import type { Feature, LineString, MultiLineString, Position } from 'geojson';
import { networkSchema, type Network, type NetworkNode } from '../src/lib/schemas';
import { haversine } from '../src/lib/geo';
import { RailGraph, type OverpassWay } from './lib/osm-graph';
import { ROOT, networkDirs, readGeometry, readNetworkYaml } from './lib/content';

const OVERPASS_ENDPOINTS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const ATTEMPTS_PER_ENDPOINT = 3;

// Node's default 250 ms IPv6→IPv4 fallback is too short on some networks (e.g. WSL).
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamilyAttemptTimeout(3000);
const USER_AGENT = 'ferrovias-do-brasil/0.1 (+https://github.com/; open-source railway history)';
const CACHE_DIR = join(ROOT, '.cache/osm');

function overpassQuery([w, s, e, n]: Network['bbox']): string {
  const bb = `${s},${w},${n},${e}`;
  return `[out:json][timeout:170];
(
  way["railway"~"^(rail|disused|abandoned|razed)$"]["name"~"Noroeste",i](${bb});
  way["railway"~"^(rail|disused|abandoned|razed)$"]["old_name"~"Noroeste",i](${bb});
  way["railway"~"^(rail|disused|abandoned|razed)$"]["operator"~"Rumo|ALL|Novoeste",i](${bb});
  way["railway"~"^(disused|abandoned|razed)$"](${bb});
);
out tags geom;`;
}

/** Public Overpass servers are often busy: retry with backoff, then try the next server. */
async function downloadOverpass(query: string): Promise<string> {
  const failures: string[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_ENDPOINT; attempt++) {
      console.log(`  downloading from ${endpoint} (attempt ${attempt}) …`);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(200_000),
        });
        const text = await res.text();
        if (res.ok && text.trimStart().startsWith('{')) return text;
        failures.push(`${endpoint}: HTTP ${res.status}`);
      } catch (e) {
        failures.push(`${endpoint}: ${(e as Error).message}`);
      }
      if (attempt < ATTEMPTS_PER_ENDPOINT) await new Promise((r) => setTimeout(r, 15_000 * attempt));
    }
  }
  throw new Error(`Overpass unavailable; the cached data was kept.\n  - ${failures.join('\n  - ')}`);
}

async function loadOsm(network: Network, refresh: boolean): Promise<OverpassWay[]> {
  const cacheFile = join(CACHE_DIR, `${network.line}.json`);
  if (!refresh && existsSync(cacheFile)) {
    console.log(`  using cached ${cacheFile}`);
  } else {
    const text = await downloadOverpass(overpassQuery(network.bbox));
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, text);
  }
  const raw = JSON.parse(readFileSync(cacheFile, 'utf8'));
  return raw.elements.filter((e: { type: string }) => e.type === 'way');
}

function snapPosition(graph: RailGraph, node: NetworkNode): Position {
  if (node.snap === 'none') return node.coords;
  const { vertex, distance } = graph.nearest(node.coords, node.snap === 'old' ? 'old' : 'current');
  if (distance > 3000) console.warn(`  ! node ${node.id} is ${(distance / 1000).toFixed(1)} km from the nearest ${node.snap} track`);
  return graph.positions[vertex];
}

/** Rewrites node coordinates in network.yaml onto the track, keeping comments and layout. */
function fixNodes(dir: string, graph: RailGraph, network: Network) {
  const file = join(dir, 'network.yaml');
  const doc = parseDocument(readFileSync(file, 'utf8'));
  let changed = 0;
  network.nodes.forEach((node, i) => {
    const snapped = snapPosition(graph, node).map(round);
    const distance = haversine(node.coords, snapped);
    if (distance < 10) return;
    const seq = doc.createNode(snapped, { flow: true });
    doc.setIn(['nodes', i, 'coords'], seq);
    console.log(`  ↦ node ${node.id} moved ${distance.toFixed(0)} m onto the track`);
    changed++;
  });
  if (changed) writeFileSync(file, doc.toString({ lineWidth: 0 }));
  return changed;
}

async function processNetwork(dir: string, refresh: boolean, fix: boolean) {
  let network = networkSchema.parse(readNetworkYaml(dir));
  console.log(`\n[${network.line}] ${network.name}`);
  const graph = new RailGraph(await loadOsm(network, refresh));
  if (fix && fixNodes(dir, graph, network)) network = networkSchema.parse(readNetworkYaml(dir));
  const nodes = new Map(network.nodes.map((n) => [n.id, n]));
  const existing = new Map((readGeometry(dir)?.features ?? []).map((f) => [f.properties?.id as string, f]));
  const generated = new Date().toISOString().slice(0, 10);
  const features: Feature<LineString | MultiLineString>[] = [];

  for (const seg of network.segments) {
    const from = nodes.get(seg.from);
    const to = nodes.get(seg.to);
    if (!from || !to) throw new Error(`segment ${seg.id}: unknown node ${!from ? seg.from : seg.to}`);
    const spec = seg.geometry;

    if (spec.method === 'manual') {
      const kept = existing.get(seg.id);
      if (!kept) throw new Error(`segment ${seg.id} is manual but has no geometry in geometry.geojson`);
      features.push(kept);
      console.log(`  = ${seg.id}: manual geometry kept`);
      continue;
    }

    if (spec.method === 'waypoints') {
      const coordinates = [snapPosition(graph, from), ...spec.points, snapPosition(graph, to)].map(([x, y]) => [round(x), round(y)]);
      features.push({
        type: 'Feature',
        properties: { id: seg.id, method: 'waypoints', osm_ways: [], bridged_gap_m: 0, generated },
        geometry: { type: 'LineString', coordinates },
      });
      console.log(`  ~ ${seg.id}: schematic, ${coordinates.length} points`);
      continue;
    }

    const stops = [from.coords, ...(spec.via ?? []), to.coords];
    const route = graph.route(stops, {
      mode: spec.method === 'osm-current' ? 'current' : 'old',
      maxGapM: spec.method === 'osm-old' ? spec.max_gap_m : undefined,
    });
    features.push({
      type: 'Feature',
      properties: {
        id: seg.id,
        method: spec.method,
        osm_ways: route.ways.sort((a, b) => a - b),
        bridged_gap_m: Math.round(route.bridgedGapM),
        generated,
      },
      geometry: { type: 'LineString', coordinates: route.coordinates.map(([x, y]) => [round(x), round(y)]) },
    });
    const gap = route.bridgedGapM > 0 ? `, ${route.bridgedGapM.toFixed(0)} m of gaps bridged` : '';
    console.log(`  + ${seg.id}: ${(route.lengthM / 1000).toFixed(1)} km over ${route.ways.length} OSM ways${gap}`);
  }

  const out = {
    type: 'FeatureCollection',
    attribution: '© OpenStreetMap contributors (ODbL 1.0) — geometria derivada; ver LICENSE-DATA.md',
    features,
  };
  writeFileSync(join(dir, 'geometry.geojson'), JSON.stringify(out, null, 1) + '\n');
  console.log(`  wrote ${join(basename(dir), 'geometry.geojson')} (${features.length} segments)`);
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

const refresh = process.argv.includes('--refresh');
const fix = process.argv.includes('--fix-nodes');
for (const dir of networkDirs()) await processNetwork(dir, refresh, fix);
