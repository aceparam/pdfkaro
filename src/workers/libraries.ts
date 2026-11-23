// Which library each key of the worker's `tools` belongs to, and the one order libraries are loaded in.
// Written once here: the worker checks its `tools` against `toolLibrary`, and worker-core hands an engine,
// for each step, only the keys whose library the engine declared for that step (`loads` in
// src/engines/types.ts), plus those marked `'always'`, which fetch nothing.

import type { EngineModule, LibraryName } from '../engines/types';

export type { LibraryName };

/** The order libraries are started in, whatever the tool: the same for every file. */
export const libraryOrder: readonly LibraryName[] = ['qpdf', 'fflate', 'pdflib', 'pdfjs', 'pictureThumbnail'];

/**
 * Every key of the worker's `tools`, with the library it belongs to. `'always'` marks a key that runs inside
 * the worker and fetches nothing. A key with no row is refused at run time, and `tool.worker.ts` checks its
 * `tools` against this table with `satisfies`, so a new key without a row fails the type check.
 */
export const toolLibrary = {
  qpdf: 'qpdf',
  fflate: 'fflate',
  pdflib: 'pdflib',
  pdfjs: 'pdfjs',
  pdfjsData: 'pdfjs',
  pdfjsGuard: 'always',
  canvas: 'always',
  decodePicture: 'always',
} as const satisfies Record<string, LibraryName | 'always'>;

/** A key of the worker's `tools`. */
export type ToolKey = keyof typeof toolLibrary;

/** The library a key of `tools` belongs to, `'always'`, or undefined for a key with no row. */
export function libraryOf(key: string): LibraryName | 'always' | undefined {
  return Object.hasOwn(toolLibrary, key) ? toolLibrary[key as ToolKey] : undefined;
}

/** The thumbnail code a tool's pick starts: from how its thumbnails are drawn, never from a file. */
export function drawSet(engine: Pick<EngineModule, 'thumbnails'>): readonly LibraryName[] {
  return engine.thumbnails === 'picture' ? ['pictureThumbnail'] : ['pdfjs'];
}

/** The libraries of `wanted`, in the one order, each once. */
export function inOrder(wanted: Iterable<LibraryName>): LibraryName[] {
  const set = new Set(wanted);
  return libraryOrder.filter((name) => set.has(name));
}
