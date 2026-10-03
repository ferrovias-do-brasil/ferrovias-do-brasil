/**
 * Data schemas shared by the Astro content collections (src/content.config.ts)
 * and the standalone validation scripts (scripts/*.ts).
 *
 * Cross-references between collections (e.g. a claim's `source`) are plain
 * string ids here; their existence is checked by src/lib/integrity.ts.
 */
import { z } from 'astro/zod';
import { isValidPartialDate } from './dates';

export const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ids must be kebab-case ascii');

export const partialDate = z
  .string()
  .refine(isValidPartialDate, 'expected YYYY, YYYY-MM or YYYY-MM-DD');

/** [longitude, latitude], GeoJSON order. */
export const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** A sourced statement. Conflicting statements are kept side by side. */
export function claim<T extends z.ZodType>(value: T) {
  return z.object({
    value,
    source: id,
    page: z.string().optional(),
    note: z.string().optional(),
    circa: z.boolean().optional(),
    preferred: z.boolean().optional(),
  });
}

export const dateClaim = claim(partialDate);
export type DateClaim = z.infer<typeof dateClaim>;

export const dateClaims = z
  .array(dateClaim)
  .min(1)
  .refine((cs) => cs.filter((c) => c.preferred).length <= 1, 'at most one claim can be preferred');

export const confidence = z.enum(['high', 'medium', 'low']);

// ---------------------------------------------------------------- sources

export const sourceSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  year: z.union([z.number().int(), z.string()]).optional(),
  type: z.enum(['primary', 'secondary', 'tertiary', 'dataset']),
  archive: z.string().optional(),
  url: z.url().optional(),
  accessed: partialDate.optional(),
  license: z.string().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------- stations

export const stationSchema = z.object({
  name: z.string(),
  names: z
    .array(z.object({ name: z.string(), from: partialDate.optional(), to: partialDate.optional(), source: id.optional() }))
    .optional(),
  line: id,
  city: id.optional(),
  detail: z.enum(['full', 'minimal']).default('minimal'),
  summary: z.string(),
  km: z.array(z.object({ value: z.number(), year: z.number().int(), source: id, note: z.string().optional() })).optional(),
  opened: dateClaims,
  passenger_end: dateClaims.optional(),
  closed: dateClaims.optional(),
  /** Where the station stood. A station that moved has several sites. */
  sites: z
    .array(
      z.object({
        id,
        coords: lngLat,
        from: partialDate,
        to: partialDate.optional(),
        confidence,
        note: z.string().optional(),
        sources: z.array(id).min(1),
      }),
    )
    .min(1),
  status_now: z.enum(['active', 'freight', 'closed', 'demolished', 'cultural', 'flooded', 'unknown']),
  /** Further sources cited in the body text. */
  sources: z.array(id).default([]),
});
export type Station = z.infer<typeof stationSchema>;

// ---------------------------------------------------------------- cities

export const citySchema = z.object({
  name: z.string(),
  uf: z.string().length(2).default('SP'),
  coords: lngLat,
  summary: z.string(),
  founded: dateClaims.optional(),
  municipality: dateClaims.optional(),
  lines: z.array(id).default([]),
});

// ---------------------------------------------------------------- events

export const eventTypes = [
  'construction',
  'opening',
  'station-opening',
  'variant',
  'closure',
  'removal',
  'flooding',
  'demolition',
  'building',
  'company',
  'city',
  'other',
] as const;

export const eventSchema = z.object({
  title: z.string(),
  date: partialDate,
  circa: z.boolean().optional(),
  type: z.enum(eventTypes),
  summary: z.string(),
  coords: lngLat.optional(),
  stations: z.array(id).default([]),
  cities: z.array(id).default([]),
  segments: z.array(id).default([]),
  sources: z.array(id).min(1),
});

// ---------------------------------------------------------------- companies & lines

export const companySchema = z.object({
  name: z.string(),
  short: z.string(),
  from: partialDate.optional(),
  to: partialDate.optional(),
  successor: id.optional(),
  summary: z.string().optional(),
  sources: z.array(id).min(1),
});

export const lineSchema = z.object({
  name: z.string(),
  short: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  gauge_mm: z.number().int().optional(),
  network: id,
  summary: z.string(),
  operators: z.array(z.object({ company: id, from: partialDate, to: partialDate.optional(), source: id })).min(1),
});

// ---------------------------------------------------------------- historic maps

export const historicMapSchema = z.object({
  title: z.string(),
  year: z.number().int(),
  author: z.string().optional(),
  archive: z.string(),
  url: z.url().optional(),
  iiif_manifest: z.url().optional(),
  /** Georeference Annotation: absolute URL, or a path relative to the site root (e.g. georef/heyse-1912.json). */
  georef_annotation: z.union([z.url(), z.string().regex(/^[a-z0-9/_.-]+\.json$/)]).optional(),
  /** Median / worst expected position error of the overlay, from the georeferencing validation. */
  accuracy_km: z.object({ median: z.number(), max: z.number() }).optional(),
  license: z.string(),
  status: z.enum(['candidate', 'georeferenced']),
  /** Years during which the overlay is offered on the map. */
  show_from: z.number().int().optional(),
  show_to: z.number().int().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------- network

export const segmentStatuses = ['construction', 'open', 'freight_only', 'closed', 'removed', 'flooded'] as const;
export type SegmentStatus = (typeof segmentStatuses)[number];

/**
 * A period in the life of a track segment. `from` is either a plain date
 * (then `sources` must back it) or a list of competing claims.
 */
export const statusPeriod = z
  .object({
    status: z.enum(segmentStatuses),
    from: z.union([partialDate, dateClaims]),
    circa: z.boolean().optional(),
    sources: z.array(id).default([]),
    note: z.string().optional(),
  })
  .refine((p) => typeof p.from !== 'string' || p.sources.length > 0, {
    message: 'a period with a plain `from` date needs at least one source',
  });
export type StatusPeriod = z.infer<typeof statusPeriod>;

export const segmentGeometrySpec = z.discriminatedUnion('method', [
  /** Shortest path over current OSM railway=rail ways. */
  z.object({ method: z.literal('osm-current'), via: z.array(lngLat).optional() }),
  /** Shortest path preferring OSM abandoned/razed/disused ways, bridging small gaps. */
  z.object({ method: z.literal('osm-old'), via: z.array(lngLat).optional(), max_gap_m: z.number().optional() }),
  /** Straight lines through hand-picked points (schematic, low confidence). */
  z.object({ method: z.literal('waypoints'), points: z.array(lngLat).min(0) }),
  /** Geometry drawn by hand (QGIS, geojson.io, traced on a historic map): kept as-is. */
  z.object({ method: z.literal('manual'), traced_on: id.optional() }),
]);

export const segmentSchema = z.object({
  id,
  name: z.string(),
  from: id,
  to: id,
  alignment: z.enum(['original', 'variant', 'bypass', 'branch']),
  replaces: z.array(id).default([]),
  geometry: segmentGeometrySpec,
  geometry_confidence: confidence,
  geometry_note: z.string().optional(),
  status_history: z.array(statusPeriod).min(1),
  notes: z.string().optional(),
});
export type Segment = z.infer<typeof segmentSchema>;

export const nodeSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(['station', 'junction', 'bridge', 'endpoint']),
  coords: lngLat,
  /** Which OSM layer to snap the node to when generating geometry. */
  snap: z.enum(['current', 'old', 'none']).default('current'),
  station: id.optional(),
  note: z.string().optional(),
});
export type NetworkNode = z.infer<typeof nodeSchema>;

export const networkSchema = z.object({
  line: id,
  name: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  /** Reuse an existing OSM cache (e.g. "malha-sp" from `npm run import-malha`) instead of a bbox query. */
  osm_cache: id.optional(),
  nodes: z.array(nodeSchema).min(2),
  segments: z.array(segmentSchema).min(1),
});
export type Network = z.infer<typeof networkSchema>;

/** Properties stored per feature in network/<line>/geometry.geojson. */
export const segmentGeometryProps = z.object({
  id,
  method: z.string(),
  osm_ways: z.array(z.number()).default([]),
  bridged_gap_m: z.number().default(0),
  generated: z.string().optional(),
});
