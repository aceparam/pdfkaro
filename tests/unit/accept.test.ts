import { describe, expect, it } from 'vitest';
import { looksAccepted } from '../../src/widget/accept';

const text = (value: string) => new TextEncoder().encode(value);

describe('looksAccepted', () => {
  it('takes a PDF by its first bytes', () => {
    expect(looksAccepted(text('%PDF-1.7\n...'), ['application/pdf'])).toBe(true);
  });

  it('takes a PDF with junk before the header, as readers do', () => {
    expect(looksAccepted(text(`${'x'.repeat(500)}%PDF-1.4`), ['application/pdf'])).toBe(true);
  });

  it('turns away a PDF header that comes too late, and a text file named .pdf', () => {
    expect(looksAccepted(text(`${'x'.repeat(1100)}%PDF-1.4`), ['application/pdf'])).toBe(false);
    expect(looksAccepted(text('This is a text file that someone renamed.'), ['application/pdf'])).toBe(false);
    expect(looksAccepted(new Uint8Array(), ['application/pdf'])).toBe(false);
  });

  it('knows JPG and PNG, so an image tool is not turned away by the PDF rule', () => {
    expect(looksAccepted(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), ['image/jpeg'])).toBe(true);
    expect(looksAccepted(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ['image/png'])).toBe(true);
    expect(looksAccepted(text('%PDF-1.7'), ['image/jpeg', 'image/png'])).toBe(false);
  });

  it('leaves a type it has no check for to the engine', () => {
    expect(looksAccepted(text('anything'), ['image/heic'])).toBe(true);
  });
});

describe('which files a tool takes', async () => {
  const { chooseFiles } = await import('../../src/widget/accept');

  it('takes every file when the tool takes several', () => {
    expect(chooseFiles(['a', 'b'], ['f1'], true)).toEqual({ take: ['a', 'b'], leftOut: [], replace: [] });
  });

  it('takes only the first of a two-file drop when the tool takes one, and leaves the other out', () => {
    expect(chooseFiles(['a', 'b'], [], false)).toEqual({ take: ['a'], leftOut: ['b'], replace: [] });
  });

  it('replaces the listed file when one is pasted in its place', () => {
    expect(chooseFiles(['c'], ['f1'], false)).toEqual({ take: ['c'], leftOut: [], replace: ['f1'] });
  });

  it('keeps the listed file when nothing new was accepted', () => {
    expect(chooseFiles([], ['f1'], false)).toEqual({ take: [], leftOut: [], replace: [] });
  });
});
