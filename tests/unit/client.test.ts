import { describe, expect, it } from 'vitest';
import type { ToWorker } from '../../src/workers/messages';
import { ToolClient, ToolError, type WorkerLike } from '../../src/workers/client';

// A made-up worker: it records what it is sent and lets the test reply.
class FakeWorker implements WorkerLike {
  sent: ToWorker[] = [];
  ended = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  postMessage(message: ToWorker) {
    this.sent.push(message);
  }
  terminate() {
    this.ended = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new ToolClient('merge-pdf', () => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

const file = new File(['%PDF-1.7'], 'a.pdf');

describe('the tool client', () => {
  it('starts a worker on first use and posts the file itself, not a copy of its bytes', async () => {
    const { client, workers } = setup();
    expect(workers).toHaveLength(0);
    const asked = client.inspect(file, 'pw');
    expect(workers).toHaveLength(1);
    const sent = workers[0]!.sent[0]!;
    expect(sent).toMatchObject({ type: 'inspect', toolId: 'merge-pdf', password: 'pw' });
    expect(sent.type === 'inspect' && sent.file).toBe(file);
    workers[0]!.reply({ type: 'inspected', requestId: sent.requestId, outcome: { kind: 'ready', pages: 4 } });
    await expect(asked).resolves.toEqual({ kind: 'ready', pages: 4 });
    expect(workers[0]!.ended).toBe(false);
  });

  it('passes progress on and ends the worker when the job is done', async () => {
    const { client, workers } = setup();
    const seen: unknown[] = [];
    const job = client.run([file, file], [undefined, undefined], {}, (progress) => seen.push(progress));
    const { requestId } = workers[0]!.sent[0]!;
    workers[0]!.reply({ type: 'progress', requestId, progress: { stage: 'writing', percent: 50 } });
    workers[0]!.reply({ type: 'done', requestId, outputs: [new Uint8Array([1, 2])] });
    await expect(job).resolves.toEqual({ outputs: [new Uint8Array([1, 2])], parts: undefined });
    expect(seen).toEqual([{ stage: 'writing', percent: 50 }]);
    expect(workers[0]!.ended).toBe(true);
    expect(client.running).toBe(false);
  });

  it('sends the zip naming with a run, and gives back how many files the zip holds', async () => {
    const { client, workers } = setup();
    const job = client.run([file], [undefined], {}, () => {}, { stem: 'report', partSuffix: 'part' });
    const sent = workers[0]!.sent[0]!;
    expect(sent).toMatchObject({ type: 'run', zip: { stem: 'report', partSuffix: 'part' } });
    workers[0]!.reply({ type: 'done', requestId: sent.requestId, outputs: [new Uint8Array([80, 75])], parts: 3 });
    await expect(job).resolves.toEqual({ outputs: [new Uint8Array([80, 75])], parts: 3 });
  });

  it('ends the worker when the job fails, and says how', async () => {
    const { client, workers } = setup();
    const job = client.run([file], [undefined], {}, () => {});
    workers[0]!.reply({ type: 'failed', requestId: workers[0]!.sent[0]!.requestId, kind: 'memory' });
    await expect(job).rejects.toEqual(new ToolError('memory'));
    expect(workers[0]!.ended).toBe(true);
  });

  it('cancels by ending the worker, and starts a fresh one next time', async () => {
    const { client, workers } = setup();
    const job = client.run([file], [undefined], {}, () => {});
    client.end();
    await expect(job).rejects.toEqual(new ToolError('cancelled'));
    expect(workers[0]!.ended).toBe(true);
    void client.inspect(file).catch(() => {});
    expect(workers).toHaveLength(2);
  });

  it('says the tool could not be loaded when the worker itself fails', async () => {
    const { client, workers } = setup();
    const asked = client.inspect(file);
    workers[0]!.onerror?.(new Event('error'));
    await expect(asked).rejects.toEqual(new ToolError('engine-load'));
  });

  it('ignores replies of the wrong shape or for no request', async () => {
    const { client, workers } = setup();
    const asked = client.inspect(file);
    const { requestId } = workers[0]!.sent[0]!;
    workers[0]!.reply({ type: 'inspected', requestId: requestId + 99, outcome: { kind: 'damaged' } });
    workers[0]!.reply({ type: 'failed', requestId, kind: 'a stack trace' });
    workers[0]!.reply({ type: 'inspected', requestId, outcome: { kind: 'damaged' } });
    await expect(asked).resolves.toEqual({ kind: 'damaged' });
  });

  it('ends a worker whose engine could not be fetched, so the next try starts afresh', async () => {
    const { client, workers } = setup();
    const first = client.inspect(file);
    // As the worker does: a reading failure comes once its set has settled.
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    workers[0]!.reply({ type: 'failed', requestId: workers[0]!.sent[0]!.requestId, kind: 'engine-load' });
    await expect(first).rejects.toEqual(new ToolError('engine-load'));
    expect(workers[0]!.ended).toBe(true);
    void client.inspect(file);
    expect(workers).toHaveLength(2);
  });

  it('keeps the worker after an engine failure on one file, which says nothing about the next', async () => {
    const { client, workers } = setup();
    const first = client.inspect(file);
    workers[0]!.reply({ type: 'failed', requestId: workers[0]!.sent[0]!.requestId, kind: 'engine' });
    await expect(first).rejects.toEqual(new ToolError('engine'));
    expect(workers[0]!.ended).toBe(false);
  });
});

describe('a picture chosen for an option', () => {
  const picture = new File(['\x89PNG'], 'signature.png');

  it('is read with its key, as the file itself, and answers with its outcome', async () => {
    const { client, workers } = setup();
    const asked = client.inspectPicture(picture, 'picture');
    const sent = workers[0]?.sent[0];
    expect(sent).toMatchObject({ type: 'inspect-picture', toolId: 'merge-pdf', key: 'picture' });
    expect(sent?.type === 'inspect-picture' && sent.file).toBe(picture);
    workers[0]?.reply({ type: 'picture-inspected', requestId: sent?.requestId, outcome: { kind: 'ready', pixels: 300 } });
    await expect(asked).resolves.toEqual({ kind: 'ready', pixels: 300 });
  });

  it('goes with a run beside the files, and a run with none carries no pictures', async () => {
    const { client, workers } = setup();
    const job = client.run([file], [undefined], {}, () => {}, undefined, { picture });
    const sent = workers[0]?.sent[0];
    expect(sent?.type === 'run' && sent.pictures).toEqual({ picture });
    client.end();
    await expect(job).rejects.toMatchObject({ kind: 'cancelled' });
    for (const none of [undefined, {}]) {
      const again = setup();
      const plain = again.client.run([file], [undefined], {}, () => {}, undefined, none);
      const message = again.workers[0]?.sent[0];
      expect(message && 'pictures' in message).toBe(false);
      again.client.end();
      await expect(plain).rejects.toMatchObject({ kind: 'cancelled' });
    }
  });

  it('is cancelled when the worker is ended during the read, as a thumbnail time limit does', async () => {
    const workers: FakeWorker[] = [];
    const client = new ToolClient(
      'merge-pdf',
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      5,
    );
    const asked = client.inspectPicture(picture, 'picture');
    asked.catch(() => {});
    // A thumbnail asked for meanwhile runs out of time, once the set has settled, and ends the worker, read and all.
    const drawn = client.thumbnail(file, undefined, 1, { width: 100, height: 100 }, 'f1');
    workers[0]?.reply({ type: 'prepared', requestId: 0 });
    await expect(drawn).resolves.toBeNull();
    await expect(asked).rejects.toEqual(new ToolError('cancelled'));
    expect(workers[0]?.ended).toBe(true);
    // Read again, it starts a fresh worker and answers.
    const again = client.inspectPicture(picture, 'picture');
    const sent = workers[1]?.sent[0];
    workers[1]?.reply({ type: 'picture-inspected', requestId: sent?.requestId, outcome: { kind: 'damaged' } });
    await expect(again).resolves.toEqual({ kind: 'damaged' });
  });
});

describe('a picture picked again while the last one is still being read', () => {
  it('starts the new read on a fresh worker once the old one is ended, not behind it', async () => {
    const { client, workers } = setup();
    const slow = client.inspectPicture(new File(['\x89PNG slow'], 'hostile.png'), 'picture');
    slow.catch(() => {});
    // The hook ends the worker before reading the new pick (endReplacedRead).
    client.end();
    await expect(slow).rejects.toEqual(new ToolError('cancelled'));
    expect(workers[0]?.ended).toBe(true);
    const fresh = client.inspectPicture(new File(['\x89PNG'], 'second.png'), 'picture');
    expect(workers).toHaveLength(2);
    const sent = workers[1]?.sent[0];
    expect(sent?.type === 'inspect-picture' && (sent.file as File).name).toBe('second.png');
    workers[1]?.reply({ type: 'picture-inspected', requestId: sent?.requestId, outcome: { kind: 'ready', pixels: 1 } });
    await expect(fresh).resolves.toEqual({ kind: 'ready', pixels: 1 });
  });
});

describe('Cancel while a picture is being read', () => {
  it('cancels the read with the job, and a read started again goes to a fresh worker and answers', async () => {
    const { client, workers } = setup();
    const picture = new File(['\x89PNG'], 'signature.png');
    const read = client.inspectPicture(picture, 'picture');
    read.catch(() => {});
    const job = client.run([file], [undefined], {}, () => {});
    job.catch(() => {});
    client.end();
    await expect(read).rejects.toEqual(new ToolError('cancelled'));
    await expect(job).rejects.toEqual(new ToolError('cancelled'));
    const again = client.inspectPicture(picture, 'picture');
    expect(workers).toHaveLength(2);
    const sent = workers[1]?.sent[0];
    workers[1]?.reply({ type: 'picture-inspected', requestId: sent?.requestId, outcome: { kind: 'ready', pixels: 4 } });
    await expect(again).resolves.toEqual({ kind: 'ready', pixels: 4 });
  });
});

describe('a worker whose set is still loading', () => {
  const box = { width: 104, height: 136 };
  function timed(limitMs = 20, holdMs = 200) {
    const workers: FakeWorker[] = [];
    const client = new ToolClient(
      'merge-pdf',
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      limitMs,
      holdMs,
    );
    return { client, workers };
  }
  const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

  it('is prepared with no file, and the wait ends on `prepared`', async () => {
    const { client, workers } = timed();
    const preparing = client.prepare();
    expect(workers).toHaveLength(1);
    expect(workers[0]!.sent).toEqual([{ type: 'prepare', requestId: 1, toolId: 'merge-pdf' }]);
    expect(client.settled).toBe(false);
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    await expect(preparing).resolves.toBe('settled');
    expect(client.settled).toBe(true);
    // Prepared again, the same worker answers at once.
    await expect(client.prepare()).resolves.toBe('settled');
    expect(workers).toHaveLength(1);
  });

  it('ends a prepare wait at once when the worker is ended or fails', async () => {
    const { client, workers } = timed();
    const ended = client.prepare();
    client.end();
    await expect(ended).resolves.toBe('ended');
    const failed = client.prepare();
    workers[1]!.onerror?.({});
    await expect(failed).resolves.toBe('ended');
  });

  it('does not end the worker for a thumbnail that waits longer than the limit before the set settles, and does after', async () => {
    const { client, workers } = timed(20, 1000);
    const drawn = client.thumbnail(file, undefined, 1, box, 'f1');
    await wait(60);
    expect(workers[0]!.ended).toBe(false);
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    await expect(drawn).resolves.toBeNull();
    expect(workers[0]!.ended).toBe(true);
  });

  it('waits for the set at most the hold, then drops the thumbnail by message and keeps the worker', async () => {
    const { client, workers } = timed(20, 50);
    const drawn = client.thumbnail(file, undefined, 1, box, 'f1');
    const thumbRequest = workers[0]!.sent[0]!.requestId;
    await wait(80);
    expect(workers[0]!.sent.at(-1)).toEqual({ type: 'drop-thumbnail', requestId: thumbRequest, toolId: 'merge-pdf' });
    workers[0]!.reply({ type: 'thumbnail', requestId: thumbRequest, image: null });
    await expect(drawn).resolves.toBeNull();
    expect(workers[0]!.ended).toBe(false);
    // The set settles later: nothing ends the worker for it.
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    await wait(40);
    expect(workers[0]!.ended).toBe(false);
  });

  it('gives a thumbnail the usual limit when its drop past the hold comes too late, as the set has just settled', async () => {
    const { client, workers } = timed(30, 50);
    const drawn = client.thumbnail(file, undefined, 1, box, 'f1');
    await wait(70);
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    await expect(drawn).resolves.toBeNull();
    expect(workers[0]!.ended).toBe(true);
  });

  it('leaves the worker running when a prepare wait passes the hold', async () => {
    const { client, workers } = timed(20, 30);
    await expect(client.prepare(30)).resolves.toBe('timeout');
    expect(workers[0]!.ended).toBe(false);
    expect(client.running).toBe(true);
  });

  it('drops a waiting thumbnail by message, keeping the worker, when the worker answers it first', async () => {
    const { client, workers } = timed(20, 1000);
    const drawn = client.thumbnail(file, undefined, 1, box, 'f1');
    const thumbRequest = workers[0]!.sent[0]!.requestId;
    const dropping = client.dropThumbnail();
    expect(workers[0]!.sent[1]).toEqual({ type: 'drop-thumbnail', requestId: thumbRequest, toolId: 'merge-pdf' });
    workers[0]!.reply({ type: 'thumbnail', requestId: thumbRequest, image: null });
    await expect(dropping).resolves.toBe('dropped');
    await expect(drawn).resolves.toBeNull();
    expect(workers[0]!.ended).toBe(false);
    // The read that follows goes to the same worker.
    void client.inspect(file);
    expect(workers).toHaveLength(1);
  });

  it('says a drop came too late when `prepared` arrives while the thumbnail is still waiting', async () => {
    const { client, workers } = timed(1000, 1000);
    const drawn = client.thumbnail(file, undefined, 1, box, 'f1');
    const dropping = client.dropThumbnail();
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    await expect(dropping).resolves.toBe('too-late');
    client.end();
    await expect(drawn).resolves.toBeNull();
  });

  it('has nothing to drop with no thumbnail waiting, and is too late once settled', async () => {
    const { client, workers } = timed(1000, 1000);
    await expect(client.dropThumbnail()).resolves.toBe('none');
    const drawn = client.thumbnail(file, undefined, 1, box, 'f1');
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    await expect(client.dropThumbnail()).resolves.toBe('too-late');
    client.end();
    await drawn;
  });

  it('ends a worker once its set has settled within the hold, for endWhenSettled (a replaced picture read)', async () => {
    const { client, workers } = timed(20, 1000);
    void client.prepare();
    let done = false;
    const ending = client.endWhenSettled().then(() => (done = true));
    await wait(30);
    expect(done).toBe(false);
    expect(workers[0]!.ended).toBe(false);
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    await ending;
    expect(workers[0]!.ended).toBe(true);
    expect(client.lingering).toBe(false);
  });

  it('ends that worker when the hold passes too, rather than leaving it beside the next, and the next read starts afresh', async () => {
    const { client, workers } = timed(20, 40);
    void client.inspectPicture(file, 'picture').catch(() => {});
    await client.endWhenSettled();
    expect(workers[0]!.ended).toBe(true);
    expect(client.lingering).toBe(false);
    void client.inspect(file);
    expect(workers).toHaveLength(2);
  });

  it('ends a retired worker on its `prepared`, reading nothing else from it, while the next read runs on a fresh one', () => {
    const { client, workers } = timed(20, 10_000);
    void client.prepare();
    client.retire();
    expect(client.lingering).toBe(true);
    void client.inspect(file);
    expect(workers).toHaveLength(2);
    workers[0]!.reply({ type: 'inspected', requestId: 1, outcome: { kind: 'ready', pages: 1 } });
    expect(workers[0]!.ended).toBe(false);
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    expect(workers[0]!.ended).toBe(true);
    expect(client.lingering).toBe(false);
    expect(workers[1]!.ended).toBe(false);
  });

  it("ends every worker, retired ones included, at once on the visitor's own end; endCurrent leaves retired ones", async () => {
    const { client, workers } = timed(20, 10_000);
    void client.prepare();
    client.retire();
    void client.prepare();
    client.endCurrent('cancelled');
    expect(workers[0]!.ended).toBe(false);
    expect(workers[1]!.ended).toBe(true);
    void client.prepare();
    const ending = client.endWhenSettled();
    client.end();
    await ending;
    expect(workers.map((worker) => worker.ended)).toEqual([true, true, true]);
    expect(client.lingering).toBe(false);
  });

  it('on unmount, ends every retired worker that was sent a file, and leaves only one never sent a file to finish', () => {
    const { client, workers } = timed(20, 10_000);
    // A reading worker that failed before its set settled: it was sent a file, so it goes with the workspace.
    const read = client.inspect(file);
    read.catch(() => {});
    workers[0]!.reply({ type: 'failed', requestId: workers[0]!.sent[0]!.requestId, kind: 'engine-load' });
    expect(workers[0]!.ended).toBe(false);
    // A worker for a wrong-kind pick: prepared only, never sent a file.
    void client.prepare();
    client.retire();
    expect(workers[1]!.ended).toBe(false);
    expect(client.releaseOnUnmount()).toBe(true);
    expect(workers[0]!.ended).toBe(true);
    expect(workers[1]!.ended).toBe(false);
    // Only a file-sent retired worker: nothing is left.
    const again = timed(20, 10_000);
    void again.client.thumbnail(file, undefined, 1, box, 'f1');
    again.client.retire();
    expect(again.client.releaseOnUnmount()).toBe(false);
    expect(again.workers[0]!.ended).toBe(true);
  });

  it('retires a reading worker that fails before its set has settled, answering the read at once, and ends it on `prepared`', async () => {
    const { client, workers } = timed(20, 10_000);
    const read = client.inspect(file);
    workers[0]!.reply({ type: 'failed', requestId: workers[0]!.sent[0]!.requestId, kind: 'engine-load' });
    await expect(read).rejects.toEqual(new ToolError('engine-load'));
    expect(workers[0]!.ended).toBe(false);
    expect(client.running).toBe(false);
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    expect(workers[0]!.ended).toBe(true);
  });

  it('ends a reading worker that ran out of memory at once, as a crash, even before its set has settled', async () => {
    const { client, workers } = timed(20, 10_000);
    const read = client.inspect(file);
    workers[0]!.reply({ type: 'failed', requestId: workers[0]!.sent[0]!.requestId, kind: 'memory' });
    await expect(read).rejects.toEqual(new ToolError('memory'));
    expect(workers[0]!.ended).toBe(true);
    expect(client.lingering).toBe(false);
  });

  it('ends a reading worker that fails once its set has settled, and a job worker that fails, at once', async () => {
    const { client, workers } = timed(20, 10_000);
    const read = client.inspect(file);
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    workers[0]!.reply({ type: 'failed', requestId: workers[0]!.sent[0]!.requestId, kind: 'engine-load' });
    await expect(read).rejects.toEqual(new ToolError('engine-load'));
    expect(workers[0]!.ended).toBe(true);
    const job = client.run([file], [undefined], {}, () => {});
    workers[1]!.reply({ type: 'failed', requestId: workers[1]!.sent[0]!.requestId, kind: 'memory' });
    await expect(job).rejects.toEqual(new ToolError('memory'));
    expect(workers[1]!.ended).toBe(true);
    expect(client.lingering).toBe(false);
  });

  it('starts each new worker unsettled', async () => {
    const { client, workers } = timed();
    void client.prepare();
    workers[0]!.reply({ type: 'prepared', requestId: 0 });
    expect(client.settled).toBe(true);
    client.end();
    expect(client.settled).toBe(false);
    void client.prepare();
    expect(client.settled).toBe(false);
  });
});
