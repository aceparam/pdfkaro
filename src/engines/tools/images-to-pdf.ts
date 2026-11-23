// Image to PDF: one page per picture, in the order given. Served at
// /jpg-to-pdf, /png-to-pdf and /image-to-pdf (the owner's decision of 13 Nov 2026).
//
// pdf-lib is imported for its types only: every value comes from
// `tools.pdflib()`, so this file stays small and reading a picture before the
// job fetches only this file and picture.ts.
//
// A JPG goes in as its own compressed data, rebuilt from the parts needed to
// draw it, so it is not compressed again and its details are left out. A PNG
// is decoded by pdf-lib and stored without loss; only its pixels go in. Only
// the colour data of a colour profile is kept. No document information or XMP
// is written.

import type * as PdfLib from '@cantoo/pdf-lib';
import { isHuge, jpegForPdf, orientedMatrix, pngDataFits, pngForPdf, pngProfile, profileColourOnly, readPicture, shownSize, type InflateClass, type Matrix, type Orientation } from '../picture';
import type { Engine, EngineModule, EngineTools, Inspector } from '../types';

/** What this tool's reading and its job load, before any file is read: chosen by tool, never by a file (types.ts). */
export const loads: EngineModule['loads'] = { read: ['fflate'], job: ['fflate', 'pdflib'] };

/** An A4 page, upright, in points. */
export const a4 = { width: 595.28, height: 841.89 } as const;

/** Points per pixel at 96 pixels to the inch: a picture is never drawn larger than this. */
export const pointsPerPixel = 0.75;

export type Placement = {
  /** The page's size in points: A4 upright, or on its side for a wider picture. */
  page: { width: number; height: number };
  /** The box the picture fills, as shown, centred on the page. */
  box: { x: number; y: number; width: number; height: number };
  /** The `cm` matrix that maps the stored picture's unit square onto the box, turned and mirrored by the camera turn. */
  matrix: Matrix;
};

/**
 * Where a picture of `width` by `height` pixels, as stored, sits on its page.
 * The page is A4, on its side when the picture as shown is wider than tall; the
 * picture is centred, as large as fits, but never larger than its own size at
 * 96 pixels to the inch.
 */
export function place(picture: { width: number; height: number; orientation: Orientation }): Placement {
  const shown = shownSize(picture);
  const page = shown.width > shown.height ? { width: a4.height, height: a4.width } : { width: a4.width, height: a4.height };
  const natural = { width: shown.width * pointsPerPixel, height: shown.height * pointsPerPixel };
  const scale = Math.min(1, page.width / natural.width, page.height / natural.height);
  const w = natural.width * scale;
  const h = natural.height * scale;
  const x = (page.width - w) / 2;
  const y = (page.height - h) / 2;
  const box = { x, y, width: w, height: h };
  return { page, box, matrix: orientedMatrix(picture.orientation, box) };
}

async function need<T>(tools: EngineTools, name: string): Promise<T> {
  const make = tools[name];
  if (!make) throw new Error(`${name} was not given to the engine.`);
  return (await make()) as T;
}

const alternateFor: Record<number, string> = { 1: 'DeviceGray', 3: 'DeviceRGB', 4: 'DeviceCMYK' };

export const run: Engine<Record<string, unknown>> = async (files, _options, onProgress, tools) => {
  if (files.length < 1) throw new Error('Image to PDF needs at least one picture.');
  const pdflib = await need<typeof PdfLib>(tools, 'pdflib');
  const fflate = await need<{ Inflate: InflateClass }>(tools, 'fflate');
  const { PDFDocument, PDFName, pushGraphicsState, concatTransformationMatrix, drawObject, popGraphicsState } = pdflib;
  // No Info dictionary and no XMP: nothing about the pictures or the tool.
  const doc = await PDFDocument.create({ updateMetadata: false });
  const total = files.length;
  for (let index = 0; index < total; index++) {
    onProgress({ stage: 'working', unit: 'file', done: index + 1, total });
    const file = files[index]!;
    const read = readPicture(file);
    if (read.kind !== 'ok') throw new Error('A picture cannot be read.');
    const picture = read.picture;
    let image: PdfLib.PDFImage;
    let profile: Uint8Array | undefined;
    let components: number;
    let adobe = true;
    if (picture.type === 'jpeg') {
      const cleaned = jpegForPdf(file);
      if (!cleaned) throw new Error('A picture cannot be read.');
      image = await doc.embedJpg(cleaned.bytes);
      profile = cleaned.profile;
      components = picture.components;
      adobe = cleaned.adobe;
    } else {
      // Its image data must inflate to no more than its header says, and only the chunks needed to draw it reach pdf-lib.
      const forPdf = pngDataFits(file, fflate) ? pngForPdf(file) : undefined;
      if (!forPdf) throw new Error('A picture cannot be read.');
      image = await doc.embedPng(forPdf);
      // pdf-lib stores every PNG as RGB, so only an RGB profile fits.
      profile = pngProfile(file, fflate);
      components = 3;
    }
    if (image.width !== picture.width || image.height !== picture.height) throw new Error('A picture is not the size its header says.');
    const placement = place(picture);
    const page = doc.addPage([placement.page.width, placement.page.height]);
    const name = page.node.newXObject('Image', image.ref);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...placement.matrix), drawObject(name), popGraphicsState());
    // Writes the image's dictionary now, and lets go of a PNG's decoded pixels before the next picture.
    await image.embed();
    const stream = doc.context.lookup(image.ref) as PdfLib.PDFRawStream;
    // pdf-lib writes inverted values for every CMYK JPG; without an Adobe segment its values are not inverted.
    if (components === 4 && !adobe) stream.dict.delete(PDFName.of('Decode'));
    const colourOnly = profile ? profileColourOnly(profile) : undefined;
    if (colourOnly) {
      const profileRef = doc.context.register(doc.context.flateStream(colourOnly, { N: components, Alternate: alternateFor[components]! }));
      stream.dict.set(PDFName.of('ColorSpace'), doc.context.obj([PDFName.of('ICCBased'), profileRef]));
    }
  }
  onProgress({ stage: 'writing', percent: 0 });
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  onProgress({ stage: 'writing', percent: 100 });
  return [bytes];
};

export const inspect: Inspector = async (file, _password, tools) => {
  const read = readPicture(file);
  if (read.kind !== 'ok') return read;
  // A PNG whose image data would inflate past what its header says is damaged, before the main button.
  if (read.picture.type === 'png' && !pngDataFits(file, await need<{ Inflate: InflateClass }>(tools, 'fflate'))) return { kind: 'damaged' };
  return isHuge(read.picture) ? { kind: 'ready', pages: 1, pixels: read.picture.width * read.picture.height } : { kind: 'ready', pages: 1 };
};

/** This tool's thumbnails are pictures, drawn by the browser's image decoder, not PDF pages drawn by PDF.js. */
export const thumbnails = 'picture';
