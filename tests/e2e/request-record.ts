// The rules uniform-requests.spec.ts judges the host's record by, as plain functions, so a unit test can feed them a
// recorded log (tests/unit/request-record.test.ts) and see them report a page that fetches a file for some inputs only.

/** What the host received in one phase of one input, as `METHOD /path` lines, and what that phase expected. */
export type Phase = { what: string; expected: string[]; got: string[] };

/** One input's record: its phases, and what arrived between them or after the last, which must be nothing. */
export type InputRecord = { label: string; phases: Phase[]; gaps: { after: string; got: string[] }[] };

const counted = (lines: readonly string[]) => [...lines].sort();
const same = (one: readonly string[], other: readonly string[]) => JSON.stringify(counted(one)) === JSON.stringify(counted(other));

/** "expected X, got Y" for a phase whose record differs. */
export const differs = (slug: string, what: string, label: string, expected: string[], got: string[]) =>
  `${slug}: after ${what} for ${label}, expected ${JSON.stringify(counted(expected))}, got ${JSON.stringify(counted(got))}`;

/** Each phase of each input against its expected list (the same files, each once), and every gap empty. */
export function recordProblems(slug: string, record: InputRecord): string[] {
  const problems: string[] = [];
  for (const phase of record.phases) if (!same(phase.expected, phase.got)) problems.push(differs(slug, phase.what, record.label, phase.expected, phase.got));
  for (const gap of record.gaps) {
    if (gap.got.length > 0) problems.push(`${slug}: between phases, after ${gap.after} for ${record.label}, nothing was expected, got ${JSON.stringify(counted(gap.got))}`);
  }
  return problems;
}

/** The same phase across every input that has it: each must equal the first, whatever the expected list says. */
export function acrossInputs(slug: string, records: InputRecord[], what: string): string[] {
  const withPhase = records.flatMap((record) => record.phases.filter((phase) => phase.what === what).map((phase) => ({ label: record.label, got: phase.got })));
  const first = withPhase[0];
  if (!first) return [];
  return withPhase
    .slice(1)
    .filter((each) => !same(first.got, each.got))
    .map((each) => `${slug}: after ${what}, ${first.label} got ${JSON.stringify(counted(first.got))} but ${each.label} got ${JSON.stringify(counted(each.got))}`);
}
