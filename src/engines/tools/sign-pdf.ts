// Sign PDF: puts the visitor's signature, typed, drawn or from a picture, on the
// last, the first or every page of one PDF, at one of six places at the edge of
// the page as a reader shows it, upright whatever the page's turn, size or boxes.
//
// The signature is drawn by the shared drawing step (`stampPages` in stamp.ts),
// on the chosen pages only (`only`): a page not chosen is left exactly as it
// was, and a chosen page's own content stays in place, unchanged, with only its
// /Resources and /Contents changed. The signature is made once per run of up to
// 2,000 pages as one form XObject, identical in every run, so the new file holds
// it once however many pages carry it. It is drawn after the page's own content,
// so it shows over pictures and scans. It is the page's content, so it is not
// marked as an artifact; it is not added to a tagged file's tags. A typed name
// is drawn in Times Italic, a picture keeps its own colours and see-through
// parts, a drawing is drawn in black as lines with round ends. Text, links, form
// fields, notes, bookmarks, attached files, details and tags are kept. The file
// is written afresh, so earlier saved versions inside it are not kept and a
// digital signature already in it stops being valid, as the page says. The new
// file has no password and no restrictions, by the owner's decision of 13 Nov
// 2026, which names Sign PDF. This is not a digital (certificate) signature.
//
// Every option is checked before the PDF is read: the three choices, then the
// input of the way chosen, and only that one, so a job never falls back on
// another way's input that happens to be present. Nothing typed, drawn or chosen
// goes into an error or a progress message.
//
// A picture is read once per job, before the PDF: rebuilt from the parts needed
// to draw it (a JPG) or its picture chunks only (a PNG), so none of its details
// are copied; decoded and compressed once; and its compressed streams registered
// in each run's document, so no run compresses it again and the drawing step
// writes it once. Its encoded size is counted once against the size budget
// (`sharedBytes`); a picture that alone would pass it stops the job with
// `PictureTooLarge`, which the page names with the picture's size.
//
// pdf-lib is imported for its types only: its values come from `tools.pdflib()`.

import type * as PdfLib from '@cantoo/pdf-lib';
import { outOfMemory } from '../../widget/memory';
import {
  acceptedDrawing,
  acceptedText,
  acceptedValue,
  DrawingRefused,
  optionPictures,
  pad,
  pictureRule,
  PictureRefused,
  PictureTooLarge,
  TextRefused,
  type Drawing,
} from '../../widget/option-values';
import { inspectPdf } from '../inspect';
import { acceptedPicture, jpegForPdf, orientedMatrix, pictureOutcome, pngForPdf, readPicture, shownSize, type InflateClass, type Orientation } from '../picture';
import { passwordFrom, plainCopy } from '../plain';
import { OutputLimit, pdfNumber, stampPages } from '../stamp';
import type { Engine, EngineModule, EngineTools, Inspector } from '../types';

type Lib = typeof PdfLib;

type Options = { passwords?: unknown; source?: unknown; page?: unknown; position?: unknown; name?: unknown; drawing?: unknown; picture?: unknown };

export type Position = 'bottom-left' | 'bottom-centre' | 'bottom-right' | 'top-left' | 'top-centre' | 'top-right';
export type PageChoice = 'last' | 'first' | 'every';

/** The margin from the chosen edges, as a share of the page's shorter side. */
export const marginShare = 1 / 20;
/** The most the signature may take across, as a share of the shorter side. */
export const widthShare = 0.3;
/** The most a drawing or a picture may take up the page, as a share of the shorter side. */
export const heightShare = 1 / 10;
/** The most a typed name may take up the page, so it reads as a signature, not a heading. */
export const typedHeightShare = 1 / 20;
/** The size at which a typed name is set inside its form, which is then scaled. */
const typedSize = 100;
/**
 * How far Times Italic's glyphs reach, in thousandths of the size, so a typed name's form clips nothing: down and up,
 * its FontBBox (-217 and 883: Å's ring and Ú's accent reach 876 to 883, far above the ascender of 683); left of where a
 * glyph starts, the FontBBox's left (169: f starts at -147); right of a glyph's advance, the most any glyph in the font
 * reaches past it (170, the fraction; f reaches 146 past its 278). From the font's metrics file (Times-Italic.afm).
 */
export const timesItalicReach = { left: 169, right: 170, bottom: -217, top: 883 } as const;

/**
 * Where the signature goes on a layer of `area` points, the page as shown, upright, and how large: the margin is a
 * twentieth of the shorter side; the signature keeps its own shape (`box`, its form's size) and is as large as fits in
 * three tenths of the shorter side across and a tenth of it up (a twentieth for a typed name); left, centre or right,
 * at the bottom or the top, its edges on the margin. On a tiny page every number shrinks with the page, so the
 * signature always fits whole inside the margin.
 */
export function signaturePlace(
  area: { width: number; height: number },
  box: { width: number; height: number },
  position: Position,
  typed: boolean,
): { x: number; y: number; scale: number; width: number; height: number } {
  const { width: W, height: H } = area;
  const D = Math.min(W, H);
  const margin = D * marginShare;
  const scale = Math.min((widthShare * D) / box.width, ((typed ? typedHeightShare : heightShare) * D) / box.height);
  const width = scale * box.width;
  const height = scale * box.height;
  const [edge, side] = position.split('-') as ['bottom' | 'top', 'left' | 'centre' | 'right'];
  const x = side === 'left' ? margin : side === 'right' ? W - margin - width : (W - width) / 2;
  const y = edge === 'bottom' ? margin : H - margin - height;
  return { x, y, scale, width, height };
}

// ---------------------------------------------------------------------------
// The signature, as one form XObject.

/** A stream to register afresh in each run: its encoded data, exactly as the file will hold it, and its dictionary's entries with no reference in them. */
type StreamPart = { bytes: Uint8Array; entries: [PdfLib.PDFName, PdfLib.PDFObject][] };

/** A picture, read and compressed once per job. */
export type PictureParts = { image: StreamPart; mask?: StreamPart; orientation: Orientation; width: number; height: number };

/** What the signature is, checked: a name, a drawing, or a picture's parts. */
export type Signature = { kind: 'text'; text: string } | { kind: 'lines'; drawing: Drawing } | { kind: 'picture'; parts: PictureParts };

/** What each run draws with: the form's reference and its own size. */
export type SignatureForm = { ref: PdfLib.PDFRef; width: number; height: number; typed: boolean };

/** Half the pad's line: what the drawing's box is widened by on every side, so its round ends, never wider than the pad's line, are inside it. */
const halfLine = pad.line / 2;
/** How far a Bézier control point sits from the end of a quarter circle, as a share of the radius. */
const kappa = 0.5522847498;

/**
 * The line's width inside a drawing's form of `width × height` pad units: the pad's line (6 units) for a drawing that
 * fills the pad, and thinner for a smaller drawing, by as much as the smaller drawing is scaled up more, so on the page
 * every drawing's line is as thick as a full drawing's at the same signature box (about 0.9 points on A4), however
 * small it was drawn. The scale `signaturePlace` gives is the shorter side times a factor of the box alone, so the share
 * is the same on every page.
 */
export function drawingLine(width: number, height: number): number {
  const fit = (w: number, h: number) => Math.min(widthShare / w, heightShare / h);
  return pad.line * Math.min(1, fit(pad.width + pad.line, pad.height + pad.line) / fit(width, height));
}

/**
 * A drawing's form: its box is the drawing's bounds in pad units, widened by half the pad's line on every side, so the
 * empty part of the pad is left out and the round ends are inside it; its content draws each line in black with round
 * ends and joins, y turned to count up, at the width `drawingLine` gives. A line whose points are all one point is a
 * filled round dot of that same width.
 */
export function drawingContent(drawing: Drawing): { content: string; width: number; height: number; line: number } {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const line of drawing) {
    for (let index = 0; index < line.length; index += 2) {
      left = Math.min(left, line[index]!);
      right = Math.max(right, line[index]!);
      top = Math.min(top, line[index + 1]!);
      bottom = Math.max(bottom, line[index + 1]!);
    }
  }
  const width = right - left + pad.line;
  const height = bottom - top + pad.line;
  const stroke = drawingLine(width, height);
  const n = pdfNumber;
  const x = (value: number) => n(value - left + halfLine);
  const y = (value: number) => n(bottom - value + halfLine);
  const parts = [`q 0 G 0 g ${n(stroke)} w 1 J 1 j`];
  for (const line of drawing) {
    const dot = line.every((value, index) => value === line[index % 2]);
    if (dot) {
      const cx = line[0]! - left + halfLine;
      const cy = bottom - line[1]! + halfLine;
      const r = stroke / 2;
      const k = kappa * r;
      parts.push(
        `${n(cx + r)} ${n(cy)} m`,
        `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
        `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
        `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
        `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c`,
        'f',
      );
      continue;
    }
    const steps = [`${x(line[0]!)} ${y(line[1]!)} m`];
    for (let index = 2; index < line.length; index += 2) steps.push(`${x(line[index]!)} ${y(line[index + 1]!)} l`);
    parts.push(...steps, 'S');
  }
  parts.push('Q');
  return { content: `${parts.join('\n')}\n`, width, height, line: stroke };
}

/** A stream's dictionary entries, leaving out /Length and the one reference allowed (/SMask), refusing any other reference. */
function entriesOf(lib: Lib, dict: PdfLib.PDFDict): [PdfLib.PDFName, PdfLib.PDFObject][] {
  const kept: [PdfLib.PDFName, PdfLib.PDFObject][] = [];
  for (const [key, value] of dict.entries()) {
    const name = key.asString();
    if (name === '/Length' || name === '/SMask') continue;
    if (value instanceof lib.PDFRef || value instanceof lib.PDFArray || value instanceof lib.PDFDict) {
      // pdf-lib writes a picture's dictionary of names and numbers only (and /Decode, an array of numbers).
      if (!(value instanceof lib.PDFArray && value.asArray().every((item) => item instanceof lib.PDFNumber))) throw new Error('A picture gave a dictionary that cannot be copied.');
    }
    kept.push([key, value]);
  }
  return kept;
}

/** The encoded bytes of a stream pdf-lib made, exactly as the file will hold them. */
function encodedOf(lib: Lib, stream: PdfLib.PDFObject | undefined): PdfLib.PDFRawStream {
  if (!(stream instanceof lib.PDFRawStream)) throw new Error('A picture did not give a stream that can be copied.');
  return stream;
}

/**
 * pdf-lib's reading of a picture that passed every check before it, refused as a picture if pdf-lib still cannot read
 * it, so the page names the picture and not the PDF. Only running out of memory goes through unchanged, by the same
 * test the worker uses to say so (`outOfMemory`); anything else, a RangeError from a bad offset included, is refused.
 */
async function asPicture<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (outOfMemory(error)) throw error;
    throw new PictureRefused();
  }
}

/**
 * Reads a picture once, before the PDF: a JPG rebuilt from the parts needed to draw it, with no details, or a PNG's
 * picture chunks only, decoded once by pdf-lib; embedded once into a scratch document, whose compressed streams
 * (the picture, and a PNG's soft mask) are kept as bytes, and the decoded pixels and the scratch document let go.
 * A CMYK JPG with no Adobe segment has its /Decode dropped, as Image to PDF does. No colour profile is kept.
 */
export async function pictureParts(bytes: Uint8Array, lib: Lib): Promise<PictureParts> {
  const read = readPicture(bytes);
  if (read.kind !== 'ok') throw new PictureRefused();
  const { picture } = read;
  const scratch = await lib.PDFDocument.create({ updateMetadata: false });
  let embedder: { width: number; height: number; embedIntoContext(context: PdfLib.PDFContext): Promise<PdfLib.PDFRef> };
  let dropDecode = false;
  if (picture.type === 'jpeg') {
    const cleaned = jpegForPdf(bytes);
    if (!cleaned) throw new PictureRefused();
    embedder = await asPicture(() => lib.JpegEmbedder.for(cleaned.bytes));
    // pdf-lib writes inverted values for every CMYK JPG; without an Adobe segment its values are not inverted.
    dropDecode = picture.components === 4 && !cleaned.adobe;
  } else {
    // acceptedPicture has checked its data inflates to no more than its header says, so the decode is no larger than its stated size.
    const forPdf = pngForPdf(bytes);
    if (!forPdf) throw new PictureRefused();
    embedder = await asPicture(() => lib.PngEmbedder.for(forPdf));
  }
  if (embedder.width !== picture.width || embedder.height !== picture.height) throw new PictureRefused();
  const ref = await asPicture(() => embedder.embedIntoContext(scratch.context));
  const image = encodedOf(lib, scratch.context.lookup(ref));
  if (dropDecode) image.dict.delete(lib.PDFName.of('Decode'));
  const maskRef = image.dict.get(lib.PDFName.of('SMask'));
  const mask = maskRef instanceof lib.PDFRef ? encodedOf(lib, scratch.context.lookup(maskRef)) : undefined;
  return {
    image: { bytes: image.getContents(), entries: entriesOf(lib, image.dict) },
    ...(mask ? { mask: { bytes: mask.getContents(), entries: entriesOf(lib, mask.dict) } } : {}),
    orientation: picture.orientation,
    width: picture.width,
    height: picture.height,
  };
}

/** Registers a kept stream in a run's document, over the same bytes, so nothing is compressed again. */
function registerPart(lib: Lib, doc: PdfLib.PDFDocument, part: StreamPart, mask?: PdfLib.PDFRef): PdfLib.PDFRef {
  const dict = doc.context.obj({});
  for (const [key, value] of part.entries) dict.set(key, value);
  if (mask) dict.set(lib.PDFName.of('SMask'), mask);
  return doc.context.register(lib.PDFRawStream.of(dict, part.bytes));
}

/**
 * A form's content and size, and its content as bytes. A drawing's and a picture's are made once per job, so every run
 * registers its form over the same byte array and the drawing step, which knows a stream over 64 KB by its bytes'
 * identity, writes it once however large it is (a drawing at its 20,000-point limit is about 190 KB).
 */
type Made = { width: number; height: number; content: string; bytes: Uint8Array };

/** A form's content as bytes: it is ASCII, so one byte a character, as pdf-lib's own `context.stream` makes them. */
const asciiBytes = (content: string) => new TextEncoder().encode(content);

/** The form's size and content for a typed name: the name's advance widened by Times Italic's reach on both sides, and its full height, so no glyph is cut. */
export function typedContent(advance: number, encoded: string): Made {
  const unit = typedSize / 1000;
  const reach = timesItalicReach;
  // pdf-lib's own encoding writes the name as a hex string, so no character can close a string or start an operator.
  const content = `q 0 g BT /F1 ${typedSize} Tf ${pdfNumber(reach.left * unit)} ${pdfNumber(-reach.bottom * unit)} Td ${encoded} Tj ET Q\n`;
  return { width: advance + (reach.left + reach.right) * unit, height: (reach.top - reach.bottom) * unit, content, bytes: asciiBytes(content) };
}

/** A signature ready for the runs: a drawing's and a picture's form made once per job; a typed name's needs each run's font. */
export type Planned = { kind: 'text'; text: string } | { kind: 'lines'; made: Made } | { kind: 'picture'; parts: PictureParts; made: Made };

/** Makes what can be made once per job: a drawing's form, or a picture's, drawn upright with the matrix for its camera turn. */
export function planned(signature: Signature): Planned {
  if (signature.kind === 'lines') {
    const drawing = drawingContent(signature.drawing);
    return { kind: 'lines', made: { ...drawing, bytes: asciiBytes(drawing.content) } };
  }
  if (signature.kind === 'picture') {
    const shown = shownSize(signature.parts);
    const matrix = orientedMatrix(signature.parts.orientation, { x: 0, y: 0, width: shown.width, height: shown.height }).map(pdfNumber).join(' ');
    const content = `q ${matrix} cm /Im Do Q\n`;
    return { kind: 'picture', parts: signature.parts, made: { width: shown.width, height: shown.height, content, bytes: asciiBytes(content) } };
  }
  return signature;
}

/**
 * The signature's form for one run, identical in every run, so the drawing step writes it once: registered over the
 * plan's own bytes, as `registerPart` does a picture's, never over bytes made afresh in each run. A typed name's form is
 * small, so the step knows it by its text.
 */
export async function signatureForm(doc: PdfLib.PDFDocument, lib: Lib, plan: Planned): Promise<SignatureForm> {
  const context = doc.context;
  let form: Made;
  let resources: PdfLib.PDFDict;
  if (plan.kind === 'text') {
    const font = await doc.embedFont(lib.StandardFonts.TimesRomanItalic);
    form = typedContent(font.widthOfTextAtSize(plan.text, typedSize), font.encodeText(plan.text).toString());
    resources = context.obj({ Font: { F1: font.ref } });
  } else if (plan.kind === 'lines') {
    form = plan.made;
    resources = context.obj({});
  } else {
    form = plan.made;
    const maskRef = plan.parts.mask ? registerPart(lib, doc, plan.parts.mask) : undefined;
    resources = context.obj({ XObject: { Im: registerPart(lib, doc, plan.parts.image, maskRef) } });
  }
  const { width, height, bytes } = form;
  const stream = lib.PDFRawStream.of(context.obj({ Type: 'XObject', Subtype: 'Form', BBox: [0, 0, width, height], Resources: resources }), bytes);
  return { ref: context.register(stream), width, height, typed: plan.kind === 'text' };
}

/** The encoded size of what every run makes and the file holds once: the form, and a picture's streams. */
function sharedSize(plan: Planned): number {
  if (plan.kind === 'text') return 2048;
  const forms = plan.made.content.length + 1024;
  if (plan.kind === 'lines') return forms;
  return forms + plan.parts.image.bytes.length + (plan.parts.mask?.bytes.length ?? 0);
}

/** Places the form on a layer page: `q s 0 0 s x y cm /Sig Do Q`, rounded to a thousandth of a point. */
export function placeForm(lib: Lib, layer: PdfLib.PDFPage, area: { width: number; height: number }, form: SignatureForm, position: Position) {
  const place = signaturePlace(area, form, position, form.typed);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const name = layer.node.newXObject('Sig', form.ref);
  layer.pushOperators(
    lib.pushGraphicsState(),
    lib.concatTransformationMatrix(place.scale, 0, 0, place.scale, round(place.x), round(place.y)),
    lib.drawObject(name),
    lib.popGraphicsState(),
  );
}

// ---------------------------------------------------------------------------

async function need<T>(tools: EngineTools, name: string): Promise<T> {
  const make = tools[name];
  if (!make) throw new Error(`${name} was not given to the engine.`);
  return (await make()) as T;
}

/**
 * The signature the job is sent, checked under the tool's own rules before the PDF is read: the way chosen is read
 * first, and only its input is taken. Each refusal throws the failure of its kind, whose message holds nothing of it.
 */
export async function chosenSignature(options: Options, tools: EngineTools): Promise<Signature> {
  const source = acceptedValue('sign-pdf', 'source', options.source);
  if (source === 'type') {
    const text = acceptedText('sign-pdf', 'name', options.name);
    if (text === undefined) throw new TextRefused();
    return { kind: 'text', text };
  }
  if (source === 'draw') {
    const drawing = acceptedDrawing('sign-pdf', 'drawing', options.drawing);
    if (drawing === undefined) throw new DrawingRefused();
    return { kind: 'lines', drawing };
  }
  if (source === 'picture') {
    const fflate = await need<{ Inflate: InflateClass }>(tools, 'fflate');
    const bytes = acceptedPicture('sign-pdf', 'picture', options.picture, fflate, optionPictures);
    if (bytes === undefined) throw new PictureRefused();
    return { kind: 'picture', parts: await pictureParts(bytes, await need<Lib>(tools, 'pdflib')) };
  }
  throw new Error('The way to make the signature is not valid.');
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Sign PDF takes one file.');
  // Refused before any work: the two choices of where, then the way and its input.
  const page = acceptedValue('sign-pdf', 'page', options.page) as PageChoice | undefined;
  const position = acceptedValue('sign-pdf', 'position', options.position) as Position | undefined;
  if (page === undefined || position === undefined) throw new Error('The place for the signature is not valid.');
  const signature = await chosenSignature(options, tools);
  const plan = planned(signature);
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });
  // The plain copy is handed over in an object, so the drawing step can let go of it once qpdf holds it.
  const copy: { plain?: Uint8Array; pages: number } = await plainCopy(tools, file, passwordFrom(options));
  try {
    const output = await stampPages(tools, copy, {
      only: (index, total) => page === 'every' || index === (page === 'first' ? 0 : total - 1),
      sharedBytes: sharedSize(plan),
      prepare: (doc, lib) => signatureForm(doc, lib, plan),
      draw: (layer, area, _index, form, lib) => placeForm(lib, layer, area, form, position),
      // Pages are counted only when every page is signed; one page needs no count. They fill the bar to 0.8.
      ...(page === 'every' ? { onPage: (done: number, total: number) => onProgress({ stage: 'working', unit: 'page', done, total, writesAfter: true }) } : {}),
      // qpdf's write is reported from 75% and held at 95% until the check is done.
      onWriting: (percent) => onProgress({ stage: 'writing', percent: Math.min(75 + percent / 5, 95) }),
    });
    onProgress({ stage: 'writing', percent: 100 });
    return [output];
  } catch (error) {
    // The picture alone would pass the size budget: the page names it with its size, not as a damaged file.
    if (error instanceof OutputLimit && error.reason === 'shared' && signature.kind === 'picture') throw new PictureTooLarge();
    throw error;
  }
};

export const inspect: Inspector = inspectPdf;

/** Reads the chosen picture before the job, under the tool's rule. fflate is asked for whatever the picture's type, so the same files are fetched for a JPG and a PNG. */
export const inspectPicture: NonNullable<EngineModule['inspectPicture']> = async (key, bytes, tools) => {
  const rule = pictureRule('sign-pdf', key, optionPictures);
  if (rule === undefined) return { kind: 'damaged' };
  return pictureOutcome(bytes, rule, await need<{ Inflate: InflateClass }>(tools, 'fflate'));
};
