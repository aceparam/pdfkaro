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

// Files that load only after the visitor picks a file, as patterns on the path
// inside dist/. Each needs a reason. Empty until the first engine arrives.
const loadedLater = [];

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
  .filter((file) => !loadedLater.some((pattern) => pattern.test(relative(dist, file).split(sep).join('/'))));

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
