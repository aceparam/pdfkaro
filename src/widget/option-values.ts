// Each tool's accepted values for each option it shows, written once. The
// registry lists the same values with their labels, and its test fails on any
// difference; an engine reads its own line here to check what it is sent, as
// engines read zip-limits.ts. A plain module: the engine, the worker and the
// page may all read it. Each tool's change adds its own line, such as
// `'add-page-numbers': { position: [...] }`.

/** Each tool's accepted values for each option, by tool id and option key. */
export const optionValues: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {};

/**
 * The value an engine was sent for one of its options, when it is a string
 * among that option's accepted values; else `undefined`, which the engine
 * refuses before it reads the file. Only own keys count, so `__proto__` or
 * `toString` is never taken for a tool or an option.
 */
export function acceptedValue(
  tool: string,
  key: string,
  value: unknown,
  values: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = optionValues,
): string | undefined {
  if (typeof value !== 'string' || !Object.hasOwn(values, tool)) return undefined;
  const byKey = values[tool]!;
  if (!Object.hasOwn(byKey, key)) return undefined;
  return byKey[key]!.includes(value) ? value : undefined;
}
