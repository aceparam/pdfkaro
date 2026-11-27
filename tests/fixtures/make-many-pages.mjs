// Writes two large PDFs for Split PDF's hand checks and end-to-end test. They
// are not committed. Run: node tests/fixtures/make-many-pages.mjs [folder]
// The default folder is the system's temporary folder, outside the repo.
//
// - pdfkaro-many-pages.pdf: 120,000 pages that share one small content stream,
//   about 10 MB, for batches of pages and the 65,535-file limit of one zip.
// - pdfkaro-shared-image.pdf: 5,000 pages that each show the same 1 MB image.
//   Split with no cuts, each part carries its own copy of the image, so the
//   parts add up to about 5 GB: the worst case for memory.
// - With --coloured, instead: pdfkaro-many-coloured.pdf, 20,000 pages each with its own content stream in its own
//   RGB colour, for Grayscale PDF's measurements of raw batches and qpdf instances (add-grayscale-pdf, task 3.3).

import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const coloured = process.argv[2] === '--coloured';
const folder = resolve((coloured ? process.argv[3] : process.argv[2]) ?? tmpdir());
if ((folder + '/').startsWith(resolve('.') + '/')) {
  console.error('That folder is inside the repo. Give one outside it, so the files are not committed.');
  process.exit(1);
}

/**
 * Writes a PDF of `pages` pages, each drawn by the same content stream, with the given shared resources; or, with
 * `own`, each page drawn by its own content stream, `own(n)` for page n.
 */
async function write(path, pages, { content, resources = '<< >>', extra = [], own }) {
  const out = createWriteStream(path);
  let offset = 0;
  const offsets = [];
  const put = (chunk) =>
    new Promise((done) => {
      offset += Buffer.byteLength(chunk);
      if (out.write(chunk)) done();
      else out.once('drain', done);
    });
  const object = async (number, body) => {
    offsets[number] = offset;
    if (Buffer.isBuffer(body)) {
      await put(`${number} 0 obj\n`);
      await put(body);
      await put('\nendobj\n');
    } else await put(`${number} 0 obj\n${body}\nendobj\n`);
  };

  // 1 catalog, 2 page tree, 3 content stream, 4.. shared extras, then the pages.
  const firstPage = 4 + extra.length;
  await put('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
  await object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = [];
  for (let n = 0; n < pages; n++) kids.push(`${firstPage + n} 0 R`);
  await object(2, `<< /Type /Pages /Count ${pages} /Kids [${kids.join(' ')}] >>`);
  await object(3, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  for (const [index, body] of extra.entries()) await object(4 + index, body);
  for (let n = 0; n < pages; n++) {
    await object(firstPage + n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources ${resources} /Contents ${own ? firstPage + pages + n : 3} 0 R >>`);
  }
  if (own) {
    for (let n = 0; n < pages; n++) {
      const text = own(n);
      await object(firstPage + pages + n, `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    }
  }
  const count = firstPage + pages * (own ? 2 : 1);
  const xref = offset;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  await put(table);
  await put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  await new Promise((done) => out.end(done));
  console.log(path);
}

if (coloured) {
  const part = (n, k) => (((n * k) % 1000) / 1000).toFixed(3);
  await write(join(folder, 'pdfkaro-many-coloured.pdf'), 20_000, { content: '', own: (n) => `${part(n, 7)} ${part(n, 13)} ${part(n, 29)} rg 20 20 160 160 re f 0 0 1 RG 4 w 20 100 m 180 100 l S` });
  process.exit(0);
}

await write(join(folder, 'pdfkaro-many-pages.pdf'), 120_000, { content: '0 0 0 rg 20 20 160 160 re f' });

const side = 1024;
const pixels = randomBytes(side * side);
const image = Buffer.concat([
  Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`),
  pixels,
  Buffer.from('\nendstream'),
]);
await write(join(folder, 'pdfkaro-shared-image.pdf'), 5_000, {
  content: 'q 200 0 0 200 0 0 cm /Im1 Do Q',
  resources: '<< /XObject << /Im1 4 0 R >> >>',
  extra: [image],
});
