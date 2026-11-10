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

// Left out of the type until the owner answers the question in CLAUDE.md.
const waitingForOwner = ['image2pdf'];

describe('catalogue', () => {
  it('reads the catalogue out of SPEC.md', () => {
    const slugs = specSlugs();
    expect(slugs).toContain('merge-pdf');
    expect(slugs).toContain('compress-pdf-to-2mb');
    expect(slugs).toContain('tiff-to-pdf');
    expect(slugs).toContain('pdf-viewer');
  });

  it('names every URL in the SPEC.md catalogue, and no others', () => {
    const wanted = specSlugs().filter((slug) => !waitingForOwner.includes(slug)).sort();
    expect(typeSlugs().sort()).toEqual(wanted);
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
