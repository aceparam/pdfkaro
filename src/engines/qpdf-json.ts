// Reading and writing a PDF through qpdf's JSON (version 2), shared by the
// engines. The general helpers (`json`, `objects`, `objectArg`,
// `objectsPerCall`, `updateJson`, `callWithArgumentFile`) came here unchanged
// from outline.ts and plain.ts. The steps after them are for an engine that
// replaces streams (Compress PDF): reading every object's dictionary without
// stream data, reading chosen streams' raw data in batches, and writing
// replaced streams back with `--update-from-json`.
//
// Only qpdf's own output is parsed, from a file whose size is checked first.
// Object keys are taken only in the form `obj:N G R`. A password goes only
// inside `--password=`, never into an error, and never into a file when it
// holds a line break. Document text never goes into an error message.

import { finished, type Qpdf } from './qpdf';

export type Dict = Record<string, unknown>;
export const isRef = (value: unknown): value is string => typeof value === 'string' && /^\d+ \d+ R$/.test(value);
export const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------------------
// The general helpers, moved here unchanged.

export const objectArg = (id: string) => {
  const [number, generation] = id.split(' ');
  return `--json-object=${number},${generation}`;
};

export function json(qpdf: Qpdf, args: string[]): Dict {
  const { code, out } = qpdf.call(['--json=2', ...args]);
  if (!finished(code)) throw new Error('qpdf could not describe the file.');
  const parsed: unknown = JSON.parse(out);
  if (!isDict(parsed)) throw new Error('qpdf gave an unexpected answer.');
  return parsed;
}

/** The dictionaries of these objects, and the file's highest object number. */
export function objects(qpdf: Qpdf, passwordArgs: string[], ids: string[]): { max: number; values: Map<string, Dict>; trailer: Dict | null } {
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

/**
 * Runs qpdf with its arguments in an argument file, one per line, because qpdf
 * copies command-line arguments onto its small stack and a long page list
 * would overflow it. Every argument is a made-up path, an option or a page
 * list built from checked page numbers, in any order, so none holds a line break.
 */
export function callWithArgumentFile(qpdf: Qpdf, args: readonly string[]): ReturnType<Qpdf['call']> {
  if (args.some((arg) => /[\r\n]/.test(arg))) throw new Error('An argument held a line break.');
  qpdf.write('/args', new TextEncoder().encode(`${args.join('\n')}\n`));
  return qpdf.call(['@/args']);
}

// ---------------------------------------------------------------------------
// Replacing streams (Compress PDF).

/** qpdf's arguments for a password: none, or `--password=` with the password as it is. */
export const passwordArgsFor = (password: string | undefined): string[] => (password === undefined ? [] : [`--password=${password}`]);

/**
 * Runs qpdf with `args` in an argument file and the password before them. A
 * password goes in the argument file only when it holds no line break, as the
 * file holds one argument per line; otherwise it stays in the in-memory list.
 */
export function callWithPassword(qpdf: Qpdf, passwordArgs: readonly string[], args: readonly string[]): { code: number } {
  if (args.some((arg) => /[\r\n]/.test(arg))) throw new Error('An argument held a line break.');
  const inFile = passwordArgs.every((arg) => !/[\r\n]/.test(arg));
  const listed = inFile ? [...passwordArgs, ...args] : [...args];
  qpdf.write('/args', new TextEncoder().encode(`${listed.join('\n')}\n`));
  return qpdf.call(inFile ? ['@/args'] : [...passwordArgs, '@/args']);
}

/** An object key in qpdf's JSON, `obj:N G R`. Anything else is not an object this code reads or writes. */
const objectKey = /^obj:(\d+) (\d+) R$/;

/** The object id (`N G R`) of an `obj:N G R` key, or undefined for any other key. */
export function idOfKey(key: string): string | undefined {
  const match = objectKey.exec(key);
  return match ? `${match[1]} ${match[2]} R` : undefined;
}

/** The largest JSON of dictionaries that is parsed. A larger one skips the step that needs it. */
export const maxDictionaryJson = 64 * 1024 * 1024;

/** One object as qpdf's JSON gives it, with no stream data: a value, or a stream's dictionary. */
export type ObjectEntry = { value: unknown } | { stream: { dict: Dict } };

export type Dictionaries = {
  /** The file's highest object number. */
  max: number;
  /** Every object, by id (`N G R`). */
  objects: Map<string, ObjectEntry>;
  trailer: Dict | null;
};

/**
 * Every object's dictionary, with no stream data, from a qpdf that holds the
 * file as /in.pdf. qpdf writes the JSON to a file in its own memory that
 * refuses writes past `limit`, so qpdf fails there and memory never holds more;
 * its length is also read before it is read, and a JSON over `limit` is not parsed. Gives null when it is
 * over the limit or cannot be read or parsed, so the caller skips the step that
 * needs it; nothing of the file goes into an error.
 */
export function readDictionaries(qpdf: Qpdf, passwordArgs: readonly string[], limit = maxDictionaryJson): Dictionaries | null {
  try {
    // qpdf writes into a file that refuses to grow past the limit, so it fails there; its size is still checked after.
    qpdf.capFile('/dicts.json', limit);
    const { code } = callWithPassword(qpdf, passwordArgs, ['--json=2', '--json-key=qpdf', '--json-stream-data=none', '/in.pdf', '/dicts.json']);
    if (!finished(code)) return null;
    const size = qpdf.size('/dicts.json');
    if (size > limit) return null;
    const text = new TextDecoder().decode(qpdf.read('/dicts.json'));
    qpdf.remove('/dicts.json');
    const parsed: unknown = JSON.parse(text);
    if (!isDict(parsed) || !Array.isArray(parsed.qpdf)) return null;
    const [header, body] = parsed.qpdf as unknown[];
    if (!isDict(header) || !isDict(body)) return null;
    const max = Number.isInteger(header.maxobjectid) && (header.maxobjectid as number) > 0 ? (header.maxobjectid as number) : 0;
    const found = new Map<string, ObjectEntry>();
    let trailer: Dict | null = null;
    for (const [key, entry] of Object.entries(body)) {
      if (!isDict(entry)) continue;
      if (key === 'trailer') {
        trailer = isDict(entry.value) ? entry.value : null;
        continue;
      }
      const id = idOfKey(key);
      if (id === undefined) continue;
      if (isDict(entry.stream) && isDict(entry.stream.dict)) found.set(id, { stream: { dict: entry.stream.dict } });
      else if ('value' in entry) found.set(id, { value: entry.value });
    }
    return { max, objects: found, trailer };
  } catch {
    return null;
  }
}

/** The most raw stream data read in one batch. A stream larger than this is read alone. */
export const maxBatchBytes = 32 * 1024 * 1024;

/**
 * Batches of stream ids whose stated sizes add up to at most `limit`, in the
 * order given, each holding at most `objectsPerCall` ids; a stream larger than
 * the limit, or of no known size, goes in a batch of its own.
 */
export function rawBatches(streams: readonly { id: string; length: number | undefined }[], limit = maxBatchBytes): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let bytes = 0;
  for (const { id, length } of streams) {
    const size = length !== undefined && Number.isFinite(length) && length >= 0 ? length : Number.POSITIVE_INFINITY;
    if (current.length > 0 && (bytes + size > limit || current.length >= objectsPerCall)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(id);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Where a batch's data files go in qpdf's memory, and the names qpdf gives them. */
const dataPrefix = '/raw/s';
const dataFile = /^\/raw\/s-\d+(-\d+)?$/;

/**
 * The raw data of chosen streams, in batches from `rawBatches`. Each batch is
 * read by a fresh qpdf (`fresh` gives one holding the file as /in.pdf), as one
 * instance writes JSON only once. Each data file is read, removed from qpdf's
 * memory, and handed over; the batch's qpdf is let go before the next. A batch
 * qpdf cannot read gives no data for its streams.
 */
export async function* readRawStreams(
  fresh: () => Promise<Qpdf>,
  passwordArgs: readonly string[],
  batches: readonly string[][],
): AsyncGenerator<Map<string, Uint8Array>> {
  for (const batch of batches) yield await readBatch(fresh, passwordArgs, batch.filter(isRef));
}

/**
 * One batch of raw data, read by its own qpdf. The qpdf lives only inside this
 * call, so it, with the file in its memory, is let go before the batch is
 * handed over; what is handed over are copies taken out of its memory.
 */
async function readBatch(fresh: () => Promise<Qpdf>, passwordArgs: readonly string[], ids: string[]): Promise<Map<string, Uint8Array>> {
  const found = new Map<string, Uint8Array>();
  if (ids.length === 0) return found;
  const qpdf = await fresh();
  qpdf.mkdir('/raw');
  const args = ['--json=2', '--json-key=qpdf', '--decode-level=none', '--json-stream-data=file', `--json-stream-prefix=${dataPrefix}`, ...ids.map(objectArg), '/in.pdf', '/raw.json'];
  let body: unknown;
  try {
    if (finished(callWithPassword(qpdf, passwordArgs, args).code)) {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(qpdf.read('/raw.json')));
      qpdf.remove('/raw.json');
      body = isDict(parsed) && Array.isArray(parsed.qpdf) ? (parsed.qpdf as unknown[])[1] : undefined;
    }
  } catch {
    body = undefined;
  }
  if (!isDict(body)) return found;
  const wanted = new Set(ids);
  for (const [key, entry] of Object.entries(body)) {
    const id = idOfKey(key);
    if (id === undefined || !wanted.has(id) || !isDict(entry) || !isDict(entry.stream)) continue;
    const path = entry.stream.datafile;
    if (typeof path !== 'string' || !dataFile.test(path)) continue;
    try {
      found.set(id, qpdf.read(path));
      qpdf.remove(path);
    } catch {
      // A data file qpdf did not write gives no data for its stream.
    }
  }
  return found;
}

/** A replaced stream: its new dictionary and its new raw data, which `/Filter` in the dictionary describes. */
export type StreamReplacement = { dict: Dict; data: Uint8Array };

/** The text of an --update-from-json file that replaces streams, each with its data in a file under `/upd/`. */
export function streamUpdateJson(maxObjectId: number, streams: ReadonlyMap<string, { dict: Dict; datafile: string }>): string {
  const objects: Record<string, { stream: { dict: Dict; datafile: string } }> = {};
  for (const [id, { dict, datafile }] of streams) {
    if (!isRef(id)) throw new Error('An object id was not valid.');
    objects[`obj:${id}`] = { stream: { dict, datafile } };
  }
  return JSON.stringify({
    qpdf: [{ jsonversion: 2, pushedinheritedpageresources: false, calledgetallpages: false, maxobjectid: maxObjectId }, objects],
  });
}

/**
 * Writes the file held by a fresh qpdf as /in.pdf with `options` (and the
 * password, so a protected file keeps its password and restrictions), after
 * replacing the streams in `replacements` (each taken out of the map once it
 * is in qpdf's memory), then checks the result with
 * `qpdf --check`, with the password. The data files go under paths made here.
 */
export function writeUpdate(
  qpdf: Qpdf,
  passwordArgs: readonly string[],
  maxObjectId: number,
  replacements: Map<string, StreamReplacement>,
  options: readonly string[],
): Uint8Array {
  const args = ['/in.pdf'];
  if (replacements.size > 0) {
    qpdf.mkdir('/upd');
    const streams = new Map<string, { dict: Dict; datafile: string }>();
    let index = 0;
    for (const [id, { dict, data }] of replacements) {
      const datafile = `/upd/${index++}`;
      qpdf.write(datafile, data);
      streams.set(id, { dict, datafile });
      // Once in qpdf's memory, the data is let go here, so it is not held twice while qpdf writes.
      replacements.delete(id);
    }
    qpdf.write('/update.json', new TextEncoder().encode(streamUpdateJson(maxObjectId, streams)));
    args.push('--update-from-json=/update.json');
  }
  args.push(...options, '/out.pdf');
  const written = callWithPassword(qpdf, passwordArgs, args);
  if (!finished(written.code)) throw new Error(`qpdf could not write the new file (exit ${written.code}).`);
  if (!finished(callWithPassword(qpdf, passwordArgs, ['--check', '/out.pdf']).code)) throw new Error("The new file did not pass qpdf's check.");
  return qpdf.read('/out.pdf');
}
