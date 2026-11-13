// Merge PDF in a real browser, at a phone width and a desktop width, with the
// real engine: every state, the keyboard, and the promise that nothing about a
// file leaves the device.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { expect, test, type FileChooser, type Page } from '@playwright/test';
import { builtFiles, violations, watch } from './no-upload';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../fixtures');
const fixture = (name: string) => join(fixtures, name);
const password = 'open-sesame';

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Merge and download' });
const summary = (page: Page) => page.locator('p[tabindex="-1"]');
// The widget is the one island on the page; the how-to steps below it are a list too.
const items = (page: Page) => page.locator('astro-island ol > li');
const listed = async (page: Page) => (await items(page).allInnerTexts()).map((text) => text.split('\n')[0]);
const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    return element?.getAttribute('aria-label') || element?.textContent?.trim() || (element as HTMLInputElement | null)?.type || '';
  });
// Words on screen, not the copy of them in a status line that only screen readers hear.
const shown = (page: Page, text: string) => page.locator('p:not([role=status])', { hasText: text });
const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function open(page: Page) {
  await page.goto('/merge-pdf');
  await page.waitForLoadState('networkidle');
  // Astro drops `ssr` from the island once the widget has started; wait for it, so nothing races its start.
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

/** Picks files and waits until every one has been read. */
async function pick(page: Page, names: string[]) {
  await picker(page).setInputFiles(names.map(fixture));
  await expect(items(page).first()).toBeVisible();
  await expect(items(page).filter({ hasText: 'Getting ready' })).toHaveCount(0);
}

const pageSizes = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((each) => `${Math.round(each.getWidth())}x${Math.round(each.getHeight())}`);

async function mergeAndDownload(page: Page) {
  await mainButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your merged file is ready' })).toBeVisible();
  const focusOnResult = await focused(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync((await download.path())!)), focusOnResult };
}

test.describe('before a file is picked', () => {
  test('only the picker is there, and nothing of the tool has been fetched', async ({ page }) => {
    const fetched: string[] = [];
    page.on('request', (request) => fetched.push(new URL(request.url()).pathname));
    await open(page);
    await expect(page.locator('label', { hasText: 'Choose PDF files' })).toBeVisible();
    expect(fetched.filter((path) => /tool\.worker|merge-pdf-|qpdf|ToolWorkspace.*\.js|\.wasm/.test(path))).toEqual([]);
    await noSidewaysScroll(page);
  });

  test('the how-to steps and questions are in the served page', async ({ request }) => {
    const html = await (await request.get('/merge-pdf')).text();
    expect(html).toContain('How to merge PDF files');
    expect(html).toContain('What happens to bookmarks and attachments?');
    expect(html).toContain('The merged file has no password and no restrictions');
  });

  test('the picker opens with Enter and with Space', async ({ page }) => {
    // Listen before the page loads: Playwright starts catching file choosers only once a listener is
    // attached, and that takes a round trip to the browser, which a key press could otherwise beat.
    const choosers: FileChooser[] = [];
    page.on('filechooser', (chooser) => choosers.push(chooser));
    await open(page);
    for (const key of ['Enter', ' ']) {
      await test.step(`key ${JSON.stringify(key)}`, async () => {
        const before = choosers.length;
        await picker(page).focus();
        await expect(picker(page)).toBeFocused();
        await page.keyboard.press(key);
        await expect.poll(() => choosers.length).toBe(before + 1);
        const chooser = choosers.at(-1)!;
        expect(chooser.isMultiple()).toBe(true);
        // Close it, as a visitor pressing Cancel would.
        await chooser.setFiles([]);
      });
    }
  });
});

test.describe('merging', () => {
  test('picks, reorders with the keyboard, merges, and downloads a file with the pages in the new order', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf']);
    await expect(summary(page)).toHaveText('2 files, 7 pages, 8 KB. They will be joined in this order.');
    await expect(page.getByText('3 pages, 6 KB')).toBeVisible();

    await page.getByRole('button', { name: 'Move mixed.pdf up' }).focus();
    await page.keyboard.press('Enter');
    expect(await listed(page)).toEqual(['mixed.pdf', 'text.pdf']);
    expect(await focused(page)).toBe('Move mixed.pdf down');
    await expect(page.getByRole('status').first()).toHaveText('mixed.pdf moved to place 1 of 2.');
    await noSidewaysScroll(page);

    const { name, bytes, focusOnResult } = await mergeAndDownload(page);
    expect(name).toBe('mixed-merged.pdf');
    expect(await pageSizes(bytes)).toEqual(['595x842', '792x612', '420x595', '595x842', '595x842', '595x842', '595x842']);
    await expect(page.getByText('Bookmarks and attachments come from the first file only.')).toBeVisible();
    await expect(page.getByText(/no password and no restrictions/).first()).toBeVisible();
    expect(focusOnResult).toBe('Your merged file is ready');
    await noSidewaysScroll(page);
  });

  // Touch reordering uses the buttons; drag is for a mouse. The phone project leaves out @desktop tests.
  test('reorders with a mouse drag on a wide screen @desktop', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf', 'scanned.pdf']);
    await items(page).nth(2).dragTo(items(page).nth(0));
    expect(await listed(page)).toEqual(['scanned.pdf', 'text.pdf', 'mixed.pdf']);
  });

  test('asks for at least one more file when only one is listed', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf']);
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toHaveAccessibleDescription('Add at least one more file to merge.');
    // It keeps focus and does nothing when pressed.
    await mainButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Your merged file is ready' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove text.pdf' }).click();
    await expect(page.locator('label', { hasText: 'Choose PDF files' })).toBeVisible();
    expect(await focused(page)).toBe('file');
  });

  test('Cancel stops the job and leaves the files as they were', async ({ page }) => {
    await open(page);
    await pick(page, ['pages-500.pdf', 'pages-500.pdf', 'pages-500.pdf', 'pages-500.pdf']);
    await mainButton(page).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeFocused();
    expect(await listed(page)).toEqual(['pages-500.pdf', 'pages-500.pdf', 'pages-500.pdf', 'pages-500.pdf']);
    await expect(page.getByRole('heading', { name: 'Your merged file is ready' })).toHaveCount(0);
  });

  test('Start again forgets the files and goes back to the picker', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'scanned.pdf']);
    await mergeAndDownload(page);
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('label', { hasText: 'Choose PDF files' })).toBeVisible();
    expect(await focused(page)).toBe('file');
    await expect(page.locator('main')).not.toContainText('text.pdf');
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
    expect(await picker(page).evaluate((input: HTMLInputElement) => input.files?.length ?? 0)).toBe(0);
  });
});

test.describe('problems', () => {
  test('turns away a file that is not a PDF, and says so', async ({ page }) => {
    await open(page);
    await picker(page).setInputFiles(fixture('not-a-pdf.pdf'));
    // Back at the picker, the sentence is shown under it, in the status line that is read out.
    const message = page.getByText('not-a-pdf.pdf is not a PDF, so it was not added.');
    await expect(message).toHaveAttribute('role', 'status');
    await expect(message).not.toHaveClass(/visually-hidden/);
    await expect(page.locator('label', { hasText: 'Choose PDF files' })).toBeVisible();
    await pick(page, ['text.pdf', 'not-a-pdf.pdf', 'mixed.pdf']);
    expect(await listed(page)).toEqual(['text.pdf', 'mixed.pdf']);
    await expect(shown(page, 'not-a-pdf.pdf is not a PDF, so it was not added.')).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('asks for a password, says when it is wrong, and opens the file when it is right', async ({ page }) => {
    await open(page);
    await picker(page).setInputFiles([fixture('text.pdf'), fixture('password.pdf')]);
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeVisible();
    await expect(page.getByText(/stays in (this|your) browser/).first()).toBeVisible();
    await expect(mainButton(page)).toHaveCount(0);
    await noSidewaysScroll(page);

    await field.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
    await expect(field).toBeFocused();

    await field.fill(password);
    await page.getByRole('button', { name: 'Open the file' }).click();
    await expect(mainButton(page)).toBeFocused();
    await expect(summary(page)).toContainText('2 files, 6 pages');

    const { bytes } = await mergeAndDownload(page);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(6);
  });

  test('a protected file can be left out', async ({ page }) => {
    await open(page);
    await picker(page).setInputFiles([fixture('text.pdf'), fixture('password.pdf'), fixture('mixed.pdf')]);
    await page.getByRole('button', { name: 'Leave this file out' }).click();
    expect(await listed(page)).toEqual(['text.pdf', 'mixed.pdf']);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a file with restrictions but no password opens without asking', async ({ page }) => {
    await open(page);
    await pick(page, ['restricted.pdf', 'text.pdf']);
    await expect(page.getByLabel(/Password for/)).toHaveCount(0);
    const { bytes } = await mergeAndDownload(page);
    // pdf-lib refuses an encrypted file unless told otherwise, so loading it shows it is not encrypted.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(6);
  });

  test('a damaged file among others is named, and can be left out', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf', 'damaged-cut.pdf']);
    await expect(page.getByRole('heading', { name: 'damaged-cut.pdf is damaged and cannot be read.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Repair/ })).toHaveCount(0);
    await noSidewaysScroll(page);
    await page.getByRole('button', { name: 'Leave this file out' }).click();
    expect(await listed(page)).toEqual(['text.pdf', 'mixed.pdf']);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a damaged file on its own goes back to the picker', async ({ page }) => {
    await open(page);
    await pick(page, ['damaged-xref.pdf']);
    await expect(page.getByRole('heading', { name: 'damaged-xref.pdf is damaged and cannot be read.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Leave this file out' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.locator('label', { hasText: 'Choose PDF files' })).toBeVisible();
  });

  test('one good file and one damaged file leave one file, which asks for one more', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'damaged-cut.pdf']);
    await page.getByRole('button', { name: 'Leave this file out' }).click();
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Add at least one more file to merge.')).toBeVisible();
  });

  test('says the tool could not be loaded when the engine cannot be fetched, and recovers', async ({ page, context }) => {
    let blocked = true;
    await context.route(/\/_astro\/(merge-pdf|qpdf)-/, (route) => (blocked ? route.abort() : route.continue()));
    await open(page);
    await picker(page).setInputFiles([fixture('text.pdf'), fixture('mixed.pdf')]);
    await expect(page.getByRole('heading', { name: 'The merge did not finish.' })).toBeVisible();
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
    await noSidewaysScroll(page);
    blocked = false;
    await page.getByRole('button', { name: 'Go back to your files' }).click();
    await expect(summary(page)).toContainText('2 files, 7 pages');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Merge PDF's own files that may load after a pick, by exact name, read from the build. */
const filesAfterPick = () =>
  builtFiles(
    /^(ToolWorkspace\.[A-Za-z0-9_-]{8}\.js|FilePicker\.[A-Za-z0-9_-]{8}\.css|tool\.worker-[A-Za-z0-9_-]{8}\.js|merge-pdf-[A-Za-z0-9_-]{8}\.js|inspect-[A-Za-z0-9_-]{8}\.js|qpdf-[A-Za-z0-9_-]{8}\.(js|wasm)|thumbnail-[A-Za-z0-9_-]{8}\.js|pdf-[A-Za-z0-9_-]{8}\.js|pdf\.worker\.min-[A-Za-z0-9_-]{8}\.mjs|pdfjs-data-[A-Za-z0-9_-]{8}\.js)$/,
  );

test.describe('nothing is uploaded', () => {
  test('picks, types a password, merges and downloads, with only the listed files fetched and nothing kept', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);

    // images.pdf and text.pdf need PDF.js's decoders and fonts for their thumbnails.
    await picker(page).setInputFiles([fixture('text.pdf'), fixture('password.pdf'), fixture('rich.pdf'), fixture('images.pdf')]);
    await page.getByLabel('Password for password.pdf').fill(password);
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused();
    await expect(page.locator('astro-island ol img')).toHaveCount(4, { timeout: 20000 });
    await mergeAndDownload(page);

    const secrets = ['text.pdf', 'password.pdf', 'rich.pdf', 'images.pdf', password];
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    // The workers' own requests are watched too: qpdf's WebAssembly is fetched from the tool worker, and
    // PDF.js's own worker and its helper data from it, after the thumbnails were asked for.
    expect(seen.some((request) => request.url.endsWith('.wasm'))).toBe(true);
    expect(seen.some((request) => /\/pdf\.worker\.min-[^/]+\.mjs$/.test(request.url))).toBe(true);
    expect(seen.some((request) => /\/pdfjs-data-[^/]+\.js$/.test(request.url))).toBe(true);

    // Nothing of the files is kept anywhere the browser stores things.
    expect(await context.cookies()).toEqual([]);
    const stored = await page.evaluate(async () => {
      const opfs = await navigator.storage.getDirectory();
      const opfsNames: string[] = [];
      for await (const name of (opfs as unknown as { keys(): AsyncIterable<string> }).keys()) opfsNames.push(name);
      return {
        local: localStorage.length,
        session: sessionStorage.length,
        databases: (await indexedDB.databases()).length,
        caches: (await caches.keys()).length,
        opfs: opfsNames,
        title: document.title,
        address: location.href,
      };
    });
    expect(stored).toMatchObject({ local: 0, session: 0, databases: 0, caches: 0, opfs: [] });
    for (const secret of secrets) {
      expect(stored.title).not.toContain(secret);
      expect(decodeURIComponent(stored.address)).not.toContain(secret);
      for (const line of consoleText) expect(line).not.toContain(secret);
    }
  });

});

test.describe('leaving the page', () => {
  // A browser may keep a page it leaves, to show it again on Back. Playwright's
  // Chromium never does, so Back would load the page afresh and prove nothing.
  // Instead the test sends the event the browser sends on leaving, as it would
  // for a page it keeps, and looks at the page straight after.
  test('leaving the page forgets the files, names and download link at once', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf']);
    await mainButton(page).click();
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
    const left = await page.evaluate(() => {
      dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      const widget = document.querySelector('astro-island')!;
      return {
        text: widget.textContent ?? '',
        links: widget.querySelectorAll('a[href^="blob:"]').length,
        files: (widget.querySelector('input[type=file]') as HTMLInputElement | null)?.files?.length ?? 0,
      };
    });
    expect(left.text).not.toContain('text.pdf');
    expect(left.text).not.toContain('mixed.pdf');
    expect(left.links).toBe(0);
    expect(left.files).toBe(0);
  });

  test('coming back with Back shows the picker alone', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf']);
    await page.goto('/');
    await page.goBack();
    await expect(page.locator('label', { hasText: 'Choose PDF files' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('text.pdf');
    expect(await picker(page).evaluate((input: HTMLInputElement) => input.files?.length ?? 0)).toBe(0);
  });
});

test.describe('the page stays responsive', () => {
  // Run once, at the desktop width; the width does not change the work.
  test('merging the 500-page file twice over blocks the page for no more than 100 ms at a time @desktop', async ({ page }) => {
    await open(page);
    await pick(page, ['pages-500.pdf', 'pages-500.pdf']);
    await page.evaluate(() => {
      const long: number[] = [];
      (window as unknown as { longTasks: number[] }).longTasks = long;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) long.push(entry.duration);
      }).observe({ type: 'longtask', buffered: false });
    });
    await mainButton(page).click();
    await expect(page.getByRole('heading', { name: 'Your merged file is ready' })).toBeVisible();
    await expect(page.getByText('1,000 pages').or(page.getByText('1000 pages'))).toBeVisible();
    const long = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
    expect(long.filter((duration) => duration > 100)).toEqual([]);
  });
});
