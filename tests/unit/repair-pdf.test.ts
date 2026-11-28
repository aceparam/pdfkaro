// Repair PDF's engine (src/engines/tools/repair-pdf.ts, add-repair-pdf): the 36 damaged kinds the plan measured,
// fidelity on every sound fixture forced through the pdf-lib route, passwords, nothing to repair, the sweep, and every
// hostile case of the design's threats table in fixed time and bounded memory, with each guard on pdf-lib 2.11.1
// reached. No request is made and nothing is logged: `fetch` and every console method are replaced, and recorded.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PageTooLarge } from '../../src/engines/content';
import { rebuild } from '../../src/engines/rebuild';
import {
  inspect,
  limits,
  loads,
  makeRun,
  pdflibHooks,
  readWithPdflib,
  RepairFailed,
  run,
  type Limits,
} from '../../src/engines/tools/repair-pdf';
import type { Progress } from '../../src/engines/types';
import * as lib from '../../src/workers/pdflib';
import { certificatePdf } from './unlock-helpers';
import {
  bytesOf,
  contentsOf,
  cutUpdate,
  damagedCopy,
  damagedKinds,
  deflated,
  encryptedCopy,
  fixture,
  handPdf,
  hostile,
  keptTexts,
  latin1,
  onePage,
  passesCheck,
  password,
  qpdfOn,
  qpdfPages,
  qpdfRewrite,
  sourceContents,
  streamBody,
  structureOf,
  tools,
  noRequestsOrLogs,
} from './repair-helpers';

const pdflib = lib as unknown as typeof import('@cantoo/pdf-lib');
const M = 1024 * 1024;

// No request, and no console line from anything the engine runs.
noRequestsOrLogs();

const one = async (file: Uint8Array, given?: string, engine = run): Promise<Uint8Array[]> => engine([file.slice()], { passwords: [given] }, () => {}, tools);
/** The error a call ends with, or undefined. */
async function failure(call: () => Promise<unknown>): Promise<Error | undefined> {
  try {
    await call();
    return undefined;
  } catch (error) {
    return error as Error;
  }
}

describe('what the engine declares', () => {
  it('loads qpdf and pdf-lib to read, and fflate too for the job', () => {
    expect(loads).toEqual({ read: ['qpdf', 'pdflib'], job: ['qpdf', 'pdflib', 'fflate'] });
  });

  it('imports only the shared steps the design names, never another engine, stamp, shrink or picture', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(join(__dirname, '../../src/engines/tools/repair-pdf.ts'), 'utf8');
    const imports = [...source.matchAll(/^import (?:type )?.* from '([^']+)';$/gm)].map((match) => match[1]);
    expect(imports.sort()).toEqual(['../content', '../inspect', '../plain', '../qpdf', '../qpdf-json', '../rebuild', '../types', '../zlib', '@cantoo/pdf-lib'].sort());
    expect(source).toMatch(/import type \* as PdfLib from '@cantoo\/pdf-lib';/);
    // Never pdf-lib's recursive page walks, and never qpdf's decoded data on standard output.
    expect(source).not.toMatch(/\.getPageCount\(|\.getPages\(|\.getForm\(/);
    expect(source).not.toMatch(/--filtered-stream-data|--show-object|--show-encryption|--raw-stream-data/);
  });
});

describe('the 36 damaged kinds', () => {
  it('repairs every kind into a file that passes qpdf --check, with at least what was recorded, as many pages as read', { timeout: 300_000 }, async () => {
    const sources = new Map<string, Awaited<ReturnType<typeof sourceContents>>>();
    const kinds = await damagedKinds();
    expect(kinds).toHaveLength(36);
    for (const kind of kinds) {
      if (!sources.has(kind.source)) sources.set(kind.source, await sourceContents(kind.source === 'damaged-cut' ? 'pages-500' : kind.source));
      const source = sources.get(kind.source)!;
      // Other tools call each of these damaged, except the four qpdf reads with warnings or junk around it.
      const outcome = await inspect(kind.bytes.slice(), undefined, tools);
      expect(outcome, kind.name).toEqual({ kind: 'ready', pages: kind.expected.pages });
      const outputs = await one(kind.bytes);
      expect(outputs, kind.name).toHaveLength(1);
      const out = outputs[0]!;
      expect(await passesCheck(out), kind.name).toBe(true);
      expect(await qpdfPages(out), kind.name).toBe(kind.expected.pages);
      const read = await contentsOf(out);
      expect(keptTexts(source.texts, read.texts), kind.name).toBeGreaterThanOrEqual(kind.expected.text);
      if (kind.expected.outline) expect(read.outline, kind.name).toEqual(source.outline);
      if (kind.expected.link) expect(read.links, kind.name).toEqual(source.links);
      if (kind.expected.attachment) expect(read.attachments, kind.name).toEqual(['note.txt']);
      // No password and no restrictions.
      expect((await qpdfOn(out, ['--show-encryption'])).out, kind.name).toMatch(/File is not encrypted/);
    }
  });

  it('reads damaged-xref.pdf and damaged-cut.pdf as the page will show them', async () => {
    expect(await inspect(fixture('damaged-xref.pdf'), undefined, tools)).toEqual({ kind: 'ready', pages: 3 });
    expect(await inspect(fixture('damaged-cut.pdf'), undefined, tools)).toEqual({ kind: 'ready', pages: 198 });
  });
});

describe('fidelity: sound files forced through the pdf-lib route', () => {
  // Two crafted Compress PDF files are left out: compress-json-bomb.pdf, whose 70 MB of object-stream text the decode
  // budget refuses (as it should, so it is checked below), and compress-bomb-attachment.pdf, whose 1 GB attachment
  // qpdf's own JSON reading, used here to compare, cannot hold.
  const left = new Set(['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf', 'compress-json-bomb.pdf', 'compress-bomb-attachment.pdf']);
  const sound = readdirSync(join(__dirname, '../fixtures')).filter((name) => name.endsWith('.pdf') && !left.has(name)).sort();
  const forced = makeRun(limits, { route: 'pdflib' });

  it('holds the same catalog keys, details, pages, page contents, fields, bookmarks and attachments as qpdf’s own rewrite', { timeout: 300_000 }, async () => {
    expect(sound).toHaveLength(23);
    for (const name of sound) {
      const given = ['password.pdf', 'compress-password.pdf'].includes(name) ? password : undefined;
      const [out] = await one(fixture(name), given, forced);
      expect(await passesCheck(out!), name).toBe(true);
      expect(await structureOf(out!), name).toEqual(await structureOf(await qpdfRewrite(fixture(name), given)));
    }
  });

  it('refuses compress-json-bomb.pdf through that route with the decode budget, as a crafted file', { timeout: 60_000 }, async () => {
    expect((await failure(() => one(fixture('compress-json-bomb.pdf'), undefined, forced)))?.name).toBe('OutputLimit');
  });
});

describe('passwords', () => {
  const variants: [string, () => Promise<Uint8Array>][] = [
    ['AES-256 (password.pdf)', async () => fixture('password.pdf')],
    ['AES-128', () => encryptedCopy(fixture('text.pdf'), ['--bits=128', '--use-aes=y'])],
    ['RC4', () => encryptedCopy(fixture('text.pdf'), ['--bits=128', '--use-aes=n'], ['--allow-weak-crypto'])],
  ];
  for (const [name, make] of variants) {
    it(`reads a damaged ${name} file: no password asks for one, a wrong one is refused, the right one opens it`, { timeout: 60_000 }, async () => {
      const damaged = damagedCopy(await make());
      // Other tools call it damaged.
      expect((await qpdfOn(damaged, [`--password=${password}`, '--show-npages'])).code).toBe(2);
      expect(await inspect(damaged.slice(), undefined, tools)).toEqual({ kind: 'needs-password' });
      expect(await inspect(damaged.slice(), 'nope', tools)).toEqual({ kind: 'wrong-password' });
      expect(await inspect(damaged.slice(), password, tools)).toEqual({ kind: 'ready', pages: 3 });
      const [out] = await one(damaged, password);
      expect((await qpdfOn(out!, ['--show-encryption'])).out).toMatch(/File is not encrypted/);
      expect((await contentsOf(out!)).texts).toEqual((await contentsOf(fixture('text.pdf'))).texts);
    });
  }

  it("pins pdf-lib's words for a missing and a wrong password, which the reading depends on", async () => {
    const bytes = rebuild(damagedCopy(fixture('password.pdf'))).bytes;
    const message = async (given: string) => (await failure(() => pdflib.PDFDocument.load(bytes, { password: given, updateMetadata: false })))?.message;
    expect(await message('')).toBe('NEEDS PASSWORD');
    expect(await message('nope')).toBe('Password incorrect');
  });

  it('opens a damaged file with restrictions only without asking for a password, and drops them', { timeout: 60_000 }, async () => {
    const damaged = damagedCopy(fixture('restricted.pdf'));
    expect(await inspect(damaged.slice(), undefined, tools)).toEqual({ kind: 'ready', pages: 3 });
    const [out] = await one(damaged);
    expect((await qpdfOn(out!, ['--show-encryption'])).out).toMatch(/File is not encrypted/);
  });

  it('calls a certificate-encrypted file one it cannot read, damaged or not', async () => {
    expect(await inspect(certificatePdf(), undefined, tools)).toEqual({ kind: 'unsupported' });
    expect(await inspect(damagedCopy(certificatePdf()), undefined, tools)).toEqual({ kind: 'unsupported' });
  });

  it('calls a damaged file with an encryption method or algorithm pdf-lib does not know one it cannot read', async () => {
    const encrypt = (dict: string) => bytesOf(handPdf([...onePage(streamBody('')), dict], { table: false, trailer: '' }).replace('%PDF-1.7\n', '%PDF-1.7\n') + 'trailer\n<< /Root 1 0 R /Encrypt 5 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>] >>\n');
    expect(await inspect(encrypt('<< /Filter /Custom /V 4 /R 4 >>'), undefined, tools)).toEqual({ kind: 'unsupported' });
    expect(await inspect(encrypt('<< /Filter /Standard /V 3 /R 3 /O <00> /U <00> /P -4 >>'), undefined, tools)).toEqual({ kind: 'unsupported' });
  });

  it('never puts the password, a file name or page text into an error', async () => {
    const damaged = damagedCopy(fixture('password.pdf'));
    const error = await failure(() => one(damaged, 'a-secret-SECRET-word'));
    expect(error).toBeDefined();
    expect(error!.message).not.toMatch(/SECRET|secret|Ordinary|page/);
    expect(error!.message).toBe('A password did not open the file.');
  });
});

describe('nothing to repair, and what qpdf reads', () => {
  it('gives no file for a sound file', async () => {
    for (const name of ['text.pdf', 'rich.pdf', 'pages-500.pdf', 'tagged.pdf']) expect(await one(fixture(name)), name).toEqual([]);
    expect(await one(fixture('password.pdf'), password)).toEqual([]);
  });

  it('writes a file qpdf reads with warnings, junk before %PDF- or no %%EOF again', async () => {
    const [warned] = await one(fixture('warning.pdf'));
    expect(await qpdfPages(warned!)).toBe(3);
    expect((await qpdfOn(warned!, ['--check'])).code).toBe(0);
    expect((await structureOf(warned!)).pages).toEqual((await structureOf(fixture('warning.pdf'))).pages);
    const [junked] = await one(bytesOf(`${'x'.repeat(249)}\n${latin1(fixture('text.pdf'))}`));
    expect(latin1(junked!.subarray(0, 5))).toBe('%PDF-');
    expect(await qpdfPages(junked!)).toBe(3);
  });

  it('keeps the earlier version when a file is cut off inside its last incremental update', { timeout: 30_000 }, async () => {
    const cut = cutUpdate();
    const [out] = await one(cut);
    expect((await contentsOf(out!)).texts).toEqual((await contentsOf(fixture('text.pdf'))).texts);
  });
});

describe('the sweep', () => {
  it('removes a page’s drawing that points to nothing, keeping a blank page of its size', async () => {
    const pdf = handPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents [9 0 R 5 0 R] >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 9 0 R >>', streamBody('0 0 m 10 10 l S')], { table: false });
    const [out] = await one(bytesOf(pdf));
    const structure = await structureOf(out!);
    expect(structure.pages).toHaveLength(2);
    expect(structure.pages[0]!.box).toEqual([0, 0, 300, 400]);
    expect(await passesCheck(out!)).toBe(true);
  });

  it('keeps what still unpacks of a damaged Flate drawing, and leaves the other pages unchanged', async () => {
    const drawing = Array.from({ length: 4000 }, (_, at) => `${at % 200} ${(at * 7) % 200} m ${(at * 3) % 200} ${(at * 11) % 200} l S`).join('\n');
    const packed = deflated(drawing, 1);
    const broken = `${packed.slice(0, Math.floor(packed.length * 0.7))}${'ÿ'.repeat(40)}${packed.slice(Math.floor(packed.length * 0.7) + 40)}`;
    const pdf = handPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>', streamBody(broken, '/Filter /FlateDecode'), '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 6 0 R >>', streamBody(deflated('1 0 0 rg 0 0 10 10 re f'), '/Filter /FlateDecode')], { table: false });
    const [out] = await one(bytesOf(pdf));
    expect(await passesCheck(out!)).toBe(true);
    const json = JSON.parse((await qpdfOn(out!, ['--json=2', '--json-key=pages', '--json-key=qpdf', '--json-stream-data=inline', '--decode-level=generalized'])).out) as { pages: { contents: string[] }[]; qpdf: [unknown, Record<string, { stream?: { data?: string } }>] };
    const data = (page: number) => Buffer.from(json.qpdf[1][`obj:${json.pages[page]!.contents[0]}`]!.stream!.data!, 'base64').toString('latin1');
    // What came out before the damage is the drawing's own start; after it, the decoder may make garbage before it stops.
    const sure = Math.floor(drawing.length * 0.3);
    expect(data(0).length).toBeGreaterThan(sure);
    expect(data(0).slice(0, sure)).toBe(drawing.slice(0, sure));
    expect(data(1)).toBe('1 0 0 rg 0 0 10 10 re f');
  });

  it('empties a damaged RunLength drawing, which our capped decoder reads', async () => {
    // A run-length run of 100 copies says 100 bytes follow, but only 3 do: damaged.
    const broken = `cabc`;
    const [out] = await one(bytesOf(handPdf(onePage(streamBody(broken, '/Filter /RunLengthDecode')), { table: false })));
    expect(await passesCheck(out!)).toBe(true);
  });

  it('stops with the page’s number when its drawing unpacks past 64 MiB, and passes at 63 MiB', { timeout: 120_000 }, async () => {
    const over = bytesOf(handPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>', '<< >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 6 0 R >>', streamBody(deflated(Buffer.alloc(65 * M, 0x20)), '/Filter /FlateDecode')], { table: false }));
    const error = await failure(() => one(over));
    expect(error).toBeInstanceOf(PageTooLarge);
    expect((error as PageTooLarge).page).toBe(2);
    const under = bytesOf(handPdf(onePage(streamBody(deflated(Buffer.alloc(63 * M, 0x20)), '/Filter /FlateDecode')), { table: false }));
    const [out] = await one(under);
    expect(await passesCheck(out!)).toBe(true);
  });

  it('records what qpdf does today with an unfiltered stream that carries /DP (the /DP bug, its own change)', async () => {
    const pdf = handPdf(onePage(streamBody('0 0 m 10 10 l S', '/DP << /Predictor 1 >>')), { table: false });
    const [out] = await one(bytesOf(pdf));
    const json = JSON.parse((await qpdfOn(out!, ['--json=2', '--json-key=qpdf'])).out) as { qpdf: [unknown, Record<string, { stream?: { dict: Record<string, unknown> } }>] };
    const drawing = Object.values(json.qpdf[1]).find((entry) => entry.stream && '/DP' in entry.stream.dict);
    // qpdf compresses the stream and keeps /DP beside its /Filter: PDF.js then draws nothing from it.
    expect(drawing?.stream?.dict['/Filter']).toBe('/FlateDecode');
    expect(drawing?.stream?.dict['/DP']).toEqual({ '/Predictor': 1 });
  });
});

describe('progress', () => {
  it('says it is reading the file, then fills the bar with the writes to half, and shows 55 then 95 during the check', async () => {
    const seen: Progress[] = [];
    await run([fixture('damaged-xref.pdf')], { passwords: [undefined] }, (progress) => seen.push(progress), tools);
    expect(seen[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    const percents = seen.filter((each): each is { stage: 'writing'; percent: number } => each.stage === 'writing').map((each) => each.percent);
    for (let at = 1; at < percents.length; at++) expect(percents[at]!).toBeGreaterThanOrEqual(percents[at - 1]!);
    expect(percents.filter((percent) => percent <= 50).length).toBeGreaterThan(0);
    expect(percents).toContain(50);
    expect(percents.slice(-3)).toEqual([55, 95, 100]);
  });
});

describe('the guards on pdf-lib 2.11.1', () => {
  it('finds every hook on pdf-lib’s exported classes, and fails when one moves', () => {
    const hooks = pdflibHooks(pdflib);
    expect(typeof hooks.byteStream.next).toBe('function');
    expect(typeof hooks.byteStream.slice).toBe('function');
    expect(typeof hooks.decodeStream.ensureBuffer).toBe('function');
    expect(typeof hooks.objectStreamParser.parseOffsetsAndObjectNumbers).toBe('function');
    expect(typeof hooks.xrefStreamParser.forStream).toBe('function');
    expect(typeof hooks.parser.tryToParseInvalidIndirectObject).toBe('function');
    const moved = { ...pdflib, PDFObjectStreamParser: { prototype: {} } } as unknown as typeof pdflib;
    expect(() => pdflibHooks(moved)).toThrow(/was not found/);
  });

  it('reaches every hook: reads, copies, decoders, object-stream offsets, cross-reference streams, skipped objects', async () => {
    const read = async (bytes: Uint8Array) => {
      const rebuilt = rebuild(bytes);
      return readWithPdflib(pdflib, rebuilt.bytes, bytes.length, undefined, false, limits, rebuilt.ends);
    };
    const rich = await read(damagedCopy(fixture('rich.pdf')));
    expect(rich.kind).toBe('read');
    const record = 'record' in rich ? rich.record! : undefined;
    expect(record!.reads).toBeGreaterThan(0);
    expect(record!.copied).toBeGreaterThan(0);
    expect(record!.decoded).toBeGreaterThan(0);
    expect(record!.decodedObjectStreams).toBeGreaterThan(0);
    const offsets = await read(hostile.offsetsAtZero());
    expect('record' in offsets && offsets.record!.refusedObjectStreams).toBe(1);
    const skipped = await read(bytesOf(handPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 9 9] >>', '<< /A ] >>'], { table: false })));
    expect('record' in skipped && skipped.record!.skipped).toBe(1);
  });

  it('leaves out objects pdf-lib could not make sense of, without the pre-pass too', async () => {
    const bytes = bytesOf(handPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 9 9] >>', '<< /A ] >>'], { table: false }));
    const read = await readWithPdflib(pdflib, bytes, bytes.length, undefined, false);
    expect(read.kind).toBe('read');
    if (read.kind !== 'read') return;
    for (const [, object] of read.doc.context.enumerateIndirectObjects()) expect(object).not.toBeInstanceOf(pdflib.PDFInvalidObject);
    expect(read.pages).toBe(1);
  });

  it('does nothing outside a repair call: pdf-lib still reads a cross-reference stream for other steps', async () => {
    const doc = await pdflib.PDFDocument.load(fixture('rich.pdf'), { updateMetadata: false });
    expect(doc.getPageCount()).toBe(2);
  });

  it('refuses one decoder stage past 64 MiB, and passes one under it, with a call budget large enough', { timeout: 60_000 }, async () => {
    const big: Limits = { ...limits, callDecode: 1024 * M };
    const stage = (bytes: number) => hostile.objectStreamOf(bytes);
    const over = await readWithPdflib(pdflib, stage(65 * M), stage(65 * M).length, undefined, false, big);
    expect(over.kind).toBe('stopped');
    expect('record' in over && over.record!.stopped).toBe('decode');
    const under = await readWithPdflib(pdflib, stage(30 * M), stage(30 * M).length, undefined, false, big);
    expect(under.kind).not.toBe('stopped');
  });
});

describe('failures', () => {
  it('gives RepairFailed for a file with no page, and a too-damaged result', async () => {
    expect((await failure(() => one(fixture('not-a-pdf.pdf'))))).toBeInstanceOf(RepairFailed);
    expect(await inspect(bytesOf('%PDF-1.7\n1 0 obj\n<< /A 1 >>\nendobj\n'), undefined, tools)).toEqual({ kind: 'damaged' });
  });
});
