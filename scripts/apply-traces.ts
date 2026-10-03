/**
 * Turns lines traced on a georeferenced historic map into track geometry.
 *
 *   npm run apply-traces -- heyse-1912
 *
 * Reads research/georef/<map>/traces/*.json (pixel polylines on the IIIF image),
 * converts them to lon/lat with the same thin-plate-spline transformation as the
 * map overlay (public/georef/<map>.json), and writes them into the matching
 * src/content/network/<line>/geometry.geojson features. The segments must use
 * `geometry: { method: manual, traced_on: <map> }` in network.yaml, so that
 * `npm run import-osm` keeps them.
 *
 * Also prints where each traced station falls, to update nodes and stations.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GcpTransformer } from '@allmaps/transform';
import type { Feature, LineString, Position } from 'geojson';
import { networkSchema } from '../src/lib/schemas';
import { haversine } from '../src/lib/geo';
import { ROOT, networkDirs, readGeometry, readNetworkYaml } from './lib/content';

interface TraceFile {
  map: string;
  stations: Record<string, [number, number]>;
  segments: { id: string; start_at_node?: string; pixels: [number, number][] }[];
}

const mapId = process.argv[2];
if (!mapId) throw new Error('usage: npm run apply-traces -- <map-id>');

const annotation = JSON.parse(readFileSync(join(ROOT, 'public/georef', `${mapId}.json`), 'utf8'));
const transformer = new GcpTransformer(
  annotation.body.features.map((f: { properties: { resourceCoords: [number, number] }; geometry: { coordinates: [number, number] } }) => ({
    resource: f.properties.resourceCoords,
    geo: f.geometry.coordinates,
  })),
  annotation.body.transformation?.type ?? 'thinPlateSpline',
);
const toGeo = (p: [number, number]): Position => (transformer.transformToGeo(p) as number[]).map((v) => Math.round(v * 1e6) / 1e6);

const traceDir = join(ROOT, 'research/georef', mapId, 'traces');
const traces: TraceFile[] = readdirSync(traceDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(traceDir, f), 'utf8')));

const generated = new Date().toISOString().slice(0, 10);
for (const dir of networkDirs()) {
  const network = networkSchema.parse(readNetworkYaml(dir));
  const nodes = new Map(network.nodes.map((n) => [n.id, n]));
  const segments = new Map(network.segments.map((s) => [s.id, s]));
  const geometry = readGeometry(dir);
  if (!geometry) continue;
  let changed = 0;

  for (const trace of traces) {
    for (const t of trace.segments) {
      const seg = segments.get(t.id);
      if (!seg) continue;
      if (seg.geometry.method !== 'manual' || seg.geometry.traced_on !== trace.map) {
        throw new Error(`${t.id}: set geometry to { method: manual, traced_on: ${trace.map} } in network.yaml first`);
      }
      let coords = t.pixels.map(toGeo);
      if (t.start_at_node) {
        // Join an existing (e.g. OSM-mapped) piece: start at the node, continue from the closest traced vertex.
        const start = nodes.get(t.start_at_node)!.coords;
        let best = 0;
        coords.forEach((c, i) => {
          if (haversine(c, start) < haversine(coords[best], start)) best = i;
        });
        console.log(`  ${t.id}: joins ${t.start_at_node}, gap ${(haversine(coords[best], start) / 1000).toFixed(1)} km`);
        coords = [start, ...coords.slice(best + 1)];
      }
      const feature: Feature<LineString> = {
        type: 'Feature',
        properties: { id: t.id, method: 'manual', traced_on: trace.map, osm_ways: [], bridged_gap_m: 0, generated },
        geometry: { type: 'LineString', coordinates: coords },
      };
      const i = geometry.features.findIndex((f) => f.properties?.id === t.id);
      if (i >= 0) geometry.features[i] = feature;
      else geometry.features.push(feature);
      changed++;
      console.log(`  ${t.id}: ${coords.length} points traced on ${trace.map}`);
    }
    for (const [id, px] of Object.entries(trace.stations)) {
      console.log(`  station ${id.padEnd(14)} → [${toGeo(px).join(', ')}]`);
    }
  }
  if (changed) writeFileSync(join(dir, 'geometry.geojson'), JSON.stringify(geometry, null, 1) + '\n');
}
