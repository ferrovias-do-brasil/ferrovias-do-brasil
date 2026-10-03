import type { APIRoute } from 'astro';
import { loadSiteData } from '../../lib/site-data';

export const GET: APIRoute = async () => {
  const { stationsGeo } = await loadSiteData();
  return new Response(JSON.stringify(stationsGeo), { headers: { 'Content-Type': 'application/geo+json' } });
};
