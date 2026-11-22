// robots.txt: every crawler may read every page, and the sitemap is named. On a preview under a
// sub-path crawlers never read this file; the noindex tag on every page keeps the preview out.
import type { APIRoute } from 'astro';
import { robotsTxt } from '../tools/seo';

export const GET: APIRoute = () => {
  const body = robotsTxt(import.meta.env.SITE, import.meta.env.BASE_URL);
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
