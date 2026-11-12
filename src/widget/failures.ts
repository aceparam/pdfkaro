// What the page says when a job fails, and on the line above the bar while it
// runs. Plain functions over the registry's words, tested in Node.

import type { Progress } from '../engines/types';
import type { ToolWidgetWords } from '../tools/registry';
import { fileCount, progressLine } from './format';
import type { FailureKind } from './state';
import { zipLimitSentence } from './zip-limits';

const shared: Record<'memory' | 'engine-load' | 'engine', string> = {
  memory: 'Your browser ran out of memory. Try fewer or smaller files.',
  'engine-load': 'The tool could not be loaded. Check your connection and try again.',
  engine: 'Something went wrong. Try again.',
};

/** The one sentence for a failure: what happened, and the one thing to try, in the tool's own words where it has them. */
export function failureSentence(kind: FailureKind, words: Pick<ToolWidgetWords, 'memoryAdvice' | 'zipLimitAdvice'>): string {
  if (kind === 'too-many-files' || kind === 'zip-too-large') {
    return zipLimitSentence(kind === 'too-many-files' ? 'files' : 'bytes', words.zipLimitAdvice ?? 'Try a smaller job.');
  }
  if (kind === 'memory' && words.memoryAdvice) return `Your browser ran out of memory. ${words.memoryAdvice}`;
  return shared[kind];
}

/** The line above the bar while a job runs. A tool that gives several files counts its parts once they come, not the file it was given. */
export function workingLine(progress: Progress | null, words: Pick<ToolWidgetWords, 'writingLabel' | 'outputs'>, listed: number): string {
  if (progress) return progressLine(progress, words.writingLabel);
  return words.outputs === 'several' ? 'Starting' : `Starting on ${fileCount(listed)}`;
}
