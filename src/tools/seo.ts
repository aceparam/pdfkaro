// Plain builders for what search engines and link previews read: the JSON-LD of a
// tool page, the sitemap and the robots file. No DOM and no rendering, so they run
// in Node. scripts/check-seo.mjs works out the same values with its own code, so a
// mistake in one is caught by the other.

import { absoluteUrl } from '../site';
import type { FooterLink } from '../site';
import type { Group, Tool, ToolPage } from './registry';
import type { HubPage } from './queries';

type StructuredDataInput = {
  page: ToolPage;
  group: Group;
  origin: string;
  base: string;
  siteName: string;
};

/**
 * The JSON-LD of a tool page: one `WebApplication` and one `BreadcrumbList` (home, the
 * group's hub page, the page). Nothing that is not on the page: no rating, review, price or offer.
 */
export function toolStructuredData({ page, group, origin, base, siteName }: StructuredDataInput) {
  const url = absoluteUrl(origin, base, `/${page.slug}`);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: page.name,
        description: page.description,
        url,
        applicationCategory: 'UtilitiesApplication',
        isAccessibleForFree: true,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: siteName, item: absoluteUrl(origin, base, '/') },
          { '@type': 'ListItem', position: 2, name: group.name, item: absoluteUrl(origin, base, `/${group.slug}`) },
          { '@type': 'ListItem', position: 3, name: page.name, item: url },
        ],
      },
    ],
  };
}

/**
 * A value as JSON text for a `<script type="application/ld+json">` block. `<`, `>` and `&` become
 * the JSON escapes \u003c, \u003e and \u0026, so no text can close the script or start a comment,
 * and a JSON parser reads back the same value. They occur only inside JSON strings, so the JSON's
 * structure is never touched.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/**
 * The paths the sitemap lists, from the site root: the home page, each hub page, every tool page,
 * then each footer page the owner has written. A page that still shows a placeholder, and the 404
 * page, are left out.
 */
export function sitemapPaths(hubs: Pick<HubPage, 'slug'>[], tools: Tool[], footer: FooterLink[]): string[] {
  return [
    '/',
    ...hubs.map((hub) => `/${hub.slug}`),
    ...tools.flatMap((tool) => tool.pages.map((page) => `/${page.slug}`)),
    ...footer.filter((link) => link.written).map((link) => link.href),
  ];
}

const xmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => xmlEscapes[character]!);
}

/** A sitemap of absolute addresses, with `loc` only. */
export function sitemapXml(urls: string[]): string {
  const entries = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>\n`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}</urlset>\n`;
}

/** The robots file: every crawler may read every page, and the sitemap is named. */
export function robotsTxt(origin: string, base: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(origin, base, '/sitemap.xml')}\n`;
}
