// The drawing step (src/engines/stamp.ts): the matrix, pdf-lib objects into qpdf's JSON, and real runs with the same
// qpdf and pdf-lib the browser gets, each result drawn by PDF.js to find the mark. The page reading it uses
// (src/engines/pages.ts) is tested in pages.test.ts.

import * as PdfLib from '@cantoo/pdf-lib';
import { PDFDocument, PDFName, PDFNumber, PDFOperator, rgb } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { plainCopy } from '../../src/engines/plain';
import { pageBox, sizeLimit } from '../../src/engines/pages';
import { OutputLimit, fromPdfLib, layerMatrix, pageEstimate, sharedText, stampPages, type NewObjects, type StampSteps } from '../../src/engines/stamp';
import { failureKind } from '../../src/workers/worker-core';
import { fixture, jsonOf, makeQpdf, marks, open, qpdfOn, storedPlaces, streamText, tools } from './stamp-helpers';

/** An operator by its name, for content pdf-lib has no helper for. */
const op = (name: string, args: Parameters<typeof PDFOperator.of>[1] = []) => PDFOperator.of(name as PdfLib.PDFOperatorNames, args);

/** A red square, 20 points, centred across the bottom of the layer, its centre 30 points up. */
const redMark: StampSteps<PdfLib.PDFFont>['draw'] = (page, area) => page.drawRectangle({ x: area.width / 2 - 10, y: 20, width: 20, height: 20, color: rgb(1, 0, 0) });

type FontSteps = StampSteps<PdfLib.PDFFont>;
/** Each run embeds Helvetica, as Add page numbers does. */
const helvetica: FontSteps['prepare'] = (doc, lib) => doc.embedFont(lib.StandardFonts.Helvetica);

async function stamp(bytes: Uint8Array, draw: FontSteps['draw'] = redMark, extra: Partial<FontSteps> = {}) {
  const copy: { plain?: Uint8Array; pages: number } = await plainCopy(tools, bytes, undefined);
  return stampPages(tools, copy, { prepare: helvetica, draw, ...extra });
}

describe('the matrix', () => {
  const box: [number, number, number, number] = [10, 20, 310, 420];
  it('takes the upright layer onto the page for each turn and user unit', () => {
    expect(layerMatrix({ turn: 0, box, unit: 1 })).toEqual([1, 0, 0, 1, 10, 20]);
    expect(layerMatrix({ turn: 90, box, unit: 1 })).toEqual([0, 1, -1, 0, 310, 20]);
    expect(layerMatrix({ turn: 180, box, unit: 1 })).toEqual([-1, 0, 0, -1, 310, 420]);
    expect(layerMatrix({ turn: 270, box, unit: 1 })).toEqual([0, -1, 1, 0, 10, 420]);
    expect(layerMatrix({ turn: 0, box, unit: 2 })).toEqual([0.5, 0, 0, 0.5, 10, 20]);
    expect(layerMatrix({ turn: 90, box, unit: 4 })).toEqual([0, 0.25, -0.25, 0, 310, 20]);
  });

});

describe('pdf-lib objects into qpdf JSON', () => {
  const fresh = (): NewObjects => ({ next: 100, byText: new Map(), entries: new Map() });

  it('turns each kind of object into its qpdf form', async () => {
    const doc = await PDFDocument.create();
    const c = doc.context;
    const objects = fresh();
    const stream = c.register(PdfLib.PDFContentStream.of(c.obj({ Type: 'XObject' }), [op('S')]));
    const raw = c.register(PdfLib.PDFRawStream.of(c.obj({ Filter: 'ASCIIHexDecode' }), new TextEncoder().encode('414243>')));
    const value = c.obj({
      Name: 'Plain-Name.1',
      Number: 1.5,
      Yes: true,
      Nothing: null,
      Text: PdfLib.PDFString.of('Hi'),
      Hex: PdfLib.PDFHexString.of('00ff'),
      List: [1, 'Two'],
      Ref: stream,
      Raw: raw,
    });
    const json = fromPdfLib(PdfLib, c, value, objects, new Map()) as Record<string, unknown>;
    expect(json).toEqual({ '/Name': '/Plain-Name.1', '/Number': 1.5, '/Yes': true, '/Nothing': null, '/Text': 'b:4869', '/Hex': 'b:00ff', '/List': [1, '/Two'], '/Ref': '100 0 R', '/Raw': '101 0 R' });
    // A stream pdf-lib compresses goes unencoded, with no /Filter; a raw stream keeps its data and its own /Filter.
    expect(objects.entries.get('100 0 R')).toEqual({ stream: { dict: { '/Type': '/XObject' }, data: Buffer.from('S\n').toString('base64') } });
    expect(objects.entries.get('101 0 R')).toEqual({ stream: { dict: { '/Filter': '/ASCIIHexDecode' }, data: Buffer.from('414243>').toString('base64') } });
  });

  it("writes an identical font once, across documents, and refuses names that are not plain, loops and streams that cannot be read", async () => {
    const objects = fresh();
    const ids = [];
    for (let run = 0; run < 2; run++) {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(PdfLib.StandardFonts.Helvetica);
      doc.addPage().drawText('1', { font });
      await doc.flush();
      ids.push(fromPdfLib(PdfLib, doc.context, font.ref, objects, new Map()));
    }
    expect(ids[0]).toBe(ids[1]);
    expect(objects.entries.size).toBe(1);
    expect(objects.entries.get(ids[0] as string)).toEqual({ value: { '/Type': '/Font', '/Subtype': '/Type1', '/BaseFont': '/Helvetica', '/Encoding': '/WinAnsiEncoding' } });

    const doc = await PDFDocument.create();
    const c = doc.context;
    expect(() => fromPdfLib(PdfLib, c, PDFName.of('A B'), fresh(), new Map())).toThrow(/not plain/);
    const loop = c.nextRef();
    c.assign(loop, c.obj({ Self: loop }));
    expect(() => fromPdfLib(PdfLib, c, loop, fresh(), new Map())).toThrow(/itself/);
    let deep: PdfLib.PDFObject = c.obj([]);
    for (let n = 0; n < 40; n++) deep = c.obj([deep]);
    expect(() => fromPdfLib(PdfLib, c, deep, fresh(), new Map())).toThrow(/too deep/);
  });
});

// ---------------------------------------------------------------------------

type Spec = { name: string; media?: number[]; raw?: unknown; crop?: number[]; trim?: number[]; rotate?: number; unit?: number; noMedia?: true; bad?: true };
const specs: Spec[] = [
  { name: 'A4' },
  { name: 'turned 90', rotate: 90 },
  { name: 'turned 180', rotate: 180 },
  { name: 'turned 270', rotate: 270 },
  { name: 'turned -90', rotate: -90 },
  { name: 'turned 450', rotate: 450 },
  { name: 'turned 45', rotate: 45 },
  { name: 'paper box offset', media: [100, 200, 712, 992] },
  { name: 'paper box reversed', raw: [612, 792, 0, 0] },
  { name: 'paper box missing', noMedia: true },
  { name: 'crop box smaller', media: [0, 0, 612, 792], crop: [50, 50, 562, 742] },
  { name: 'crop box of no area', media: [0, 0, 612, 792], crop: [0, 0, 0, 0] },
  { name: 'crop box off the paper', media: [0, 0, 612, 792], crop: [1000, 1000, 1200, 1200] },
  { name: 'trim box smaller than the crop box', media: [0, 0, 612, 792], crop: [0, 0, 612, 792], trim: [100, 100, 512, 692] },
  { name: 'user unit 2', media: [0, 0, 300, 400], unit: 2 },
  { name: 'user unit 0', unit: 0 },
  { name: 'user unit -2', unit: -2 },
  { name: 'quarter turn, offset crop box, user unit 2', media: [0, 0, 612, 792], crop: [50, 100, 562, 742], rotate: 90, unit: 2 },
  { name: 'three-quarter turn, offset crop box, user unit 2', media: [0, 0, 300, 400], crop: [20, 30, 280, 390], rotate: 270, unit: 2 },
  { name: 'unbalanced q, a scaling cm and a green fill', bad: true },
];

async function oddPages(list: Spec[], inherited?: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const spec of list) {
    const page = doc.addPage([595, 842]);
    const node = page.node;
    if (spec.noMedia) node.delete(PDFName.of('MediaBox'));
    else if (spec.raw) node.set(PDFName.of('MediaBox'), doc.context.obj(spec.raw as number[]));
    else if (spec.media) node.set(PDFName.of('MediaBox'), doc.context.obj(spec.media));
    if (spec.crop) node.set(PDFName.of('CropBox'), doc.context.obj(spec.crop));
    if (spec.trim) node.set(PDFName.of('TrimBox'), doc.context.obj(spec.trim));
    node.delete(PDFName.of('Rotate'));
    if (spec.rotate !== undefined) node.set(PDFName.of('Rotate'), PDFNumber.of(spec.rotate));
    if (spec.unit !== undefined) node.set(PDFName.of('UserUnit'), PDFNumber.of(spec.unit));
    if (spec.bad) page.pushOperators(op('q'), op('cm', [0.3, 0, 0, 0.3, 200, 0].map((n) => PDFNumber.of(n))), op('rg', [0, 1, 0].map((n) => PDFNumber.of(n))));
  }
  if (inherited !== undefined) doc.catalog.Pages().set(PDFName.of('Rotate'), PDFNumber.of(inherited));
  return doc.save({ useObjectStreams: false });
}

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('drawing on odd pages', { timeout: 60_000 }, () => {
  it('puts the mark at the bottom centre as PDF.js shows every page, and changes no stored turn, box or user unit', async () => {
    const input = await oddPages(specs);
    const output = await stamp(input);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const found = await marks(output);
    const layerHeights = specs.map((spec) => {
      const media = spec.raw ? [0, 0, 612, 792] : spec.noMedia ? [0, 0, 612, 792] : (spec.media ?? [0, 0, 595, 842]);
      return pageBox({ rotate: spec.rotate, mediaBox: media, cropBox: spec.crop, userUnit: spec.unit }).height;
    });
    found.forEach((mark, index) => {
      const name = specs[index]!.name;
      expect(mark, name).not.toBeNull();
      expect(Math.abs(mark!.x - 0.5), name).toBeLessThan(0.02);
      expect(Math.abs(mark!.fromBottom - 30 / layerHeights[index]!), name).toBeLessThan(0.02);
    });
    expect(await storedPlaces(output)).toEqual(await storedPlaces(input));
  });

  it('puts it at the bottom centre of a page whose turn is inherited from the page tree', async () => {
    const input = await oddPages([{ name: 'inherited' }, { name: 'own 0', rotate: 0 }], 90);
    const output = await stamp(input);
    const [inherited, own] = await marks(output);
    // Turned a quarter, the A4 page is shown 842 wide and 595 high.
    expect(inherited!.width).toBeGreaterThan(inherited!.height);
    expect(Math.abs(inherited!.x - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(inherited!.fromBottom - 30 / 595)).toBeLessThan(0.02);
    expect(Math.abs(own!.fromBottom - 30 / 842)).toBeLessThan(0.02);
    expect(await storedPlaces(output)).toEqual(await storedPlaces(input));
  });

  it('wraps the page in q … Q, adds [q, own streams, Q, draw], and shares q, Q and the draw stream', async () => {
    const input = await oddPages([{ name: 'a' }, { name: 'b' }, { name: 'c', bad: true }]);
    const before = await jsonOf(input);
    const output = await stamp(input);
    const after = await jsonOf(output);
    const own = before.pages.map((page) => page.contents.map((id) => streamText(before.objects, id)));
    after.pages.forEach((page, index) => {
      const texts = page.contents.map((id) => streamText(after.objects, id));
      expect(texts[0]).toBe('q\n');
      expect(texts.slice(1, -2)).toEqual(own[index]);
      expect(texts.at(-2)).toBe('\nQ\n');
      expect(texts.at(-1)).toMatch(/^q 1 0 0 1 0 0 cm \/PDFkaro Do Q\n$/);
    });
    // The first two pages are the same size, so they share their draw stream, and every page shares q and Q.
    expect(after.pages[0]!.contents[0]).toBe(after.pages[2]!.contents[0]);
    expect(after.pages[0]!.contents.at(-1)).toBe(after.pages[1]!.contents.at(-1));
  });

  it('takes a free name when /PDFkaro is taken, and keeps every other resource', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const form = doc.context.register(doc.context.formXObject([], { BBox: [0, 0, 1, 1] }));
    page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: { PDFkaro: form, PDFkaro1: form }, ExtGState: { G0: { CA: 0.5 } } }));
    const output = await stamp(await doc.save({ useObjectStreams: false }));
    const { pages, objects } = await jsonOf(output);
    const dict = objects[`obj:${pages[0]!.object}`]!.value as Record<string, Record<string, Record<string, unknown>>>;
    expect(Object.keys(dict['/Resources']!['/XObject']!).sort()).toEqual(['/PDFkaro', '/PDFkaro1', '/PDFkaro2']);
    expect(dict['/Resources']!['/ExtGState']).toEqual({ '/G0': { '/CA': 0.5 } });
    expect(streamText(objects, pages[0]!.contents.at(-1)!)).toContain('/PDFkaro2 Do');
  });
});

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('tags and shared content', { timeout: 60_000 }, () => {
  /** The marked-content ids the tag tree names for each page, by page object. */
  function mcidsByPage(objects: Awaited<ReturnType<typeof jsonOf>>['objects'], root: unknown): Map<string, number[]> {
    const found = new Map<string, number[]>();
    const value = (id: unknown) => (typeof id === 'string' ? objects[`obj:${id}`]?.value : id);
    const walk = (node: unknown, page: string | undefined, depth: number) => {
      if (depth > 50) return;
      const item = value(node);
      if (typeof item === 'number' && page) found.set(page, [...(found.get(page) ?? []), item]);
      else if (Array.isArray(item)) for (const each of item) walk(each, page, depth + 1);
      else if (item && typeof item === 'object') {
        const dict = item as Record<string, unknown>;
        const pg = typeof dict['/Pg'] === 'string' ? (dict['/Pg'] as string) : page;
        if (typeof dict['/MCID'] === 'number' && pg) found.set(pg, [...(found.get(pg) ?? []), dict['/MCID'] as number]);
        if ('/K' in dict) walk(dict['/K'], pg, depth + 1);
      }
    };
    walk(root, undefined, 0);
    return found;
  }

  async function taggedPage(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(PdfLib.StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.pushOperators(op('BDC', [PDFName.of('P'), doc.context.obj({ MCID: 0 }) as unknown as PdfLib.PDFArray]));
    page.drawText('Hello tagged', { x: 50, y: 700, size: 12, font });
    page.pushOperators(op('EMC'));
    page.pushOperators(op('BDC', [PDFName.of('Span'), doc.context.obj({ MCID: 1 }) as unknown as PdfLib.PDFArray]));
    page.drawText('Second part', { x: 50, y: 600, size: 12, font });
    page.pushOperators(op('EMC'));
    page.node.set(PDFName.of('StructParents'), PDFNumber.of(0));
    const c = doc.context;
    const root = c.nextRef();
    const para = c.register(c.obj({ Type: 'StructElem', S: 'P', P: root, Pg: page.ref, K: [0, { Type: 'MCR', MCID: 1, Pg: page.ref }] }));
    c.assign(root, c.obj({ Type: 'StructTreeRoot', K: [para], ParentTree: { Nums: [0, [para, para]] } }));
    doc.catalog.set(PDFName.of('StructTreeRoot'), root);
    doc.catalog.set(PDFName.of('MarkInfo'), c.obj({ Marked: true }));
    return doc.save({ useObjectStreams: false });
  }

  for (const [name, make] of [['tagged.pdf', async () => fixture('tagged.pdf')], ['a page made here with marked content', taggedPage]] as const) {
    it(`${name}: every tagged piece of content is still in its page's own streams, unchanged, and PDF.js still resolves the tags`, async () => {
      const input = await make();
      const before = await jsonOf(input);
      const output = await stamp(input, (page, area, _index, font) => {
        page.pushOperators(op('BDC', [PDFName.of('Artifact'), page.doc.context.obj({ Type: 'Pagination', Subtype: 'Footer' }) as unknown as PdfLib.PDFArray]));
        page.drawText('7', { x: area.width / 2, y: 30, size: 10, font });
        page.pushOperators(op('EMC'));
      });
      expect((await qpdfOn(output, ['--check'])).code).toBe(0);
      const after = await jsonOf(output);
      const rootOf = (json: typeof before) => {
        const catalog = Object.values(json.objects).find((entry) => (entry.value as Record<string, unknown> | undefined)?.['/Type'] === '/Catalog')!.value as Record<string, unknown>;
        return catalog['/StructTreeRoot'];
      };
      const beforeIds = mcidsByPage(before.objects, rootOf(before));
      const afterIds = mcidsByPage(after.objects, rootOf(after));
      // By page order: the same ids for each page, each found in that page's own streams, which are unchanged.
      before.pages.forEach((page, index) => {
        const was = beforeIds.get(page.object) ?? [];
        const now = afterIds.get(after.pages[index]!.object) ?? [];
        expect(now).toEqual(was);
        const ownBefore = page.contents.map((id) => streamText(before.objects, id));
        const contents = after.pages[index]!.contents;
        const ownAfter = contents.slice(1, -2).map((id) => streamText(after.objects, id));
        expect(ownAfter).toEqual(ownBefore);
        for (const mcid of now) expect(ownAfter.join('\n')).toMatch(new RegExp(`/MCID ${mcid}\\b`));
        // The page keeps its /StructParents.
        const dictBefore = before.objects[`obj:${page.object}`]!.value as Record<string, unknown>;
        const dictAfter = after.objects[`obj:${after.pages[index]!.object}`]!.value as Record<string, unknown>;
        expect(dictAfter['/StructParents']).toEqual(dictBefore['/StructParents']);
      });

      // PDF.js finds each tagged piece of content in the page's marked content, and the number in an artifact.
      const doc = await open(output);
      for (let number = 1; number <= doc.numPages; number++) {
        const page = await doc.getPage(number);
        const tree = await page.getStructTree();
        const ids: string[] = [];
        const collect = (node: unknown) => {
          const item = node as { type?: string; id?: string; children?: unknown[] } | null;
          if (!item) return;
          if (item.type === 'content' && item.id) ids.push(item.id);
          for (const child of item.children ?? []) collect(child);
        };
        collect(tree);
        const content = await page.getTextContent({ includeMarkedContent: true });
        const marked = content.items.flatMap((item) => ('type' in item && item.type === 'beginMarkedContentProps' ? [item.id] : []));
        for (const id of ids) expect(marked).toContain(id);
        const tags = content.items.flatMap((item) => ('type' in item && item.type.startsWith('beginMarkedContent') ? [(item as { tag?: string }).tag] : []));
        expect(tags.at(-1)).toBe('Artifact');
      }
      await doc.loadingTask.destroy();
    });
  }

  it('the made page: PDF.js still finds its tagged text from its tag', async () => {
    // Shown by the test above for both files; this one checks the text inside the tagged content for the made page.
    const output = await stamp(await taggedPage());
    const doc = await open(output);
    const page = await doc.getPage(1);
    const content = await page.getTextContent({ includeMarkedContent: true });
    let inside: string | null = null;
    const found: Record<string, string> = {};
    for (const item of content.items) {
      if ('type' in item) {
        if (item.type === 'beginMarkedContentProps') inside = item.id ?? null;
        else if (item.type === 'endMarkedContent') inside = null;
      } else if (inside) found[inside] = (found[inside] ?? '') + item.str;
    }
    expect(Object.values(found)).toEqual(['Hello tagged', 'Second part']);
    await doc.loadingTask.destroy();
  });
});

// ---------------------------------------------------------------------------

/** A PDF of `pages` pages written by hand, every page drawing one shared content stream, with these resources. */
function handMade(pages: number, { pageResources = '<< >>', treeResources = '', extra = [] as string[] }: { pageResources?: string; treeResources?: string; extra?: string[] } = {}): Uint8Array {
  const parts: string[] = ['%PDF-1.7\n'];
  const offsets: number[] = [];
  let size = parts[0]!.length;
  const object = (number: number, body: string) => {
    offsets[number] = size;
    const text = `${number} 0 obj\n${body}\nendobj\n`;
    parts.push(text);
    size += text.length;
  };
  const first = 4 + extra.length;
  const kids = Array.from({ length: pages }, (_, n) => `${first + n} 0 R`).join(' ');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages} /Kids [${kids}]${treeResources ? ` /MediaBox [0 0 200 200] /Resources ${treeResources}` : ''} >>`);
  const content = '0 0 0 rg 20 20 160 160 re f';
  object(3, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  extra.forEach((body, index) => object(4 + index, body));
  for (let n = 0; n < pages; n++) object(first + n, `<< /Type /Page /Parent 2 0 R${treeResources ? '' : ` /MediaBox [0 0 200 200] /Resources ${pageResources}`} /Contents 3 0 R >>`);
  const count = first + pages;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  parts.push(table, `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`);
  return new TextEncoder().encode(parts.join(''));
}

/** Packs a file into object streams, so it is small. */
async function packed(bytes: Uint8Array): Promise<Uint8Array> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const { code } = qpdf.call(['/in.pdf', '--object-streams=generate', '--compression-level=9', '/out.pdf']);
  expect(code).toBe(0);
  return qpdf.read('/out.pdf');
}

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('large and hostile files', { timeout: 60_000 }, () => {
  it('numbers thousands of pages that share one tiny content stream quickly, growing by a few hundred bytes a page', async () => {
    const pages = 6000;
    const input = await packed(handMade(pages));
    const started = Date.now();
    let drawn = 0;
    const output = await stamp(input, redMark, { onPage: (done) => (drawn = done) });
    const seconds = (Date.now() - started) / 1000;
    expect(drawn).toBe(pages);
    expect(seconds).toBeLessThan(30);
    expect((output.length - input.length) / pages).toBeLessThan(300);
    const { pages: list } = await jsonOf(output);
    expect(list).toHaveLength(pages);
    // Every page still draws the one shared stream.
    expect(new Set(list.map((page) => page.contents[1])).size).toBe(1);
  }, 60_000);

  it('a few-KB file whose thousands of pages inherit one large /Resources fails fast with the output limit, before any layer is drawn', async () => {
    const pages = 2000;
    // Long names that pack well: each copy of the resources is about 56 KB, and the packed file small.
    const fonts = Array.from({ length: 400 }, (_, n) => `/F${'f'.repeat(60)}${n} 4 0 R`).join(' ');
    const forms = Array.from({ length: 400 }, (_, n) => `/X${'x'.repeat(60)}${n} 6 0 R`).join(' ');
    const input = await packed(
      handMade(pages, {
        treeResources: `<< /Font << ${fonts} >> /XObject 5 0 R >>`,
        extra: ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< ${forms} >>`, '<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Length 0 >>\nstream\n\nendstream'],
      }),
    );
    expect(input.length).toBeLessThan(25_000);
    let drawn = 0;
    const started = Date.now();
    const failed = await stamp(input, (...args) => {
      drawn++;
      redMark(...args);
    }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(OutputLimit);
    expect(failureKind(failed)).toBe('output-limit');
    expect(drawn).toBe(0);
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30_000);

  it('small resources whose /XObject dictionary is behind a reference: the estimate counts that dictionary in full, and the job stops with nothing drawn', async () => {
    const pages = 2000;
    const forms = Array.from({ length: 800 }, (_, n) => `/X${'x'.repeat(60)}${n} 5 0 R`).join(' ');
    const input = await packed(
      handMade(pages, {
        treeResources: '<< /XObject 4 0 R >>',
        extra: [`<< ${forms} >>`, '<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Length 0 >>\nstream\n\nendstream'],
      }),
    );
    let drawn = 0;
    const failed = await stamp(input, (...args) => {
      drawn++;
      redMark(...args);
    }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(OutputLimit);
    expect(drawn).toBe(0);
  });

  it('pageEstimate counts the resolved /XObject dictionary, not only the reference to it', () => {
    const xobjects = Object.fromEntries(Array.from({ length: 1000 }, (_, n) => [`/X${n}`, '9 0 R']));
    const page = { dict: { '/Type': '/Page', '/Resources': '7 0 R' }, resources: { '/XObject': '8 0 R' }, xobjects, contents: ['3 0 R'] };
    const small = pageEstimate({ ...page, xobjects: undefined }, new WeakMap());
    const large = pageEstimate(page, new WeakMap());
    expect(large - small).toBeGreaterThanOrEqual(JSON.stringify(xobjects).length);
  });

});

// ---------------------------------------------------------------------------
// Drawing on some pages only (`only`), and what every page shares (`sharedBytes`), for Sign PDF.

/** The page objects of a file, by page order, each as qpdf's JSON gives it with its content streams' text. */
async function pageObjects(bytes: Uint8Array) {
  const { pages, objects } = await jsonOf(bytes);
  // qpdf numbers objects afresh as it writes, so references are left out: the page tree's, and the content streams', given by their text.
  return pages.map((page) => {
    const dict = { ...(objects[`obj:${page.object}`]!.value as Record<string, unknown>) };
    delete dict['/Parent'];
    delete dict['/Contents'];
    return { dict, contents: page.contents.map((id) => streamText(objects, id)) };
  });
}

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('drawing on some pages only', { timeout: 60_000 }, () => {
  it('the last of three pages: only it carries the mark; the first two pages are as in the plain copy, and qpdf --check passes', async () => {
    const input = await oddPages([{ name: 'a' }, { name: 'b', rotate: 90 }, { name: 'c' }]);
    const plain = (await plainCopy(tools, input, undefined)).plain;
    const drawnOn: number[] = [];
    const counted: [number, number][] = [];
    const output = await stamp(input, (page, area, index, run, lib) => {
      drawnOn.push(index);
      redMark(page, area, index, run, lib);
    }, { only: (index, total) => index === total - 1, onPage: (done, total) => counted.push([done, total]) });
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    expect(drawnOn).toEqual([2]);
    expect(counted).toEqual([[1, 1]]);
    const found = await marks(output);
    expect(found[0]).toBeNull();
    expect(found[1]).toBeNull();
    expect(found[2]).not.toBeNull();
    const before = await pageObjects(plain);
    const after = await pageObjects(output);
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after[2]!.contents.slice(1, -2)).toEqual(before[2]!.contents);
  });

  it('left out, every page is drawn on, as Add page numbers and Watermark draw', async () => {
    const input = await oddPages([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    const counted: [number, number][] = [];
    const output = await stamp(input, redMark, { onPage: (done, total) => counted.push([done, total]) });
    expect(counted).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect((await marks(output)).every((mark) => mark !== null)).toBe(true);
  });

  it('no page chosen: refused before anything is written or drawn, as the engine failure', async () => {
    let prepared = 0;
    let drawn = 0;
    const failed = await stamp(fixture('text.pdf'), () => drawn++, {
      only: () => false,
      prepare: async (doc, lib) => {
        prepared++;
        return doc.embedFont(lib.StandardFonts.Helvetica);
      },
    }).catch((error: unknown) => error as Error);
    expect(failed).toBeInstanceOf(Error);
    expect((failed as Error).message).toBe('No page was chosen to draw on.');
    expect(failureKind(failed)).toBe('engine');
    expect([prepared, drawn]).toEqual([0, 0]);
  });

  it('the first page of 120,000: one layer, `prepare` called for one run only, progress counting one page, a few kilobytes larger than the plain copy written with object streams', async () => {
    const pages = 120_000;
    const input = await packed(handMade(pages));
    const plain = (await plainCopy(tools, input, undefined)).plain;
    const withStreams = await packed(plain);
    let prepared = 0;
    const drawnOn: number[] = [];
    const counted: [number, number][] = [];
    const output = await stamp(input, (page, area, index, run, lib) => {
      drawnOn.push(index);
      redMark(page, area, index, run, lib);
    }, {
      only: (index) => index === 0,
      prepare: async (doc, lib) => {
        prepared++;
        return doc.embedFont(lib.StandardFonts.Helvetica);
      },
      onPage: (done, total) => counted.push([done, total]),
    });
    expect(prepared).toBe(1);
    expect(drawnOn).toEqual([0]);
    expect(counted).toEqual([[1, 1]]);
    expect(output.length - withStreams.length).toBeLessThan(4096);
    expect((await qpdfOn(output, ['--show-npages'])).out.trim()).toBe(String(pages));
  }, 240_000);

  it('a run of 2,000 chosen pages with none chosen around them: chosen pages are grouped into runs, and a stretch with none makes no run', async () => {
    const pages = 4500;
    const input = await packed(handMade(pages));
    let prepared = 0;
    const drawnOn: number[] = [];
    // Pages 0 to 1,999 and 4,000 to 4,499: 2,500 pages in two runs; pages 2,000 to 3,999 make none.
    const output = await stamp(input, (page, area, index, run, lib) => {
      drawnOn.push(index);
      redMark(page, area, index, run, lib);
    }, {
      only: (index) => index < 2000 || index >= 4000,
      prepare: async (doc, lib) => {
        prepared++;
        return doc.embedFont(lib.StandardFonts.Helvetica);
      },
    });
    expect(prepared).toBe(2);
    expect(drawnOn).toHaveLength(2500);
    expect(drawnOn[2000]).toBe(4000);
    const { pages: list } = await jsonOf(output);
    // A page not chosen still draws its one stream alone; a chosen page has [q, its stream, Q, draw].
    expect(list[2500]!.contents).toHaveLength(1);
    expect(list[0]!.contents).toHaveLength(4);
    expect(list[4499]!.contents).toHaveLength(4);
  }, 120_000);
});

describe('what every page shares', { timeout: 60_000 }, () => {
  it('is counted once: shared bytes that fit with the chosen pages pass, and the update may carry them as base64 above the budget', async () => {
    expect(sharedText(3000)).toBe(4000 + 4096);
    // A raw stream of 12 MB, shared by every run and written once, on a small file: inside the budget at its own size.
    const data = new Uint8Array(12 * 1024 * 1024).map((_, index) => (index * 7919) % 251);
    let prepared = 0;
    const output = await stamp(fixture('text.pdf'), (page, area, _index, run) => {
      const name = page.node.newXObject('Big', run as unknown as PdfLib.PDFRef);
      page.pushOperators(op('q'), op('cm', [10, 0, 0, 10, 0, 0].map((n) => PDFNumber.of(n))), op('Do', [PDFName.of(name.asString().slice(1))]), op('Q'));
      void area;
    }, {
      sharedBytes: data.length,
      prepare: async (doc) => {
        prepared++;
        const stream = doc.context.stream(data, { Type: 'XObject', Subtype: 'Image', Width: 4, Height: data.length / 12, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode' });
        return doc.context.register(stream) as unknown as PdfLib.PDFFont;
      },
    });
    expect(prepared).toBe(1);
    expect(output.length).toBeGreaterThan(data.length);
    expect(output.length).toBeLessThan(data.length + 64 * 1024);
  });

  it('over the budget with the chosen pages: OutputLimit with the reason "shared", before any run is prepared or drawn', async () => {
    // The budget itself, from the plain copy's size: with the chosen pages' estimate added it is surely over.
    const plain = (await plainCopy(tools, fixture('text.pdf'), undefined)).plain!;
    let prepared = 0;
    let drawn = 0;
    const failed = await stamp(fixture('text.pdf'), () => drawn++, {
      sharedBytes: sizeLimit(plain.byteLength, 3),
      prepare: async (doc, lib) => {
        prepared++;
        return doc.embedFont(lib.StandardFonts.Helvetica);
      },
    }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(OutputLimit);
    expect((failed as OutputLimit).reason).toBe('shared');
    expect(failureKind(failed)).toBe('output-limit');
    expect([prepared, drawn]).toEqual([0, 0]);
    // Any other limit has no reason.
    expect(new OutputLimit().reason).toBeUndefined();
  });

  it('the chosen pages alone over the budget: a plain OutputLimit, not "shared", however small the shared bytes', async () => {
    // Thousands of pages inheriting one large /Resources: the pages' estimate alone passes the budget.
    const fonts = Array.from({ length: 400 }, (_, n) => `/F${'f'.repeat(60)}${n} 4 0 R`).join(' ');
    const input = await packed(
      handMade(2000, { treeResources: `<< /Font << ${fonts} >> >>`, extra: ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'] }),
    );
    let prepared = 0;
    for (const sharedBytes of [1, 8 * 1024 * 1024]) {
      const failed = await stamp(input, redMark, {
        sharedBytes,
        prepare: async (doc, lib) => {
          prepared++;
          return doc.embedFont(lib.StandardFonts.Helvetica);
        },
      }).catch((error: unknown) => error);
      expect(failed, String(sharedBytes)).toBeInstanceOf(OutputLimit);
      expect((failed as OutputLimit).reason, String(sharedBytes)).toBeUndefined();
      expect(failureKind(failed)).toBe('output-limit');
    }
    expect(prepared).toBe(0);
  }, 60_000);
});
