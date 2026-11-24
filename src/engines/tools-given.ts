// The tools an engine is given by the worker or a test (fflate, the picture
// decoder, canvases), by name.

import type { EngineTools } from './types';

/** A tool from the worker or a test, by name; throws when it was not given. */
export async function need<T>(tools: EngineTools, name: string): Promise<T> {
  const make = tools[name];
  if (!make) throw new Error(`${name} was not given to the engine.`);
  return (await make()) as T;
}
