// Writes a PDF over 100 MB for the by-hand check of the large-file warning.
// It is not committed. Run: node tests/fixtures/make-large.mjs [output path]
// The default path is in the system's temporary folder, outside the repo.

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

const target = resolve(process.argv[2] ?? join(tmpdir(), 'pdfkaro-large.pdf'));
if (target.startsWith(resolve('.') + '/')) {
  console.error('That path is inside the repo. Give a path outside it, so the file is not committed.');
  process.exit(1);
}

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([595, 842]);
page.drawText('A file over 100 MB, for testing the large-file warning.', { x: 60, y: 760, size: 14, font });
// Random bytes do not compress, so the file stays large.
await doc.attach(randomBytes(105 * 1024 * 1024), 'filler.bin', { mimeType: 'application/octet-stream' });
const bytes = await doc.save({ useObjectStreams: false });
writeFileSync(target, bytes);
console.log(`${target}  ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
