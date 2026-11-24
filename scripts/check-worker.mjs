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
  { what: 'the page drawing and its canvas budget (thumbnail.ts)', path: join('src', 'engines', 'thumbnail.ts') },
  { what: 'the drawing step that draws on pages (stamp.ts)', path: join('src', 'engines', 'stamp.ts') },
  { what: 'the page reading and page update steps (pages.ts)', path: join('src', 'engines', 'pages.ts') },
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
// PDF.js reaches engines through `tools` only (lint refuses its value imports there), so no engine's file holds it.
for (const name of files.filter((each) => engineIds.some((id) => new RegExp(`^${id}-[A-Za-z0-9_-]{8}\\.js$`).test(each)))) {
  const source = readFileSync(join(assets, name), 'utf8');
  if (source.includes('Invalid factory url') || source.includes('pdfjsVersion')) problems.push(`${name} holds code from PDF.js.`);
}
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
// The drawing step (stamp.ts, for Add page numbers, then Watermark and Sign PDF) takes pdf-lib from its tools too,
// and the page reading and page update steps it shares with Crop PDF and Resize pages (pages.ts) use no pdf-lib at
// all: whichever file holds each one's code, found by a sentence of its own, holds none of pdf-lib's, and is not the worker.
const holdersOf = {};
for (const [what, sentence] of [
  ['the drawing step (stamp.ts)', 'A drawing used an object that cannot be written.'],
  ['the page reading and page update steps (pages.ts)', 'A page is too small or too large to draw on.'],
]) {
  const holders = files.filter((name) => /\.js$/.test(name) && readFileSync(join(assets, name), 'utf8').includes(sentence));
  holdersOf[what] = holders;
  if (holders.length !== 1) problems.push(`Expected ${what} in one file, found ${holders.length}.`);
  for (const name of holders) {
    if (name === workers[0]) problems.push(`The worker file holds ${what}.`);
    if (readFileSync(join(assets, name), 'utf8').includes(pdflibSentence)) problems.push(`${name}, which holds ${what}, holds pdf-lib's code.`);
  }
}
// The drawing step's file is for the tools that draw with pdf-lib: no engine file may import it unless that
// engine's job loads pdf-lib (`loads.job`, read from its source), so a tool that only reads and places pages
// (Crop PDF, Resize pages) never fetches it. At least one engine must import it, so the rule cannot pass by finding nothing.
const stampHolders = holdersOf['the drawing step (stamp.ts)'] ?? [];
let stampImporters = 0;
for (const id of engineIds) {
  const engineFile = files.find((each) => new RegExp(`^${id}-[A-Za-z0-9_-]{8}\\.js$`).test(each));
  if (!engineFile) continue;
  const job = /export const loads[^=]*=\s*\{[^}]*\bjob:\s*\[([^\]]*)\]/.exec(readFileSync(join('src', 'engines', 'tools', `${id}.ts`), 'utf8'));
  if (!job) {
    problems.push(`Could not read loads.job of ${id}.`);
    continue;
  }
  const drawsWithPdflib = /['"]pdflib['"]/.test(job[1]);
  const text = readFileSync(join(assets, engineFile), 'utf8');
  for (const name of stampHolders) {
    if (!text.includes(name)) continue;
    stampImporters++;
    if (!drawsWithPdflib) problems.push(`${engineFile} imports the drawing step (${name}), but ${id}'s job does not load pdf-lib.`);
  }
}
if (stampImporters === 0) problems.push('No engine imports the drawing step, so the rule on who may import it found nothing to check.');

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

// Every worker starts from a blob: address that imports the real file, so it runs under the page's
// Content Security Policy (src/workers/start-worker.ts); one started straight from a file would run
// with none, and the policy's worker-src 'self' cannot stop that. So each `new Worker(` in the built
// files must be the start helper's own: just before it, in the same function, the blob holding only
// `import ${JSON.stringify(address)};` as text/javascript, and the worker started from that blob's
// address. The one named exception is PDF.js's display file, whose own worker starts are never reached:
// the site sets GlobalWorkerOptions.workerPort and never workerSrc or rendererSrc (a unit test checks).
// No SharedWorker is started anywhere.
// `new Worker(`, `new self.Worker(`, and a computed `new globalThis["Worker"](`, '…' or `…` form.
const workerStart = /new\s+(?:[\w$]+(?:\.|\[\s*["'`](?=(?:Shared)?Worker["'`])))*(Shared)?Worker(?:["'`]\s*\])?\s*\(/g;
const blobText = 'new Blob([`import ${JSON.stringify(';
let helperStarts = 0;
const helperFiles = [];
for (const name of files.filter((each) => /\.m?js$/.test(each))) {
  const source = readFileSync(join(assets, name), 'utf8');
  for (const match of source.matchAll(workerStart)) {
    if (match[1]) {
      problems.push(`${name} starts a SharedWorker; the site starts none.`);
      continue;
    }
    if (pdfjsDisplay.includes(name)) continue;
    const before = source.slice(Math.max(0, match.index - 400), match.index);
    const blobAt = before.lastIndexOf(blobText);
    const between = blobAt === -1 ? '' : before.slice(blobAt);
    const object = /([\w$]+)=URL\.createObjectURL\([\w$]+\)/.exec(between);
    const started = /^new\s+Worker\s*\(\s*([\w$]+)\s*,/.exec(source.slice(match.index, match.index + 60));
    const isHelper =
      blobAt !== -1 &&
      between.includes('{type:`text/javascript`}') &&
      !/function|=>/.test(between) &&
      object !== null &&
      started !== null &&
      started[1] === object[1];
    if (isHelper) {
      helperStarts += 1;
      helperFiles.push(name);
    }
    else problems.push(`${name} starts a worker outside the blob: start helper (src/workers/start-worker.ts), so it would run with no policy.`);
  }
}
// The page starts the tool worker and the tool worker starts PDF.js's: the helper starts a worker in the page's
// workspace chunk and in the tool worker file, once each.
const helperIn = (pattern) => helperFiles.filter((name) => pattern.test(name)).length;
if (helperIn(/^ToolWorkspace\.[A-Za-z0-9_-]{8}\.js$/) !== 1) problems.push(`Expected one blob: worker start in the page's ToolWorkspace chunk, found ${helperIn(/^ToolWorkspace\./)}.`);
if (helperIn(/^tool\.worker-[A-Za-z0-9_-]{8}\.js$/) !== 1) problems.push(`Expected one blob: worker start in the tool worker file, found ${helperIn(/^tool\.worker-/)}.`);

// The thumbnail code a pick starts after its reading libraries (worker-core's draw set) may statically import only
// files the worker and the tool's engine already load. Otherwise starting it would bring a further request that
// waits on the worker's own event loop, which a long qpdf call holds, so its timing could follow the file.
const staticImports = (name) =>
  [...readFileSync(join(assets, name), 'utf8').matchAll(/(?:from|import)\s*["'`]\.\/([^"'`]+)["'`]/g)].map((match) => match[1]);
function staticClosure(name) {
  const seen = new Set([name]);
  const queue = [name];
  while (queue.length > 0) {
    for (const next of staticImports(queue.shift())) {
      if (seen.has(next) || !files.includes(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}
const oneFile = (pattern) => files.filter((name) => pattern.test(name));
const drawChunks = {
  pdf: [...pdfjsDisplay, ...pdfjsData, ...oneFile(/^thumbnail-[A-Za-z0-9_-]{8}\.js$/)],
  picture: oneFile(/^picture-thumbnail-[A-Za-z0-9_-]{8}\.js$/),
};
if (drawChunks.pdf.length !== 3) problems.push(`Expected PDF.js, its data and the thumbnail step as three files, found ${drawChunks.pdf.length}.`);
if (drawChunks.picture.length !== 1) problems.push(`Expected the picture thumbnail step as one file, found ${drawChunks.picture.length}.`);
const workerLoads = staticClosure(workers[0]);
for (const id of engineIds) {
  const chunk = files.find((name) => new RegExp(`^${id}-[A-Za-z0-9_-]{8}\\.js$`).test(name));
  if (!chunk) continue;
  // How the engine draws its thumbnails: `export const thumbnails = 'picture'`, with or without a type. Any other
  // mention of `thumbnails` as an export is a form this check does not know, so it fails rather than guess.
  const source = readFileSync(join('src', 'engines', 'tools', `${id}.ts`), 'utf8');
  const declared = /export\s+const\s+thumbnails\s*(?::\s*[^=;]+)?=\s*(['"])picture\1\s*(?:as\s+const\s*)?;/.test(source);
  if (!declared && /export\s+(?:const|let|var|function|\{[^}]*\bthumbnails\b)[^;]*\bthumbnails\b/.test(source)) {
    problems.push(`The ${id} engine exports thumbnails in a form check-worker.mjs cannot read.`);
  }
  const kind = declared ? 'picture' : 'pdf';
  const already = new Set([...workerLoads, ...staticClosure(chunk)]);
  for (const draw of drawChunks[kind]) {
    for (const brought of staticClosure(draw)) {
      if (brought !== draw && !already.has(brought)) problems.push(`${draw}, started for ${id}'s thumbnails, imports ${brought}, which neither the worker nor the ${id} engine loads.`);
    }
  }
}

if (problems.length > 0) fail(problems.join('\n'));
console.log(
  `${engineIds.length} engine(s), each its own file and loaded late by ${workers[0]}, none holding PDF.js; the shared qpdf JSON steps, resampling, page drawing, page reading and the drawing step out of it; PDF.js, its helper data, fflate, pdf-lib and the picture code in files of their own${pdflibNote}; every worker (${helperStarts}) started from a blob: address; the thumbnail code imports nothing the worker and engine do not already load.`,
);
