/**
 * Download from the public Overpass API, with an on-disk cache in .cache/osm/.
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { join } from 'node:path';
import { ROOT } from './content';
import type { OverpassWay } from './osm-graph';

const ENDPOINTS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const ATTEMPTS_PER_ENDPOINT = 3;
const USER_AGENT = 'ferrovias-do-brasil/0.1 (+https://github.com/ferrovias-do-brasil; open-source railway history)';
export const CACHE_DIR = join(ROOT, '.cache/osm');

// Node's default 250 ms IPv6→IPv4 fallback is too short on some networks (e.g. WSL).
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamilyAttemptTimeout(3000);

/** Public Overpass servers are often busy: retry with backoff, then try the next server. */
export async function downloadOverpass(query: string, timeoutMs = 200_000): Promise<string> {
  const failures: string[] = [];
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_ENDPOINT; attempt++) {
      console.log(`  downloading from ${endpoint} (attempt ${attempt}) …`);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await res.text();
        if (res.ok && text.trimStart().startsWith('{')) return text;
        failures.push(`${endpoint}: HTTP ${res.status}`);
      } catch (e) {
        failures.push(`${endpoint}: ${(e as Error).message}`);
      }
      if (attempt < ATTEMPTS_PER_ENDPOINT) await new Promise((r) => setTimeout(r, 15_000 * attempt));
    }
  }
  throw new Error(`Overpass unavailable; the cached data was kept.\n  - ${failures.join('\n  - ')}`);
}

/** Ways from the cache file `<name>.json`, downloading first when missing or when `refresh` is set. */
export async function cachedWays(name: string, query: string, refresh: boolean, timeoutMs?: number): Promise<OverpassWay[]> {
  const cacheFile = join(CACHE_DIR, `${name}.json`);
  if (!refresh && existsSync(cacheFile)) {
    console.log(`  using cached ${cacheFile}`);
  } else {
    const text = await downloadOverpass(query, timeoutMs);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, text);
  }
  const raw = JSON.parse(readFileSync(cacheFile, 'utf8'));
  return raw.elements.filter((e: { type: string }) => e.type === 'way');
}
