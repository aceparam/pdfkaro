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
});
