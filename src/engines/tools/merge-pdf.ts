// Merge PDF: joins every page of every file, in the order given, into one PDF.
//
// The first file is qpdf's primary input, so its bookmarks and attachments are
// kept; those of later files are not (the owner's decision of 11 Nov 2026).
// --decrypt drops the first file's encryption, which qpdf would otherwise keep,
// so the merged file has no password and no restrictions (also the owner's
// decision). Files are written under made-up paths; a visitor's file name is
// never a path or an argument.

import { inspectPdf } from '../inspect';
import { finished, qpdfFrom, saidInvalidPassword } from '../qpdf';
import type { Engine, Inspector } from '../types';

type Options = { passwords?: (string | undefined)[] };

const writeProgress = /write progress:\s*(\d+(?:\.\d+)?)%/;

/** qpdf's arguments for a merge. Exported for the unit test. */
export function mergeArgs(count: number, passwords: (string | undefined)[]): string[] {
  const withPassword = (index: number) => (passwords[index] === undefined ? [] : [`--password=${passwords[index]}`]);
  const args = ['--progress', ...withPassword(0), '--decrypt', '/in/0.pdf', '--pages', '.', '1-z'];
  for (let index = 1; index < count; index++) args.push(`/in/${index}.pdf`, ...withPassword(index), '1-z');
  args.push('--', '/out.pdf');
  return args;
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  if (files.length < 2) throw new Error('Merge needs at least two files.');
  const qpdf = await qpdfFrom(tools);
  qpdf.mkdir('/in');
  files.forEach((file, index) => {
    qpdf.write(`/in/${index}.pdf`, file);
    onProgress({ stage: 'reading', unit: 'file', done: index + 1, total: files.length });
  });
  let last = -1;
  qpdf.onLine = (line) => {
    const match = writeProgress.exec(line);
    if (!match) return;
    const percent = Math.min(100, Number(match[1]));
    if (percent === last) return;
    last = percent;
    onProgress({ stage: 'writing', percent });
  };
  const { code, printed } = qpdf.call(mergeArgs(files.length, options.passwords ?? []));
  qpdf.onLine = null;
  if (!finished(code)) {
    throw new Error(saidInvalidPassword(printed) ? 'A password did not open its file.' : `qpdf could not merge the files (exit ${code}).`);
  }
  return [qpdf.read('/out.pdf')];
};

export const inspect: Inspector = inspectPdf;
