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

// A sentence from each engine's own source must not be found in the worker file.
for (const id of engineIds) {
  const source = readFileSync(join('src', 'engines', 'tools', `${id}.ts`), 'utf8');
  const sentences = [...source.matchAll(/'([A-Z][^'\n]{15,})'/g)].map((match) => match[1]);
  for (const sentence of sentences) {
    if (worker.includes(sentence)) problems.push(`The worker file holds code from the ${id} engine ("${sentence}").`);
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
// The page engines' shared steps (src/engines/plain.ts and outline.ts) load late, never inside the worker file.
if (worker.includes('A bookmark could not be read.') || worker.includes('--object-streams=disable')) problems.push("The worker file holds the page engines' shared steps.");

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

if (problems.length > 0) fail(problems.join('\n'));
console.log(`${engineIds.length} engine(s), each its own file and loaded late by ${workers[0]}; PDF.js, its helper data and fflate in files of their own.`);
