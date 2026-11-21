// What the page says when a job fails, and on the line above the bar while it
// runs. Plain functions over the registry's words, tested in Node.

import type { Progress } from '../engines/types';
import type { DrawingOption, TextOption, ToolWidgetWords } from '../tools/registry';
import { fileCount, number, progressLine } from './format';
import { shownOptions, type Choices } from './options';
import type { FailureKind } from './state';
import { tooManyPicturesSentence, zipLimitSentence } from './zip-limits';

const shared: Record<'memory' | 'engine-load' | 'engine', string> = {
  memory: 'Your browser ran out of memory. Try fewer or smaller files.',
  'engine-load': 'The tool could not be loaded. Check your connection and try again.',
  engine: 'Something went wrong. Try again.',
};

/** What the page says when a new file would grow far past what drawing on it adds (stamp.ts's `OutputLimit`). */
export const outputLimitSentence = 'The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.';

/** What the page says when the engine refuses a text, for a tool with no words of its own for it. */
export const textRefusedSentence = 'The text could not be used. Check it and try again.';

/** What the page says when the engine refuses a drawing, for a tool with no words of its own for it. */
export const drawingRefusedSentence = 'The drawing could not be used. Clear it and draw again.';

/** The one sentence for a failure: what happened, and the one thing to try, in the tool's own words where it has them. */
export function failureSentence(
  kind: FailureKind,
  words: Pick<ToolWidgetWords, 'memoryAdvice' | 'zipLimitAdvice' | 'options'>,
  choices: Choices = {},
): string {
  if (kind === 'too-many-files' || kind === 'zip-too-large') {
    return zipLimitSentence(kind === 'too-many-files' ? 'files' : 'bytes', words.zipLimitAdvice ?? 'Try a smaller job.');
  }
  // PDF to JPG and PDF to PNG stop at maxOutputBytes (zip-limits.ts), so the tab is not ended.
  if (kind === 'too-many-pictures') return tooManyPicturesSentence();
  // Only a broken or crafted file reaches the drawing step's budget, so it fails the same on a computer: its own advice.
  if (kind === 'output-limit') return outputLimitSentence;
  // The page should never send a text the engine refuses; if the two disagree, the first shown text's own words, else the shared ones.
  // A hidden text is never sent, so its words never apply (shownOptions decides what is shown, in one place).
  if (kind === 'text-refused') {
    const text = shownOptions(words.options, choices).find((option): option is TextOption => option.kind === 'text');
    return text?.refusedSentence ?? textRefusedSentence;
  }
  // The same for a drawing: the first shown drawing's own words, else the shared ones.
  if (kind === 'drawing-refused') {
    const drawing = shownOptions(words.options, choices).find((option): option is DrawingOption => option.kind === 'drawing');
    return drawing?.refusedSentence ?? drawingRefusedSentence;
  }
  if (kind === 'memory' && words.memoryAdvice) return `Your browser ran out of memory. ${words.memoryAdvice}`;
  return shared[kind];
}

/** The line above the bar while a job runs. A tool that gives several files counts its parts once they come, not the file it was given. */
export function workingLine(progress: Progress | null, words: Pick<ToolWidgetWords, 'writingLabel' | 'outputs'>, listed: number): string {
  if (progress) return progressLine(progress, words.writingLabel);
  return words.outputs === 'several' ? 'Starting' : `Starting on ${fileCount(listed)}`;
}

/** What the page says about files turned away for being of the wrong type, with the tool's advice said once after them. */
export function refusedSentence(names: readonly string[], words: Pick<ToolWidgetWords, 'acceptsName' | 'refusedAdvice'>): string {
  if (names.length === 0) return '';
  const said = names.map((name) => `${name} is not ${words.acceptsName}, so it was not added.`);
  return [...said, ...(words.refusedAdvice ? [words.refusedAdvice] : [])].join(' ');
}

/**
 * The heading, the one thing to try, and the words a screen reader hears, for a file that cannot be read:
 * damaged, or saved in a way the tool cannot read. The advice is the tool's own, from the registry; a tool
 * with none (the PDF tools) says the heading alone, as it always did.
 */
export function unreadableNotice(
  name: string,
  status: 'damaged' | 'unsupported',
  words: Pick<ToolWidgetWords, 'damagedAdvice' | 'unsupportedAdvice'>,
): { heading: string; advice?: string; announcement: string } {
  const heading = status === 'damaged' ? `${name} is damaged and cannot be read.` : `${name} is saved in a way this tool cannot read.`;
  const advice = status === 'damaged' ? words.damagedAdvice : words.unsupportedAdvice;
  return advice ? { heading, advice, announcement: `${heading} ${advice}` } : { heading, announcement: heading };
}

/** The heading of the notice for a very large picture, with its pixels in millions, rounded down: "huge.png has 256 million pixels". */
export function pixelsHeading(name: string, pixels: number): string {
  return `${name} has ${number(Math.floor(pixels / 1_000_000))} million pixels`;
}

/** What the notice for a very large picture says under its heading. */
export const pixelsAdvice = 'Converting it may be slow, and a phone may run out of memory. You can still go ahead.';
