// PDFs made in memory for the Split PDF engine's outline and attachment tests:
// shapes the shared fixtures do not have. Made with pdf-lib, a test-only dependency.

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFString, StandardFonts } from '@cantoo/pdf-lib';

export type OutlineSpec = { title: string; page: number; kids?: OutlineSpec[] };

async function pages(count: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= count; n++) doc.addPage([200, 200]).drawText(`Page ${n}`, { x: 20, y: 100, size: 12, font });
  return doc;
}

/** Writes an outline tree into the document, with /First, /Last, /Next, /Prev, /Parent and /Count. */
function writeOutline(doc: PDFDocument, specs: OutlineSpec[]) {
  const context = doc.context;
  const pageRefs = doc.getPages().map((page) => page.ref);
  const root = context.nextRef();
  const build = (items: OutlineSpec[], parent: PDFRef): { first: PDFRef; last: PDFRef; count: number } => {
    const refs = items.map(() => context.nextRef());
    let count = 0;
    items.forEach((item, index) => {
      const dict: Record<string, unknown> = {
        Title: PDFString.of(item.title),
        Parent: parent,
        Dest: [pageRefs[item.page - 1]!, 'Fit'],
      };
      if (index > 0) dict.Prev = refs[index - 1];
      if (index < items.length - 1) dict.Next = refs[index + 1];
      if (item.kids?.length) {
        const kids = build(item.kids, refs[index]!);
        dict.First = kids.first;
        dict.Last = kids.last;
        dict.Count = PDFNumber.of(kids.count);
        count += kids.count;
      }
      context.assign(refs[index]!, context.obj(dict as never));
      count += 1;
    });
    return { first: refs[0]!, last: refs[refs.length - 1]!, count };
  };
  const top = build(specs, root);
  context.assign(root, context.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: PDFNumber.of(top.count) }));
  doc.catalog.set(PDFName.of('Outlines'), root);
}

/** Four pages, with a nested outline: Part A (p1) > A1 (p2), A2 (p3); Part B (p4) > B1 (p1). */
export async function nestedOutline(): Promise<Uint8Array> {
  const doc = await pages(4);
  writeOutline(doc, [
    { title: 'Part A', page: 1, kids: [{ title: 'A1', page: 2 }, { title: 'A2', page: 3 }] },
    { title: 'Part B', page: 4, kids: [{ title: 'B1', page: 1 }] },
  ]);
  return doc.save({ useObjectStreams: false });
}

/** Two pages, with an outline nested `depth` levels, each level pointing at page 1 except the deepest, at page 2. */
export async function deepOutline(depth: number): Promise<Uint8Array> {
  const doc = await pages(2);
  let spec: OutlineSpec = { title: `Level ${depth}`, page: 2 };
  for (let level = depth - 1; level >= 1; level--) spec = { title: `Level ${level}`, page: 1, kids: [spec] };
  writeOutline(doc, [spec]);
  return doc.save({ useObjectStreams: false });
}

/** Two pages, an attached file reached through an indirect /Names object and through the catalog's /AF. */
export async function indirectNamesWithAF(): Promise<Uint8Array> {
  const doc = await pages(2);
  await doc.attach(new TextEncoder().encode('secret-attachment-bytes'), 'invoice.xml', { mimeType: 'text/xml' });
  const context = doc.context;
  const catalog = doc.catalog;
  // pdf-lib writes /Names inside the catalog at save; make it an object of its own, and add /AF.
  const saved = await PDFDocument.load(await doc.save({ useObjectStreams: false }));
  const names = saved.catalog.lookup(PDFName.of('Names'), PDFDict);
  const embedded = names.lookup(PDFName.of('EmbeddedFiles'), PDFDict);
  const list = embedded.lookup(PDFName.of('Names'), PDFArray);
  const fileSpec = list.get(1);
  const namesRef = saved.context.register(names);
  saved.catalog.set(PDFName.of('Names'), namesRef);
  saved.catalog.set(PDFName.of('AF'), saved.context.obj([fileSpec]));
  void context;
  void catalog;
  return saved.save({ useObjectStreams: false });
}

/** Two pages whose outline item points back at the catalog through /Next. */
export async function outlineAliasingCatalog(): Promise<Uint8Array> {
  const doc = await pages(2);
  writeOutline(doc, [{ title: 'One', page: 1 }]);
  const root = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict);
  const item = root.lookup(PDFName.of('First'), PDFDict);
  item.set(PDFName.of('Next'), doc.context.getObjectRef(doc.catalog)!);
  return doc.save({ useObjectStreams: false });
}

/** Two pages with a flat outline of `count` bookmarks, alternating between the two pages. */
export async function manyBookmarks(count: number): Promise<Uint8Array> {
  const doc = await pages(2);
  writeOutline(doc, Array.from({ length: count }, (_, index) => ({ title: `Mark ${index + 1}`, page: (index % 2) + 1 })));
  return doc.save({ useObjectStreams: false });
}
