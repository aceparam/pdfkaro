import { describe, expect, it } from 'vitest';
import { createSpareQpdf } from '../../src/workers/spare-qpdf';

function counting() {
  let made = 0;
  const spare = createSpareQpdf(async () => ({ instance: ++made }));
  return { spare, made: () => made };
}

describe('the spare qpdf', () => {
  it('is made when qpdf is loaded, before any engine asks for it', async () => {
    const { spare, made } = counting();
    await spare.load();
    expect(made()).toBe(1);
  });

  it('goes to the first call unused, and later calls get new instances', async () => {
    const { spare, made } = counting();
    await spare.load();
    const first = await spare.take();
    const second = await spare.take();
    const third = await spare.take();
    expect(first).toEqual({ instance: 1 });
    expect(second).toEqual({ instance: 2 });
    expect(third).toEqual({ instance: 3 });
    expect(made()).toBe(3);
  });

  it('is never handed out twice, even to calls made at once', async () => {
    const { spare } = counting();
    await spare.load();
    const given = await Promise.all([spare.take(), spare.take(), spare.take()]);
    expect(new Set(given.map((each) => each.instance)).size).toBe(3);
  });

  it('is made once per worker, however often qpdf is loaded', async () => {
    const { spare, made } = counting();
    await Promise.all([spare.load(), spare.load()]);
    await spare.take();
    await spare.load();
    expect(made()).toBe(1);
  });

  it('makes a new instance for a call when nothing was loaded', async () => {
    const { spare, made } = counting();
    expect(await spare.take()).toEqual({ instance: 1 });
    expect(made()).toBe(1);
  });

  it('passes on a failed load to the step that waits for it, and the next call makes a fresh one', async () => {
    let made = 0;
    const spare = createSpareQpdf(async () => {
      made++;
      if (made === 1) throw new Error('network');
      return { instance: made };
    });
    await expect(spare.load()).rejects.toThrow('network');
    await expect(spare.take()).rejects.toThrow('network');
    expect(await spare.take()).toEqual({ instance: 2 });
  });
});
