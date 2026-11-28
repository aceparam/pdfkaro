// Writes large PDFs that are not committed, outside the repo. Run:
//   node tests/fixtures/make-large.mjs [output path]                     one page and 105 MB of random bytes attached
//   node tests/fixtures/make-large.mjs --scans [output path]             about 100 MB of 300-to-the-inch JPG scans
//   node tests/fixtures/make-large.mjs --lossless [output path]          about 100 MB of lossless scans with a PNG predictor
//   node tests/fixtures/make-large.mjs --hostile-jpeg [output path]      JPGs of 49 million pixels on a page no step scales
//   node tests/fixtures/make-large.mjs --hostile-lossless [output path]  lossless pictures of 49 million pixels, every step scaling them
//   node tests/fixtures/make-large.mjs --vector [output path]            about 100 MB of compressed, dense coloured drawing
// The default path is in the system's temporary folder. --scans to --hostile-lossless are for Compress to a target
// size's measurements (add-compress-to-target, task 3.3): the hostile files are built to plan at its pixel-work budget.
// --vector is for Grayscale PDF's (add-grayscale-pdf, task 3.3): pages of coloured shapes, lines and text, each
// page's one content stream 60 MiB once decoded, under the 64 MiB a page may decode to.

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const kinds = ['--scans', '--lossless', '--hostile-jpeg', '--hostile-lossless', '--vector'];
const kind = kinds.includes(process.argv[2]) ? process.argv[2] : undefined;
const pathArgument = kind ? process.argv[3] : process.argv[2];
const defaults = {
  undefined: 'pdfkaro-large.pdf',
  '--scans': 'pdfkaro-large-scans.pdf',
  '--lossless': 'pdfkaro-large-lossless.pdf',
  '--hostile-jpeg': 'pdfkaro-hostile-jpeg.pdf',
  '--hostile-lossless': 'pdfkaro-hostile-lossless.pdf',
  '--vector': 'pdfkaro-large-vector.pdf',
};
const target = resolve(pathArgument ?? join(tmpdir(), defaults[kind]));
if (target.startsWith(resolve('.') + '/')) {
  console.error('That path is inside the repo. Give a path outside it, so the file is not committed.');
  process.exit(1);
}

/** A tiny random number maker, so a file comes out the same on every run. */
function seeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state >>> 16) / 65536;
  };
}

/** A PDF of pages, each one picture over the whole page; `pictures[i]` is `{ entries, data }` for page i, on a `width` by `height` page. */
function picturePages(width, height, pictures) {
  const objects = [];
  const kids = pictures.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.push(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pictures.length} >>`));
  for (const [index, { entries, data }] of pictures.entries()) {
    const page = 3 + index * 3;
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`));
    const content = Buffer.from(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);
    objects.push(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]));
    objects.push(Buffer.concat([Buffer.from(`<< ${entries} /Length ${data.length} >>\nstream\n`), data, Buffer.from('\nendstream')]));
  }
  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let at = parts[0].length;
  objects.forEach((body, index) => {
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    offsets.push(at);
    parts.push(object);
    at += object.length;
  });
  const rows = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`));
  return Buffer.concat(parts);
}

/** RGB samples of a page-like scan: paper, a few soft blocks of colour, lines of "text", and grain of `grain` levels. */
function scanSamples(width, height, seed, grain) {
  const random = seeded(seed);
  const samples = Buffer.alloc(width * height * 3);
  const blocks = Array.from({ length: 6 }, () => ({ x: random() * width, y: random() * height, w: random() * width * 0.4, h: random() * height * 0.2, c: [random() * 200, random() * 200, random() * 200] }));
  for (let y = 0; y < height; y++) {
    const line = Math.floor(y / 40) % 3 !== 2 && y % 40 > 10 && y % 40 < 30;
    for (let x = 0; x < width; x++) {
      let r = 242;
      let g = 238;
      let b = 228;
      for (const block of blocks) {
        if (x >= block.x && x < block.x + block.w && y >= block.y && y < block.y + block.h) [r, g, b] = block.c;
      }
      if (line && x > 200 && x < width - 200 && (x >> 3) % 7 !== 0) r = g = b = 40;
      const noise = (random() - 0.5) * grain;
      const at = (y * width + x) * 3;
      samples[at] = Math.max(0, Math.min(255, r + noise));
      samples[at + 1] = Math.max(0, Math.min(255, g + noise));
      samples[at + 2] = Math.max(0, Math.min(255, b + noise));
    }
  }
  return samples;
}

/** The same samples with a PNG "Up" predictor byte (2) in front of each row, as /Predictor 12 to 15 stores them. */
function withUpPredictor(samples, width, height) {
  const stride = width * 3;
  const out = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    out[y * (stride + 1)] = 2;
    for (let x = 0; x < stride; x++) out[y * (stride + 1) + 1 + x] = (samples[y * stride + x] - (y > 0 ? samples[(y - 1) * stride + x] : 0)) & 0xff;
  }
  return out;
}

async function jpegOf(samples, width, height, quality) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  for (let index = 0, at = 0; index < width * height; index++, at += 3) {
    image.data[index * 4] = samples[at];
    image.data[index * 4 + 1] = samples[at + 1];
    image.data[index * 4 + 2] = samples[at + 2];
    image.data[index * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.encode('jpeg', quality);
}

const a4 = { width: 595, height: 842, pixelsWide: 2480, pixelsHigh: 3508 };
let bytes;
if (kind === '--scans') {
  // A4 scans at 300 pixels to the inch, colour JPGs at quality 90, until the file passes 100 MB.
  const pictures = [];
  let total = 0;
  for (let page = 0; total < 100 * 1024 * 1024; page++) {
    const data = await jpegOf(scanSamples(a4.pixelsWide, a4.pixelsHigh, page + 1, 70), a4.pixelsWide, a4.pixelsHigh, 90);
    pictures.push({ entries: `/Type /XObject /Subtype /Image /Width ${a4.pixelsWide} /Height ${a4.pixelsHigh} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, data });
    total += data.length;
  }
  bytes = picturePages(a4.width, a4.height, pictures);
} else if (kind === '--lossless') {
  // A4 scans at 300 pixels to the inch stored without loss, with a PNG predictor, until the file passes 100 MB.
  const pictures = [];
  let total = 0;
  for (let page = 0; total < 100 * 1024 * 1024; page++) {
    const data = deflateSync(withUpPredictor(scanSamples(a4.pixelsWide, a4.pixelsHigh, page + 1, 24), a4.pixelsWide, a4.pixelsHigh), { level: 6 });
    pictures.push({
      entries: `/Type /XObject /Subtype /Image /Width ${a4.pixelsWide} /Height ${a4.pixelsHigh} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /Columns ${a4.pixelsWide} >>`,
      data,
    });
    total += data.length;
  }
  bytes = picturePages(a4.width, a4.height, pictures);
} else if (kind === '--hostile-jpeg') {
  // 17 JPGs of 7,000 by 7,000 pixels (49 million each), real flat-grey frames that pass the frame check, each on a
  // page of 7,000 points so that no step scales them: every step encodes all 49 million pixels. Each plans
  // 14 × 49,000,000 = 686,000,000 JPG pixels (decoded once and encoded at 7 steps, then 3 writes of a decode and an
  // encode), 17 plan 11,662,000,000: as close to the 12,000,000,000 budget as whole pictures come, with no cut.
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(7000, 7000);
  const context = canvas.getContext('2d');
  const pictures = [];
  for (let index = 0; index < 17; index++) {
    context.fillStyle = `rgb(${100 + index * 5}, ${120 + index * 3}, ${140 - index * 2})`;
    context.fillRect(0, 0, 7000, 7000);
    context.fillStyle = 'rgb(20, 20, 20)';
    for (let line = 0; line < 50; line++) context.fillRect(300, 200 + line * 130, 6400, 40);
    pictures.push({ entries: '/Type /XObject /Subtype /Image /Width 7000 /Height 7000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', data: await canvas.encode('jpeg', 60) });
  }
  bytes = picturePages(7000, 7000, pictures);
} else if (kind === '--hostile-lossless') {
  // 6 lossless RGB pictures of 7,000 by 7,000 pixels with a PNG predictor, on pages of 288 points (4 inches), so
  // every step scales them, to 600, 480, 400, 340 and 288 pixels across. Each plans
  // 10 × (49,000,000 + 948,944 + 3 × (49,000,000 + 360,000)) = 1,980,289,440 JPG pixels; 6 plan 11,881,736,640,
  // as close to the 12,000,000,000 budget as whole pictures come, with no cut.
  const width = 7000;
  const height = 7000;
  const stride = width * 3;
  const pictures = [];
  for (let index = 0; index < 6; index++) {
    const rows = Buffer.alloc((stride + 1) * height);
    const random = seeded(index + 1);
    for (let y = 0; y < height; y++) {
      const row = y * (stride + 1);
      rows[row] = 2;
      // Up predictor: a gentle gradient with sparse grain, so the data is small but every pixel is inflated and scaled.
      for (let x = 0; x < stride; x++) rows[row + 1 + x] = random() < 0.02 ? Math.floor(random() * 8) : y === 0 ? (x * 7) & 0xff : 0;
    }
    pictures.push({
      entries: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /Columns ${width} >>`,
      data: deflateSync(rows, { level: 6 }),
    });
  }
  bytes = picturePages(288, 288, pictures);
} else if (kind === '--vector') {
  // Dense coloured vector drawing, as a detailed map or plan holds: filled shapes, stroked lines and text, each with its
  // own RGB or CMYK colour set by rg, RG, k or K, with coordinates of three decimals, so it compresses as such drawing
  // does. Each page's stream is 60 MiB decoded; pages are added until the file passes 100 MB.
  const random = seeded(7);
  const n = (scale) => (random() * scale).toFixed(3);
  const pageBytes = 60 * 1024 * 1024;
  const objects = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), null];
  const kids = [];
  let total = 0;
  for (let page = 0; total < 100 * 1024 * 1024; page++) {
    const parts = [];
    let length = 0;
    while (length < pageBytes - 200) {
      const pick = random();
      const line =
        pick < 0.4
          ? `${n(1)} ${n(1)} ${n(1)} rg ${n(842)} ${n(1190)} ${n(40)} ${n(40)} re f\n`
          : pick < 0.7
            ? `${n(1)} ${n(1)} ${n(1)} RG ${n(2)} w ${n(842)} ${n(1190)} m ${n(842)} ${n(1190)} l S\n`
            : pick < 0.85
              ? `${n(1)} ${n(1)} ${n(1)} ${n(1)} k ${n(842)} ${n(1190)} m ${n(842)} ${n(1190)} ${n(842)} ${n(1190)} ${n(842)} ${n(1190)} c f\n`
              : `BT /F1 ${n(9)} Tf ${n(1)} ${n(1)} ${n(1)} ${n(1)} K 2 Tr ${n(842)} ${n(1190)} Td (Road ${page}-${parts.length}) Tj ET\n`;
      parts.push(line);
      length += line.length;
    }
    const content = deflateSync(Buffer.from(parts.join('').padEnd(pageBytes, ' '), 'latin1'), { level: 6 });
    const pageId = objects.length + 1;
    kids.push(`${pageId} 0 R`);
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 1190] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${pageId + 1} 0 R >>`));
    objects.push(Buffer.concat([Buffer.from(`<< /Filter /FlateDecode /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]));
    total += content.length;
  }
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`);
  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let at = parts[0].length;
  objects.forEach((body, index) => {
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    offsets.push(at);
    parts.push(object);
    at += object.length;
  });
  const rows = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`));
  bytes = Buffer.concat(parts);
} else {
  const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('A file over 100 MB, for testing the large-file warning.', { x: 60, y: 760, size: 14, font });
  // Random bytes do not compress, so the file stays large.
  await doc.attach(randomBytes(105 * 1024 * 1024), 'filler.bin', { mimeType: 'application/octet-stream' });
  bytes = await doc.save({ useObjectStreams: false });
}
writeFileSync(target, bytes);
console.log(`${target}  ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
