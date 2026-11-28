// Adds up what each built page makes a browser download before a file is
// chosen: the HTML, its stylesheets and its scripts, compressed.
// Fails if any page is over the budget in SPEC.md (100 KB), measured by gzip,
// the stricter of the two common compressions.
//
// It fails closed. A script or stylesheet in dist/ that no page reaches
// through a link, a script tag or a static import is an error, unless it is
// named in `loadedLater` below. So a file fetched by import() or as a Worker
// cannot slip past the budget unnoticed.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, posix, sep } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const dist = 'dist';
const budgetBytes = 100 * 1024;

// Files that load only after the visitor picks a file. Each is named by the
// base name the bundler gives it, followed only by its content hash, so a
// new file cannot slip in under a broad pattern. Each has a reason.
// Every engine in src/engines/tools/, by its tool id, so a new engine cannot be forgotten.
const engineIds = readdirSync(join('src', 'engines', 'tools'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => name.replace(/\.ts$/, ''));

const loadedLater = [
  { name: 'ToolWorkspace', type: 'js', why: 'the tool widget after a pick: the list, problems, progress and the result' },
  { name: 'FilePicker', type: 'css', why: "a copy of the picker's styles, which the workspace chunk links; the page already has them" },
  { name: 'tool.worker', type: 'js', why: 'the one tool worker, started after a pick' },
  { name: 'plain', type: 'js', why: 'the plain copy, outline and write steps (keepPages, writePages, writeTurned) the page engines share; the bundler gives them a file of their own' },
  { name: 'inspect', type: 'js', why: 'reads one PDF before a job; shared by the engines, so the bundler gives it a file of its own' },
  { name: 'qpdf', type: 'js', why: 'the qpdf wrapper, and qpdf compiled to WebAssembly, which the worker loads' },
  { name: 'thumbnail', type: 'js', why: "draws a page thumbnail, started with PDF.js after every pick on a PDF tool's page, whatever the file, whole pages for PDF to JPG and PNG, and measures pages for Crop PDF" },
  { name: 'pdf', type: 'js', why: "PDF.js, which the worker starts after every pick on a PDF tool's page, damaged, protected and wrong-kind files included, once the reading libraries have loaded" },
  { name: 'pdf.worker.min', type: 'mjs', why: "PDF.js's own worker, started by the tool worker in the same step as PDF.js, after every pick on a PDF tool's page" },
  { name: 'pdfjs-data', type: 'js', why: "PDF.js's fonts and decoders, one fixed set, loaded with PDF.js after every pick on a PDF tool's page" },
  { name: 'fflate', type: 'js', why: "fflate's inflater, deflater and zip step: loaded at every pick on Image to PDF and Sign PDF, and at the start of every job of Split, Compress, PDF to JPG and PNG, Image to PDF and Sign PDF, whatever the file; pdf-lib imports it" },
  { name: 'picture', type: 'js', why: "reads a JPG or PNG without decoding it, for Image to PDF and Sign PDF's signature picture; shared by their engines and Image to PDF's thumbnails" },
  { name: 'zlib', type: 'js', why: "the shared zlib steps (zlib.ts): fetched with the picture reader (Image to PDF, its thumbnails and Sign PDF), the picture steps (Compress PDF and Compress to a target size) and Grayscale PDF's job, whatever the file; the bundler gives it a file of its own since Grayscale imports it without the picture reader" },
  { name: 'picture-thumbnail', type: 'js', why: "draws a picture's thumbnail with the browser's image decoder, started after every pick on Image to PDF's pages, whatever the file" },
  { name: 'pdflib', type: 'js', why: 'pdf-lib, which the worker loads at the start of every Image to PDF, Add page numbers, Watermark or Sign PDF job, before the engine reads the file' },
  { name: 'stamp', type: 'js', why: 'the drawing step (stamp.ts) that Add page numbers, Watermark and Sign PDF share; a file of its own' },
  { name: 'pages', type: 'js', why: 'reads every page and writes the page update (pages.ts), shared by the drawing step, Crop PDF and Resize pages; the bundler gives it a file of its own' },
  { name: 'shrink', type: 'js', why: "the picture steps (shrink.ts, with the resampling) that Compress PDF and Compress to a target size share; the bundler gives them a file of their own" },
  { name: 'option-values', type: 'js', why: "each tool's accepted option values and its rules for texts, drawings, pictures and new passwords (option-values.ts), which Resize pages, Add page numbers, Watermark, Sign PDF and Protect's engines read; the bundler gives them a file of their own" },
  ...engineIds.map((id) => ({ name: id, type: 'js', why: `the ${id} engine, which the worker loads` })),
].map((entry) => ({ ...entry, pattern: new RegExp(`^_astro/${entry.name.replaceAll('.', '\\.')}[.-][A-Za-z0-9_-]{8}\\.${entry.type}$`) }));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Turns a URL found in a file into a path inside dist/, or null if it is not a local script or stylesheet. */
function resolve(url, fromFile) {
  const clean = url.split(/[?#]/)[0];
  if (!/\.(?:css|js|mjs)$/.test(clean) || /^[a-z]+:/i.test(clean) || clean.startsWith('//')) return null;
  return clean.startsWith('/') ? join(dist, clean) : join(dirname(fromFile), clean);
}

/** Files a script pulls in as soon as it runs: static imports, with either kind of quote. */
function staticImports(file) {
  const source = readFileSync(file, 'utf8');
  const found = [];
  for (const match of source.matchAll(/(?:\bfrom|\bimport)\s*["']([^"']+)["']/g)) {
    const path = resolve(match[1], file);
    if (path) found.push(path);
  }
  return found;
}

/** Every file a page loads: its own HTML, stylesheets, scripts, and what those scripts import. */
function filesFor(htmlFile) {
  const html = readFileSync(htmlFile, 'utf8');
  const files = new Set([htmlFile]);
  const queue = [];
  const attribute = /(?:href|src|component-url|renderer-url|before-hydration-url)\s*=\s*["']([^"']+)["']/g;
  for (const match of html.matchAll(attribute)) {
    const path = resolve(match[1], htmlFile);
    if (path) queue.push(path);
  }
  while (queue.length > 0) {
    const file = queue.pop();
    if (files.has(file)) continue;
    if (!existsSync(file)) {
      console.error(`${htmlFile} loads ${file}, which is not in ${dist}/.`);
      process.exit(1);
    }
    files.add(file);
    if (/\.m?js$/.test(file)) queue.push(...staticImports(file));
  }
  return [...files];
}

if (!existsSync(dist)) {
  console.error(`There is no ${dist}/ folder. Run the build first.`);
  process.exit(1);
}

const everyFile = walk(dist);
const pages = everyFile.filter((file) => file.endsWith('.html')).sort();
if (pages.length === 0) {
  console.error(`No pages found in ${dist}/. Run the build first.`);
  process.exit(1);
}

const kb = (bytes) => (bytes / 1024).toFixed(1).padStart(6);
const reached = new Set();
let over = false;

console.log('  gzip  brotli  files  page');
for (const htmlFile of pages) {
  const files = filesFor(htmlFile);
  let gzip = 0;
  let brotli = 0;
  for (const file of files) {
    reached.add(file);
    const bytes = readFileSync(file);
    gzip += gzipSync(bytes, { level: 9 }).length;
    brotli += brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  }
  const tooBig = gzip > budgetBytes;
  over ||= tooBig;
  const page = '/' + posix.normalize(relative(dist, htmlFile).split(sep).join('/')).replace(/\.html$/, '').replace(/^index$/, '');
  console.log(`${kb(gzip)}  ${kb(brotli)}  ${String(files.length).padStart(5)}  ${page}${tooBig ? '   OVER 100 KB' : ''}`);
}

const uncounted = everyFile
  .filter((file) => /\.(?:css|m?js)$/.test(file) && !reached.has(file))
  .filter((file) => !loadedLater.some((entry) => entry.pattern.test(relative(dist, file).split(sep).join('/'))));

// For information: what a visitor fetches once they pick a file, with the WebAssembly.
const later = everyFile.filter(
  (file) => !reached.has(file) && (file.endsWith('.wasm') || loadedLater.some((entry) => entry.pattern.test(relative(dist, file).split(sep).join('/')))),
);
if (later.length > 0) {
  const gzip = later.reduce((sum, file) => sum + gzipSync(readFileSync(file), { level: 9 }).length, 0);
  console.log(`\nAfter a pick, at most this more is fetched (${later.length} files, with the WebAssembly):`);
  console.log(`${kb(gzip)}  gzip`);
}

if (uncounted.length > 0) {
  console.error('\nThese files are in the build but no page was seen to load them, so they were not counted:');
  for (const file of uncounted) console.error(`  ${file}`);
  console.error('If a file loads only after the visitor picks a file, name it in loadedLater in this script.');
  process.exit(1);
}

if (over) {
  console.error('\nA page is over the 100 KB budget.');
  process.exit(1);
}
