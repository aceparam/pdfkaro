import { describe, expect, it } from 'vitest';
import { groups, tools } from '../../src/tools/registry';
import { allPages } from '../../src/tools/queries';

const sitePageNames = ['about', 'privacy', 'changes', 'known-problems', 'contact', '404', 'index'];
const pages = allPages(tools);

describe('registry', () => {
  it('declares each tool once', () => {
    const ids = tools.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every page its own slug', () => {
    const slugs = pages.map(({ page }) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses lowercase slugs with hyphens that are not site page names', () => {
    for (const { page } of pages) {
      expect(page.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(sitePageNames).not.toContain(page.slug);
    }
  });

  it('places every tool in one of the seven groups', () => {
    expect(groups).toHaveLength(7);
    const groupIds = groups.map((group) => group.id);
    for (const tool of tools) expect(groupIds).toContain(tool.group);
  });

  it('names four to six related tools, none twice and never itself', () => {
    for (const tool of tools) {
      expect(tool.related.length).toBeGreaterThanOrEqual(4);
      expect(tool.related.length).toBeLessThanOrEqual(6);
      expect(new Set(tool.related).size).toBe(tool.related.length);
      for (const page of tool.pages) expect(tool.related).not.toContain(page.slug);
    }
  });

  it('keeps titles under 60 characters, ending with the brand, and all different', () => {
    const titles = pages.map(({ page }) => page.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) {
      expect(title.length).toBeLessThan(60);
      expect(title.endsWith(' - PDFkaro')).toBe(true);
    }
  });

  it('keeps descriptions under 155 characters and all different', () => {
    const descriptions = pages.map(({ page }) => page.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const description of descriptions) expect(description.length).toBeLessThan(155);
  });

  it('says where the file goes, truthfully for the kind of tool', () => {
    for (const { tool, page } of pages) {
      const words = `${page.sentence} ${page.description}`.toLowerCase();
      if (tool.runsIn === 'browser') {
        expect(page.sentence.toLowerCase()).toContain('stay on your device');
      } else {
        expect(page.sentence).toContain('uploaded');
        expect(page.sentence).toContain('deleted within an hour');
        expect(words).not.toContain('stay on your device');
        expect(words).not.toContain('never leaves');
      }
    }
  });

  it('has no exclamation marks in its wording', () => {
    for (const { page } of pages) {
      expect(Object.values(page).join(' ')).not.toContain('!');
    }
  });

  it('gives Merge PDF its widget words: at least two files, several at once, named after the first file', () => {
    const words = tools.find((tool) => tool.id === 'merge-pdf')?.widget;
    expect(words).toBeDefined();
    expect(words).toMatchObject({ actionLabel: 'Merge and download', outputSuffix: 'merged', minFiles: 2, multiple: true, resultPages: 'sum' });
    // The owner's decisions of 11 Nov 2026 are said with the result.
    expect(words!.resultNotes.join(' ')).toMatch(/first file only/);
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
  });

  it('gives Split PDF its words: one file, its pages, cut toggles and several files as a zip', () => {
    const words = tools.find((tool) => tool.id === 'split-pdf')?.widget;
    expect(words).toMatchObject({
      actionLabel: 'Split and download',
      outputSuffix: 'split',
      minFiles: 1,
      multiple: false,
      items: 'pages',
      itemControls: false,
      itemToggle: { kind: 'cut-after', label: 'Cut after' },
      outputs: 'several',
      partSuffix: 'part',
      resultPages: 'input',
    });
    // The owner's decisions of 12 Nov 2026 are said with the result.
    expect(words!.resultNotes.join(' ')).toMatch(/bookmarks that point to its own pages/);
    expect(words!.resultNotes.join(' ')).toMatch(/first file only/);
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
  });

  it('gives every widget a consistent shape: page tools take one file, several outputs need a part word', () => {
    for (const tool of tools) {
      const words = tool.widget;
      if (!words) continue;
      if (words.items === 'pages') expect(words).toMatchObject({ multiple: false, minFiles: 1 });
      if (words.outputs === 'several') expect(words.partSuffix).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      // Page items have no moves yet: Move up, Move down and Remove act on files.
      if (words.items === 'pages') expect(words.itemControls).toBe(false);
      // A per-page toggle needs a list of pages.
      if (words.itemToggle) expect(words.items).toBe('pages');
    }
    expect(tools.find((tool) => tool.id === 'merge-pdf')?.widget).toMatchObject({ items: 'files', itemControls: true, outputs: 'one' });
  });

  it('keeps widget words plain: no exclamation marks, and nothing empty', () => {
    for (const tool of tools) {
      if (!tool.widget) continue;
      const text = Object.values(tool.widget).flat().filter((value) => typeof value === 'string') as string[];
      for (const value of text) {
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value).not.toContain('!');
      }
    }
  });
});

describe('catalogue order', () => {
  it('declares tools in the order SPEC.md lists them, so they are built in that order', async () => {
    const { readFileSync } = await import('node:fs');
    const spec = readFileSync('SPEC.md', 'utf8');
    const catalogue = spec.slice(spec.indexOf('## Tool catalogue'), spec.indexOf('## Architecture'));
    const order = [...catalogue.matchAll(/\| (\/[a-z0-9-]+) \|/g)].map((match) => match[1]!.slice(1));
    const positions = tools.map((tool) => order.indexOf(tool.pages[0]!.slug));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('Extract pages', () => {
  it('lists pages with a take toggle and gives one file', () => {
    const words = tools.find((tool) => tool.id === 'extract-pdf-pages')?.widget;
    expect(words).toMatchObject({ items: 'pages', itemControls: false, itemToggle: { kind: 'take', label: 'Take' }, outputs: 'one', outputSuffix: 'extracted', minFiles: 1, multiple: false });
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
    expect(words!.resultNotes.join(' ')).toMatch(/accessibility tags/);
    expect(words!.resultNotes.join(' ')).toMatch(/form fields, with what was typed in them/);
  });
});

describe('Delete pages', () => {
  it('lists pages with a drop toggle and gives one file, after Extract', () => {
    const words = tools.find((tool) => tool.id === 'delete-pdf-pages')?.widget;
    expect(words).toMatchObject({ items: 'pages', itemControls: false, itemToggle: { kind: 'drop', label: 'Delete' }, outputs: 'one', outputSuffix: 'pages-deleted', minFiles: 1, multiple: false });
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
    expect(words!.resultNotes.join(' ')).toMatch(/accessibility tags, the names of links inside it and reading threads/);
    expect(words!.resultNotes.join(' ')).toMatch(/form fields, with what was typed in them/);
    const ids = tools.map((tool) => tool.id);
    expect(ids.indexOf('delete-pdf-pages')).toBe(ids.indexOf('extract-pdf-pages') + 1);
  });
});
