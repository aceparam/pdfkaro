// Checks the built site: every engine stays its own file, fetched by the
// worker only when its tool runs, and no engine's code lands in the worker
// file itself. Run after a build.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const assets = join('dist', '_astro');
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!existsSync(assets)) fail('There is no dist/_astro folder. Run the build first.');

const files = readdirSync(assets);
const workers = files.filter((name) => /^tool\.worker-[A-Za-z0-9_-]{8}\.js$/.test(name));
if (workers.length !== 1) fail(`Expected one tool worker file in ${assets}, found ${workers.length}.`);
const worker = readFileSync(join(assets, workers[0]), 'utf8');

const engineIds = readdirSync(join('src', 'engines', 'tools'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => name.replace(/\.ts$/, ''));

const problems = [];
for (const id of engineIds) {
  const chunks = files.filter((name) => new RegExp(`^${id}-[A-Za-z0-9_-]{8}\\.js$`).test(name));
  if (chunks.length !== 1) {
    problems.push(`The ${id} engine is not its own file (found ${chunks.length}). Its code may be inside the worker.`);
    continue;
  }
  const chunk = chunks[0];
  if (!worker.includes(`import(\`./${chunk}\`)`) && !worker.includes(`import("./${chunk}")`)) {
    problems.push(`The worker does not load ${chunk} with import(), so it is not loaded late.`);
  }
  if (new RegExp(`(?:from|import)\\s*["'\`]\\./${chunk.replace('.', '\\.')}["'\`]`).test(worker)) {
    problems.push(`The worker imports ${chunk} as soon as it starts.`);
  }
}

// A sentence from each engine's own source, and from the page engines' shared
// steps, must not be found in the worker file.
const lateSources = [
  ...engineIds.map((id) => ({ what: `the ${id} engine`, path: join('src', 'engines', 'tools', `${id}.ts`) })),
  { what: "the page engines' shared steps (plain.ts)", path: join('src', 'engines', 'plain.ts') },
  { what: "the page engines' shared steps (outline.ts)", path: join('src', 'engines', 'outline.ts') },
  { what: "the shared qpdf JSON steps (qpdf-json.ts)", path: join('src', 'engines', 'qpdf-json.ts') },
  { what: 'the picture resampling (resample.ts)', path: join('src', 'engines', 'resample.ts') },
];
for (const { what, path } of lateSources) {
  const source = readFileSync(path, 'utf8');
  const sentences = [...source.matchAll(/['"`]([A-Z][^'"`\n$]{15,})['"`]/g)].map((match) => match[1]);
  if (sentences.length === 0) problems.push(`No sentence was found in ${path} to look for in the worker file.`);
  for (const sentence of sentences) {
    if (worker.includes(sentence)) problems.push(`The worker file holds code from ${what} ("${sentence}").`);
  }
}

// PDF.js and its helper data load late, from files of their own, never inside the worker file.
const pdfjsDisplay = files.filter((name) => /^pdf-[A-Za-z0-9_-]{8}\.js$/.test(name));
const pdfjsWorker = files.filter((name) => /^pdf\.worker\.min-[A-Za-z0-9_-]{8}\.mjs$/.test(name));
const pdfjsData = files.filter((name) => /^pdfjs-data-[A-Za-z0-9_-]{8}\.js$/.test(name));
for (const [what, found] of [['PDF.js', pdfjsDisplay], ["PDF.js's worker", pdfjsWorker], ["PDF.js's helper data", pdfjsData]]) {
  if (found.length !== 1) problems.push(`Expected ${what} as one file of its own in ${assets}, found ${found.length}.`);
}
if (worker.includes('Invalid factory url') || worker.includes('pdfjsVersion')) problems.push('The worker file holds code from PDF.js.');
if (worker.includes('data:application/octet-stream;base64') || worker.includes('data:font/')) problems.push("The worker file holds PDF.js's helper data.");

// fflate's zip step loads late, from a file of its own, never inside the worker file.
const fflate = files.filter((name) => /^fflate-[A-Za-z0-9_-]{8}\.js$/.test(name));
if (fflate.length !== 1) problems.push(`Expected fflate as one file of its own in ${assets}, found ${fflate.length}.`);
else if (!worker.includes(`import(\`./${fflate[0]}\`)`) && !worker.includes(`import("./${fflate[0]}")`)) {
  problems.push(`The worker does not load ${fflate[0]} with import(), so it is not loaded late.`);
}
// The page engines' shared steps load late: besides their sentences, above, qpdf's option for the plain copy.
if (worker.includes('--object-streams=disable')) problems.push("The worker file holds the page engines' shared steps.");
// Compress PDF's steps load late: besides their sentences, above, qpdf's options for reading raw streams and writing again.
for (const option of ['--json-stream-prefix=', '--recompress-flate', '--update-from-json=']) {
  if (worker.includes(option)) problems.push(`The worker file holds Compress PDF's steps ("${option}").`);
}

// Lookup tables from fflate's deflate code: present only if fflate itself is in the file.
if (worker.includes('[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]')) problems.push("The worker file holds fflate's code.");

// The native canvas package used by tests in Node must never be shipped. PDF.js names it,
// for Node only, in its own script; nothing else may.
for (const name of files.filter((each) => /\.m?js$/.test(each) && !pdfjsDisplay.includes(each))) {
  if (readFileSync(join(assets, name), 'utf8').includes('@napi-rs')) problems.push(`${name} names @napi-rs, a package that is never shipped.`);
}

// PDF.js must run no generated code: the version is what protects against
// CVE-2024-4367, and this keeps a later version from bringing such code back.
for (const name of [...pdfjsDisplay, ...pdfjsWorker]) {
  const source = readFileSync(join(assets, name), 'utf8');
  if (/\beval\(|new Function\(/.test(source)) problems.push(`${name} holds eval( or new Function(.`);
}

// pdf-lib loads late, from one file of its own, never inside the worker file or an engine's file
// (Image to PDF's engine takes it from its tools, with `import type` only). A sentence from pdf-lib's
// own source marks its code.
const pdflib = files.filter((name) => /^pdflib-[A-Za-z0-9_-]{8}\.js$/.test(name));
const pdflibSentence = 'SOI not found in JPEG';
let pdflibNote = '';
if (pdflib.length !== 1) problems.push(`Expected pdf-lib as one file of its own in ${assets}, found ${pdflib.length}.`);
else {
  if (!worker.includes(`import(\`./${pdflib[0]}\`)`) && !worker.includes(`import("./${pdflib[0]}")`)) {
    problems.push(`The worker does not load ${pdflib[0]} with import(), so it is not loaded late.`);
  }
  const library = readFileSync(join(assets, pdflib[0]), 'utf8');
  if (!library.includes(pdflibSentence)) problems.push(`${pdflib[0]} does not hold pdf-lib's sentence "${pdflibSentence}", so this check would find nothing.`);
  // node-html-better-parser comes with pdf-lib (for drawing SVG); the bundler cannot leave it out. Noted, not refused.
  pdflibNote = library.includes('<!--[^]*?(?=-->)-->') ? `; node-html-better-parser is in ${pdflib[0]}` : `; node-html-better-parser is not in ${pdflib[0]}`;
}
for (const name of [workers[0], ...files.filter((each) => engineIds.some((id) => new RegExp(`^${id}-[A-Za-z0-9_-]{8}\\.js$`).test(each)))]) {
  if (readFileSync(join(assets, name), 'utf8').includes(pdflibSentence)) problems.push(`${name} holds pdf-lib's code.`);
}

// The picture reader and the picture thumbnail load late, from files of their own, never inside the worker file.
// picture.ts throws no sentences, so its marker names stand in for them.
const sentencesIn = (path) => [...readFileSync(path, 'utf8').matchAll(/['"`]([A-Z][^'"`\n$]{15,})['"`]/g)].map((match) => match[1]);
for (const [what, pattern, markers] of [
  ['the picture reader', /^picture-[A-Za-z0-9_-]{8}\.js$/, ['ICC_PROFILE', 'mntr', 'acTL']],
  ['the picture thumbnail', /^picture-thumbnail-[A-Za-z0-9_-]{8}\.js$/, sentencesIn(join('src', 'engines', 'picture-thumbnail.ts'))],
]) {
  const found = files.filter((name) => pattern.test(name));
  if (found.length !== 1) {
    problems.push(`Expected ${what} as one file of its own in ${assets}, found ${found.length}.`);
    continue;
  }
  const own = readFileSync(join(assets, found[0]), 'utf8');
  if (markers.length === 0) problems.push(`Nothing was found to mark ${what}'s code.`);
  for (const marker of markers) {
    if (!own.includes(marker)) problems.push(`${found[0]} does not hold "${marker}", so this check would find nothing.`);
    if (worker.includes(marker)) problems.push(`The worker file holds code from ${what} ("${marker}").`);
  }
}

if (problems.length > 0) fail(problems.join('\n'));
console.log(
  `${engineIds.length} engine(s), each its own file and loaded late by ${workers[0]}; the shared qpdf JSON steps and resampling out of it; PDF.js, its helper data, fflate, pdf-lib and the picture code in files of their own${pdflibNote}.`,
);
