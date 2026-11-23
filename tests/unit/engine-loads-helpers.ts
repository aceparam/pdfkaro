// Shared by the engine-loads tests: runs one engine's reading, picture reading and job against every file in
// tests/fixtures/ with a `tools` that records what is asked for, and gives back each step that asked for a
// library outside the set the engine declares (`loads` in src/engines/types.ts), with a row for each step.
// The engines are split over four test files, by their place in the sorted list (`shard`), so that Vitest runs them
// side by side and a new engine lands in one without anyone listing it. Hand-balanced lists ran about 70 s each;
// by index the slowest file takes about 90 s, which is kept for the simpler rule.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineModule, EngineTools, LibraryName } from '../../src/engines/types';
import { libraryOf, libraryOrder } from '../../src/workers/libraries';
import { makeQpdf } from './stamp-helpers';
import { tools as drawingTools } from './thumbnail-helpers';

const fixtureDir = join(__dirname, '../fixtures');
const pictureDir = join(fixtureDir, 'pictures');
export const pdfFixtures = readdirSync(fixtureDir).filter((name) => name.endsWith('.pdf')).sort();
const pictureFixtures = readdirSync(pictureDir).filter((name) => /\.(jpe?g|png|tif)$/.test(name)).sort();
const read = (dir: string, name: string) => new Uint8Array(readFileSync(join(dir, name)));
const password = 'open-sesame';
const withPassword = new Set(['password.pdf', 'compress-password.pdf']);

export const engineIds = readdirSync(join(__dirname, '../../src/engines/tools'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => name.replace(/\.ts$/, ''))
  .sort();

/** The full set of libraries, from disk, as the engine tests give them; the worker gives the same keys. */
const allTools: EngineTools = { ...drawingTools, qpdf: makeQpdf, pdfjsGuard: async () => (drawing: Promise<unknown>) => drawing };

/** A `tools` that records the library behind each key asked for. Unknown keys are recorded as themselves. */
function recording(): { tools: EngineTools; asked: Set<string> } {
  const asked = new Set<string>();
  const tools = new Proxy(allTools, {
    get(target, key) {
      if (typeof key !== 'string') return undefined;
      const library = libraryOf(key);
      return async () => {
        asked.add(library ?? `unknown key ${key}`);
        const make = target[key];
        if (!make) throw new Error(`no ${key} in the test's tools`);
        return make();
      };
    },
  });
  return { tools, asked };
}

/** The libraries asked for that a step did not declare; `'always'` keys are allowed everywhere. */
const undeclared = (asked: Set<string>, declared: readonly LibraryName[]) =>
  [...asked].filter((library) => library !== 'always' && !(declared as readonly string[]).includes(library));

/** A valid option set for each tool's job, from the page count its reading gave (1 when it gave none). */
export const options: Record<string, (pages: number) => Record<string, unknown>> = {
  'merge-pdf': () => ({}),
  'split-pdf': () => ({ cuts: [] }),
  'extract-pdf-pages': () => ({ pages: [1] }),
  'delete-pdf-pages': () => ({ pages: [1] }),
  'rearrange-pdf-pages': (pages) => ({ order: Array.from({ length: pages }, (_, index) => pages - index) }),
  'rotate-pdf': () => ({ turns: { all: 1, pages: [] } }),
  'crop-pdf': () => ({}),
  'compress-pdf': () => ({}),
  'pdf-to-images': () => ({ format: 'jpg' }),
  'add-page-numbers': () => ({ position: 'bottom-centre' }),
  'watermark-pdf': () => ({ text: 'DRAFT' }),
  'sign-pdf': () => ({ source: 'type', name: 'Ann Lee', page: 'last', position: 'bottom-right' }),
  'protect-pdf': () => ({ newPassword: 'a new one' }),
  'unlock-pdf': () => ({}),
  'images-to-pdf': () => ({}),
};

export type Row = { engine: string; step: string; input: string; asked: string[]; outcome: string };

async function step(rows: Row[], engine: string, name: string, input: string, declared: readonly LibraryName[], body: (tools: EngineTools) => Promise<string>): Promise<string[]> {
  const { tools, asked } = recording();
  let outcome: string;
  try {
    outcome = await body(tools);
  } catch (error) {
    outcome = `failed (${error instanceof Error ? error.name : 'thrown'})`;
  }
  rows.push({ engine, step: name, input, asked: libraryOrder.filter((library) => asked.has(library)), outcome });
  return undeclared(asked, declared).map((library) => `${engine} ${name} ${input}: asked for ${library}, declared [${declared.join(', ')}]`);
}

const runOutcome = (outputs: Uint8Array[]) => (outputs.length === 0 ? 'no new file' : `${outputs.length} file${outputs.length === 1 ? '' : 's'}`);

/** Runs every step of engine `id` against every fixture. Gives the steps that broke its declaration, and every row. */
export async function checkEngine(id: string): Promise<{ problems: string[]; rows: Row[] }> {
  const rows: Row[] = [];
  const engine = (await import(`../../src/engines/tools/${id}.ts`)) as EngineModule;
  const problems: string[] = [];
  const pictureTool = engine.thumbnails === 'picture';
  const inputs = pictureTool ? [...pictureFixtures.map((name) => ({ dir: pictureDir, name })), ...pdfFixtures.map((name) => ({ dir: fixtureDir, name }))] : pdfFixtures.map((name) => ({ dir: fixtureDir, name }));
  for (const { dir, name } of inputs) {
    const bytes = read(dir, name);
    const given = withPassword.has(name) ? password : undefined;
    let pages = 1;
    if (engine.inspect) {
      problems.push(...(await step(rows, id, 'inspect', name, engine.loads.read, async (tools) => (await engine.inspect!(bytes.slice(), undefined, tools)).kind)));
      problems.push(
        ...(await step(rows, id, 'inspect', `${name}${given ? ' with its password' : ''}`, engine.loads.read, async (tools) => {
          const outcome = await engine.inspect!(bytes.slice(), given, tools);
          if (outcome.kind === 'ready') pages = Math.max(1, outcome.pages);
          return outcome.kind;
        })),
      );
    }
    const files = id === 'merge-pdf' ? [bytes.slice(), read(fixtureDir, 'text.pdf')] : [bytes.slice()];
    const passwords = id === 'merge-pdf' ? [given, undefined] : [given];
    problems.push(...(await step(rows, id, 'run', name, engine.loads.job, async (tools) => runOutcome(await engine.run(files, { ...options[id]!(pages), passwords }, () => {}, tools)))));
  }
  if (engine.inspectPicture) {
    for (const { dir, name } of [...pictureFixtures.map((each) => ({ dir: pictureDir, name: each })), ...pdfFixtures.map((each) => ({ dir: fixtureDir, name: each }))]) {
      const bytes = read(dir, name);
      problems.push(...(await step(rows, id, 'inspectPicture', name, engine.loads.read, async (tools) => (await engine.inspectPicture!('picture', bytes, tools)).kind)));
    }
  }
  if (id === 'sign-pdf') {
    // The other two ways, on one file: a drawing, and every picture.
    const text = read(fixtureDir, 'text.pdf');
    const base = { page: 'last', position: 'bottom-right', passwords: [undefined] };
    problems.push(...(await step(rows, id, 'run', 'text.pdf, drawn', engine.loads.job, async (tools) => runOutcome(await engine.run([text.slice()], { ...base, source: 'draw', drawing: [[100, 50, 900, 50]] }, () => {}, tools)))));
    for (const name of pictureFixtures) {
      const picture = read(pictureDir, name);
      problems.push(...(await step(rows, id, 'run', `text.pdf, picture ${name}`, engine.loads.job, async (tools) => runOutcome(await engine.run([text.slice()], { ...base, source: 'picture', picture }, () => {}, tools)))));
    }
  }
  return { problems, rows };
}

/** Writes the rows to `${ENGINE_LOADS_REPORT}.<name>.json` when that variable is set. */
export function report(name: string, rows: Row[]): void {
  const target = process.env.ENGINE_LOADS_REPORT;
  if (target) writeFileSync(`${target}.${name}.json`, JSON.stringify(rows, null, 1));
}

/** The engines of one of the four engine-loads files: every fourth, from `index`. */
export const shard = (index: number) => engineIds.filter((_, place) => place % 4 === index);
