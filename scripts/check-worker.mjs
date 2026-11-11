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

if (problems.length > 0) fail(problems.join('\n'));
console.log(`${engineIds.length} engine(s), each its own file and loaded late by ${workers[0]}.`);
