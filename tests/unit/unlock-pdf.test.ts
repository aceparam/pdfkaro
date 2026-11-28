// The Remove a password engine (the catalogue's Unlock PDF), with the same qpdf the browser uses and PDF.js's
// legacy build: its arguments and source, real runs on every file in the test set, protected copies made in the
// test that keep everything, older encryption, a recovered opening password never kept, only the typed password
// used, the inspector and the shared readPdf, the check before a file is given back, progress, the cap, and errors
// that never hold a password.

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectPdf, readPdf } from '../../src/engines/inspect';
import { createQpdf, finished, oneFileLimit as unprotectLimit, OutputLimit, type Qpdf } from '../../src/engines/qpdf';
import { inspect, isEncrypted, run, unprotectArgs, unprotectedBytes } from '../../src/engines/tools/unlock-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';
import { certificatePdf } from './unlock-helpers';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { qpdf: makeQpdf };
const fixturesDir = join(__dirname, '../fixtures');
const fixture = (name: string) => new Uint8Array(readFileSync(join(fixturesDir, name)));
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

/** The marked password for files protected in the test, with a space, #, % and @. */
const P = 'Qz7 pw#%@ Kv4';
/** A marked password for permissions, different from the one to open. */
const O = 'Ow9 perm#%@ Zx2';
const open = 'open-sesame';
const ownerSecret = 'owner-secret';

async function unprotect(file: Uint8Array, passwords: (string | undefined)[] = [], given: EngineTools = tools) {
  const progress: Progress[] = [];
  const outputs = await run([file], { passwords }, (step) => progress.push(step), given);
  return { output: outputs[0], outputs, progress };
}

async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string; printed: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}
const withPassword = (given?: string) => (given === undefined ? [] : [`--password=${given}`]);

/** qpdf's JSON answer on a file's encryption, read with a password. */
async function encryptionOf(bytes: Uint8Array, given?: string): Promise<Record<string, unknown>> {
  const { code, out } = await qpdfOn(bytes, [...withPassword(given), '--json=2', '--json-key=encrypt']);
  expect(finished(code)).toBe(true);
  return (JSON.parse(out) as { encrypt: Record<string, unknown> }).encrypt;
}

/** `text.pdf` (or another file) encrypted in the test with these options after `--encrypt`. Weak kinds are made here only. */
async function encrypted(args: string[], from: Uint8Array = fixture('text.pdf')): Promise<Uint8Array> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', from);
  const made = qpdf.call(['/in.pdf', '--allow-weak-crypto', '--encrypt', ...args, '--', '/out.pdf']);
  expect(finished(made.code)).toBe(true);
  return qpdf.read('/out.pdf');
}
const aes256 = (from: Uint8Array) => encrypted([`--user-password=${P}`, `--owner-password=${O}`, '--bits=256'], from);

/** The file opened with a password, decrypted and written with every stream decoded, as text. */
async function plainDump(bytes: Uint8Array, given?: string): Promise<string> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const { code } = qpdf.call([...withPassword(given), '--decrypt', '--qdf', '--object-streams=disable', '--stream-data=uncompress', '/in.pdf', '/out.pdf']);
  expect(finished(code)).toBe(true);
  return latin1(qpdf.read('/out.pdf'));
}

const pdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
type Task = ReturnType<Awaited<ReturnType<typeof pdfjs>>['getDocument']>;
type Doc = Awaited<Task['promise']>;
type Opened = { doc: Doc; close(): Promise<void> };

/** Opens a file in PDF.js: the document with a way to close it, or the name of the error. */
async function pdfjsOpen(bytes: Uint8Array, given?: string): Promise<Opened | string> {
  const task = (await pdfjs()).getDocument({ data: bytes.slice(), password: given, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  try {
    return { doc: await task.promise, close: () => task.destroy() };
  } catch (error) {
    await task.destroy();
    return error instanceof Error ? error.name : 'unknown';
  }
}

async function opened(bytes: Uint8Array, given?: string): Promise<Opened> {
  const result = await pdfjsOpen(bytes, given);
  if (typeof result === 'string') throw new Error(`PDF.js did not open the file: ${result}`);
  return result;
}

type Outline = { title: string; destpageposfrom1: number | null; kids: Outline[] };
type Field = { fullname: string; fieldtype: string; value: unknown; pageposfrom1: number };
type Attachment = { preferredname: string; streams: Record<string, unknown> };

/** What a reader shows of a file, read with a password: each page's size, turn and text in PDF.js; bookmarks, form fields with values, and attached files with their contents in qpdf. */
async function shown(bytes: Uint8Array, given?: string) {
  const { doc, close } = await opened(bytes, given);
  const pages: { view: number[]; rotate: number; text: string }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push({ view: [...page.view], rotate: page.rotate, text: content.items.map((item) => ('str' in item ? item.str : '')).join(' ') });
    page.cleanup();
  }
  await close();
  const { code, out } = await qpdfOn(bytes, [...withPassword(given), '--json=2', '--json-key=outlines', '--json-key=acroform', '--json-key=attachments']);
  expect(finished(code)).toBe(true);
  const json = JSON.parse(out) as { outlines: Outline[]; acroform: { fields: Field[] }; attachments: Record<string, Attachment> };
  const outline = (items: Outline[]): unknown[] => items.map((item) => ({ title: item.title, page: item.destpageposfrom1, kids: outline(item.kids) }));
  const fields = json.acroform.fields.map(({ fullname, fieldtype, value, pageposfrom1 }) => ({ fullname, fieldtype, value, pageposfrom1 }));
  const attachments: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(json.attachments)) {
    const contents = await qpdfOn(bytes, [...withPassword(given), `--show-attachment=${key}`]);
    attachments[key] = { name: entry.preferredname, streams: entry.streams, contents: contents.out };
  }
  return { pages, outline: outline(json.outlines), fields, attachments };
}

/** A result that is not encrypted, passes qpdf's check with no password, and opens in PDF.js with none. */
async function expectUnprotected(output: Uint8Array | undefined) {
  expect(output).toBeInstanceOf(Uint8Array);
  expect((await encryptionOf(output!)).encrypted).toBe(false);
  expect(finished((await qpdfOn(output!, ['--check'])).code)).toBe(true);
  const result = await pdfjsOpen(output!);
  expect(typeof result).not.toBe('string');
  if (typeof result !== 'string') await result.close();
}

/** A spy on tools.qpdf: every instance made, with every argument list it was called with, in order. */
function spied() {
  const instances: string[][][] = [];
  const given: EngineTools = {
    qpdf: async () => {
      const real = await makeQpdf();
      const calls: string[][] = [];
      instances.push(calls);
      return {
        ...real,
        call: (args: string[]) => (calls.push([...args]), real.call(args)),
        set onLine(listener: Qpdf['onLine']) {
          real.onLine = listener;
        },
        get onLine() {
          return real.onLine;
        },
      } satisfies Qpdf;
    },
  };
  return { instances, given };
}

const damaged = new Set(['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']);
/** The test set's encrypted files, with the password each needs to open (none for restrictions only). */
const encryptedFixtures: Record<string, string | undefined> = { 'password.pdf': open, 'restricted.pdf': undefined, 'compress-password.pdf': open };
const fixtures = readdirSync(fixturesDir)
  .filter((name) => name.endsWith('.pdf'))
  .sort();

describe('the arguments and the source', () => {
  it('use the named --password= form, --decrypt, and nothing else', () => {
    expect(unprotectArgs(undefined)).toEqual(['--progress', '/in.pdf', '--decrypt', '--', '/out.pdf']);
    expect(unprotectArgs(P)).toEqual(['--progress', `--password=${P}`, '/in.pdf', '--decrypt', '--', '/out.pdf']);
  });

  it('never print the encryption, allow weak crypto, remove a certification\'s restrictions, or use an argument file', () => {
    const source = readFileSync(join(__dirname, '../../src/engines/tools/unlock-pdf.ts'), 'utf8');
    for (const forbidden of ['--show-encryption', '--allow-weak-crypto', '--remove-restrictions', 'callWithArgumentFile', 'callWithPassword', 'console.']) {
      expect(source, forbidden).not.toContain(forbidden);
      for (const arg of [...unprotectArgs(undefined), ...unprotectArgs(P)]) expect(arg.startsWith(forbidden)).toBe(false);
    }
  });

  it('read a password that looks like an option as a password', async () => {
    for (const odd of ['--help', '@in.pdf', '--decrypt']) {
      const file = await encrypted([`--user-password=${odd}`, `--owner-password=${odd}`, '--bits=256']);
      const { output } = await unprotect(file, [odd]);
      await expectUnprotected(output);
    }
  });

  it('takes one file only', async () => {
    await expect(run([], {}, () => {}, tools)).rejects.toThrow('This tool takes one file.');
    await expect(run([fixture('text.pdf'), fixture('text.pdf')], {}, () => {}, tools)).rejects.toThrow('This tool takes one file.');
  });
});

describe('every file in the test set', () => {
  it('holds the files the README lists', () => {
    for (const name of ['text.pdf', 'pages-500.pdf', 'scanned.pdf', 'password.pdf', 'restricted.pdf', 'warning.pdf', 'form.pdf', 'mixed.pdf', 'rich.pdf', 'images.pdf', 'tagged.pdf']) {
      expect(fixtures).toContain(name);
    }
  });

  for (const [name, password] of Object.entries(encryptedFixtures)) {
    it(`${name}: written not encrypted, every permission, its pages and text as before, no password in its bytes`, async () => {
      const file = fixture(name);
      const before = await encryptionOf(file, password);
      expect(before.encrypted).toBe(true);
      const { output } = await unprotect(file, [password]);
      await expectUnprotected(output);
      // Not encrypted: qpdf reports every permission allowed.
      const after = await encryptionOf(output!);
      expect(Object.values(after.capabilities as Record<string, boolean>).every(Boolean)).toBe(true);
      expect((await shown(output!)).pages).toEqual((await shown(file, password)).pages);
      for (const secret of [open, ownerSecret]) expect(latin1(output!)).not.toContain(secret);
    }, 60_000);
  }

  it('password.pdf opens with its password for permissions, owner-secret, too', async () => {
    const { output } = await unprotect(fixture('password.pdf'), [ownerSecret]);
    await expectUnprotected(output);
    expect((await shown(output!)).pages).toEqual((await shown(fixture('password.pdf'), open)).pages);
  });

  for (const name of fixtures.filter((each) => !damaged.has(each) && !(each in encryptedFixtures))) {
    it(`${name}: not encrypted, so nothing to remove and no file`, async () => {
      const { outputs, progress } = await unprotect(fixture(name));
      expect(outputs).toEqual([]);
      expect(progress).toEqual([{ stage: 'reading', unit: 'file', done: 0, total: 1 }]);
    });
  }

  for (const name of [...damaged]) {
    it(`${name}: read as damaged before a job, and the job fails with a fixed sentence`, async () => {
      expect(await inspect(fixture(name), undefined, tools)).toEqual({ kind: 'damaged' });
      await expect(unprotect(fixture(name))).rejects.toThrow('qpdf could not read the file.');
    });
  }
});

describe('what the new file keeps', () => {
  it('rich.pdf, protected in the test: its bookmarks, link and note.txt with its contents', async () => {
    const file = await aes256(fixture('rich.pdf'));
    const { output } = await unprotect(file, [P]);
    await expectUnprotected(output);
    const read = await shown(output!);
    expect(read).toEqual(await shown(fixture('rich.pdf')));
    expect(read.outline).toEqual([
      { title: 'Chapter one', page: 1, kids: [] },
      { title: 'Chapter two', page: 2, kids: [] },
    ]);
    expect(read.attachments['note.txt']).toMatchObject({ name: 'note.txt', contents: 'A note kept inside the PDF.\n' });
    const { doc, close } = await opened(output!);
    const links = (await (await doc.getPage(1)).getAnnotations()).filter((annotation: { subtype?: string }) => annotation.subtype === 'Link');
    expect(links.length).toBeGreaterThan(0);
    await close();
  });

  it('form.pdf, protected in the test: its fields and the value typed in one', async () => {
    const { output } = await unprotect(await aes256(fixture('form.pdf')), [P]);
    await expectUnprotected(output);
    const { fields } = await shown(output!);
    expect(fields.find((field) => field.fullname === 'name')?.value).toBe('u:Sample text');
    expect(fields.find((field) => field.fullname === 'agree')?.fieldtype).toBe('/Btn');
  });

  it('tagged.pdf, protected in the test: its tags, named destination, reading thread, note, link and tagged field with its value', async () => {
    const { output } = await unprotect(await aes256(fixture('tagged.pdf')), [P]);
    await expectUnprotected(output);
    const dump = await plainDump(output!);
    for (const marker of ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-THREAD-TITLE', 'SECRET-NOTE', 'SECRET-LINK', 'SECRET-DEST-NAME', 'SECRET-PAGE-TWO-TEXT']) {
      expect(dump, marker).toContain(marker);
    }
    for (const key of ['/StructTreeRoot', '/MarkInfo', '/Dests', '/Threads']) expect(dump, key).toContain(key);
    const { fields } = await shown(output!);
    expect(fields.find((field) => field.fullname === 'SECRET-TAGGED-FIELD')?.value).toBe('u:SECRET-TAGGED-VALUE');
    const { doc, close } = await opened(output!);
    expect(await (await doc.getPage(2)).getStructTree()).not.toBeNull();
    await close();
  });

  it('mixed.pdf and pages-500.pdf, protected in the test: every page, with the size, turn and text it had', async () => {
    for (const name of ['mixed.pdf', 'pages-500.pdf']) {
      const { output } = await unprotect(await aes256(fixture(name)), [P]);
      await expectUnprotected(output);
      const after = await shown(output!);
      expect(after.pages).toEqual((await shown(fixture(name))).pages);
      expect(after.pages.length).toBe(name === 'mixed.pdf' ? 4 : 500);
    }
  }, 120_000);
});

describe('older and other encryption', () => {
  const kinds: [string, string[]][] = [
    ['128-bit AES', [`--user-password=${P}`, `--owner-password=${O}`, '--bits=128', '--use-aes=y']],
    ['128-bit RC4', [`--user-password=${P}`, `--owner-password=${O}`, '--bits=128', '--use-aes=n']],
    ['40-bit RC4', [`--user-password=${P}`, `--owner-password=${O}`, '--bits=40']],
  ];

  for (const [kind, args] of kinds) {
    it(`${kind}, opened with its password and with its password for permissions: not encrypted, passing the check`, async () => {
      const file = await encrypted(args);
      expect((await encryptionOf(file, P)).encrypted).toBe(true);
      for (const given of [P, O]) {
        const { output } = await unprotect(file, [given]);
        await expectUnprotected(output);
        expect((await shown(output!)).pages).toEqual((await shown(fixture('text.pdf'))).pages);
      }
    });
  }

  it('a file with only a password for permissions (256-bit AES, printing and changes refused): no password needed', async () => {
    const file = await encrypted(['--user-password=', `--owner-password=${O}`, '--bits=256', '--print=none', '--modify=none']);
    expect(Object.values((await encryptionOf(file)).capabilities as Record<string, boolean>)).toContain(false);
    expect(await inspect(file, undefined, tools)).toEqual({ kind: 'ready', pages: 3 });
    const { output } = await unprotect(file);
    await expectUnprotected(output);
    expect(Object.values((await encryptionOf(output!)).capabilities as Record<string, boolean>).every(Boolean)).toBe(true);
  });
});

describe('a recovered opening password is never kept', () => {
  for (const [kind, args] of [
    ['128-bit RC4', ['--bits=128', '--use-aes=n']],
    ['128-bit AES', ['--bits=128', '--use-aes=y']],
  ] as const) {
    it(`${kind}, opened with its password for permissions: the opening password is in no return value, progress report or error`, async () => {
      const file = await encrypted([`--user-password=${P}`, `--owner-password=${O}`, ...args]);
      // qpdf's own answer holds the opening password it recovered, so this test proves something.
      const answer = await encryptionOf(file, O);
      expect(answer.recovereduserpassword).toBe(P);

      const seen: unknown[] = [];
      seen.push(await isEncrypted(tools, file, O));
      const { outputs, progress } = await unprotect(file, [O]);
      seen.push(progress);
      await expectUnprotected(outputs[0]);
      expect(latin1(outputs[0]!)).not.toContain(P);
      expect(latin1(outputs[0]!)).not.toContain(O);

      // Errors on the way: a wrong password, and a result that is still encrypted.
      const errors: unknown[] = [];
      await unprotect(file, ['wrong']).catch((error: unknown) => errors.push(error));
      await unprotect(file, [O], stillEncryptedWriter()).catch((error: unknown) => errors.push(error));
      expect(errors).toHaveLength(2);
      for (const error of errors) seen.push((error as Error).message, (error as Error).stack);
      const said = JSON.stringify(seen);
      for (const part of [P, 'Qz7', 'Kv4', O, 'Ow9', 'Zx2']) expect(said, part).not.toContain(part);
    });
  }
});

/** Tools whose qpdf writes the file as it was, still encrypted, in place of `--decrypt`: a writer that copies the input. */
function stillEncryptedWriter(): EngineTools {
  return {
    qpdf: async () => {
      const real = await makeQpdf();
      return {
        ...real,
        call: (args: string[]) => real.call(args.filter((arg) => arg !== '--decrypt')),
        set onLine(listener: Qpdf['onLine']) {
          real.onLine = listener;
        },
        get onLine() {
          return real.onLine;
        },
      } satisfies Qpdf;
    },
  };
}

describe('only the typed password', () => {
  it('appears only as --password=P, once in the reading and once in the write; the check holds none', async () => {
    const { instances, given } = spied();
    const { output } = await unprotect(fixture('password.pdf'), [open], given);
    await expectUnprotected(output);
    // The reading and the write, each on its own fresh qpdf; then one fresh qpdf for the result's reading and check.
    expect(instances.map((calls) => calls.length)).toEqual([1, 1, 2]);
    const [reading, writing, checkRead, check] = instances.flat();
    expect(reading).toEqual([`--password=${open}`, '--json=2', '--json-key=encrypt', '/in.pdf']);
    expect(writing).toEqual(unprotectArgs(open));
    expect(checkRead).toEqual(['--json=2', '--json-key=encrypt', '/in.pdf']);
    expect(check).toEqual(['--check', '/in.pdf']);
    const all = instances.flat(2);
    expect(all.filter((arg) => arg.includes(open))).toEqual([`--password=${open}`, `--password=${open}`]);
  });

  it('a wrong password gives the fixed sentence, and no other password is tried', async () => {
    const { instances, given } = spied();
    await expect(unprotect(fixture('password.pdf'), ['open-sesam'], given)).rejects.toThrow('A password did not open the file.');
    expect(instances).toEqual([[[`--password=open-sesam`, '--json=2', '--json-key=encrypt', '/in.pdf']]]);
  });

  it('no password for a file that needs one gives the fixed sentence, with no password tried', async () => {
    const { instances, given } = spied();
    await expect(unprotect(fixture('password.pdf'), [], given)).rejects.toThrow('A password did not open the file.');
    expect(instances.flat(2).some((arg) => arg.startsWith('--password'))).toBe(false);
  });

  it('a file with restrictions only: no password in any call', async () => {
    const { instances, given } = spied();
    await expectUnprotected((await unprotect(fixture('restricted.pdf'), [], given)).output);
    expect(instances.flat(2).some((arg) => arg.startsWith('--password'))).toBe(false);
  });
});

describe('the inspector, and the shared readPdf', () => {
  it('password.pdf with none, the right and a wrong password: needs-password, ready and wrong-password', async () => {
    expect(await inspect(fixture('password.pdf'), undefined, tools)).toEqual({ kind: 'needs-password' });
    expect(await inspect(fixture('password.pdf'), open, tools)).toEqual({ kind: 'ready', pages: 3 });
    expect(await inspect(fixture('password.pdf'), ownerSecret, tools)).toEqual({ kind: 'ready', pages: 3 });
    expect(await inspect(fixture('password.pdf'), 'open-sesam', tools)).toEqual({ kind: 'wrong-password' });
    expect(await inspect(fixture('restricted.pdf'), undefined, tools)).toEqual({ kind: 'ready', pages: 3 });
  });

  it('a file encrypted with a certificate filter is unsupported, read with one qpdf call; other tools still call it damaged', async () => {
    const file = certificatePdf();
    const { instances, given } = spied();
    expect(await inspect(file, undefined, given)).toEqual({ kind: 'unsupported' });
    expect(instances).toEqual([[['--show-npages', '/in.pdf']]]);
    expect(await inspectPdf(file, undefined, tools)).toEqual({ kind: 'damaged' });
    expect((await readPdf(file, undefined, tools)).printed).toMatch(/unsupported encryption filter/);
    // And the job, if it were ever sent one, fails with a fixed sentence.
    await expect(unprotect(file)).rejects.toThrow('qpdf could not read the file.');
  });

  it('damaged-xref.pdf and damaged-cut.pdf stay damaged', async () => {
    for (const name of ['damaged-xref.pdf', 'damaged-cut.pdf']) expect(await inspect(fixture(name), undefined, tools), name).toEqual({ kind: 'damaged' });
  });

  for (const name of fixtures) {
    it(`readPdf gives inspectPdf's outcome for ${name}, with what qpdf printed`, async () => {
      const password = encryptedFixtures[name];
      const read = await readPdf(fixture(name), password, tools);
      expect(read.outcome).toEqual(await inspectPdf(fixture(name), password, tools));
      expect(typeof read.printed).toBe('string');
      if (read.outcome.kind === 'ready') expect(read.printed).toContain(String(read.outcome.pages));
      // The engine's inspector gives the same outcome for every file in the set: none has a certificate.
      expect(await inspect(fixture(name), password, tools)).toEqual(read.outcome);
    });
  }
});

describe('the check, progress and the cap', () => {
  it('a result that is still encrypted is refused with the check\'s sentence', async () => {
    await expect(unprotect(fixture('restricted.pdf'), [], stillEncryptedWriter())).rejects.toThrow('The unprotected file did not pass its check.');
    await expect(unprotect(fixture('password.pdf'), [open], stillEncryptedWriter())).rejects.toThrow('The unprotected file did not pass its check.');
  });

  it('progress: reading first, then writing percentages that never go back, the write up to 50, with 55 and 100 last', async () => {
    const { progress } = await unprotect(await aes256(fixture('pages-500.pdf')), [P]);
    expect(progress[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    const percents = progress.slice(1).map((step) => (step.stage === 'writing' ? step.percent : Number.NaN));
    expect(percents.every((percent) => Number.isFinite(percent))).toBe(true);
    expect(percents).toEqual([...percents].sort((x, y) => x - y));
    expect(percents.slice(-2)).toEqual([55, 100]);
    expect(percents.slice(0, -2).every((percent) => percent <= 50)).toBe(true);
    expect(percents.length).toBeGreaterThan(3);
  });

  it('the cap is twice the file and 16 MB', () => {
    expect(unprotectLimit(0)).toBe(16 * 1024 * 1024);
    expect(unprotectLimit(1000)).toBe(2000 + 16 * 1024 * 1024);
  });

  it('a write under a cap smaller than the result is stopped with OutputLimit', async () => {
    const file = await aes256(fixture('pages-500.pdf'));
    const written = await unprotectedBytes(tools, file, P, () => {});
    expect(written.length).toBeLessThan(unprotectLimit(file.length));
    await expect(unprotectedBytes(tools, file, P, () => {}, 10_000)).rejects.toBeInstanceOf(OutputLimit);
  });

  it('running out of memory while the result is read or the input\'s answer is parsed comes out of run unchanged', async () => {
    // The third qpdf made is the checker: its first call (the reading of the result) runs out of memory.
    let made = 0;
    const checkerOutOfMemory: EngineTools = {
      qpdf: async () => {
        const real = await makeQpdf();
        made += 1;
        if (made !== 3) return real;
        return {
          ...real,
          call: () => {
            throw new RangeError('Array buffer allocation failed');
          },
        } satisfies Qpdf;
      },
    };
    const failed = (await unprotect(fixture('restricted.pdf'), [], checkerOutOfMemory).catch((error: unknown) => error)) as Error;
    expect(failed).toBeInstanceOf(RangeError);
    expect(failed.message).toBe('Array buffer allocation failed');
    expect(made).toBe(3);

    // The input's answer, parsed: an out-of-memory error from JSON.parse goes through too.
    const parse = JSON.parse;
    JSON.parse = () => {
      throw new RangeError('Invalid string length: out of memory');
    };
    try {
      const parsed = (await isEncrypted(tools, fixture('restricted.pdf'), undefined).catch((error: unknown) => error)) as Error;
      expect(parsed).toBeInstanceOf(RangeError);
      expect(parsed.message).toBe('Invalid string length: out of memory');
    } finally {
      JSON.parse = parse;
    }
  });

  it('isEncrypted refuses an answer without a boolean, and holds nothing of it', async () => {
    const fake: EngineTools = {
      qpdf: async () => {
        const real = await makeQpdf();
        return { ...real, call: () => ({ code: 0, out: `{"encrypt":{"encrypted":"yes","recovereduserpassword":"${P}"}}`, printed: '' }) } satisfies Qpdf;
      },
    };
    const failed = (await isEncrypted(fake, fixture('text.pdf'), undefined).catch((error: unknown) => error)) as Error;
    expect(failed.message).toBe('qpdf could not read the file.');
    expect(`${failed.message} ${failed.stack}`).not.toContain('Qz7');
    const broken: EngineTools = {
      qpdf: async () => ({ ...(await makeQpdf()), call: () => ({ code: 0, out: 'not json', printed: '' }) }),
    };
    await expect(isEncrypted(broken, fixture('text.pdf'), undefined)).rejects.toThrow('qpdf could not read the file.');
  });

  it('no error the engine throws holds a marked password', async () => {
    const protectedText = await aes256(fixture('text.pdf'));
    const errors: unknown[] = [];
    const collect = (job: Promise<unknown>) => job.catch((error: unknown) => errors.push(error));
    await collect(unprotect(protectedText, [`${P}x`]));
    await collect(unprotect(protectedText, [O.slice(0, -1)]));
    await collect(unprotect(protectedText, []));
    await collect(unprotect(fixture('damaged-cut.pdf'), [P]));
    await collect(unprotect(fixture('not-a-pdf.pdf'), [P]));
    await collect(unprotect(protectedText, [P], stillEncryptedWriter()));
    await collect(unprotectedBytes(tools, protectedText, P, () => {}, 1_000));
    await collect(unprotectedBytes(tools, protectedText, 'Qz7 wrong', () => {}));
    expect(errors).toHaveLength(8);
    for (const error of errors) {
      const said = `${(error as Error).message} ${(error as Error).stack} ${JSON.stringify(error)}`;
      for (const part of ['Qz7', 'Kv4', 'pw#%@', 'Ow9', 'Zx2']) expect(said, part).not.toContain(part);
    }
  });
});
