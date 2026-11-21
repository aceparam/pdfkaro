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

import type * as PdfLib from '@cantoo/pdf-lib';
import { finished, type Qpdf } from './qpdf';
import { freshQpdf } from './plain';
import { callWithArgumentFile, isDict, isRef, readDictionaries, type Dict, type ObjectEntry } from './qpdf-json';
import type { EngineTools } from './types';

type Lib = typeof PdfLib;

/** The largest JSON of pages that is parsed. */
export const maxPagesJson = 64 * 1024 * 1024;
/** The most layer pages drawn in one pdf-lib document. */
export const runPages = 2000;
/** How deep the page tree is walked for an inherited value. */
export const treeDepthLimit = 64;
/** The smallest and largest side of a page as shown, in points. Outside them, the job stops. */
export const smallestSide = 1;
export const largestSide = 1e8;
/** The smallest scale the layer's matrix may have (1 / the user unit). Below it, the job stops. */
export const smallestScale = 1e-6;

/**
 * The new file, and the update that makes it, would pass their size budget.
 * Known to the worker by its name, so the page can say so in its own sentence.
 */
export class OutputLimit extends Error {
  override name = 'OutputLimit';
  /**
   * `'shared'` when what every page shares (`sharedBytes`, such as Sign PDF's picture) would alone pass the budget
   * with the chosen pages, found before anything is drawn, so the tool can say so in its own sentence.
   */
  readonly reason: 'shared' | undefined;
  constructor(reason?: 'shared') {
    super('The new file would pass its size limit.');
    this.reason = reason;
  }
}

/** The size budget of the update and of the new file: twice the plain copy, 2 KB a page and 16 MB. */
export function sizeLimit(plainBytes: number, pages: number): number {
  return 2 * plainBytes + 2048 * pages + 16 * 1024 * 1024;
}

// ---------------------------------------------------------------------------
// Where a page is shown.

/** A page's stored values that say where it is shown, each resolved, inherited ones found up the page tree. */
export type RawPlace = { rotate: unknown; mediaBox: unknown; cropBox: unknown; userUnit: unknown };

/** Where a page is shown: its turn, its shown box in its own units, its user unit, and the layer's size in points, upright. */
export type PagePlace = {
  turn: 0 | 90 | 180 | 270;
  box: [number, number, number, number];
  unit: number;
  width: number;
  height: number;
};

const letter: [number, number, number, number] = [0, 0, 612, 792];

/** Four finite numbers, normalised, whose width and height are above 0; else null. As PDF.js reads a box. */
function boxOf(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [a, b, c, d] = value as number[];
  const box: [number, number, number, number] = [Math.min(a!, c!), Math.min(b!, d!), Math.max(a!, c!), Math.max(b!, d!)];
  return box[2] - box[0] > 0 && box[3] - box[1] > 0 ? box : null;
}

/**
 * Where a page is shown, by PDF.js's rules, so the result matches the thumbnail
 * and Firefox: a turn that is a multiple of 90, taken modulo 360, else 0; the
 * paper box, else Letter; the crop box intersected with the paper box when that
 * leaves an area, else the paper box; the page's own user unit when above 0,
 * else 1. A side of the layer under 1 point or over 10^8 points, or a user unit over 10^6
 * (a matrix that would scale by less than a millionth), stops the job.
 */
export function pageBox(raw: RawPlace): PagePlace {
  const rotate = raw.rotate;
  let turn: PagePlace['turn'] = 0;
  if (typeof rotate === 'number' && Number.isFinite(rotate) && rotate % 90 === 0) turn = (((rotate % 360) + 360) % 360) as PagePlace['turn'];
  const paper = boxOf(raw.mediaBox) ?? letter;
  let box = paper;
  const crop = boxOf(raw.cropBox);
  if (crop) {
    const shown: [number, number, number, number] = [Math.max(crop[0], paper[0]), Math.max(crop[1], paper[1]), Math.min(crop[2], paper[2]), Math.min(crop[3], paper[3])];
    if (shown[2] - shown[0] > 0 && shown[3] - shown[1] > 0) box = shown;
  }
  const unit = typeof raw.userUnit === 'number' && Number.isFinite(raw.userUnit) && raw.userUnit > 0 ? raw.userUnit : 1;
  let width = (box[2] - box[0]) * unit;
  let height = (box[3] - box[1]) * unit;
  if (turn === 90 || turn === 270) [width, height] = [height, width];
  for (const side of [width, height]) {
    if (!(side >= smallestSide && side <= largestSide)) throw new Error('A page is too small or too large to draw on.');
  }
  // A user unit so large that the matrix would scale by less than a millionth: only a crafted file has one.
  if (1 / unit < smallestScale) throw new Error('A page is too small or too large to draw on.');
  return { turn, box, unit, width, height };
}

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

/** A number as content-stream text: at most 6 decimals, never in exponent form, no negative zero. */
export function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('A number was not finite.');
  if (Math.abs(value) >= 1e15) return BigInt(Math.round(value)).toString();
  const text = value.toFixed(6).replace(/\.?0+$/, '');
  return text === '-0' ? '0' : text;
}

// ---------------------------------------------------------------------------
// Reading each page.

/** What is kept of each page once the file's JSON is let go. */
export type PageRead = {
  /** The page object's id, `N G R`. */
  id: string;
  /** Its own dictionary, as qpdf gave it. */
  dict: Dict;
  /** Its own content streams, in order, by id. */
  contents: string[];
  /** Its effective /Resources (its own, else inherited), resolved; undefined when it has none. */
  resources: Dict | undefined;
  /** That dictionary's /XObject, resolved; undefined when it has none. */
  xobjects: Dict | undefined;
  place: PagePlace;
};

export type PagesRead = { max: number; pages: PageRead[] };

/** The pages in order, each with its content streams, from a qpdf holding the file as /in.pdf; null when over the cap or unreadable. */
function pageOrder(qpdf: Qpdf): { id: string; contents: string[] }[] | null {
  try {
    qpdf.capFile('/pages.json', maxPagesJson);
    if (!finished(callWithArgumentFile(qpdf, ['--json=2', '--json-key=pages', '/in.pdf', '/pages.json']).code)) return null;
    if (qpdf.size('/pages.json') > maxPagesJson) return null;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(qpdf.read('/pages.json')));
    qpdf.remove('/pages.json');
    if (!isDict(parsed) || !Array.isArray(parsed.pages)) return null;
    const pages: { id: string; contents: string[] }[] = [];
    for (const page of parsed.pages as unknown[]) {
      if (!isDict(page) || !isRef(page.object) || !Array.isArray(page.contents)) return null;
      pages.push({ id: page.object, contents: (page.contents as unknown[]).filter(isRef) });
    }
    return pages;
  } catch {
    return null;
  }
}

/** The pages and every object's dictionary, read by a fresh qpdf that is let go on return. */
async function readJson(tools: EngineTools, plain: Uint8Array) {
  const qpdf = await freshQpdf(tools, plain);
  const order = pageOrder(qpdf);
  return { order, dictionaries: order ? readDictionaries(qpdf, []) : null };
}

/**
 * Each page's id, dictionary, content streams, effective resources and their
 * /XObject, and where it is shown, from a fresh qpdf holding the plain copy,
 * made and let go here. Inherited values are found up /Parent with a depth
 * limit and a set of visited nodes, so a loop in the page tree ends. Over a
 * cap or unreadable, it throws (the engine's failure).
 */
export async function readPages(tools: EngineTools, plain: Uint8Array): Promise<PagesRead> {
  // The reading qpdf lives only inside readJson, so it is let go before the pages are worked out.
  const { order, dictionaries } = await readJson(tools, plain);
  if (!order || !dictionaries || order.length === 0) throw new Error('The pages could not be read.');
  const objects: ReadonlyMap<string, ObjectEntry> = dictionaries.objects;
  const resolve = (value: unknown): unknown => {
    if (!isRef(value)) return value;
    const entry = objects.get(value);
    return entry && 'value' in entry ? entry.value : undefined;
  };
  const isStream = (id: string) => {
    const entry = objects.get(id);
    return entry !== undefined && 'stream' in entry;
  };
  const inherited = (dict: Dict, key: string): unknown => {
    let node: Dict | undefined = dict;
    const visited = new Set<string>();
    for (let depth = 0; node && depth < treeDepthLimit; depth++) {
      if (Object.hasOwn(node, key)) return resolve(node[key]);
      const parent: unknown = node['/Parent'];
      if (!isRef(parent) || visited.has(parent)) return undefined;
      visited.add(parent);
      const next = resolve(parent);
      node = isDict(next) ? next : undefined;
    }
    return undefined;
  };
  const pages = order.map(({ id, contents }): PageRead => {
    const dict = resolve(id);
    if (!isDict(dict)) throw new Error('A page could not be read.');
    const resources = inherited(dict, '/Resources');
    const own = isDict(resources) ? resources : undefined;
    const xobjects = own ? resolve(own['/XObject']) : undefined;
    return {
      id,
      dict,
      contents: contents.filter(isStream),
      resources: own,
      xobjects: isDict(xobjects) ? xobjects : undefined,
      place: pageBox({
        rotate: inherited(dict, '/Rotate'),
        mediaBox: inherited(dict, '/MediaBox'),
        cropBox: inherited(dict, '/CropBox'),
        userUnit: resolve(dict['/UserUnit']),
      }),
    };
  });
  return { max: dictionaries.max, pages };
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

export type QpdfEntry = { value: unknown } | { stream: { dict: Dict; data: string } };

/** A new object id. */
export function newId(objects: NewObjects): string {
  return `${objects.next++} 0 R`;
}

/**
 * Each raw stream's data as base64, by the bytes it holds, so data shared by every run (Sign PDF's picture,
 * registered afresh in each run over the same bytes) is turned into text once per job, not once per run.
 */
const base64Of = new WeakMap<Uint8Array, string>();

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
    const entry = entryOf(lib, context, target, objects, refs, depth + 1);
    const text = JSON.stringify(entry);
    let id = objects.byText.get(text);
    if (id === undefined) {
      id = newId(objects);
      objects.byText.set(text, id);
      objects.entries.set(id, entry);
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
    const contents = target.getContents();
    let data = base64Of.get(contents);
    if (data === undefined) {
      data = base64(contents);
      base64Of.set(contents, data);
    }
    return { stream: { dict: dictOf(lib, context, target.dict, objects, refs, depth, ['/Length']), data } };
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
const entryText = (id: string, entry: QpdfEntry) => `${JSON.stringify(`obj:${id}`)}:${JSON.stringify(entry)}`;
const opening = (max: number) =>
  `{"qpdf":[${JSON.stringify({ jsonversion: 2, pushedinheritedpageresources: false, calledgetallpages: false, maxobjectid: max })},{`;

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

const writeProgress = /write progress:\s*(\d+(?:\.\d+)?)%/;

/**
 * Writes the update held in /update.json into the file held as /in.pdf, as
 * /out.pdf, capped at `limit`; removes /in.pdf and /update.json; checks the
 * result with `qpdf --check`; and gives its bytes. A write refused at the cap,
 * or a file past it, throws `OutputLimit`; any other failure is the engine's.
 */
export function writeUpdate(qpdf: Qpdf, limit: number, onWriting?: (percent: number) => void): Uint8Array {
  const capped = qpdf.capFile('/out.pdf', limit);
  let last = -1;
  qpdf.onLine = (line) => {
    const match = writeProgress.exec(line);
    if (!match) return;
    const percent = Math.min(100, Number(match[1]));
    if (percent === last) return;
    last = percent;
    onWriting?.(percent);
  };
  const written = callWithArgumentFile(qpdf, ['--progress', '/in.pdf', '--update-from-json=/update.json', '--object-streams=generate', '/out.pdf']);
  qpdf.onLine = null;
  // qpdf can finish with exit 0 and a cut-off file when a write is refused while it writes object streams,
  // so the capped file's own record is asked first.
  if (qpdf.refused('/out.pdf') || (capped && /no space left/i.test(written.printed))) throw new OutputLimit();
  if (!finished(written.code)) throw new Error(`qpdf could not write the new file (exit ${written.code}).`);
  if (qpdf.size('/out.pdf') > limit) throw new OutputLimit();
  qpdf.remove('/in.pdf');
  qpdf.remove('/update.json');
  if (!finished(qpdf.call(['--check', '/out.pdf']).code)) throw new Error("The new file did not pass qpdf's check.");
  return qpdf.read('/out.pdf');
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
   * and signature form). Counted once against the size budget before the first run; when it alone, with the chosen
   * pages, would pass the budget, the job stops with `OutputLimit` whose reason is `'shared'`, before anything is drawn.
   */
  sharedBytes?: number;
  /** After each layer page is drawn: how many chosen pages are done, of how many chosen. */
  onPage?(done: number, total: number): void;
  /** qpdf's write progress, in percent. */
  onWriting?(percent: number): void;
};

/** The plain copy, which the drawing step lets go of once qpdf holds it. */
export type PlainSource = { plain?: Uint8Array };

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
  if (shared > 0 && shared + chosen.reduce((sum, { page }) => sum + pageEstimate(page, sizes), 0) > limit) throw new OutputLimit('shared');
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
  return writeUpdate(qpdf, limit, steps.onWriting);
}

async function missing(): Promise<never> {
  throw new Error('pdf-lib was not given to this engine.');
}
