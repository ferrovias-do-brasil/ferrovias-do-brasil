import type { APIRoute } from 'astro';
import { loadSiteData } from '../../lib/site-data';

export const GET: APIRoute = async () => {
  const { network } = await loadSiteData();
  return new Response(JSON.stringify(network), { headers: { 'Content-Type': 'application/geo+json' } });
};
