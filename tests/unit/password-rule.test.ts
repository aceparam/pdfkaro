// The new password's character rule (src/widget/option-values.ts) against the readers: a password made of every
// character the rule takes, and passwords that look like qpdf options or argument files, encrypt with this repo's
// qpdf at 256-bit AES and open with that password, and no other, in qpdf and in PDF.js. And qpdf's random salts:
// the same file encrypted twice with the same password gives different keys and different encrypted bytes, so a
// later qpdf package with broken randomness fails the build. Only tests/fixtures/text.pdf is read.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQpdf, finished } from '../../src/engines/qpdf';
import { passwordCharacters, passwordProblem } from '../../src/widget/option-values';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const input = new Uint8Array(readFileSync(join(__dirname, '../fixtures/text.pdf')));

/** Every character the rule takes, from its range, with the space moved inside: 95 characters. */
const { from, to } = passwordCharacters['printable-ascii'];
const every = Array.from({ length: to - from + 1 }, (_, index) => String.fromCharCode(from + index)).join('');
const allOfThem = `${every.slice(1, 48)} ${every.slice(48)}`;

/** Encrypts the fixture with P for opening and for permissions, in the named form the engine will use. */
async function encrypt(password: string): Promise<Uint8Array> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', input);
  const run = qpdf.call(['/in.pdf', '--encrypt', `--user-password=${password}`, `--owner-password=${password}`, '--bits=256', '--', '/out.pdf']);
  expect(finished(run.code), run.printed).toBe(true);
  return qpdf.read('/out.pdf');
}

/** Runs qpdf on a file with these arguments, a fresh qpdf each time. A file named in.pdf is there too, so an argument file would be found. */
async function qpdfOn(bytes: Uint8Array, args: string[]) {
  const qpdf = await makeQpdf();
  qpdf.write('/file.pdf', bytes);
  qpdf.write('/in.pdf', new TextEncoder().encode('--decrypt\n'));
  return qpdf.call([...args, '/file.pdf']);
}

/** Opens a file in PDF.js with a password: its page count, or the name of the error. */
async function pdfjsOpens(bytes: Uint8Array, password?: string): Promise<number | string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 });
  try {
    const doc = await task.promise;
    const pages = doc.numPages;
    await task.destroy();
    return pages;
  } catch (error) {
    await task.destroy();
    return error instanceof Error ? error.name : 'unknown';
  }
}

describe('the printable ASCII rule against qpdf and PDF.js', () => {
  it('is 95 characters, all of which the rule takes, spaces inside only', () => {
    expect(allOfThem).toHaveLength(95);
    expect(new Set(allOfThem).size).toBe(95);
    expect(passwordProblem(allOfThem, { maxLength: 127, characters: 'printable-ascii' })).toBeNull();
  });

  it.each([
    ['every character the rule takes', allOfThem],
    ['a password that looks like an option', '--help'],
    ['a password that looks like an argument file', '@in.pdf'],
  ])('%s: opens with it, and with no other, in qpdf and PDF.js', async (_name, password) => {
    expect(passwordProblem(password, { maxLength: 127, characters: 'printable-ascii' })).toBeNull();
    const locked = await encrypt(password);
    const shorter = password.slice(0, -1);

    const checked = await qpdfOn(locked, [`--password=${password}`, '--check']);
    expect(checked.code, checked.printed).toBe(0);
    const shown = await qpdfOn(locked, [`--password=${password}`, '--show-encryption']);
    expect(shown.code).toBe(0);
    expect(shown.out).toContain('R = 6');
    expect(shown.out).toContain('stream encryption method: AESv3');
    expect(shown.out).toContain('string encryption method: AESv3');
    expect(shown.out).toContain(`User password = ${password}`);
    for (const wrong of [shorter, '', `${password}x`]) {
      const refused = await qpdfOn(locked, [`--password=${wrong}`, '--check']);
      expect(refused.code, JSON.stringify(wrong)).toBe(2);
      expect(refused.printed).toContain('invalid password');
    }

    expect(await pdfjsOpens(locked, password)).toBe(3);
    expect(await pdfjsOpens(locked, shorter)).toBe('PasswordException');
    expect(await pdfjsOpens(locked)).toBe('PasswordException');
  });
});

describe("qpdf's random salts", () => {
  /** The encryption dictionary, and the raw (encrypted) bytes of the first page's content stream, as qpdf shows them. */
  async function parts(locked: Uint8Array, password: string) {
    const json = await qpdfOn(locked, [`--password=${password}`, '--json', '--json-key=qpdf']);
    expect(json.code).toBe(0);
    const objects = (JSON.parse(json.out) as { qpdf: [unknown, Record<string, { value?: Record<string, unknown>; stream?: { dict: Record<string, unknown> } }>] }).qpdf[1];
    const trailer = objects.trailer?.value ?? {};
    const encrypt = objects[`obj:${String(trailer['/Encrypt'])}`]?.value ?? {};
    const root = objects[`obj:${String(trailer['/Root'])}`]?.value ?? {};
    const pagesRef = String(root['/Pages']);
    const firstPage = String((objects[`obj:${pagesRef}`]?.value?.['/Kids'] as string[])[0]);
    const contentRef = String((objects[`obj:${firstPage}`]?.value?.['/Contents'] as string[])[0]);
    const length = Number(objects[`obj:${contentRef}`]?.stream?.dict['/Length']);
    // Where the stream's object starts, from qpdf's cross-reference table; its data follows the stream keyword.
    const xref = await qpdfOn(locked, [`--password=${password}`, '--show-xref']);
    const number = contentRef.split(' ')[0];
    const offset = Number(new RegExp(`^${number}/0: uncompressed; offset = (\\d+)$`, 'm').exec(xref.out)?.[1]);
    const text = new TextDecoder('latin1').decode(locked);
    const keyword = text.indexOf('stream', offset);
    const start = keyword + 'stream'.length + (text[keyword + 6] === '\r' ? 2 : 1);
    return { encrypt, data: locked.slice(start, start + length), length };
  }

  it('gives different keys and encrypted bytes for the same file and password, encrypted twice', async () => {
    const password = 'open  Sesame-9';
    const a = await parts(await encrypt(password), password);
    const b = await parts(await encrypt(password), password);
    for (const key of ['/U', '/O', '/UE', '/OE']) {
      expect(typeof a.encrypt[key], key).toBe('string');
      expect(String(a.encrypt[key]).length, key).toBeGreaterThan(10);
      expect(a.encrypt[key], key).not.toBe(b.encrypt[key]);
    }
    expect(a.length).toBeGreaterThan(16);
    expect(a.length).toBe(b.length);
    expect(a.data).toHaveLength(a.length);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(false);
  });
});
