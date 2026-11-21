import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import type { TextOption, ToolOption } from '../../src/tools/registry';
import {
  acceptedText,
  acceptedValue,
  characterRules,
  cleanText,
  optionTexts,
  optionValues,
  TextRefused,
  textProblem,
  textRule,
  type TextRule,
} from '../../src/widget/option-values';
import {
  chosenValue,
  focusMovesToOptions,
  jobOptions,
  optionsHold,
  optionsShown,
  optionsToSend,
  readyKey,
  ruleAdvice,
  textSentence,
  typedText,
} from '../../src/widget/options';
import { initialState, reducer, type Action, type State } from '../../src/widget/state';
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
  it('lists no tool yet', () => {
    expect(optionTexts).toEqual({});
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

  it('says what is wrong in one sentence: refused characters named when one to three visible Latin letters or signs', () => {
    const characters = (refused: string[]) => textSentence(watermark, rule, { kind: 'characters', refused });
    expect(ruleAdvice['standard-font']).toBe(advice);
    expect(characters(['Ł'])).toBe(`Ł cannot be used. ${advice}`);
    expect(characters(['Ł', 'ź'])).toBe(`Ł and ź cannot be used. ${advice}`);
    expect(characters(['Ł', 'ź', 'ő'])).toBe(`Ł, ź and ő cannot be used. ${advice}`);
    expect(characters(['≠'])).toBe(`≠ cannot be used. ${advice}`);
  });

  it('says "Some characters cannot be used." with no list for four or more, another script, an emoji, or anything invisible', () => {
    const some = `Some characters cannot be used. ${advice}`;
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
    expect(optionsHold('test-text', [watermark], { text: 'Łódź' }, table)).toEqual({ key: 'text', kind: 'characters', sentence: `Ł and ź cannot be used. ${advice}` });
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
