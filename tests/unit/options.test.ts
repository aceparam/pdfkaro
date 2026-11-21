import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { tools, type DrawingOption, type PictureOption, type TextOption, type ToolOption } from '../../src/tools/registry';
import {
  acceptedDrawing,
  acceptedText,
  acceptedValue,
  characterRules,
  cleanText,
  DrawingRefused,
  drawingRule,
  optionDrawings,
  optionTexts,
  optionValues,
  TextRefused,
  textProblem,
  textRule,
  type Drawing,
  type DrawingTable,
  type PictureTable,
  type TextRule,
} from '../../src/widget/option-values';
import {
  chosenPicture,
  chosenValue,
  drawnLines,
  enterAction,
  focusMovesToOptions,
  holdsUnderButton,
  jobOptions,
  largePictureAdvice,
  optionsHold,
  pictureLine,
  pictureNotice,
  picturePicked,
  pictureReadingSentence,
  pictureRereads,
  pictureSentence,
  picturesToReread,
  picturesToSend,
  rereadPicture,
  optionsShown,
  optionShown,
  optionsToSend,
  readyKey,
  shownOptions,
  ruleAdvice,
  textSentence,
  typedText,
} from '../../src/widget/options';
import { initialState, reducer, type Action, type PictureEntry, type State } from '../../src/widget/state';
import { ToolClient, type WorkerLike } from '../../src/workers/client';
import type { ToWorker } from '../../src/workers/messages';

const position: ToolOption = {
  kind: 'choice',
  key: 'position',
  legend: 'Where the numbers go',
  choices: [
    { value: 'bottom-centre', label: 'Bottom, in the middle' },
    { value: 'bottom-right', label: 'Bottom right' },
    { value: 'top-right', label: 'Top right' },
  ],
  initial: 'bottom-centre',
};
const start: ToolOption = { kind: 'choice', key: 'from', legend: 'Start at', choices: [{ value: 'one', label: 'Page 1' }, { value: 'two', label: 'Page 2' }], initial: 'one' };

describe('the value an option shows', () => {
  it('is the one chosen, when it is among the values', () => {
    expect(chosenValue(position, { position: 'top-right' })).toBe('top-right');
  });

  it('is the starting value with nothing chosen, an unknown value, or a value kept from another key', () => {
    expect(chosenValue(position, {})).toBe('bottom-centre');
    expect(chosenValue(position, { position: 'middle' })).toBe('bottom-centre');
    expect(chosenValue(position, { from: 'top-right' })).toBe('bottom-centre');
  });

  it('never reads an inherited key', () => {
    const inherits = { ...position, key: 'toString', choices: [...position.choices, { value: Object.prototype.toString as unknown as string, label: 'x' }] };
    expect(chosenValue(inherits, {})).toBe('bottom-centre');
  });
});

describe('what the engine is sent for the options', () => {
  it('is every option by its key, at its start when nothing is chosen', () => {
    expect(optionsToSend([position, start], {})).toEqual({ position: 'bottom-centre', from: 'one' });
    expect(optionsToSend([position, start], { from: 'two', position: 'nowhere' })).toEqual({ position: 'bottom-centre', from: 'two' });
  });

  it('is nothing for a tool with no options', () => {
    expect(optionsToSend(undefined, { position: 'top-right' })).toEqual({});
    expect(optionsToSend([], {})).toEqual({});
  });

  it('comes after the preset and what the items say', () => {
    expect(jobOptions({ format: 'jpg' }, { marks: [2] }, [position], { position: 'top-right' })).toEqual({ format: 'jpg', marks: [2], position: 'top-right' });
    // A tool with no options is sent what it was sent before.
    expect(jobOptions({ format: 'jpg' }, {}, undefined, {})).toEqual({ format: 'jpg' });
    expect(jobOptions(undefined, { order: [2, 1] }, undefined, {})).toEqual({ order: [2, 1] });
  });
});

describe('a test entry with a choice', () => {
  class FakeWorker implements WorkerLike {
    sent: ToWorker[] = [];
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    postMessage(message: ToWorker) {
      this.sent.push(message);
    }
    terminate() {}
  }

  it("reaches the worker's start message with the job", async () => {
    const workers: FakeWorker[] = [];
    const client = new ToolClient('test-options', () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const state = [
      { type: 'added', files: [{ id: 'a', name: 'a.pdf', size: 10 }] },
      { type: 'inspected', id: 'a', outcome: { kind: 'ready', pages: 2 } },
      { type: 'option-set', key: 'position', value: 'top-right' },
    ].reduce((now, action) => reducer(now, action as Action), initialState);
    const job = client.run([new File(['%PDF-1.7'], 'a.pdf')], [undefined], jobOptions(undefined, {}, [position], state.choices), () => {});
    const sent = workers[0]!.sent[0]!;
    expect(sent.type).toBe('run');
    expect(sent.type === 'run' && sent.options).toEqual({ position: 'top-right' });
    client.end();
    await expect(job).rejects.toMatchObject({ kind: 'cancelled' });
  });
});

describe('the accepted values of an option', () => {
  const values = { 'test-options': { position: ['bottom-centre', 'bottom-right', 'top-right'] } };

  it("lists Add page numbers' six places, and no other tool", () => {
    expect(optionValues).toEqual({ 'add-page-numbers': { position: ['bottom-left', 'bottom-centre', 'bottom-right', 'top-left', 'top-centre', 'top-right'] } });
    expect(acceptedValue('add-page-numbers', 'position', 'top-left')).toBe('top-left');
    expect(acceptedValue('add-page-numbers', 'position', 'Top left')).toBeUndefined();
    expect(acceptedValue('test-options', 'position', 'top-right')).toBeUndefined();
  });

  it('takes a listed value', () => {
    expect(acceptedValue('test-options', 'position', 'top-right', values)).toBe('top-right');
  });

  it('refuses an unlisted value, a number, no value, and another tool or key', () => {
    expect(acceptedValue('test-options', 'position', 'middle', values)).toBeUndefined();
    expect(acceptedValue('test-options', 'position', 3, values)).toBeUndefined();
    expect(acceptedValue('test-options', 'position', undefined, values)).toBeUndefined();
    expect(acceptedValue('test-options', 'position', ['top-right'], values)).toBeUndefined();
    expect(acceptedValue('merge-pdf', 'position', 'top-right', values)).toBeUndefined();
    expect(acceptedValue('test-options', 'size', 'top-right', values)).toBeUndefined();
  });

  it('never takes an inherited key for a tool or an option', () => {
    expect(acceptedValue('__proto__', 'position', 'top-right', values)).toBeUndefined();
    expect(acceptedValue('toString', 'position', 'top-right', values)).toBeUndefined();
    expect(acceptedValue('test-options', '__proto__', 'top-right', values)).toBeUndefined();
    expect(acceptedValue('test-options', 'toString', 'top-right', values)).toBeUndefined();
    expect(acceptedValue('test-options', 'position', 'toString', values)).toBeUndefined();
    expect(acceptedValue('test-options', 'position', '__proto__', values)).toBeUndefined();
  });
});

describe('when the options are shown, and where focus goes', () => {
  const play = (...actions: Action[]): State => actions.reduce(reducer, initialState);
  const add = (id: string): Action => ({ type: 'added', files: [{ id, name: `${id}.pdf`, size: 10 }] });
  const ready = (id: string): Action => ({ type: 'inspected', id, outcome: { kind: 'ready', pages: 2 } });

  it('shows them once every file has been read, while listing', () => {
    expect(optionsShown(play(add('a'), ready('a')))).toBe(true);
    expect(optionsShown(initialState)).toBe(false);
  });

  it('hides them while a file is read, for a password, while one is tried, and for a damaged or unsupported file', () => {
    expect(optionsShown(play(add('a')))).toBe(false);
    const asked = play(add('a'), { type: 'inspected', id: 'a', outcome: { kind: 'needs-password' } });
    expect(optionsShown(asked)).toBe(false);
    expect(optionsShown(reducer(asked, { type: 'reading-again', id: 'a' }))).toBe(false);
    expect(optionsShown(play(add('a'), { type: 'inspected', id: 'a', outcome: { kind: 'wrong-password' } }))).toBe(false);
    expect(optionsShown(play(add('a'), { type: 'inspected', id: 'a', outcome: { kind: 'damaged' } }))).toBe(false);
    expect(optionsShown(play(add('a'), { type: 'inspected', id: 'a', outcome: { kind: 'unsupported' } }))).toBe(false);
    // A second file still being read hides them again.
    expect(optionsShown(play(add('a'), ready('a'), add('b')))).toBe(false);
  });

  it('hides them during the job, on a failure and on the result', () => {
    const working = play(add('a'), ready('a'), { type: 'started' });
    expect(optionsShown(working)).toBe(false);
    expect(optionsShown(reducer(working, { type: 'failed', failure: 'engine' }))).toBe(false);
    expect(optionsShown(reducer(working, { type: 'finished', result: { name: 'a.pdf', size: 1 } }))).toBe(false);
    expect(optionsShown(reducer(working, { type: 'back-to-files' }))).toBe(true);
  });

  it('moves focus once per set of files read, in a tool with options, if focus is still free', () => {
    const read = readyKey(play(add('a'), ready('a')));
    expect(read).toBe('a');
    expect(focusMovesToOptions(true, read, '', true)).toBe(true);
    // The visitor went elsewhere while the file was read.
    expect(focusMovesToOptions(true, read, '', false)).toBe(false);
    // A tool with no options keeps today's focus.
    expect(focusMovesToOptions(false, read, '', true)).toBe(false);
    // Not while reading.
    expect(focusMovesToOptions(true, readyKey(play(add('a'))), '', true)).toBe(false);
  });

  it('does not move focus again after Cancel or going back, but does for a replaced file', () => {
    const read = play(add('a'), ready('a'));
    const before = readyKey(read);
    const working = reducer(read, { type: 'started' });
    expect(readyKey(working)).toBe(before);
    const cancelled = reducer(working, { type: 'back-to-files' });
    expect(readyKey(cancelled)).toBe(before);
    expect(focusMovesToOptions(true, readyKey(cancelled), before, true)).toBe(false);
    const replaced = [add('b'), { type: 'removed', id: 'a' } as Action, ready('b')].reduce(reducer, read);
    expect(focusMovesToOptions(true, readyKey(replaced), before, true)).toBe(true);
  });
});

const watermark: TextOption = {
  kind: 'text',
  key: 'text',
  label: 'Watermark text',
  hint: 'Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.',
  emptySentence: 'Type the watermark text first.',
};
const rule: TextRule = { maxLength: 50, characters: 'standard-font' };
const table = { 'test-text': { text: rule } };
const advice = 'Use letters from English and other Western European languages, numbers and common marks.';
const at = (point: number) => String.fromCodePoint(point);

describe('cleaning a text', () => {
  it('composes accents typed as their own mark', () => {
    const separate = 'Cafe\u0301';
    expect([...separate]).toHaveLength(5);
    expect(cleanText(separate)).toBe('Café');
    expect([...cleanText(separate)]).toHaveLength(4);
  });

  it('trims spaces and no-break spaces at both ends, and keeps spaces inside as typed', () => {
    expect(cleanText('  Draft copy  ')).toBe('Draft copy');
    expect(cleanText('\u00a0Draft\u00a0')).toBe('Draft');
    expect(cleanText('Draft   copy')).toBe('Draft   copy');
    expect(cleanText('   ')).toBe('');
  });
});

describe('the standard fonts\' characters', () => {
  const takes = characterRules['standard-font'];

  it('are the 217 of Windows Western, less the soft hyphen', () => {
    expect(takes.size).toBe(217);
    expect(takes.has(0xad)).toBe(false);
    for (const character of ['a', 'Z', '0', ' ', '~', '\u00a0', 'é', 'ÿ', '€', '“', '—', '™', 'Œ', 'Ÿ']) expect(takes.has(character.codePointAt(0) ?? -1), character).toBe(true);
  });

  it('are each drawn by pdf-lib\'s standard Helvetica, Helvetica Bold, Times and Courier as itself, not as a question mark', async () => {
    const document = await PDFDocument.create();
    const fonts = await Promise.all([StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.TimesRoman, StandardFonts.Courier].map((font) => document.embedFont(font)));
    expect(fonts.map((font) => font.name)).toEqual(['Helvetica', 'Helvetica-Bold', 'Times-Roman', 'Courier']);
    for (const font of fonts) {
      for (const point of takes) {
        const character = at(point);
        const code = font.encodeText(character).toString();
        if (character !== '?') expect(code, `${font.name} U+${point.toString(16)}`).not.toBe('<3F>');
        if (point !== 0x20 && point !== 0xa0) expect(font.widthOfTextAtSize(character, 10), `${font.name} U+${point.toString(16)}`).toBeGreaterThan(0);
      }
    }
  });

  it('do not include what the fonts draw as a question mark', async () => {
    // The experiment the rule rests on: pdf-lib draws a character outside its encoding as "?" without a word.
    const helvetica = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(helvetica.encodeText('Ł').toString()).toBe('<3F>');
    for (const character of ['न', 'త', 'م', '中', 'Ł', 'ő', 'ğ', '😀', '\t', '\u00ad', '\u202e', '\u200b', '\n']) {
      expect(takes.has(character.codePointAt(0) ?? -1), character).toBe(false);
    }
  });
});

describe('what is wrong with a text', () => {
  it('is nothing for a text the rule takes, up to the limit', () => {
    expect(textProblem('Draft copy', rule)).toBeNull();
    expect(textProblem('x'.repeat(50), rule)).toBeNull();
    expect(textProblem(cleanText('Cafe\u0301'), rule)).toBeNull();
    expect(textProblem('Ça coûte 5 € — “déjà vu”', rule)).toBeNull();
  });

  it('is empty for no text, or only spaces once cleaned', () => {
    expect(textProblem('', rule)).toEqual({ kind: 'empty' });
    expect(textProblem(cleanText('   '), rule)).toEqual({ kind: 'empty' });
  });

  it('is too long past the limit, counted by character', () => {
    expect(textProblem('x'.repeat(51), rule)).toEqual({ kind: 'too-long', length: 51 });
    expect(textProblem('é'.repeat(63), rule)).toEqual({ kind: 'too-long', length: 63 });
  });

  it('names each refused character once, in the order typed', () => {
    expect(textProblem('Łódź', rule)).toEqual({ kind: 'characters', refused: ['Ł', 'ź'] });
    expect(textProblem('ŁŁŁ ź Ł', rule)).toEqual({ kind: 'characters', refused: ['Ł', 'ź'] });
    expect(textProblem('a😀b', rule)).toEqual({ kind: 'characters', refused: ['😀'] });
    expect(textProblem('a\tb', rule)).toEqual({ kind: 'characters', refused: ['\t'] });
    expect(textProblem('co\u00adop', rule)).toEqual({ kind: 'characters', refused: ['\u00ad'] });
    expect(textProblem('ab\u202ecd', rule)).toEqual({ kind: 'characters', refused: ['\u202e'] });
    for (const text of ['नमस्ते', 'తెలుగు', 'مرحبا', '中文']) expect(textProblem(text, rule)?.kind, text).toBe('characters');
  });

  it('counts an emoji as one character, and says characters before length', () => {
    expect(textProblem('😀'.repeat(50), rule)).toEqual({ kind: 'characters', refused: ['😀'] });
    expect(textProblem('नमस्ते '.repeat(20), rule)?.kind).toBe('characters');
  });
});

describe('a tool\'s own rule for a text, and what its engine takes', () => {
  it('lists Watermark only, 50 characters of the standard fonts', () => {
    expect(optionTexts).toEqual({ 'watermark-pdf': { text: { maxLength: 50, characters: 'standard-font' } } });
    expect(textRule('watermark-pdf', 'text')).toEqual({ maxLength: 50, characters: 'standard-font' });
    expect(acceptedText('watermark-pdf', 'text', '  Draft ')).toBe('Draft');
    expect(textRule('test-text', 'text')).toBeUndefined();
    expect(acceptedText('test-text', 'text', 'Draft')).toBeUndefined();
  });

  it('finds the rule by tool and key, own keys only', () => {
    expect(textRule('test-text', 'text', table)).toEqual(rule);
    expect(textRule('test-text', 'other', table)).toBeUndefined();
    expect(textRule('merge-pdf', 'text', table)).toBeUndefined();
    expect(textRule('__proto__', 'text', table)).toBeUndefined();
    expect(textRule('toString', 'text', table)).toBeUndefined();
    expect(textRule('test-text', '__proto__', table)).toBeUndefined();
    expect(textRule('test-text', 'toString', table)).toBeUndefined();
  });

  it('takes a good text, cleaned', () => {
    expect(acceptedText('test-text', 'text', '  Draft copy ', table)).toBe('Draft copy');
    expect(acceptedText('test-text', 'text', 'Cafe\u0301', table)).toBe('Café');
  });

  it('refuses what is not a string, empty, only spaces, too long, a refused character, or another tool or key', () => {
    for (const value of [3, null, undefined, ['Draft'], { text: 'Draft' }, '', '   ', 'x'.repeat(51), 'Łódź', 'a\u202eb']) {
      expect(acceptedText('test-text', 'text', value, table), String(value)).toBeUndefined();
    }
    expect(acceptedText('test-text', '__proto__', 'Draft', table)).toBeUndefined();
    expect(acceptedText('toString', 'text', 'Draft', table)).toBeUndefined();
  });

  it('refuses with an error known by its name, which never holds the text', () => {
    const refused = new TextRefused();
    expect(refused).toBeInstanceOf(Error);
    expect(refused.name).toBe('TextRefused');
    expect(refused.message).not.toMatch(/Draft/);
    expect(String(refused)).toBe('TextRefused: The text was refused.');
  });
});

describe('a text in the widget', () => {
  it('shows the text exactly as typed, or nothing', () => {
    expect(typedText(watermark, {})).toBe('');
    expect(typedText(watermark, { text: ' Draft ' })).toBe(' Draft ');
    expect(typedText({ ...watermark, key: 'toString' }, {})).toBe('');
  });

  it('is sent cleaned, beside a choice', () => {
    expect(optionsToSend([position, watermark], { text: ' Cafe\u0301 copy ', position: 'top-right' })).toEqual({ position: 'top-right', text: 'Café copy' });
    expect(jobOptions({ format: 'jpg' }, {}, [watermark], { text: ' Draft ' })).toEqual({ format: 'jpg', text: 'Draft' });
  });

  it('says what is wrong in one sentence: refused characters named when one to three Latin letters', () => {
    const characters = (refused: string[]) => textSentence(watermark, rule, { kind: 'characters', refused });
    expect(ruleAdvice['standard-font']).toBe(advice);
    // The rule is said by the hint under the field, so the sentence does not repeat it.
    expect(characters(['Ł'])).not.toContain(advice);
    expect(characters(['Ł'])).toBe(`Ł cannot be used.`);
    expect(characters(['Ł', 'ź'])).toBe(`Ł and ź cannot be used.`);
    expect(characters(['Ł', 'ź', 'ő'])).toBe(`Ł, ź and ő cannot be used.`);
    expect(characters(['ğ', 'Ǆ'])).toBe(`ğ and Ǆ cannot be used.`);
  });

  it('never names a refused character that looks like one the rule takes, or any number, mark or symbol', () => {
    const some = 'Some characters cannot be used.';
    const characters = (refused: string[]) => textSentence(watermark, rule, { kind: 'characters', refused });
    // U+2010 hyphen, U+2011 no-break hyphen, U+2212 minus, U+2215 division slash, fullwidth "!" and "A", a modifier apostrophe.
    for (const character of ['\u2010', '\u2011', '\u2212', '\u2215', '\uff01', '\uff21', '\u02bc', '≠', '½', '٣']) {
      expect(characters([character]), `U+${(character.codePointAt(0) ?? 0).toString(16)}`).toBe(some);
    }
    // One lookalike among Latin letters sends the whole list to the plain sentence.
    expect(characters(['Ł', '\u2212'])).toBe(some);
  });

  it('says "Some characters cannot be used." with no list for four or more, another script, an emoji, or anything invisible', () => {
    const some = 'Some characters cannot be used.';
    const characters = (text: string) => {
      const problem = textProblem(text, rule);
      return problem ? textSentence(watermark, rule, problem) : '';
    };
    expect(characters('ŁźőĞ')).toBe(some);
    for (const text of ['नमस्ते', 'مرحبا', '中文', 'తెలుగు', 'Łódź नम', 'a😀', 'a\tb', 'a\u202eb', 'a\u200bb', 'co\u00adop', 'e\u0301\u0301']) {
      expect(characters(text), text).toBe(some);
    }
  });

  it('gives the numbers for a text too long, written as numbers are on the page', () => {
    expect(textSentence(watermark, rule, { kind: 'too-long', length: 63 })).toBe('This text has 63 characters. Use 50 or fewer.');
    expect(textSentence(watermark, { maxLength: 200, characters: 'standard-font' }, { kind: 'too-long', length: 1204 })).toBe('This text has 1,204 characters. Use 200 or fewer.');
  });

  it("gives the tool's own sentence for an empty text", () => {
    expect(textSentence(watermark, rule, { kind: 'empty' })).toBe('Type the watermark text first.');
  });

  it('holds the main button while the first text has a problem, and never for a choice', () => {
    expect(optionsHold('test-text', [position], {}, table)).toBeNull();
    expect(optionsHold('test-text', undefined, {}, table)).toBeNull();
    expect(optionsHold('test-text', [position, watermark], {}, table)).toEqual({ key: 'text', kind: 'empty', sentence: 'Type the watermark text first.' });
    expect(optionsHold('test-text', [watermark], { text: '   ' }, table)?.kind).toBe('empty');
    expect(optionsHold('test-text', [watermark], { text: 'Łódź' }, table)).toEqual({ key: 'text', kind: 'characters', sentence: `Ł and ź cannot be used.` });
    expect(optionsHold('test-text', [watermark], { text: 'x'.repeat(63) }, table)).toEqual({ key: 'text', kind: 'too-long', sentence: 'This text has 63 characters. Use 50 or fewer.' });
    expect(optionsHold('test-text', [watermark], { text: ' Draft copy ' }, table)).toBeNull();
  });

  it('holds with the empty sentence for a text with no rule, so a text is never sent unchecked', () => {
    expect(optionsHold('test-text', [watermark], { text: 'Draft' }, {})).toEqual({ key: 'text', kind: 'empty', sentence: 'Type the watermark text first.' });
    expect(optionsHold('test-text', [watermark], { text: 'Draft' })).toEqual({ key: 'text', kind: 'empty', sentence: 'Type the watermark text first.' });
  });

  it("reaches the real ToolClient's run message cleaned, set through the reducer, with a fake worker", async () => {
    class FakeWorker implements WorkerLike {
      sent: ToWorker[] = [];
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      postMessage(message: ToWorker) {
        this.sent.push(message);
      }
      terminate() {}
    }
    const workers: FakeWorker[] = [];
    const client = new ToolClient('test-text', () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const state = [
      { type: 'added', files: [{ id: 'a', name: 'a.pdf', size: 10 }] },
      { type: 'inspected', id: 'a', outcome: { kind: 'ready', pages: 2 } },
      { type: 'option-set', key: 'text', value: '  Cafe\u0301 copy ' },
    ].reduce((now, action) => reducer(now, action as Action), initialState);
    expect(state.choices).toEqual({ text: '  Cafe\u0301 copy ' });
    expect(optionsHold('test-text', [watermark], state.choices, table)).toBeNull();
    const job = client.run([new File(['%PDF-1.7'], 'a.pdf')], [undefined], jobOptions(undefined, {}, [watermark], state.choices), () => {});
    const sent = workers[0]?.sent[0];
    expect(sent?.type).toBe('run');
    expect(sent?.type === 'run' && sent.options).toEqual({ text: 'Café copy' });
    client.end();
    await expect(job).rejects.toMatchObject({ kind: 'cancelled' });
  });
});

describe('Enter in a text field', () => {
  it('starts the job when the main button works', () => {
    expect(enterAction(true, ['Type the watermark text first.'])).toEqual({ kind: 'start' });
  });

  it('says why the main button waits when it does: the sentence tied to it first, then the field\'s own', () => {
    expect(enterAction(false, ['Type the watermark text first.', undefined])).toEqual({ kind: 'say', sentence: 'Type the watermark text first.' });
    expect(enterAction(false, [null, 'Ł and ź cannot be used.'])).toEqual({ kind: 'say', sentence: 'Ł and ź cannot be used.' });
    expect(enterAction(false, [null, 'This text has 63 characters. Use 50 or fewer.'])).toEqual({ kind: 'say', sentence: 'This text has 63 characters. Use 50 or fewer.' });
  });

  it('does nothing when the button waits with no sentence', () => {
    expect(enterAction(false, [null, undefined, ''])).toEqual({ kind: 'nothing' });
  });
});

describe('options shown for one choice', () => {
  const way: ToolOption = { kind: 'choice', key: 'way', legend: 'How', choices: [{ value: 'a', label: 'Way a' }, { value: 'b', label: 'Way b' }], initial: 'a' };
  const forA: TextOption = { ...watermark, key: 'textA', label: 'Text for a', emptySentence: 'Type the text for a first.', when: { key: 'way', value: 'a' } };
  const forB: TextOption = { ...watermark, key: 'textB', label: 'Text for b', emptySentence: 'Type the text for b first.', when: { key: 'way', value: 'b' } };
  const size: ToolOption = { kind: 'choice', key: 'size', legend: 'Size', choices: [{ value: 'small', label: 'Small' }, { value: 'large', label: 'Large' }], initial: 'small' };
  const options: ToolOption[] = [way, forA, forB, size];
  const texts = { 'test-when': { textA: rule, textB: rule } };
  const keys = (shown: readonly ToolOption[]) => shown.map((option) => option.key);

  it('shows the choice, the text for its start and the option with no condition, at the start', () => {
    expect(keys(shownOptions(options, {}))).toEqual(['way', 'textA', 'size']);
    expect(optionShown(forB, options, {})).toBe(false);
    expect(optionShown(way, options, {})).toBe(true);
  });

  it('shows the text for "b" in place of the text for "a" once "b" is chosen, in registry order', () => {
    expect(keys(shownOptions(options, { way: 'b' }))).toEqual(['way', 'textB', 'size']);
    expect(keys(shownOptions(options, { way: 'b', textA: 'Kept' }))).toEqual(['way', 'textB', 'size']);
  });

  it('reads an unknown stored value as the choice\'s start', () => {
    expect(keys(shownOptions(options, { way: 'c' }))).toEqual(['way', 'textA', 'size']);
  });

  it('hides an option whose condition names no choice, or names a text', () => {
    const lost: TextOption = { ...forA, when: { key: 'nothing', value: 'a' } };
    expect(optionShown(lost, [way, lost], {})).toBe(false);
    const onText: TextOption = { ...forB, when: { key: 'textA', value: 'a' } };
    expect(optionShown(onText, [way, forA, onText], { textA: 'a' })).toBe(false);
    expect(shownOptions(undefined, {})).toEqual([]);
  });

  it('sends the choice, the text shown and the option with no condition, and no key for the hidden text', () => {
    expect(optionsToSend(options, { textA: ' Signed ', textB: 'Initials' })).toEqual({ way: 'a', textA: 'Signed', size: 'small' });
    const sent = optionsToSend(options, { way: 'b', textA: 'Signed', textB: ' Initials ' });
    expect(sent).toEqual({ way: 'b', textB: 'Initials', size: 'small' });
    expect(Object.hasOwn(sent, 'textA')).toBe(false);
  });

  it('is held only by the text shown: never by a hidden empty text', () => {
    expect(optionsHold('test-when', options, {}, texts)).toEqual({ key: 'textA', kind: 'empty', sentence: 'Type the text for a first.' });
    expect(optionsHold('test-when', options, { textA: 'Signed' }, texts)).toBeNull();
    expect(optionsHold('test-when', options, { way: 'b', textA: 'Signed' }, texts)).toEqual({ key: 'textB', kind: 'empty', sentence: 'Type the text for b first.' });
    expect(optionsHold('test-when', options, { way: 'b', textB: 'Initials' }, texts)).toBeNull();
    expect(optionsHold('test-when', options, { way: 'b', textA: 'Łódź', textB: 'Initials' }, texts)).toBeNull();
  });

  it('changes nothing for a tool with no conditions: Add page numbers and Watermark', () => {
    for (const id of ['add-page-numbers', 'watermark-pdf']) {
      const tool = tools.find((each) => each.id === id);
      const own = tool?.widget?.options;
      expect(own, id).toBeDefined();
      if (own === undefined) continue;
      expect(own.some((option) => option.when !== undefined), id).toBe(false);
      expect(shownOptions(own, {}), id).toEqual(own);
      expect(shownOptions(own, { position: 'top-right', text: 'Draft' }), id).toEqual(own);
    }
    expect(optionsToSend([position, watermark], { text: ' Draft ', position: 'top-right' })).toEqual({ position: 'top-right', text: 'Draft' });
    expect(optionsHold('test-text', [position, watermark], {}, table)).toEqual({ key: 'text', kind: 'empty', sentence: 'Type the watermark text first.' });
  });

  it("reaches the real ToolClient's run message with the hidden text's key absent, set through the reducer, with a fake worker", async () => {
    class FakeWorker implements WorkerLike {
      sent: ToWorker[] = [];
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      postMessage(message: ToWorker) {
        this.sent.push(message);
      }
      terminate() {}
    }
    const workers: FakeWorker[] = [];
    const client = new ToolClient('test-when', () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const state = [
      { type: 'added', files: [{ id: 'a', name: 'a.pdf', size: 10 }] },
      { type: 'inspected', id: 'a', outcome: { kind: 'ready', pages: 2 } },
      { type: 'option-set', key: 'textA', value: 'Signed' },
      { type: 'option-set', key: 'way', value: 'b' },
      { type: 'option-set', key: 'textB', value: ' Initials ' },
    ].reduce((now, action) => reducer(now, action as Action), initialState);
    expect(state.choices).toEqual({ textA: 'Signed', way: 'b', textB: ' Initials ' });
    expect(optionsHold('test-when', options, state.choices, texts)).toBeNull();
    const job = client.run([new File(['%PDF-1.7'], 'a.pdf')], [undefined], jobOptions({ format: 'pdf' }, {}, options, state.choices), () => {});
    const sent = workers[0]?.sent[0];
    expect(sent?.type).toBe('run');
    const sentOptions = sent?.type === 'run' ? sent.options : undefined;
    expect(sentOptions).toEqual({ format: 'pdf', way: 'b', textB: 'Initials', size: 'small' });
    expect(sentOptions !== undefined && Object.hasOwn(sentOptions, 'textA')).toBe(false);
    client.end();
    await expect(job).rejects.toMatchObject({ kind: 'cancelled' });
  });
});

describe('a drawing: what its engine takes', () => {
  const table: DrawingTable = { 'test-drawing': { drawing: { maxLines: 3, maxPoints: 6 } } };
  const take = (value: unknown) => acceptedDrawing('test-drawing', 'drawing', value, table);
  const good: Drawing = [
    [0, 0, 1000, 400],
    [500, 200],
  ];

  it('has no tool yet, and reads a rule by own keys only', () => {
    expect(optionDrawings).toEqual({});
    expect(drawingRule('test-drawing', 'drawing', table)).toEqual({ maxLines: 3, maxPoints: 6 });
    expect(drawingRule('test-drawing', 'other', table)).toBeUndefined();
    expect(drawingRule('test-drawing', 'drawing')).toBeUndefined();
    for (const key of ['__proto__', 'toString', 'constructor']) {
      expect(drawingRule('test-drawing', key, table)).toBeUndefined();
      expect(drawingRule(key, 'drawing', table)).toBeUndefined();
      expect(acceptedDrawing(key, 'drawing', good, table)).toBeUndefined();
      expect(acceptedDrawing('test-drawing', key, good, table)).toBeUndefined();
    }
  });

  it('takes a drawing within the box and the limits, as it was sent', () => {
    expect(take(good)).toBe(good);
    expect(take([[0, 0]])).toEqual([[0, 0]]);
    expect(take([[1000, 400, 0, 0], [1, 1, 2, 2], [3, 3, 4, 4]])).toBeTruthy();
  });

  it('refuses what is not a list of lines, or no lines', () => {
    for (const value of [undefined, null, 5, 'lines', {}, { length: 1, 0: [0, 0] }, [], new Set([[0, 0]])]) expect(take(value), String(value)).toBeUndefined();
  });

  it('refuses a line with an odd count or no points, or a line that is not a plain list', () => {
    expect(take([[0, 0, 5]])).toBeUndefined();
    expect(take([[]])).toBeUndefined();
    expect(take([[0, 0], 7])).toBeUndefined();
    expect(take([[0, 0], null])).toBeUndefined();
    expect(take([new Int32Array([0, 0])])).toBeUndefined();
    expect(take([new Float64Array([0, 0, 1, 1])])).toBeUndefined();
    expect(take([{ length: 2, 0: 0, 1: 0 }])).toBeUndefined();
  });

  it('refuses a hole, and any value that is not a whole number: 1.5, NaN, Infinity, "5", null', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(take([[0, , 1, 1]])).toBeUndefined();
    for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '5', null, undefined, true, 5n, {}, [5]]) {
      expect(take([[0, 0, value, 10]]), String(value)).toBeUndefined();
      expect(take([[0, 0, 10, value]]), String(value)).toBeUndefined();
    }
  });

  it('refuses a point outside the box: -1, 1,001 across, 401 down', () => {
    expect(take([[-1, 0]])).toBeUndefined();
    expect(take([[0, -1]])).toBeUndefined();
    expect(take([[1001, 0]])).toBeUndefined();
    expect(take([[0, 401]])).toBeUndefined();
    // 401 is fine across, 1,000 is not down.
    expect(take([[401, 400]])).toBeTruthy();
    expect(take([[0, 1000]])).toBeUndefined();
  });

  it('refuses one line too many, or one point too many in all', () => {
    expect(take([[0, 0], [1, 1], [2, 2], [3, 3]])).toBeUndefined();
    expect(take([[0, 0, 1, 1, 2, 2, 3, 3], [4, 4, 5, 5, 6, 6]])).toBeUndefined();
    expect(take([[0, 0, 1, 1, 2, 2, 3, 3], [4, 4, 5, 5]])).toBeTruthy();
  });

  it('refuses too many lines or points before it reads any point', () => {
    let read = 0;
    const counted = (length: number) =>
      new Proxy(Array.from({ length }, () => 0), {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/.test(key)) read += 1;
          return Reflect.get(target, key, receiver);
        },
      });
    expect(take([counted(2), counted(2), counted(2), counted(2)])).toBeUndefined();
    expect(take([counted(8), counted(6)])).toBeUndefined();
    expect(read).toBe(0);
    // A huge line is refused on its length alone.
    expect(take([counted(1_000_000)])).toBeUndefined();
    expect(read).toBe(0);
  });

  it('is refused with DrawingRefused, whose message never holds the drawing', () => {
    const refused = new DrawingRefused();
    expect(refused).toBeInstanceOf(Error);
    expect(refused.name).toBe('DrawingRefused');
    expect(refused.message).toBe('The drawing was refused.');
    expect(String(refused)).toBe('DrawingRefused: The drawing was refused.');
  });
});

describe('a drawing in the widget', () => {
  const way: ToolOption = { kind: 'choice', key: 'way', legend: 'How', choices: [{ value: 'draw', label: 'Draw it' }, { value: 'type', label: 'Type it' }], initial: 'draw' };
  const drawing: DrawingOption = {
    kind: 'drawing',
    key: 'drawing',
    label: 'Draw your signature',
    hint: 'Draw with a finger, a mouse or a pen. To use a keyboard, type your name instead.',
    clearLabel: 'Clear the drawing',
    emptySentence: 'Draw your signature first.',
    when: { key: 'way', value: 'draw' },
  };
  const table: DrawingTable = { 'test-drawing': { drawing: { maxLines: 50, maxPoints: 5000 } } };
  const lines: Drawing = [[10, 20, 30, 40], [500, 200]];

  it('shows its lines, or none; a string under its key is never taken for a drawing', () => {
    expect(drawnLines(drawing, {})).toEqual([]);
    expect(drawnLines(drawing, { drawing: lines })).toBe(lines);
    expect(drawnLines(drawing, { drawing: 'lines' })).toEqual([]);
    expect(drawnLines({ ...drawing, key: 'toString' }, {})).toEqual([]);
    // Nor is a drawing taken for a choice's value or a text.
    expect(chosenValue(way as Extract<ToolOption, { kind: 'choice' }>, { way: lines })).toBe('draw');
    expect(typedText(watermark, { text: lines })).toBe('');
  });

  it('is sent as its lines while shown, and not at all while hidden', () => {
    expect(optionsToSend([way, drawing], { drawing: lines })).toEqual({ way: 'draw', drawing: lines });
    expect(optionsToSend([way, drawing], {})).toEqual({ way: 'draw', drawing: [] });
    expect(optionsToSend([way, drawing], { way: 'type', drawing: lines })).toEqual({ way: 'type' });
    expect(jobOptions({ format: 'jpg' }, {}, [way, drawing], { drawing: lines })).toEqual({ format: 'jpg', way: 'draw', drawing: lines });
  });

  it('holds the main button while shown and empty, with its sentence; not while hidden or drawn', () => {
    const empty = { key: 'drawing', kind: 'empty', sentence: 'Draw your signature first.' };
    expect(optionsHold('test-drawing', [way, drawing], {}, {}, table)).toEqual(empty);
    expect(optionsHold('test-drawing', [way, drawing], { drawing: [] }, {}, table)).toEqual(empty);
    expect(optionsHold('test-drawing', [way, drawing], { drawing: lines }, {}, table)).toBeNull();
    expect(optionsHold('test-drawing', [way, drawing], { way: 'type' }, {}, table)).toBeNull();
  });

  it('holds with the empty sentence for a drawing with no rule, so a drawing is never sent unchecked', () => {
    expect(optionsHold('test-drawing', [way, drawing], { drawing: lines }, {}, {})?.sentence).toBe('Draw your signature first.');
    expect(optionsHold('test-drawing', [way, drawing], { drawing: lines })?.sentence).toBe('Draw your signature first.');
  });

  it('holds for the first in registry order, a text before a drawing or a drawing before a text', () => {
    const texts = { 'test-drawing': { text: rule } };
    expect(optionsHold('test-drawing', [way, watermark, drawing], {}, texts, table)?.key).toBe('text');
    expect(optionsHold('test-drawing', [way, drawing, watermark], {}, texts, table)?.key).toBe('drawing');
    expect(optionsHold('test-drawing', [way, drawing, watermark], { drawing: lines }, texts, table)?.key).toBe('text');
  });

  it("reaches the real ToolClient's run message unchanged, set through the reducer, with a fake worker", async () => {
    class FakeWorker implements WorkerLike {
      sent: ToWorker[] = [];
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      postMessage(message: ToWorker) {
        this.sent.push(message);
      }
      terminate() {}
    }
    const workers: FakeWorker[] = [];
    const client = new ToolClient('test-drawing', () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const state = [
      { type: 'added', files: [{ id: 'a', name: 'a.pdf', size: 10 }] },
      { type: 'inspected', id: 'a', outcome: { kind: 'ready', pages: 2 } },
      { type: 'drawing-set', key: 'drawing', drawing: lines },
    ].reduce((now, action) => reducer(now, action as Action), initialState);
    expect(state.choices).toEqual({ drawing: lines });
    expect(optionsHold('test-drawing', [way, drawing], state.choices, {}, table)).toBeNull();
    const job = client.run([new File(['%PDF-1.7'], 'a.pdf')], [undefined], jobOptions(undefined, {}, [way, drawing], state.choices), () => {});
    const sent = workers[0]?.sent[0];
    expect(sent?.type).toBe('run');
    expect(sent?.type === 'run' && sent.options).toEqual({ way: 'draw', drawing: [[10, 20, 30, 40], [500, 200]] });
    // What the engine reads from it is the same drawing.
    expect(sent?.type === 'run' && acceptedDrawing('test-drawing', 'drawing', sent.options.drawing, table)).toEqual(lines);
    client.end();
    await expect(job).rejects.toMatchObject({ kind: 'cancelled' });
  });
});

describe('a picture in the widget', () => {
  const way: ToolOption = { kind: 'choice', key: 'way', legend: 'How', choices: [{ value: 'type', label: 'Type it' }, { value: 'picture', label: 'Use a picture' }], initial: 'type' };
  const picture: PictureOption = {
    kind: 'picture',
    key: 'picture',
    label: 'Picture of your signature',
    pickLabel: 'Choose a picture',
    againLabel: 'Choose another picture',
    hint: 'A JPG or PNG picture. One over 8 MB or 16 million pixels still works but makes the file large.',
    acceptsName: 'a JPG or PNG picture',
    emptySentence: 'Choose a picture of your signature first.',
  };
  const shownByWay: PictureOption = { ...picture, when: { key: 'way', value: 'picture' } };
  const table: PictureTable = { 'test-picture': { picture: { types: ['image/jpeg', 'image/png'], noticeBytes: 8 * 1_048_576, noticePixels: 16_000_000 } } };
  const rule = table['test-picture']?.picture;
  const entry = (status: PictureEntry['status'], more: Partial<PictureEntry> = {}): PictureEntry => ({ name: 'signature.png', size: 120 * 1024, status, ...more });
  const ready = entry('ready', { pixels: 300_000 });
  const hold = (pictures: Record<string, PictureEntry>, options: ToolOption[] = [picture], choices = {}) =>
    optionsHold('test-picture', options, choices, undefined, undefined, pictures, table);

  it('names each problem in one sentence, saying no picture is chosen when one was turned away', () => {
    expect(pictureSentence(picture, entry('refused', { name: 'notes.png' }))).toBe('notes.png is not a JPG or PNG picture, so it was not used. No picture is chosen.');
    expect(pictureSentence(picture, entry('damaged', { name: 'broken.png' }))).toBe('broken.png is damaged and cannot be read. Choose another picture.');
    expect(pictureSentence(picture, entry('unsupported', { name: 'arithmetic.jpg' }))).toBe(
      'arithmetic.jpg is saved in a way this tool cannot read. Open it in a photo app, save a copy, and choose the copy.',
    );
    expect(pictureSentence(picture, entry('reading'))).toBeNull();
    expect(pictureSentence(picture, ready)).toBeNull();
  });

  it('names a chosen picture with its size once read, says it is getting ready while read, and has no line for a problem', () => {
    expect(pictureLine(ready)).toBe('signature.png, 120 KB.');
    expect(pictureLine(entry('reading'))).toBe('signature.png, Getting ready.');
    for (const status of ['refused', 'damaged', 'unsupported'] as const) expect(pictureLine(entry(status))).toBeNull();
    expect(pictureLine(undefined)).toBeNull();
  });

  it('words the button for a second pick once a picture is chosen or tried, but not after a wrong pick, which leaves none', () => {
    expect(picturePicked(undefined)).toBe(false);
    expect(picturePicked(entry('refused'))).toBe(false);
    for (const status of ['reading', 'ready', 'damaged', 'unsupported'] as const) expect(picturePicked(entry(status)), status).toBe(true);
  });

  it('gives a notice only for a ready picture over either notice size, naming its size and pixels', () => {
    expect(pictureNotice(picture, ready, rule)).toBeNull();
    expect(pictureNotice(picture, entry('ready', { size: 8 * 1_048_576, pixels: 16_000_000 }), rule)).toBeNull();
    const photo = entry('ready', { name: 'photo.jpg', size: Math.round(12.4 * 1_048_576), pixels: 24_000_000 });
    expect(pictureNotice(picture, photo, rule)).toEqual({
      heading: 'photo.jpg is 12.4 MB, with 24 million pixels.',
      advice: 'A picture this large makes the new file larger, and a phone may run out of memory. Crop it to the signature, or save a smaller copy. You can still go ahead.',
    });
    expect(largePictureAdvice).toContain('You can still go ahead.');
    // Over the bytes alone, or the pixels alone.
    expect(pictureNotice(picture, entry('ready', { name: 'big.png', size: 9 * 1_048_576, pixels: 400_000 }), rule)?.heading).toBe('big.png is 9.0 MB, with 400,000 pixels.');
    expect(pictureNotice(picture, entry('ready', { name: 'wide.png', size: 2 * 1_048_576, pixels: 16_500_000 }), rule)?.heading).toBe('wide.png is 2.0 MB, with 16.5 million pixels.');
    // The tool's own words.
    expect(pictureNotice({ largeAdvice: 'Save a smaller copy. You can still go ahead.' }, photo, rule)?.advice).toBe('Save a smaller copy. You can still go ahead.');
    // Not while read, for a problem, or with no rule.
    expect(pictureNotice(picture, entry('reading', { size: 50 * 1_048_576 }), rule)).toBeNull();
    expect(pictureNotice(picture, entry('damaged', { size: 50 * 1_048_576 }), rule)).toBeNull();
    expect(pictureNotice(picture, photo, undefined)).toBeNull();
  });

  it('holds the main button until a picture is chosen and read, under the button, and by the field for a problem', () => {
    expect(hold({})).toEqual({ key: 'picture', kind: 'empty', sentence: 'Choose a picture of your signature first.' });
    expect(hold({ picture: entry('reading') })).toEqual({ key: 'picture', kind: 'reading', sentence: pictureReadingSentence });
    expect(hold({ picture: entry('refused', { name: 'notes.png' }) })).toEqual({
      key: 'picture',
      kind: 'refused',
      sentence: 'notes.png is not a JPG or PNG picture, so it was not used. No picture is chosen.',
    });
    expect(hold({ picture: entry('damaged') })?.kind).toBe('damaged');
    expect(hold({ picture: entry('unsupported') })?.kind).toBe('unsupported');
    expect(hold({ picture: ready })).toBeNull();
    // A ready picture never holds, however large.
    expect(hold({ picture: entry('ready', { size: 40 * 1_048_576, pixels: 256_000_000 }) })).toBeNull();
    expect(holdsUnderButton({ kind: 'empty' })).toBe(true);
    expect(holdsUnderButton({ kind: 'reading' })).toBe(true);
    for (const kind of ['refused', 'damaged', 'unsupported', 'characters', 'too-long'] as const) expect(holdsUnderButton({ kind })).toBe(false);
  });

  it('holds nothing while hidden, and holds with the empty sentence with no rule', () => {
    expect(hold({}, [way, shownByWay])).toBeNull();
    expect(hold({}, [way, shownByWay], { way: 'picture' })?.kind).toBe('empty');
    expect(optionsHold('test-picture', [picture], {}, undefined, undefined, { picture: ready }, {})).toEqual({ key: 'picture', kind: 'empty', sentence: picture.emptySentence });
    // The real table has no picture yet.
    expect(optionsHold('test-picture', [picture], {}, undefined, undefined, { picture: ready })?.kind).toBe('empty');
  });

  it('keeps working for callers that pass no pictures: a tool with none holds as before', () => {
    expect(optionsHold('test-picture', [way], {})).toBeNull();
    expect(optionsHold('test-picture', [picture], {})?.kind).toBe('empty');
  });

  it('sends no picture in the options', () => {
    expect(optionsToSend([way, picture], { way: 'picture' })).toEqual({ way: 'picture' });
    expect(jobOptions(undefined, {}, [picture], {})).toEqual({});
  });

  it('sends beside the files only each shown, ready picture held for its key', () => {
    const file = new Blob(['x']);
    const held = new Map([['picture', file]]);
    expect(picturesToSend([picture], {}, { picture: ready }, held)).toEqual({ picture: file });
    expect(picturesToSend([picture], {}, { picture: entry('reading') }, held)).toEqual({});
    expect(picturesToSend([picture], {}, { picture: entry('damaged') }, held)).toEqual({});
    expect(picturesToSend([picture], {}, {}, held)).toEqual({});
    expect(picturesToSend([picture], {}, { picture: ready }, new Map())).toEqual({});
    expect(picturesToSend([way, shownByWay], {}, { picture: ready }, held)).toEqual({});
    expect(picturesToSend([way, shownByWay], { way: 'picture' }, { picture: ready }, held)).toEqual({ picture: file });
    expect(picturesToSend(undefined, {}, { picture: ready }, held)).toEqual({});
  });

  it('reads a cut-short picture again while it is still held and being read, up to twice, then calls it damaged', () => {
    expect(pictureRereads).toBe(2);
    expect(rereadPicture(entry('reading'), true, 0, true)).toBe('read-again');
    expect(rereadPicture(entry('reading'), true, 1, true)).toBe('read-again');
    expect(rereadPicture(entry('reading'), true, 2, true)).toBe('damaged');
    expect(rereadPicture(entry('reading'), false, 0, true)).toBe('nothing');
    expect(rereadPicture(ready, true, 0, true)).toBe('nothing');
    expect(rereadPicture(undefined, true, 0, true)).toBe('nothing');
  });

  it('never reads a picture again once the files are no longer listed: the job, its result or a failure', () => {
    // The job's own end cancels a read of a hidden picture still being read; reading it again would start a worker.
    for (const tries of [0, 1, 2]) expect(rereadPicture(entry('reading'), true, tries, false)).toBe('nothing');
  });

  it('never reads a replaced file again, and the newer pick counts its own tries from 0', () => {
    // The old read is cancelled when the worker is ended for the new pick: the old file is no longer held.
    const newer = entry('reading', { name: 'second.png' });
    expect(rereadPicture(newer, false, 0, true)).toBe('nothing');
    expect(rereadPicture(newer, true, 0, true)).toBe('read-again');
  });

  it('lists every picture still being read, for "Go back to your file"', () => {
    expect(picturesToReread({ pictures: { a: entry('reading'), b: ready, c: entry('reading'), d: entry('damaged') } })).toEqual(['a', 'c']);
    expect(picturesToReread({ pictures: {} })).toEqual([]);
  });

  it('never takes an inherited name for a chosen picture', () => {
    expect(chosenPicture({ key: 'toString' }, {})).toBeUndefined();
    expect(chosenPicture({ key: '__proto__' }, {})).toBeUndefined();
  });

  it("reaches the real ToolClient's run message when ready and shown, and not when hidden, with a fake worker", async () => {
    class FakeWorker implements WorkerLike {
      sent: ToWorker[] = [];
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      postMessage(message: ToWorker) {
        this.sent.push(message);
      }
      terminate() {}
    }
    const options: ToolOption[] = [way, shownByWay];
    const file = new File(['\x89PNG'], 'signature.png');
    const held = new Map([['picture', file]]);
    const play = (...actions: Action[]) => actions.reduce(reducer, initialState);
    const listed = play(
      { type: 'added', files: [{ id: 'a', name: 'a.pdf', size: 10 }] },
      { type: 'inspected', id: 'a', outcome: { kind: 'ready', pages: 2 } },
      { type: 'option-set', key: 'way', value: 'picture' },
      { type: 'picture-chosen', key: 'picture', name: 'signature.png', size: 5, status: 'reading' },
      { type: 'picture-read', key: 'picture', outcome: { kind: 'ready', pixels: 100 } },
    );
    for (const [choices, wanted] of [
      [listed.choices, { picture: file }],
      [{ way: 'type' }, undefined],
    ] as const) {
      const workers: FakeWorker[] = [];
      const client = new ToolClient('test-picture', () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      });
      const job = client.run([new File(['%PDF-1.7'], 'a.pdf')], [undefined], jobOptions(undefined, {}, options, choices), () => {}, undefined, picturesToSend(options, choices, listed.pictures, held));
      const sent = workers[0]?.sent[0];
      expect(sent?.type).toBe('run');
      expect(sent?.type === 'run' && sent.pictures).toEqual(wanted);
      expect(sent?.type === 'run' && sent.options).not.toHaveProperty('picture');
      client.end();
      await expect(job).rejects.toMatchObject({ kind: 'cancelled' });
    }
  });
});

describe('the picture field and the picking code, by their source', () => {
  const source = (path: string) => readFileSync(join(__dirname, '../..', path), 'utf8');
  const hook = source('src/hooks/useToolRun.ts');
  const from = hook.indexOf('const readChosenPicture = useCallback(');
  const to = hook.indexOf('[endReplacedRead, readChosenPicture, toolId],');
  const picking = hook.slice(from, to);
  const field = source('src/components/PictureField/PictureField.tsx');

  it('finds the picking code', () => {
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    expect(picking).toContain('const pickPicture = useCallback(');
    expect(picking).toContain('const endReplacedRead = useCallback(');
  });

  it('never makes an address for a picture or writes one to storage', () => {
    for (const [name, code] of [['PictureField', field], ['picking code', picking]] as const) {
      for (const banned of ['createObjectURL', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'history.', 'location.', 'console.', '<img', 'FileReader']) {
        expect(code.includes(banned), `${name}: ${banned}`).toBe(false);
      }
    }
  });
});
