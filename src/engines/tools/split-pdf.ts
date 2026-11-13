// Split PDF: cuts one PDF into several, at the points the visitor marked, or
// one file per page when no cut is marked.
//
// By the owner's decisions of 12 Nov 2026:
// - each part keeps only the bookmarks that point to its own pages;
// - files attached to the document go with the first part only;
// - parts have no password and no restrictions.
//
// The input is first copied once, decrypted and without object streams. Each
// part is then written by a fresh qpdf from that copy, because one instance
// breaks after a few hundred calls. The copy is the primary file, so form fields, links and
// metadata are kept; a JSON update applied in the same call rewrites the
// outline and, for later parts, drops the attached files. The outline is read
// once, from the input. Bookmark titles and other document text are never put
// into a log, an error message or a failure.

import { inspectPdf } from '../inspect';
import { finished, qpdfFrom, saidInvalidPassword, type Qpdf } from '../qpdf';
import type { Engine, EngineTools, Inspector } from '../types';
import { TooBigForZip, zipMaxBytes, zipMaxFiles } from '../../widget/zip-limits';

type Options = { passwords?: unknown; cuts?: unknown };
type Part = { first: number; last: number };

/**
 * The runs of pages between cuts, in order; one per page when there are no
 * cuts. A cut after page N ends a part at N. Cuts must be sorted, unique whole
 * numbers from 1 to pages - 1.
 */
export function parts(pages: number, cuts: readonly number[]): Part[] {
  if (!Number.isInteger(pages) || pages < 1) throw new Error('The file has no pages.');
  if (cuts.length === 0)
    return Array.from({ length: pages }, (_, index) => ({
      first: index + 1,
      last: index + 1,
    }));
  let previous = 0;
  for (const cut of cuts) {
    if (!Number.isInteger(cut) || cut <= previous || cut >= pages) throw new Error('The cuts are not valid.');
    previous = cut;
  }
  const result: Part[] = [];
  let first = 1;
  for (const cut of cuts) {
    result.push({ first, last: cut });
    first = cut + 1;
  }
  result.push({ first, last: pages });
  return result;
}

/** How many parts a job gives, without making the list: for the zip check before any work. */
export function partCount(pages: number, cuts: readonly number[]): number {
  return cuts.length === 0 ? pages : cuts.length + 1;
}

// ---------------------------------------------------------------------------
// Outlines

/** One bookmark, as read from qpdf: its object, the page it points to (or none), whether it is open, and its children. */
export type OutlineItem = {
  object: string;
  page: number | null;
  open: boolean;
  kids: OutlineItem[];
};

/** qpdf's JSON stops at about 50 levels without saying so; the engine stops before that. */
export const outlineDepthLimit = 48;

/**
 * Reads qpdf's `outlines` JSON into items, with no titles. An item at the
 * depth limit is kept with no children, so whatever lies below it is dropped
 * when the part's links are written. Gives null when the shape is not what
 * qpdf writes or an object is met twice, so the caller drops the whole outline.
 */
export function readOutline(json: unknown): OutlineItem[] | null {
  const seen = new Set<string>();
  const ref = /^\d+ \d+ R$/;
  const walk = (list: unknown, depth: number): OutlineItem[] | null => {
    if (!Array.isArray(list)) return null;
    // Past the limit, children are not read; the item above keeps none.
    if (depth > outlineDepthLimit) return [];
    const items: OutlineItem[] = [];
    for (const raw of list) {
      if (typeof raw !== 'object' || raw === null) return null;
      const { object, destpageposfrom1: page, open, kids } = raw as Record<string, unknown>;
      if (typeof object !== 'string' || !ref.test(object) || seen.has(object)) return null;
      seen.add(object);
      const children = walk(kids, depth + 1);
      if (!children) return null;
      items.push({
        object,
        page: Number.isInteger(page) && (page as number) > 0 ? (page as number) : null,
        open: open !== false,
        kids: children,
      });
    }
    return items;
  };
  return walk(json, 1);
}

/**
 * The bookmarks a part keeps: those that point to a page from `first` to
 * `last`. A dropped bookmark's kept children move up to its place.
 */
export function keptOutline(outline: readonly OutlineItem[], first: number, last: number): OutlineItem[] {
  return outline.flatMap((item) => {
    const kids = keptOutline(item.kids, first, last);
    return item.page !== null && item.page >= first && item.page <= last ? [{ ...item, kids }] : kids;
  });
}

/** How many items show under these when the open ones are open, as /Count counts them. */
function shown(items: readonly OutlineItem[]): number {
  return items.reduce((sum, item) => sum + 1 + (item.open ? shown(item.kids) : 0), 0);
}

type Dict = Record<string, unknown>;
const isRef = (value: unknown): value is string => typeof value === 'string' && /^\d+ \d+ R$/.test(value);
const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

/** What is read once from the input to build each part's update. */
export type Structure = {
  maxObjectId: number;
  catalogId: string;
  catalog: Dict;
  /** The outline root's object, when the catalog points to one. */
  rootId: string | null;
  root: Dict | null;
  /** The /Names object, when it is an object of its own. */
  namesId: string | null;
  names: Dict | null;
  /** Each bookmark's dictionary, by object. */
  items: Map<string, Dict>;
  /** The outline, or null when it is to be dropped whole. */
  outline: OutlineItem[] | null;
};

const outlineTypes = new Set(['/Catalog', '/Page', '/Pages', '/Outlines']);

/**
 * Whether the outline can be rewritten safely: every item has a dictionary,
 * and none is the catalog, a page, the outline root or the /Names object.
 * A crafted outline that points there would get that object rewritten.
 */
export function outlineIsSafe(structure: Omit<Structure, 'outline'>, outline: readonly OutlineItem[]): boolean {
  const reserved = new Set([structure.catalogId, structure.rootId, structure.namesId].filter((id): id is string => id !== null));
  const check = (items: readonly OutlineItem[]): boolean =>
    items.every((item) => {
      const dict = structure.items.get(item.object);
      if (!dict || reserved.has(item.object)) return false;
      if (typeof dict['/Type'] === 'string' && outlineTypes.has(dict['/Type'])) return false;
      // An outline item has a title and a parent; a name tree, a file specification or an embedded file does not look like one.
      if (!('/Title' in dict) || !isRef(dict['/Parent'])) return false;
      // (/F on an outline item is its style, so it is not among these.)
      if (['/Names', '/Kids', '/Limits', '/EF', '/UF', '/Filter', '/Length'].some((key) => key in dict)) return false;
      return check(item.kids);
    });
  return check(outline);
}

/**
 * The objects a part's update rewrites, as whole dictionaries in the input's
 * object numbers, or an empty map when nothing changes. Every kept bookmark's
 * links are written afresh, so a bookmark whose children qpdf did not report
 * keeps none of them.
 */
export function partUpdate(structure: Structure, part: Part, isFirst: boolean): Map<string, Dict> {
  const update = new Map<string, Dict>();
  const catalog: Dict = { ...structure.catalog };
  let catalogChanged = false;

  if (structure.rootId !== null || '/Outlines' in catalog) {
    const kept = structure.outline ? keptOutline(structure.outline, part.first, part.last) : [];
    if (kept.length === 0 || !structure.rootId || !structure.root) {
      delete catalog['/Outlines'];
      catalogChanged = true;
    } else {
      const link = (items: OutlineItem[], parent: string) => {
        items.forEach((item, index) => {
          const original = structure.items.get(item.object);
          if (!original) throw new Error('A bookmark could not be read.');
          const dict: Dict = { ...original };
          for (const key of ['/First', '/Last', '/Count', '/Prev', '/Next']) delete dict[key];
          dict['/Parent'] = parent;
          if (index > 0) dict['/Prev'] = items[index - 1]!.object;
          if (index < items.length - 1) dict['/Next'] = items[index + 1]!.object;
          if (item.kids.length > 0) {
            dict['/First'] = item.kids[0]!.object;
            dict['/Last'] = item.kids[item.kids.length - 1]!.object;
            dict['/Count'] = item.open ? shown(item.kids) : -shown(item.kids);
            link(item.kids, item.object);
          }
          update.set(item.object, dict);
        });
      };
      link(kept, structure.rootId);
      const root: Dict = { ...structure.root };
      root['/First'] = kept[0]!.object;
      root['/Last'] = kept[kept.length - 1]!.object;
      root['/Count'] = shown(kept);
      update.set(structure.rootId, root);
    }
  }

  if (!isFirst) {
    if ('/AF' in catalog) {
      delete catalog['/AF'];
      catalogChanged = true;
    }
    if (structure.namesId && structure.names && '/EmbeddedFiles' in structure.names) {
      const names: Dict = { ...structure.names };
      delete names['/EmbeddedFiles'];
      update.set(structure.namesId, names);
    } else if (isDict(catalog['/Names']) && '/EmbeddedFiles' in catalog['/Names']) {
      const names: Dict = { ...catalog['/Names'] };
      delete names['/EmbeddedFiles'];
      catalog['/Names'] = names;
      catalogChanged = true;
    }
  }

  if (catalogChanged) update.set(structure.catalogId, catalog);
  return update;
}

/** The text of qpdf's --update-from-json file, always built from objects. */
export function updateJson(maxObjectId: number, update: Map<string, Dict>): string {
  const objects: Record<string, { value: Dict }> = {};
  for (const [id, value] of update) objects[`obj:${id}`] = { value };
  return JSON.stringify({
    qpdf: [
      {
        jsonversion: 2,
        pushedinheritedpageresources: false,
        calledgetallpages: false,
        maxobjectid: maxObjectId,
      },
      objects,
    ],
  });
}

// ---------------------------------------------------------------------------
// Reading the input once

const objectArg = (id: string) => {
  const [number, generation] = id.split(' ');
  return `--json-object=${number},${generation}`;
};

function json(qpdf: Qpdf, args: string[]): Dict {
  const { code, out } = qpdf.call(['--json=2', ...args]);
  if (!finished(code)) throw new Error('qpdf could not describe the file.');
  const parsed: unknown = JSON.parse(out);
  if (!isDict(parsed)) throw new Error('qpdf gave an unexpected answer.');
  return parsed;
}

/** The dictionaries of these objects, and the file's highest object number. */
function objects(qpdf: Qpdf, passwordArgs: string[], ids: string[]): { max: number; values: Map<string, Dict>; trailer: Dict | null } {
  const result = json(qpdf, [...passwordArgs, '--json-key=qpdf', '--json-object=trailer', ...ids.map(objectArg), '/in.pdf']);
  const [header, body] = Array.isArray(result.qpdf) ? result.qpdf : [];
  const max = isDict(header) && Number.isInteger(header.maxobjectid) ? (header.maxobjectid as number) : 0;
  const values = new Map<string, Dict>();
  let trailer: Dict | null = null;
  if (isDict(body)) {
    for (const [key, entry] of Object.entries(body)) {
      if (!isDict(entry) || !isDict(entry.value)) continue;
      if (key === 'trailer') trailer = entry.value;
      else if (key.startsWith('obj:')) values.set(key.slice(4), entry.value);
    }
  }
  return { max, values, trailer };
}

/** How many objects one qpdf call is asked for: each is an argument, and qpdf's arguments sit on its small stack. */
export const objectsPerCall = 200;

async function readStructure(fresh: () => Promise<Qpdf>, passwordArgs: string[]): Promise<Structure> {
  const qpdf = await fresh();
  const first = objects(qpdf, passwordArgs, []);
  const catalogId = first.trailer?.['/Root'];
  if (!isRef(catalogId)) throw new Error('The file has no catalog.');
  const withCatalog = objects(qpdf, passwordArgs, [catalogId]);
  const catalog = withCatalog.values.get(catalogId);
  if (!catalog) throw new Error('The file has no catalog.');
  const rootId = isRef(catalog['/Outlines']) ? catalog['/Outlines'] : null;
  const namesId = isRef(catalog['/Names']) ? catalog['/Names'] : null;

  // The outline is read without titles, and any problem with it drops it whole rather than failing the split.
  let outline: OutlineItem[] | null;
  let items = new Map<string, Dict>();
  let root: Dict | null = null;
  let names: Dict | null = null;
  try {
    const listed = json(qpdf, [...passwordArgs, '--json-key=outlines', '/in.pdf']);
    outline = readOutline(listed.outlines);
  } catch {
    outline = null;
  }
  const ids: string[] = [];
  const collect = (list: readonly OutlineItem[]) => list.forEach((item) => (ids.push(item.object), collect(item.kids)));
  if (outline) collect(outline);
  // The outline root and /Names, which attachments need whatever happens to the outline.
  const named = [rootId, namesId].filter((id): id is string => id !== null);
  if (named.length > 0) {
    const found = objects(qpdf, passwordArgs, named);
    root = rootId ? (found.values.get(rootId) ?? null) : null;
    names = namesId ? (found.values.get(namesId) ?? null) : null;
  }
  // Each bookmark's dictionary, a batch at a time, each batch on an instance of its own, so a
  // long outline neither overflows qpdf's stack nor wears one instance out. A failure drops the outline.
  try {
    for (let start = 0; start < ids.length; start += objectsPerCall) {
      const found = objects(await fresh(), passwordArgs, ids.slice(start, start + objectsPerCall));
      for (const [id, value] of found.values) items.set(id, value);
    }
  } catch {
    outline = null;
    items = new Map();
  }
  const base = {
    maxObjectId: withCatalog.max,
    catalogId,
    catalog,
    rootId,
    root,
    namesId,
    names,
    items,
  };
  if (outline && (!rootId || !root || !outlineIsSafe(base, outline))) outline = null;
  return { ...base, outline };
}

/** Whether a written part still carries a file attached to the document. `qpdf` is a fresh instance holding the part. */
function carriesAttachment(qpdf: Qpdf, path: string): boolean {
  const listed = json(qpdf, ['--json-key=attachments', path]);
  if (isDict(listed.attachments) && Object.keys(listed.attachments).length > 0) return true;
  const { code, out } = qpdf.call(['--json=2', '--json-key=qpdf', '--json-object=trailer', path]);
  if (!finished(code)) return true;
  const parsed: unknown = JSON.parse(out);
  const body = isDict(parsed) ? parsed.qpdf : null;
  const trailer = Array.isArray(body) && isDict(body[1]) && isDict(body[1].trailer) ? (body[1].trailer as Dict).value : null;
  const rootId = isDict(trailer) ? trailer['/Root'] : null;
  if (!isRef(rootId)) return true;
  const withRoot = json(qpdf, ['--json-key=qpdf', objectArg(rootId), path]).qpdf;
  const catalog = Array.isArray(withRoot) && isDict(withRoot[1]) ? (withRoot[1] as Dict)[`obj:${rootId}`] : null;
  return !isDict(catalog) || !isDict(catalog.value) || '/AF' in catalog.value;
}

// ---------------------------------------------------------------------------
// The engine

function cutsFrom(options: Options): number[] {
  if (options.cuts === undefined) return [];
  const cuts: unknown = options.cuts;
  if (!Array.isArray(cuts) || !cuts.every((cut): cut is number => Number.isInteger(cut))) throw new Error('The cuts are not valid.');
  return cuts;
}

function passwordFrom(options: Options): string | undefined {
  const passwords = Array.isArray(options.passwords) ? options.passwords : [];
  return typeof passwords[0] === 'string' ? passwords[0] : undefined;
}

// qpdf will not write JSON on an instance that has already written anything
// else to standard output, so JSON is always read on an instance of its own.
async function freshQpdf(tools: EngineTools, file: Uint8Array): Promise<Qpdf> {
  const qpdf = await qpdfFrom(tools);
  qpdf.write('/in.pdf', file);
  return qpdf;
}

/** The engine, with the most bytes one zip can hold given; tests pass a small limit. */
export function makeRun(maxBytes: (files: number) => number = zipMaxBytes): Engine<Options> {
  return async (files, options, onProgress, tools) => {
    const file = files[0];
    if (!file || files.length !== 1) throw new Error('Split takes one file.');
    const password = passwordFrom(options);
    const passwordArgs = password === undefined ? [] : [`--password=${password}`];
    const cuts = cutsFrom(options);

    // First, one plain copy: decrypted, by the owner's decision, and with no
    // object streams, because qpdf's JSON update does not reach objects kept in
    // an object stream. Every later step works on this copy, with no password.
    const opener = await freshQpdf(tools, file);
    const opened = opener.call([...passwordArgs, '--decrypt', '/in.pdf', '--object-streams=disable', '/plain.pdf']);
    if (!finished(opened.code)) {
      throw new Error(saidInvalidPassword(opened.printed) ? 'A password did not open the file.' : 'qpdf could not read the file.');
    }
    const plain = opener.read('/plain.pdf');

    // Read once: the page count, then the catalog, outline and /Names.
    const counted = (await freshQpdf(tools, plain)).call(['--show-npages', '/in.pdf']);
    if (!finished(counted.code)) throw new Error('qpdf could not read the file.');
    const pages = Number(counted.out.split('\n').find((line) => /^\d+$/.test(line.trim())));
    const total = partCount(pages, cuts);
    if (total > zipMaxFiles) throw new TooBigForZip('files');
    const list = parts(pages, cuts);
    const structure = await readStructure(() => freshQpdf(tools, plain), []);

    const outputs: Uint8Array[] = [];
    let bytes = 0;
    for (const [index, part] of list.entries()) {
      const isFirst = index === 0;
      const qpdf = await freshQpdf(tools, plain);
      const update = partUpdate(structure, part, isFirst);
      const updateArgs: string[] = [];
      if (update.size > 0) {
        qpdf.write('/u.json', new TextEncoder().encode(updateJson(structure.maxObjectId, update)));
        updateArgs.push('--update-from-json=/u.json');
      }
      const range = part.first === part.last ? `${part.first}` : `${part.first}-${part.last}`;
      const written = qpdf.call(['/in.pdf', ...updateArgs, '--pages', '.', range, '--', '/out.pdf']);
      if (!finished(written.code)) throw new Error(`qpdf could not write part ${index + 1} (exit ${written.code}).`);
      if (!finished(qpdf.call(['--check', '/out.pdf']).code)) throw new Error(`Part ${index + 1} did not pass qpdf's check.`);
      const output = qpdf.read('/out.pdf');
      if (!isFirst && carriesAttachment(await freshQpdf(tools, output), '/in.pdf'))
        throw new Error(`Part ${index + 1} still carries an attached file.`);
      bytes += output.byteLength;
      if (total > 1 && bytes > maxBytes(total)) throw new TooBigForZip('bytes');
      outputs.push(output);
      onProgress({ stage: 'working', unit: 'file', done: index + 1, total });
    }
    return outputs;
  };
}

export const run: Engine<Options> = makeRun();

export const inspect: Inspector = inspectPdf;
