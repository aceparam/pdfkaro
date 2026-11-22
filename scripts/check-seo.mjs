// Checks what search engines and link previews read in a built site. Run after a
// build: `npm run check:seo [directory]`, with `dist` as the default. It takes the
// origin and base the build used from SITE_ORIGIN and SITE_BASE, as the build does.
// `check:base` runs it on its sub-path build too.
//
// It checks, for every built page:
//  1. one canonical tag, equal to the origin, the base and the page's path (none on 404);
//  2. the social tags, agreeing with the title, description and canonical (none on 404);
//  3. the social image: a 1200 by 630 PNG under 100 KB with only the chunks a plain
//     screenshot needs, so no text or metadata rides along;
//  4. titles and descriptions unique, under 60 and 155 characters;
//  5. on each tool page, exactly one JSON-LD block, with no raw <, > or &, holding
//     exactly the WebApplication and BreadcrumbList the registry gives; none elsewhere;
//  6. a hub page for each group with a published page, listing exactly its pages in
//     registry order, linked from each of its tool pages, and no other hub page;
//  7. sitemap.xml listing exactly the home page, the hub pages, the tool pages and the
//     footer pages marked written, each a built page, and robots.txt naming it;
//  8. noindex on exactly the footer pages not yet written at the root, each still
//     showing its placeholder, and on every page under a sub-path.
//
// It reads the registry and src/site.ts for data and the setting checks only, and
// works out every expected value with its own code, never src/tools/seo.ts, so a
// mistake in one is caught by the other.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultOrigin, footerLinks, isSiteBase, isSiteOrigin, siteName, tagline } from '../src/site.ts';
import { groups, tools } from '../src/tools/registry.ts';

/** The sentences a footer page shows while it is still a placeholder. */
export const placeholderSentences = ['has not been written yet', 'No contact address has been added yet'];

/** Chunk types a plain screenshot from Chromium may carry. Anything else (text, metadata, pictures) is refused. */
export const allowedChunks = ['IHDR', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'pHYs'];

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

/** Turns HTML or XML character references back into characters. */
export function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z0-9]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return entities[name.toLowerCase()] ?? whole;
  });
}

/** The attributes of one start tag, by lower-case name, decoded. */
function attributesOf(tag) {
  const attributes = {};
  const body = tag.replace(/^<[^\s/>]+/, '').replace(/\/?>$/, '');
  for (const match of body.matchAll(/([^\s=/<>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (!(name in attributes)) attributes[name] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** Every start tag of one element in a page, as attribute objects. */
function tags(html, element) {
  return [...html.matchAll(new RegExp(`<${element}\\b[^>]*>`, 'gi'))].map((match) => attributesOf(match[0]));
}

/** The values of the meta tags with this property or name. */
function metas(html, key, value) {
  return tags(html, 'meta')
    .filter((attributes) => attributes[key] === value)
    .map((attributes) => attributes.content ?? '');
}

/** The page's title text, decoded, or null. */
export function titleOf(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? decode(match[1]) : null;
}

/** The page's meta description, or null. */
export function descriptionOf(html) {
  return metas(html, 'name', 'description')[0] ?? null;
}

/** The text of each JSON-LD block. */
export function jsonLdBlocks(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => (attributesOf(`<script ${match[1]}>`).type ?? '').trim().toLowerCase() === 'application/ld+json')
    .map((match) => match[2]);
}

/** The page's path from the site root, from its file name in the build: index.html is "/", x.html is "/x". */
export function pathOfFile(file) {
  const name = file.split(sep).join('/').replace(/\.html$/, '');
  if (name === 'index') return '/';
  return `/${name.replace(/\/index$/, '')}`;
}

/** The absolute address of a path from the site root. */
export function addressOf(origin, base, path) {
  const prefix = base.replace(/\/+$/, '');
  return `${origin}${prefix}${path}`;
}

/** The link to a path from the site root, under the base. */
function hrefOf(base, path) {
  const prefix = base.replace(/\/+$/, '');
  return `${prefix}${path}`;
}

function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((each, i) => sameValue(each, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
  }
  return a === b;
}

/** Checks 1 and 2: the canonical and social tags of one page. */
export function checkPageTags(html, { path, origin, base }) {
  const problems = [];
  const canonicals = tags(html, 'link').filter((attributes) => (attributes.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'));
  const og = tags(html, 'meta').filter((attributes) => (attributes.property ?? '').startsWith('og:'));
  if (path === '/404') {
    if (canonicals.length > 0) problems.push('the 404 page has a canonical tag');
    if (og.length > 0) problems.push('the 404 page has social tags');
    return problems;
  }
  const canonical = addressOf(origin, base, path);
  if (canonicals.length !== 1) problems.push(`has ${canonicals.length} canonical tags, not one`);
  else if (canonicals[0].href !== canonical) problems.push(`its canonical is "${canonicals[0].href}", not "${canonical}"`);

  const title = titleOf(html);
  const description = descriptionOf(html);
  const wanted = {
    'og:type': 'website',
    'og:title': title,
    'og:description': description,
    'og:url': canonical,
    'og:image': addressOf(origin, base, '/social.png'),
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:image:alt': `${siteName}. ${tagline}`,
  };
  for (const [property, value] of Object.entries(wanted)) {
    const found = metas(html, 'property', property);
    if (found.length !== 1) problems.push(`has ${found.length} ${property} tags, not one`);
    else if (found[0] !== value) problems.push(`its ${property} is "${found[0]}", not "${value}"`);
  }
  for (const { property } of og) {
    if (!(property in wanted)) problems.push(`has a social tag the site does not write: ${property}`);
  }
  return problems;
}

/** Check 3: the social image's bytes. */
export function checkSocialImage(bytes) {
  if (!bytes) return ['social.png is missing from the build'];
  const problems = [];
  if (bytes.length >= 100 * 1024) problems.push(`social.png is ${bytes.length} bytes, not under 100 KB`);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || signature.some((byte, i) => bytes[i] !== byte)) return [...problems, 'social.png is not a PNG'];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types = [];
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + length > bytes.length) {
      problems.push('social.png has a chunk that runs past the end of the file');
      break;
    }
    if (type === 'IHDR') {
      const width = view.getUint32(at + 8);
      const height = view.getUint32(at + 12);
      if (width !== 1200 || height !== 630) problems.push(`social.png is ${width} by ${height}, not 1200 by 630`);
    }
    types.push(type);
    at += 12 + length;
  }
  if (types[0] !== 'IHDR') problems.push('social.png does not start with its IHDR chunk');
  if (types.at(-1) !== 'IEND' || at !== bytes.length) problems.push('social.png does not end with its IEND chunk');
  for (const type of new Set(types)) {
    if (!allowedChunks.includes(type)) problems.push(`social.png carries a ${type} chunk, which is not allowed`);
  }
  return problems;
}

/** Check 4: titles and descriptions, as { path, title, description } for every page. */
export function checkTitles(pages) {
  const problems = [];
  for (const key of ['title', 'description']) {
    const limit = key === 'title' ? 60 : 155;
    const seen = new Map();
    for (const page of pages) {
      const value = page[key];
      if (value === null || value === undefined || value === '') {
        problems.push(`${page.path}: has no ${key}`);
        continue;
      }
      if (value.length >= limit) problems.push(`${page.path}: its ${key} is ${value.length} characters, not under ${limit}`);
      if (seen.has(value)) problems.push(`${page.path}: its ${key} "${value}" is also the ${key} of ${seen.get(value)}`);
      else seen.set(value, page.path);
    }
  }
  return problems;
}

/** The JSON-LD a tool page must hold, worked out here from the registry. */
export function expectedStructuredData({ page, group, origin, base }) {
  const url = addressOf(origin, base, `/${page.slug}`);
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
          { '@type': 'ListItem', position: 1, name: siteName, item: addressOf(origin, base, '/') },
          { '@type': 'ListItem', position: 2, name: group.name, item: addressOf(origin, base, `/${group.slug}`) },
          { '@type': 'ListItem', position: 3, name: page.name, item: url },
        ],
      },
    ],
  };
}

/** Check 5: the JSON-LD of one page. `tool` is { page, group } for a tool page, or null for any other page. */
export function checkStructuredData(html, { tool, origin, base }) {
  const blocks = jsonLdBlocks(html);
  if (!tool) return blocks.length > 0 ? [`has ${blocks.length} JSON-LD blocks; only tool pages carry one`] : [];
  if (blocks.length !== 1) return [`has ${blocks.length} JSON-LD blocks, not one`];
  const text = blocks[0];
  const problems = [];
  if (/[<>&]/.test(text)) problems.push('its JSON-LD holds a raw <, > or &');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return [...problems, 'its JSON-LD does not parse'];
  }
  const wanted = expectedStructuredData({ ...tool, origin, base });
  if (!sameValue(value, wanted)) problems.push(`its JSON-LD is ${JSON.stringify(value)}, not ${JSON.stringify(wanted)}`);
  return problems;
}

/** The links in a page's main element, in order, as [href, text]. */
function mainLinks(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
  return [...main.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => [attributesOf(`<a ${match[1]}>`).href ?? '', decode(match[2].replace(/<[^>]*>/g, ''))]);
}

/** The groups that have a published page, with their pages, in registry order. */
export function groupsShown(groupList, toolList) {
  return groupList
    .map((group) => ({ group, pages: toolList.filter((tool) => tool.group === group.id).flatMap((tool) => tool.pages) }))
    .filter(({ pages }) => pages.length > 0);
}

/** Check 6: hub pages, from the built pages by path. */
export function checkHubs(pages, { groups: groupList, tools: toolList, base }) {
  const problems = [];
  const shown = groupsShown(groupList, toolList);
  for (const group of groupList) {
    const path = `/${group.slug}`;
    const entry = shown.find((each) => each.group.id === group.id);
    const html = pages.get(path);
    if (!entry) {
      if (html !== undefined) problems.push(`${path}: a hub page is built for ${group.name}, which has no published tool`);
      continue;
    }
    if (html === undefined) {
      problems.push(`${path}: the hub page of ${group.name} is missing`);
      continue;
    }
    const links = mainLinks(html).map(([href]) => href);
    const wanted = entry.pages.map((page) => hrefOf(base, `/${page.slug}`));
    if (!sameValue(links, wanted)) problems.push(`${path}: lists ${links.join(', ') || 'no tools'}, not ${wanted.join(', ')}`);
    for (const page of entry.pages) {
      const toolHtml = pages.get(`/${page.slug}`);
      if (toolHtml === undefined) continue;
      const linked = mainLinks(toolHtml).some(([href, text]) => href === hrefOf(base, path) && text.trim() === `All tools in ${group.name}`);
      if (!linked) problems.push(`/${page.slug}: does not link to its hub page with "All tools in ${group.name}"`);
    }
  }
  return problems;
}

/** The paths the sitemap must list, worked out here. */
export function expectedSitemapPaths({ groups: groupList, tools: toolList, footer }) {
  return [
    '/',
    ...groupsShown(groupList, toolList).map(({ group }) => `/${group.slug}`),
    ...toolList.flatMap((tool) => tool.pages.map((page) => `/${page.slug}`)),
    ...footer.filter((link) => link.written).map((link) => link.href),
  ];
}

/** Check 7: sitemap.xml and robots.txt, against the built pages' paths. */
export function checkSitemap(xml, robots, { builtPaths, groups: groupList, tools: toolList, footer, origin, base }) {
  const problems = [];
  if (xml === undefined) return ['sitemap.xml is missing from the build'];
  if (!xml.startsWith('<?xml') || !/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(xml)) {
    problems.push('sitemap.xml is not a urlset in the sitemaps namespace');
  }
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => decode(match[1]));
  if (new Set(locs).size !== locs.length) problems.push('sitemap.xml lists an address twice');
  const wanted = expectedSitemapPaths({ groups: groupList, tools: toolList, footer }).map((path) => addressOf(origin, base, path));
  for (const address of wanted) if (!locs.includes(address)) problems.push(`sitemap.xml does not list ${address}`);
  for (const address of locs) {
    if (!wanted.includes(address)) problems.push(`sitemap.xml lists ${address}, which it should not`);
    const root = addressOf(origin, base, '');
    const path = address.startsWith(root) ? address.slice(root.length) || '/' : null;
    if (path === null || !builtPaths.includes(path)) problems.push(`sitemap.xml lists ${address}, which is not a built page`);
  }
  if (robots === undefined) return [...problems, 'robots.txt is missing from the build'];
  const lines = robots.split('\n').map((line) => line.trim());
  if (!lines.includes('User-agent: *') || !lines.includes('Allow: /')) problems.push('robots.txt does not allow every crawler');
  const sitemaps = lines.filter((line) => line.toLowerCase().startsWith('sitemap:'));
  const sitemap = addressOf(origin, base, '/sitemap.xml');
  if (sitemaps.length !== 1 || sitemaps[0] !== `Sitemap: ${sitemap}`) problems.push(`robots.txt does not name the sitemap at ${sitemap}`);
  if (lines.some((line) => line.toLowerCase().startsWith('disallow:'))) problems.push('robots.txt disallows something');
  return problems;
}

/** Check 8: noindex, from the built pages by path. */
export function checkNoindex(pages, { footer, base }) {
  const problems = [];
  const atRoot = base.replace(/\/+$/, '') === '';
  for (const [path, html] of pages) {
    const robots = tags(html, 'meta').filter((attributes) => (attributes.name ?? '').toLowerCase() === 'robots');
    const noindex = robots.some((attributes) => /\bnoindex\b/i.test(attributes.content ?? ''));
    if (robots.length > 1) problems.push(`${path}: has ${robots.length} robots tags, not one`);
    if (!atRoot) {
      if (!noindex) problems.push(`${path}: a page under a sub-path must carry noindex`);
      continue;
    }
    const link = footer.find((each) => each.href === path);
    const unwritten = Boolean(link && !link.written);
    if (unwritten && !noindex) problems.push(`${path}: a placeholder page must carry noindex`);
    if (!unwritten && robots.length > 0) problems.push(`${path}: carries noindex, but only a placeholder page may`);
    if (unwritten && !placeholderSentences.some((sentence) => html.includes(sentence))) {
      problems.push(`${path}: is marked not written, but shows no placeholder sentence; mark it written in src/site.ts`);
    }
  }
  return problems;
}

/**
 * Every check over one built site, held in memory: `files` maps each file's path in the build
 * (such as "merge-pdf.html", "sitemap.xml") to its text, or to its bytes for social.png.
 */
export function checkSite(files, { origin, base, groups: groupList = groups, tools: toolList = tools, footer = footerLinks }) {
  const problems = [];
  const pages = new Map();
  for (const [file, content] of files) {
    if (file.endsWith('.html')) pages.set(pathOfFile(file), content);
  }
  if (pages.size === 0) return ['the build holds no pages'];
  const toolPages = new Map(
    toolList.flatMap((tool) => tool.pages.map((page) => [`/${page.slug}`, { page, group: groupList.find((group) => group.id === tool.group) }])),
  );
  const titles = [];
  for (const [path, html] of pages) {
    for (const problem of checkPageTags(html, { path, origin, base })) problems.push(`${path}: ${problem}`);
    for (const problem of checkStructuredData(html, { tool: toolPages.get(path) ?? null, origin, base })) problems.push(`${path}: ${problem}`);
    titles.push({ path, title: titleOf(html), description: descriptionOf(html) });
  }
  for (const path of toolPages.keys()) if (!pages.has(path)) problems.push(`${path}: the tool page is missing`);
  problems.push(...checkSocialImage(files.get('social.png')));
  problems.push(...checkTitles(titles));
  problems.push(...checkHubs(pages, { groups: groupList, tools: toolList, base }));
  problems.push(
    ...checkSitemap(files.get('sitemap.xml'), files.get('robots.txt'), {
      builtPaths: [...pages.keys()].filter((path) => path !== '/404'),
      groups: groupList,
      tools: toolList,
      footer,
      origin,
      base,
    }),
  );
  problems.push(...checkNoindex(pages, { footer, base }));
  return problems;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The origin and base from SITE_ORIGIN and SITE_BASE, checked as the build checks them. */
export function settings(env) {
  const origin = env.SITE_ORIGIN || defaultOrigin;
  const base = env.SITE_BASE || '/';
  if (!isSiteOrigin(origin)) throw new Error(`SITE_ORIGIN is not a plain origin: "${origin}".`);
  if (!isSiteBase(base)) throw new Error(`SITE_BASE is not a plain path: "${base}".`);
  return { origin, base };
}

/** Reads a built directory and runs every check on it. */
export function checkDirectory(dir, { origin, base }) {
  const files = new Map();
  for (const file of walk(dir)) {
    const name = relative(dir, file).split(sep).join('/');
    if (name.endsWith('.html') || name === 'sitemap.xml' || name === 'robots.txt') files.set(name, readFileSync(file, 'utf8'));
    else if (name === 'social.png') files.set(name, new Uint8Array(readFileSync(file)));
  }
  const pages = [...files.keys()].filter((name) => name.endsWith('.html')).length;
  return { pages, problems: checkSite(files, { origin, base }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? 'dist';
  const { origin, base } = settings(process.env);
  const { pages, problems } = checkDirectory(dir, { origin, base });
  if (problems.length > 0) {
    console.error('The search check failed:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `${pages} pages in ${dir}, under ${addressOf(origin, base, '/')}, carry their canonical and social tags, unique titles and descriptions, the JSON-LD of each tool page and the hub links; the sitemap, robots.txt, social image and noindex tags agree with the registry.`,
  );
}
