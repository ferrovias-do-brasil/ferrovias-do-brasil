/**
 * Validates all content without running Astro: schemas + cross references.
 *
 *   npm run validate
 *
 * Exits with code 1 and a list of problems when something is wrong.
 */
import { relative } from 'node:path';
import type { z } from 'astro/zod';
import {
  citySchema,
  companySchema,
  eventSchema,
  historicMapSchema,
  lineSchema,
  networkSchema,
  sourceSchema,
  stationSchema,
  type Network,
} from '../src/lib/schemas';
import { checkIntegrity } from '../src/lib/integrity';
import { ROOT, loadCollection, networkDirs, readGeometry, readNetworkYaml } from './lib/content';

const problems: string[] = [];

function parseAll<S extends z.ZodType>(collection: string, schema: S) {
  return loadCollection(collection).flatMap((entry) => {
    const r = schema.safeParse(entry.data);
    if (!r.success) {
      for (const issue of r.error.issues) {
        problems.push(`${relative(ROOT, entry.file)}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      return [];
    }
    return [{ id: entry.id, data: r.data as z.infer<S> }];
  });
}

const sources = parseAll('sources', sourceSchema);
const stations = parseAll('stations', stationSchema);
const cities = parseAll('cities', citySchema);
const events = parseAll('events', eventSchema);
const companies = parseAll('companies', companySchema);
const lines = parseAll('lines', lineSchema);
parseAll('historic-maps', historicMapSchema);

const networks: Network[] = [];
const geometryIds = new Map<string, Set<string>>();
for (const dir of networkDirs()) {
  const r = networkSchema.safeParse(readNetworkYaml(dir));
  if (!r.success) {
    for (const issue of r.error.issues) problems.push(`${relative(ROOT, dir)}/network.yaml: ${issue.path.join('.')}: ${issue.message}`);
    continue;
  }
  networks.push(r.data);
  geometryIds.set(r.data.line, new Set((readGeometry(dir)?.features ?? []).map((f) => f.properties?.id as string)));
}

problems.push(...checkIntegrity({ sources, stations, cities, events, companies, lines, networks, geometryIds }));

const counts = `${sources.length} fontes, ${stations.length} estações, ${events.length} eventos, ${networks.reduce((n, x) => n + x.segments.length, 0)} trechos`;
if (problems.length) {
  console.error(`✗ ${problems.length} problema(s):\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ dados válidos (${counts})`);
