// PDF to JPG and PDF to PNG: draws every page of one PDF, in order, as one
// picture each, through PDF.js in the tool worker.
//
// The page sets the format through its preset ({ format: 'jpg' } or 'png').
// Each page is drawn at 150 pixels to the inch of its own size, turned by its
// /Rotate, on white, with form fields drawn with their values; a poster-sized
// page is drawn smaller, to at most 16 million pixels, never in pieces. JPGs
// are saved at quality 85, PNGs without loss. A picture holds only the drawn
// page: the canvas encoder writes no text, EXIF or comment of the file's.
//
// Memory is bounded: each page is let go once drawn (thumbnail.ts), PDF.js's
// own canvases share one budget, and the outputs stop at one zip's limits or
// at 1 GB, whichever comes first, with a sentence of their own instead of a
// tab that runs out of memory. The PDF is only read, never changed.

import { inspectPdf } from '../inspect';
import { maxImagePixels, openDocument } from '../thumbnail';
import type { Engine, EngineModule, Inspector } from '../types';
import { maxOutputBytes, outputTally, zipMaxBytes } from '../../widget/zip-limits';

/** What this tool's reading and its job load, before any file is read: chosen by tool, never by a file (types.ts). */
export const loads: EngineModule['loads'] = { read: ['qpdf'], job: ['fflate', 'pdfjs'] };

type Options = { passwords?: unknown; format?: unknown };

/** 150 pixels to the inch, from PDF's 72 points to the inch. */
export const pictureScale = 150 / 72;

/** The quality JPGs are saved at, from 0 to 1. */
export const jpegQuality = 0.85;

/** The limits a run keeps to; tests pass small ones. */
export type Limits = { maxPixels: number; maxOutputBytes: number; zipBytes: (files: number) => number };

const defaults: Limits = { maxPixels: maxImagePixels, maxOutputBytes, zipBytes: zipMaxBytes };

function passwordOf(options: Options): string | undefined {
  const passwords = Array.isArray(options.passwords) ? options.passwords : [];
  return typeof passwords[0] === 'string' ? passwords[0] : undefined;
}

/** The engine, with the limits given; tests pass small ones. */
export function makeRun(limits: Partial<Limits> = {}): Engine<Options> {
  const { maxPixels, maxOutputBytes: most, zipBytes } = { ...defaults, ...limits };
  return async (files, options, onProgress, tools) => {
    const file = files[0];
    if (!file || files.length !== 1) throw new Error('This tool takes one file.');
    const format = options.format;
    if (format !== 'jpg' && format !== 'png') throw new Error('The picture format is not valid.');

    // qpdf has read the file before the job and asked for any password; PDF.js opens it with the same one.
    const doc = await openDocument(file, passwordOf(options), tools);
    try {
      const pages = doc.pages;
      // More pages than one zip holds fails before any page is drawn.
      const tally = outputTally(pages, { zipBytes, most });
      const outputs: Uint8Array[] = [];
      for (let page = 1; page <= pages; page++) {
        onProgress({ stage: 'working', unit: 'page', done: page, total: pages });
        const { bytes } = await doc.draw(page, { scale: pictureScale, maxPixels, format, quality: jpegQuality });
        tally.add(bytes.byteLength);
        outputs.push(bytes);
      }
      return outputs;
    } finally {
      // A close that fails (PDF.js stopped) is not the job's result: a drawing that failed has already said so.
      await doc.close().catch(() => {});
    }
  };
}

export const run: Engine<Options> = makeRun();

export const inspect: Inspector = inspectPdf;
