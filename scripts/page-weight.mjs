// Adds up what each built page makes a browser download before a file is
// chosen: the HTML, its stylesheets and its scripts, compressed.
// Fails if any page is over the budget in SPEC.md (100 KB), measured by gzip,
// the stricter of the two common compressions.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const dist = 'dist';
const budgetBytes = 100 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Files a script pulls in with a static import, found by reading the file. */
function staticImports(file) {
  const source = readFileSync(file, 'utf8');
  const found = [];
  for (const match of source.matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) {
    found.push(join(dirname(file), match[1]));
  }
  return found;
}

/** Every file a page loads: its own HTML, stylesheets, scripts, and what those scripts import. */
function filesFor(htmlFile) {
  const html = readFileSync(htmlFile, 'utf8');
  const files = new Set([htmlFile]);
  const queue = [];
  const attribute = /(?:href|src|component-url|renderer-url|before-hydration-url)="(\/[^"]+\.(?:css|js))"/g;
  for (const match of html.matchAll(attribute)) queue.push(join(dist, match[1]));
  while (queue.length > 0) {
    const file = queue.pop();
    if (files.has(file)) continue;
    files.add(file);
    if (file.endsWith('.js')) queue.push(...staticImports(file));
  }
  return [...files];
}

const kb = (bytes) => (bytes / 1024).toFixed(1).padStart(6);
let over = false;

console.log('  gzip  brotli  files  page');
for (const htmlFile of walk(dist).filter((file) => file.endsWith('.html')).sort()) {
  const files = filesFor(htmlFile);
  let gzip = 0;
  let brotli = 0;
  for (const file of files) {
    const bytes = readFileSync(file);
    gzip += gzipSync(bytes, { level: 9 }).length;
    brotli += brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  }
  const tooBig = gzip > budgetBytes;
  over ||= tooBig;
  const page = '/' + posix.normalize(relative(dist, htmlFile)).replace(/\.html$/, '').replace(/^index$/, '');
  console.log(`${kb(gzip)}  ${kb(brotli)}  ${String(files.length).padStart(5)}  ${page}${tooBig ? '   OVER 100 KB' : ''}`);
}

if (over) {
  console.error('\nA page is over the 100 KB budget.');
  process.exit(1);
}
