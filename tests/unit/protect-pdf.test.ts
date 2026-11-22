// The Protect with a password engine, with the same qpdf the browser uses and PDF.js's legacy build: its refusals
// before any work, its arguments, real runs on every file in the test set, what the new file hides and what the
// format leaves readable, older encryption, fresh keys, progress, the cap, and errors that never hold a password.

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFName, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createQpdf, finished, OutputLimit, type Qpdf } from '../../src/engines/qpdf';
import { inspect, protectArgs, protectedBytes, protectLimit, run, strongEncryption } from '../../src/engines/tools/protect-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';
import { PasswordRefused } from '../../src/widget/option-values';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { qpdf: makeQpdf };
const fixturesDir = join(__dirname, '../fixtures');
const fixture = (name: string) => new Uint8Array(readFileSync(join(fixturesDir, name)));

/** The marked new password, with a space, #, % and @. */
const P = 'Qz7 pw#%@ Kv4';
const oldPassword = 'open-sesame';
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

async function protect(file: Uint8Array, passwords: (string | undefined)[] = [], newPassword: unknown = P) {
  const progress: Progress[] = [];
  const outputs = await run([file], { passwords, newPassword }, (step) => progress.push(step), tools);
  return { output: outputs[0]!, outputs, progress };
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
type Attachment = { preferredname: string; streams: Record<string, { mimetype: string | null; creationdate: string | null; modificationdate: string | null }> };

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

/** Every PDF in the test set, with the password it needs, and whether it can be read at all. */
const damaged = new Set(['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']);
const needsPassword = new Set(['password.pdf', 'compress-password.pdf']);
const fixtures = readdirSync(fixturesDir)
  .filter((name) => name.endsWith('.pdf'))
  .sort();

describe('refusals before any work', () => {
  const refused: [string, unknown][] = [
    ['missing', undefined],
    ['empty', ''],
    ['128 characters', 'x'.repeat(128)],
    ['café', 'café'],
    ['a space first', ' a'],
    ['a space last', 'a '],
    ['a line break', 'open\nsesame'],
    ['a number', 1234],
    ['null', null],
  ];

  it.each(refused)('refuses a new password that is %s, with PasswordRefused, before qpdf is asked for, holding nothing of it', async (_, value) => {
    let asked = 0;
    const spied: EngineTools = { qpdf: async () => ((asked += 1), makeQpdf()) };
    const failed = await run([fixture('text.pdf')], { newPassword: value }, () => {}, spied).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(PasswordRefused);
    expect(asked).toBe(0);
    if (typeof value === 'string' && value.length > 2) expect(`${(failed as Error).message} ${(failed as Error).stack}`).not.toContain(value);
  });

  it("refuses a password sent under '__proto__' or with no options at all, and takes only the key newPassword", async () => {
    const options = JSON.parse(`{"__proto__": {"newPassword": "${P}"}}`) as Record<string, unknown>;
    await expect(run([fixture('text.pdf')], options, () => {}, tools)).rejects.toBeInstanceOf(PasswordRefused);
    await expect(run([fixture('text.pdf')], {}, () => {}, tools)).rejects.toBeInstanceOf(PasswordRefused);
    const misnamed: Record<string, unknown> = { password: P };
    await expect(run([fixture('text.pdf')], misnamed, () => {}, tools)).rejects.toBeInstanceOf(PasswordRefused);
  });

  it('takes one file only', async () => {
    await expect(run([], { newPassword: P }, () => {}, tools)).rejects.toThrow('Protect takes one file.');
    await expect(run([fixture('text.pdf'), fixture('text.pdf')], { newPassword: P }, () => {}, tools)).rejects.toThrow('Protect takes one file.');
  });
});

describe('the arguments', () => {
  const forbidden = ['--cleartext-metadata', '--allow-insecure', '--allow-weak-crypto', '--show-encryption'];

  it('use the named options, 256 bits, object streams generated, and the same password for opening and permissions', () => {
    expect(protectArgs(undefined, P)).toEqual(['--progress', '/in.pdf', '--object-streams=generate', '--encrypt', `--user-password=${P}`, `--owner-password=${P}`, '--bits=256', '--', '/out.pdf']);
    expect(protectArgs(oldPassword, P).slice(0, 3)).toEqual(['--progress', `--password=${oldPassword}`, '/in.pdf']);
  });

  it('never use the options that leave details in clear, allow a weak or empty key, or print the encryption', () => {
    const source = readFileSync(join(__dirname, '../../src/engines/tools/protect-pdf.ts'), 'utf8');
    for (const option of forbidden) {
      expect(source).not.toContain(option);
      for (const arg of [...protectArgs(undefined, P), ...protectArgs(oldPassword, P)]) expect(arg.startsWith(option)).toBe(false);
    }
  });

  it('read a password that looks like an option as a password', async () => {
    for (const odd of ['--help', '@in.pdf', '--decrypt']) {
      const { output } = await protect(fixture('text.pdf'), [], odd);
      expect(strongEncryption({ encrypt: await encryptionOf(output, odd) })).toBe(true);
    }
  });
});

describe('every file in the test set', () => {
  it('holds the files the README lists, and those with a password are known', () => {
    for (const name of ['text.pdf', 'pages-500.pdf', 'scanned.pdf', 'password.pdf', 'restricted.pdf', 'warning.pdf', 'form.pdf', 'mixed.pdf', 'rich.pdf', 'images.pdf', 'tagged.pdf']) {
      expect(fixtures).toContain(name);
    }
  });

  for (const name of fixtures.filter((each) => !damaged.has(each))) {
    it(`${name}: protected with AES-256, opened by the new password only, with everything it showed kept`, async () => {
      const file = fixture(name);
      const old = needsPassword.has(name) ? oldPassword : undefined;
      const { output } = await protect(file, [old]);

      // qpdf: passes its check with the password, AES-256 revision 6, every permission allowed.
      expect(finished((await qpdfOn(output, ['--password=' + P, '--check'])).code)).toBe(true);
      const encrypt = await encryptionOf(output, P);
      expect(strongEncryption({ encrypt })).toBe(true);
      expect(encrypt.parameters).toMatchObject({ R: 6, V: 5, bits: 256, stringmethod: 'AESv3', streammethod: 'AESv3', filemethod: 'AESv3' });

      // Refused without it, with it less its last character, and with one more, in qpdf and PDF.js.
      for (const wrong of [undefined, P.slice(0, -1), `${P}x`, ...(old ? [old] : [])]) {
        const checked = await qpdfOn(output, [...withPassword(wrong), '--check']);
        expect(finished(checked.code), String(wrong)).toBe(false);
        expect(checked.printed).toMatch(/invalid password/i);
        expect(await pdfjsOpen(output, wrong), String(wrong)).toBe('PasswordException');
      }

      // What a reader shows is as before: pages, sizes, turns, text, bookmarks, form fields and values, attached files.
      expect(await shown(output, P)).toEqual(await shown(file, old));

      // Neither password is in the bytes, and no page dictionary is readable.
      const bytes = latin1(output);
      // The whole password: a three-letter part can turn up by chance in megabytes of encrypted bytes.
      expect(bytes).not.toContain(P);
      expect(bytes).not.toContain(oldPassword);
      expect(bytes).not.toContain('/MediaBox');
    }, 120_000);
  }

  for (const name of [...damaged]) {
    it(`${name}: read as damaged before a job, and the job fails with a fixed sentence`, async () => {
      expect(await inspect(fixture(name), undefined, tools)).toEqual({ kind: 'damaged' });
      const failed = (await protect(fixture(name)).catch((error: unknown) => error)) as Error;
      expect(failed).toBeInstanceOf(Error);
      expect(['qpdf could not write the protected file.', 'The protected file did not pass its check.']).toContain(failed.message);
    });
  }
});

describe('what the new file keeps', () => {
  it('rich.pdf: its bookmarks, link and note.txt with its contents', async () => {
    const { output } = await protect(fixture('rich.pdf'));
    const read = await shown(output, P);
    expect(read.outline).toEqual([
      { title: 'Chapter one', page: 1, kids: [] },
      { title: 'Chapter two', page: 2, kids: [] },
    ]);
    expect(read.attachments['note.txt']).toMatchObject({ name: 'note.txt', contents: 'A note kept inside the PDF.\n' });
    const { doc, close } = await opened(output, P);
    const links = (await (await doc.getPage(1)).getAnnotations()).filter((annotation: { subtype?: string }) => annotation.subtype === 'Link');
    expect(links.length).toBeGreaterThan(0);
    await close();
  });

  it('form.pdf: its fields and the value typed in one', async () => {
    const { output } = await protect(fixture('form.pdf'));
    const { fields } = await shown(output, P);
    expect(fields.find((field) => field.fullname === 'name')?.value).toBe('u:Sample text');
    expect(fields.find((field) => field.fullname === 'agree')?.fieldtype).toBe('/Btn');
  });

  it('tagged.pdf: its tags, named destination, reading thread, and the tagged field with its value, note and link', async () => {
    const { output } = await protect(fixture('tagged.pdf'));
    const dump = await plainDump(output, P);
    for (const marker of ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-THREAD-TITLE', 'SECRET-NOTE', 'SECRET-LINK', 'SECRET-DEST-NAME', 'SECRET-PAGE-TWO-TEXT']) {
      expect(dump, marker).toContain(marker);
    }
    for (const key of ['/StructTreeRoot', '/MarkInfo', '/Dests', '/Threads']) expect(dump, key).toContain(key);
    const { fields } = await shown(output, P);
    // The field's name and value are hex strings, so they are read from qpdf's form JSON.
    expect(fields.find((field) => field.fullname === 'SECRET-TAGGED-FIELD')?.value).toBe('u:SECRET-TAGGED-VALUE');
    const { doc, close } = await opened(output, P);
    expect(await (await doc.getPage(2)).getStructTree()).not.toBeNull();
    await close();
  });

  it('mixed.pdf and pages-500.pdf: every page, with the size and turn it had', async () => {
    for (const name of ['mixed.pdf', 'pages-500.pdf']) {
      const { output } = await protect(fixture(name));
      const after = await shown(output, P);
      const before = await shown(fixture(name));
      expect(after.pages).toEqual(before.pages);
      expect(after.pages.length).toBe(name === 'mixed.pdf' ? 4 : 500);
    }
  }, 120_000);
});

describe('a file that already has a password or restrictions', () => {
  it('password.pdf, opened with open-sesame: the new password only, every permission, neither password in its bytes', async () => {
    const { output } = await protect(fixture('password.pdf'), [oldPassword]);
    const encrypt = await encryptionOf(output, P);
    expect(strongEncryption({ encrypt })).toBe(true);
    expect((await qpdfOn(output, [`--password=${oldPassword}`, '--check'])).printed).toMatch(/invalid password/i);
    expect(latin1(output)).not.toContain(oldPassword);
    expect(latin1(output)).not.toContain(P);
  });

  it('password.pdf without its password, or with a wrong one: a fixed sentence holding neither password', async () => {
    for (const given of [undefined, 'open-sesam']) {
      const failed = (await protect(fixture('password.pdf'), [given]).catch((error: unknown) => error)) as Error;
      expect(failed.message).toBe('A password did not open the file.');
      expect(`${failed.message} ${failed.stack}`).not.toContain(P);
      expect(`${failed.message} ${failed.stack}`).not.toContain('open-sesam');
    }
  });

  it('restricted.pdf: needs the new password and has no restrictions', async () => {
    const before = await encryptionOf(fixture('restricted.pdf'));
    expect(Object.values(before.capabilities as Record<string, boolean>)).toContain(false);
    const { output } = await protect(fixture('restricted.pdf'));
    const encrypt = await encryptionOf(output, P);
    expect(Object.values(encrypt.capabilities as Record<string, boolean>).every(Boolean)).toBe(true);
    expect(finished((await qpdfOn(output, ['--check'])).code)).toBe(false);
  });

  it('a file with 128-bit RC4, opened with its password: AES-256 only, and the old password refused', async () => {
    const qpdf = await makeQpdf();
    qpdf.write('/in.pdf', fixture('text.pdf'));
    // Weak encryption is made here, in the test only.
    const made = qpdf.call(['/in.pdf', '--allow-weak-crypto', '--encrypt', '--user-password=old-rc4', '--owner-password=old-rc4', '--bits=128', '--use-aes=n', '--', '/out.pdf']);
    expect(finished(made.code)).toBe(true);
    const rc4 = qpdf.read('/out.pdf');
    expect(((await encryptionOf(rc4, 'old-rc4')).parameters as Record<string, unknown>).stringmethod).toBe('RC4');
    const { output } = await protect(rc4, ['old-rc4']);
    expect(strongEncryption({ encrypt: await encryptionOf(output, P) })).toBe(true);
    expect(finished((await qpdfOn(output, ['--password=old-rc4', '--check'])).code)).toBe(false);
  });

  it('warning.pdf, which qpdf reads with a warning, is protected', async () => {
    const { output } = await protect(fixture('warning.pdf'));
    expect(strongEncryption({ encrypt: await encryptionOf(output, P) })).toBe(true);
  });
});

describe('what the password hides, and what the format leaves readable', () => {
  it('a title and XMP details holding marked words: neither in the bytes, both read back with the password', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([300, 300]).drawText('A page', { x: 20, y: 150, size: 12, font });
    // A literal string, so the word can be seen in the input's bytes; pdf-lib's setTitle writes hex.
    (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict().set(PDFName.of('Title'), PDFString.of('SECRET-TITLE-WORD'));
    const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">SECRET-XMP-WORD</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
    const metadata = doc.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' });
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(metadata));
    const file = await doc.save({ useObjectStreams: false });
    expect(latin1(file)).toContain('SECRET-TITLE-WORD');
    expect(latin1(file)).toContain('SECRET-XMP-WORD');

    const { output } = await protect(file);
    expect(latin1(output)).not.toContain('SECRET-TITLE-WORD');
    expect(latin1(output)).not.toContain('SECRET-XMP-WORD');
    const { doc: read, close } = await opened(output, P);
    const { info, metadata: xmpRead } = await read.getMetadata();
    expect((info as { Title?: string }).Title).toBe('SECRET-TITLE-WORD');
    expect(xmpRead?.get('dc:title')).toBe('SECRET-XMP-WORD');
    await close();
  });

  it("tagged.pdf: every marked string and stream hidden; the destination's name, a name, readable, as the format leaves names", async () => {
    const { output } = await protect(fixture('tagged.pdf'));
    const bytes = latin1(output);
    for (const marker of ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-THREAD-TITLE', 'SECRET-TAGGED-FIELD', 'SECRET-TAGGED-VALUE', 'SECRET-NOTE', 'SECRET-LINK', 'SECRET-PAGE-TWO-TEXT']) {
      expect(bytes, marker).not.toContain(marker);
    }
    // The field's name and value are hex strings (UTF-16 with a byte order mark) in the input: gone too.
    const input = latin1(fixture('tagged.pdf')).toUpperCase();
    for (const marker of ['SECRET-TAGGED-FIELD', 'SECRET-TAGGED-VALUE']) {
      const hex = Buffer.from(`\uFEFF${marker}`, 'utf16le').swap16().toString('hex').toUpperCase();
      expect(input, marker).toContain(hex);
      expect(bytes.toUpperCase(), marker).not.toContain(hex);
    }
    // Recorded, not hidden: a name in the catalog's old-style /Dests.
    expect(bytes).toContain('SECRET-DEST-NAME');
  });

  it("stream dictionaries stay readable, as the format leaves them: a picture's /Width, an attached file's /Subtype, a font's name", async () => {
    expect(latin1((await protect(fixture('images.pdf'))).output)).toContain('/Width');
    const rich = latin1((await protect(fixture('rich.pdf'))).output);
    expect(rich).toMatch(/\/Subtype\s*\/text#2fplain/);
    // The attached file's name, its dates and its contents are not readable.
    expect(rich).not.toContain('note.txt');
    expect(rich).not.toContain('A note kept inside');
    expect(latin1((await protect(fixture('form.pdf'))).output)).toContain('/Helvetica');
  });
});

describe('keys, progress and the cap', () => {
  it('the same file protected twice gives different keys and different encrypted bytes', async () => {
    const keysOf = async (bytes: Uint8Array) => {
      const { out } = await qpdfOn(bytes, [`--password=${P}`, '--json=2', '--json-key=qpdf']);
      const objects = (JSON.parse(out) as { qpdf: [unknown, Record<string, { value?: Record<string, unknown> }>] }).qpdf[1];
      const encrypt = Object.values(objects).find((entry) => entry.value?.['/Filter'] === '/Standard')?.value;
      expect(encrypt).toBeDefined();
      return ['/U', '/O', '/UE', '/OE'].map((key) => encrypt![key]);
    };
    const one = (await protect(fixture('text.pdf'))).output;
    const two = (await protect(fixture('text.pdf'))).output;
    const [a, b] = [await keysOf(one), await keysOf(two)];
    for (let index = 0; index < 4; index++) expect(a[index]).not.toEqual(b[index]);
    expect(Buffer.from(one).equals(Buffer.from(two))).toBe(false);
  });

  it('progress: reading first, then writing percentages that never go back, with 93, 96 and 100 last', async () => {
    const { progress } = await protect(fixture('pages-500.pdf'));
    expect(progress[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    const percents = progress.slice(1).map((step) => (step.stage === 'writing' ? step.percent : Number.NaN));
    expect(percents.every((percent) => Number.isFinite(percent))).toBe(true);
    expect(percents).toEqual([...percents].sort((x, y) => x - y));
    expect(percents.slice(-3)).toEqual([93, 96, 100]);
    expect(percents.slice(0, -3).every((percent) => percent <= 90)).toBe(true);
    expect(percents.length).toBeGreaterThan(4);
  });

  it('the cap is twice the file and 16 MB', () => {
    expect(protectLimit(0)).toBe(16 * 1024 * 1024);
    expect(protectLimit(1000)).toBe(2000 + 16 * 1024 * 1024);
  });

  it('a file of many empty streams, which encryption makes grow, is stopped at a small cap with OutputLimit', async () => {
    // Streams cannot go in object streams, so each grows by up to 32 bytes when encrypted.
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const refs = Array.from({ length: 20_000 }, () => doc.context.register(doc.context.stream(new Uint8Array(0))));
    doc.catalog.set(PDFName.of('PDFkaroPadding'), doc.context.obj(refs));
    const file = await doc.save({ useObjectStreams: false });
    const grown = await protectedBytes(tools, file, undefined, P, () => {});
    expect(grown.length).toBeGreaterThan(file.length);
    expect(grown.length).toBeLessThan(protectLimit(file.length));
    const failed = await protectedBytes(tools, file, undefined, P, () => {}, file.length).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(OutputLimit);
  });

  it('no error the engine throws holds either marked password', async () => {
    const errors: unknown[] = [];
    const collect = (job: Promise<unknown>) => job.catch((error: unknown) => errors.push(error));
    await collect(protect(fixture('password.pdf'), ['open-sesam']));
    await collect(protect(fixture('password.pdf'), []));
    await collect(protect(fixture('damaged-cut.pdf')));
    await collect(protect(fixture('not-a-pdf.pdf')));
    await collect(protect(fixture('text.pdf'), [], `${P} `));
    await collect(protectedBytes(tools, fixture('pages-500.pdf'), undefined, P, () => {}, 10_000));
    expect(errors).toHaveLength(6);
    for (const error of errors) {
      const said = `${(error as Error).message} ${(error as Error).stack} ${JSON.stringify(error)}`;
      expect(said).not.toContain(P);
      expect(said).not.toContain('Qz7');
      expect(said).not.toContain('Kv4');
      expect(said).not.toContain('open-sesam');
    }
  });
});
