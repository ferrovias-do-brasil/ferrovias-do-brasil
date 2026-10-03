import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  citySchema,
  companySchema,
  eventSchema,
  historicMapSchema,
  lineSchema,
  networkSchema,
  sourceSchema,
  stationSchema,
} from './lib/schemas';

const NETWORK_DIR = './src/content/network';

const md = (base: string) => glob({ pattern: '**/*.md', base: `./src/content/${base}` });
const yaml = (base: string) => glob({ pattern: '**/*.{yaml,yml}', base: `./src/content/${base}` });

export const collections = {
  sources: defineCollection({ loader: yaml('sources'), schema: sourceSchema }),
  stations: defineCollection({ loader: md('stations'), schema: stationSchema }),
  cities: defineCollection({ loader: md('cities'), schema: citySchema }),
  events: defineCollection({ loader: md('events'), schema: eventSchema }),
  companies: defineCollection({ loader: yaml('companies'), schema: companySchema }),
  lines: defineCollection({ loader: yaml('lines'), schema: lineSchema }),
  historicMaps: defineCollection({ loader: yaml('historic-maps'), schema: historicMapSchema }),
  networks: defineCollection({
    // One src/content/network/<line>/network.yaml per line; the entry id is the line id.
    loader: async () =>
      readdirSync(NETWORK_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const data = parseYaml(readFileSync(join(NETWORK_DIR, d.name, 'network.yaml'), 'utf8')) as { line: string };
          return { ...data, id: data.line };
        }),
    schema: networkSchema,
  }),
};
