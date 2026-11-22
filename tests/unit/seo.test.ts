import { describe, expect, it } from 'vitest';
import { footerLinks, siteName, type FooterLink } from '../../src/site';
import { groups, tools, type Tool } from '../../src/tools/registry';
import { allPages, findPage, hubPages } from '../../src/tools/queries';
import { jsonForScript, robotsTxt, sitemapPaths, sitemapXml, toolStructuredData } from '../../src/tools/seo';

const origin = 'https://example.org';

function dataFor(slug: string, base = '/') {
  const found = findPage(tools, slug)!;
  const group = groups.find((each) => each.id === found.tool.group)!;
  return toolStructuredData({ page: found.page, group, origin, base, siteName });
}

describe('toolStructuredData', () => {
  it('gives Merge PDF a WebApplication and a breadcrumb through Organise pages', () => {
    const merge = findPage(tools, 'merge-pdf')!.page;
    expect(dataFor('merge-pdf')).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'Merge PDF',
          description: merge.description,
          url: 'https://example.org/merge-pdf',
          applicationCategory: 'UtilitiesApplication',
          isAccessibleForFree: true,
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'PDFkaro', item: 'https://example.org/' },
            { '@type': 'ListItem', position: 2, name: 'Organise pages', item: 'https://example.org/organise-pages' },
            { '@type': 'ListItem', position: 3, name: 'Merge PDF', item: 'https://example.org/merge-pdf' },
          ],
        },
      ],
    });
  });

  it('names /unlock-pdf "Remove a password", under Protect, with addresses under a sub-path', () => {
    const unlock = findPage(tools, 'unlock-pdf')!.page;
    expect(dataFor('unlock-pdf', '/pdfkaro')).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'Remove a password',
          description: unlock.description,
          url: 'https://example.org/pdfkaro/unlock-pdf',
          applicationCategory: 'UtilitiesApplication',
          isAccessibleForFree: true,
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'PDFkaro', item: 'https://example.org/pdfkaro/' },
            { '@type': 'ListItem', position: 2, name: 'Protect', item: 'https://example.org/pdfkaro/protect' },
            { '@type': 'ListItem', position: 3, name: 'Remove a password', item: 'https://example.org/pdfkaro/unlock-pdf' },
          ],
        },
      ],
    });
  });

  it('holds no rating, review, offer or price on any tool page', () => {
    for (const { page } of allPages(tools)) {
      const text = JSON.stringify(dataFor(page.slug));
      for (const key of ['offers', 'aggregateRating', 'review', 'price', 'ratingValue']) expect(text, page.slug).not.toContain(`"${key}"`);
    }
  });
});

describe('jsonForScript', () => {
  const hostile = '</script><!--&>';
  const merge = tools.find((tool) => tool.id === 'merge-pdf')!;
  const entry: Tool = { ...merge, id: 'test-hostile', pages: [{ ...merge.pages[0]!, name: hostile, description: `Text ${hostile} here.` }] };
  const group = groups.find((each) => each.id === 'organise')!;
  const value = toolStructuredData({ page: entry.pages[0]!, group, origin, base: '/', siteName });
  const text = jsonForScript(value);

  it('leaves no raw <, > or & in the text', () => {
    expect(text).not.toMatch(/[<>&]/);
  });

  it('writes each as its JSON escape, never as an HTML entity', () => {
    expect(text).toContain('\\u003c/script\\u003e\\u003c!--\\u0026\\u003e');
    expect(text).not.toContain('&lt;');
    expect(text).not.toContain('&amp;');
    expect(text).not.toContain('&gt;');
  });

  it('parses back to the same value', () => {
    expect(JSON.parse(text)).toEqual(value);
    expect(JSON.parse(text)['@graph'][0].name).toBe(hostile);
  });

  it('is exactly JSON.stringify with the three replacements', () => {
    expect(jsonForScript({ a: '<b>&' })).toBe('{"a":"\\u003cb\\u003e\\u0026"}');
  });
});

describe('sitemapPaths', () => {
  const hubs = hubPages(groups, tools, '/');
  const paths = sitemapPaths(hubs, tools, footerLinks);

  it('lists the home page, the six hub pages and every tool page', () => {
    expect(paths[0]).toBe('/');
    expect(paths.slice(1, 7)).toEqual(['/organise-pages', '/make-smaller-and-fix', '/convert-to-pdf', '/convert-from-pdf', '/edit-and-sign', '/protect']);
    for (const { page } of allPages(tools)) expect(paths).toContain(`/${page.slug}`);
    expect(paths).toHaveLength(1 + 6 + allPages(tools).length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('leaves out Read and check, the 404 page and every footer page not yet written', () => {
    expect(paths).not.toContain('/read-and-check');
    expect(paths).not.toContain('/404');
    for (const link of footerLinks.filter((each) => !each.written)) expect(paths).not.toContain(link.href);
  });

  it('lists a footer page once it is written', () => {
    const written: FooterLink[] = footerLinks.map((link) => (link.href === '/about' ? { ...link, written: true } : link));
    const withAbout = sitemapPaths(hubs, tools, written);
    expect(withAbout.at(-1)).toBe('/about');
    expect(withAbout).not.toContain('/privacy');
  });
});

describe('sitemapXml', () => {
  it('is a urlset of loc entries in the sitemaps namespace', () => {
    expect(sitemapXml(['https://example.org/', 'https://example.org/merge-pdf'])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <url><loc>https://example.org/</loc></url>\n' +
        '  <url><loc>https://example.org/merge-pdf</loc></url>\n' +
        '</urlset>\n',
    );
  });

  it('escapes an & and other XML characters in an address', () => {
    const xml = sitemapXml(["https://example.org/a&b<c>'\""]);
    expect(xml).toContain('<loc>https://example.org/a&amp;b&lt;c&gt;&apos;&quot;</loc>');
  });
});

describe('robotsTxt', () => {
  it('allows every crawler and names the sitemap at the root', () => {
    expect(robotsTxt(origin, '/')).toBe('User-agent: *\nAllow: /\n\nSitemap: https://example.org/sitemap.xml\n');
  });

  it('names the sitemap under a sub-path', () => {
    expect(robotsTxt(origin, '/pdfkaro')).toBe('User-agent: *\nAllow: /\n\nSitemap: https://example.org/pdfkaro/sitemap.xml\n');
  });
});
