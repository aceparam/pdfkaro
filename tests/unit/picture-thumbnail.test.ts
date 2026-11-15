// Thumbnails of pictures (src/engines/picture-thumbnail.ts), drawn in Node with
// @napi-rs/canvas in place of the worker's createImageBitmap and OffscreenCanvas.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { openPicture, thumbnailSize } from '../../src/engines/picture-thumbnail';
import type { EngineTools } from '../../src/engines/types';
import { box, canvasMaker, look, pictureDecoder, tools } from './thumbnail-helpers';

const picture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/pictures', name)));

beforeEach(() => {
  pictureDecoder.calls = 0;
});

describe('the size of a picture thumbnail', () => {
  it('fits the picture as shown inside the box, never larger than the picture', () => {
    expect(thumbnailSize({ width: 1500, height: 2000 }, box)).toEqual({ width: 102, height: 136 });
    expect(thumbnailSize({ width: 1280, height: 720 }, box)).toEqual({ width: 104, height: 59 });
    expect(thumbnailSize({ width: 40, height: 30 }, box)).toEqual({ width: 40, height: 30 });
    expect(thumbnailSize({ width: 100_000, height: 1 }, box)).toEqual({ width: 104, height: 1 });
  });
});

describe('drawing a picture', () => {
  it.each(['tall.jpg', 'wide.jpg', 'alpha.png', 'palette.png', 'cmyk.jpg', 'p3.jpg', 'screenshot.png'])('draws %s inside the box, not blank', async (name) => {
    const doc = await openPicture(picture(name), tools);
    const seen = await look(await doc.render(1, box));
    expect(seen.width).toBeLessThanOrEqual(box.width);
    expect(seen.height).toBeLessThanOrEqual(box.height);
    expect(Math.max(seen.width, seen.height)).toBeGreaterThan(50);
    expect(pictureDecoder.calls).toBe(1);
    await doc.close();
  });

  it('sizes a sideways photo from its shown size, upright', async () => {
    const doc = await openPicture(picture('turn-6.jpg'), tools);
    const seen = await look(await doc.render(1, box));
    expect(seen.width).toBe(104);
    expect(seen.height).toBe(65);
  });

  it('never decodes a picture over 50 million pixels, PNG or JPG', async () => {
    for (const name of ['huge.png', 'huge.jpg']) {
      const doc = await openPicture(picture(name), tools);
      await expect(doc.render(1, box), name).rejects.toThrow();
    }
    expect(pictureDecoder.calls).toBe(0);
  });

  it('never decodes a picture that is damaged or saved in a way the tool cannot read', async () => {
    for (const name of ['broken.jpg', 'broken.png', 'zero-size.png', 'arithmetic.jpg']) {
      const doc = await openPicture(picture(name), tools);
      await expect(doc.render(1, box), name).rejects.toThrow();
    }
    expect(pictureDecoder.calls).toBe(0);
  });

  it('closes the decoded picture and lets go of the canvas, even when drawing fails', async () => {
    let closed = 0;
    let released = 0;
    const failing: EngineTools = {
      decodePicture: async () => ({ decode: async () => ({ image: {}, close: () => closed++ }) }),
      canvas: async () => ({
        ...canvasMaker,
        create: () => ({ canvas: {}, context: { fillRect() {}, drawImage() { throw new Error('cannot draw'); } } }),
        release: () => released++,
      }),
    };
    const doc = await openPicture(picture('small.png'), failing);
    await expect(doc.render(1, box)).rejects.toThrow('cannot draw');
    expect(closed).toBe(1);
    expect(released).toBe(1);
  });

  it('draws nothing after it is closed', async () => {
    const doc = await openPicture(picture('small.png'), tools);
    await doc.close();
    await expect(doc.render(1, box)).rejects.toThrow();
    expect(pictureDecoder.calls).toBe(0);
  });
});
