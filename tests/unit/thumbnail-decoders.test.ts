// The JPEG 2000 decoder comes from the fixed helper data. PDF.js keeps a decoder
// once loaded for the rest of the process, so this file draws without the
// decoder first, then with it, in a fresh copy of PDF.js.

import { describe, expect, it } from 'vitest';
import { renderPage } from '../../src/engines/thumbnail';
import type { EngineTools } from '../../src/engines/types';
import { pdfjsData } from '../../src/workers/pdfjs-data';
import { box, fixture, look, tools } from './thumbnail-helpers';

describe('the JPEG 2000 decoder', () => {
  it('is taken from the fixed helper data, and draws the image', async () => {
    const noDecoder: EngineTools = { ...tools, pdfjsData: async () => ({ font: pdfjsData.font, decoder: () => undefined }) };
    const without = await look(await renderPage(fixture('images.pdf'), 1, box, undefined, noDecoder));

    const asked: string[] = [];
    const watching: EngineTools = {
      ...tools,
      pdfjsData: async () => ({ font: pdfjsData.font, decoder: (name: string) => (asked.push(name), pdfjsData.decoder(name)) }),
    };
    const withDecoder = await look(await renderPage(fixture('images.pdf'), 1, box, undefined, watching));
    expect(asked).toEqual(['openjpeg.wasm']);
    expect(withDecoder.ink).toBeGreaterThan(without.ink);
  }, 30000);
});
