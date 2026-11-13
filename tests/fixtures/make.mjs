// Makes the shared test set of PDFs. Run from the repo root: node tests/fixtures/make.mjs
// The files it makes are committed, so tests do not depend on this script.
// Dates are fixed so that a second run changes as little as possible.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts, cmyk, degrees, drawObject, popGraphicsState, pushGraphicsState, concatTransformationMatrix } from '@cantoo/pdf-lib';

const require = createRequire(import.meta.url);
const out = process.argv[2] ?? dirname(fileURLToPath(import.meta.url));
mkdirSync(out, { recursive: true });

const fixedDate = new Date('2026-01-01T00:00:00Z');

async function newDoc(title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('PDFkaro test set');
  doc.setProducer('PDFkaro test set');
  doc.setCreationDate(fixedDate);
  doc.setModificationDate(fixedDate);
  return doc;
}

function save(name, bytes) {
  writeFileSync(join(out, name), bytes);
  console.log(`${name}  ${bytes.length} bytes`);
}

// A plain PNG made by hand: grey paper with darker bands, like a scanned page.
function scanPng(width, height, seed) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const band = (y + seed * 7) % 24 < 3 && y > 30 && y < height - 30;
    for (let x = 0; x < width; x++) {
      const inText = band && x > 24 && x < width - 24 - ((y * 13 + seed) % 60);
      rows[y * (width + 1) + 1 + x] = inText ? 70 : 236 - ((x * 3 + y * 5 + seed) % 9);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// qpdf, for the files that need encryption or damage that qpdf itself must judge.
const createModule = require('@neslinesli93/qpdf-wasm');
const qpdf = await createModule({
  locateFile: () => require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'),
  noInitialRun: true,
  thisProgram: 'qpdf',
  preRun: [(m) => m.FS.init(null, () => {}, () => {})],
});
function qpdfRun(input, args) {
  qpdf.FS.writeFile('/in.pdf', input);
  const code = qpdf.callMain([...args, '--', '/in.pdf', '/out.pdf']);
  if (code !== 0) throw new Error(`qpdf exited with ${code}`);
  return qpdf.FS.readFile('/out.pdf');
}

// 1. An ordinary text document of a few pages.
const text = await newDoc('An ordinary text document');
const font = await text.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) {
  const page = text.addPage([595, 842]);
  page.drawText(`Ordinary document, page ${i}`, { x: 60, y: 760, size: 20, font });
  for (let line = 0; line < 30; line++) {
    page.drawText(`Line ${line + 1} of plain text on page ${i}, so that the page has words to keep.`, { x: 60, y: 720 - line * 20, size: 11, font });
  }
}
const textBytes = await text.save({ useObjectStreams: false });
save('text.pdf', textBytes);

// 2. A 500-page document.
const long = await newDoc('A 500-page document');
const longFont = await long.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 500; i++) long.addPage([595, 842]).drawText(`Page ${i} of 500`, { x: 60, y: 760, size: 18, font: longFont });
save('pages-500.pdf', await long.save());

// 3. A scanned document with no text layer: each page is one image.
const scan = await newDoc('A scanned document');
for (let i = 0; i < 2; i++) {
  const image = await scan.embedPng(scanPng(300, 424, i));
  scan.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
}
save('scanned.pdf', await scan.save());

// 4. A password-protected file. The password to open it is "open-sesame".
save('password.pdf', qpdfRun(textBytes, ['--encrypt', 'open-sesame', 'owner-secret', '256']));

// 5. A file with print and edit restrictions and no password to open it.
save('restricted.pdf', qpdfRun(textBytes, ['--encrypt', '', 'owner-secret', '256', '--print=none', '--modify=none']));

// 6. A damaged file whose cross-reference table points to the wrong places.
const source = Buffer.from(textBytes).toString('latin1');
const brokenTable = source.replace(/\n(\d{10}) 00000 n/g, (_, offset) => `\n${String(Number(offset) + 7).padStart(10, '0')} 00000 n`);
if (brokenTable === source) throw new Error('The cross-reference table was not found.');
save('damaged-xref.pdf', Buffer.from(brokenTable, 'latin1'));

// 6b. A readable file with a small fault: its page tree has /Count twice.
// qpdf reads it, says so in a warning, and exits with 3 ("done with warnings").
const warned = source.replace('/Type /Pages\n', '/Count 3    \n');
if (warned === source || warned.length !== source.length) throw new Error('The page tree was not found.');
save('warning.pdf', Buffer.from(warned, 'latin1'));

// 7. A damaged file that is cut off part way. qpdf cannot read it.
const whole = await long.save();
save('damaged-cut.pdf', whole.subarray(0, Math.floor(whole.length * 0.4)));

// 8. A file that is not a PDF at all, whatever its name says.
save('not-a-pdf.pdf', Buffer.from('This is a text file that someone renamed.\n'));

// 9. A fillable form.
const formDoc = await newDoc('A fillable form');
const formFont = await formDoc.embedFont(StandardFonts.Helvetica);
const formPage = formDoc.addPage([595, 842]);
formPage.drawText('Name', { x: 60, y: 760, size: 12, font: formFont });
const form = formDoc.getForm();
const name = form.createTextField('name');
name.setText('Sample text');
name.addToPage(formPage, { x: 120, y: 750, width: 240, height: 24 });
formPage.drawText('Agree', { x: 60, y: 700, size: 12, font: formFont });
form.createCheckBox('agree').addToPage(formPage, { x: 120, y: 694, width: 18, height: 18 });
save('form.pdf', await formDoc.save());

// 10. Pages with mixed sizes and mixed rotation.
const mixed = await newDoc('Mixed sizes and rotation');
const mixedFont = await mixed.embedFont(StandardFonts.Helvetica);
const shapes = [
  [[595, 842], 0, 'A4 upright'],
  [[792, 612], 0, 'Letter on its side'],
  [[420, 595], 90, 'A5 turned a quarter'],
  [[595, 842], 180, 'A4 upside down'],
];
for (const [size, turn, label] of shapes) {
  const page = mixed.addPage(size);
  page.setRotation(degrees(turn));
  page.drawText(label, { x: 40, y: size[1] - 80, size: 16, font: mixedFont });
}
save('mixed.pdf', await mixed.save());

// 11. A file with bookmarks, a link and an attachment.
const rich = await newDoc('Bookmarks, a link and an attachment');
const richFont = await rich.embedFont(StandardFonts.Helvetica);
const first = rich.addPage([595, 842]);
first.drawText('Chapter one. Visit example.org', { x: 60, y: 760, size: 16, font: richFont });
const second = rich.addPage([595, 842]);
second.drawText('Chapter two', { x: 60, y: 760, size: 16, font: richFont });
await rich.attach(Buffer.from('A note kept inside the PDF.\n'), 'note.txt', { mimeType: 'text/plain', creationDate: fixedDate, modificationDate: fixedDate });
const context = rich.context;
const link = context.register(
  context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [60, 750, 330, 780], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.org/') } }),
);
first.node.set(PDFName.of('Annots'), context.obj([link]));
const outline = context.nextRef();
const one = context.nextRef();
const two = context.nextRef();
context.assign(one, context.obj({ Title: PDFString.of('Chapter one'), Parent: outline, Next: two, Dest: [first.ref, 'Fit'] }));
context.assign(two, context.obj({ Title: PDFString.of('Chapter two'), Parent: outline, Prev: one, Dest: [second.ref, 'Fit'] }));
context.assign(outline, context.obj({ Type: 'Outlines', First: one, Last: two, Count: PDFNumber.of(2) }));
rich.catalog.set(PDFName.of('Outlines'), outline);
save('rich.pdf', await rich.save());

// 12. Images and colour that need PDF.js's decoders: a JPEG 2000 image and
// text and shapes in CMYK colour. The JPEG 2000 bytes (a 48 by 32 colour
// gradient) were made once with Pillow and are kept here, because no JPEG 2000
// encoder runs in Node. JBIG2 cannot be made on the build machine.
const jpx = Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAIAAAADAAAwcHAAAAAAAPY29scgEAAAAAABAAAAEOanAyY/9P/1EALwAAAAAAMAAAACAAAAAAAAAAAAAAADAAAAAgAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAABAAUEBAAB/1wAE0BASEhQSEhQSEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAhwAB/5PfgCAG6wE/x9QGCR9/x9QECHPAfCCACICn4AYCZYfD6gMAET1/gKPtBQALO3fin8HzhAAsWplbgKH1AwADgl91jqfA+QUASyVADlZBxTv6P4Cg+cQAUipMCt9zgvHAfCaAgt3nkhJtvJ8WKGR6f4CgfIGAtzgqj/9//9k=', 'base64');
const pictures = await newDoc('Images and colour for the decoders');
const picturesFont = await pictures.embedFont(StandardFonts.Helvetica);
const picturePage = pictures.addPage([595, 842]);
picturePage.drawText('A JPEG 2000 image and CMYK colour', { x: 60, y: 760, size: 18, font: picturesFont, color: cmyk(0, 0.9, 0.9, 0) });
picturePage.drawRectangle({ x: 60, y: 650, width: 200, height: 60, color: cmyk(1, 0, 0, 0) });
const jpxImage = pictures.context.register(
  pictures.context.stream(jpx, { Type: 'XObject', Subtype: 'Image', Width: 48, Height: 32, Filter: 'JPXDecode' }),
);
const jpxName = picturePage.node.newXObject('Im', jpxImage);
picturePage.pushOperators(pushGraphicsState(), concatTransformationMatrix(300, 0, 0, 200, 60, 400), drawObject(jpxName), popGraphicsState());
save('images.pdf', await pictures.save());

// 13. A tagged file, for what a file with fewer pages keeps of pages left out.
// Page 2 has visible text, a form field, a tag with alternative and actual
// text, a named destination and a titled reading thread. qpdf drops the page's
// own content and field when page 2 is left out, but keeps the document's tags,
// named destinations and threads whole (the owner's decision of 13 Nov 2026).
const tagged = await newDoc('A tagged file');
const taggedFont = await tagged.embedFont(StandardFonts.Helvetica);
const pageOne = tagged.addPage([300, 300]);
pageOne.drawText('Page one text', { x: 30, y: 250, size: 14, font: taggedFont });
const pageTwo = tagged.addPage([300, 300]);
pageTwo.drawText('SECRET-PAGE-TWO-TEXT', { x: 30, y: 250, size: 14, font: taggedFont });
tagged.getForm().createTextField('secretfield').addToPage(pageTwo, { x: 30, y: 150, width: 200, height: 24 });
const tc = tagged.context;
const structRoot = tc.nextRef();
const element = tc.nextRef();
tc.assign(element, tc.obj({ Type: 'StructElem', S: 'Figure', P: structRoot, Pg: pageTwo.ref, Alt: PDFString.of('SECRET-ALT-TEXT'), ActualText: PDFString.of('SECRET-ACTUAL-TEXT') }));
tc.assign(structRoot, tc.obj({ Type: 'StructTreeRoot', K: [element] }));
tagged.catalog.set(PDFName.of('StructTreeRoot'), structRoot);
tagged.catalog.set(PDFName.of('MarkInfo'), tc.obj({ Marked: true }));
tagged.catalog.set(PDFName.of('Dests'), tc.obj({ 'SECRET-DEST-NAME': [pageTwo.ref, 'Fit'] }));
const thread = tc.nextRef();
const bead = tc.nextRef();
tc.assign(bead, tc.obj({ Type: 'Bead', T: thread, N: bead, V: bead, P: pageTwo.ref, R: [20, 20, 280, 280] }));
tc.assign(thread, tc.obj({ Type: 'Thread', F: bead, I: tc.obj({ Title: PDFString.of('SECRET-THREAD-TITLE') }) }));
tagged.catalog.set(PDFName.of('Threads'), tc.obj([thread]));
pageTwo.node.set(PDFName.of('B'), tc.obj([bead]));
save('tagged.pdf', await tagged.save({ useObjectStreams: false }));
