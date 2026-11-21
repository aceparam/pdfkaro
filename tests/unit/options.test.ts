import { describe, expect, it } from 'vitest';
import type { ToolOption } from '../../src/tools/registry';
import { acceptedValue, optionValues } from '../../src/widget/option-values';
import { chosenValue, focusMovesToOptions, jobOptions, optionsShown, optionsToSend, readyKey } from '../../src/widget/options';
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

  it('lists no tool yet', () => {
    expect(optionValues).toEqual({});
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
