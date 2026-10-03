/**
 * Builds an Allmaps / IIIF Georeference Annotation for a historic map.
 *
 *   npm run build-georef -- heyse-1912
 *
 * Inputs (research/georef/<id>/):
 *   config.json     IIIF image service, size, mask polygon, transformation
 *   graticule.json  intersections of the map's own meridians and parallels (pixel ↔ lon/lat as printed)
 *   features.json   places identifiable both on the map and today (pixel ↔ modern lon/lat)
 *
 * Old maps are often internally consistent but shifted locally (the 1912 map
 * of São Paulo is off by up to ~13 km in the then-frontier west). We keep the
 * map's own graticule for shape, shift each graticule point by an inverse-
 * distance-weighted correction measured at the features, and add the features
 * themselves as control points. A leave-one-out test reports the expected error.
 *
 * Output: public/georef/<id>.json, served with the site.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GcpTransformer } from '@allmaps/transform';
import { haversine } from '../src/lib/geo';
import { ROOT } from './lib/content';

interface Config {
  id: string;
  title: string;
  imageService: string;
  imageServiceType: 'ImageService2' | 'ImageService3';
  width: number;
  height: number;
  transformation: 'thinPlateSpline' | 'polynomial';
  mask: [number, number][];
}
interface GraticulePoint {
  x: number;
  y: number;
  lon: number;
  lat: number;
}
interface Feature extends GraticulePoint {
  name: string;
}
interface Gcp {
  resource: [number, number];
  geo: [number, number];
}

const id = process.argv[2];
if (!id) throw new Error('usage: npm run build-georef -- <map-id>');
const dir = join(ROOT, 'research/georef', id);
const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const config = read<Config>('config.json');
const graticule = read<GraticulePoint[]>('graticule.json');
const features = read<Feature[]>('features.json');

/** Offsets of each feature between where the map puts it (by its own graticule) and where it is. */
const asPrinted = new GcpTransformer(
  graticule.map((g) => ({ resource: [g.x, g.y], geo: [g.lon, g.lat] })),
  config.transformation,
);
const offsets = features.map((f) => {
  const [lon, lat] = asPrinted.transformToGeo([f.x, f.y]) as [number, number];
  return { ...f, dlon: f.lon - lon, dlat: f.lat - lat, errorKm: haversine([lon, lat], [f.lon, f.lat]) / 1000 };
});

function correction(lon: number, lat: number, set: typeof offsets): [number, number] {
  let wsum = 0, dlon = 0, dlat = 0;
  for (const o of set) {
    const w = 1 / ((lon - o.lon) ** 2 + (lat - o.lat) ** 2 + 1e-9);
    wsum += w;
    dlon += w * o.dlon;
    dlat += w * o.dlat;
  }
  return [dlon / wsum, dlat / wsum];
}

function controlPoints(set: typeof offsets): Gcp[] {
  const gcps: Gcp[] = graticule.map((g) => {
    const [dlon, dlat] = correction(g.lon, g.lat, set);
    return { resource: [g.x, g.y], geo: [round(g.lon + dlon), round(g.lat + dlat)] };
  });
  for (const f of set) gcps.push({ resource: [f.x, f.y], geo: [f.lon, f.lat] });
  return gcps;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

console.log(`[${id}] ${graticule.length} graticule points, ${features.length} features`);
console.log('\nPosition error of the map as printed (by its own graticule):');
for (const o of offsets) console.log(`  ${o.name.padEnd(28)} ${o.errorKm.toFixed(1).padStart(5)} km`);

console.log('\nLeave-one-out error after correction:');
const loo = offsets.map((o) => {
  const t = new GcpTransformer(controlPoints(offsets.filter((x) => x !== o)), config.transformation);
  const p = t.transformToGeo([o.x, o.y]) as [number, number];
  const km = haversine(p, [o.lon, o.lat]) / 1000;
  console.log(`  ${o.name.padEnd(28)} ${km.toFixed(1).padStart(5)} km`);
  return km;
});
const median = [...loo].sort((a, b) => a - b)[Math.floor(loo.length / 2)];
console.log(`  median ${median.toFixed(1)} km, max ${Math.max(...loo).toFixed(1)} km`);

const gcps = controlPoints(offsets);
const svgPoints = config.mask.map(([x, y]) => `${x},${y}`).join(' ');
const annotation = {
  '@context': ['http://iiif.io/api/extension/georef/1/context.json', 'http://iiif.io/api/presentation/3/context.json'],
  id: `https://ferrovias-do-brasil.github.io/ferrovias-do-brasil/georef/${id}.json`,
  type: 'Annotation',
  motivation: 'georeferencing',
  target: {
    type: 'SpecificResource',
    source: { id: config.imageService, type: config.imageServiceType, height: config.height, width: config.width },
    selector: {
      type: 'SvgSelector',
      value: `<svg width="${config.width}" height="${config.height}"><polygon points="${svgPoints}" /></svg>`,
    },
  },
  body: {
    type: 'FeatureCollection',
    transformation: { type: config.transformation },
    features: gcps.map((g) => ({
      type: 'Feature',
      properties: { resourceCoords: g.resource },
      geometry: { type: 'Point', coordinates: g.geo },
    })),
  },
};
const outDir = join(ROOT, 'public/georef');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${id}.json`), JSON.stringify(annotation, null, 1) + '\n');
console.log(`\nwrote public/georef/${id}.json (${gcps.length} control points)`);
