// What one zip made by the worker can hold. The worker joins several outputs
// with fflate's zipSync, which writes no ZIP64, so a zip it makes holds at most
// 65,535 files and 4 GB. Lifting this needs a ZIP64 writer, which is the
// owner's call (CLAUDE.md, decisions the agent made for the owner).
// An engine that gives several files checks these early, before and while it
// works, so it does not build gigabytes of parts first; the worker checks the
// exact size again just before it zips, so no tool can hand back a broken zip.
// A plain module: the engine, the worker and the page all read it.

/** The most files one zip can hold. */
export const zipMaxFiles = 0xffff;

/** The longest name a zip entry can have, in bytes. */
const maxNameBytes = 3 * 100 + 32;

/** The most bytes one zip can hold, less room for its own headers. */
export function zipMaxBytes(files: number): number {
  // A local header and a central directory entry per file, each holding the name, then the end record.
  // A name is a stem of up to 100 characters (up to 300 bytes in UTF-8) and "-part-65535.pdf".
  return 0xffffffff - files * (30 + 46 + 2 * maxNameBytes) - 22;
}

/**
 * Thrown by an engine when its files would not fit in one zip. The worker
 * recognises it by name, so an engine never imports worker code.
 */
export class TooBigForZip extends Error {
  override name = 'TooBigForZip';
  constructor(readonly reason: 'files' | 'bytes') {
    super(reason === 'files' ? 'too many files for one zip' : 'too many bytes for one zip');
  }
}

const utf8 = new TextEncoder();

/** Whether these files, under these names, fit in one zip made by zipSync, counted exactly. */
export function fitsInOneZip(names: readonly string[], sizes: readonly number[]): { fits: true } | { fits: false; reason: 'files' | 'bytes' } {
  if (names.length > zipMaxFiles) return { fits: false, reason: 'files' };
  let total = 22;
  names.forEach((name, index) => {
    total += 76 + 2 * utf8.encode(name).length + (sizes[index] ?? 0);
  });
  return total > 0xffffffff ? { fits: false, reason: 'bytes' } : { fits: true };
}

const number = (value: number) => value.toLocaleString('en-GB');

/** The sentence for a job that would not fit in one zip, with the tool's own thing to try. */
export function zipLimitSentence(reason: 'files' | 'bytes', advice: string): string {
  const what = reason === 'files' ? `more than ${number(zipMaxFiles)} files` : 'a zip over 4 GB';
  return `This would make ${what}, more than one zip can hold. ${advice}`;
}
