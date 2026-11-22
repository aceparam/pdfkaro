import { describe, expect, it } from 'vitest';
import { absoluteUrl, defaultOrigin, footerLinks, footerPage, isSiteBase, isSiteOrigin, tagline, withBase } from '../../src/site';
import { tools as registryTools, type Group, type Tool } from '../../src/tools/registry';
import { groupsWithItems, relatedItems, toListItem } from '../../src/tools/queries';

describe('withBase', () => {
  it('leaves paths alone when the site is at the root', () => {
    expect(withBase('/', '/')).toBe('/');
    expect(withBase('/', '/merge-pdf')).toBe('/merge-pdf');
    expect(withBase('', '/about')).toBe('/about');
  });

  it('puts a sub-path in front of every path', () => {
    expect(withBase('/pdfkaro', '/merge-pdf')).toBe('/pdfkaro/merge-pdf');
    expect(withBase('/pdfkaro', '/about')).toBe('/pdfkaro/about');
  });

  it('links to the home page with a trailing slash under a sub-path', () => {
    expect(withBase('/pdfkaro', '/')).toBe('/pdfkaro/');
  });

  it('leaves alone anything that is not a path from the site root', () => {
    for (const other of ['https://example.org/x', '//example.org/x', 'mailto:someone@example.org', '#top', 'about', '']) {
      expect(withBase('/pdfkaro', other)).toBe(other);
      expect(withBase('/', other)).toBe(other);
    }
  });

  it('gives the same answer whether or not the base ends with a slash', () => {
    expect(withBase('/pdfkaro/', '/merge-pdf')).toBe('/pdfkaro/merge-pdf');
    expect(withBase('/pdfkaro/', '/')).toBe('/pdfkaro/');
  });
});

describe('list links under a sub-path', () => {
  const page = (slug: string, name: string) => ({
    slug,
    name,
    summary: `${name} summary.`,
    title: `${name} - PDFkaro`,
    description: `${name} description.`,
    heading: name,
    sentence: `${name}. Files stay on your device.`,
  });
  const tools = [
    { id: 'merge', group: 'organise', runsIn: 'browser', phase: 1, accepts: [], related: ['split-pdf'], pages: [page('merge-pdf', 'Merge PDF')] },
    { id: 'split', group: 'organise', runsIn: 'browser', phase: 1, accepts: [], related: ['merge-pdf'], pages: [page('split-pdf', 'Split PDF')] },
  ] as Tool[];
  const groups: Group[] = [
    {
      id: 'organise',
      name: 'Organise pages',
      slug: 'organise-pages',
      title: 'Organise PDF pages - PDFkaro',
      description: 'Organise description.',
      sentence: 'Organise sentence.',
      claimsDevice: false,
    },
  ];

  it('are at the root when the base is "/"', () => {
    expect(toListItem(tools[0]!.pages[0]!, '/').href).toBe('/merge-pdf');
    expect(relatedItems(tools, tools[0]!, '/', tools[0]!.pages[0]!).map((item) => item.href)).toEqual(['/split-pdf']);
  });

  it('carry the sub-path in every list', () => {
    expect(toListItem(tools[0]!.pages[0]!, '/pdfkaro').href).toBe('/pdfkaro/merge-pdf');
    expect(groupsWithItems(groups, tools, '/pdfkaro')[0]?.items.map((item) => item.href)).toEqual([
      '/pdfkaro/merge-pdf',
      '/pdfkaro/split-pdf',
    ]);
    expect(relatedItems(tools, tools[0]!, '/pdfkaro', tools[0]!.pages[0]!).map((item) => item.href)).toEqual(['/pdfkaro/split-pdf']);
  });
});

describe('absoluteUrl', () => {
  it('joins the origin, the base and the path at the root', () => {
    expect(absoluteUrl('https://example.org', '/', '/')).toBe('https://example.org/');
    expect(absoluteUrl('https://example.org', '/', '/merge-pdf')).toBe('https://example.org/merge-pdf');
  });

  it('puts the base between the origin and the path under a sub-path', () => {
    expect(absoluteUrl('https://example.org', '/pdfkaro', '/')).toBe('https://example.org/pdfkaro/');
    expect(absoluteUrl('https://example.org', '/pdfkaro', '/merge-pdf')).toBe('https://example.org/pdfkaro/merge-pdf');
  });
});

describe('the origin setting', () => {
  it('is the local preview address by default, which it accepts', () => {
    expect(defaultOrigin).toBe('http://localhost:4321');
    expect(isSiteOrigin(defaultOrigin)).toBe(true);
  });

  it('takes a plain lower-case https origin, or localhost with a port', () => {
    for (const value of ['https://example.org', 'https://www.example.org', 'https://my-site.github.io', 'http://localhost:8080']) {
      expect(isSiteOrigin(value), value).toBe(true);
    }
  });

  it('refuses a path, a query, a fragment, a trailing slash, capitals, a port, http elsewhere and other schemes', () => {
    for (const value of [
      'https://example.org/x',
      'https://example.org/pdfkaro/',
      'https://example.org?x=1',
      'https://example.org#top',
      'https://example.org/',
      'https://Example.org',
      'HTTPS://example.org',
      'https://example.org:8443',
      'http://example.org',
      'http://localhost',
      'http://localhost:4321/',
      'ftp://example.org',
      'javascript:alert(1)',
      '//example.org',
      'example.org',
      'https://localhost',
      'https://example.org"><script>',
      'https://example.org\n',
      'https://exa mple.org',
      'https://-example.org',
      '',
    ]) {
      expect(isSiteOrigin(value), value).toBe(false);
    }
  });
});

describe('the base setting', () => {
  it('takes "/" or a plain path', () => {
    for (const value of ['/', '/pdfkaro', '/a/b', '/base-check']) expect(isSiteBase(value), value).toBe(true);
  });

  it('refuses anything else', () => {
    for (const value of ['', 'pdfkaro', '/pdfkaro/', '//pdfkaro', '/pdf karo', '/pdfkaro?x', '/"x']) expect(isSiteBase(value), value).toBe(false);
  });
});

describe('footer pages', () => {
  it('are found by path, and a path with no entry throws', () => {
    expect(footerPage('/about').label).toBe('About');
    expect(() => footerPage('/nope')).toThrow('/nope');
  });

  it('each say whether the owner has written them; none is written yet', () => {
    expect(footerLinks.map((link) => [link.href, link.written])).toEqual([
      ['/about', false],
      ['/privacy', false],
      ['/changes', false],
      ['/known-problems', false],
      ['/contact', false],
    ]);
  });
});

/**
 * The tagline is the social image's text and its alt text. While it says the job is done in the
 * browser or on the device, every published tool must run in the browser.
 */
function taglineProblem(words: string, tools: Pick<Tool, 'id' | 'runsIn'>[]): string | null {
  if (!/browser|device/i.test(words)) return null;
  const server = tools.filter((tool) => tool.runsIn !== 'browser').map((tool) => tool.id);
  if (server.length === 0) return null;
  return (
    `The tagline "${words}" is no longer true: ${server.join(', ')} does not run in the browser. ` +
    'Stop this change and ask the owner for a new tagline (it is the owner\'s text, set in SPEC.md "Names"). ' +
    'Then make public/social.png again with scripts/social-image.mjs, and look at it.'
  );
}

describe('the tagline', () => {
  it('stays true: it says "browser", and every published tool runs in the browser', () => {
    // Thrown with its own words, so the failure says what to do.
    const problem = taglineProblem(tagline, registryTools);
    if (problem) throw new Error(problem);
  });

  it('trips as soon as a published tool runs on the server, and says to ask the owner for a new tagline', () => {
    const withServer = [...registryTools, { id: 'word-to-pdf', runsIn: 'server' as const }];
    const problem = taglineProblem(tagline, withServer);
    expect(problem).toContain('word-to-pdf');
    expect(problem).toContain('ask the owner for a new tagline');
    expect(problem).toContain('scripts/social-image.mjs');
    expect(() => {
      if (problem) throw new Error(problem);
    }).toThrow(/ask the owner/);
  });

  it('does not trip for a tagline that makes no claim about where files go', () => {
    expect(taglineProblem('Every PDF job.', [{ id: 'word-to-pdf', runsIn: 'server' }])).toBeNull();
  });
});
