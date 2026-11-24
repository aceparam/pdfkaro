// Drawing on the pages of a PDF: the shared step of Add page numbers, which
// Watermark and Sign PDF reuse by giving their own `draw`. A tool may choose
// which pages are drawn on (`only`, Sign PDF); a page not chosen is not touched.
//
// pdf-lib draws one layer per page, on a page sized as the visitor's page is
// shown (its crop box, turn and user unit read as PDF.js reads them). Each
// layer becomes a form XObject, and each page's /Contents becomes
// [q, its own streams as they were, Q, draw], where `draw` places the form
// with a matrix worked out here. The page's own content is not copied or
// changed, so marked content tied to tags, /StructParents and streams shared
// by many pages stay as they were, and the q … Q around it means nothing it
// leaves behind can move the drawing. Per page, only /Resources and /Contents
// change: no stored turn, box or user unit is rewritten.
//
// The whole update goes to qpdf as one JSON file, written in pieces as the
// layers are drawn in pdf-lib documents of at most 2,000 pages (pdf-lib slows
// as a document grows). The update and the new file are each held to a size
// budget that only a broken or crafted file reaches; past it the job stops
// with `OutputLimit`, which the page explains in its own sentence.
//
// pdf-lib is imported for its types only: its values come from
// `tools.pdflib()`, so this file stays small and holds none of pdf-lib's code.
// Only qpdf's own JSON is parsed, from files capped while written. Object ids
// are taken only as `N G R`. Document text never goes into an error.
//
// Reading the pages and writing the update are in pages.ts, which Crop PDF
// shares without drawing; this file holds only the drawing step.

import type * as PdfLib from '@cantoo/pdf-lib';
import { OutputLimit } from './qpdf';
import { freshQpdf } from './plain';
import { entryText, isDict, opening, type Dict, type QpdfEntry } from './qpdf-json';
import { pdfNumber, readPages, runPages, sizeLimit, writePageUpdate, type PagePlace, type PageRead, type PlainSource } from './pages';
import type { EngineTools } from './types';

type Lib = typeof PdfLib;

/** Moved to qpdf.ts with the capped write; re-exported so this file's importers are unchanged. */
export { OutputLimit } from './qpdf';

// ---------------------------------------------------------------------------
// Where the layer goes.

/** The `cm` matrix that takes the layer, upright as shown, onto the page's user space. */
export function layerMatrix(place: Pick<PagePlace, 'turn' | 'box' | 'unit'>): [number, number, number, number, number, number] {
  const [x0, y0, x1, y1] = place.box;
  const k = 1 / place.unit;
  switch (place.turn) {
    case 90:
      return [0, k, -k, 0, x1, y0];
    case 180:
      return [-k, 0, 0, -k, x1, y1];
    case 270:
      return [0, -k, k, 0, x0, y1];
    default:
      return [k, 0, 0, k, x0, y0];
  }
}

// ---------------------------------------------------------------------------
// pdf-lib objects into qpdf's JSON.

/** New objects for the update, given ids above the file's highest; an object whose JSON is the same as one already made reuses its id. */
export type NewObjects = {
  /** The next free object number. */
  next: number;
  /** Each object's JSON text, to its id, across every run. */
  byText: Map<string, string>;
  /** The objects made and not yet written, by id, as qpdf JSON entries. */
  entries: Map<string, QpdfEntry>;
};

/** A new object id. */
export function newId(objects: NewObjects): string {
  return `${objects.next++} 0 R`;
}

/** Each large raw stream's bytes, to a number of their own, so its key in `byText` is short. */
const bytesNumber = new WeakMap<Uint8Array, number>();
let nextBytesNumber = 0;
/** Above this many bytes, a raw stream is known by its bytes' identity and its dictionary, not by its whole text. */
const keyByIdentity = 64 * 1024;

function numberOf(bytes: Uint8Array): number {
  let number = bytesNumber.get(bytes);
  if (number === undefined) {
    number = nextBytesNumber++;
    bytesNumber.set(bytes, number);
  }
  return number;
}

/** Bytes as base64, in chunks, with what a worker and Node both have. */
export function base64(bytes: Uint8Array): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(text);
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const plainName = /^\/[A-Za-z0-9._+-]+$/;
const maxDepth = 32;

/**
 * One pdf-lib object as qpdf's JSON: names, numbers, booleans, null, strings
 * (as `b:` and hex), arrays, dictionaries and references. A referenced object
 * is converted once per run (`refs`, by pdf-lib's tag) and gets a new id, or
 * the id of an object already made with the same JSON text; its entry goes in
 * `objects.entries`. A stream's data goes as base64 with its own /Filter, or
 * unencoded with none. Only plain names are taken; a loop or a deep nest throws.
 */
export function fromPdfLib(lib: Lib, context: PdfLib.PDFContext, object: PdfLib.PDFObject, objects: NewObjects, refs: Map<string, string>, depth = 0): unknown {
  if (depth > maxDepth) throw new Error('A drawing nested too deep.');
  if (object instanceof lib.PDFRef) {
    const tag = object.tag;
    const known = refs.get(tag);
    if (known === 'pending') throw new Error('A drawing referred to itself.');
    if (known !== undefined) return known;
    refs.set(tag, 'pending');
    const target = context.lookup(object);
    if (target === undefined) throw new Error('A drawing referred to nothing.');
    // A raw stream over 64 KB (Sign PDF's picture, registered afresh in each run over the same bytes) is known by its
    // bytes' identity and its dictionary, so its data is turned into base64 once per job, when first written, and never
    // kept as a key. Anything smaller is known by its JSON text, so an identical object made in another run is written once.
    let text: string;
    let make: () => QpdfEntry;
    if (target instanceof lib.PDFRawStream && target.getContents().length > keyByIdentity) {
      const bytes = target.getContents();
      const dict = dictOf(lib, context, target.dict, objects, refs, depth + 1, ['/Length']);
      text = `bytes:${numberOf(bytes)}:${JSON.stringify(dict)}`;
      make = () => ({ stream: { dict, data: base64(bytes) } });
    } else {
      const entry = entryOf(lib, context, target, objects, refs, depth + 1);
      text = JSON.stringify(entry);
      make = () => entry;
    }
    let id = objects.byText.get(text);
    if (id === undefined) {
      id = newId(objects);
      objects.byText.set(text, id);
      objects.entries.set(id, make());
    }
    refs.set(tag, id);
    return id;
  }
  if (object instanceof lib.PDFName) {
    const name = object.asString();
    if (!plainName.test(name)) throw new Error('A drawing used a name that is not plain.');
    return name;
  }
  if (object instanceof lib.PDFNumber) {
    const value = object.asNumber();
    if (!Number.isFinite(value)) throw new Error('A drawing used a number that is not finite.');
    return value;
  }
  if (object instanceof lib.PDFBool) return object.asBoolean();
  if (object === lib.PDFNull) return null;
  if (object instanceof lib.PDFString || object instanceof lib.PDFHexString) return `b:${hex(object.asBytes())}`;
  if (object instanceof lib.PDFArray) return object.asArray().map((item) => fromPdfLib(lib, context, item, objects, refs, depth + 1));
  if (object instanceof lib.PDFDict) return dictOf(lib, context, object, objects, refs, depth);
  throw new Error('A drawing used an object that cannot be written.');
}

function dictOf(lib: Lib, context: PdfLib.PDFContext, dict: PdfLib.PDFDict, objects: NewObjects, refs: Map<string, string>, depth: number, leave: readonly string[] = []): Dict {
  const out: Dict = {};
  for (const [key, value] of dict.entries()) {
    const name = key.asString();
    if (!plainName.test(name)) throw new Error('A drawing used a name that is not plain.');
    if (leave.includes(name)) continue;
    out[name] = fromPdfLib(lib, context, value, objects, refs, depth + 1);
  }
  return out;
}

/** The entry of a referenced object: a stream, with its data, or a value. */
function entryOf(lib: Lib, context: PdfLib.PDFContext, target: PdfLib.PDFObject, objects: NewObjects, refs: Map<string, string>, depth: number): QpdfEntry {
  if (target instanceof lib.PDFRawStream) {
    return { stream: { dict: dictOf(lib, context, target.dict, objects, refs, depth, ['/Length']), data: base64(target.getContents()) } };
  }
  if (target instanceof lib.PDFFlateStream) {
    return { stream: { dict: dictOf(lib, context, target.dict, objects, refs, depth, ['/Length', '/Filter', '/DecodeParms']), data: base64(target.getUnencodedContents()) } };
  }
  if (target instanceof lib.PDFStream) throw new Error('A drawing used a stream that cannot be written.');
  return { value: fromPdfLib(lib, context, target, objects, refs, depth) };
}

/** A layer page's content, unencoded and joined, and its resources as qpdf JSON. */
function layerOf(lib: Lib, page: PdfLib.PDFPage, objects: NewObjects, refs: Map<string, string>): { data: Uint8Array; resources: Dict } {
  const context = page.doc.context;
  const contents = page.node.Contents();
  const streams = contents instanceof lib.PDFArray ? contents.asArray().map((item) => context.lookup(item)) : contents ? [contents] : [];
  const parts = streams.map((stream) => {
    if (stream instanceof lib.PDFFlateStream) return stream.getUnencodedContents();
    throw new Error('A drawing gave content that cannot be read.');
  });
  const size = parts.reduce((sum, part) => sum + part.length + 1, 0);
  const data = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    data.set(part, at);
    data[at + part.length] = 10;
    at += part.length + 1;
  }
  const resources = page.node.Resources();
  const converted = resources ? dictOf(lib, context, resources, objects, refs, 0) : {};
  // pdf-lib starts every page with empty /ExtGState and /XObject dictionaries; an empty one says nothing.
  for (const [key, value] of Object.entries(converted)) if (isDict(value) && Object.keys(value).length === 0) delete converted[key];
  return { data, resources: converted };
}

// ---------------------------------------------------------------------------
// The update.

const encoder = new TextEncoder();

/** What a page's update is expected to take, in bytes, before it is built: its copied resources in full, its dictionary and its layer. */
export function pageEstimate(page: Pick<PageRead, 'dict' | 'resources' | 'xobjects' | 'contents'>, sizes: WeakMap<object, number>): number {
  const size = (value: Dict | undefined, leave: string[]) => {
    if (!value) return 0;
    let known = sizes.get(value);
    if (known === undefined) {
      const kept: Dict = {};
      for (const [key, item] of Object.entries(value)) if (!leave.includes(key)) kept[key] = item;
      known = JSON.stringify(kept).length;
      sizes.set(value, known);
    }
    return known;
  };
  // The page's dictionary without the two keys replaced, the resources without /XObject, and /XObject, each in full.
  const own = { ...page.dict };
  delete own['/Resources'];
  delete own['/Contents'];
  return JSON.stringify(own).length + size(page.resources, ['/XObject']) + size(page.xobjects, []) + 16 * page.contents.length + 600;
}

/** A free name for the layer in a page's /XObject: /PDFkaro, or /PDFkaro1, /PDFkaro2 and on. */
export function freeName(xobjects: Dict): string {
  let name = '/PDFkaro';
  for (let n = 1; Object.hasOwn(xobjects, name); n++) name = `/PDFkaro${n}`;
  return name;
}

/**
 * What a tool gives the drawing step. `prepare` runs once for each pdf-lib document of up to
 * 2,000 layer pages, with pdf-lib itself, and gives what every page of the run draws with: Add page
 * numbers embeds Helvetica, Watermark Helvetica Bold, Sign PDF the signature's form.
 * `draw` then draws on one layer page with it.
 */
export type StampSteps<Run = unknown> = {
  prepare(doc: PdfLib.PDFDocument, lib: Lib): Promise<Run>;
  /** Draws on one layer page, sized as the page is shown, upright; `index` counts from 0 over every page of the file. */
  draw(page: PdfLib.PDFPage, area: { width: number; height: number }, index: number, run: Run, lib: Lib): void;
  /**
   * Which pages are drawn on, by index from 0 of `total`. Left out, every page. A page not chosen gets no layer and no
   * entry in the update, so it stays exactly as in the plain copy. Choosing no page at all is refused before anything is written.
   */
  only?(index: number, total: number): boolean;
  /**
   * The encoded size in bytes of what every run's `prepare` makes and the new file is to hold once (Sign PDF's picture
   * and signature form). Counted once against the size budget before the first run. When the chosen pages' estimate
   * alone fits and adding it would pass the budget, the job stops with `OutputLimit` whose reason is `'shared'`; when
   * the pages alone pass it, with a plain `OutputLimit`. Either way before anything is drawn.
   */
  sharedBytes?: number;
  /** After each layer page is drawn: how many chosen pages are done, of how many chosen. */
  onPage?(done: number, total: number): void;
  /** qpdf's write progress, in percent. */
  onWriting?(percent: number): void;
};

/** What the update holds for shared streams of `bytes` encoded bytes: their data as base64, and room for their dictionaries. */
export function sharedText(bytes: number): number {
  return Math.ceil(bytes / 3) * 4 + 4096;
}

/**
 * Draws on the chosen pages of the plain copy (every page unless `only` says
 * otherwise) and gives the checked result. The reading qpdf is let go first;
 * then the stamping qpdf is made from the plain copy, and `source.plain` is let
 * go, so reading never holds a fourth copy. Layers are drawn 2,000 chosen pages
 * at a time; each run is turned into update entries, appended to the stamping
 * qpdf's /update.json, and let go; a page not chosen gets nothing. Before a run
 * is built its update is estimated, and once the running total would pass the
 * budget the job stops with `OutputLimit`. What every run shares
 * (`sharedBytes`) is counted once, at its encoded size, as the new file holds
 * it; the update, which carries it as base64, is allowed that much more.
 */
export async function stampPages<Run>(tools: EngineTools, source: PlainSource, steps: StampSteps<Run>): Promise<Uint8Array> {
  if (!source.plain) throw new Error('No file was given to draw on.');
  const plainBytes = source.plain.byteLength;
  const read = await readPages(tools, source.plain);
  const total = read.pages.length;
  const chosen = steps.only ? read.pages.flatMap((page, index) => (steps.only!(index, total) ? [{ page, index }] : [])) : read.pages.map((page, index) => ({ page, index }));
  // Refused before anything is written, so a tool's mistake can never hand back the plain copy as if it were drawn on.
  if (chosen.length === 0) throw new Error('No page was chosen to draw on.');
  const limit = sizeLimit(plainBytes, total);
  const shared = Math.max(0, steps.sharedBytes ?? 0);
  // The update carries shared streams as base64, a third larger than the file will hold them, once.
  const updateLimit = shared > 0 ? limit + sharedText(shared) - shared : limit;
  const sizes = new WeakMap<object, number>();
  if (shared > 0) {
    const pagesAlone = chosen.reduce((sum, { page }) => sum + pageEstimate(page, sizes), 0);
    // 'shared' only when the chosen pages alone fit, so what they share is what passes the budget; otherwise the pages do.
    if (pagesAlone > limit) throw new OutputLimit();
    if (shared + pagesAlone > limit) throw new OutputLimit('shared');
  }
  const lib = (await (tools.pdflib ?? missing)()) as Lib;
  const qpdf = await freshQpdf(tools, source.plain);
  delete source.plain;

  const objects: NewObjects = { next: read.max + 1, byText: new Map(), entries: new Map() };
  let appended = 0;
  const append = (text: string) => {
    const bytes = encoder.encode(text);
    appended += bytes.length;
    if (appended > updateLimit) throw new OutputLimit();
    qpdf.append('/update.json', bytes);
  };
  const saveId = newId(objects);
  const restoreId = newId(objects);
  append(
    opening(read.max) +
      entryText(saveId, { stream: { dict: {}, data: base64(encoder.encode('q\n')) } }) +
      ',' +
      entryText(restoreId, { stream: { dict: {}, data: base64(encoder.encode('\nQ\n')) } }),
  );
  const draws = new Map<string, string>();
  // The shared streams are still to be written until the first run is appended.
  let sharedLeft = shared > 0 ? sharedText(shared) : 0;

  // Runs of up to 2,000 chosen pages: a stretch of pages with none chosen makes no pdf-lib document and calls no `prepare`.
  for (let start = 0; start < chosen.length; start += runPages) {
    const run = chosen.slice(start, start + runPages);
    const estimate = run.reduce((sum, { page }) => sum + pageEstimate(page, sizes), 0);
    if (appended + estimate + sharedLeft > updateLimit) throw new OutputLimit();

    const doc = await lib.PDFDocument.create({ updateMetadata: false });
    const prepared = await steps.prepare(doc, lib);
    const layers: PdfLib.PDFPage[] = [];
    run.forEach(({ page, index }, offset) => {
      const layer = doc.addPage([page.place.width, page.place.height]);
      steps.draw(layer, { width: page.place.width, height: page.place.height }, index, prepared, lib);
      layers.push(layer);
      steps.onPage?.(start + offset + 1, chosen.length);
    });
    await doc.flush();

    const refs = new Map<string, string>();
    const parts: string[] = [];
    run.forEach(({ page }, offset) => {
      const { place } = page;
      const layer = layerOf(lib, layers[offset]!, objects, refs);
      const formId = newId(objects);
      parts.push(
        entryText(formId, {
          stream: {
            dict: { '/Type': '/XObject', '/Subtype': '/Form', '/BBox': [0, 0, place.width, place.height], '/Resources': layer.resources },
            data: base64(layer.data),
          },
        }),
      );
      const xobjects: Dict = { ...(page.xobjects ?? {}) };
      const name = freeName(xobjects);
      xobjects[name] = formId;
      const text = `q ${layerMatrix(place).map(pdfNumber).join(' ')} cm ${name} Do Q\n`;
      let drawId = draws.get(text);
      if (drawId === undefined) {
        drawId = newId(objects);
        draws.set(text, drawId);
        parts.push(entryText(drawId, { stream: { dict: {}, data: base64(encoder.encode(text)) } }));
      }
      const dict: Dict = { ...page.dict, '/Resources': { ...(page.resources ?? {}), '/XObject': xobjects }, '/Contents': [saveId, ...page.contents, restoreId, drawId] };
      parts.push(entryText(page.id, { value: dict }));
    });
    for (const [id, entry] of objects.entries) parts.push(entryText(id, entry));
    objects.entries.clear();
    append(`,${parts.join(',')}`);
    sharedLeft = 0;
    layers.length = 0;
  }
  append('}]}');
  return writePageUpdate(qpdf, limit, steps.onWriting);
}

async function missing(): Promise<never> {
  throw new Error('pdf-lib was not given to this engine.');
}
