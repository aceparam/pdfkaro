// Watermark: draws the visitor's own text once across every page of one PDF,
// across the centre of the page as a reader shows it, rising from lower left to
// upper right at 45 degrees, upright whatever the page's turn, size or boxes.
//
// The text is drawn by the shared drawing step (`stampPages` in stamp.ts):
// each page's own content stays in place, unchanged, and only its /Resources
// and /Contents change. The watermark is drawn after the page's own content,
// so it shows over pictures and scans, and is marked as a watermark (an
// /Artifact of type /Pagination, subtype /Watermark), so a screen reader skips
// it. Bold Helvetica, one of the standard fonts, so no font goes into the file;
// mid-grey at 40% opacity, so the text under it stays readable. Text, links,
// form fields, notes, bookmarks, attached files, details and tags are kept. The
// file is written afresh, so earlier saved versions inside it are not kept and
// a digital signature stops being valid, as the page says. The new file has no
// password and no restrictions, by the owner's decision of 13 Nov 2026.
//
// The text is checked against the tool's own line in option-values.ts before
// anything else, so pdf-lib never draws "?" in place of a character it cannot
// draw. The text never goes into an error or a progress message.
//
// pdf-lib is imported for its types only: the drawing step fetches it through `tools.pdflib()` and hands it to `draw`.

import type * as PdfLib from '@cantoo/pdf-lib';
import { acceptedText, TextRefused } from '../../widget/option-values';
import { inspectPdf } from '../inspect';
import { passwordFrom, plainCopy } from '../plain';
import { stampPages } from '../stamp';
import type { Engine, Inspector } from '../types';

type Options = { passwords?: unknown; text?: unknown };

/** Helvetica Bold's full height, from its descender to its ascender, as a share of the size. */
export const fullHeight = 0.925;
/** Helvetica Bold's descender, below the baseline, as a share of the size. */
export const descent = 0.207;
/** The grey of the watermark, as a share of full brightness in each of red, green and blue. */
export const grey = 0.5;
/** How much of the watermark shows: 40%. */
export const opacity = 0.4;

/**
 * Where the text goes on a layer of `area` points, the page as shown, upright:
 * the margin is a twelfth of the shorter side; the size is the largest at which
 * the text, turned 45 degrees, fits inside the margin, and at most a fifth of the
 * shorter side; the middle of the text's box is on the centre of the page. Gives
 * the start of the baseline, the size and the angle. `widthOf` gives the text's
 * width at a size.
 */
export function watermarkPlace(
  area: { width: number; height: number },
  text: string,
  widthOf: (text: string, size: number) => number,
): { x: number; y: number; size: number; angle: number } {
  const { width: W, height: H } = area;
  const D = Math.min(W, H);
  const margin = D / 12;
  const k = widthOf(text, 1);
  // Turned 45 degrees, a box k·s by c·s takes a square of side (k + c)·s / √2.
  const fits = ((D - 2 * margin) * Math.SQRT2) / (k + fullHeight);
  const size = Math.min(fits, D / 5);
  // The middle of the text's box, from the start of its baseline, turned 45 degrees, is taken from the centre.
  const kx = (k * size) / 2;
  const ky = (fullHeight / 2 - descent) * size;
  const x = W / 2 - (kx - ky) / Math.SQRT2;
  const y = H / 2 - (kx + ky) / Math.SQRT2;
  return { x, y, size, angle: 45 };
}

/** Draws the text on a layer page, between an /Artifact watermark BDC and EMC, in bold Helvetica, mid-grey at 40%, at 45 degrees. */
export function drawWatermark(lib: typeof PdfLib, page: PdfLib.PDFPage, area: { width: number; height: number }, text: string, font: PdfLib.PDFFont) {
  // Rounded to a thousandth of a point, far finer than can be seen, so the file holds short numbers.
  const exact = watermarkPlace(area, text, (each, at) => font.widthOfTextAtSize(each, at));
  const [x, y, size] = [exact.x, exact.y, exact.size].map((value) => Math.round(value * 1000) / 1000) as [number, number, number];
  // pdf-lib writes a dictionary operand as it is, though its types do not list one.
  const properties = page.doc.context.obj({ Type: 'Pagination', Subtype: 'Watermark' }) as unknown as PdfLib.PDFArray;
  page.pushOperators(lib.PDFOperator.of(lib.PDFOperatorNames.BeginMarkedContentSequence, [lib.PDFName.of('Artifact'), properties]));
  page.drawText(text, { x, y, size, font, color: lib.rgb(grey, grey, grey), opacity, rotate: lib.degrees(exact.angle) });
  page.pushOperators(lib.PDFOperator.of(lib.PDFOperatorNames.EndMarkedContent));
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Watermark takes one file.');
  // Refused before any work: only a string the field would take, cleaned. The error never holds it.
  const text = acceptedText('watermark-pdf', 'text', options.text);
  if (text === undefined) throw new TextRefused();
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });
  // The plain copy is handed over in an object, so the drawing step can let go of it once qpdf holds it.
  const copy: { plain?: Uint8Array; pages: number } = await plainCopy(tools, file, passwordFrom(options));
  const output = await stampPages(tools, copy, {
    // Each run of up to 2,000 layer pages embeds the standard Helvetica Bold once; no font goes into the file.
    prepare: (doc, lib) => doc.embedFont(lib.StandardFonts.HelveticaBold),
    draw: (page, area, _index, font, lib) => drawWatermark(lib, page, area, text, font),
    // The pages fill the bar to 0.8; qpdf's write is reported from 75% and held at 95% until the check is done.
    onPage: (done, total) => onProgress({ stage: 'working', unit: 'page', done, total, writesAfter: true }),
    onWriting: (percent) => onProgress({ stage: 'writing', percent: Math.min(75 + percent / 5, 95) }),
  });
  onProgress({ stage: 'writing', percent: 100 });
  return [output];
};

export const inspect: Inspector = inspectPdf;
