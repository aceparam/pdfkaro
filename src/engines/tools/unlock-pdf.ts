// Remove a password (the catalogue's Unlock PDF, at /unlock-pdf): writes one PDF
// again with no encryption, so it opens with no password and carries no print,
// copy or edit restrictions.
//
// A fresh qpdf first reads whether the file is encrypted at all, from its JSON
// `encrypt` answer, keeping only that yes or no: the answer can hold the opening
// password qpdf recovered from a permissions password (revision 2 to 4), so the
// parsed object and qpdf's output are let go at once. A file with no encryption
// gives no file ("nothing to remove"). Otherwise one capped qpdf write with
// `--decrypt` makes the new file, and a fresh qpdf checks it before it is given
// back: not encrypted, and `--check` passing, with no password given.
//
// Only a password the visitor typed is used, once in the reading and once in the
// write, and only in qpdf's in-memory argument list in the named form
// (`--password=`, through passwordArgsFor). Nothing guesses or tries passwords. A
// file with restrictions only opens without one, as the format lets any program.
// qpdf's option that prints the encryption (with the password) is never used,
// nor an argument file; a unit test reads this file to make sure. Every error is
// a fixed sentence: what qpdf prints is never passed on.
//
// The file is written afresh, so earlier saved versions inside it are not kept
// and a digital signature stops being valid, as the page says.

import { readPdf } from '../inspect';
import { freshQpdf, passwordFrom } from '../plain';
import { cappedWrite, finished, saidInvalidPassword } from '../qpdf';
import { isDict, passwordArgsFor } from '../qpdf-json';
import type { Engine, EngineTools, Inspector } from '../types';

type Options = { passwords?: unknown };

/** The new file is held to twice the input and 16 MB, as Protect's is. Decrypting removes bytes. */
export function unprotectLimit(size: number): number {
  return 2 * size + 16 * 1024 * 1024;
}

/** qpdf's arguments for the one write: the typed password if any, then the file written with no encryption. */
export function unprotectArgs(password: string | undefined): string[] {
  return ['--progress', ...passwordArgsFor(password), '/in.pdf', '--decrypt', '--', '/out.pdf'];
}

const unreadable = 'qpdf could not read the file.';
const wrongPassword = 'A password did not open the file.';

/**
 * Whether qpdf reads these bytes as encrypted, on its own fresh qpdf (qpdf will not write JSON on an instance that
 * has written). Only `encrypt.encrypted` is taken from the answer; nothing else of it is kept, returned or put in
 * an error.
 */
export async function isEncrypted(tools: EngineTools, bytes: Uint8Array, password: string | undefined): Promise<boolean> {
  const reader = await freshQpdf(tools, bytes);
  const { code, out, printed } = reader.call([...passwordArgsFor(password), '--json=2', '--json-key=encrypt', '/in.pdf']);
  if (!finished(code)) throw new Error(saidInvalidPassword(printed) ? wrongPassword : unreadable);
  let encrypted: unknown;
  try {
    const answer: unknown = JSON.parse(out);
    encrypted = isDict(answer) && isDict(answer.encrypt) ? answer.encrypt.encrypted : undefined;
  } catch {
    encrypted = undefined;
  }
  if (typeof encrypted !== 'boolean') throw new Error(unreadable);
  return encrypted;
}

/**
 * The file written with no encryption, capped at `limit`. The writer lives only in this function, and the capped
 * write removes /in.pdf before /out.pdf is read, so the input is let go before the output is held.
 */
export async function unprotectedBytes(
  tools: EngineTools,
  file: Uint8Array,
  password: string | undefined,
  onWriting: (percent: number) => void,
  limit: number = unprotectLimit(file.length),
): Promise<Uint8Array> {
  const writer = await freshQpdf(tools, file);
  const written = cappedWrite(writer, limit, (qpdf) => qpdf.call(unprotectArgs(password)), onWriting);
  if (!finished(written.code)) throw new Error(saidInvalidPassword(written.printed) ? wrongPassword : 'qpdf could not write the unprotected file.');
  return writer.read('/out.pdf');
}

const notChecked = 'The unprotected file did not pass its check.';

/**
 * Checks the new file with no password, moving progress to 55 and 100 as each step passes: it is read as not
 * encrypted (quick), then `--check` on a fresh qpdf holding only the new file (reads every stream).
 */
async function verify(tools: EngineTools, out: Uint8Array, onStep: (percent: number) => void): Promise<void> {
  let encrypted: boolean;
  try {
    encrypted = await isEncrypted(tools, out, undefined);
  } catch {
    throw new Error(notChecked);
  }
  if (encrypted) throw new Error(notChecked);
  onStep(55);
  const checker = await freshQpdf(tools, out);
  if (!finished(checker.call(['--check', '/in.pdf']).code)) throw new Error(notChecked);
  onStep(100);
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const [file] = files;
  if (files.length !== 1 || file === undefined) throw new Error('This tool takes one file.');
  const password = passwordFrom(options);
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });
  // A file with no password and no restrictions: nothing to remove, so no new file (owner, 22 Nov 2026).
  if (!(await isEncrypted(tools, file, password))) return [];
  const out = await unprotectedBytes(tools, file, password, (percent) => onProgress({ stage: 'writing', percent: percent * 0.5 }));
  await verify(tools, out, (percent) => onProgress({ stage: 'writing', percent }));
  return [out];
};

/**
 * Reads the file as every PDF tool does, with one qpdf call. A file qpdf calls damaged because its encryption is
 * of a kind it cannot open, such as a certificate, is named as one this tool cannot read instead. The match on
 * qpdf's words picks the wording only: such a file is refused either way.
 */
export const inspect: Inspector = async (file, password, tools) => {
  const { outcome, printed } = await readPdf(file, password, tools);
  return outcome.kind === 'damaged' && /unsupported encryption/i.test(printed) ? { kind: 'unsupported' } : outcome;
};
