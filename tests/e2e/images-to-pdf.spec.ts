// Image to PDF in a real browser, at a phone width and a desktop width, with the
// real engine: its three pages, every state, the keyboard, and the promise that
// nothing about a picture, its name or its details leaves the device.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from '@cantoo/pdf-lib';
import { type FileChooser, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createQpdf } from '../../src/engines/qpdf';
import { headersRead, traces, violations, watch, type Seen } from './no-upload';
import { toolFiles } from './tool-files';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const picture = (name: string) => join(here, '../fixtures/pictures', name);
const named = (name: string, from: string) => ({ name, mimeType: from.endsWith('.png') ? 'image/png' : 'image/jpeg', buffer: readFileSync(picture(from)) });

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Convert and download' });
const summary = (page: Page) => page.locator('p[tabindex="-1"]');
const items = (page: Page) => page.locator('astro-island ol > li');
const listed = async (page: Page) => (await items(page).allInnerTexts()).map((text) => text.split('\n')[0]);
const status = (page: Page) => page.locator('[role=status]').first();
const shown = (page: Page, text: string) => page.locator('p:not([role=status])', { hasText: text });
const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    return element?.getAttribute('aria-label') || element?.textContent?.trim() || (element as HTMLInputElement | null)?.type || '';
  });
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const refusedAdvice = 'To add a picture of another kind, save it as a JPG or PNG first.';

async function open(page: Page, path = '/jpg-to-pdf') {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

type Given = string | { name: string; mimeType: string; buffer: Buffer };
/** Picks pictures and waits until every one has been read. */
async function pick(page: Page, files: Given[]) {
  await picker(page).setInputFiles(files.map((file) => (typeof file === 'string' ? named(file.split('/').pop()!, file) : file)));
  await expect(items(page).first()).toBeVisible();
  await expect(items(page).filter({ hasText: 'Getting ready' })).toHaveCount(0);
}

async function convertAndDownload(page: Page) {
  await mainButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your PDF is ready' })).toBeVisible();
  const focusOnResult = await focused(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync((await download.path())!)), focusOnResult };
}

const pageSizes = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((each) => `${Math.round(each.getWidth())}x${Math.round(each.getHeight())}`);

async function qpdf() {
  return createQpdf(async () => require('@neslinesli93/qpdf-wasm'), require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
}
async function checked(bytes: Uint8Array) {
  const tool = await qpdf();
  tool.write('/r.pdf', bytes);
  return tool.call(['--check', '/r.pdf']).code;
}
/** The PDF with its object streams undone and its streams decoded, as text. */
async function decoded(bytes: Uint8Array) {
  const tool = await qpdf();
  tool.write('/r.pdf', bytes);
  tool.call(['--qdf', '--object-streams=disable', '--decode-level=generalized', '/r.pdf', '/q.pdf']);
  return Buffer.from(tool.read('/q.pdf')).toString('latin1');
}
/** The widths of each page's image, in order. */
async function imageWidths(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const xobjects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    const stream = doc.context.lookup(xobjects.values()[0] as PDFRef) as PDFRawStream;
    return stream.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber();
  });
}

async function paste(page: Page, name: string, from: string) {
  const data = readFileSync(picture(from)).toString('base64');
  await page.evaluate(
    ([fileName, base64]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64!), (c) => c.charCodeAt(0))], fileName!, { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    },
    [name, data],
  );
}

test.describe('the three pages', () => {
  const pages = [
    { path: '/jpg-to-pdf', title: 'Convert JPG to PDF in your browser - PDFkaro', heading: 'Convert JPG to PDF', sentence: 'Turn one or more JPG photos into one PDF. Files stay on your device.', text: 'How to turn JPG photos into a PDF' },
    { path: '/png-to-pdf', title: 'Convert PNG to PDF in your browser - PDFkaro', heading: 'Convert PNG to PDF', sentence: 'Turn one or more PNG pictures or screenshots into one PDF. Files stay on your device.', text: 'How to turn PNG pictures into a PDF' },
    { path: '/image-to-pdf', title: 'Convert images to PDF in your browser - PDFkaro', heading: 'Convert images to PDF', sentence: 'Turn JPG and PNG pictures into one PDF, in the order you choose. Files stay on your device.', text: 'How to turn pictures into one PDF' },
  ];
  for (const each of pages) {
    test(`${each.path} has its own title, heading, sentence and text, and the picker for pictures`, async ({ page, request }) => {
      const fetched: string[] = [];
      page.on('request', (sent) => fetched.push(new URL(sent.url()).pathname));
      await open(page, each.path);
      await expect(page).toHaveTitle(each.title);
      await expect(page.locator('h1')).toHaveText(each.heading);
      await expect(page.getByText(each.sentence)).toBeVisible();
      await expect(page.locator('label', { hasText: 'Choose pictures' })).toBeVisible();
      await expect(page.getByText('You can also drop pictures anywhere on this page, or paste them.')).toBeVisible();
      await expect(picker(page)).toHaveAttribute('accept', 'image/jpeg,image/png');
      await expect(picker(page)).toHaveAttribute('multiple', '');
      expect(fetched.filter((path) => /tool\.worker|images-to-pdf-|picture|pdflib|ToolWorkspace.*\.js/.test(path))).toEqual([]);
      await noSidewaysScroll(page);
      // The words are in the served page before any script runs.
      const html = await (await request.get(each.path)).text();
      for (const words of [each.heading, each.sentence, each.text]) expect(html).toContain(words);
      // The text is marked as a draft for the owner, in its front matter, as every tool's text is.
      expect(readFileSync(join(here, '../../src/content/tools', `${each.path.slice(1)}.md`), 'utf8')).toMatch(/^---\nstatus: Draft\. Waiting for the owner to review/);
      expect(html).toContain(`<meta name="description"`);
    });
  }

  test('each page answers its own questions', async ({ request }) => {
    const jpg = await (await request.get('/jpg-to-pdf')).text();
    const png = await (await request.get('/png-to-pdf')).text();
    const image = await (await request.get('/image-to-pdf')).text();
    expect(jpg).toContain('Will my photos lose quality?');
    expect(png).toContain('Why is the PDF bigger than my PNG files?');
    expect(png).toContain('Can I use an animated PNG?');
    expect(image).toContain('Can I mix JPG and PNG pictures in one PDF?');
    expect(image).toContain('Can I add HEIC, WebP or TIFF pictures?');
  });

  test('the home page lists the three under Convert to PDF', async ({ page }) => {
    await page.goto('/');
    const group = page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'Convert to PDF', exact: true }) }).last();
    for (const [name, path] of [['JPG to PDF', '/jpg-to-pdf'], ['PNG to PDF', '/png-to-pdf'], ['Image to PDF', '/image-to-pdf']]) {
      await expect(group.getByRole('link', { name: name!, exact: true })).toHaveAttribute('href', path!);
    }
  });

  test('the picker opens with Enter and takes several pictures', async ({ page }) => {
    const choosers: FileChooser[] = [];
    page.on('filechooser', (chooser) => choosers.push(chooser));
    await open(page);
    await picker(page).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => choosers.length).toBe(1);
    expect(choosers[0]!.isMultiple()).toBe(true);
    await choosers[0]!.setFiles([]);
  });
});

test.describe('converting', () => {
  test('lists pictures with their sizes and thumbnails, reorders by keyboard, converts and downloads one PDF', async ({ page }) => {
    await open(page);
    await pick(page, ['tall.jpg', 'screenshot.png']);
    await expect(summary(page)).toHaveText(/^2 files, \d+ KB\. Each picture becomes one page, in this order\.$/);
    // Each row shows its size, and no page count.
    await expect(items(page).nth(0)).toContainText(/\d+ KB/);
    await expect(items(page)).not.toContainText(['page']);
    await expect(page.locator('astro-island ol img')).toHaveCount(2, { timeout: 20000 });
    // The thumbnails are hidden from screen readers.
    await expect(page.locator('astro-island ol img').first()).toHaveAttribute('alt', '');

    await page.getByRole('button', { name: 'Move screenshot.png up' }).focus();
    await page.keyboard.press('Enter');
    expect(await listed(page)).toEqual(['screenshot.png', 'tall.jpg']);
    expect(await focused(page)).toBe('Move screenshot.png down');
    await expect(status(page)).toHaveText('screenshot.png moved to place 1 of 2.');
    await noSidewaysScroll(page);

    const { name, bytes, focusOnResult } = await convertAndDownload(page);
    expect(name).toBe('screenshot.pdf');
    expect(focusOnResult).toBe('Your PDF is ready');
    await expect(page.getByText(/, 2 pages$/)).toBeVisible();
    await expect(page.getByText('The pictures’ details, such as the camera, the date and the place, are not copied into the PDF.')).toBeVisible();
    expect(await pageSizes(bytes)).toEqual(['842x595', '595x842']);
    expect(await imageWidths(bytes)).toEqual([1280, 1500]);
    expect(await checked(bytes)).toBe(0);
    await noSidewaysScroll(page);
  });

  test('takes a PNG on the JPG page, and one picture alone is enough', async ({ page }) => {
    await open(page, '/jpg-to-pdf');
    await pick(page, [named('IMG_2041.png', 'small.png')]);
    await expect(summary(page)).toHaveText(/^1 file, \d+ KB\.$/);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    const { name, bytes } = await convertAndDownload(page);
    expect(name).toBe('IMG_2041.pdf');
    expect(await pageSizes(bytes)).toEqual(['842x595']);
  });

  test('takes a pasted screenshot as if it had been chosen', async ({ page }) => {
    await open(page, '/png-to-pdf');
    await paste(page, 'image.png', 'screenshot.png');
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).filter({ hasText: 'Getting ready' })).toHaveCount(0);
    expect(await listed(page)).toEqual(['image.png']);
    await paste(page, 'image2.png', 'small.png');
    await expect(items(page)).toHaveCount(2);
  });

  test('draws a photo stored on its side upright', async ({ page }) => {
    await open(page);
    await pick(page, ['turn-6.jpg', 'turn-6.png']);
    await expect(page.locator('astro-island ol img')).toHaveCount(2, { timeout: 20000 });
    for (let index = 0; index < 2; index++) {
      const corners = await page.locator('astro-island ol img').nth(index).evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const at = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data].slice(0, 3);
        const w = image.naturalWidth;
        const h = image.naturalHeight;
        return { w, h, tl: at(3, 3), tr: at(w - 4, 3), bl: at(3, h - 4), br: at(w - 4, h - 4) };
      });
      // Shown 160 by 100: wider than tall, red top-left, green top-right, blue bottom-left, yellow bottom-right.
      expect(corners.w, `thumbnail ${index}`).toBeGreaterThan(corners.h);
      const near = (seen: number[], wanted: number[]) => seen.every((value, at) => Math.abs(value - wanted[at]!) < 60);
      expect(near(corners.tl, [220, 30, 30]), `${index} top-left ${corners.tl}`).toBe(true);
      expect(near(corners.tr, [30, 170, 60]), `${index} top-right ${corners.tr}`).toBe(true);
      expect(near(corners.bl, [40, 60, 220]), `${index} bottom-left ${corners.bl}`).toBe(true);
      expect(near(corners.br, [240, 210, 40]), `${index} bottom-right ${corners.br}`).toBe(true);
    }
  });

  // Touch reordering uses the buttons; drag is for a mouse.
  test('reorders with a mouse drag on a wide screen @desktop', async ({ page }) => {
    await open(page);
    await pick(page, ['tall.jpg', 'small.png', 'screenshot.png']);
    await items(page).nth(2).dragTo(items(page).nth(0));
    expect(await listed(page)).toEqual(['screenshot.png', 'tall.jpg', 'small.png']);
  });

  test('Remove takes a picture out, and removing the last goes back to the picker', async ({ page }) => {
    await open(page);
    await pick(page, ['tall.jpg', 'small.png']);
    await page.getByRole('button', { name: 'Remove tall.jpg' }).click();
    expect(await listed(page)).toEqual(['small.png']);
    await page.getByRole('button', { name: 'Remove small.png' }).click();
    await expect(page.locator('label', { hasText: 'Choose pictures' })).toBeVisible();
    expect(await focused(page)).toBe('file');
  });

  test('Cancel stops the job and leaves the pictures in the same order', async ({ page }) => {
    await open(page);
    await pick(page, ['wide.jpg', 'tall.jpg', 'screenshot.png', 'small.png']);
    await page.getByRole('button', { name: 'Move small.png up' }).click();
    // Hold the job: pdf-lib is fetched only once the job starts, so a fetch that never answers keeps it
    // running. Four small pictures otherwise convert before Cancel can be pressed.
    await page.context().route(/\/_astro\/pdflib-[^/]+\.js$/, () => {});
    await mainButton(page).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeFocused();
    expect(await listed(page)).toEqual(['wide.jpg', 'tall.jpg', 'small.png', 'screenshot.png']);
    await expect(page.getByRole('heading', { name: 'Your PDF is ready' })).toHaveCount(0);
  });

  test('Start again forgets the pictures', async ({ page }) => {
    await open(page);
    await pick(page, ['small.png']);
    await convertAndDownload(page);
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('label', { hasText: 'Choose pictures' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('small.png');
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
  });
});

test.describe('problems', () => {
  test('turns away a PDF and a text file named like a picture, with the advice', async ({ page }) => {
    await open(page);
    await picker(page).setInputFiles({ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('Just some text, renamed.\n') });
    const message = page.getByText(`notes.jpg is not a JPG or PNG picture, so it was not added. ${refusedAdvice}`);
    await expect(message).toHaveAttribute('role', 'status');
    await expect(message).not.toHaveClass(/visually-hidden/);
    await pick(page, ['small.png', join('..', 'text.pdf')]);
    expect(await listed(page)).toEqual(['small.png']);
    await expect(shown(page, `text.pdf is not a JPG or PNG picture, so it was not added. ${refusedAdvice}`)).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('a damaged picture among others is named, and can be left out', async ({ page }) => {
    await open(page);
    await pick(page, ['tall.jpg', 'small.png', 'broken.png']);
    await expect(page.getByRole('heading', { name: 'broken.png is damaged and cannot be read.' })).toBeVisible();
    await expect(shown(page, 'Open it in a photo app, save a copy, and add the copy.')).toBeVisible();
    await expect(mainButton(page)).toHaveCount(0);
    await noSidewaysScroll(page);
    await page.getByRole('button', { name: 'Leave this file out' }).click();
    expect(await listed(page)).toEqual(['tall.jpg', 'small.png']);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a picture whose width is 0 is damaged', async ({ page }) => {
    await open(page);
    await pick(page, ['tall.jpg', 'zero-size.png']);
    await expect(page.getByRole('heading', { name: 'zero-size.png is damaged and cannot be read.' })).toBeVisible();
  });

  test('a small PNG whose data would fill memory is damaged before the main button; one with a bomb in a text chunk converts', async ({ page }) => {
    await open(page, '/png-to-pdf');
    await pick(page, ['small.png', 'data-bomb.png']);
    await expect(page.getByRole('heading', { name: 'data-bomb.png is damaged and cannot be read.' })).toBeVisible();
    await page.getByRole('button', { name: 'Leave this file out' }).click();
    await pick(page, ['text-bomb.png']);
    const { bytes } = await convertAndDownload(page);
    expect(await pageSizes(bytes)).toEqual(['842x595', '595x842']);
  });

  test('a JPG header of 256 million pixels gets no thumbnail and no notice', async ({ page }) => {
    await open(page);
    await pick(page, ['small.png', 'huge.jpg']);
    await expect(items(page).nth(0).locator('img')).toHaveCount(1, { timeout: 20000 });
    await page.waitForTimeout(500);
    await expect(items(page).nth(1).locator('img')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /million pixels/ })).toHaveCount(0);
  });

  test('a damaged picture on its own offers to choose another', async ({ page }) => {
    await open(page);
    await pick(page, ['broken.jpg']);
    await expect(page.getByRole('heading', { name: 'broken.jpg is damaged and cannot be read.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Leave this file out' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.locator('label', { hasText: 'Choose pictures' })).toBeVisible();
  });

  test('a JPG coded in an unusual way says how to save it again, with others and alone', async ({ page }) => {
    await open(page);
    await pick(page, ['tall.jpg', named('odd.jpg', 'arithmetic.jpg')]);
    await expect(page.getByRole('heading', { name: 'odd.jpg is saved in a way this tool cannot read.' })).toBeVisible();
    await expect(shown(page, 'Open it in a photo app, save a copy as a JPG, and add the copy.')).toBeVisible();
    await expect(status(page)).toHaveText('odd.jpg is saved in a way this tool cannot read. Open it in a photo app, save a copy as a JPG, and add the copy.');
    await expect(items(page).filter({ hasText: 'Saved in a way this tool cannot read' })).toHaveCount(1);
    await expect(mainButton(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Leave this file out' }).click();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Remove tall.jpg' }).click();
    await pick(page, [named('odd.jpg', 'arithmetic.jpg')]);
    await expect(page.getByRole('button', { name: 'Choose another file' })).toBeVisible();
  });

  test('a PNG of 256 million pixels gets a notice tied to the main button, no thumbnail, and the button works', async ({ page }) => {
    await open(page, '/png-to-pdf');
    await pick(page, ['small.png', 'huge.png']);
    await expect(page.getByRole('heading', { name: 'huge.png has 256 million pixels' })).toBeVisible();
    await expect(page.getByText('Converting it may be slow, and a phone may run out of memory. You can still go ahead.')).toBeVisible();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toHaveAccessibleDescription(/huge\.png has 256 million pixels.*You can still go ahead\./);
    // The small picture gets its thumbnail; the huge one keeps its blank box.
    await expect(items(page).nth(0).locator('img')).toHaveCount(1, { timeout: 20000 });
    await page.waitForTimeout(500);
    await expect(items(page).nth(1).locator('img')).toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('says the tool could not be loaded when the engine cannot be fetched, and recovers', async ({ page, context }) => {
    let blocked = true;
    await context.route(/\/_astro\/(images-to-pdf|picture)-/, (route) => (blocked ? route.abort() : route.continue()));
    await open(page);
    await picker(page).setInputFiles([picture('tall.jpg'), picture('small.png')]);
    await expect(page.getByRole('heading', { name: 'The conversion did not finish.' })).toBeVisible();
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
    blocked = false;
    await page.getByRole('button', { name: 'Go back to your files' }).click();
    await expect(items(page).filter({ hasText: 'Getting ready' })).toHaveCount(0);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('pictures adding up to more than 100 MB are warned about, and can still be converted @desktop', async ({ page }) => {
    // tall.jpg with 1,900 comment segments of 64 KB after its start: a valid JPG of about 124 MB.
    const large = join(tmpdir(), 'pdfkaro-e2e-large.jpg');
    if (!existsSync(large)) {
      const base = readFileSync(picture('tall.jpg'));
      const comment = Buffer.concat([Buffer.from([0xff, 0xfe, 0xff, 0xff]), Buffer.alloc(65533, 0x20)]);
      writeFileSync(large, Buffer.concat([base.subarray(0, 2), ...Array.from({ length: 1900 }, () => comment), base.subarray(2)]));
    }
    await open(page);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'These files add up to more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Image to PDF's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts). No qpdf, no PDF.js. */
const filesAfterPick = () => toolFiles('images-to-pdf').all;
const paths = (seen: Seen[]) => seen.map((request) => new URL(request.url).pathname);

test.describe('nothing is uploaded', () => {
  test('picks two pictures under telling names, one with a camera and a place, reorders, converts and downloads', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page, '/image-to-pdf');
    const seen = watch(context, page);
    await pick(page, [named('qz7holiday.jpg', 'details.jpg'), named('zx9scan.png', 'small.png')]);
    await expect(page.locator('astro-island ol img')).toHaveCount(2, { timeout: 20000 });
    await page.getByRole('button', { name: 'Move zx9scan.png up' }).click();
    const { name, bytes } = await convertAndDownload(page);
    expect(name).toBe('zx9scan.pdf');

    const secrets = ['qz7holiday.jpg', 'qz7holiday', 'zx9scan.png', 'zx9scan', 'SECRET-CAMERA-MAKE', 'SECRET-CAMERA-MODEL', 'SECRET-GPS-PLACE'];
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = paths(seen);
    for (const wanted of [/\/images-to-pdf-/, /\/picture-[A-Za-z0-9_-]{8}\.js$/, /\/picture-thumbnail-/, /\/pdflib-/]) expect(fetched.some((path) => wanted.test(path)), String(wanted)).toBe(true);
    for (const other of [/\/qpdf-/, /\.wasm$/, /\/pdf-[A-Za-z0-9_-]{8}\.js$/, /\/pdf\.worker/, /\/pdfjs-data-/, /\/thumbnail-/, /\/inspect-/, /\/plain-/, /\/merge-pdf-/, /\/split-pdf-/, /\/extract-pdf-pages-/, /\/delete-pdf-pages-/, /\/rearrange-pdf-pages-/, /\/rotate-pdf-/, /\/grayscale-pdf-/]) {
      expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    }

    // The PDF holds neither the camera nor the place, with its streams decoded.
    const text = await decoded(bytes);
    for (const secret of ['SECRET', 'qz7holiday', 'zx9scan']) expect(text).not.toContain(secret);

    const held = await traces(page, context);
    expect(held).toMatchObject({ local: 0, session: 0, databases: 0, caches: 0, opfs: [], cookies: [] });
    for (const secret of secrets) {
      expect(held.title).not.toContain(secret);
      expect(decodeURIComponent(held.address)).not.toContain(secret);
      for (const line of consoleText) expect(line).not.toContain(secret);
    }
    const address = new URL(page.url());
    expect(address.search).toBe('');
    expect(address.hash).toBe('');

    await page.getByRole('button', { name: 'Start again' }).click();
    const after = await traces(page, context);
    expect(after).toMatchObject({ local: 0, session: 0, databases: 0, caches: 0, opfs: [], cookies: [] });
    await expect(page.locator('main')).not.toContainText('qz7holiday');
  });
});
