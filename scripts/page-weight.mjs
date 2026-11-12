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
const loadedLater = [
  { name: 'ToolWorkspace', type: 'js', why: 'the tool widget after a pick: the list, problems, progress and the result' },
  { name: 'FilePicker', type: 'css', why: "a copy of the picker's styles, which the workspace chunk links; the page already has them" },
  { name: 'tool.worker', type: 'js', why: 'the one tool worker, started after a pick' },
  { name: 'merge-pdf', type: 'js', why: 'the Merge PDF engine, which the worker loads' },
  { name: 'qpdf', type: 'js', why: 'the qpdf wrapper, and qpdf compiled to WebAssembly, which the worker loads' },
  { name: 'thumbnail', type: 'js', why: 'draws a page thumbnail, which the worker loads when the first thumbnail is asked for' },
  { name: 'pdf', type: 'js', why: 'PDF.js, which the worker loads when the first thumbnail is asked for' },
  { name: 'pdf.worker.min', type: 'mjs', why: "PDF.js's own worker, started by the tool worker for thumbnails" },
  { name: 'pdfjs-data', type: 'js', why: "PDF.js's fonts and decoders, one fixed set, loaded with PDF.js" },
  { name: 'fflate', type: 'js', why: "fflate's zip step, which the worker loads at the start of every run of a tool that can give several files" },
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
