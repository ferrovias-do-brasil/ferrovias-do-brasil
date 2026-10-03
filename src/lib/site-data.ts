/**
 * Build-time access to everything the site renders. Loads the collections,
 * the generated track geometry, checks referential integrity (the build fails
 * on any broken reference) and derives the map/panel data.
 */
import { getCollection } from 'astro:content';
import type { FeatureCollection, LineString, MultiLineString } from 'geojson';
import { checkIntegrity } from './integrity';
import { segmentFeatures, segmentPeriods, stationFeatures, type SegmentGeometries } from './network';
import { preferredClaim, toDateClaims } from './claims';
import { toDecimalYear } from './dates';
import type { Network } from './schemas';

const geometryFiles = import.meta.glob<string>('/src/content/network/*/geometry.geojson', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function geometriesByLine(): Map<string, SegmentGeometries> {
  const out = new Map<string, SegmentGeometries>();
  for (const [path, raw] of Object.entries(geometryFiles)) {
    const line = path.split('/').at(-2)!;
    const fc = JSON.parse(raw) as FeatureCollection<LineString | MultiLineString, { id: string }>;
    out.set(line, new Map(fc.features.map((f) => [f.properties.id, f.geometry])));
  }
  return out;
}

let cache: Promise<SiteData> | undefined;

export function loadSiteData(): Promise<SiteData> {
  cache ??= build();
  return cache;
}

export type SiteData = Awaited<ReturnType<typeof build>>;

async function build() {
  const [sources, stations, cities, events, companies, lines, historicMaps, networkEntries] = await Promise.all([
    getCollection('sources'),
    getCollection('stations'),
    getCollection('cities'),
    getCollection('events'),
    getCollection('companies'),
    getCollection('lines'),
    getCollection('historicMaps'),
    getCollection('networks'),
  ]);
  const networks: Network[] = networkEntries.map((e) => e.data);
  const geometries = geometriesByLine();

  const errors = checkIntegrity({
    sources,
    stations,
    cities,
    events,
    companies,
    lines,
    networks,
    geometryIds: new Map([...geometries].map(([line, g]) => [line, new Set(g.keys())])),
  });
  if (errors.length) throw new Error(`Data integrity check failed:\n  - ${errors.join('\n  - ')}`);

  const lineById = new Map(lines.map((l) => [l.data.network, l]));
  const network = {
    type: 'FeatureCollection' as const,
    features: networks.flatMap((n) => {
      const color = lineById.get(n.line)?.data.color ?? '#555555';
      return segmentFeatures(n, geometries.get(n.line) ?? new Map(), color).features;
    }),
  };

  const stationsGeo = stationFeatures(stations.map(({ id, data }) => ({ id, data })));

  // Where to put an event on the map: explicit coords, else its first station's first site.
  const stationById = new Map(stations.map((s) => [s.id, s.data]));
  const eventItems = events
    .map(({ id, data }) => {
      const coords = data.coords ?? (data.stations[0] ? stationById.get(data.stations[0])?.sites[0].coords : undefined);
      return { id, ...data, t: toDecimalYear(data.date), coords: coords ?? null };
    })
    .sort((a, b) => a.t - b.t);

  const segmentMeta = Object.fromEntries(
    networks.flatMap((n) =>
      n.segments.map((s) => [
        s.id,
        {
          id: s.id,
          line: n.line,
          name: s.name,
          alignment: s.alignment,
          replaces: s.replaces,
          replacedBy: n.segments.filter((o) => o.replaces.includes(s.id)).map((o) => o.id),
          geometry: { method: s.geometry.method, confidence: s.geometry_confidence, note: s.geometry_note ?? null },
          periods: segmentPeriods(s).map((p, i) => {
            const raw = s.status_history[i];
            return { ...p, claims: toDateClaims(raw.from, raw.sources, raw.circa), note: raw.note ?? null };
          }),
          notes: s.notes ?? null,
        },
      ]),
    ),
  );

  const stationMeta = Object.fromEntries(
    stations.map(({ id, data }) => [
      id,
      {
        id,
        name: data.name,
        summary: data.summary,
        detail: data.detail,
        opened: data.opened,
        openedPreferred: preferredClaim(data.opened).value,
        passenger_end: data.passenger_end ?? null,
        closed: data.closed ?? null,
        km: data.km ?? [],
        sites: data.sites,
        status_now: data.status_now,
      },
    ]),
  );

  const sourceMeta = Object.fromEntries(sources.map(({ id, data }) => [id, data]));

  return {
    sources,
    stations,
    cities,
    events,
    companies,
    lines,
    historicMaps,
    networks,
    geometries,
    network,
    stationsGeo,
    catalog: {
      segments: segmentMeta,
      stations: stationMeta,
      sources: sourceMeta,
      events: eventItems,
      historicMaps: historicMaps.map(({ id, data }) => ({ id, ...data })),
      lines: lines.map(({ id, data }) => ({ id, name: data.name, short: data.short, color: data.color })),
    },
  };
}

