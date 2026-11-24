// Reading the pages of a PDF and writing a page update through qpdf's JSON:
// the steps the page tools that change pages in place share. The drawing step
// (stamp.ts: Add page numbers, Watermark and Sign PDF) reads every page with
// `readPages` and writes its update with `writePageUpdate`; Crop PDF does the
// same without drawing. Moved unchanged from stamp.ts.
//
// Each page's id, dictionary, content streams, effective resources and where
// it is shown (its crop box, turn and user unit read as PDF.js reads them) come
// from one fresh qpdf. Only qpdf's own JSON is parsed, from files capped while
// written. Object ids are taken only as `N G R`. Document text never goes into
// an error. The update and the new file are each held to a size budget that
// only a broken or crafted file reaches; past it the job stops with
// `OutputLimit` (qpdf.ts).

import { cappedWrite, finished, type Qpdf } from './qpdf';
import { freshQpdf } from './plain';
import { callWithArgumentFile, isDict, isRef, readDictionaries, type Dict, type ObjectEntry } from './qpdf-json';
import type { EngineTools } from './types';

/** The largest JSON of pages that is parsed. */
export const maxPagesJson = 64 * 1024 * 1024;
/** The most pages handled in one run: layer pages drawn in one pdf-lib document (stamp.ts), pages measured from one PDF.js document (Crop PDF). */
export const runPages = 2000;
/** How deep the page tree is walked for an inherited value. */
export const treeDepthLimit = 64;
/** The smallest and largest side of a page as shown, in points. Outside them, the job stops. */
export const smallestSide = 1;
export const largestSide = 1e8;
/** The smallest scale the layer's matrix may have (1 / the user unit). Below it, the job stops. */
export const smallestScale = 1e-6;

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
  /**
   * Asked for with `{ pictures: true }` (Crop PDF): the most pixels (width × height) of any picture the page draws
   * through its resources' XObjects, forms included, exactly even where forms share resources or loop; Infinity when
   * the walk passes the tree depth limit.
   */
  largestPicture?: number;
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
export async function readPages(tools: EngineTools, plain: Uint8Array, options: { pictures?: true } = {}): Promise<PagesRead> {
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
  // The largest picture each resources dictionary reaches through its form XObjects. Resources dictionaries joined
  // by forms make a graph that may hold cycles (one dictionary shared by a page and its forms, or by every page and
  // form): a cycle is not a drawing loop, so its value is exact, the largest picture over its strongly connected
  // component and everything that component reaches. Found with an iterative Tarjan walk, memoised per component,
  // so the work over every page is linear in the dictionaries and their forms. A walk deeper than the tree depth
  // limit gives Infinity (the page is left as it is), and no recursion is used, so a hostile chain cannot overflow.
  const picturesOf = new WeakMap<Dict, number>();
  const edgesOf = (resources: Dict): { pictures: number; children: Dict[] } => {
    let pictures = 0;
    const children: Dict[] = [];
    const xobjects = resolve(resources['/XObject']);
    if (isDict(xobjects)) {
      for (const value of Object.values(xobjects)) {
        if (!isRef(value)) continue;
        const entry = objects.get(value);
        if (!entry || !('stream' in entry)) continue;
        const dict = entry.stream.dict;
        if (dict['/Subtype'] === '/Image') {
          const [width, height] = [resolve(dict['/Width']), resolve(dict['/Height'])];
          if (typeof width === 'number' && typeof height === 'number') pictures = Math.max(pictures, width * height);
        } else if (dict['/Subtype'] === '/Form') {
          const own = resolve(dict['/Resources']);
          if (isDict(own)) children.push(own);
        }
      }
    }
    return { pictures, children };
  };
  const largestPicture = (start: Dict | undefined): number => {
    if (!start) return 0;
    const known = picturesOf.get(start);
    if (known !== undefined) return known;
    const index = new Map<Dict, number>();
    const low = new Map<Dict, number>();
    const best = new Map<Dict, number>();
    const stack: Dict[] = [];
    const onStack = new Set<Dict>();
    const frames: { node: Dict; children: Dict[]; next: number }[] = [];
    let counter = 0;
    const enter = (node: Dict): boolean => {
      if (frames.length >= treeDepthLimit) return false;
      index.set(node, counter);
      low.set(node, counter);
      counter++;
      stack.push(node);
      onStack.add(node);
      const { pictures, children } = edgesOf(node);
      best.set(node, pictures);
      frames.push({ node, children, next: 0 });
      return true;
    };
    enter(start);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      if (frame.next < frame.children.length) {
        const child = frame.children[frame.next++]!;
        const done = picturesOf.get(child);
        if (done !== undefined) {
          best.set(frame.node, Math.max(best.get(frame.node)!, done));
        } else if (!index.has(child)) {
          if (!enter(child)) {
            // Deeper than the limit: every dictionary still on the component stack reaches the path, which
            // reaches past it, so each is left as it is (and none is walked again).
            for (const each of stack) picturesOf.set(each, Infinity);
            return Infinity;
          }
        } else if (onStack.has(child)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(child)!));
        }
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (low.get(frame.node) === index.get(frame.node)) {
        // The root of a component: its members share the largest picture any of them reaches.
        const members: Dict[] = [];
        let largest = 0;
        let member: Dict;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          members.push(member);
          largest = Math.max(largest, best.get(member)!);
        } while (member !== frame.node);
        for (const each of members) picturesOf.set(each, largest);
        if (parent) best.set(parent.node, Math.max(best.get(parent.node)!, largest));
      } else if (parent) {
        low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
        best.set(parent.node, Math.max(best.get(parent.node)!, best.get(frame.node)!));
      }
    }
    return picturesOf.get(start) ?? Infinity;
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
      ...(options.pictures ? { largestPicture: largestPicture(own) } : {}),
    };
  });
  return { max: dictionaries.max, pages };
}

// ---------------------------------------------------------------------------
// The update.

/** The plain copy, which the step that writes the update lets go of once qpdf holds it. */
export type PlainSource = { plain?: Uint8Array };

/**
 * Writes the update held in /update.json into the file held as /in.pdf, as
 * /out.pdf, capped at `limit`; removes /in.pdf and /update.json; checks the
 * result with `qpdf --check`; and gives its bytes. A write refused at the cap,
 * or a file past it, throws `OutputLimit`; any other failure is the engine's.
 */
export function writePageUpdate(qpdf: Qpdf, limit: number, onWriting?: (percent: number) => void): Uint8Array {
  const written = cappedWrite(
    qpdf,
    limit,
    (q) => callWithArgumentFile(q, ['--progress', '/in.pdf', '--update-from-json=/update.json', '--object-streams=generate', '/out.pdf']),
    onWriting,
  );
  if (!finished(written.code)) throw new Error(`qpdf could not write the new file (exit ${written.code}).`);
  qpdf.remove('/update.json');
  if (!finished(qpdf.call(['--check', '/out.pdf']).code)) throw new Error("The new file did not pass qpdf's check.");
  return qpdf.read('/out.pdf');
}
