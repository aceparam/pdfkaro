// Shared by Crop PDF's tests: files made for them.

import { PDFDocument, PDFName, StandardFonts, rgb } from '@cantoo/pdf-lib';

/**
 * The stage 2 code reviewer's file: an A4 page with a dark 5,000 by 4,000 picture (20 million pixels, over PDF.js's
 * `maxImageSize`) drawn across most of it, and a small "Page 1" at the bottom. PDF.js, unless told to stop at errors,
 * leaves the picture out of its drawing with only a warning, so the page would look like a page number alone.
 */
export async function bigPicturePage(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const width = 5000;
  const height = 4000;
  const raw = new Uint8Array(width * height).fill(60);
  const picture = doc.context.register(doc.context.flateStream(raw, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }));
  page.node.normalizedEntries().XObject.set(PDFName.of('Im1'), picture);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Page 1', { x: 280, y: 30, size: 10, font, color: rgb(0, 0, 0) });
  const saved = await doc.save({ useObjectStreams: false });
  const again = await PDFDocument.load(saved);
  const first = again.getPage(0);
  const draw = again.context.register(again.context.flateStream('q 500 0 0 400 47 300 cm /Im1 Do Q'));
  const old = first.node.get(PDFName.of('Contents'));
  const own = old && 'asArray' in (old as object) ? (old as unknown as { asArray(): unknown[] }).asArray() : [old];
  first.node.set(PDFName.of('Contents'), again.context.obj([draw, ...(own as never[])]));
  return again.save({ useObjectStreams: false });
}
