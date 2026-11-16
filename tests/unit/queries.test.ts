import { describe, expect, it } from 'vitest';
import type { Group, Tool, ToolWidgetWords } from '../../src/tools/registry';
import { acceptsFor, allPages, findPage, groupsWithItems, pageWords, relatedItems } from '../../src/tools/queries';

// A made-up registry: one tool with three URLs, one with one URL, and a group left empty.
const groups: Group[] = [
  { id: 'smaller', name: 'Make smaller and fix' },
  { id: 'organise', name: 'Organise pages' },
  { id: 'read', name: 'Read and check' },
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
    expect(relatedItems(tools, merge, '/').map((item) => item.href)).toEqual(['/compress-pdf', '/compress-pdf-to-200kb']);
  });

  it('gives no related links when none is published', () => {
    const alone = [tools[1]!];
    expect(relatedItems(alone, alone[0]!, '/')).toEqual([]);
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
