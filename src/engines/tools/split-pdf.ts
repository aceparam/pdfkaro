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
import { carriesAttachment, outlineUpdate, pageRange, readStructure, updateJson } from '../outline';
import { freshQpdf, passwordFrom, plainCopy } from '../plain';
import { finished } from '../qpdf';
import type { Engine, Inspector } from '../types';
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
// The engine

function cutsFrom(options: Options): number[] {
  if (options.cuts === undefined) return [];
  const cuts: unknown = options.cuts;
  if (!Array.isArray(cuts) || !cuts.every((cut): cut is number => Number.isInteger(cut))) throw new Error('The cuts are not valid.');
  return cuts;
}

/** The engine, with the most bytes one zip can hold given; tests pass a small limit. */
export function makeRun(maxBytes: (files: number) => number = zipMaxBytes): Engine<Options> {
  return async (files, options, onProgress, tools) => {
    const file = files[0];
    if (!file || files.length !== 1) throw new Error('Split takes one file.');
    const password = passwordFrom(options);
    const cuts = cutsFrom(options);

    const { plain, pages } = await plainCopy(tools, file, password);
    const total = partCount(pages, cuts);
    if (total > zipMaxFiles) throw new TooBigForZip('files');
    const list = parts(pages, cuts);
    const structure = await readStructure(() => freshQpdf(tools, plain), []);

    const outputs: Uint8Array[] = [];
    let bytes = 0;
    for (const [index, part] of list.entries()) {
      const isFirst = index === 0;
      const qpdf = await freshQpdf(tools, plain);
      const update = outlineUpdate(structure, pageRange(part.first, part.last), { dropAttachments: !isFirst });
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
