// Add page numbers: puts a number on every page of one PDF, from 1, as digits
// only, at the edge the visitor chose, upright as each page is shown.
//
// The numbers are drawn by the shared drawing step (`stampPages` in stamp.ts):
// each page's own content stays in place, unchanged, and only its /Resources
// and /Contents change. Each number is marked as a page number (an /Artifact
// of type /Pagination), so a screen reader skips it. Black Helvetica, one of
// the standard fonts, so no font goes into the file. Text, links, form fields,
// notes, bookmarks, attached files, details and tags are kept. The file is
// written afresh, so earlier saved versions inside it are not kept and a
// digital signature stops being valid, as the page says. The new file has no
// password and no restrictions, by the owner's decision of 13 Nov 2026.
//
// pdf-lib is imported for its types only: its values come from `tools.pdflib()`.

import type * as PdfLib from '@cantoo/pdf-lib';
import { acceptedValue } from '../../widget/option-values';
import { inspectPdf } from '../inspect';
import { passwordFrom, plainCopy } from '../plain';
import { stampPages } from '../stamp';
import type { Engine, Inspector } from '../types';

type Options = { passwords?: unknown; position?: unknown };

export type Position = 'bottom-left' | 'bottom-centre' | 'bottom-right' | 'top-left' | 'top-centre' | 'top-right';

/** Helvetica's cap height, the height of its digits, as a share of the size. */
export const digitHeight = 0.718;

/**
 * Where a number goes on a page of `area` points, upright: its size, from the
 * page's shorter side over 60, at least 8 and at most 72 points; a margin of
 * three times the size; left, centre or right, at the bottom (its foot on the
 * margin) or the top (its top on the margin). On a page too small for that,
 * the margin shrinks first, down to 0, then the size, until the number fits
 * whole. `widthOf` gives the text's width at a size.
 */
export function numberPlace(
  area: { width: number; height: number },
  text: string,
  position: Position,
  widthOf: (text: string, size: number) => number,
): { x: number; y: number; size: number } {
  const { width: W, height: H } = area;
  let size = Math.min(Math.max(Math.min(W, H) / 60, 8), 72);
  let width = widthOf(text, size);
  let margin = Math.min(3 * size, (W - width) / 2, (H - digitHeight * size) / 2);
  if (margin < 0) {
    margin = 0;
    size *= Math.min(W / width, H / (digitHeight * size));
    width = widthOf(text, size);
  }
  const [edge, side] = position.split('-') as ['bottom' | 'top', 'left' | 'centre' | 'right'];
  const x = side === 'left' ? margin : side === 'right' ? W - margin - width : (W - width) / 2;
  const y = edge === 'bottom' ? margin : H - margin - digitHeight * size;
  return { x, y, size };
}

/** Draws one number on a layer page, between an /Artifact pagination BDC and EMC, in black Helvetica. */
export function drawNumber(lib: typeof PdfLib, page: PdfLib.PDFPage, area: { width: number; height: number }, text: string, position: Position, font: PdfLib.PDFFont) {
  // Rounded to a thousandth of a point, far finer than can be seen, so the file holds short numbers.
  const exact = numberPlace(area, text, position, (each, at) => font.widthOfTextAtSize(each, at));
  const [x, y, size] = [exact.x, exact.y, exact.size].map((value) => Math.round(value * 1000) / 1000) as [number, number, number];
  const kind = position.startsWith('top') ? 'Header' : 'Footer';
  // pdf-lib writes a dictionary operand as it is, though its types do not list one.
  const properties = page.doc.context.obj({ Type: 'Pagination', Subtype: kind }) as unknown as PdfLib.PDFArray;
  page.pushOperators(lib.PDFOperator.of(lib.PDFOperatorNames.BeginMarkedContentSequence, [lib.PDFName.of('Artifact'), properties]));
  page.drawText(text, { x, y, size, font, color: lib.rgb(0, 0, 0) });
  page.pushOperators(lib.PDFOperator.of(lib.PDFOperatorNames.EndMarkedContent));
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Add page numbers takes one file.');
  // Refused before any work: only one of the six places.
  const position = acceptedValue('add-page-numbers', 'position', options.position) as Position | undefined;
  if (position === undefined) throw new Error('The place for the numbers is not valid.');
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });
  const lib = (await (tools.pdflib ?? (() => Promise.reject(new Error('pdf-lib was not given to this engine.'))))()) as typeof PdfLib;
  // The plain copy is handed over in an object, so the drawing step can let go of it once qpdf holds it.
  const copy: { plain?: Uint8Array; pages: number } = await plainCopy(tools, file, passwordFrom(options));
  const output = await stampPages(tools, copy, {
    draw: (page, area, index, font) => drawNumber(lib, page, area, String(index + 1), position, font),
    onPage: (done, total) => onProgress({ stage: 'working', unit: 'page', done, total }),
    onWriting: (percent) => onProgress({ stage: 'writing', percent: Math.min(percent, 95) }),
  });
  onProgress({ stage: 'writing', percent: 100 });
  return [output];
};

export const inspect: Inspector = inspectPdf;
