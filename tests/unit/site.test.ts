import { describe, expect, it } from 'vitest';
import { withBase } from '../../src/site';
import type { Tool } from '../../src/tools/registry';
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
  const groups = [{ id: 'organise' as const, name: 'Organise pages' }];

  it('are at the root by default', () => {
    expect(toListItem(tools[0]!.pages[0]!).href).toBe('/merge-pdf');
    expect(relatedItems(tools, tools[0]!).map((item) => item.href)).toEqual(['/split-pdf']);
  });

  it('carry the sub-path in every list', () => {
    expect(toListItem(tools[0]!.pages[0]!, '/pdfkaro').href).toBe('/pdfkaro/merge-pdf');
    expect(groupsWithItems(groups, tools, '/pdfkaro')[0]?.items.map((item) => item.href)).toEqual([
      '/pdfkaro/merge-pdf',
      '/pdfkaro/split-pdf',
    ]);
    expect(relatedItems(tools, tools[0]!, '/pdfkaro').map((item) => item.href)).toEqual(['/pdfkaro/split-pdf']);
  });
});
