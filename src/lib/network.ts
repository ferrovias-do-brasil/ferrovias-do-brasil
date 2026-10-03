/**
 * Turns the curated, versioned track network into time-filterable features.
 *
 * Every segment has a status history ("open" from 1908-12-02, "closed" from
 * 1969-02-16, "removed" ...). For the map we flatten each segment into one
 * feature per period, carrying `start`/`end` as decimal years, so that the
 * client can show any year with a single MapLibre filter expression.
 */
import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import type { Network, Segment, SegmentStatus, Station } from './schemas';
import { preferredClaim, preferredDate, toDateClaims } from './claims';
import { toDecimalYear } from './dates';

/** Sentinel end for periods that are still current. */
export const OPEN_END = 9999;

export interface Period {
  status: SegmentStatus;
  start: number;
  end: number;
  /** ISO partial date as displayed. */
  from: string;
  circa: boolean;
  /** True when sources disagree about this period's start. */
  disputed: boolean;
}

export function segmentPeriods(segment: Pick<Segment, 'id' | 'status_history'>): Period[] {
  const periods = segment.status_history.map((p) => {
    const from = preferredDate(p.from);
    const claims = toDateClaims(p.from, p.sources, p.circa);
    return {
      status: p.status,
      start: toDecimalYear(from),
      end: OPEN_END,
      from,
      circa: Boolean(p.circa ?? (typeof p.from !== 'string' && preferredClaim(p.from).circa)),
      disputed: new Set(claims.map((c) => c.value)).size > 1,
    };
  });
  for (let i = 0; i < periods.length; i++) {
    if (i > 0 && periods[i].start < periods[i - 1].start) {
      throw new Error(`segment ${segment.id}: status_history is not in chronological order`);
    }
    if (i < periods.length - 1) periods[i].end = periods[i + 1].start;
  }
  return periods;
}

export function statusAt(segment: Pick<Segment, 'id' | 'status_history'>, t: number): SegmentStatus | null {
  const p = segmentPeriods(segment).find((p) => p.start <= t && t < p.end);
  return p?.status ?? null;
}

/** Statuses in which trains actually run. */
export const OPERATING: ReadonlySet<SegmentStatus> = new Set(['open', 'freight_only']);

export type ChangeKind = 'added' | 'removed' | 'unchanged' | 'absent';

/** How a segment changed between two moments, for the "compare years" mode. */
export function changeBetween(a: SegmentStatus | null, b: SegmentStatus | null): ChangeKind {
  const opA = a !== null && OPERATING.has(a);
  const opB = b !== null && OPERATING.has(b);
  if (opA && opB) return 'unchanged';
  if (!opA && opB) return 'added';
  if (opA && !opB) return 'removed';
  return 'absent';
}

export type SegmentGeometries = Map<string, LineString | MultiLineString>;

export interface SegmentFeatureProps {
  segment: string;
  line: string;
  name: string;
  status: SegmentStatus;
  start: number;
  end: number;
  from: string;
  circa: boolean;
  disputed: boolean;
  alignment: Segment['alignment'];
  confidence: Segment['geometry_confidence'];
  method: Segment['geometry']['method'];
  color: string;
  /** Lighter variant of `color`, for dark basemaps. */
  color_dark: string;
}

/** Mixes a #rrggbb colour with white. */
export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  const [r, g, b] = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function segmentFeatures(
  network: Network,
  geometries: SegmentGeometries,
  color: string,
): FeatureCollection<LineString | MultiLineString, SegmentFeatureProps> {
  const features: Feature<LineString | MultiLineString, SegmentFeatureProps>[] = [];
  for (const seg of network.segments) {
    const geometry = geometries.get(seg.id);
    if (!geometry) throw new Error(`segment ${seg.id} has no geometry (run npm run import-osm)`);
    for (const p of segmentPeriods(seg)) {
      features.push({
        type: 'Feature',
        geometry,
        properties: {
          segment: seg.id,
          line: network.line,
          name: seg.name,
          status: p.status,
          start: p.start,
          end: p.end,
          from: p.from,
          circa: p.circa,
          disputed: p.disputed,
          alignment: seg.alignment,
          confidence: seg.geometry_confidence,
          method: seg.geometry.method,
          color,
          color_dark: lighten(color, 0.3),
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

export interface StationFeatureProps {
  station: string;
  site: string;
  name: string;
  line: string;
  detail: Station['detail'];
  start: number;
  end: number;
  /** Decimal year passenger service ended, or OPEN_END. */
  passenger_end: number;
  confidence: Station['sites'][number]['confidence'];
  disputed: boolean;
}

export function stationFeatures(stations: { id: string; data: Station }[]): FeatureCollection<Point, StationFeatureProps> {
  const features: Feature<Point, StationFeatureProps>[] = [];
  for (const { id, data } of stations) {
    const opened = toDecimalYear(preferredClaim(data.opened).value);
    const closed = data.closed ? toDecimalYear(preferredClaim(data.closed).value) : OPEN_END;
    const passengerEnd = data.passenger_end ? toDecimalYear(preferredClaim(data.passenger_end).value) : OPEN_END;
    const disputed = new Set(data.opened.map((c) => c.value)).size > 1;
    for (const site of data.sites) {
      const start = Math.max(opened, toDecimalYear(site.from));
      const end = Math.min(closed, site.to ? toDecimalYear(site.to) : OPEN_END);
      if (end <= start) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: site.coords },
        properties: {
          station: id,
          site: site.id,
          name: data.name,
          line: data.line,
          detail: data.detail,
          start,
          end,
          passenger_end: passengerEnd,
          confidence: site.confidence,
          disputed,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
