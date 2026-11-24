// Files over each of Compress to a target size's targets, made for its end-to-end tests and uniform-requests.spec.ts,
// written into a temporary folder of this test process (never committed: the 2 MB page's files pass 2 MB). Each kind:
// a photo a little over the target that fits once compressed, the same file with a password, a photo plus a
// random-bytes attachment larger than the target (still over at the floor), a text-only file already packed by qpdf
// (no smaller file), and the shared failing-job file padded over the target. Made the same way on every run.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { createQpdf } from '../../src/engines/qpdf';
import { sizeTargets, type SizeTargetKey } from '../../src/widget/option-values';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
const folder = join(tmpdir(), `pdfkaro-target-files-${process.pid}`);
export const targetPassword = 'open-sesame';
/** qpdf's options for writing a file again without loss, as Compress PDF writes it (shrink.ts). */
const lossless = ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '--remove-unreferenced-resources=yes'];

/** A tiny random number maker, so every file comes out the same. */
function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state >>> 16) / 65536;
  };
}

/** A PDF of these objects, numbered from 1, object 1 its catalog. */
function rawPdf(objects: readonly Buffer[]): Buffer {
  const parts: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets: number[] = [];
  let at = parts[0]!.length;
  objects.forEach((body, index) => {
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    offsets.push(at);
    parts.push(object);
    at += object.length;
  });
  const rows = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info << /Title (SECRET-TITLE-target) >> >>\nstartxref\n${at}\n%%EOF\n`));
  return Buffer.concat(parts);
}
const stream = (entries: string, data: Buffer) => Buffer.concat([Buffer.from(`<< ${entries} /Length ${data.length} >>\nstream\n`, 'latin1'), data, Buffer.from('\nendstream')]);

/** A photo-like JPG: soft colour blobs with grain. */
function photo(side: number, quality: number, seed: number): Buffer {
  const canvas = createCanvas(side, Math.round(side * 1.3));
  const context = canvas.getContext('2d');
  const random = seeded(seed);
  context.fillStyle = '#e8e0d0';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 120; index++) {
    context.fillStyle = `hsla(${Math.floor(random() * 360)}, 55%, ${35 + Math.floor(random() * 45)}%, 0.6)`;
    context.beginPath();
    context.arc(random() * canvas.width, random() * canvas.height, 8 + random() * side * 0.12, 0, Math.PI * 2);
    context.fill();
  }
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let at = 0; at < image.data.length; at += 4) {
    const grain = (random() - 0.5) * 30;
    for (let c = 0; c < 3; c++) image.data[at + c] = Math.max(0, Math.min(255, image.data[at + c]! + grain));
  }
  context.putImageData(image, 0, 0);
  const jpeg = canvas.encodeSync('jpeg', quality);
  // Camera and place details in an Exif segment, as a phone's photo carries them; the picture steps never pass them on.
  const details = Buffer.from('Exif\0\0SECRET-CAMERA-MAKE SECRET-CAMERA-MODEL SECRET-GPS-PLACE', 'latin1');
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (details.length + 2) >> 8, (details.length + 2) & 0xff]), details]);
  return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
}

/**
 * A one-page PDF, 4 by 5.2 inches, of one photo with a line of text, a link and a form field, all holding `SECRET-`
 * strings, plus any attachment. The photo is as large as it needs to be for the file to land between 1.15 and 1.5
 * times `around` bytes, or as given by `side`.
 */
function photoPdf(around: number, seed: number, attachment?: Buffer): Buffer {
  const build = (jpeg: Buffer, side: number) => {
    const height = Math.round(side * 1.3);
    const objects: Buffer[] = [
      Buffer.from(`<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [7 0 R] >>${attachment ? ' /Names << /EmbeddedFiles << /Names [(SECRET-ATTACHMENT.bin) 8 0 R] >> >>' : ''} >>`),
      Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 288 374] /Resources << /Font << /F1 5 0 R >> /XObject << /Im0 6 0 R >> >> /Contents 4 0 R /Annots [7 0 R 10 0 R] >>'),
      stream('', Buffer.from('q 288 0 0 374 0 0 cm /Im0 Do Q\nBT /F1 12 Tf 10 10 Td (SECRET-PAGE-TEXT-target) Tj ET', 'latin1')),
      Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
      stream(`/Type /XObject /Subtype /Image /Width ${side} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, jpeg),
      Buffer.from('<< /Type /Annot /Subtype /Widget /FT /Tx /T (SECRET-FIELD-NAME) /V (SECRET-FIELD-VALUE) /Rect [10 40 200 60] /P 3 0 R >>'),
    ];
    if (attachment) {
      objects.push(Buffer.from('<< /Type /Filespec /F (SECRET-ATTACHMENT.bin) /EF << /F 9 0 R >> >>'));
      objects.push(stream('/Type /EmbeddedFile', attachment));
    } else {
      objects.push(Buffer.from('null'), Buffer.from('null'));
    }
    objects.push(Buffer.from('<< /Type /Annot /Subtype /Link /Rect [10 70 200 90] /A << /S /URI /URI (https://example.com/SECRET-LINK) >> >>'));
    return rawPdf(objects);
  };
  // Find a side that lands the file in the band, from 400 pixels up.
  let side = 400;
  for (let tries = 0; tries < 30; tries++) {
    const file = build(photo(side, 95, seed), side);
    const size = file.length - (attachment?.length ?? 0);
    if (size >= 1.15 * around && size <= 1.5 * around) return file;
    side = Math.max(200, Math.round(side * Math.sqrt((1.3 * around) / size)));
  }
  throw new Error(`No photo size gave a file around ${around} bytes.`);
}

/** A text-only file of about 1.3 times `around` bytes once packed by qpdf: lines of random letters it cannot pack further. */
async function packedText(around: number, seed: number): Promise<Buffer> {
  const random = seeded(seed);
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const lines: string[] = [];
  // Random letters pack to about three quarters of a byte each.
  const wanted = Math.round((1.3 * around) / 0.76);
  for (let written = 0, y = 760; written < wanted; written += 80, y = y <= 20 ? 760 : y - 10) {
    let text = '';
    for (let index = 0; index < 72; index++) text += letters[Math.floor(random() * letters.length)];
    lines.push(`BT /F1 6 Tf 20 ${y} Td (${text}) Tj ET`);
  }
  const file = rawPdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'),
    stream('', Buffer.from(lines.join('\n'), 'latin1')),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ]);
  return Buffer.from(await qpdfWrite(file, lossless));
}

async function qpdfWrite(file: Buffer | Uint8Array, args: string[]): Promise<Uint8Array> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', file);
  const { code } = qpdf.call(['/in.pdf', ...args, '/out.pdf']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  return qpdf.read('/out.pdf');
}

/** The shared failing-job file (compress-json-bomb.pdf) with a random-bytes attachment, so it is over the target too. */
async function paddedFailing(around: number, seed: number): Promise<Uint8Array> {
  const file = readFileSync(join(here, '../fixtures/compress-json-bomb.pdf'));
  if (file.length > around) return file;
  const random = seeded(seed);
  const padding = Buffer.from(Uint8Array.from({ length: Math.round(1.2 * around) }, () => Math.floor(random() * 256)));
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', file);
  qpdf.write('/pad.bin', padding);
  const { code } = qpdf.call(['/in.pdf', '--add-attachment', '/pad.bin', '--key=padding', '--', '/out.pdf']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  return qpdf.read('/out.pdf');
}

export type TargetFiles = {
  /** A photo a little over the target, which fits once compressed. */
  fits: string;
  /** The same, protected with `targetPassword`. */
  protectedFits: string;
  /** A photo and a random-bytes attachment larger than the target: still over at the floor. */
  over: string;
  /** A text-only file over the target, already packed: no smaller file. */
  packed: string;
  /** compress-json-bomb.pdf, padded over the target where it is under. */
  failing: string;
};

const made = new Map<SizeTargetKey, TargetFiles>();

/** The files over one target, made once per test process. */
export async function targetFiles(key: SizeTargetKey): Promise<TargetFiles> {
  const found = made.get(key);
  if (found) return found;
  mkdirSync(folder, { recursive: true });
  const { bytes } = sizeTargets[key];
  const seed = bytes / 1000;
  const path = (kind: string) => join(folder, `${kind}-${key}.pdf`);
  const fits = photoPdf(bytes, seed);
  writeFileSync(path('fits'), fits);
  writeFileSync(path('protected'), await qpdfWrite(fits, ['--encrypt', `--user-password=${targetPassword}`, `--owner-password=${targetPassword}`, '--bits=256', '--']));
  const random = seeded(seed + 1);
  const attachment = Buffer.from(Uint8Array.from({ length: Math.round(1.1 * bytes) }, () => Math.floor(random() * 256)));
  writeFileSync(path('over'), photoPdf(Math.max(50_000, bytes / 4), seed + 2, attachment));
  writeFileSync(path('packed'), await packedText(bytes, seed + 3));
  writeFileSync(path('failing'), await paddedFailing(bytes, seed + 4));
  const files: TargetFiles = { fits: path('fits'), protectedFits: path('protected'), over: path('over'), packed: path('packed'), failing: path('failing') };
  made.set(key, files);
  return files;
}
