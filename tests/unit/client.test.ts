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
    // A thumbnail asked for meanwhile runs out of time and ends the worker, read and all.
    const drawn = client.thumbnail(file, undefined, 1, { width: 100, height: 100 }, 'f1');
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
