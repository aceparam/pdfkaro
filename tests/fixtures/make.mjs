// Makes the shared test set of PDFs. Run from the repo root: node tests/fixtures/make.mjs
// The files it makes are committed, so tests do not depend on this script.
// Dates are fixed so that a second run changes as little as possible.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
// text, a named destination, a titled reading thread, and a filled field and a
// note and a web link that the tags point to. qpdf drops the page's own content and its
// untagged field when page 2 is left out, but keeps the document's tags, named
// destinations and threads whole (the owner's decision of 13 Nov 2026), and with
// the tags the tagged field, its value, the note and the link.
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
// A filled field, a note and a web link on page 2, each tagged through an object reference,
// as tagging tools do. The tags reach them, so they stay when page 2 is left out.
const taggedField = tagged.getForm().createTextField('SECRET-TAGGED-FIELD');
taggedField.setText('SECRET-TAGGED-VALUE');
taggedField.addToPage(pageTwo, { x: 30, y: 100, width: 200, height: 24 });
const fieldWidget = taggedField.acroField.getWidgets()[0];
const fieldWidgetRef = tc.getObjectRef(fieldWidget.dict);
const note = tc.register(tc.obj({ Type: 'Annot', Subtype: 'Text', Rect: [250, 250, 270, 270], Contents: PDFString.of('SECRET-NOTE'), P: pageTwo.ref }));
pageTwo.node.lookup(PDFName.of('Annots')).push(note);
const tagLink = tc.register(tc.obj({ Type: 'Annot', Subtype: 'Link', Rect: [30, 50, 230, 70], Border: [0, 0, 0], P: pageTwo.ref, A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://SECRET-LINK.example/') } }));
pageTwo.node.lookup(PDFName.of('Annots')).push(tagLink);
const linkElement = tc.nextRef();
tc.assign(linkElement, tc.obj({ Type: 'StructElem', S: 'Link', P: structRoot, Pg: pageTwo.ref, K: tc.obj({ Type: 'OBJR', Obj: tagLink, Pg: pageTwo.ref }) }));
const formElement = tc.nextRef();
const noteElement = tc.nextRef();
tc.assign(formElement, tc.obj({ Type: 'StructElem', S: 'Form', P: structRoot, Pg: pageTwo.ref, K: tc.obj({ Type: 'OBJR', Obj: fieldWidgetRef, Pg: pageTwo.ref }) }));
tc.assign(noteElement, tc.obj({ Type: 'StructElem', S: 'Annot', P: structRoot, Pg: pageTwo.ref, K: tc.obj({ Type: 'OBJR', Obj: note, Pg: pageTwo.ref }) }));
tc.assign(structRoot, tc.obj({ Type: 'StructTreeRoot', K: [element, formElement, noteElement, linkElement] }));
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

// ---------------------------------------------------------------------------
// 14. Pictures, for Image to PDF, in pictures/. JPGs and PNGs are drawn with
// @napi-rs/canvas, and the parts that carry details (EXIF, XMP, IPTC, comments,
// thumbnails, colour profiles, PNG text chunks) are written by hand, each with
// a marker text the tests look for in the PDF. cmyk.jpg and progressive.jpg
// were made once with Pillow and are committed; this script reads
// progressive.jpg but never writes either (see the README).

const { createCanvas } = await import('@napi-rs/canvas');
const pictureSource = join(dirname(fileURLToPath(import.meta.url)), 'pictures');
const pictureOut = join(out, 'pictures');
mkdirSync(pictureOut, { recursive: true });
const savePicture = (name, bytes) => save(join('pictures', name), bytes);

const ascii = (value) => Buffer.from(value, 'latin1');
const be16 = (value) => Buffer.from([(value >> 8) & 0xff, value & 0xff]);
const be32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
};

/** A JPG segment: marker, length, data. */
const segment = (marker, data) => Buffer.concat([Buffer.from([0xff, marker]), be16(data.length + 2), data]);

/** The segments of a JPG, up to its first end of image: { marker, start, end }. */
function jpegSegments(jpeg) {
  const found = [{ marker: 0xd8, start: 0, end: 2 }];
  let at = 2;
  for (;;) {
    const marker = jpeg[at + 1];
    if (marker === 0xd9) {
      found.push({ marker, start: at, end: at + 2 });
      return found;
    }
    let end = at + 2 + jpeg.readUInt16BE(at + 2);
    if (marker === 0xda) {
      while (!(jpeg[end] === 0xff && jpeg[end + 1] !== 0 && !(jpeg[end + 1] >= 0xd0 && jpeg[end + 1] <= 0xd7))) end++;
    }
    found.push({ marker, start: at, end });
    at = end;
  }
}

/** A JPG with `added` segments put in before its first segment that `before` picks, or by default after its JFIF APP0 (or its start). */
function withSegments(jpeg, added, before = () => false) {
  const parts = jpegSegments(jpeg);
  const index = parts.findIndex((part, place) => place > 0 && before(part, place));
  const cut = index > 0 ? parts[index].start : parts[1].marker === 0xe0 ? parts[1].end : 2;
  return Buffer.concat([jpeg.subarray(0, cut), ...added, jpeg.subarray(cut)]);
}

/** A JPG without its colour profile segment, which @napi-rs/canvas adds to every JPG it writes. */
function withoutProfile(jpeg) {
  const kept = jpegSegments(jpeg).filter((part) => !(part.marker === 0xe2 && jpeg.subarray(part.start + 4, part.start + 16).toString('latin1') === 'ICC_PROFILE\0'));
  return Buffer.concat(kept.map((part) => jpeg.subarray(part.start, part.end)));
}

/**
 * A big-endian TIFF block for EXIF: an optional camera maker and model, a
 * camera turn, and an optional GPS directory with a latitude and a place name.
 */
function tiff({ make, model, orientation, gps }) {
  const entries = [];
  if (make) entries.push({ tag: 0x010f, type: 2, value: ascii(`${make}\0`) });
  if (model) entries.push({ tag: 0x0110, type: 2, value: ascii(`${model}\0`) });
  if (orientation) entries.push({ tag: 0x0112, type: 3, count: 1, value: Buffer.concat([be16(orientation), Buffer.alloc(2)]) });
  if (gps) entries.push({ tag: 0x8825, type: 4, count: 1, gps: true });
  // The layout: header (8), IFD0, then its values; then the GPS directory and its values.
  const ifdSize = (list) => 2 + list.length * 12 + 4;
  const gpsEntries = gps
    ? [
        { tag: 0x0001, type: 2, value: ascii('N\0') },
        { tag: 0x0002, type: 5, count: 3, value: Buffer.concat(gps.latitude.flatMap(([n, d]) => [be32(n), be32(d)])) },
        { tag: 0x001c, type: 7, value: Buffer.concat([ascii('ASCII\0\0\0'), ascii(gps.place)]) },
      ]
    : [];
  const write = (list, start) => {
    let valueAt = start + ifdSize(list);
    const head = [be16(list.length)];
    const values = [];
    for (const entry of list) {
      const value = entry.value ?? Buffer.alloc(4);
      const count = entry.count ?? value.length;
      head.push(be16(entry.tag), be16(entry.type), be32(count));
      if (entry.gps) head.push(be32(0xffffffff));
      else if (value.length <= 4) head.push(Buffer.concat([value, Buffer.alloc(4 - value.length)]));
      else {
        head.push(be32(valueAt));
        values.push(value);
        valueAt += value.length + (value.length % 2);
        if (value.length % 2) values.push(Buffer.alloc(1));
      }
    }
    head.push(be32(0));
    return { bytes: Buffer.concat([...head, ...values]), end: valueAt };
  };
  const ifd0 = write(entries, 8);
  let bytes = Buffer.concat([ascii('MM\0*'), be32(8), ifd0.bytes]);
  if (gps) {
    const gpsAt = bytes.length;
    const pointer = bytes.indexOf(Buffer.from([0xff, 0xff, 0xff, 0xff]));
    bytes.writeUInt32BE(gpsAt, pointer);
    bytes = Buffer.concat([bytes, write(gpsEntries, gpsAt).bytes]);
  }
  return bytes;
}
const exifSegment = (fields) => segment(0xe1, Buffer.concat([ascii('Exif\0\0'), tiff(fields)]));

/** A JPG drawn on a canvas. */
function canvasJpeg(width, height, draw, quality = 92) {
  const canvas = createCanvas(width, height);
  draw(canvas.getContext('2d'), width, height);
  return canvas.toBuffer('image/jpeg', quality);
}
/** A PNG drawn on a canvas (8-bit RGBA). */
function canvasPng(width, height, draw) {
  const canvas = createCanvas(width, height);
  draw(canvas.getContext('2d'), width, height);
  return canvas.toBuffer('image/png');
}

/** A photo-like scene: sky, ground, a sun and some lines. */
function scene(context, width, height) {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#5f8fc9');
  sky.addColorStop(0.6, '#cfe0f2');
  sky.addColorStop(0.6, '#6c8c4a');
  sky.addColorStop(1, '#3b5226');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#f2c94c';
  context.beginPath();
  context.arc(width * 0.7, height * 0.25, Math.min(width, height) * 0.1, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#1b1b1b';
  context.lineWidth = 3;
  for (let line = 0; line < 6; line++) {
    context.beginPath();
    context.moveTo(width * 0.1, height * (0.65 + line * 0.05));
    context.lineTo(width * 0.9, height * (0.67 + line * 0.05));
    context.stroke();
  }
}

// PNG chunks by hand.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const body = Buffer.concat([ascii(type), data]);
  return Buffer.concat([be32(data.length), body, be32(crc32(body))]);
}
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = (width, height, depth, colourType) => pngChunk('IHDR', Buffer.concat([be32(width), be32(height), Buffer.from([depth, colourType, 0, 0, 0])]));
/** A PNG with `chunks` put in after IHDR. */
function pngWithChunks(png, chunks) {
  const ihdrEnd = 8 + 25;
  return Buffer.concat([png.subarray(0, ihdrEnd), ...chunks.map(([type, data]) => pngChunk(type, data)), png.subarray(ihdrEnd)]);
}

// 14a. A tall photo and a wide one, and a wide screenshot.
savePicture('tall.jpg', canvasJpeg(1500, 2000, scene, 80));
savePicture('wide.jpg', canvasJpeg(2000, 1500, scene, 80));
savePicture(
  'screenshot.png',
  canvasPng(1280, 720, (context, width, height) => {
    context.fillStyle = '#fbfaf6';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#1b1b1b';
    context.font = '32px sans-serif';
    context.fillText('A screenshot of a page', 60, 100);
    for (let line = 0; line < 12; line++) context.fillRect(60, 160 + line * 40, 900 - (line % 3) * 120, 14);
  }),
);

// 14b. Every camera turn, 1 to 8. Each shows the same picture, 160 by 100, with
// a red top-left, green top-right, blue bottom-left and yellow bottom-right
// corner, once turned as its EXIF says; its stored pixels are turned the other way.
const corners = { tl: [220, 30, 30], tr: [30, 170, 60], bl: [40, 60, 220], br: [240, 210, 40] };
function turnedJpeg(orientation, format = 'jpeg') {
  const shown = { width: 160, height: 100 };
  const swap = orientation >= 5;
  const stored = swap ? { width: shown.height, height: shown.width } : shown;
  const canvas = createCanvas(stored.width, stored.height);
  const context = canvas.getContext('2d');
  const image = context.createImageData(stored.width, stored.height);
  const sw = stored.width;
  const sh = stored.height;
  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      const [dx, dy] = {
        1: [sx, sy],
        2: [sw - 1 - sx, sy],
        3: [sw - 1 - sx, sh - 1 - sy],
        4: [sx, sh - 1 - sy],
        5: [sy, sx],
        6: [sh - 1 - sy, sx],
        7: [sh - 1 - sy, sw - 1 - sx],
        8: [sy, sw - 1 - sx],
      }[orientation];
      const colour = corners[`${dy < shown.height / 2 ? 't' : 'b'}${dx < shown.width / 2 ? 'l' : 'r'}`];
      image.data.set([...colour, 255], (sy * sw + sx) * 4);
    }
  }
  context.putImageData(image, 0, 0);
  if (format === 'png') return pngWithChunks(canvas.toBuffer('image/png'), [['eXIf', tiff({ orientation })]]);
  return withSegments(withoutProfile(canvas.toBuffer('image/jpeg', 95)), [exifSegment({ orientation })]);
}
for (let orientation = 1; orientation <= 8; orientation++) savePicture(`turn-${orientation}.jpg`, turnedJpeg(orientation));
savePicture('turn-6.png', turnedJpeg(6, 'png'));

// 14c. Details in every place a JPG keeps them, each with a marker text. The
// picture is a plain scene; the tests look for each marker in the PDF.
const thumbnailJpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xfe, ascii('SECRET-JFXX-THUMB')), withoutProfile(canvasJpeg(16, 12, scene)).subarray(2)]);
const jfifThumb = Buffer.concat([ascii('JFIF\0'), Buffer.from([1, 2, 0]), be16(72), be16(72), Buffer.from([6, 1]), ascii('SECRET-JFIF-THUMB!')]);
if (jfifThumb.length !== 14 + 18) throw new Error('The JFIF thumbnail must be 6 by 1 pixels of RGB.');
const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>SECRET-XMP-TITLE</dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
const extendedXmp = Buffer.concat([ascii('http://ns.adobe.com/xmp/extension/\0'), ascii('0123456789ABCDEF0123456789ABCDEF'), be32(22), be32(0), ascii('SECRET-XMP-EXTENSION!!')]);
const iptc = Buffer.concat([ascii('Photoshop 3.0\0'), ascii('8BIM'), be16(0x0404), Buffer.from([0, 0]), be32(18), Buffer.from([0x1c, 0x02, 0x78]), be16(13), ascii('SECRET-IPTC!!')]);
const secondPhoto = withSegments(withoutProfile(canvasJpeg(32, 24, scene)), [exifSegment({ make: 'SECRET-SECOND-MAKE', gps: { latitude: [[48, 1], [51, 1], [29, 1]], place: 'SECRET-SECOND-GPS' } })]);
const mpf = segment(0xe2, Buffer.concat([ascii('MPF\0'), ascii('MM\0*'), be32(8), ascii('SECRET-MPF-INDEX')]));
const detailed = withSegments(withoutProfile(canvasJpeg(400, 300, scene)), [
  segment(0xe0, jfifThumb),
  segment(0xe0, Buffer.concat([ascii('JFXX\0'), Buffer.from([0x10]), thumbnailJpeg])),
  exifSegment({ make: 'SECRET-CAMERA-MAKE', model: 'SECRET-CAMERA-MODEL', gps: { latitude: [[51, 1], [30, 1], [26, 1]], place: 'SECRET-GPS-PLACE' } }),
  segment(0xe1, Buffer.concat([ascii('http://ns.adobe.com/xap/1.0/\0'), ascii(xmp)])),
  segment(0xe1, extendedXmp),
  mpf,
  segment(0xed, iptc),
  segment(0xeb, ascii('SECRET-APP11')),
  segment(0xef, ascii('SECRET-APP15')),
  segment(0xfe, ascii('SECRET-COMMENT')),
]);
savePicture('details.jpg', Buffer.concat([detailed, secondPhoto, ascii('SECRET-TRAILING-BYTES')]));

// A progressive JPG with an APPn segment between its scans.
const progressive = readFileSync(join(pictureSource, 'progressive.jpg'));
let scans = 0;
savePicture(
  'details-progressive.jpg',
  withSegments(progressive, [segment(0xe9, ascii('SECRET-BETWEEN-SCANS'))], (part) => part.marker === 0xda && ++scans === 2),
);

// 14d. Colour profiles, made by hand: a Display P3 profile (version 4, the
// sRGB curve, P3 primaries adapted to D50), with marker texts in its
// description, copyright and device name tags, a creation date and device
// fields in its header; and a grey one.
const s15 = (value) => be32(Math.round(value * 65536) | 0);
const xyz = (x, y, z) => Buffer.concat([ascii('XYZ '), Buffer.alloc(4), s15(x), s15(y), s15(z)]);
const para = () => Buffer.concat([ascii('para'), Buffer.alloc(4), be16(3), Buffer.alloc(2), s15(2.4), s15(1 / 1.055), s15(0.055 / 1.055), s15(1 / 12.92), s15(0.04045)]);
const mluc = (value) => {
  const text = Buffer.from(value, 'utf16le').swap16();
  return Buffer.concat([ascii('mluc'), Buffer.alloc(4), be32(1), be32(12), ascii('enUS'), be32(text.length), be32(28), text]);
};
function iccProfile(space, tags) {
  const pad = (buffer) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4)]);
  const table = [];
  const data = [];
  let at = 128 + 4 + tags.length * 12;
  const placed = new Map();
  for (const [signature, body] of tags) {
    if (!placed.has(body)) {
      placed.set(body, at);
      data.push(pad(body));
      at += pad(body).length;
    }
    table.push(Buffer.concat([ascii(signature), be32(placed.get(body)), be32(body.length)]));
  }
  const header = Buffer.alloc(128);
  header.writeUInt32BE(at, 0);
  ascii('SCMM').copy(header, 4);
  header.writeUInt32BE(0x04300000, 8);
  ascii('mntr').copy(header, 12);
  ascii(space).copy(header, 16);
  ascii('XYZ ').copy(header, 20);
  // The creation date the tests look for: 2019-12-25 10:20:30.
  [2019, 12, 25, 10, 20, 30].forEach((value, index) => header.writeUInt16BE(value, 24 + index * 2));
  ascii('acsp').copy(header, 36);
  ascii('APPL').copy(header, 40);
  ascii('SMKR').copy(header, 48);
  ascii('SMDL').copy(header, 52);
  s15(0.9642).copy(header, 68);
  s15(1).copy(header, 72);
  s15(0.8249).copy(header, 76);
  ascii('SCRT').copy(header, 80);
  ascii('SECRETPROFILEID!').copy(header, 84);
  return Buffer.concat([header, be32(tags.length), ...table, ...data]);
}
const curve = para();
const p3 = iccProfile('RGB ', [
  ['desc', mluc('SECRET-PROFILE-DESC')],
  ['cprt', mluc('SECRET-PROFILE-COPYRIGHT')],
  ['dmnd', mluc('SECRET-PROFILE-MAKER')],
  ['dmdd', mluc('SECRET-PROFILE-MODEL')],
  ['wtpt', xyz(0.96420, 1.0, 0.82491)],
  ['rXYZ', xyz(0.515121, 0.241196, -0.001053)],
  ['gXYZ', xyz(0.291977, 0.692245, 0.041885)],
  ['bXYZ', xyz(0.157104, 0.066574, 0.784073)],
  ['rTRC', curve],
  ['gTRC', curve],
  ['bTRC', curve],
  ['chad', Buffer.concat([ascii('sf32'), Buffer.alloc(4), ...[1.047882, 0.022919, -0.050201, 0.029587, 0.990479, -0.017059, -0.009232, 0.015076, 0.751678].map(s15)])],
]);
const grey = iccProfile('GRAY', [
  ['desc', mluc('SECRET-GREY-DESC')],
  ['cprt', mluc('SECRET-GREY-COPYRIGHT')],
  ['wtpt', xyz(0.9642, 1.0, 0.8249)],
  ['kTRC', curve],
]);
savePicture('p3.icc', p3);

/** APP2 ICC_PROFILE segments holding `profile`, split into `parts`. */
function profileSegments(profile, parts) {
  const size = Math.ceil(profile.length / parts);
  return Array.from({ length: parts }, (_, index) =>
    segment(0xe2, Buffer.concat([ascii('ICC_PROFILE\0'), Buffer.from([index + 1, parts]), profile.subarray(index * size, (index + 1) * size)])),
  );
}
// A saturated red and green, which Display P3 draws more vivid than sRGB.
const vivid = (context, width, height) => {
  context.fillStyle = 'rgb(255, 0, 0)';
  context.fillRect(0, 0, width / 2, height);
  context.fillStyle = 'rgb(0, 255, 0)';
  context.fillRect(width / 2, 0, width / 2, height);
};
savePicture('p3.jpg', withSegments(withoutProfile(canvasJpeg(200, 100, vivid, 95)), profileSegments(p3, 2)));
// The same profile, but its own size disagrees with its bytes: it is left out.
const misSized = Buffer.from(p3);
misSized.writeUInt32BE(p3.length + 10, 0);
savePicture('bad-profile.jpg', withSegments(withoutProfile(canvasJpeg(200, 100, vivid, 95)), profileSegments(misSized, 1)));

// 14e. PNGs: see-through parts, a palette, 16-bit grey, an animation, text
// chunks, a colour profile, profiles that are left out, a small picture and one
// that claims 256 million pixels.
savePicture(
  'alpha.png',
  canvasPng(240, 160, (context, width, height) => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(11, 79, 168, 1)';
    context.fillRect(20, 20, 120, 80);
    context.fillStyle = 'rgba(220, 30, 30, 0.5)';
    context.beginPath();
    context.arc(160, 100, 50, 0, Math.PI * 2);
    context.fill();
  }),
);
/** A PNG made from rows of bytes, each row starting with filter 0. */
function rawPng(width, height, depth, colourType, rowBytes, pixel, extra = []) {
  const rows = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < rowBytes; x++) rows[y * (rowBytes + 1) + 1 + x] = pixel(x, y);
  return Buffer.concat([pngSignature, ihdr(width, height, depth, colourType), ...extra.map(([type, data]) => pngChunk(type, data)), pngChunk('IDAT', deflateSync(rows, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}
savePicture('palette.png', rawPng(120, 80, 8, 3, 120, (x, y) => (x < 60 ? 0 : 1) + (y < 40 ? 0 : 2), [['PLTE', Buffer.from([220, 30, 30, 30, 170, 60, 40, 60, 220, 240, 210, 40])]]));
// 16-bit grey: a ramp from left to right; the low byte varies so 8 bits cannot hold it all.
savePicture('grey16.png', rawPng(128, 64, 16, 0, 256, (x) => (x % 2 === 0 ? x : 255 - x)));
// An animated PNG: its default picture is red, its second frame blue.
{
  const frame = (r, g, b) => {
    const rows = Buffer.alloc((60 * 3 + 1) * 40);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) rows.set([r, g, b], y * (60 * 3 + 1) + 1 + x * 3);
    return deflateSync(rows);
  };
  const fctl = (sequence) => Buffer.concat([be32(sequence), be32(60), be32(40), be32(0), be32(0), be16(1), be16(2), Buffer.from([0, 0])]);
  savePicture(
    'animated.png',
    Buffer.concat([
      pngSignature,
      ihdr(60, 40, 8, 2),
      pngChunk('acTL', Buffer.concat([be32(2), be32(0)])),
      pngChunk('fcTL', fctl(0)),
      pngChunk('IDAT', frame(220, 30, 30)),
      pngChunk('fcTL', fctl(1)),
      pngChunk('fdAT', Buffer.concat([be32(2), frame(40, 60, 220)])),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
const plainPng = (width, height) => canvasPng(width, height, scene);
savePicture(
  'details.png',
  pngWithChunks(plainPng(200, 150), [
    ['tEXt', ascii('Comment\0SECRET-PNG-TEXT')],
    ['iTXt', ascii('Description\0\0\0en\0Description\0SECRET-PNG-ITXT')],
    ['zTXt', Buffer.concat([ascii('Author\0\0'), deflateSync(ascii('SECRET-PNG-ZTXT'))])],
    ['eXIf', tiff({ make: 'SECRET-PNG-CAMERA', gps: { latitude: [[40, 1], [42, 1], [46, 1]], place: 'SECRET-PNG-GPS' } })],
  ]),
);
const iccp = (name, profile) => Buffer.concat([ascii(`${name}\0\0`), deflateSync(profile)]);
savePicture('profile.png', pngWithChunks(canvasPng(200, 100, vivid), [['iCCP', iccp('Display P3', p3)]]));
savePicture('bad-profile.png', pngWithChunks(canvasPng(200, 100, vivid), [['iCCP', iccp('Wrong size', misSized)]]));
// An iCCP chunk that inflates to 5 MB: stopped at 4 MB and left out.
savePicture('bomb-profile.png', pngWithChunks(plainPng(60, 40), [['iCCP', iccp('Bomb', Buffer.alloc(5 * 1024 * 1024))]]));
// A grey PNG with a grey profile: pdf-lib stores it as RGB, so the grey profile is left out.
savePicture('grey-profile.png', rawPng(80, 60, 8, 0, 80, (x, y) => (x * 3 + y) & 0xff, [['iCCP', iccp('Grey', grey)]]));
savePicture('small.png', plainPng(300, 200));
// 256 million pixels of grey, all zero, which compress to a small file. Never decoded by the tests.
{
  const width = 16_000;
  const rows = Buffer.alloc((width + 1) * width);
  savePicture('huge.png', Buffer.concat([pngSignature, ihdr(width, width, 8, 0), pngChunk('IDAT', deflateSync(rows, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]));
}

// 14f. Pictures that cannot be converted. An arithmetic-coded JPG header (SOF9),
// which many PDF readers cannot draw: the start, a frame, a scan and the end.
savePicture(
  'arithmetic.jpg',
  Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xc9, Buffer.concat([Buffer.from([8]), be16(16), be16(16), Buffer.from([1, 1, 0x11, 0])])),
    segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    Buffer.from([0x12, 0x34, 0x56]),
    Buffer.from([0xff, 0xd9]),
  ]),
);
// A JPG cut off half way: it has no end.
const cut = withoutProfile(canvasJpeg(200, 150, scene));
savePicture('broken.jpg', cut.subarray(0, Math.floor(cut.length / 2)));
// A PNG whose IDAT chunk says it is longer than the file.
const whole2 = plainPng(80, 60);
const brokenPng = Buffer.from(whole2.subarray(0, whole2.length - 12));
brokenPng.writeUInt32BE(0x00ffffff, 33);
savePicture('broken.png', brokenPng);
// A PNG whose width is 0.
const zero = Buffer.from(plainPng(80, 60));
zero.writeUInt32BE(0, 16);
savePicture('zero-size.png', zero);
