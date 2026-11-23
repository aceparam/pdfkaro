// Makes tests/fixtures/multilingual.pdf: text in Hindi, Telugu, Arabic and Chinese, which "The test set" in
// SPEC.md asks for. Run it from the repo root when the words change: node tests/fixtures/make-multilingual.mjs
// The file is committed, so tests do not depend on this script, and CI never runs it.
//
// It needs the npm registry: it fetches four Noto font packages (SIL Open Font Licence 1.1) from @fontsource
// at pinned versions into a new temporary folder, checks each tarball's SHA-512 before unpacking it, and
// deletes the folder at the end. No font is committed or shipped; the PDF holds only the subsets Chromium
// embeds. Chromium (Playwright's) prints an HTML page built from multilingual-text.json, because it shapes
// Devanagari, Telugu and Arabic with HarfBuzz and embeds each font as a TrueType subset with a Unicode map.
//
// What it guards against (openspec/changes/add-multilingual-fixture/design.md, decisions 3 and 4):
// no package script runs, no package file but the named fonts is read, the page has JavaScript off, is
// offline and may load only files in the temporary folder, and the file is refused if it carries anything
// of this machine (a file: address, the temporary or home folder's path) or extra document information.

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from '@cantoo/pdf-lib';
import { chromium } from '@playwright/test';

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(process.argv[2] ?? here, 'multilingual.pdf');
const text = JSON.parse(readFileSync(join(here, 'multilingual-text.json'), 'utf8'));

// The packages, at exact versions, with the SHA-512 the registry published for each tarball.
const packages = [
  { name: '@fontsource/noto-sans-devanagari', version: '5.3.0', integrity: 'sha512-7khYmipS/5KAUUmrO1DKir8yL8XI00d0+ZE9BqbS8XF1jzObv6CpPOk3UeYxF+Pvi8bx9bBvprBCOcbx/eQWTQ==' },
  { name: '@fontsource/noto-sans-telugu', version: '5.3.0', integrity: 'sha512-D5AD91Ok2wURk6Vf4sOe2KA3nf0M7qePboNVuvJbguOqLAplh3cGkEIX1qi9u1Jjcz9QWblQ5BbTXI/c+QjB9Q==' },
  { name: '@fontsource/noto-naskh-arabic', version: '5.3.0', integrity: 'sha512-S/GDgQ6mh/PKo4mz5+eXNYbEarvpI7yh6eCdOz8tTVbeM7+OUiacIEscaYEibr/+egDtGbO2ZB00sjy1bJC1kQ==' },
  { name: '@fontsource/noto-sans-sc', version: '5.3.1', integrity: 'sha512-YxZ/VWAWo9FWzH08Q6fGTzIW6vYNP2TMhUFCnfhlimbhdXnWrxJLrzX3KWt2FKnV0s8XiM5vjpGHQiyFRlTj0w==' },
];

// The only package files read: for each family, its script's file and its Latin file, as separate faces with
// their own names, so CSS falls back from one to the other by character. No package CSS is read.
const faces = [
  { family: 'Noto Sans Devanagari', files: [['noto-sans-devanagari', 'noto-sans-devanagari-devanagari-400-normal.woff2'], ['noto-sans-devanagari', 'noto-sans-devanagari-latin-400-normal.woff2']] },
  { family: 'Noto Sans Telugu', files: [['noto-sans-telugu', 'noto-sans-telugu-telugu-400-normal.woff2'], ['noto-sans-telugu', 'noto-sans-telugu-latin-400-normal.woff2']] },
  { family: 'Noto Naskh Arabic', files: [['noto-naskh-arabic', 'noto-naskh-arabic-arabic-400-normal.woff2'], ['noto-naskh-arabic', 'noto-naskh-arabic-latin-400-normal.woff2']] },
  { family: 'Noto Sans SC', files: [['noto-sans-sc', 'noto-sans-sc-chinese-simplified-400-normal.woff2'], ['noto-sans-sc', 'noto-sans-sc-latin-400-normal.woff2']] },
];
// The font names Chromium may write: any other font (a system fallback) refuses the file.
const allowedFonts = /^[A-Z]{6}\+Noto(SansDevanagari|SansTelugu|NaskhArabic|SansSC[A-Za-z]*)-Regular$/;

// The fixed date make.mjs uses, and the five document information keys allowed.
const fixedDate = new Date('2026-01-01T00:00:00Z');
const infoKeys = ['/Title', '/Creator', '/Producer', '/CreationDate', '/ModDate'];

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
const fail = (message) => {
  throw new Error(`make-multilingual: ${message}`);
};

/** A path inside `folder`, resolved, that is a regular file; refuses anything else. */
function safeFile(folder, name) {
  const path = join(folder, name);
  const stat = lstatSync(path);
  if (!stat.isFile()) fail(`${name} is not a regular file`);
  const real = realpathSync(path);
  if (!real.startsWith(realpathSync(folder) + sep)) fail(`${name} lies outside its package`);
  return real;
}

/** Fetches, checks and unpacks one package into its own empty folder; gives the folder holding its files. */
async function fetchPackage(temp, { name, version, integrity }) {
  const drop = join(temp, 'packs');
  mkdirSync(drop, { recursive: true });
  const { stdout } = await execFile(
    'npm',
    ['pack', `${name}@${version}`, '--ignore-scripts', '--registry', 'https://registry.npmjs.org', '--pack-destination', drop, '--cache', join(temp, 'cache'), '--json'],
    { cwd: temp, maxBuffer: 16 * 1024 * 1024 },
  );
  const tarball = safeFile(drop, JSON.parse(stdout)[0].filename);
  const bytes = readFileSync(tarball);
  const digest = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (digest !== integrity) fail(`${name}@${version} has SHA-512 ${digest}, not the pinned ${integrity}; nothing was unpacked`);
  const folder = join(temp, name.replace('@fontsource/', ''));
  mkdirSync(folder);
  await execFile('tar', ['-xzf', tarball, '-C', folder, '--no-same-owner', '--no-same-permissions'], { cwd: temp });
  return join(folder, 'package', 'files');
}

/** The HTML page: one section per page, each text escaped, the fonts written as file: addresses here. */
function pageHtml(fontFolders) {
  const fontFaces = faces
    .flatMap(({ family, files }) =>
      files.map(([pkg, file], index) => {
        const url = pathToFileURL(safeFile(fontFolders[pkg], file)).href;
        return `@font-face { font-family: '${family} ${index}'; font-style: normal; font-weight: 400; src: url('${url}') format('woff2'); }`;
      }),
    )
    .join('\n');
  const stack = (family) => `'${family} 0', '${family} 1'`;
  const span = (line) => `<span lang="${escapeHtml(line.lang)}" dir="${escapeHtml(line.dir)}" style="font-family: ${stack(line.font)}">${escapeHtml(line.text)}</span>`;
  const sections = text.pages
    .map((page) => {
      const family = page.font ?? 'Noto Sans Devanagari';
      const lines = page.lines.map((line) => (typeof line === 'string' ? `<p>${escapeHtml(line)}</p>` : `<p>${escapeHtml(line.label)}${span(line)}</p>`));
      return `<section lang="${escapeHtml(page.lang)}" dir="${escapeHtml(page.dir)}" style="font-family: ${stack(family)}"><h1>${escapeHtml(page.heading)}</h1>\n${lines.join('\n')}</section>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="mul">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src file:; style-src 'unsafe-inline'">
<title>${escapeHtml(text.title)}</title>
<style>
${fontFaces}
@page { size: A4; margin: 20mm; }
body { margin: 0; font-size: 16pt; line-height: 1.6; color: #000; }
h1 { font-size: 24pt; font-weight: 400; margin: 0 0 12pt; }
p { margin: 0 0 10pt; }
section { break-after: page; }
section:last-child { break-after: auto; }
</style>
</head>
<body>
${sections}
</body>
</html>
`;
}

/** Prints the page with Chromium: JavaScript off, offline, only files in the temporary folder reachable. */
async function print(temp, html) {
  const page = join(temp, 'page.html');
  writeFileSync(page, html);
  let browser;
  try {
    browser = await chromium.launch({ chromiumSandbox: true });
  } catch {
    console.log('Chromium sandbox not available on this machine (for example when running as root); printing without it.');
    browser = await chromium.launch({ chromiumSandbox: false });
  }
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    const tab = await context.newPage();
    const inside = pathToFileURL(realpathSync(temp)).href + '/';
    await tab.route('**/*', (route) => (route.request().url().startsWith(inside) ? route.continue() : route.abort()));
    await tab.goto(pathToFileURL(realpathSync(page)).href, { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready).catch(() => {});
    const pdf = await tab.pdf({ format: 'A4', tagged: true, outline: false, printBackground: false, displayHeaderFooter: false, preferCSSPageSize: true });
    return { pdf: new Uint8Array(pdf), version: browser.version() };
  } finally {
    await browser.close();
  }
}

/** Sets the title, creator, dates and a fixed /ID, and keeps Chromium's producer line. */
async function tidy(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.setTitle(text.title);
  doc.setCreator('PDFkaro test set');
  doc.setCreationDate(fixedDate);
  doc.setModificationDate(fixedDate);
  const id = createHash('sha256').update(readFileSync(join(here, 'multilingual-text.json'))).digest('hex').slice(0, 32);
  doc.context.trailerInfo.ID = doc.context.obj([PDFHexString.of(id), PDFHexString.of(id)]);
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
}

/** qpdf's check, and the file written uncompressed for searching. */
async function qpdfLook(bytes) {
  const createModule = require('@neslinesli93/qpdf-wasm');
  const run = async (args) => {
    const qpdf = await createModule({
      locateFile: () => require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'),
      noInitialRun: true,
      thisProgram: 'qpdf',
      print: () => {},
      printErr: () => {},
      preRun: [(m) => m.FS.init(null, () => {}, () => {})],
    });
    qpdf.FS.writeFile('/in.pdf', bytes);
    const code = qpdf.callMain(args);
    return { code, qpdf };
  };
  const checked = await run(['--check', '/in.pdf']);
  if (checked.code !== 0) fail(`qpdf --check exited with ${checked.code}`);
  const plain = await run(['--qdf', '--object-streams=disable', '--stream-data=uncompress', '/in.pdf', '/out.pdf']);
  if (plain.code !== 0) fail(`qpdf could not write an uncompressed copy (${plain.code})`);
  return plain.qpdf.FS.readFile('/out.pdf');
}

/** Refuses the file unless it has five pages, Noto subsets only, all embedded with a Unicode map, and only the five information keys. */
async function inspect(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (doc.getPageCount() !== text.pages.length) fail(`${doc.getPageCount()} pages, not ${text.pages.length}`);
  for (const [index, page] of doc.getPages().entries()) {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!fonts) fail(`page ${index + 1} has no fonts`);
    for (const [key, ref] of fonts.entries()) {
      const font = doc.context.lookup(ref, PDFDict);
      const name = font.lookup(PDFName.of('BaseFont'))?.toString().slice(1) ?? '';
      if (font.lookup(PDFName.of('Subtype'))?.toString() !== '/Type0') fail(`page ${index + 1}, font ${key} (${name}) is not a Type 0 font`);
      if (!allowedFonts.test(name)) fail(`page ${index + 1}, font ${name} is not one of the fetched Noto fonts`);
      if (!font.lookup(PDFName.of('ToUnicode'))) fail(`page ${index + 1}, font ${name} has no Unicode map`);
      const descendant = doc.context.lookup(font.lookup(PDFName.of('DescendantFonts'), PDFArray).get(0), PDFDict);
      const descriptor = descendant.lookup(PDFName.of('FontDescriptor'), PDFDict);
      if (!descriptor.lookup(PDFName.of('FontFile2'))) fail(`page ${index + 1}, font ${name} is not embedded as TrueType`);
    }
  }
  const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);
  const keys = info.keys().map((key) => key.toString());
  const extra = keys.filter((key) => !infoKeys.includes(key));
  if (extra.length > 0) fail(`document information holds ${extra.join(', ')}`);
}

/** Refuses the file if it carries a file: address or this machine's temporary or home folder. */
function refuseMachineTraces(temp, ...copies) {
  const traces = ['file:', temp, realpathSync(temp), homedir(), tmpdir()].filter((value, index, all) => value.length > 1 && all.indexOf(value) === index);
  for (const copy of copies) {
    const latin = Buffer.from(copy).toString('latin1');
    for (const trace of traces) if (latin.includes(trace)) fail(`the file holds "${trace}"`);
  }
}

const temp = await mkdtemp(join(tmpdir(), 'pdfkaro-fonts-'));
try {
  const fontFolders = {};
  for (const each of packages) fontFolders[each.name.replace('@fontsource/', '')] = await fetchPackage(temp, each);
  const { pdf, version } = await print(temp, pageHtml(fontFolders));
  const tidied = await tidy(pdf);
  const plain = await qpdfLook(tidied);
  await inspect(tidied);
  refuseMachineTraces(temp, tidied, plain);
  writeFileSync(out, tidied);
  console.log(`multilingual.pdf  ${tidied.length} bytes, printed by Chromium ${version}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
