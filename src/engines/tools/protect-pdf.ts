// Protect with a password: writes one PDF again, encrypted with 256-bit AES
// (revision 6), so that it opens only with the password the visitor typed.
//
// One qpdf call opens the file, with its own password if it has one, and
// writes it with the new password for opening and for permissions alike, every
// permission allowed and object streams generated. Old restrictions are not
// kept: the new file allows everything (the agent's reading, an owner question).
// The title and XMP details stay encrypted. qpdf's options that leave the
// details in clear, allow an empty or weak key, or print the encryption (with
// the password) are never used; a unit test reads this file to make sure. The
// file is written afresh, so earlier saved versions inside
// it are not kept and a digital signature stops being valid, as the page says.
//
// The passwords go only into qpdf's in-memory argument list, in the named form
// (--password=, --user-password=, --owner-password=), never into an argument
// file, an error or a progress message. What qpdf prints is never passed on:
// every error here is a fixed sentence.
//
// Before the file is given back, a fresh qpdf checks it: AES-256 with every
// permission, `--check` passing with the password, and refused without it.

import { inspectPdf } from '../inspect';
import { freshQpdf, passwordFrom } from '../plain';
import { cappedWrite, finished, saidInvalidPassword } from '../qpdf';
import { isDict, passwordArgsFor } from '../qpdf-json';
import type { Engine, EngineTools, Inspector } from '../types';
import { acceptedPassword, PasswordRefused } from '../../widget/option-values';

type Options = { passwords?: unknown; newPassword?: unknown };

/** The new file is held to twice the input and 16 MB. Encryption adds at most 32 bytes to each string and stream. */
export function protectLimit(size: number): number {
  return 2 * size + 16 * 1024 * 1024;
}

/** qpdf's arguments for the one write: the input's own password if any, then the new one for opening and permissions. */
export function protectArgs(old: string | undefined, password: string): string[] {
  return [
    '--progress',
    ...passwordArgsFor(old),
    '/in.pdf',
    '--object-streams=generate',
    '--encrypt',
    `--user-password=${password}`,
    `--owner-password=${password}`,
    '--bits=256',
    '--',
    '/out.pdf',
  ];
}

/**
 * The file written with the new password, capped at `limit`. The writer lives only in this function, and the
 * capped write removes /in.pdf before /out.pdf is read, so the input is let go before the output is held.
 */
export async function protectedBytes(
  tools: EngineTools,
  file: Uint8Array,
  old: string | undefined,
  password: string,
  onWriting: (percent: number) => void,
  limit: number = protectLimit(file.length),
): Promise<Uint8Array> {
  const writer = await freshQpdf(tools, file);
  const written = cappedWrite(writer, limit, (qpdf) => qpdf.call(protectArgs(old, password)), onWriting);
  if (!finished(written.code)) {
    throw new Error(saidInvalidPassword(written.printed) ? 'A password did not open the file.' : 'qpdf could not write the protected file.');
  }
  return writer.read('/out.pdf');
}

/** Every permission qpdf reports for an encrypted file. */
const capabilities = ['accessibility', 'extract', 'modify', 'modifyannotations', 'modifyassembly', 'modifyforms', 'modifyother', 'printhigh', 'printlow'];

/** Whether qpdf's `encrypt` answer is 256-bit AES, revision 6, opened by the password, with every permission. */
export function strongEncryption(answer: unknown): boolean {
  if (!isDict(answer) || !isDict(answer.encrypt)) return false;
  const { encrypt } = answer;
  const parameters = encrypt.parameters;
  const allowed = encrypt.capabilities;
  if (!isDict(parameters) || !isDict(allowed)) return false;
  return (
    encrypt.encrypted === true &&
    encrypt.userpasswordmatched === true &&
    parameters.R === 6 &&
    parameters.V === 5 &&
    parameters.bits === 256 &&
    parameters.stringmethod === 'AESv3' &&
    parameters.streammethod === 'AESv3' &&
    parameters.filemethod === 'AESv3' &&
    capabilities.every((name) => allowed[name] === true)
  );
}

const notChecked = 'The protected file did not pass its check.';

/**
 * Checks the new file on a fresh qpdf, moving progress to 55, 95 and 100 as each step passes: the JSON answer is
 * quick, `--check` with the password reads every stream and takes about as long as the write, the refusal is quick.
 */
async function verify(tools: EngineTools, out: Uint8Array, password: string, onStep: (percent: number) => void): Promise<void> {
  const checker = await freshQpdf(tools, out);
  const described = checker.call([`--password=${password}`, '--json=2', '--json-key=encrypt', '/in.pdf']);
  if (!finished(described.code)) throw new Error(notChecked);
  let answer: unknown;
  try {
    answer = JSON.parse(described.out);
  } catch {
    throw new Error(notChecked);
  }
  if (!strongEncryption(answer)) throw new Error(notChecked);
  onStep(55);
  if (!finished(checker.call([`--password=${password}`, '--check', '/in.pdf']).code)) throw new Error(notChecked);
  onStep(95);
  const without = checker.call(['--check', '/in.pdf']);
  if (finished(without.code) || !saidInvalidPassword(without.printed)) throw new Error(notChecked);
  onStep(100);
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const [file] = files;
  if (files.length !== 1 || file === undefined) throw new Error('Protect takes one file.');
  // Refused before any work, with an error that holds nothing of what was sent.
  const password = acceptedPassword('protect-pdf', 'newPassword', options.newPassword);
  if (password === undefined) throw new PasswordRefused();
  const old = passwordFrom(options);
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });
  const out = await protectedBytes(tools, file, old, password, (percent) => onProgress({ stage: 'writing', percent: percent * 0.5 }));
  await verify(tools, out, password, (percent) => onProgress({ stage: 'writing', percent }));
  return [out];
};

export const inspect: Inspector = inspectPdf;
