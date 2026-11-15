import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// catalogue.ts is a type, so there is no value to import. Both files are read as text
// and compared, so the type cannot drift from the catalogue in SPEC.md.

/** Every tool URL in the "Tool catalogue" tables of SPEC.md. */
function specSlugs(): string[] {
  const spec = readFileSync('SPEC.md', 'utf8');
  const start = spec.indexOf('## Tool catalogue');
  const end = spec.indexOf('### Scope notes for specific tools');
  const slugs: string[] = [];
  for (const line of spec.slice(start, end).split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const urls = cells[2];
    if (!urls?.startsWith('/')) continue;
    // "/compress-pdf-to-100kb, -200kb, -500kb" lists one full URL, then endings for the same stem.
    const parts = urls.split(',').map((part) => part.trim());
    const first = (parts[0] ?? '').slice(1);
    slugs.push(first);
    const stem = first.slice(0, first.lastIndexOf('-'));
    for (const part of parts.slice(1)) {
      slugs.push(part.startsWith('/') ? part.slice(1) : stem + part);
    }
  }
  return slugs;
}

/** Every slug named in the CatalogueSlug type. */
function typeSlugs(): string[] {
  const source = readFileSync('src/tools/catalogue.ts', 'utf8');
  const body = source.slice(source.indexOf('export type CatalogueSlug'));
  return [...body.matchAll(/\| '([^']+)'/g)].map((match) => match[1] ?? '');
}

// The owner's changes since the last export of SPEC.md (13 Nov 2026, in CLAUDE.md):
// Image to PDF is one tool with three pages, so /image-to-pdf is added and /image2pdf dropped.
// Remove these once the next export carries both.
const ownerAdded = ['image-to-pdf'];
const ownerDropped = ['image2pdf'];

describe('catalogue', () => {
  it('reads the catalogue out of SPEC.md', () => {
    const slugs = specSlugs();
    expect(slugs).toContain('merge-pdf');
    expect(slugs).toContain('compress-pdf-to-2mb');
    expect(slugs).toContain('tiff-to-pdf');
    expect(slugs).toContain('pdf-viewer');
  });

  it('names every URL in the SPEC.md catalogue, and no others', () => {
    const wanted = [...specSlugs().filter((slug) => !ownerDropped.includes(slug)), ...ownerAdded].sort();
    expect(typeSlugs().sort()).toEqual(wanted);
  });

  it('knows the owner changes are still owner changes, so it fails once the export carries them', () => {
    for (const slug of ownerAdded) expect(specSlugs()).not.toContain(slug);
    for (const slug of ownerDropped) expect(specSlugs()).toContain(slug);
    for (const slug of ownerDropped) expect(typeSlugs()).not.toContain(slug);
  });

  it('names no slug twice', () => {
    const slugs = typeSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('holds a type only, with no value at run time', () => {
    const source = readFileSync('src/tools/catalogue.ts', 'utf8');
    expect(source).not.toMatch(/export (const|let|var|function|class|default|enum)/);
  });
});
