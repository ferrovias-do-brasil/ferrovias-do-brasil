/**
 * Cross-collection checks that a per-file schema cannot express: every
 * `source`, station, city, segment and node referenced must exist.
 * Used by the build (src/pages/data/catalog.json.ts) and by `npm run validate`.
 */
import type { z } from 'astro/zod';
import type {
  citySchema,
  companySchema,
  eventSchema,
  lineSchema,
  Network,
  Station,
} from './schemas';
import { segmentPeriods } from './network';

interface Item<T> {
  id: string;
  data: T;
}

export interface IntegrityInput {
  sources: { id: string }[];
  stations: Item<Station>[];
  cities: Item<z.infer<typeof citySchema>>[];
  events: Item<z.infer<typeof eventSchema>>[];
  companies: Item<z.infer<typeof companySchema>>[];
  lines: Item<z.infer<typeof lineSchema>>[];
  networks: Network[];
  /** Segment ids that have a geometry, per network line. */
  geometryIds: Map<string, Set<string>>;
}

export function checkIntegrity(input: IntegrityInput): string[] {
  const errors: string[] = [];
  const has = (ids: Iterable<string>) => new Set(ids);
  const sources = has(input.sources.map((s) => s.id));
  const stations = has(input.stations.map((s) => s.id));
  const cities = has(input.cities.map((c) => c.id));
  const companies = has(input.companies.map((c) => c.id));
  const lines = has(input.lines.map((l) => l.id));
  const segments = has(input.networks.flatMap((n) => n.segments.map((s) => s.id)));

  const src = (where: string, id: string | undefined) => {
    if (id !== undefined && !sources.has(id)) errors.push(`${where}: unknown source "${id}"`);
  };
  const claims = (where: string, cs: { source: string }[] | undefined) => cs?.forEach((c) => src(where, c.source));

  for (const { id, data } of input.stations) {
    const w = `stations/${id}`;
    if (!lines.has(data.line)) errors.push(`${w}: unknown line "${data.line}"`);
    if (data.city && !cities.has(data.city)) errors.push(`${w}: unknown city "${data.city}"`);
    claims(w, data.opened);
    claims(w, data.passenger_end);
    claims(w, data.closed);
    data.km?.forEach((k) => src(w, k.source));
    data.names?.forEach((n) => src(w, n.source));
    data.sites.forEach((s) => s.sources.forEach((x) => src(`${w} site ${s.id}`, x)));
    data.sources.forEach((x) => src(w, x));
  }

  for (const { id, data } of input.cities) {
    claims(`cities/${id}`, data.founded);
    claims(`cities/${id}`, data.municipality);
    data.lines.forEach((l) => lines.has(l) || errors.push(`cities/${id}: unknown line "${l}"`));
  }

  for (const { id, data } of input.events) {
    const w = `events/${id}`;
    data.sources.forEach((s) => src(w, s));
    data.stations.forEach((s) => stations.has(s) || errors.push(`${w}: unknown station "${s}"`));
    data.cities.forEach((c) => cities.has(c) || errors.push(`${w}: unknown city "${c}"`));
    data.segments.forEach((s) => segments.has(s) || errors.push(`${w}: unknown segment "${s}"`));
  }

  for (const { id, data } of input.companies) {
    data.sources.forEach((s) => src(`companies/${id}`, s));
    if (data.successor && !companies.has(data.successor)) errors.push(`companies/${id}: unknown successor "${data.successor}"`);
  }

  for (const { id, data } of input.lines) {
    data.operators.forEach((o) => {
      src(`lines/${id}`, o.source);
      if (!companies.has(o.company)) errors.push(`lines/${id}: unknown company "${o.company}"`);
    });
    if (!input.networks.some((n) => n.line === data.network)) errors.push(`lines/${id}: unknown network "${data.network}"`);
  }

  for (const net of input.networks) {
    const w = `network/${net.line}`;
    const nodes = new Map(net.nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    for (const n of net.nodes) {
      if (seen.has(n.id)) errors.push(`${w}: duplicate node "${n.id}"`);
      seen.add(n.id);
      if (n.station && !stations.has(n.station)) errors.push(`${w} node ${n.id}: unknown station "${n.station}"`);
    }
    const geo = input.geometryIds.get(net.line) ?? new Set();
    const segIds = new Set<string>();
    for (const s of net.segments) {
      const ws = `${w} segment ${s.id}`;
      if (segIds.has(s.id)) errors.push(`${ws}: duplicate id`);
      segIds.add(s.id);
      if (!nodes.has(s.from)) errors.push(`${ws}: unknown node "${s.from}"`);
      if (!nodes.has(s.to)) errors.push(`${ws}: unknown node "${s.to}"`);
      if (!geo.has(s.id)) errors.push(`${ws}: no geometry (run npm run import-osm)`);
      s.replaces.forEach((r) => segments.has(r) || errors.push(`${ws}: replaces unknown segment "${r}"`));
      for (const p of s.status_history) {
        p.sources.forEach((x) => src(ws, x));
        if (typeof p.from !== 'string') claims(ws, p.from);
      }
      try {
        segmentPeriods(s);
      } catch (e) {
        errors.push(`${ws}: ${(e as Error).message}`);
      }
    }
    for (const id of geo) if (!segIds.has(id)) errors.push(`${w}: geometry for unknown segment "${id}"`);
  }

  return errors;
}
