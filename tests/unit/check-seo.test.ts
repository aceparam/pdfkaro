import { describe, expect, it } from 'vitest';
import { checkSite, checkSocialImage, decode, pathOfFile, settings } from '../../scripts/check-seo.mjs';
import type { FooterLink } from '../../src/site';
import type { Group, Tool } from '../../src/tools/registry';

// A made-up registry and a made-up build that agrees with it. Each test breaks one thing and
// checks that the search check names it. The origin is example.org, a domain kept for examples.

const origin = 'https://example.org';

const group = (id: Group['id'], name: string, slug: Group['slug']): Group => ({
  id,
  name,
  slug,
  title: `${name} - PDFkaro`,
  description: `${name} description.`,
  sentence: `${name} sentence.`,
  claimsDevice: false,
});
const groups: Group[] = [group('organise', 'Organise pages', 'organise-pages'), group('protect', 'Protect', 'protect'), group('read', 'Read and check', 'read-and-check')];

const toolPage = (slug: string, name: string) => ({
  slug,
  name,
  summary: `${name} summary.`,
  title: `${name} in your browser - PDFkaro`,
  description: `${name} description.`,
  heading: name,
  sentence: `${name}. Files stay on your device.`,
});
const tools = [
  { id: 'merge-pdf', group: 'organise', runsIn: 'browser', phase: 1, accepts: [], related: [], pages: [toolPage('merge-pdf', 'Merge PDF'), toolPage('split-pdf', 'Split PDF')] },
  { id: 'unlock-pdf', group: 'protect', runsIn: 'browser', phase: 1, accepts: [], related: [], pages: [toolPage('unlock-pdf', 'Remove a password')] },
] as unknown as Tool[];

const footer: FooterLink[] = [
  { label: 'About', href: '/about', written: false },
  { label: 'Contact', href: '/contact', written: true },
];

function png(width = 1200, height = 630, extra: string[] = []): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const length = [data.length >>> 24, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255];
    return [...length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  };
  const be = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [...be(width), ...be(height), 8, 2, 0, 0, 0]),
    ...extra.flatMap((type) => chunk(type, [1, 2, 3])),
    ...chunk('IDAT', [1, 2, 3, 4]),
    ...chunk('IEND', []),
  ]);
}

const escapeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function ld(name: string, slug: string, groupName: string, hub: string) {
  const url = `${origin}/${slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebApplication', name, description: `${name} description.`, url, applicationCategory: 'UtilitiesApplication', isAccessibleForFree: true },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'PDFkaro', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: groupName, item: `${origin}/${hub}` },
          { '@type': 'ListItem', position: 3, name, item: url },
        ],
      },
    ],
  };
}

type PageParts = { path: string | null; title: string; description: string; main: string; json?: string; noindex?: boolean };

function html({ path, title, description, main, json, noindex }: PageParts): string {
  const canonical = path === null ? null : `${origin}${path}`;
  const social =
    canonical === null
      ? ''
      : `<link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="${title}">` +
        `<meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}">` +
        `<meta property="og:image" content="${origin}/social.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` +
        '<meta property="og:image:alt" content="PDFkaro. Every PDF job, done in your browser.">';
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${description}">${social}` +
    `${noindex ? '<meta name="robots" content="noindex">' : ''}${json ? `<script type="application/ld+json">${json}</script>` : ''}</head>` +
    `<body><header><a href="/">PDFkaro</a></header><main>${main}</main><footer><a href="/about">About</a></footer></body></html>`
  );
}

function toolHtml(slug: string, name: string, groupName: string, hub: string) {
  return html({
    path: `/${slug}`,
    title: `${name} in your browser - PDFkaro`,
    description: `${name} description.`,
    main: `<h1>${name}</h1><section><h2>Related tools</h2><ul role="list"></ul><p><a class="tap" href="/${hub}">All tools in ${groupName}</a></p></section>`,
    json: escapeJson(ld(name, slug, groupName, hub)),
  });
}

const sitemap = (paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${origin}${path}</loc></url>\n`).join('')}</urlset>\n`;

function goodSite(): Map<string, string | Uint8Array> {
  return new Map<string, string | Uint8Array>([
    ['index.html', html({ path: '/', title: 'PDFkaro: every PDF job', description: 'Home description.', main: '<h1>PDFkaro</h1>' })],
    ['404.html', html({ path: null, title: 'Page not found - PDFkaro', description: 'There is no page at this address.', main: '<h1>Page not found</h1>' })],
    ['about.html', html({ path: '/about', title: 'About - PDFkaro', description: 'About description.', main: '<h1>About</h1><p>This page has not been written yet.</p>', noindex: true })],
    ['contact.html', html({ path: '/contact', title: 'Contact - PDFkaro', description: 'Contact description.', main: '<h1>Contact</h1><p>Write to us.</p>' })],
    ['merge-pdf.html', toolHtml('merge-pdf', 'Merge PDF', 'Organise pages', 'organise-pages')],
    ['split-pdf.html', toolHtml('split-pdf', 'Split PDF', 'Organise pages', 'organise-pages')],
    ['unlock-pdf.html', toolHtml('unlock-pdf', 'Remove a password', 'Protect', 'protect')],
    [
      'organise-pages.html',
      html({
        path: '/organise-pages',
        title: 'Organise pages - PDFkaro',
        description: 'Organise pages description.',
        main: '<h1>Organise pages</h1><p class="lede">Organise pages sentence.</p><ul role="list"><li><a href="/merge-pdf">Merge PDF</a></li><li><a href="/split-pdf">Split PDF</a></li></ul>',
      }),
    ],
    [
      'protect.html',
      html({
        path: '/protect',
        title: 'Protect - PDFkaro',
        description: 'Protect description.',
        main: '<h1>Protect</h1><p class="lede">Protect sentence.</p><ul role="list"><li><a href="/unlock-pdf">Remove a password</a></li></ul>',
      }),
    ],
    ['sitemap.xml', sitemap(['/', '/organise-pages', '/protect', '/merge-pdf', '/split-pdf', '/unlock-pdf', '/contact'])],
    ['robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`],
    ['social.png', png()],
  ]);
}

const options = { origin, base: '/', groups, tools, footer };

/** The good site with one file replaced, run through every check. */
function problemsWith(file: string, change: (text: string) => string): string[] {
  const site = goodSite();
  site.set(file, change(site.get(file) as string));
  return checkSite(site, options);
}

describe('the search check', () => {
  it('passes a good site', () => {
    expect(checkSite(goodSite(), options)).toEqual([]);
  });

  it('reads file names as paths and decodes entities', () => {
    expect(pathOfFile('index.html')).toBe('/');
    expect(pathOfFile('merge-pdf.html')).toBe('/merge-pdf');
    expect(decode('a &amp; b &#39;c&#x27; &lt;')).toBe("a & b 'c' <");
  });

  it('takes its settings as the build does, and refuses others', () => {
    expect(settings({})).toEqual({ origin: 'http://localhost:4321', base: '/' });
    expect(settings({ SITE_ORIGIN: origin, SITE_BASE: '/pdfkaro' })).toEqual({ origin, base: '/pdfkaro' });
    expect(() => settings({ SITE_ORIGIN: 'https://example.org/x' })).toThrow();
    expect(() => settings({ SITE_BASE: 'x' })).toThrow();
  });

  describe('canonical tags', () => {
    it('fail with no canonical', () => {
      expect(problemsWith('merge-pdf.html', (page) => page.replace(/<link rel="canonical"[^>]*>/, ''))).toContain('/merge-pdf: has 0 canonical tags, not one');
    });

    it('fail with a wrong canonical', () => {
      expect(problemsWith('merge-pdf.html', (page) => page.replace('rel="canonical" href="https://example.org/merge-pdf"', 'rel="canonical" href="https://example.org/split-pdf"'))).toContain(
        '/merge-pdf: its canonical is "https://example.org/split-pdf", not "https://example.org/merge-pdf"',
      );
    });

    it('fail with two canonicals', () => {
      expect(problemsWith('merge-pdf.html', (page) => page.replace('<link rel="canonical"', '<link rel="canonical" href="x"><link rel="canonical"'))).toContain(
        '/merge-pdf: has 2 canonical tags, not one',
      );
    });

    it('fail when the 404 page has one', () => {
      expect(problemsWith('404.html', (page) => page.replace('</head>', '<link rel="canonical" href="https://example.org/404"></head>'))).toContain(
        '/404: the 404 page has a canonical tag',
      );
    });
  });

  describe('social tags', () => {
    it('fail with a missing og:url', () => {
      expect(problemsWith('merge-pdf.html', (page) => page.replace(/<meta property="og:url"[^>]*>/, ''))).toContain('/merge-pdf: has 0 og:url tags, not one');
    });

    it('fail with an og:title unlike the title', () => {
      expect(problemsWith('index.html', (page) => page.replace('og:title" content="PDFkaro: every PDF job"', 'og:title" content="Something else"'))).toContain(
        '/: its og:title is "Something else", not "PDFkaro: every PDF job"',
      );
    });
  });

  describe('the social image', () => {
    it('fails at the wrong size', () => {
      expect(checkSocialImage(png(1200, 1200))).toContain('social.png is 1200 by 1200, not 1200 by 630');
    });

    it('fails for a file that is not a PNG', () => {
      expect(checkSocialImage(new TextEncoder().encode('GIF89a not a png'))).toContain('social.png is not a PNG');
    });

    it('fails for a PNG with a tEXt chunk', () => {
      expect(checkSocialImage(png(1200, 630, ['tEXt']))).toContain('social.png carries a tEXt chunk, which is not allowed');
    });

    it('passes the chunks Chromium may write', () => {
      expect(checkSocialImage(png(1200, 630, ['sRGB', 'gAMA', 'pHYs']))).toEqual([]);
    });

    it('fails when missing or 100 KB or larger', () => {
      const site = goodSite();
      site.delete('social.png');
      expect(checkSite(site, options)).toContain('social.png is missing from the build');
      const big = new Uint8Array(100 * 1024);
      big.set(png());
      expect(checkSocialImage(big)).toContain(`social.png is ${100 * 1024} bytes, not under 100 KB`);
    });
  });

  describe('titles and descriptions', () => {
    it('fail when a title repeats', () => {
      expect(problemsWith('contact.html', (page) => page.replaceAll('Contact - PDFkaro', 'About - PDFkaro'))).toContain(
        '/contact: its title "About - PDFkaro" is also the title of /about',
      );
    });

    it('fail on a 60-character title', () => {
      const title = `${'x'.repeat(50)} - PDFkaro`;
      expect(title).toHaveLength(60);
      expect(problemsWith('contact.html', (page) => page.replaceAll('Contact - PDFkaro', title))).toContain('/contact: its title is 60 characters, not under 60');
    });

    it('fail on a 155-character description', () => {
      const description = 'x'.repeat(155);
      expect(problemsWith('contact.html', (page) => page.replaceAll('Contact description.', description))).toContain(
        '/contact: its description is 155 characters, not under 155',
      );
    });
  });

  describe('JSON-LD', () => {
    it('fails with a raw <', () => {
      expect(problemsWith('merge-pdf.html', (page) => page.replace('Merge PDF description.","url"', 'Merge PDF <description>.","url"'))).toContain(
        '/merge-pdf: its JSON-LD holds a raw <, > or &',
      );
    });

    it('fails with a missing breadcrumb step', () => {
      const data = ld('Merge PDF', 'merge-pdf', 'Organise pages', 'organise-pages');
      (data['@graph'][1] as { itemListElement: unknown[] }).itemListElement.splice(1, 1);
      const problems = problemsWith('merge-pdf.html', (page) => page.replace(/<script type="application\/ld\+json">[^<]*<\/script>/, `<script type="application/ld+json">${escapeJson(data)}</script>`));
      expect(problems.some((problem) => problem.startsWith('/merge-pdf: its JSON-LD is'))).toBe(true);
    });

    it('fails with an extra offers key', () => {
      const problems = problemsWith('merge-pdf.html', (page) => page.replace('"isAccessibleForFree":true', '"isAccessibleForFree":true,"offers":{"price":"0"}'));
      expect(problems.some((problem) => problem.startsWith('/merge-pdf: its JSON-LD is'))).toBe(true);
    });

    it('fails with a wrong name', () => {
      const problems = problemsWith('unlock-pdf.html', (page) => page.replace('"name":"Remove a password","description"', '"name":"Unlock PDF","description"'));
      expect(problems.some((problem) => problem.startsWith('/unlock-pdf: its JSON-LD is'))).toBe(true);
    });

    it('fails when a tool page has none, or a block does not parse', () => {
      expect(problemsWith('split-pdf.html', (page) => page.replace(/<script type="application\/ld\+json">[^<]*<\/script>/, ''))).toContain('/split-pdf: has 0 JSON-LD blocks, not one');
      expect(problemsWith('split-pdf.html', (page) => page.replace('{"@context"', '{"@context"}'))).toContain('/split-pdf: its JSON-LD does not parse');
    });

    it('fails on a hub page that carries a block', () => {
      expect(problemsWith('organise-pages.html', (page) => page.replace('</head>', '<script type="application/ld+json">{}</script></head>'))).toContain(
        '/organise-pages: has 1 JSON-LD blocks; only tool pages carry one',
      );
    });
  });

  describe('hub pages', () => {
    it('fail when a hub lists a wrong tool', () => {
      expect(problemsWith('organise-pages.html', (page) => page.replace('href="/split-pdf"', 'href="/unlock-pdf"'))).toContain(
        '/organise-pages: lists /merge-pdf, /unlock-pdf, not /merge-pdf, /split-pdf',
      );
    });

    it('fail when a hub file is missing', () => {
      const site = goodSite();
      site.delete('protect.html');
      expect(checkSite(site, options)).toContain('/protect: the hub page of Protect is missing');
    });

    it('fail when a group with no published tool has a hub file', () => {
      const site = goodSite();
      site.set('read-and-check.html', html({ path: '/read-and-check', title: 'Read - PDFkaro', description: 'Read.', main: '<h1>Read and check</h1>' }));
      expect(checkSite(site, options)).toContain('/read-and-check: a hub page is built for Read and check, which has no published tool');
    });

    it('fail when a tool page does not link to its hub', () => {
      expect(problemsWith('split-pdf.html', (page) => page.replace('All tools in Organise pages', 'More tools'))).toContain(
        '/split-pdf: does not link to its hub page with "All tools in Organise pages"',
      );
    });
  });

  describe('the sitemap and robots file', () => {
    it('fail when the sitemap misses a tool page', () => {
      expect(problemsWith('sitemap.xml', (xml) => xml.replace(`  <url><loc>${origin}/split-pdf</loc></url>\n`, ''))).toContain(
        `sitemap.xml does not list ${origin}/split-pdf`,
      );
    });

    it('fail when the sitemap lists a placeholder page or the 404 page', () => {
      const about = problemsWith('sitemap.xml', (xml) => xml.replace('</urlset>', `  <url><loc>${origin}/about</loc></url>\n</urlset>`));
      expect(about).toContain(`sitemap.xml lists ${origin}/about, which it should not`);
      const notFound = problemsWith('sitemap.xml', (xml) => xml.replace('</urlset>', `  <url><loc>${origin}/404</loc></url>\n</urlset>`));
      expect(notFound).toContain(`sitemap.xml lists ${origin}/404, which it should not`);
      expect(notFound).toContain(`sitemap.xml lists ${origin}/404, which is not a built page`);
    });

    it('fail when a loc has no page', () => {
      expect(problemsWith('sitemap.xml', (xml) => xml.replace('</urlset>', `  <url><loc>${origin}/no-such-page</loc></url>\n</urlset>`))).toContain(
        `sitemap.xml lists ${origin}/no-such-page, which is not a built page`,
      );
    });

    it('fail when robots.txt does not name the sitemap', () => {
      expect(problemsWith('robots.txt', (text) => text.replace(/Sitemap: .*/, 'Sitemap: https://example.com/sitemap.xml'))).toContain(
        `robots.txt does not name the sitemap at ${origin}/sitemap.xml`,
      );
    });
  });

  describe('noindex', () => {
    it('fails on a written page', () => {
      expect(problemsWith('contact.html', (page) => page.replace('</head>', '<meta name="robots" content="noindex"></head>'))).toContain(
        '/contact: carries noindex, but only a placeholder page may',
      );
    });

    it('fails on a placeholder page without it', () => {
      expect(problemsWith('about.html', (page) => page.replace('<meta name="robots" content="noindex">', ''))).toContain('/about: a placeholder page must carry noindex');
    });

    it('fails on an unwritten page that shows no placeholder sentence', () => {
      expect(problemsWith('about.html', (page) => page.replace('This page has not been written yet.', 'I made this site.'))).toContain(
        '/about: is marked not written, but shows no placeholder sentence; mark it written in src/site.ts',
      );
    });

    it('wants it on every page under a sub-path', () => {
      const problems = checkSite(goodSite(), { ...options, base: '/pdfkaro' });
      expect(problems).toContain('/merge-pdf: a page under a sub-path must carry noindex');
    });
  });
});
