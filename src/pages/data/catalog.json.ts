import type { APIRoute } from 'astro';
import { loadSiteData } from '../../lib/site-data';

export const GET: APIRoute = async () => {
  const { catalog } = await loadSiteData();
  return new Response(JSON.stringify(catalog), { headers: { 'Content-Type': 'application/json' } });
};
