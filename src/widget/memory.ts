// Whether a failure is the browser running out of memory, written once: the
// worker reads it to say so on the page (worker-core.ts's `failureKind`), and
// an engine reads it to let such a failure through unchanged where it would
// otherwise refuse what it was reading (Sign PDF's picture).

/**
 * True for the words a browser or WebAssembly uses when memory runs out. Not
 * every RangeError: a stack overflow or a bad offset in a damaged file is the
 * engine's failure, not memory.
 */
export function outOfMemory(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /out of memory|\boom\b|cannot enlarge memory|could not allocate memory|allocation failed|invalid array buffer length|invalid typed array length/i.test(text);
}
