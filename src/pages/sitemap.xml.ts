// sitemap.xml, built from the registry at build time: the home page, each hub page, every
// tool page and each site page the owner has written (src/tools/seo.ts).
import type { APIRoute } from 'astro';
import { absoluteUrl, footerLinks } from '../site';
import { groups, tools } from '../tools/registry';
import { hubPages } from '../tools/queries';
import { sitemapPaths, sitemapXml } from '../tools/seo';

export const GET: APIRoute = () => {
  const base = import.meta.env.BASE_URL;
  // The origin from SITE_ORIGIN, checked in astro.config.mjs: never a trailing slash.
  const origin = import.meta.env.SITE;
  const paths = sitemapPaths(hubPages(groups, tools, base), tools, footerLinks);
  const body = sitemapXml(paths.map((path) => absoluteUrl(origin, base, path)));
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
