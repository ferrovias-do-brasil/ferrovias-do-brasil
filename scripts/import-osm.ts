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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { basename, join } from 'node:path';
import type { Feature, LineString, MultiLineString, Position } from 'geojson';
import { networkSchema, type Network, type NetworkNode } from '../src/lib/schemas';
import { haversine } from '../src/lib/geo';
import { RailGraph, type OverpassWay } from './lib/osm-graph';
import { networkDirs, readGeometry, readNetworkYaml } from './lib/content';
import { CACHE_DIR, cachedWays } from './lib/overpass';

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

async function loadOsm(network: Network, refresh: boolean): Promise<OverpassWay[]> {
  if (network.osm_cache) {
    // Shared state-wide cache (npm run import-malha refreshes it).
    const file = join(CACHE_DIR, `${network.osm_cache}.json`);
    if (!existsSync(file)) throw new Error(`${file} not found: run npm run import-malha first`);
    console.log(`  using shared cache ${file}`);
    return JSON.parse(readFileSync(file, 'utf8')).elements.filter((e: { type: string }) => e.type === 'way');
  }
  return cachedWays(network.line, overpassQuery(network.bbox), refresh);
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
