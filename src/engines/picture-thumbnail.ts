// Draws a JPG or PNG as a small picture, for the thumbnails in Image to PDF's
// list. The worker uses it in place of thumbnail.ts (PDF.js) for that tool
// only. It keeps the engine rules: the image decoder and the canvas maker come
// in through `tools`, so it uses no page and makes no request, and a Node test
// can run it.
//
// A picture is read with `readPicture` first, and drawn only when it passes;
// a picture above `maxPngPixels`, JPG or PNG, is never decoded for a thumbnail.

import { maxPngPixels, readPicture, shownSize } from './picture';
import type { CanvasMaker } from './thumbnail';
import type { EngineTools } from './types';

/** A decoded picture, already turned as its camera recorded. `close` lets go of its pixels. */
export type DecodedPicture = { image: unknown; close(): void };

/** How the worker (createImageBitmap) or a Node test decodes a picture, at about `width` by `height`, turned upright. */
export type PictureDecoder = {
  decode(bytes: Uint8Array, width: number, height: number): Promise<DecodedPicture>;
};

/** A canvas maker that can also draw a decoded picture on its canvas. */
type DrawingContext = { drawImage(image: unknown, x: number, y: number, width: number, height: number): void; fillStyle: unknown; fillRect(x: number, y: number, width: number, height: number): void };

async function need<T>(tools: EngineTools, name: string): Promise<T> {
  const make = tools[name];
  if (!make) throw new Error(`${name} was not given to the thumbnail.`);
  return (await make()) as T;
}

/** The thumbnail's size: the picture as shown, fitted inside `box`, never larger than the picture itself. */
export function thumbnailSize(shown: { width: number; height: number }, box: { width: number; height: number }): { width: number; height: number } {
  const scale = Math.min(1, box.width / shown.width, box.height / shown.height);
  return { width: Math.max(1, Math.round(shown.width * scale)), height: Math.max(1, Math.round(shown.height * scale)) };
}

/**
 * Opens a picture for drawing, with the same shape as an open PDF: `render`
 * ignores the page number, as a picture has one. Nothing is decoded until
 * `render` is called, and nothing at all for a picture `readPicture` does not
 * pass or one above `maxPngPixels`, whatever its kind.
 */
export async function openPicture(file: Uint8Array, tools: EngineTools) {
  let closed = false;
  return {
    pages: 1,
    async render(_page: number, box: { width: number; height: number }): Promise<Uint8Array> {
      if (closed) throw new Error('The picture is closed.');
      const read = readPicture(file);
      if (read.kind !== 'ok') throw new Error('The picture cannot be read.');
      // Any kind of picture: a JPG is never decoded by the engine, but the browser would decode it here.
      if (read.picture.width * read.picture.height > maxPngPixels) throw new Error('The picture is too large to draw small.');
      const { width, height } = thumbnailSize(shownSize(read.picture), box);
      const decoder = await need<PictureDecoder>(tools, 'decodePicture');
      const canvases = await need<CanvasMaker>(tools, 'canvas');
      const decoded = await decoder.decode(file, width, height);
      try {
        const { canvas, context } = canvases.create(width, height);
        try {
          const drawing = context as DrawingContext;
          // See-through parts show white, as on the page.
          drawing.fillStyle = '#ffffff';
          drawing.fillRect(0, 0, width, height);
          drawing.drawImage(decoded.image, 0, 0, width, height);
          return await canvases.png(canvas);
        } finally {
          canvases.release(canvas);
        }
      } finally {
        decoded.close();
      }
    },
    async close() {
      closed = true;
    },
  };
}
