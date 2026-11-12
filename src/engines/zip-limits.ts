// What one zip made by the worker can hold. The worker joins several outputs
// with fflate's zipSync, which writes no ZIP64, so a zip it makes holds at most
// 65,535 files and 4 GB. Lifting this needs a ZIP64 writer, which is the
// owner's call (CLAUDE.md, decisions the agent made for the owner).
// An engine that gives several files checks these before and while it works,
// so a visitor never gets a broken zip.

/** The most files one zip can hold. */
export const zipMaxFiles = 0xffff;

/** The most bytes one zip can hold, less room for its own headers. */
export function zipMaxBytes(files: number): number {
  // A local header and a central directory entry per file, with a name of up to 128 bytes, then the end record.
  return 0xffffffff - files * (30 + 46 + 2 * 128) - 22;
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
