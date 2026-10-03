/**
 * Reads the content collections straight from disk, so scripts can validate
 * data without running Astro.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { FeatureCollection, LineString, MultiLineString } from 'geojson';

export const ROOT = new URL('../../', import.meta.url).pathname;
export const CONTENT = join(ROOT, 'src/content');

export interface Entry {
  id: string;
  file: string;
  data: unknown;
  body?: string;
}

function readFrontmatter(text: string): { data: unknown; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  return { data: parseYaml(m[1]), body: m[2] };
}

/** All entries of a folder collection (.md frontmatter or .yaml). */
export function loadCollection(name: string): Entry[] {
  const dir = join(CONTENT, name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => ['.md', '.yaml', '.yml'].includes(extname(f)))
    .sort()
    .map((f) => {
      const file = join(dir, f);
      const text = readFileSync(file, 'utf8');
      const id = basename(f, extname(f));
      if (extname(f) === '.md') {
        const { data, body } = readFrontmatter(text);
        return { id, file, data, body };
      }
      return { id, file, data: parseYaml(text) };
    });
}

export function networkDirs(): string[] {
  const dir = join(CONTENT, 'network');
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(dir, d.name));
}

export function readNetworkYaml(dir: string): unknown {
  return parseYaml(readFileSync(join(dir, 'network.yaml'), 'utf8'));
}

export function readGeometry(dir: string): FeatureCollection<LineString | MultiLineString> | null {
  const file = join(dir, 'geometry.geojson');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
