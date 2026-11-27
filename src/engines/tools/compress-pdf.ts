// Compress PDF: makes one PDF smaller, with our own recompression on qpdf, by
// the owner's decision of 13 Nov 2026 (no Ghostscript).
//
// First, pictures are made smaller where that saves space. Only pictures this
// file can safely redo are candidates (`canShrink`): 8-bit grey or RGB, a JPG
// (/DCTDecode) or stored without loss (/FlateDecode), with no key outside a
// short list, not a mask, and at most 50 million pixels. Everything else is
// left exactly as it was. A candidate's raw data is read in bounded batches,
// and decoded only within our own limits: a JPG's own frame must match its
// dictionary before the browser decodes it, and lossless data is inflated with
// a cap at exactly the size it should have. The picture steps are in
// `../shrink.ts`, shared with other tools that make pictures smaller.
//
// Then qpdf writes the whole file again without loss: object streams, every
// compressed stream compressed again at the highest level, uncompressed streams
// compressed, and resources nothing uses removed. A file opened with its
// password is written with the same password and restrictions. The file is
// written afresh, so earlier saved versions inside it are not kept and a
// digital signature stops being valid, as the page says.
//
// When the result is not at least 1% smaller, the engine gives no file, and
// the page says the file could not be made smaller.

import { inspectPdf } from '../inspect';
import { freshQpdf, passwordFrom } from '../plain';
import { passwordArgsFor, rawBatches, readDictionaries, readRawStreams, writeUpdate, type StreamReplacement } from '../qpdf-json';
import {
  keepBelow,
  listCandidates,
  losslessOptions,
  need,
  pictureContext,
  pixelLimit,
  shrinkJpeg,
  shrinkLossless,
  statedLength,
  type PictureDecoder,
} from '../shrink';
import type { JpegCanvasMaker } from '../thumbnail';
import type { Engine, EngineModule, Inspector } from '../types';
import type { Fflate } from '../zlib';

/** What this tool's reading and its job load, before any file is read: chosen by tool, never by a file (types.ts). */
export const loads: EngineModule['loads'] = { read: ['qpdf'], job: ['qpdf', 'fflate'] };

type Options = { passwords?: unknown };

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Compress takes one file.');
  const passwordArgs = passwordArgsFor(passwordFrom(options));
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });

  const replacements = new Map<string, StreamReplacement>();
  let max = 0;
  // Every dictionary, with no stream data. A JSON too large, or any problem, skips the pictures; the file is still written again.
  const dicts = readDictionaries(await freshQpdf(tools, file), passwordArgs);
  const limit = dicts ? pixelLimit(dicts.objects) : undefined;
  if (dicts && limit !== undefined) {
    max = dicts.max;
    const candidates = listCandidates(dicts.objects, pictureContext(dicts.objects));
    const total = candidates.length;
    if (total > 0) {
      const byId = new Map(candidates.map((each) => [each.id, each]));
      const needsJpeg = candidates.some((each) => each.candidate.kind === 'jpeg');
      const needsLossless = candidates.some((each) => each.candidate.kind === 'lossless');
      const decoder = needsJpeg ? await need<PictureDecoder>(tools, 'decodePicture') : undefined;
      const canvases = needsJpeg ? await need<JpegCanvasMaker>(tools, 'canvas') : undefined;
      const fflate = needsLossless ? await need<Fflate>(tools, 'fflate') : undefined;
      const batches = rawBatches(candidates.map(({ id, dict }) => ({ id, length: statedLength(dict, dicts.objects) })));
      let done = 0;
      for await (const batch of readRawStreams(() => freshQpdf(tools, file), passwordArgs, batches)) {
        for (const [id, raw] of batch) {
          const found = byId.get(id);
          // readRawStreams gives only ids it was asked for; anything else is left alone.
          if (!found) continue;
          const { dict, candidate } = found;
          onProgress({ stage: 'working', unit: 'picture', done: ++done, total });
          let replacement: StreamReplacement | undefined;
          try {
            replacement =
              candidate.kind === 'jpeg' ? await shrinkJpeg(raw, dict, candidate, limit, decoder!, canvases!) : shrinkLossless(raw, dict, candidate, limit, fflate!);
          } catch {
            // A picture the browser or our code cannot redo is left as it was.
            replacement = undefined;
          }
          if (replacement) replacements.set(id, replacement);
          // The raw data is let go as soon as its picture is done.
          batch.delete(id);
        }
      }
      // Streams a batch gave no data for are left as they were, and still count, so the line reaches its total.
      if (done < total) onProgress({ stage: 'working', unit: 'picture', done: total, total });
    }
  }

  onProgress({ stage: 'writing', percent: 75 });
  // A fresh qpdf, once the reading ones are let go.
  const output = writeUpdate(await freshQpdf(tools, file), passwordArgs, max, replacements, losslessOptions);
  replacements.clear();
  // No 100% here: the result follows at once, and a full bar beside "Writing" would say the work is done before it is.
  return output.length <= file.length * keepBelow ? [output] : [];
};

export const inspect: Inspector = inspectPdf;
