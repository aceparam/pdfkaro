// The zlib steps shared by engines: fflate's streaming inflater and deflater
// as types, a zlib header check (`isZlib`), data deflated and framed as zlib
// data (`zlibDeflate`), raw deflate inflated with a cap (`inflateLimited`),
// and the first bytes of zlib data (`inflatePrefix`). Moved from `shrink.ts`
// and `picture.ts` with no change in behaviour. A pure module with no library:
// fflate's classes come in as arguments, so no engine imports fflate as a value.

/** fflate's streaming inflater, the one part of fflate used here. */
export type InflateClass = new (ondata: (chunk: Uint8Array, final: boolean) => void) => { push(chunk: Uint8Array, final?: boolean): void };
/** fflate's streaming deflater. */
export type DeflateClass = new (options: { level: 9 }, ondata: (chunk: Uint8Array, final: boolean) => void) => { push(chunk: Uint8Array, final?: boolean): void };
/** fflate's streaming inflater and deflater. */
export type Fflate = { Inflate: InflateClass; Deflate: DeflateClass };

class TooLong extends Error {}

/**
 * Inflates raw deflate data, pushing it in small pieces so no one piece can
 * make much more than a megabyte, and stops as soon as the output passes `limit`.
 */
export function inflateLimited(data: Uint8Array, Inflate: InflateClass, limit: number): Uint8Array | undefined {
  const parts: Uint8Array[] = [];
  let size = 0;
  let ended = false;
  const inflater = new Inflate((chunk, final) => {
    size += chunk.length;
    if (size > limit) throw new TooLong();
    parts.push(chunk.slice());
    if (final) ended = true;
  });
  const piece = 1024;
  try {
    for (let at = 0; at < data.length && !ended; at += piece) inflater.push(data.subarray(at, at + piece), at + piece >= data.length);
  } catch {
    return undefined;
  }
  if (!ended) return undefined;
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The Adler-32 checksum zlib puts after its data. */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let at = 0; at < data.length; ) {
    const end = Math.min(data.length, at + 5552);
    for (; at < end; at++) {
      a += data[at]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Data deflated at level 9 by fflate, framed as zlib data, which /FlateDecode reads. */
export function zlibDeflate(data: Uint8Array, Deflate: DeflateClass): Uint8Array {
  const parts: Uint8Array[] = [];
  const deflater = new Deflate({ level: 9 }, (chunk) => parts.push(chunk));
  const piece = 1024 * 1024;
  if (data.length === 0) deflater.push(data, true);
  for (let at = 0; at < data.length; at += piece) deflater.push(data.subarray(at, at + piece), at + piece >= data.length);
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(2 + size + 4);
  // CMF 0x78 (deflate, 32 KB window) and FLG 0xDA (best compression), which check as a multiple of 31.
  out[0] = 0x78;
  out[1] = 0xda;
  let at = 2;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  new DataView(out.buffer).setUint32(at, adler32(data));
  return out;
}

/** Whether data starts with a zlib header for deflate with no preset dictionary. */
export const isZlib = (data: Uint8Array) => data.length >= 2 && (data[0]! & 0x0f) === 8 && (data[0]! >> 4) <= 7 && ((data[0]! << 8) | data[1]!) % 31 === 0 && (data[1]! & 0x20) === 0;

/** The most bytes `inflatePrefix` gives. */
const maxPrefix = 65_536;
const impossiblePrefix = 'The start of zlib data was asked for an impossible length.';

/** Stops the inflater once enough bytes are made; not a failure. */
class Enough extends Error {}

/**
 * The first `bytes` bytes of zlib data, inflated; stops as a success once they
 * are made, however large the data. Undefined without a zlib header (`isZlib`),
 * or when the data ends, or fails, before `bytes` bytes. It ignores predictors
 * and every other filter key: its caller must refuse a stream with
 * /DecodeParms, /DP, /F or any filter but a lone /FlateDecode.
 */
export function inflatePrefix(data: Uint8Array, Inflate: InflateClass, bytes: number): Uint8Array | undefined {
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > maxPrefix) throw new Error(impossiblePrefix);
  if (!isZlib(data)) return undefined;
  const out = new Uint8Array(bytes);
  let size = 0;
  const inflater = new Inflate((chunk) => {
    const take = Math.min(chunk.length, bytes - size);
    out.set(chunk.subarray(0, take), size);
    size += take;
    if (size >= bytes) throw new Enough();
  });
  const raw = data.subarray(2);
  const piece = 1024;
  try {
    for (let at = 0; at < raw.length; at += piece) inflater.push(raw.subarray(at, at + piece), at + piece >= raw.length);
  } catch (error) {
    if (!(error instanceof Enough)) return undefined;
  }
  return size >= bytes ? out : undefined;
}
