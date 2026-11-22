import { describe, expect, it } from 'vitest';
import type { Group, Tool, ToolWidgetWords } from '../../src/tools/registry';
import { acceptsFor, allPages, findPage, groupsWithItems, hubLink, hubPages, pageWords, relatedItems } from '../../src/tools/queries';

const group = (id: Group['id'], name: string, slug: Group['slug']): Group => ({
  id,
  name,
  slug,
  title: `${name} - PDFkaro`,
  description: `${name} description.`,
  sentence: `${name} sentence.`,
  claimsDevice: false,
});

// A made-up registry: one tool with three URLs, one with one URL, and a group left empty.
const groups: Group[] = [
  group('smaller', 'Make smaller and fix', 'make-smaller-and-fix'),
  group('organise', 'Organise pages', 'organise-pages'),
  group('read', 'Read and check', 'read-and-check'),
];

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
  {
    id: 'compress',
    group: 'smaller',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    related: ['merge-pdf', 'split-pdf', 'rotate-pdf', 'repair-pdf'],
    pages: [
      page('compress-pdf', 'Compress PDF'),
      { ...page('compress-pdf-to-100kb', 'Compress PDF to 100 KB'), preset: { targetKb: 100 } },
      { ...page('compress-pdf-to-200kb', 'Compress PDF to 200 KB'), preset: { targetKb: 200 }, accepts: ['application/pdf', 'image/jpeg'] },
    ],
  },
  {
    id: 'merge',
    group: 'organise',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    related: ['compress-pdf', 'compress-pdf-to-200kb', 'split-pdf', 'rotate-pdf'],
    pages: [page('merge-pdf', 'Merge PDF')],
  },
] as Tool[];

describe('queries', () => {
  it('lists every page of every tool', () => {
    expect(allPages(tools).map(({ page }) => page.slug)).toEqual([
      'compress-pdf',
      'compress-pdf-to-100kb',
      'compress-pdf-to-200kb',
      'merge-pdf',
    ]);
  });

  it('gives a tool with three URLs three list items, each with its own name and link', () => {
    const [smaller] = groupsWithItems(groups, tools, '/');
    expect(smaller?.items).toEqual([
      { name: 'Compress PDF', href: '/compress-pdf', summary: 'Compress PDF summary.' },
      { name: 'Compress PDF to 100 KB', href: '/compress-pdf-to-100kb', summary: 'Compress PDF to 100 KB summary.' },
      { name: 'Compress PDF to 200 KB', href: '/compress-pdf-to-200kb', summary: 'Compress PDF to 200 KB summary.' },
    ]);
  });

  it('keeps groups in order and leaves out a group with no tools', () => {
    expect(groupsWithItems(groups, tools, '/').map((group) => group.name)).toEqual([
      'Make smaller and fix',
      'Organise pages',
    ]);
  });

  it('finds a page by slug with its preset and its tool', () => {
    const found = findPage(tools, 'compress-pdf-to-100kb');
    expect(found?.tool.id).toBe('compress');
    expect(found?.page.preset).toEqual({ targetKb: 100 });
    expect(findPage(tools, 'no-such-tool')).toBeUndefined();
  });

  it('uses a page\'s own accepted types when it has them, else the tool\'s', () => {
    expect(acceptsFor(findPage(tools, 'compress-pdf')!)).toEqual(['application/pdf']);
    expect(acceptsFor(findPage(tools, 'compress-pdf-to-200kb')!)).toEqual(['application/pdf', 'image/jpeg']);
  });

  it('links only to related tools that are published, in the order named', () => {
    const merge = tools[1]!;
    expect(relatedItems(tools, merge, '/', merge.pages[0]!).map((item) => item.href)).toEqual(['/compress-pdf', '/compress-pdf-to-200kb']);
  });

  it('gives no related links when none is published', () => {
    const alone = [tools[1]!];
    expect(relatedItems(alone, alone[0]!, '/', alone[0]!.pages[0]!)).toEqual([]);
  });

  it('leaves out the page being built, so a tool of several pages can link its pages to each other', () => {
    const compress = { ...tools[0]!, related: ['compress-pdf', 'compress-pdf-to-100kb', 'merge-pdf', 'split-pdf'] } as Tool;
    const [first, second] = compress.pages;
    expect(relatedItems(tools, compress, '/', first).map((item) => item.href)).toEqual(['/compress-pdf-to-100kb', '/merge-pdf']);
    expect(relatedItems(tools, compress, '/', second).map((item) => item.href)).toEqual(['/compress-pdf', '/merge-pdf']);
  });
});

describe('page words', () => {
  const widget: ToolWidgetWords = {
    pickerLabel: 'Choose a PDF file',
    addLabel: 'Choose another file',
    dropHint: 'Drop.',
    acceptsName: 'a PDF',
    actionLabel: 'Convert and download',
    writingLabel: 'Writing the zip',
    doneHeading: 'Ready',
    failedHeading: 'Did not finish.',
    tooFewFiles: 'Choose a file.',
    outputSuffix: '',
    minFiles: 1,
    multiple: false,
    resultPages: 'none',
    resultNotes: ['Shared note.'],
    items: 'files',
    itemControls: false,
    outputs: 'several',
    partSuffix: 'page',
  };
  const tool = { ...tools[0]!, widget } as Tool;

  it("gives a page's own button, notes and extension in place of the tool's", () => {
    const page = { ...tool.pages[0]!, words: { actionLabel: 'Convert to JPG and download', resultNotes: ['Own note.'], outputExtension: 'jpg' as const } };
    expect(pageWords(tool, page)).toEqual({ ...widget, actionLabel: 'Convert to JPG and download', resultNotes: ['Own note.'], outputExtension: 'jpg' });
  });

  it("gives the tool's words to a page with none, and nothing for a tool with no widget", () => {
    expect(pageWords(tool, tool.pages[0]!)).toEqual(widget);
    expect(pageWords(tools[1]!, tools[1]!.pages[0]!)).toBeUndefined();
  });

  it('lets a page change no other word, whatever it carries', () => {
    const page = { ...tool.pages[0]!, words: { actionLabel: 'Own button', partSuffix: '../x', minFiles: 0, outputs: 'one' } as never };
    expect(pageWords(tool, page)).toEqual({ ...widget, actionLabel: 'Own button' });
  });
});

describe('hubPages', () => {
  it('gives the same groups as groupsWithItems, in the same order, with the same items', () => {
    const hubs = hubPages(groups, tools, '/');
    const shown = groupsWithItems(groups, tools, '/');
    expect(hubs.map((hub) => hub.id)).toEqual(shown.map((each) => each.id));
    expect(hubs.map((hub) => hub.items)).toEqual(shown.map((each) => each.items));
  });

  it('leaves out a group with no published page', () => {
    expect(hubPages(groups, tools, '/').map((hub) => hub.slug)).toEqual(['make-smaller-and-fix', 'organise-pages']);
  });

  it("carries each group's words and its address under the base", () => {
    const [smaller] = hubPages(groups, tools, '/pdfkaro');
    expect(smaller).toMatchObject({
      name: 'Make smaller and fix',
      slug: 'make-smaller-and-fix',
      href: '/pdfkaro/make-smaller-and-fix',
      title: 'Make smaller and fix - PDFkaro',
      description: 'Make smaller and fix description.',
      sentence: 'Make smaller and fix sentence.',
    });
    expect(smaller?.items[0]?.href).toBe('/pdfkaro/compress-pdf');
    expect(hubPages(groups, tools, '/')[0]?.href).toBe('/make-smaller-and-fix');
  });

  it('adds no address to the groups the home page lists', () => {
    for (const each of groupsWithItems(groups, tools, '/')) expect(Object.keys(each).sort()).toEqual(['id', 'items', 'name']);
  });
});

describe('hubLink', () => {
  it("names the tool's group and links to its hub page under the base", () => {
    expect(hubLink(groups, tools[1]!, '/')).toEqual({ name: 'Organise pages', href: '/organise-pages' });
    expect(hubLink(groups, tools[1]!, '/pdfkaro')).toEqual({ name: 'Organise pages', href: '/pdfkaro/organise-pages' });
  });

  it('throws for a tool whose group is not in the registry', () => {
    expect(() => hubLink(groups.slice(0, 1), tools[1]!, '/')).toThrow(/merge/);
  });
});
