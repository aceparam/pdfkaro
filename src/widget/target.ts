// The page target size: a tool whose pages each set a size the result must fit (Compress to a target size). The
// rules and the fixed words are here, composed with the target's label, so the hold, the result headings and the
// byte rule are each decided in one place. Plain functions, tested in Node; no page and no engine reads this file
// but the widget. The targets themselves are in option-values.ts, which the engine reads too.

import type { ToolWidgetWords } from '../tools/registry';
import { formatSize, number, pageCount } from './format';
import { acceptedTarget, type SizeTarget } from './option-values';

/** The target a page sets, for a tool whose words declare one and whose preset names a known target; else undefined. */
export function pageTarget(words: Pick<ToolWidgetWords, 'sizeTarget'>, preset: Readonly<Record<string, unknown>> | undefined): SizeTarget | undefined {
  if (!words.sizeTarget || !preset || !Object.hasOwn(preset, 'target')) return undefined;
  return acceptedTarget(preset.target);
}

/** Whether a picked file is already at or under the target, so no job is started for it. Decided from its size alone. */
export const heldByTarget = (size: number, target: SizeTarget): boolean => size <= target.bytes;

/**
 * The one listed file, when it is held: at or under the target, and read far enough to know it can be opened or
 * needs a password. A held file needing a password is never asked for it. A damaged or unreadable file is not held:
 * the page's shared notice says why it cannot be used. While it is read, nothing is said yet.
 */
export function heldFile<File extends { size: number; status: string }>(files: readonly File[], target: SizeTarget | undefined): File | undefined {
  if (!target || files.length !== 1) return undefined;
  const file = files[0]!;
  return heldByTarget(file.size, target) && ['ready', 'needs-password', 'wrong-password'].includes(file.status) ? file : undefined;
}

/** Tied to the main button of a file already at or under the target. The name is shown as text by the page. */
export const heldSentence = (name: string, target: SizeTarget): string =>
  `${name} is already ${target.label} or smaller, so there is nothing to do here. You can use it as it is.`;

/** The result's heading when the new file is at or under the target. */
export const underHeading = (target: SizeTarget): string => `Your file is now ${target.label} or smaller`;

/** The result's heading when the smallest file made is still over the target. */
export const overHeading = (target: SizeTarget): string => `Your file is still over ${target.label}`;

/**
 * A size as the page shows it beside a target. A size over the target is written in bytes, with a thousands
 * separator, whenever the size `formatSize` would show, taken back to bytes in 1024s, is at most the label counted in
 * 1024s; so the page never says "over 1 MB" beside "1.0 MB" or "1016 KB". Otherwise, and for a size at or under the
 * target, `formatSize` decides.
 */
export function sizeAgainstTarget(bytes: number, target: SizeTarget): string {
  const shown = formatSize(bytes);
  if (bytes <= target.bytes) return shown;
  return shownBytes(bytes) <= target.binary ? `${number(bytes)} bytes` : shown;
}

/** The bytes the size `formatSize` shows stands for, in 1024s: "977 KB" is 1,000,448; "1.0 MB" is 1,048,576. */
function shownBytes(bytes: number): number {
  if (bytes < 1024) return bytes;
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) * 1024;
  if (bytes < 1024 * 1024 * 1024) return Number((bytes / (1024 * 1024)).toFixed(1)) * 1024 * 1024;
  return Number((bytes / (1024 * 1024 * 1024)).toFixed(1)) * 1024 * 1024 * 1024;
}

/**
 * The over-target result's words: the sentence naming the smallest file's size and the target, and the line under
 * its name, whose new size is the same text as the sentence's. When the old size would read the same as the new one,
 * both are said in bytes, so the difference shows.
 */
export function overResult(result: { size: number; was: number; pages?: number }, target: SizeTarget): { sentence: string; detail: string } {
  let size = sizeAgainstTarget(result.size, target);
  let was = formatSize(result.was);
  if (was === size) {
    size = `${number(result.size)} bytes`;
    was = `${number(result.was)} bytes`;
  }
  return {
    sentence: `The smallest file this tool could make is ${size}, which is over ${target.label}.`,
    detail: [size, `was ${was}`, result.pages ? pageCount(result.pages) : null].filter(Boolean).join(', '),
  };
}
