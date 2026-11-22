// Each tool's exact list of the site's files that may load after a pick, built from the build itself: the files
// every tool page fetches after a pick, the tool's engine and everything its file statically imports, and the
// files of each library the engine declares (`loads` in src/engines/types.ts), its thumbnail code included
// (`drawSet` in src/workers/libraries.ts). One source for the no-upload test of every tool, and for what each
// phase of uniform-requests.spec.ts expects.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { EngineModule, LibraryName } from '../../src/engines/types';
import { drawSet, inOrder } from '../../src/workers/libraries';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '../../dist/_astro');

/** Every engine in src/engines/tools/, by tool id, read once when this file loads: a new engine is found without a list. */
const engineDir = join(here, '../../src/engines/tools');
const engines: Record<string, Pick<EngineModule, 'loads' | 'thumbnails'>> = Object.fromEntries(
  await Promise.all(
    readdirSync(engineDir)
      .filter((name) => name.endsWith('.ts'))
      .map(async (name) => [name.replace(/\.ts$/, ''), (await import(pathToFileURL(join(engineDir, name)).href)) as EngineModule] as const),
  ),
);

const hash = '[A-Za-z0-9_-]{8}';

/** The built files of each library: what the worker's `libraries` loads for it. */
export const libraryFiles: Record<LibraryName, RegExp> = {
  qpdf: new RegExp(`^qpdf-${hash}\\.(js|wasm)$`),
  fflate: new RegExp(`^fflate-${hash}\\.js$`),
  pdflib: new RegExp(`^pdflib-${hash}\\.js$`),
  pdfjs: new RegExp(`^(pdf-${hash}\\.js|pdf\\.worker\\.min-${hash}\\.mjs|pdfjs-data-${hash}\\.js|thumbnail-${hash}\\.js)$`),
  pictureThumbnail: new RegExp(`^picture-thumbnail-${hash}\\.js$`),
};

/** The files every tool page fetches after a pick: the workspace, a copy of the picker's styles, and the worker. */
export const sharedFiles = new RegExp(`^(ToolWorkspace\\.${hash}\\.js|FilePicker\\.${hash}\\.css|tool\\.worker-${hash}\\.js)$`);

const built = () => readdirSync(assets);
const address = (name: string) => `/_astro/${name}`;

/** The files a built file statically imports, and theirs, itself included. */
function staticClosure(name: string, files: string[]): Set<string> {
  const seen = new Set([name]);
  const queue = [name];
  while (queue.length > 0) {
    const source = readFileSync(join(assets, queue.shift()!), 'utf8');
    for (const match of source.matchAll(/(?:from|import)\s*["'`]\.\/([^"'`]+)["'`]/g)) {
      const next = match[1]!;
      if (seen.has(next) || !files.includes(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function engineFor(toolId: string): Pick<EngineModule, 'loads' | 'thumbnails'> {
  const engine = engines[toolId];
  if (!engine) throw new Error(`No engine file for ${toolId} in src/engines/tools/.`);
  return engine;
}

/** The files of these libraries, with what each statically imports, as addresses. */
function filesOf(names: readonly LibraryName[], files: string[]): Set<string> {
  const out = new Set<string>();
  for (const name of inOrder(names)) {
    const matched = files.filter((file) => libraryFiles[name].test(file));
    if (matched.length === 0) throw new Error(`No built file for the ${name} library.`);
    for (const file of matched) for (const each of staticClosure(file, files)) out.add(each);
  }
  return out;
}

export type ToolFiles = {
  /** Every file the tool's page may fetch after a pick, as addresses: the no-upload test's list. */
  all: string[];
  /** What the pick fetches: the shared files, the engine and its imports, the reading libraries and the thumbnail code. */
  pick: string[];
  /** What the main button fetches on top: the job's libraries not already fetched at the pick. */
  job: string[];
};

/** The tool's files, read from the build in dist/. */
export function toolFiles(toolId: string): ToolFiles {
  const files = built();
  const engine = engineFor(toolId);
  const chunk = files.find((name) => new RegExp(`^${toolId}-${hash}\\.js$`).test(name));
  if (!chunk) throw new Error(`No built file for the ${toolId} engine.`);
  const pick = new Set<string>();
  // The shared files alone: what they import statically came with the page, before the pick.
  for (const name of files.filter((each) => sharedFiles.test(each))) pick.add(name);
  for (const each of staticClosure(chunk, files)) pick.add(each);
  for (const each of filesOf([...engine.loads.read, ...drawSet(engine)], files)) pick.add(each);
  const job = [...filesOf(engine.loads.job, files)].filter((name) => !pick.has(name));
  return {
    all: [...pick, ...job].map(address).sort(),
    pick: [...pick].map(address).sort(),
    job: job.map(address).sort(),
  };
}
