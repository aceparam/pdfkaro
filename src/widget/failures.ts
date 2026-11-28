// What the page says when a job fails, and on the line above the bar while it
// runs. Plain functions over the registry's words, tested in Node.

import type { Progress } from '../engines/types';
import type { DrawingOption, NewPasswordOption, PictureOption, TextOption, ToolWidgetWords } from '../tools/registry';
import { fileCount, formatSize, number, progressLine } from './format';
import { chosenPicture, shownOptions, type Choices } from './options';
import type { FailureKind, PictureEntry } from './state';
import { tooManyPicturesSentence, zipLimitSentence } from './zip-limits';

const shared: Record<'memory' | 'engine-load' | 'engine', string> = {
  memory: 'Your browser ran out of memory. Try fewer or smaller files.',
  'engine-load': 'The tool could not be loaded. Check your connection and try again.',
  engine: 'Something went wrong. Try again.',
};

/** What the page says when a new file would grow far past what drawing on it adds (stamp.ts's `OutputLimit`). */
export const outputLimitSentence = 'The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.';

/**
 * What the page says when a page could not be placed on its new paper safely (pages.ts's `UnsafePage`). Only a crafted
 * file reaches it, so it fails the same on a computer: its own advice. Resize pages is the only tool that raises it, so
 * it names resizing; a later tool that places pages gives its own words.
 */
export const unsafePageSentence = 'A page of this file could not be resized, so no new file was made. The file may be damaged. Try another copy of it.';

/**
 * What the page says when page `page`'s drawing instructions are too large to work on here (content.ts's
 * `PageTooLarge`): Grayscale PDF converts, Repair PDF repairs (`action`, the tool's `pageTooLargeAction`). A genuine
 * dense map or drawing can reach it, so it names deleting the page or splitting the file, not damage. The number is
 * the only thing from the file in it.
 */
export function pageTooLargeSentence(page?: number, action = 'convert'): string {
  // One template: with no page (never expected), the same words name "A page".
  const which = page !== undefined && Number.isSafeInteger(page) && page >= 1 ? `Page ${number(page)}` : 'A page';
  return `${which} has too much drawing on it to ${action} here. Delete that page, or split the file, and ${action} the rest.`;
}

/**
 * What the page says when a repaired file would still fail qpdf's check (Repair PDF's `RepairFailed`). Going back to
 * the file can only fail again, so the failure offers "Choose another file". One wording for "another copy", as in
 * Repair PDF's damaged notice.
 */
export const tooDamagedSentence = 'This file is too damaged to repair. If you have another copy of the file, try that one.';

/** What the page says when the engine refuses a text, for a tool with no words of its own for it. */
export const textRefusedSentence = 'The text could not be used. Check it and try again.';

/** What the page says when the engine refuses a drawing, for a tool with no words of its own for it. */
export const drawingRefusedSentence = 'The drawing could not be used. Clear it and draw again.';

/** What the page says when the engine refuses a picture, for a tool with no words of its own for it. */
export const pictureRefusedSentence = 'The picture could not be used. Choose another picture.';

/** What the page says when the engine refuses a new password, for a tool with no words of its own for it. It never holds the password. */
export const passwordRefusedSentence = 'The password could not be used. Go back to your file and type it again.';

/** The step after "… is too large to place on these pages.", for a tool with no words of its own for it. */
export const pictureTooLargeAdvice = 'Choose a smaller picture.';

/**
 * The one sentence for a failure: what happened, and the one thing to try, in the tool's own words where it has them.
 * `pictures` (the state's) names the chosen picture when the engine finds it too large; the worker's error carries nothing of it.
 * `page` (the state's `failedPage`) is the page a `page-too-large` failure names.
 */
export function failureSentence(
  kind: FailureKind,
  words: Pick<ToolWidgetWords, 'memoryAdvice' | 'zipLimitAdvice' | 'options' | 'pageTooLargeAction'>,
  choices: Choices = {},
  pictures: Readonly<Record<string, PictureEntry>> = {},
  page: number | null = null,
): string {
  if (kind === 'too-many-files' || kind === 'zip-too-large') {
    return zipLimitSentence(kind === 'too-many-files' ? 'files' : 'bytes', words.zipLimitAdvice ?? 'Try a smaller job.');
  }
  // PDF to JPG and PDF to PNG stop at maxOutputBytes (zip-limits.ts), so the tab is not ended.
  if (kind === 'too-many-pictures') return tooManyPicturesSentence();
  // Only a broken or crafted file reaches the drawing step's budget, so it fails the same on a computer: its own advice.
  if (kind === 'output-limit') return outputLimitSentence;
  if (kind === 'unsafe-page') return unsafePageSentence;
  // The worker sends the page with this kind; without one (never expected), the sentence names no page.
  if (kind === 'page-too-large') return pageTooLargeSentence(page ?? undefined, words.pageTooLargeAction);
  if (kind === 'too-damaged') return tooDamagedSentence;
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
  // The same for a picture: the first shown picture's own words, else the shared ones.
  if (kind === 'picture-refused') {
    const picture = shownOptions(words.options, choices).find((option): option is PictureOption => option.kind === 'picture');
    return picture?.refusedSentence ?? pictureRefusedSentence;
  }
  // The same for a new password: the first shown new password's own words, else the shared ones. Never the password itself.
  if (kind === 'password-refused') {
    const password = shownOptions(words.options, choices).find((option): option is NewPasswordOption => option.kind === 'new-password');
    return password?.refusedSentence ?? passwordRefusedSentence;
  }
  // The picture alone would pass the new file's size budget: named with its size from the page's own state.
  if (kind === 'picture-too-large') {
    const shown = shownOptions(words.options, choices).filter((option): option is PictureOption => option.kind === 'picture');
    const option = shown.find((each) => chosenPicture(each, pictures) !== undefined) ?? shown[0];
    const entry = option ? chosenPicture(option, pictures) : undefined;
    const advice = option?.tooLargeAdvice ?? pictureTooLargeAdvice;
    const said = entry ? `${entry.name} (${formatSize(entry.size)})` : 'The picture';
    return `${said} is too large to place on these pages. ${advice}`;
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
 * What the damaged notice says before its link to Repair PDF, until files can be handed over between tools in memory
 * (the owner's decision of 28 Nov 2026, "Plain link now"), and the link's words.
 */
export const repairSentence = 'Repair PDF may be able to recover it. On that page, choose the file again.';
export const repairLinkLabel = 'Go to Repair PDF';

/**
 * The heading, the one thing to try, and the words a screen reader hears, for a file that cannot be read:
 * damaged, or saved in a way the tool cannot read. The advice is the tool's own, from the registry; a tool
 * with none (the PDF tools) says the heading alone, as it always did. `repair` is true when the notice links to
 * Repair PDF (a damaged file, on a tool given its address): the sentence before the link is said last.
 */
export function unreadableNotice(
  name: string,
  status: 'damaged' | 'unsupported',
  words: Pick<ToolWidgetWords, 'damagedAdvice' | 'unsupportedAdvice'>,
  repair = false,
): { heading: string; advice?: string; repair?: string; announcement: string } {
  const heading = status === 'damaged' ? `${name} is damaged and cannot be read.` : `${name} is saved in a way this tool cannot read.`;
  const advice = status === 'damaged' ? words.damagedAdvice : words.unsupportedAdvice;
  const linked = repair && status === 'damaged' ? repairSentence : undefined;
  const announcement = [heading, advice, linked].filter(Boolean).join(' ');
  return { heading, ...(advice ? { advice } : {}), ...(linked ? { repair: linked } : {}), announcement };
}

/** The heading of the notice for a very large picture, with its pixels in millions, rounded down: "huge.png has 256 million pixels". */
export function pixelsHeading(name: string, pixels: number): string {
  return `${name} has ${number(Math.floor(pixels / 1_000_000))} million pixels`;
}

/** What the notice for a very large picture says under its heading. */
export const pixelsAdvice = 'Converting it may be slow, and a phone may run out of memory. You can still go ahead.';
