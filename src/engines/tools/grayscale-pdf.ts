// Grayscale PDF: shows and prints the colours of one PDF as grey on screens and
// office printers, keeping its text, links and forms (the owner's decisions of
// 24 Nov 2026, "Everything, kept as text" and "Yes, looks and prints grey").
//
// No colour value is changed and no picture is decoded. Every place that names
// an RGB or CMYK colour space it can convert (a resources /ColorSpace entry, a
// picture's or a shading's /ColorSpace, the base of an indexed or pattern
// space) is pointed at one shared grey stand-in of the same number of
// components: a DeviceN space whose alternate is DeviceGray, with a Type 4
// function giving 0.3 R + 0.59 G + 0.11 B (CMYK through the standard's simple
// conversion first). In drawing instructions only the operators that name
// their own space change: `r g b rg` becomes `/GreyRGB cs r g b scn`, `k`
// likewise with `/GreyCMYK`, a device operand of `cs` becomes the stand-in,
// and `sc`/`SC` become `scn`/`SCN`. No drawing state is followed.
//
// Streams are decoded and read by the strict content reader (content.ts),
// which leaves a whole stream as it was at the first doubt; every content
// stream of a page is left when any is. A named RGB entry, whose stand-in
// would start white where the original starts black, is repointed only when
// every stream that can select it was edited, each with ` 0 0 0 scn` after it.
// What is left as it is: spot colours, Lab, unusual ICC profiles, JPEG 2000,
// inline pictures, soft masks, transparency group and default colour spaces,
// output intents, and every stream read with doubt (design decisions 3 and 4).
//
// Limits: a stream or a page's content decoding past 64 MiB stops the job
// with `PageTooLarge` (a stream no page reaches is left instead); every
// decoded and edited byte counts against the content budget (`OutputLimit`);
// the update and the new file are held to `sizeLimit`. The new file has no
// password and no restrictions, as every page tool's. Errors are fixed
// sentences; nothing of the file goes into one.

import { decodeContent, editContent, maxContentBytes, nameValue, numberValue, PageTooLarge, type Edit, type Editor, type OperandRun, type Place, type Spend } from '../content';
import { inspectPdf } from '../inspect';
import { readPages, sizeLimit, writePageUpdate, type PlainSource } from '../pages';
import { freshQpdf, passwordFrom, plainCopy } from '../plain';
import { OutputLimit } from '../qpdf';
import { entryText, isDict, isRef, opening, rawBatches, readRawStreams, type Dict, type ObjectEntry } from '../qpdf-json';
import type { Engine, EngineModule, EngineTools, Inspector, Progress } from '../types';
import { inflatePrefix, zlibDeflate, type Fflate } from '../zlib';

/** What this tool's reading and its job load, before any file is read: chosen by tool, never by a file (types.ts). */
export const loads: EngineModule['loads'] = { read: ['qpdf'], job: ['qpdf', 'fflate'] };

type Options = { passwords?: unknown };

/** A library from the tools the worker or a test gives. A private copy, as thumbnail.ts and sign-pdf.ts keep theirs (design decision 4, item 15). */
async function need<T>(tools: EngineTools, name: string): Promise<T> {
  const make = tools[name];
  if (!make) throw new Error(`${name} was not given to the engine.`);
  return (await make()) as T;
}

/** How many drawing streams and colour profiles one qpdf reads raw at once; the ids go in an argument file. */
export const batchIds = 2000;
/** How many references a colour space is followed through. */
export const referenceSteps = 4;
/** How deep the walk over every object goes into one object's direct values. */
export const walkDepth = 32;
/** How deep the walk from each page through resources, forms, patterns, fonts and appearances goes. */
export const drawDepth = 64;
/** How many fields, kids and bookmarks are walked at most, each once. */
export const treeLimit = 1_000_000;

/** The job's content budget: decoded and edited bytes together, `min(2 GiB, 512 MiB + 200 × the plain copy)`. */
export function contentBudget(plainBytes: number): number {
  return Math.min(2 * 1024 ** 3, 512 * 1024 ** 2 + 200 * plainBytes);
}

// ---------------------------------------------------------------------------
// The grey.

const clamp = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** The PDF standard's luminosity of RGB components, each clamped to 0 to 1. */
export function greyOfRgb(r: number, g: number, b: number): number {
  return clamp(0.3 * clamp(r) + 0.59 * clamp(g) + 0.11 * clamp(b));
}

/** CMYK through the standard's simple conversion to RGB, then its luminosity. */
export function greyOfCmyk(c: number, m: number, y: number, k: number): number {
  const [C, M, Y, K] = [clamp(c), clamp(m), clamp(y), clamp(k)];
  return greyOfRgb(1 - Math.min(1, C + K), 1 - Math.min(1, M + K), 1 - Math.min(1, Y + K));
}

/** A grey as it is written: clamped, finite, at most 4 decimals, never an exponent or a negative zero. */
export function written(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(clamp(value) * 10_000) / 10_000;
  return rounded === 0 ? 0 : rounded;
}

/** The same grey as content-stream text. */
const writtenText = (value: number) => String(written(value));

/** RGB to grey: r g b on the stack, the grey left. */
export const rgbFunction = '{ 0.11 mul exch 0.59 mul add exch 0.3 mul add }';
/** CMYK to grey by the simple conversion, each `min(1, …)` written as `1 2 copy gt {exch} if pop`. */
export const cmykFunction =
  '{ exch 1 index add 1 2 copy gt {exch} if pop 1 exch sub 0.11 mul 3 1 roll dup 3 1 roll add 1 2 copy gt {exch} if pop 1 exch sub 0.59 mul 3 -1 roll add 3 1 roll add 1 2 copy gt {exch} if pop 1 exch sub 0.3 mul add }';

// ---------------------------------------------------------------------------
// Colour spaces.

type Base = 'rgb' | 'cmyk';
/** What a colour space becomes: its stand-in directly, an indexed or pattern space over it, or nothing. */
type Sorted = { kind: 'direct'; base: Base } | { kind: 'indexed' | 'pattern'; base: Base; array: unknown[]; key: string } | null;

/** A qpdf JSON name compared by its decoded form, as qpdf writes it. */
const isName = (value: unknown, name: string) => value === name;

/** Whether a filter value is a lone Flate (a name or a one-item array), the only one `inflatePrefix` may read. */
function loneFlate(filter: unknown): boolean {
  if (filter === '/FlateDecode' || filter === '/Fl') return true;
  return Array.isArray(filter) && filter.length === 1 && (filter[0] === '/FlateDecode' || filter[0] === '/Fl');
}

/** The keys that make a profile unreadable: inflatePrefix ignores predictors, and PDF.js reads the short keys first. */
const profileRefusedKeys = ['/DecodeParms', '/DP', '/F', '/FFilter', '/FDecodeParms'];

/** Every pair of a /Range of exactly `pairs` pairs is 0 to 1; an absent /Range is the default, 0 to 1. */
function unitRange(range: unknown, pairs: number): boolean {
  if (range === undefined) return true;
  if (!Array.isArray(range) || range.length !== 2 * pairs) return false;
  for (let at = 0; at < range.length; at += 2) if (range[at] !== 0 || range[at + 1] !== 1) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Locations of values inside objects.

type Key = string | number;
/** Where a value sits: an object (its value, or a stream's dictionary) and the path inside it. */
type Where = { owner: string; path: Key[] };
const placeKey = (place: Where) => `${place.owner}|${JSON.stringify(place.path)}`;

/** Each changed object: its working copy (a value, or a stream's dictionary) and whether it is a stream. */
type Copies = Map<string, { root: unknown; stream: boolean }>;

// ---------------------------------------------------------------------------
// Reading drawing instructions.

/**
 * Which names get a starting colour after `cs`, and which: `'rgb'` (three zeros, the start of DeviceRGB, CalRGB and
 * ICC RGB) or `'cmyk'` (four zeros, the start of an ICC CMYK space, white, where the stand-in starts black).
 */
type Start = 'rgb' | 'cmyk';
type Eligible = (name: string) => Start | undefined;
const startText: Record<Start, string> = { rgb: '0 0 0', cmyk: '0 0 0 0' };
/** What the edits of one stream used, set while it is edited (the same answers in both passes). */
type Uses = { rgb: boolean; cmyk: boolean };

/** The editor of drawing instructions: rg, RG, k, K, cs, CS, sc, SC, by design decision 4. Pure in its answers. */
export function colourEditor(names: { rgb: string; cmyk: string }, eligible: Eligible, uses: Uses): Editor {
  const allNumbers = (run: OperandRun, count: number) => run.count === count && run.numbers === count;
  return {
    operators: new Set(['rg', 'RG', 'k', 'K', 'cs', 'CS', 'sc', 'SC']),
    edit(operator: string, run: OperandRun, data: Uint8Array): Edit | null | 'doubt' {
      const fill = operator === operator.toLowerCase();
      const select = fill ? 'cs' : 'CS';
      const set = fill ? 'scn' : 'SCN';
      switch (operator) {
        case 'rg':
        case 'RG':
          if (!allNumbers(run, 3)) return 'doubt';
          uses.rgb = true;
          return { before: ` ${names.rgb} ${select} `, operator: ` ${set} ` };
        case 'k':
        case 'K':
          if (!allNumbers(run, 4)) return 'doubt';
          uses.cmyk = true;
          return { before: ` ${names.cmyk} ${select} `, operator: ` ${set} ` };
        case 'sc':
        case 'SC':
          // Any count of numbers; `scn` means the same as `sc` for every space and is the only one DeviceN defines.
          // It changes nothing drawn by itself, so it does not make the stream changed (counts: false).
          if (run.numbers !== run.count) return 'doubt';
          return { operator: ` ${set} `, counts: false };
        default: {
          // cs and CS: exactly one name.
          const operand = run.last[0];
          if (run.count !== 1 || operand === undefined || operand.kind !== 'name') return 'doubt';
          const name = nameValue(data, operand);
          if (name === undefined) return 'doubt';
          if (name === '/DeviceRGB') {
            uses.rgb = true;
            return { operands: ` ${names.rgb} `, after: ` 0 0 0 ${set} ` };
          }
          if (name === '/DeviceCMYK') {
            uses.cmyk = true;
            return { operands: ` ${names.cmyk} ` };
          }
          // The original's starting colour after a name whose entry may be repointed; harmless if it is not, as it is
          // that space's own start (ISO 32000-1 8.6.5 and 8.6.8).
          const start = eligible(name);
          if (start) return { after: ` ${startText[start]} ${set} `, counts: false };
          return null;
        }
      }
    },
  };
}

/** The editor of a /DA string: `r g b rg` and `c m y k k` become `y g`, as readers read a /DA for g, rg and k only. */
export function appearanceEditor(): Editor {
  return {
    operators: new Set(['rg', 'k']),
    edit(operator: string, run: OperandRun, data: Uint8Array): Edit | null | 'doubt' {
      const count = operator === 'rg' ? 3 : 4;
      if (run.count !== count || run.numbers !== count) return 'doubt';
      const values = run.last.map((operand) => numberValue(data, operand));
      if (values.length !== count) return 'doubt';
      const [a = 0, b = 0, c = 0, d = 0] = values;
      const grey = operator === 'rg' ? greyOfRgb(a, b, c) : greyOfCmyk(a, b, c, d);
      return { operands: ` ${writtenText(grey)} `, operator: ' g ' };
    },
  };
}

/** A colour array a reader draws with (`/C`, `/IC`, `/BG`, `/BC`) made neutral, keeping its count; undefined when unchanged. */
export function neutralColour(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  const numbers = value as number[];
  if (numbers.length === 3) {
    const [r, g, b] = numbers as [number, number, number];
    if (r === g && g === b && r >= 0 && r <= 1) return undefined;
    const grey = written(greyOfRgb(r, g, b));
    return [grey, grey, grey];
  }
  if (numbers.length === 4) {
    const [c, m, y, k] = numbers as [number, number, number, number];
    if (c === m && m === y && numbers.every((value) => value >= 0 && value <= 1)) return undefined;
    return [0, 0, 0, written(1 - greyOfCmyk(c, m, y, k))];
  }
  return undefined;
}

/** A /DA string as qpdf's JSON gives it, as ASCII bytes; undefined when it is not plain ASCII. */
function stringBytes(value: unknown): Uint8Array | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.startsWith('u:')) {
    const text = value.slice(2);
    for (let at = 0; at < text.length; at++) if (text.charCodeAt(at) > 0x7f) return undefined;
    return Uint8Array.from(text, (char) => char.charCodeAt(0));
  }
  if (value.startsWith('b:')) {
    const hex = value.slice(2);
    if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return undefined;
    const bytes = new Uint8Array(hex.length / 2);
    for (let at = 0; at < bytes.length; at++) bytes[at] = parseInt(hex.slice(2 * at, 2 * at + 2), 16);
    if (bytes.some((byte) => byte > 0x7f)) return undefined;
    return bytes;
  }
  return undefined;
}

/** An edited /DA as qpdf's JSON string: the spaces the edit added folded when it holds no string or comment. */
function daString(bytes: Uint8Array): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  if (!/[(<%]/.test(text)) text = text.replace(/[ \t\r\n\f]+/g, ' ').trim();
  return `u:${text}`;
}

// ---------------------------------------------------------------------------
// The plan.

/** One drawing stream to read: its id, the pages it is a content stream of, its strictest place, its first page. */
type Drawing = {
  id: string;
  place: Place;
  /** The 1-based number of the first page that reaches it, or undefined when no page does. */
  page: number | undefined;
  /** Its own resources dictionary (key of `resources`), or undefined for a stream that inherits its caller's. */
  own: string | undefined;
  /** Left before it is read: a soft-mask-only form, an appearance stream or pattern with no resources of its own, and so on. */
  left: boolean;
  content: boolean;
};

/** A resources dictionary: where it is, where its /ColorSpace is, and whether it may change. */
type Resources = {
  place: Where;
  /** Where its /ColorSpace dictionary sits (an object of its own, or inside this one); undefined when it has none. */
  spaces: Where | undefined;
  /** A soft-mask-only form's own resources: never changed. */
  locked: boolean;
  /** Owned by a stream this tool knows (a page's effective resources, or a form's, pattern's, font's or appearance's own). */
  owned: boolean;
};

/** What a stream came to. */
type Outcome = { status: 'left' | 'unchanged' } | { status: 'edited'; data: Uint8Array; counts: boolean; uses: Uses };

/** What the job keeps once the objects read are let go. */
type Changes = {
  max: number;
  limit: number;
  /** What the deflated streams' data files take of the limit; the update's text is counted again as it is written. */
  used: number;
  /** New objects: stand-ins, their functions, and indexed and pattern arrays. */
  created: { id: string; entry: unknown }[];
  copies: Copies;
  /** Each edited stream to write: its new dictionary and its deflated data. */
  streams: Map<string, { dict: Dict; data: Uint8Array }>;
};

/** The limits a run keeps to; tests pass small ones. */
export type Limits = {
  sizeLimit: (plainBytes: number, pages: number) => number;
  contentBudget: (plainBytes: number) => number;
  maxContentBytes: number;
  batchIds: number;
};

/** Bytes as base64, in chunks, with what a worker and Node both have. */
function base64(bytes: Uint8Array): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(text);
}

const strictness: Record<Place, number> = { 'not-last': 2, last: 1, alone: 0 };

/**
 * Reads the pages and every object, plans what is pointed at the stand-ins, reads and edits the drawing streams,
 * and decides the named entries. Gives null when nothing is turned grey. What was read is not kept: only the copies,
 * the new objects and the edited streams leave this function.
 */
async function changesFor(
  tools: EngineTools,
  plain: Uint8Array,
  limits: Limits,
  onPage: (done: number, total: number) => void,
): Promise<Changes | null> {
  const { Inflate, Deflate } = await need<Fflate>(tools, 'fflate');
  const read = await readPages(tools, plain, { objects: true });
  const objects: ReadonlyMap<string, ObjectEntry> = read.objects!;
  const total = read.pages.length;
  const limit = limits.sizeLimit(plain.byteLength, total);
  const budget = limits.contentBudget(plain.byteLength);
  let spent = 0;
  const spend: Spend = (bytes) => {
    spent += bytes;
    if (spent > budget) throw new OutputLimit();
  };
  let made = 0;
  let dataBytes = 0;
  /** The update's own size, counted as each piece is built (a working copy, a new object, a string, a stream's data). */
  const count = (bytes: number) => {
    made += bytes;
    if (made > limit) throw new OutputLimit();
  };
  /** A value's size as JSON, as it will be written. */
  const jsonSize = (value: unknown) => JSON.stringify(value)?.length ?? 4;

  const rootOf = (id: string): unknown => {
    const entry = objects.get(id);
    if (!entry) return undefined;
    return 'value' in entry ? entry.value : entry.stream.dict;
  };
  const isStream = (id: string) => {
    const entry = objects.get(id);
    return entry !== undefined && 'stream' in entry;
  };
  const valueOf = (id: string): unknown => {
    const entry = objects.get(id);
    return entry && 'value' in entry ? entry.value : undefined;
  };
  /** One reference followed, for the content reader. */
  const resolve = (value: unknown): unknown => (isRef(value) ? valueOf(value) : value);
  /** A value followed through at most `referenceSteps` references; undefined past them. */
  const deref = (value: unknown): unknown => {
    let current = value;
    for (let step = 0; step <= referenceSteps; step++) {
      if (!isRef(current)) return current;
      if (step === referenceSteps) return undefined;
      current = valueOf(current);
    }
    return undefined;
  };
  const dictAt = (value: unknown): Dict | undefined => {
    const found = deref(value);
    return isDict(found) ? found : undefined;
  };

  // ---- Working copies.
  const copies: Copies = new Map();
  const copyOf = (id: string): unknown => {
    let copy = copies.get(id);
    if (!copy) {
      const root = rootOf(id);
      count(jsonSize(root));
      copy = { root: structuredClone(root), stream: isStream(id) };
      copies.set(id, copy);
    }
    return copy.root;
  };
  const current = (place: Where): unknown => {
    let node: unknown = copies.has(place.owner) ? copies.get(place.owner)!.root : rootOf(place.owner);
    for (const key of place.path) node = node === null || typeof node !== 'object' ? undefined : (node as Record<Key, unknown>)[key];
    return node;
  };
  /** The node at `place` in its owner's working copy, made on first change. */
  const writable = (place: Where): Record<Key, unknown> | undefined => {
    let node: unknown = copyOf(place.owner);
    for (const key of place.path) node = node === null || typeof node !== 'object' ? undefined : (node as Record<Key, unknown>)[key];
    return node !== null && typeof node === 'object' ? (node as Record<Key, unknown>) : undefined;
  };
  /** The place of a dictionary value found under `key` at `parent`: its own object when a reference, else inside. */
  const placeOf = (parent: Where, key: Key, value: unknown): Where | undefined => {
    if (isRef(value)) return isDict(rootOf(value)) || Array.isArray(rootOf(value)) ? { owner: value, path: [] } : undefined;
    return value !== null && typeof value === 'object' ? { owner: parent.owner, path: [...parent.path, key] } : undefined;
  };

  // ---- One walk over every object (decision 3), iterative, direct values to `walkDepth`.
  const references = new Map<string, number>(); // bit 1: through /Thumb, 2: a soft mask's /G, 4: anything else
  const resourcePlaces: Where[] = [];
  const shadings: Where[] = [];
  const forms = new Set<string>();
  const patterns = new Set<string>();
  const appearances = new Set<string>();
  const type3Fonts: Where[] = [];
  const annotations: Where[] = [];
  for (const [id, entry] of objects) {
    const root = 'value' in entry ? entry.value : entry.stream.dict;
    if ('stream' in entry) {
      const dict = entry.stream.dict;
      if (isName(dict['/Subtype'], '/Form')) forms.add(id);
      if (dict['/PatternType'] === 1) patterns.add(id);
    }
    const stack: { value: unknown; path: Key[]; depth: number }[] = [{ value: root, path: [], depth: 0 }];
    while (stack.length > 0) {
      const { value, path, depth } = stack.pop()!;
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (isRef(item)) references.set(item, (references.get(item) ?? 0) | 4);
          else if (typeof item === 'object' && item !== null && depth < walkDepth) stack.push({ value: item, path: [...path, index], depth: depth + 1 });
        });
        continue;
      }
      if (!isDict(value)) continue;
      const here: Where = { owner: id, path };
      const softMask = isDict(value) && (value['/S'] === '/Luminosity' || value['/S'] === '/Alpha') && '/G' in value;
      for (const [key, item] of Object.entries(value)) {
        if (isRef(item)) references.set(item, (references.get(item) ?? 0) | (key === '/Thumb' ? 1 : key === '/G' && softMask ? 2 : 4));
        if (key === '/Resources') {
          const place = placeOf(here, key, item);
          if (place && isDict(current(place))) resourcePlaces.push(place);
        }
        if (key === '/AP') {
          const ap = dictAt(item);
          if (ap) {
            for (const state of ['/N', '/R', '/D']) {
              const each = ap[state];
              if (isRef(each) && isStream(each)) appearances.add(each);
              else {
                const states = dictAt(each);
                if (states) for (const one of Object.values(states)) if (isRef(one) && isStream(one)) appearances.add(one);
              }
            }
          }
        }
        if (typeof item === 'object' && item !== null && depth < walkDepth) stack.push({ value: item, path: [...path, key], depth: depth + 1 });
      }
      const shadingType = value['/ShadingType'];
      if (typeof shadingType === 'number' && Number.isInteger(shadingType) && shadingType >= 1 && shadingType <= 7) shadings.push(here);
      if (isName(value['/Subtype'], '/Type3') && '/CharProcs' in value) type3Fonts.push(here);
      if (isName(value['/Type'], '/Annot')) annotations.push(here);
    }
  }

  // ---- Resources dictionaries, each once, and where each /ColorSpace is.
  const resources = new Map<string, Resources>();
  const resourcesAt = (place: Where): string => {
    const key = placeKey(place);
    if (!resources.has(key)) {
      const dict = current(place);
      const spacesValue = isDict(dict) ? dict['/ColorSpace'] : undefined;
      const spaces = spacesValue === undefined ? undefined : placeOf(place, '/ColorSpace', spacesValue);
      resources.set(key, { place, spaces: spaces && isDict(current(spaces)) ? spaces : undefined, locked: false, owned: false });
    }
    return key;
  };
  for (const place of resourcePlaces) resourcesAt(place);
  /** The resources dictionary a stream object or a dictionary holds under /Resources, as a key; undefined without one. */
  const ownResources = (holder: Where): string | undefined => {
    const dict = current(holder);
    if (!isDict(dict) || !('/Resources' in dict)) return undefined;
    const place = placeOf(holder, '/Resources', dict['/Resources']);
    return place && isDict(current(place)) ? resourcesAt(place) : undefined;
  };
  /** A page's effective resources: its own, else inherited up /Parent; undefined when it has none. */
  const pageResources = (pageId: string): string | undefined => {
    let node: Where | undefined = { owner: pageId, path: [] };
    const visited = new Set<string>();
    for (let depth = 0; node && depth < drawDepth; depth++) {
      const dict = current(node);
      if (!isDict(dict)) return undefined;
      if ('/Resources' in dict) return ownResources(node);
      const parent = dict['/Parent'];
      if (!isRef(parent) || visited.has(parent)) return undefined;
      visited.add(parent);
      node = { owner: parent, path: [] };
    }
    return undefined;
  };

  // ---- Kinds of stream.
  const softMaskOnly = new Set([...forms].filter((id) => (references.get(id) ?? 0) === 2));
  const thumbOnly = (id: string) => (references.get(id) ?? 0) === 1;
  /** Type 3 glyph streams, each with its font's own resources (or none). */
  const glyphs = new Map<string, string | undefined>();
  const glyphFonts = new Map<string, Where>();
  for (const font of type3Fonts) {
    const fontDict = current(font) as Dict;
    const own = ownResources(font);
    const procs = dictAt(fontDict['/CharProcs']);
    if (!procs) continue;
    for (const proc of Object.values(procs)) {
      if (!isRef(proc) || !isStream(proc)) continue;
      if (!glyphs.has(proc)) glyphs.set(proc, own);
      glyphFonts.set(proc, font);
    }
  }

  // Locked resources: a soft-mask-only form's own, never changed (its colours become alpha, not colour).
  for (const id of softMaskOnly) {
    const own = ownResources({ owner: id, path: [] });
    if (own) resources.get(own)!.locked = true;
  }
  const lockedSpaces = new Set<string>();
  for (const each of resources.values()) if (each.locked && each.spaces) lockedSpaces.add(placeKey(each.spaces));

  // ---- The drawing streams.
  const drawings = new Map<string, Drawing>();
  const pageResourceKeys: (string | undefined)[] = [];
  const inheritors = new Set<string>();
  const addDrawing = (id: string, own: string | undefined, place: Place, page: number | undefined, content: boolean, left: boolean) => {
    const known = drawings.get(id);
    if (known) {
      if (strictness[place] > strictness[known.place]) known.place = place;
      if (known.page === undefined && page !== undefined) known.page = page;
      known.content ||= content;
      known.left ||= left;
      return;
    }
    drawings.set(id, { id, place, page, own, left, content });
  };
  /** A stream object's own resources, kind and whether it is left before it is read. */
  const streamInfo = (id: string): { own: string | undefined; left: boolean; inherits: boolean } => {
    const own = glyphs.has(id) ? glyphs.get(id) : ownResources({ owner: id, path: [] });
    let left = softMaskOnly.has(id);
    let inherits = false;
    if (own === undefined) {
      // An appearance stream or a tiling pattern with no resources of its own is left: adding some would hide what it finds elsewhere.
      if (appearances.has(id) || patterns.has(id)) left = true;
      if (forms.has(id) || glyphs.has(id) || patterns.has(id)) inherits = true;
    }
    return { own, left, inherits };
  };

  // Content streams, page by page, at their places; then what each page reaches, in page order.
  read.pages.forEach((page, index) => {
    const own = pageResources(page.id);
    pageResourceKeys.push(own);
    if (own) resources.get(own)!.owned = true;
    page.contents.forEach((id, at) => addDrawing(id, own, at < page.contents.length - 1 ? 'not-last' : 'last', index + 1, true, false));
  });
  const reached = new Set<string>();
  const walkedResources = new Set<string>();
  const reachStream = (id: string, page: number | undefined, stack: { resources: string | undefined; depth: number }[], depth: number) => {
    if (reached.has(id)) return;
    reached.add(id);
    const info = streamInfo(id);
    addDrawing(id, info.own, 'alone', page, false, info.left);
    if (info.inherits) inheritors.add(id);
    if (info.own) stack.push({ resources: info.own, depth: depth + 1 });
  };
  // An indirect /Annots array, or an annotation object, shared by many pages is walked once, so the work stays linear.
  const walkedAnnotLists = new Set<string>();
  const walkedAnnotations = new Set<string>();
  const walkFrom = (start: string | undefined, page: number | undefined, annots: unknown) => {
    const stack: { resources: string | undefined; depth: number }[] = [{ resources: start, depth: 0 }];
    // A page's annotations' appearance streams.
    const fresh = !isRef(annots) || !walkedAnnotLists.has(annots);
    if (isRef(annots)) walkedAnnotLists.add(annots);
    const list = fresh ? deref(annots) : undefined;
    if (Array.isArray(list)) {
      for (const item of list) {
        if (isRef(item)) {
          if (walkedAnnotations.has(item)) continue;
          walkedAnnotations.add(item);
        }
        const annotation = dictAt(item);
        const ap = annotation ? dictAt(annotation['/AP']) : undefined;
        if (!ap) continue;
        for (const state of ['/N', '/R', '/D']) {
          const each = ap[state];
          const ids = isRef(each) && isStream(each) ? [each] : Object.values(dictAt(each) ?? {}).filter((one): one is string => isRef(one) && isStream(one));
          for (const id of ids) reachStream(id, page, stack, 0);
        }
      }
    }
    while (stack.length > 0) {
      const { resources: key, depth } = stack.pop()!;
      if (key === undefined || walkedResources.has(key) || depth > drawDepth) continue;
      walkedResources.add(key);
      const dict = current(resources.get(key)!.place) as Dict;
      for (const id of Object.values(dictAt(dict['/XObject']) ?? {})) if (isRef(id) && forms.has(id)) reachStream(id, page, stack, depth);
      for (const id of Object.values(dictAt(dict['/Pattern']) ?? {})) if (isRef(id) && patterns.has(id)) reachStream(id, page, stack, depth);
      for (const value of Object.values(dictAt(dict['/Font']) ?? {})) {
        const font = dictAt(value);
        if (!font || !isName(font['/Subtype'], '/Type3')) continue;
        for (const proc of Object.values(dictAt(font['/CharProcs']) ?? {})) if (isRef(proc) && glyphs.has(proc)) reachStream(proc, page, stack, depth);
      }
    }
  };
  read.pages.forEach((page, index) => walkFrom(pageResourceKeys[index], index + 1, page.dict['/Annots']));
  // Streams no page reaches come last, with no page.
  for (const id of [...forms, ...patterns, ...appearances, ...glyphs.keys()]) if (!softMaskOnly.has(id)) reachStream(id, undefined, [], drawDepth + 1);
  // Soft-mask-only forms with no resources of their own draw with their callers' too: they are left inheritors.
  for (const id of softMaskOnly) if (streamInfo(id).inherits) inheritors.add(id);
  for (const drawing of drawings.values()) if (drawing.own) resources.get(drawing.own)!.owned = true;
  for (const id of softMaskOnly) {
    const own = ownResources({ owner: id, path: [] });
    if (own) resources.get(own)!.owned = true;
  }
  // A stream owning a locked dictionary is left (no stand-in name can be added there); so is a form or Type 3 font
  // without resources of its own that a soft-mask-only form can draw (it would draw with the locked dictionary).
  for (const drawing of drawings.values()) if (drawing.own && resources.get(drawing.own)!.locked) drawing.left = true;
  for (const each of resources.values()) {
    if (!each.locked) continue;
    const dict = current(each.place) as Dict;
    for (const id of Object.values(dictAt(dict['/XObject']) ?? {})) if (isRef(id) && inheritors.has(id) && drawings.has(id)) drawings.get(id)!.left = true;
    for (const value of Object.values(dictAt(dict['/Font']) ?? {})) {
      const font = dictAt(value);
      for (const proc of Object.values(dictAt(font?.['/CharProcs']) ?? {})) if (isRef(proc) && inheritors.has(proc) && drawings.has(proc)) drawings.get(proc)!.left = true;
    }
  }

  // ---- Colour space dictionaries and the names already used in them.
  const spaceOwners = new Map<string, { place: Where; resources: Set<string> }>();
  for (const [key, each] of resources) {
    if (!each.spaces) continue;
    const spacesKey = placeKey(each.spaces);
    if (!spaceOwners.has(spacesKey)) spaceOwners.set(spacesKey, { place: each.spaces, resources: new Set() });
    spaceOwners.get(spacesKey)!.resources.add(key);
  }
  // The AcroForm, its /DR, and the catalog.
  const catalogs = [...objects.keys()].filter((id) => isName((rootOf(id) as Dict | undefined)?.['/Type'], '/Catalog') && !isStream(id));
  const acroForms: Where[] = [];
  for (const id of catalogs) {
    const place = placeOf({ owner: id, path: [] }, '/AcroForm', (rootOf(id) as Dict)['/AcroForm']);
    if (place && isDict(current(place))) acroForms.push(place);
  }
  const defaultResources: Where[] = [];
  for (const form of acroForms) {
    const dr = placeOf(form, '/DR', (current(form) as Dict)['/DR']);
    if (dr && isDict(current(dr))) defaultResources.push(dr);
  }
  const usedNames = new Set<string>();
  for (const { place } of spaceOwners.values()) for (const key of Object.keys(current(place) as Dict)) usedNames.add(key);
  for (const dr of defaultResources) {
    const spaces = dictAt((current(dr) as Dict)['/ColorSpace']);
    if (spaces) for (const key of Object.keys(spaces)) usedNames.add(key);
  }
  const freeName = (base: string) => {
    let name = `/${base}`;
    for (let suffix = 1; usedNames.has(name); suffix++) name = `/${base}${suffix}`;
    usedNames.add(name);
    return name;
  };
  const names = { rgb: freeName('GreyRGB'), cmyk: freeName('GreyCMYK') };

  // ---- ICC profiles: which can be read, and their data space, read in the first raw batches.
  const profileCandidates = new Map<string, number>();
  const noteProfile = (value: unknown, depth = 0) => {
    const space = deref(value);
    if (!Array.isArray(space) || depth > 1) return;
    if (space[0] === '/ICCBased' && space.length === 2 && isRef(space[1]) && isStream(space[1])) {
      const dict = (objects.get(space[1]) as { stream: { dict: Dict } }).stream.dict;
      const n = deref(dict['/N']);
      if ((n === 3 || n === 4) && unitRange(deref(dict['/Range']), n) && !profileRefusedKeys.some((key) => key in dict)) {
        const filter = dict['/Filter'];
        if (filter === undefined || loneFlate(filter)) profileCandidates.set(space[1], n);
      }
    }
    if ((space[0] === '/Indexed' && space.length === 4) || (space[0] === '/Pattern' && space.length === 2)) noteProfile(space[1], depth + 1);
  };
  const imageSites: Where[] = [];
  for (const [id, entry] of objects) {
    if (!('stream' in entry)) continue;
    const dict = entry.stream.dict;
    if (!isName(dict['/Subtype'], '/Image') || dict['/ImageMask'] === true || thumbOnly(id)) continue;
    const filter = deref(dict['/Filter']);
    if (filter === '/JPXDecode' || (Array.isArray(filter) && filter.includes('/JPXDecode'))) continue;
    if (!('/ColorSpace' in dict)) continue;
    imageSites.push({ owner: id, path: [] });
  }
  for (const site of [...imageSites, ...shadings]) noteProfile((current(site) as Dict)['/ColorSpace']);
  for (const { place } of spaceOwners.values()) for (const [key, value] of Object.entries(current(place) as Dict)) if (!key.startsWith('/Default')) noteProfile(value);

  // ---- The drawing streams in order: the first page reaching each, those no page reaches last.
  const order = [...drawings.values()]
    .filter((drawing) => !drawing.left)
    .sort((a, b) => (a.page ?? Number.POSITIVE_INFINITY) - (b.page ?? Number.POSITIVE_INFINITY));
  const statedLength = (id: string): number | undefined => {
    const entry = objects.get(id);
    const length = entry && 'stream' in entry ? deref(entry.stream.dict['/Length']) : undefined;
    return typeof length === 'number' && Number.isFinite(length) && length >= 0 ? length : undefined;
  };
  const batches = rawBatches(
    [...profileCandidates.keys(), ...order.map((drawing) => drawing.id)].map((id) => ({ id, length: statedLength(id) })),
    undefined,
    limits.batchIds,
  );

  // ---- Sorting colour spaces (decision 3), once the profiles' data spaces are known.
  const profileSpace = new Map<string, string>();
  const baseOf = (value: unknown): Base | null => {
    const space = deref(value);
    if (space === '/DeviceRGB') return 'rgb';
    if (space === '/DeviceCMYK') return 'cmyk';
    if (!Array.isArray(space)) return null;
    if (space[0] === '/CalRGB' && space.length === 2 && isDict(deref(space[1]))) return 'rgb';
    if (space[0] === '/ICCBased' && space.length === 2 && isRef(space[1])) {
      const n = profileCandidates.get(space[1]);
      const data = profileSpace.get(space[1]);
      if (n === 3 && data === 'RGB ') return 'rgb';
      if (n === 4 && data === 'CMYK') return 'cmyk';
    }
    return null;
  };
  const sort = (value: unknown): Sorted => {
    const direct = baseOf(value);
    if (direct) return { kind: 'direct', base: direct };
    const space = deref(value);
    if (!Array.isArray(space)) return null;
    if (space[0] === '/Indexed' && space.length === 4) {
      const base = baseOf(space[1]);
      if (base) return { kind: 'indexed', base, array: space, key: isRef(value) ? value : JSON.stringify(space) };
    }
    if (space[0] === '/Pattern' && space.length === 2) {
      const base = baseOf(space[1]);
      if (base) return { kind: 'pattern', base, array: space, key: isRef(value) ? value : JSON.stringify(space) };
    }
    return null;
  };

  // ---- Reading the streams.
  const outcomes = new Map<string, Outcome>();
  const pageSums = new Array<number>(total).fill(0);
  const contentPages = new Map<string, number[]>();
  read.pages.forEach((page, index) => {
    for (const id of new Set(page.contents)) {
      if (!contentPages.has(id)) contentPages.set(id, []);
      contentPages.get(id)!.push(index);
    }
  });
  // Eligibility from dictionaries only (decision 3), known once profiles are read: per colour space dictionary, not
  // per resources dictionary, so many dictionaries sharing one /ColorSpace cost one pass over its entries.
  /** The starting colour a direct entry needs once repointed: RGB (three zeros) or ICC CMYK (four zeros); else none. */
  const startOf = (value: unknown): Start | undefined => {
    const sorted = sort(value);
    if (sorted === null || sorted.kind !== 'direct') return undefined;
    if (sorted.base === 'rgb') return 'rgb';
    const space = deref(value);
    return Array.isArray(space) && space[0] === '/ICCBased' ? 'cmyk' : undefined;
  };
  const spacesStarts = new Map<string, Map<string, Start>>();
  /** A colour space dictionary's entries that need a starting colour, once per dictionary. */
  const startsIn = (spaces: Where): Map<string, Start> => {
    const key = placeKey(spaces);
    let starts = spacesStarts.get(key);
    if (!starts) {
      starts = new Map();
      for (const [name, value] of Object.entries(current(spaces) as Dict)) {
        if (name.startsWith('/Default')) continue;
        const start = startOf(value);
        if (start) starts.set(name, start);
      }
      spacesStarts.set(key, starts);
    }
    return starts;
  };
  let inherited: Map<string, Start> | undefined;
  /** For a stream with no resources of its own: names every owned dictionary holding them gives the same start. */
  const inheritedStarts = (): Map<string, Start> => {
    if (inherited) return inherited;
    const agreed = new Map<string, Start | null>();
    const seen = new Set<string>();
    for (const each of resources.values()) {
      if (!each.owned || !each.spaces) continue;
      const key = placeKey(each.spaces);
      if (seen.has(key)) continue;
      seen.add(key);
      const starts = startsIn(each.spaces);
      for (const name of Object.keys(current(each.spaces) as Dict)) {
        if (name.startsWith('/Default')) continue;
        const start = starts.get(name) ?? null;
        const before = agreed.get(name);
        agreed.set(name, before === undefined ? start : before === start ? start : null);
      }
    }
    inherited = new Map([...agreed].filter((entry): entry is [string, Start] => entry[1] !== null));
    return inherited;
  };
  const eligibleFor = (drawing: Drawing): Eligible => {
    const spaces = drawing.own === undefined ? undefined : resources.get(drawing.own)!.spaces;
    const starts = drawing.own === undefined ? inheritedStarts() : spaces ? startsIn(spaces) : new Map<string, Start>();
    return (name) => starts.get(name);
  };

  /** One drawing stream decoded, read and edited (decision 4); a stream or a page past the cap stops the job. */
  const readOne = (drawing: Drawing, raw: Uint8Array): Outcome => {
    const dict = (objects.get(drawing.id) as { stream: { dict: Dict } }).stream.dict;
    const decoded = decodeContent(raw, dict, resolve, Inflate, spend);
    if (decoded.kind === 'not-decoded') return { status: 'left' };
    if (decoded.kind === 'too-large' || decoded.data.length > limits.maxContentBytes) {
      // qpdf's check reads a page's content whole, so a page cannot keep it; a stream no page reaches is left.
      if (drawing.page !== undefined) throw new PageTooLarge(drawing.page);
      return { status: 'left' };
    }
    for (const index of contentPages.get(drawing.id) ?? []) {
      pageSums[index]! += decoded.data.length;
      if (pageSums[index]! > limits.maxContentBytes) throw new PageTooLarge(index + 1);
    }
    const uses: Uses = { rgb: false, cmyk: false };
    const result = editContent(decoded.data, colourEditor(names, eligibleFor(drawing), uses), drawing.place, spend);
    if (result.kind === 'doubt') return { status: 'left' };
    if (result.kind === 'unchanged') return { status: 'unchanged' };
    const data = zlibDeflate(result.data, Deflate);
    count(data.length);
    dataBytes += data.length;
    return { status: 'edited', data, counts: result.edits > 0, uses };
  };
  let next = 0;
  let batchIndex = 0;
  let pagesDone = 0;
  const reportUpTo = (page: number) => {
    while (pagesDone < page) onPage(++pagesDone, total);
  };
  const passwordArgs: string[] = [];
  for await (const batch of readRawStreams(() => freshQpdf(tools, plain), passwordArgs, batches)) {
    // The ids this batch was asked for: one qpdf could not read gives nothing, and its streams are left.
    const asked = new Set(batches[batchIndex++]);
    // Profiles come first: their data space, from the first 20 bytes.
    for (const [id] of profileCandidates) {
      const raw = batch.get(id);
      if (!raw) continue;
      batch.delete(id);
      const dict = (objects.get(id) as { stream: { dict: Dict } }).stream.dict;
      const head = dict['/Filter'] === undefined ? (raw.length >= 20 ? raw.subarray(0, 20) : undefined) : inflatePrefix(raw, Inflate, 20);
      if (head && head.length >= 20) profileSpace.set(id, String.fromCharCode(...head.subarray(16, 20)));
    }
    while (next < order.length && asked.has(order[next]!.id)) {
      const drawing = order[next++]!;
      const raw = batch.get(drawing.id);
      batch.delete(drawing.id);
      outcomes.set(drawing.id, raw ? readOne(drawing, raw) : { status: 'left' });
      const following = order[next];
      if (drawing.page !== undefined && (following === undefined || following.page !== drawing.page)) reportUpTo(drawing.page);
    }
  }
  // A stream qpdf did not give is left.
  for (const drawing of order) if (!outcomes.has(drawing.id)) outcomes.set(drawing.id, { status: 'left' });
  for (const drawing of drawings.values()) if (drawing.left) outcomes.set(drawing.id, { status: 'left' });

  // Every content stream of a page is left when any is, and a shared one for every page that uses it: a worklist
  // over streams and pages, each page taken once, so the work is linear however the pages share streams.
  const pagesTaken = new Set<number>();
  const work = [...contentPages.keys()].filter((id) => outcomes.get(id)?.status === 'left');
  while (work.length > 0) {
    const id = work.pop()!;
    for (const index of contentPages.get(id) ?? []) {
      if (pagesTaken.has(index)) continue;
      pagesTaken.add(index);
      for (const other of read.pages[index]!.contents) {
        if (outcomes.get(other)?.status === 'left') continue;
        outcomes.set(other, { status: 'left' });
        work.push(other);
      }
    }
  }
  reportUpTo(total);

  // ---- The stand-ins and the new arrays, made only when used.
  let nextId = read.max + 1;
  const created: { id: string; entry: unknown }[] = [];
  /** A new object, counted against the update's size as it is made. */
  const create = (id: string, entry: unknown) => {
    count(id.length + jsonSize(entry));
    created.push({ id, entry });
  };
  const standIns: Partial<Record<Base, string>> = {};
  const standIn = (base: Base): string => {
    let id = standIns[base];
    if (!id) {
      const functionId = `${nextId++} 0 R`;
      id = `${nextId++} 0 R`;
      const rgb = base === 'rgb';
      const program = new TextEncoder().encode(rgb ? rgbFunction : cmykFunction);
      create(functionId, { stream: { dict: { '/FunctionType': 4, '/Domain': rgb ? [0, 1, 0, 1, 0, 1] : [0, 1, 0, 1, 0, 1, 0, 1], '/Range': [0, 1] }, data: base64(program) } });
      create(id, { value: ['/DeviceN', rgb ? ['/GreyR', '/GreyG', '/GreyB'] : ['/GreyC', '/GreyM', '/GreyY', '/GreyK'], '/DeviceGray', functionId] });
      standIns[base] = id;
    }
    return id;
  };
  const arrays = new Map<string, string>();
  /** The value a use site of `sorted` gets: the stand-in, or one new indexed or pattern array per distinct original. */
  const replacement = (sorted: NonNullable<Sorted>): string => {
    const base = standIn(sorted.base);
    if (sorted.kind === 'direct') return base;
    let id = arrays.get(sorted.key);
    if (!id) {
      id = `${nextId++} 0 R`;
      const array = sorted.kind === 'indexed' ? ['/Indexed', base, sorted.array[2], sorted.array[3]] : ['/Pattern', base];
      create(id, { value: array });
      arrays.set(sorted.key, id);
    }
    return id;
  };

  let turned = false;
  // Pictures and shadings, in their own dictionaries, whatever draws them.
  for (const site of [...imageSites, ...shadings]) {
    const sorted = sort((current(site) as Dict)['/ColorSpace']);
    if (!sorted) continue;
    writable(site)!['/ColorSpace'] = replacement(sorted);
    turned = true;
  }

  // ---- Named entries (decision 3, step 5): DeviceCMYK, indexed and pattern always; a direct entry whose start
  // differs from the stand-in's (RGB, and ICC CMYK, which starts white) only when every stream that can select it
  // was edited. inheritorsLeft is file-wide: one left stream with no resources of its own blocks such names in
  // every dictionary, which is over-cautious and safe.
  const inheritorsLeft = [...inheritors].some((id) => outcomes.get(id)?.status === 'left' || !outcomes.has(id));
  const streamsOwning = new Map<string, string[]>();
  for (const drawing of drawings.values()) {
    if (!drawing.own) continue;
    if (!streamsOwning.has(drawing.own)) streamsOwning.set(drawing.own, []);
    streamsOwning.get(drawing.own)!.push(drawing.id);
  }
  read.pages.forEach((page, index) => {
    const own = pageResourceKeys[index];
    if (!own) return;
    if (!streamsOwning.has(own)) streamsOwning.set(own, []);
    streamsOwning.get(own)!.push(...page.contents);
  });
  const inheritedNow = inheritedStarts();
  // A name's entries needing a start are repointed only if every dictionary holding one allows it, so a left stream
  // never selects a stand-in that starts differently by that name.
  const startBlocked = new Set<string>();
  const startEntries: { spaces: Where; name: string }[] = [];
  for (const [spacesKey, owner] of spaceOwners) {
    const keys = [...owner.resources];
    const locked = lockedSpaces.has(spacesKey) || keys.some((key) => resources.get(key)!.locked);
    const owned = keys.filter((key) => resources.get(key)!.owned);
    // Once per colour space dictionary, before its names.
    const streamsOk = owned.every((key) => (streamsOwning.get(key) ?? []).every((id) => outcomes.get(id)?.status !== 'left'));
    const starts = startsIn(owner.place);
    for (const [name, value] of Object.entries(current(owner.place) as Dict)) {
      if (name.startsWith('/Default')) continue;
      const sorted = sort(value);
      if (!sorted) continue;
      const start = starts.get(name);
      if (!start) {
        if (locked) continue;
        writable(owner.place)![name] = replacement(sorted);
        turned = true;
        continue;
      }
      if (locked) {
        startBlocked.add(name);
        continue;
      }
      if (owned.length === 0) continue;
      const inheritOk = inheritors.size === 0 || (inheritedNow.get(name) === start && !inheritorsLeft);
      if (!streamsOk || !inheritOk) startBlocked.add(name);
      else startEntries.push({ spaces: owner.place, name });
    }
  }
  for (const { spaces, name } of startEntries) {
    if (startBlocked.has(name)) continue;
    const sorted = sort((current(spaces) as Dict)[name]);
    if (!sorted) continue;
    writable(spaces)![name] = replacement(sorted);
    turned = true;
  }

  // ---- Colours readers draw notes, fields and bookmarks with, and /DA strings.
  const visitedAnnotations = new Set<string>();
  const annotationPlaces: Where[] = [...annotations];
  // A shared indirect /Annots array is listed once, and an annotation reached through many is listed once.
  const listedAnnotLists = new Set<string>();
  const listedAnnotations = new Set<string>(annotations.filter((place) => place.path.length === 0).map((place) => place.owner));
  for (const page of read.pages) {
    const annots = page.dict['/Annots'];
    if (isRef(annots)) {
      if (listedAnnotLists.has(annots)) continue;
      listedAnnotLists.add(annots);
    }
    const listPlace = placeOf({ owner: page.id, path: [] }, '/Annots', annots);
    const list = listPlace ? current(listPlace) : undefined;
    if (!listPlace || !Array.isArray(list)) continue;
    list.forEach((item, index) => {
      if (isRef(item)) {
        if (listedAnnotations.has(item)) return;
        listedAnnotations.add(item);
      }
      const place = placeOf(listPlace, index, item);
      if (place && isDict(current(place))) annotationPlaces.push(place);
    });
  }
  /** A /DA string's rg or k made a g; one read with doubt is left. */
  const editDa = (place: Where) => {
    const bytes = stringBytes(deref((current(place) as Dict)['/DA']));
    if (!bytes) return;
    const result = editContent(bytes, appearanceEditor(), 'alone', spend);
    if (result.kind !== 'edited' || result.edits === 0) return;
    const text = daString(result.data);
    count(text.length);
    writable(place)!['/DA'] = text;
    turned = true;
  };
  const setColour = (place: Where, key: string) => {
    const value = deref((current(place) as Dict)[key]);
    const neutral = neutralColour(value);
    if (!neutral) return;
    writable(place)![key] = neutral;
    turned = true;
  };
  for (const place of annotationPlaces) {
    const key = placeKey(place);
    if (visitedAnnotations.has(key)) continue;
    visitedAnnotations.add(key);
    setColour(place, '/C');
    setColour(place, '/IC');
    // A note's own /DA (a free text note's text colour when a reader draws it again), as a field's.
    editDa(place);
    const mk = placeOf(place, '/MK', (current(place) as Dict)['/MK']);
    if (mk && isDict(current(mk))) {
      setColour(mk, '/BG');
      setColour(mk, '/BC');
    }
  }
  // Bookmarks: the outline tree from each catalog, iterative, each item once.
  const seenItems = new Set<string>();
  for (const id of catalogs) {
    const outlines = dictAt((rootOf(id) as Dict)['/Outlines']);
    const stack: unknown[] = outlines ? [outlines['/First']] : [];
    while (stack.length > 0 && seenItems.size < treeLimit) {
      const item = stack.pop();
      if (!isRef(item) || seenItems.has(item) || !isDict(rootOf(item))) continue;
      seenItems.add(item);
      const place = { owner: item, path: [] };
      const value = deref((current(place) as Dict)['/C']);
      if (Array.isArray(value) && value.length === 3) setColour(place, '/C');
      const dict = rootOf(item) as Dict;
      stack.push(dict['/Next'], dict['/First']);
    }
  }
  // /DA strings: the AcroForm's, and every field's and widget's through the whole /Fields tree.
  const seenFields = new Set<string>();
  for (const form of acroForms) {
    editDa(form);
    const fields = deref((current(form) as Dict)['/Fields']);
    const stack: { place: Where; depth: number }[] = [];
    const pushAll = (list: unknown, parent: Where, key: string, depth: number) => {
      const listPlace = placeOf(parent, key, list);
      const items = listPlace ? current(listPlace) : undefined;
      if (!listPlace || !Array.isArray(items) || depth > walkDepth) return;
      items.forEach((item, index) => {
        const place = placeOf(listPlace, index, item);
        if (place) stack.push({ place, depth });
      });
    };
    if (Array.isArray(fields)) pushAll((current(form) as Dict)['/Fields'], form, '/Fields', 0);
    while (stack.length > 0 && seenFields.size < treeLimit) {
      const { place, depth } = stack.pop()!;
      const key = placeKey(place);
      if (seenFields.has(key) || !isDict(current(place))) continue;
      seenFields.add(key);
      editDa(place);
      pushAll((current(place) as Dict)['/Kids'], place, '/Kids', depth + 1);
    }
  }

  // ---- The streams that count.
  const streams = new Map<string, { dict: Dict; data: Uint8Array }>();
  let usesRgb = false;
  let usesCmyk = false;
  for (const outcome of outcomes.values()) if (outcome.status === 'edited' && outcome.counts) turned = true;
  if (!turned) return null;
  for (const [id, outcome] of outcomes) {
    if (outcome.status !== 'edited') continue;
    usesRgb ||= outcome.uses.rgb;
    usesCmyk ||= outcome.uses.cmyk;
    streams.set(id, { dict: (objects.get(id) as { stream: { dict: Dict } }).stream.dict, data: outcome.data });
  }

  // ---- The stand-in names wherever a rewritten operator may be drawn: every resources dictionary in force,
  // each page's (a page with none gets one), and the AcroForm's /DR; never a soft-mask-only form's.
  const additions: [string, string][] = [];
  if (usesRgb) additions.push([names.rgb, standIn('rgb')]);
  if (usesCmyk) additions.push([names.cmyk, standIn('cmyk')]);
  if (additions.length > 0) {
    const targets: Where[] = [];
    for (const each of resources.values()) if (each.owned && !each.locked) targets.push(each.place);
    targets.push(...defaultResources);
    // A dictionary holding only the names, made once and shared by every target with no /ColorSpace and every page
    // with no resources; and one new dictionary per distinct /ColorSpace shared with a soft-mask-only form (its
    // entries and the names), never a copy per target.
    let namesOnly: string | undefined;
    const namesDictionary = () => {
      if (!namesOnly) {
        namesOnly = `${nextId++} 0 R`;
        create(namesOnly, { value: Object.fromEntries(additions) });
      }
      return namesOnly;
    };
    const lockedCopies = new Map<string, string>();
    const done = new Set<string>();
    for (const place of targets) {
      const key = placeKey(place);
      if (done.has(key)) continue;
      done.add(key);
      const dict = current(place) as Dict;
      const spaces = dict['/ColorSpace'] === undefined ? undefined : placeOf(place, '/ColorSpace', dict['/ColorSpace']);
      const spacesDict = spaces ? current(spaces) : undefined;
      if (spaces && isDict(spacesDict) && !lockedSpaces.has(placeKey(spaces))) {
        const target = writable(spaces)!;
        for (const [name, id] of additions) target[name] = id;
      } else if (spaces && isDict(spacesDict)) {
        const spacesKey = placeKey(spaces);
        let id = lockedCopies.get(spacesKey);
        if (!id) {
          id = `${nextId++} 0 R`;
          create(id, { value: { ...structuredClone(spacesDict), ...Object.fromEntries(additions) } });
          lockedCopies.set(spacesKey, id);
        }
        writable(place)!['/ColorSpace'] = id;
      } else {
        writable(place)!['/ColorSpace'] = namesDictionary();
      }
    }
    for (const [index, page] of read.pages.entries()) {
      if (pageResourceKeys[index] !== undefined) continue;
      const dict = writable({ owner: page.id, path: [] })!;
      const added = { '/ColorSpace': namesDictionary() };
      count(jsonSize(added));
      dict['/Resources'] = added;
    }
  }

  // Each page's stored thumbnail is removed now a file is made.
  for (const page of read.pages) if ('/Thumb' in (current({ owner: page.id, path: [] }) as Dict)) delete writable({ owner: page.id, path: [] })!['/Thumb'];
  // Each rewritten stream: its dictionary as changed above (its own resources may hold new entries), its data deflated.
  for (const [id, stream] of streams) {
    const copy = copies.get(id);
    const dict: Dict = { ...(copy ? (copy.root as Dict) : stream.dict), '/Filter': '/FlateDecode' };
    for (const key of ['/DecodeParms', '/DL', '/Length']) delete dict[key];
    stream.dict = dict;
    copies.delete(id);
  }
  return { max: nextId - 1, limit, used: dataBytes, created, copies, streams };
}

/** The engine, with the limits given; tests pass small ones. */
export function makeRun(given: Partial<Limits> = {}): Engine<Options> {
  const limits: Limits = { sizeLimit, contentBudget, maxContentBytes, batchIds, ...given };
  return async (files, options, onProgress, tools) => {
    const file = files[0];
    if (!file || files.length !== 1) throw new Error('Grayscale PDF takes one file.');
    onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    // The plain copy is handed over in an object and read only through it, so it can be let go once qpdf holds it.
    const source: PlainSource = { plain: (await plainCopy(tools, file, passwordFrom(options))).plain };
    const changes = await changesFor(tools, source.plain!, limits, (done, total) => onProgress({ stage: 'working', unit: 'page', done, total, writesAfter: true } satisfies Progress));
    if (!changes) return [];

    const qpdf = await freshQpdf(tools, source.plain!);
    delete source.plain;
    const encoder = new TextEncoder();
    // The update's text and its data files together are held to the limit.
    let appended = changes.used;
    const append = (text: string) => {
      const bytes = encoder.encode(text);
      appended += bytes.length;
      if (appended > changes.limit) throw new OutputLimit();
      qpdf.append('/update.json', bytes);
    };
    let first = true;
    const entry = (id: string, value: unknown) => {
      append(`${first ? '' : ','}${entryText(id, value)}`);
      first = false;
    };
    append(opening(changes.max));
    for (const { id, entry: value } of changes.created) entry(id, value);
    for (const [id, { root, stream }] of changes.copies) {
      // A stream whose data is unchanged is given its dictionary alone; qpdf keeps its data.
      entry(id, stream ? { stream: { dict: root } } : { value: root });
      changes.copies.delete(id);
    }
    qpdf.mkdir('/upd');
    let index = 0;
    for (const [id, { dict, data }] of changes.streams) {
      const datafile = `/upd/${index++}`;
      qpdf.write(datafile, data);
      entry(id, { stream: { dict, datafile } });
      changes.streams.delete(id);
    }
    append('}]}');
    // The pages fill the bar to 0.8; qpdf's write is reported from 75% (0.8 of the bar) and held at 95% until the check is done.
    const output = writePageUpdate(qpdf, changes.limit, (percent) => onProgress({ stage: 'writing', percent: Math.min(75 + percent / 5, 95) }));
    onProgress({ stage: 'writing', percent: 100 });
    return [output];
  };
}

export const run: Engine<Options> = makeRun();

export const inspect: Inspector = inspectPdf;
