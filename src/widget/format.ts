// Words and numbers every tool shows. Plain functions, tested in Node.
// A tool's own words come from the registry, not from here.

import type { Progress } from '../engines/types';

export function pageCount(pages: number): string {
  return pages === 1 ? '1 page' : `${pages} pages`;
}

export function fileCount(files: number): string {
  return files === 1 ? '1 file' : `${files} files`;
}

/** A size in plain units, counted in 1024s: "820 bytes", "512 KB", "6.1 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * The line shown above the progress bar. `writingLabel` comes from the tool,
 * such as "Writing the merged file". Writing has no unit a visitor can count,
 * so its line gives no number; the bar shows how far the whole job has come,
 * and a second percentage beside it would not agree with the bar.
 */
export function progressLine(progress: Progress, writingLabel: string): string {
  if (progress.stage === 'writing') return writingLabel;
  if (progress.unit === 'file') {
    return progress.stage === 'reading'
      ? `Reading file ${progress.done} of ${progress.total}`
      : `File ${progress.done} of ${progress.total}`;
  }
  return `Page ${progress.done} of ${progress.total}`;
}

/** How full the bar is, from 0 to 1. Reading fills the first fifth; the rest is the work. */
export function progressFraction(progress: Progress): number {
  const share = (part: number, whole: number) => (whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0);
  if (progress.stage === 'reading') return 0.2 * share(progress.done, progress.total);
  if (progress.stage === 'writing') return 0.2 + 0.8 * share(progress.percent, 100);
  return 0.2 + 0.8 * share(progress.done, progress.total);
}

// Characters a file name must not carry: control characters, marks that
// change the direction text is shown in, and characters that Windows refuses
// in file names.
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const unsafe = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069:*?"<>|]/g;

/**
 * The cleaned base of an input file's name, used for every output name:
 * "report.pdf" gives "report". No folder, no extension, no unsafe character,
 * no leading or trailing dot or space, at most 100 characters; "document"
 * when nothing is left.
 */
export function stem(input: string): string {
  const lastPart = input.split(/[\\/]/).pop() ?? '';
  const base = lastPart
    .replace(unsafe, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100)
    .replace(/[.\s]+$/, '');
  return base || 'document';
}

/**
 * The name for an output file, built from an input file's name:
 * "report.pdf" and "merged" give "report-merged.pdf".
 */
export function outputName(input: string, suffix: string, extension = 'pdf'): string {
  return `${stem(input)}-${suffix}.${extension}`;
}

/**
 * The name of one file inside a zip: "report", "part", 3 of 12 gives
 * "report-part-03.pdf". Numbers are padded so the files sort in order.
 */
export function partName(base: string, suffix: string, number: number, total: number, extension = 'pdf'): string {
  const width = String(Math.max(1, total)).length;
  return `${base}-${suffix}-${String(number).padStart(width, '0')}.${extension}`;
}
