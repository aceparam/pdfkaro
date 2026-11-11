// Shared by the thumbnail tests: the fixtures, a Node canvas maker in place of the
// worker's OffscreenCanvas, and a way to look at the picture drawn.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import type { CanvasMaker } from '../../src/engines/thumbnail';
import type { EngineTools } from '../../src/engines/types';

export const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

export const canvasMaker: CanvasMaker = {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  },
  resize(canvas, width, height) {
    (canvas as Canvas).width = width;
    (canvas as Canvas).height = height;
  },
  release(canvas) {
    (canvas as Canvas).width = 0;
    (canvas as Canvas).height = 0;
  },
  png: async (canvas) => new Uint8Array((canvas as Canvas).toBuffer('image/png')),
};

export const tools: EngineTools = {
  // Node needs PDF.js's legacy build; the browser takes the modern one.
  pdfjs: async () => import('pdfjs-dist/legacy/build/pdf.mjs'),
  canvas: async () => canvasMaker,
  pdfjsData: async () => (await import('../../src/workers/pdfjs-data')).pdfjsData,
};

export const box = { width: 104, height: 136 };

/** The picture's size, and how much of it is darker than paper. */
export async function look(png: Uint8Array) {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  let dark = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index]! + data[index + 1]! + data[index + 2]! < 600) dark++;
  return { width: image.width, height: image.height, ink: dark / (image.width * image.height) };
}

