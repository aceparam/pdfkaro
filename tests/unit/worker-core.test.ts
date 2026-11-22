import { describe, expect, it } from 'vitest';
import type { EngineModule } from '../../src/engines/types';
import { isFromWorker, type FromWorker } from '../../src/workers/messages';
import { createHandler, failureKind, ownBuffers } from '../../src/workers/worker-core';

const blob = (text: string) => new Blob([text]);

function setup(engine: EngineModule | undefined | 'throws') {
  const posted: { message: FromWorker; transfer?: Transferable[] }[] = [];
  const handle = createHandler({
    loadEngine: async () => {
      if (engine === 'throws') throw new Error('network');
      return engine;
    },
    tools: {},
    post: (message, transfer) => posted.push({ message, transfer }),
  });
  return { handle, posted };
}

// A made-up engine that joins its inputs and reports progress.
const joiner: EngineModule = {
  run: async (files, options, onProgress) => {
    files.forEach((_, index) => onProgress({ stage: 'reading', unit: 'file', done: index + 1, total: files.length }));
    const passwords = (options as { passwords?: unknown[] }).passwords;
    const joined = new TextEncoder().encode(files.map((file) => new TextDecoder().decode(file)).join('+') + `|${JSON.stringify(passwords)}`);
    return [joined];
  },
  inspect: async (file, password) => (password === 'wrong' ? { kind: 'needs-password' } : { kind: 'ready', pages: file.length }),
};

describe('the tool worker', () => {
  it('runs an engine on the files in order and moves the result back', async () => {
    const { handle, posted } = setup(joiner);
    await handle({ type: 'run', requestId: 7, toolId: 'merge-pdf', files: [blob('a'), blob('b')], passwords: [undefined, 'pw'], options: {} });
    const progress = posted.filter(({ message }) => message.type === 'progress').map(({ message }) => message);
    expect(progress).toHaveLength(2);
    const done = posted.at(-1)!;
    expect(done.message.type).toBe('done');
    if (done.message.type !== 'done') return;
    expect(new TextDecoder().decode(done.message.outputs[0])).toBe('a+b|[null,"pw"]');
    expect(done.transfer).toEqual([done.message.outputs[0]!.buffer]);
  });

  it('reads one file with its password', async () => {
    const { handle, posted } = setup(joiner);
    await handle({ type: 'inspect', requestId: 1, toolId: 'merge-pdf', file: blob('abc') });
    await handle({ type: 'inspect', requestId: 2, toolId: 'merge-pdf', file: blob('abc'), password: 'wrong' });
    expect(posted.map(({ message }) => message)).toEqual([
      { type: 'inspected', requestId: 1, outcome: { kind: 'ready', pages: 3 } },
      { type: 'inspected', requestId: 2, outcome: { kind: 'needs-password' } },
    ]);
  });

  it('says the engine could not be loaded, when it is missing or its file fails to load', async () => {
    for (const engine of [undefined, 'throws'] as const) {
      const { handle, posted } = setup(engine);
      await handle({ type: 'inspect', requestId: 3, toolId: 'merge-pdf', file: blob('a') });
      expect(posted).toEqual([{ message: { type: 'failed', requestId: 3, kind: 'engine-load' }, transfer: undefined }]);
    }
  });

  it('sends back the kind of failure and nothing of the error', async () => {
    const { handle, posted } = setup({ run: async () => { throw new Error('/in/0.pdf: secret-name.pdf broke'); } });
    await handle({ type: 'run', requestId: 4, toolId: 'merge-pdf', files: [blob('a')], passwords: [undefined], options: {} });
    expect(posted).toEqual([{ message: { type: 'failed', requestId: 4, kind: 'engine' }, transfer: undefined }]);
    expect(JSON.stringify(posted)).not.toContain('secret-name');
  });

  it('passes on an engine that gives no file, as an empty list, which the page accepts', async () => {
    const { handle, posted } = setup({ run: async () => [] });
    await handle({ type: 'run', requestId: 9, toolId: 'compress-pdf', files: [blob('a')], passwords: [undefined], options: {} });
    expect(posted).toEqual([{ message: { type: 'done', requestId: 9, outputs: [] }, transfer: [] }]);
    expect(isFromWorker(posted[0]!.message)).toBe(true);
  });

  it('ignores a message of the wrong shape', async () => {
    const { handle, posted } = setup(joiner);
    await handle({ type: 'run', requestId: 5, toolId: 'merge-pdf' });
    await handle('hello');
    expect(posted).toEqual([]);
  });
});

describe('failureKind', () => {
  it('knows an engine that would pass the most it makes at once by its name, as it knows a zip that is too big', async () => {
    const { TooManyPictures, TooBigForZip } = await import('../../src/widget/zip-limits');
    expect(failureKind(new TooManyPictures())).toBe('too-many-pictures');
    expect(failureKind(Object.assign(new Error('x'), { name: 'TooManyPictures' }))).toBe('too-many-pictures');
    expect(failureKind(new TooBigForZip('files'))).toBe('too-many-files');
  });

  it("knows the drawing step's size budget by its name, and its message is not taken for running out of memory", async () => {
    const { OutputLimit } = await import('../../src/engines/stamp');
    expect(failureKind(new OutputLimit())).toBe('output-limit');
    expect(failureKind(Object.assign(new Error('x'), { name: 'OutputLimit' }))).toBe('output-limit');
    expect(failureKind(new Error(new OutputLimit().message))).toBe('engine');
  });

  it('knows a refused text by its name, and its message is not taken for anything else', async () => {
    const { TextRefused } = await import('../../src/widget/option-values');
    expect(failureKind(new TextRefused())).toBe('text-refused');
    expect(failureKind(Object.assign(new Error('x'), { name: 'TextRefused' }))).toBe('text-refused');
    expect(failureKind(new Error(new TextRefused().message))).toBe('engine');
  });

  it('knows a refused new password by its name, and its message holds nothing of a password', async () => {
    const { PasswordRefused } = await import('../../src/widget/option-values');
    expect(failureKind(new PasswordRefused())).toBe('password-refused');
    expect(failureKind(Object.assign(new Error('x'), { name: 'PasswordRefused' }))).toBe('password-refused');
    expect(failureKind(new Error(new PasswordRefused().message))).toBe('engine');
  });

  it('knows a refused drawing by its name, and its message is not taken for anything else', async () => {
    const { DrawingRefused } = await import('../../src/widget/option-values');
    expect(failureKind(new DrawingRefused())).toBe('drawing-refused');
    expect(failureKind(Object.assign(new Error('x'), { name: 'DrawingRefused' }))).toBe('drawing-refused');
    expect(failureKind(new Error(new DrawingRefused().message))).toBe('engine');
  });

  it('tells running out of memory from other failures', () => {
    expect(failureKind(new RangeError('Array buffer allocation failed'))).toBe('memory');
    expect(failureKind(new Error('Aborted(OOM)'))).toBe('memory');
    expect(failureKind(new Error('Cannot enlarge memory arrays'))).toBe('memory');
    expect(failureKind(new RangeError('Maximum call stack size exceeded'))).toBe('engine');
    expect(failureKind(new RangeError('Offset is outside the bounds of the DataView'))).toBe('engine');
    expect(failureKind(new Error('qpdf exited with 2'))).toBe('engine');
    // A typed array too large to make, as pdf-lib's PNG decoder meets on a very large picture.
    expect(failureKind(new RangeError('Invalid typed array length: 1024000000'))).toBe('memory');
    expect(failureKind(new RangeError('Array buffer allocation failed'))).toBe('memory');
    expect(failureKind(new RangeError('Invalid array buffer length'))).toBe('memory');
  });
});

describe('ownBuffers', () => {
  it('moves a result that fills its own buffer without copying it', () => {
    const whole = new Uint8Array([1, 2, 3]);
    const { outputs, transfer } = ownBuffers([whole]);
    expect(outputs[0]).toBe(whole);
    expect(transfer).toEqual([whole.buffer]);
  });

  it('copies a result that is part of a larger buffer', () => {
    const big = new Uint8Array([9, 1, 2, 3, 9]);
    const part = big.subarray(1, 4);
    const { outputs, transfer } = ownBuffers([part]);
    expect(Array.from(outputs[0]!)).toEqual([1, 2, 3]);
    expect(outputs[0]!.buffer).not.toBe(big.buffer);
    expect(transfer[0]!.byteLength).toBe(3);
  });

  it('copies the second of two results that share a buffer, so no buffer is listed twice', () => {
    const one = new Uint8Array([1, 2]);
    const again = new Uint8Array(one.buffer);
    const { outputs, transfer } = ownBuffers([one, again]);
    expect(outputs[0]).toBe(one);
    expect(outputs[1]).not.toBe(again);
    expect(new Set(transfer).size).toBe(2);
    // The list can really be moved: structuredClone refuses a buffer listed twice.
    expect(() => structuredClone(outputs, { transfer })).not.toThrow();
  });
});

describe('several outputs, zipped in the worker', async () => {
  const { unzipSync, zipSync } = await import('fflate');
  // A made-up engine that gives back as many files as its first input says.
  const splitter: EngineModule = {
    run: async (files) => {
      const count = Number(new TextDecoder().decode(files[0]));
      return Array.from({ length: count }, (_, index) => new TextEncoder().encode(`part ${index + 1}`));
    },
  };
  function zipSetup() {
    const posted: { message: FromWorker; transfer?: Transferable[] }[] = [];
    const log: string[] = [];
    const handle = createHandler({
      loadEngine: async () => {
        log.push('engine');
        return splitter;
      },
      tools: {},
      post: (message, transfer) => posted.push({ message, transfer }),
      loadZip: async () => {
        log.push('fflate');
        return zipSync;
      },
    });
    return { handle, posted, log };
  }
  const zip = { stem: 'report', partSuffix: 'part' };

  it('gives three files back as one zip, numbered so they sort, with how many it holds', async () => {
    const { handle, posted, log } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'split-pdf', files: [blob('3')], passwords: [undefined], options: {}, zip });
    expect(log).toEqual(['fflate', 'engine']);
    const done = posted.at(-1)!;
    if (done.message.type !== 'done') throw new Error(`expected done, got ${done.message.type}`);
    expect(done.message.parts).toBe(3);
    expect(done.message.outputs).toHaveLength(1);
    expect(done.transfer).toEqual([done.message.outputs[0]!.buffer]);
    const entries = unzipSync(done.message.outputs[0]!);
    expect(Object.keys(entries)).toEqual(['report-part-1.pdf', 'report-part-2.pdf', 'report-part-3.pdf']);
    expect(new TextDecoder().decode(entries['report-part-2.pdf'])).toBe('part 2');
  });

  it('names the files with the extension it is given: pictures inside the zip, padded to the count', async () => {
    const { handle, posted } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'pdf-to-images', files: [blob('12')], passwords: [undefined], options: {}, zip: { stem: 'report', partSuffix: 'page', extension: 'jpg' } });
    const done = posted.at(-1)!;
    if (done.message.type !== 'done') throw new Error('expected done');
    const names = Object.keys(unzipSync(done.message.outputs[0]!));
    expect(names[0]).toBe('report-page-01.jpg');
    expect(names[11]).toBe('report-page-12.jpg');
  });

  it('ignores a run whose zip extension is not in the closed set', async () => {
    const { handle, posted, log } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'pdf-to-images', files: [blob('3')], passwords: [undefined], options: {}, zip: { stem: 'report', partSuffix: 'page', extension: 'exe' } });
    expect(posted).toEqual([]);
    expect(log).toEqual([]);
  });

  it('pads the numbers to the count, so 12 parts sort as 01 to 12', async () => {
    const { handle, posted } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'split-pdf', files: [blob('12')], passwords: [undefined], options: {}, zip });
    const done = posted.at(-1)!;
    if (done.message.type !== 'done') throw new Error('expected done');
    const names = Object.keys(unzipSync(done.message.outputs[0]!));
    expect(names[0]).toBe('report-part-01.pdf');
    expect(names[11]).toBe('report-part-12.pdf');
  });

  it('loads fflate even when the run gives one file, and gives that file back as it is', async () => {
    const { handle, posted, log } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'split-pdf', files: [blob('1')], passwords: [undefined], options: {}, zip });
    expect(log).toEqual(['fflate', 'engine']);
    const done = posted.at(-1)!;
    if (done.message.type !== 'done') throw new Error('expected done');
    expect(done.message.parts).toBeUndefined();
    expect(new TextDecoder().decode(done.message.outputs[0])).toBe('part 1');
  });

  it('does not load fflate for a run with no zip naming', async () => {
    const { handle, posted, log } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'split-pdf', files: [blob('2')], passwords: [undefined], options: {} });
    expect(log).toEqual(['engine']);
    const done = posted.at(-1)!;
    if (done.message.type !== 'done') throw new Error('expected done');
    expect(done.message.outputs).toHaveLength(2);
  });

  it('says the tool could not be loaded when fflate fails to load', async () => {
    const posted: FromWorker[] = [];
    const handle = createHandler({
      loadEngine: async () => splitter,
      tools: {},
      post: (message) => posted.push(message),
      loadZip: async () => {
        throw new Error('network');
      },
    });
    await handle({ type: 'run', requestId: 4, toolId: 'split-pdf', files: [blob('3')], passwords: [undefined], options: {}, zip });
    expect(posted).toEqual([{ type: 'failed', requestId: 4, kind: 'engine-load' }]);
  });
});

describe('putting several files into one zip, as the worker does it', async () => {
  const { zipSync } = await import('fflate');
  const engine = (count: number, size = 1): EngineModule => ({ run: async () => Array.from({ length: count }, () => new Uint8Array(size)) });
  const handler = (count: number) => {
    const posted: FromWorker[] = [];
    const handle = createHandler({ loadEngine: async () => engine(count), tools: {}, post: (message) => posted.push(message), loadZip: async () => zipSync });
    return { handle, posted };
  };
  const zip = { stem: 'report', partSuffix: 'part' };

  it('says it is writing before it zips several files, and not for one', async () => {
    const several = handler(3);
    await several.handle({ type: 'run', requestId: 1, toolId: 'split-pdf', files: [blob('x')], passwords: [undefined], options: {}, zip });
    expect(several.posted.map((message) => message.type)).toEqual(['progress', 'done']);
    expect(several.posted[0]).toEqual({ type: 'progress', requestId: 1, progress: { stage: 'writing', percent: 100 } });
    const one = handler(1);
    await one.handle({ type: 'run', requestId: 2, toolId: 'split-pdf', files: [blob('x')], passwords: [undefined], options: {}, zip });
    expect(one.posted.map((message) => message.type)).toEqual(['done']);
  });

  it('refuses to zip more files than one zip can hold, whatever the engine checked', async () => {
    const { handle, posted } = handler(65_536);
    await handle({ type: 'run', requestId: 3, toolId: 'split-pdf', files: [blob('x')], passwords: [undefined], options: {}, zip });
    expect(posted.at(-1)).toEqual({ type: 'failed', requestId: 3, kind: 'too-many-files' });
  });
});

describe('how a tool draws its thumbnails', () => {
  const box = { width: 104, height: 136 };
  const thumb = (toolId: string, documentKey = 'f1') => ({ type: 'thumbnail', requestId: 1, toolId, file: blob('x'), page: 1, box, documentKey });
  function drawing(engines: Record<string, EngineModule>) {
    const kinds: unknown[] = [];
    const posted: FromWorker[] = [];
    const handle = createHandler({
      loadEngine: async (toolId) => engines[toolId],
      tools: {},
      post: (message) => posted.push(message),
      openDocument: async (_file, _password, _tools, kind) => {
        kinds.push(kind);
        return { render: async () => new Uint8Array([1]), close: async () => {} };
      },
    });
    return { handle, kinds, posted };
  }

  it('tells the drawer a picture tool draws pictures, and never a PDF tool', async () => {
    const { handle, kinds } = drawing({ 'merge-pdf': joiner, 'images-to-pdf': { ...joiner, thumbnails: 'picture' } });
    await handle(thumb('merge-pdf', 'f1'));
    await handle(thumb('images-to-pdf', 'f2'));
    await handle(thumb('merge-pdf', 'f3'));
    expect(kinds).toEqual([undefined, 'picture', undefined]);
  });

  it('draws nothing when the engine cannot be loaded', async () => {
    const { handle, kinds, posted } = drawing({});
    await handle(thumb('images-to-pdf'));
    expect(kinds).toEqual([]);
    expect(posted).toEqual([{ type: 'thumbnail', requestId: 1, image: null }]);
  });
});

describe('a job that runs out of memory', () => {
  it('is sorted as memory, and the client ends the worker after it and on Cancel', async () => {
    const { handle, posted } = setup({ run: async () => { throw new RangeError('Invalid typed array length: 4096000000'); } });
    await handle({ type: 'run', requestId: 9, toolId: 'images-to-pdf', files: [blob('a')], passwords: [undefined], options: {} });
    expect(posted).toEqual([{ message: { type: 'failed', requestId: 9, kind: 'memory' }, transfer: undefined }]);

    const { ToolClient } = await import('../../src/workers/client');
    let ended = 0;
    const made: { onmessage: ((event: { data: unknown }) => void) | null; sent: { requestId: number }[] }[] = [];
    const client = new ToolClient('images-to-pdf', () => {
      const worker = {
        onmessage: null as ((event: { data: unknown }) => void) | null,
        onerror: null,
        sent: [] as { requestId: number }[],
        postMessage(message: { requestId: number }) {
          worker.sent.push(message);
        },
        terminate() {
          ended++;
        },
      };
      made.push(worker);
      return worker;
    });
    const failing = client.run([blob('a')], [undefined], {}, () => {});
    made[0]!.onmessage!({ data: { type: 'failed', requestId: made[0]!.sent[0]!.requestId, kind: 'memory' } });
    await expect(failing).rejects.toMatchObject({ kind: 'memory' });
    expect(ended).toBeGreaterThanOrEqual(1);
    expect(client.running).toBe(false);
    const before = ended;
    const cancelled = client.run([blob('a')], [undefined], {}, () => {});
    client.end();
    await expect(cancelled).rejects.toMatchObject({ kind: 'cancelled' });
    expect(ended).toBe(before + 1);
    expect(client.running).toBe(false);
  });
});

describe('a picture chosen for an option, in the worker', () => {
  const picture = new Blob(['PIC']);

  it("reads it with the engine's picture reader, by its key, and answers with its outcome", async () => {
    const seen: [string, string][] = [];
    const { handle, posted } = setup({
      ...joiner,
      inspectPicture: async (key, bytes) => {
        seen.push([key, new TextDecoder().decode(bytes)]);
        return { kind: 'ready', pixels: 42 };
      },
    });
    await handle({ type: 'inspect-picture', requestId: 3, toolId: 'test-picture', key: 'picture', file: picture });
    expect(seen).toEqual([['picture', 'PIC']]);
    expect(posted.map(({ message }) => message)).toEqual([{ type: 'picture-inspected', requestId: 3, outcome: { kind: 'ready', pixels: 42 } }]);
    expect(isFromWorker(posted[0]?.message)).toBe(true);
  });

  it('calls a picture damaged for an engine with no picture reader, so nothing unread is ever ready', async () => {
    const { handle, posted } = setup(joiner);
    await handle({ type: 'inspect-picture', requestId: 4, toolId: 'merge-pdf', key: 'picture', file: picture });
    expect(posted.map(({ message }) => message)).toEqual([{ type: 'picture-inspected', requestId: 4, outcome: { kind: 'damaged' } }]);
  });

  it("says the engine could not be loaded when reading a picture, as for a file", async () => {
    const { handle, posted } = setup(undefined);
    await handle({ type: 'inspect-picture', requestId: 5, toolId: 'test-picture', key: 'picture', file: picture });
    expect(posted.map(({ message }) => message)).toEqual([{ type: 'failed', requestId: 5, kind: 'engine-load' }]);
  });

  it("hands each picture's bytes to the engine under its key, beside the page's options, with the passwords last", async () => {
    let given: Record<string, unknown> = {};
    const { handle, posted } = setup({
      run: async (_files, options) => {
        given = options;
        return [new Uint8Array([1])];
      },
    });
    await handle({
      type: 'run',
      requestId: 6,
      toolId: 'test-picture',
      files: [blob('a')],
      passwords: ['pw'],
      options: { way: 'picture', passwords: 'not this' },
      pictures: { picture },
    });
    expect(posted.at(-1)?.message.type).toBe('done');
    expect(Object.keys(given).sort()).toEqual(['passwords', 'picture', 'way']);
    expect(given.way).toBe('picture');
    expect(given.picture).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(given.picture as Uint8Array)).toBe('PIC');
    expect(given.passwords).toEqual(['pw']);
  });

  it('hands no picture key to the engine for a run without pictures', async () => {
    let given: Record<string, unknown> = {};
    const { handle } = setup({
      run: async (_files, options) => {
        given = options;
        return [new Uint8Array([1])];
      },
    });
    await handle({ type: 'run', requestId: 7, toolId: 'merge-pdf', files: [blob('a')], passwords: [undefined], options: {} });
    expect(Object.keys(given)).toEqual(['passwords']);
  });

  it('maps a refused picture and a picture too large by their names, carrying nothing of the picture', async () => {
    const { PictureRefused, PictureTooLarge } = await import('../../src/widget/option-values');
    expect(failureKind(new PictureRefused())).toBe('picture-refused');
    expect(failureKind(Object.assign(new Error('x'), { name: 'PictureRefused' }))).toBe('picture-refused');
    expect(failureKind(new Error(new PictureRefused().message))).toBe('engine');
    expect(failureKind(new PictureTooLarge())).toBe('picture-too-large');
    expect(failureKind(Object.assign(new Error('x'), { name: 'PictureTooLarge' }))).toBe('picture-too-large');
    expect(failureKind(new Error(new PictureTooLarge().message))).toBe('engine');
    const { handle, posted } = setup({
      run: async () => {
        throw new PictureTooLarge();
      },
    });
    await handle({ type: 'run', requestId: 8, toolId: 'test-picture', files: [blob('a')], passwords: [undefined], options: {}, pictures: { picture: new File(['x'], 'secret-photo.jpg') } });
    expect(posted.map(({ message }) => message)).toEqual([{ type: 'failed', requestId: 8, kind: 'picture-too-large' }]);
    expect(JSON.stringify(posted)).not.toContain('secret-photo');
  });

  it('ignores a run whose pictures are of the wrong shape', async () => {
    const { handle, posted } = setup(joiner);
    await handle({ type: 'run', requestId: 9, toolId: 'merge-pdf', files: [blob('a')], passwords: [undefined], options: {}, pictures: { picture: 'bytes' } });
    expect(posted).toEqual([]);
  });
});
