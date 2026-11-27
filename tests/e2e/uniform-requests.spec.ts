// What the host sees of a file that never leaves the device: on every tool page, the site files requested after a
// pick, and after the main button, must be the same whatever was picked. The built site is served by a stand-in
// for the host (host-log.ts) that sends GitHub Pages' cache headers and records every request it receives. Each
// input runs in a fresh browser, so its cache starts empty, and no compared browser routes or replays requests,
// which would turn the cache off. A phase ends once every request expected for it has arrived and none is still
// being answered, then a short quiet. Each phase's record must equal the tool's list (tool-files.ts): the same
// files, each asked for once. A slow mode holds PDF.js's files back past the thumbnail limit for the cases that
// need it. Every request also passes the no-upload watcher. (add-uniform-requests, design.md decision 11)

import { readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from '@playwright/test';
import { findPage, pageWords } from '../../src/tools/queries';
import { tools } from '../../src/tools/registry';
import { expect, test, watchPolicy } from './fixtures';
import { startHostLog, type HostLog } from './host-log';
import { headersRead, violations, watch } from './no-upload';
import { widgetPages } from './pages';
import { acrossInputs, recordProblems, type InputRecord } from './request-record';
import { targetFiles, targetPassword } from './target-files';
import { toolFiles } from './tool-files';
import { sizeTargets, type SizeTargetKey } from '../../src/widget/option-values';
import { overHeading, pageTarget, underHeading } from '../../src/widget/target';

const here = dirname(fileURLToPath(import.meta.url));
/** A fixture under tests/fixtures/, or a file made by target-files.ts, by its absolute path. */
const fixture = (name: string) => (isAbsolute(name) ? name : join(here, '../fixtures', name));
const password = 'open-sesame';
const typedName = 'Ann Lee';
const typedText = 'DRAFT';
const newPassword = 'a new one';

/** How long a phase must be quiet, once every expected request has arrived, before its record is read. */
const quietMs = 600;

/** One input to a page: what is picked, then what is typed or chosen, and whether a job is run. */
type Input = {
  label: string;
  /** Fixture names, under tests/fixtures/. */
  files: string[];
  /** The file's own password, typed after the pick in a phase of its own, which must fetch nothing. */
  password?: string;
  /** Sign PDF: a picture chosen after the pick, in a phase of its own, which must fetch nothing. */
  picture?: string;
  /** Sign PDF: the way the signature is given for the job. */
  sign?: 'type' | 'draw' | 'picture';
  /** Resize pages: the paper chosen before the job; left out, the page's own first choice (A4). */
  paper?: 'letter';
  job: boolean;
  /**
   * How the job must end: `'done'` refuses the failed heading, so a failed job cannot pass as the same requests;
   * `'no-file'` wants the tool's words for no new file (Crop PDF with no page cropped, Resize pages with every page
   * already the size chosen), and refuses the others; `'over'` wants the heading of a result still over the page's
   * target (Compress to a target size). On a target page, `'done'` wants the heading of a result under the target.
   */
  expect?: 'done' | 'no-file' | 'over';
  /** A pick only, of a file already at or under the page's target: held, the main button unavailable, no job set fetched. */
  held?: true;
};

const pdfPicks: Input[] = [
  { label: 'damaged-xref.pdf', files: ['damaged-xref.pdf'], job: false },
  { label: 'password.pdf, then its password', files: ['password.pdf'], password, job: false },
  { label: 'not-a-pdf.pdf (wrong kind)', files: ['not-a-pdf.pdf'], job: false },
  { label: 'scanned.pdf', files: ['scanned.pdf'], job: false },
];
const pdfJobs: Input[] = [
  { label: 'text.pdf', files: ['text.pdf'], job: true },
  { label: 'rich.pdf', files: ['rich.pdf'], job: true },
  { label: 'password.pdf with its password', files: ['password.pdf'], password, job: true },
];
/** A file read as ready whose job fails in the browser, on the pages where one does (the drawing step's JSON cap). */
const failingJob: Input = { label: 'compress-json-bomb.pdf (the job fails)', files: ['compress-json-bomb.pdf'], job: true };
const asPicks = (inputs: Input[]) => inputs.map((input) => ({ ...input, job: false }));

/**
 * Each target page's inputs, over that page's target (target-files.ts): a file that fits once compressed, one still
 * over at the floor, a packed text-only file (no new file), a protected file with its password, the shared
 * failing-job file padded over the target (on these pages it ends with no new file, as on Compress PDF), and held
 * rows: text.pdf, and a protected file under the target, for which no password is asked.
 */
async function targetInputs(key: SizeTargetKey): Promise<Input[]> {
  const files = await targetFiles(key);
  return [
    { label: 'damaged-xref.pdf', files: ['damaged-xref.pdf'], job: false },
    { label: 'not-a-pdf.pdf (wrong kind)', files: ['not-a-pdf.pdf'], job: false },
    { label: 'text.pdf (already under the target: held)', files: ['text.pdf'], job: false, held: true },
    { label: 'password.pdf (already under the target: held, no password asked)', files: ['password.pdf'], job: false, held: true },
    { label: `a photo over ${key} that fits once compressed`, files: [files.fits], job: true, expect: 'done' },
    { label: `a photo and an attachment, still over ${key} at the floor`, files: [files.over], job: true, expect: 'over' },
    { label: `a packed text-only file over ${key} (no new file)`, files: [files.packed], job: true, expect: 'no-file' },
    { label: `a protected photo over ${key}, with its password`, files: [files.protectedFits], password: targetPassword, job: true, expect: 'done' },
    { label: `compress-json-bomb.pdf, padded over ${key}`, files: [files.failing], job: true },
  ];
}
const targetPages = Object.fromEntries(
  await Promise.all((Object.keys(sizeTargets) as SizeTargetKey[]).map(async (key) => [`/compress-pdf-to-${key}`, await targetInputs(key)] as const)),
);

/** The inputs of each page (design.md, decision 11). A page with no row fails. */
const inputs: Record<string, Input[]> = {
  '/merge-pdf': [
    ...pdfPicks,
    ...asPicks(pdfJobs),
    { label: 'text.pdf + rich.pdf + images.pdf', files: ['text.pdf', 'rich.pdf', 'images.pdf'], job: false },
    { label: 'text.pdf + rich.pdf', files: ['text.pdf', 'rich.pdf'], job: true },
    { label: 'text.pdf + password.pdf with its password', files: ['text.pdf', 'password.pdf'], password, job: true },
  ],
  '/split-pdf': [...pdfPicks, ...pdfJobs],
  '/extract-pdf-pages': [...pdfPicks, ...pdfJobs],
  '/delete-pdf-pages': [...pdfPicks, ...pdfJobs],
  '/rearrange-pdf-pages': [...pdfPicks, ...pdfJobs],
  '/rotate-pdf': [...pdfPicks, ...pdfJobs],
  // Crop draws every page in its job: a form with values, every script, a character map asked for and refused (the
  // job finishes with no page cropped), and a file whose job fails at the page-reading cap, as on the stamp pages.
  '/crop-pdf': [
    ...pdfPicks,
    ...pdfJobs,
    failingJob,
    { label: 'form.pdf', files: ['form.pdf'], job: true },
    { label: 'multilingual.pdf', files: ['multilingual.pdf'], job: true, expect: 'done' },
    { label: 'chinese-unembedded.pdf (a character map asked for; no page cropped)', files: ['chinese-unembedded.pdf'], job: true, expect: 'no-file' },
  ],
  // Resize reads every object but no content: a form, mixed sizes and turns (a file given), every script and an A4
  // file (no new file with A4), the same A4 file with Letter chosen (a file given), and the page-reading cap failing.
  '/resize-pdf': [
    ...pdfPicks,
    ...pdfJobs,
    failingJob,
    { label: 'form.pdf', files: ['form.pdf'], job: true },
    { label: 'mixed.pdf (mixed sizes and turns)', files: ['mixed.pdf'], job: true, expect: 'done' },
    { label: 'multilingual.pdf (already A4; no new file)', files: ['multilingual.pdf'], job: true, expect: 'no-file' },
    { label: 'text.pdf (already A4; no new file)', files: ['text.pdf'], job: true, expect: 'no-file' },
    { label: 'text.pdf with Letter chosen', files: ['text.pdf'], paper: 'letter', job: true, expect: 'done' },
  ],
  ...targetPages,
  // Grayscale reads every object and the drawing streams in raw batches: a JPEG 2000 picture left as it is (a file
  // given for its CMYK colours), a file with nothing to turn grey, a form, every script, and the page-reading cap failing.
  '/grayscale-pdf': [
    ...pdfPicks,
    ...pdfJobs,
    failingJob,
    { label: 'images.pdf (JPEG 2000 left; CMYK turned grey)', files: ['images.pdf'], job: true, expect: 'done' },
    { label: 'grey-only.pdf (nothing turned grey)', files: ['grey-only.pdf'], job: true, expect: 'no-file' },
    { label: 'form.pdf', files: ['form.pdf'], job: true },
    { label: 'multilingual.pdf', files: ['multilingual.pdf'], job: true, expect: 'done' },
  ],
  '/compress-pdf': [
    ...pdfPicks,
    ...pdfJobs,
    { label: 'compress-lossless.pdf (smaller, lossless picture)', files: ['compress-lossless.pdf'], job: true },
    { label: 'compress-text.pdf (no new file)', files: ['compress-text.pdf'], job: true },
    { label: 'compress-scans.pdf (JPGs)', files: ['compress-scans.pdf'], job: true },
  ],
  // A one-page file gives one picture, a longer one a zip: both fetch the same files, fflate among them.
  '/pdf-to-jpg': [
    ...pdfPicks,
    ...pdfJobs,
    { label: 'form.pdf (one page, one picture)', files: ['form.pdf'], job: true },
    // Embedded fonts in four scripts; and a Chinese font that is not embedded, for which PDF.js asks its data factory
    // for a character map that is not shipped. Neither may lead to a request (add-multilingual-fixture, decision 7).
    { label: 'multilingual.pdf', files: ['multilingual.pdf'], job: true, expect: 'done' },
    { label: 'chinese-unembedded.pdf (a character map asked for)', files: ['chinese-unembedded.pdf'], job: true, expect: 'done' },
  ],
  '/pdf-to-png': [...pdfPicks, ...pdfJobs, { label: 'form.pdf (one page, one picture)', files: ['form.pdf'], job: true }],
  // compress-json-bomb.pdf reads as ready, and its job fails once the pages are read: before this change pdf-lib was
  // then never fetched, so the host could tell (engine-loads report, task 2.4).
  '/add-page-numbers-to-pdf': [...pdfPicks, ...pdfJobs, failingJob],
  '/watermark-pdf': [...pdfPicks, ...pdfJobs, failingJob],
  '/sign-pdf': [
    ...pdfPicks,
    ...[...pdfJobs, failingJob].map((input) => ({ ...input, sign: 'type' as const })),
    { label: 'text.pdf, a PDF chosen as the signature picture', files: ['text.pdf'], picture: 'rich.pdf', job: false },
    { label: 'text.pdf, a drawn line', files: ['text.pdf'], sign: 'draw', job: true },
    { label: 'text.pdf, a JPG picture', files: ['text.pdf'], picture: 'pictures/details.jpg', sign: 'picture', job: true },
    { label: 'text.pdf, a PNG picture', files: ['text.pdf'], picture: 'pictures/small.png', sign: 'picture', job: true },
  ],
  '/protect-pdf': [...pdfPicks, ...pdfJobs],
  '/unlock-pdf': [
    ...pdfPicks,
    ...pdfJobs,
    { label: 'restricted.pdf', files: ['restricted.pdf'], job: true },
  ],
  '/jpg-to-pdf': imageInputs(),
  '/png-to-pdf': imageInputs(),
  '/image-to-pdf': imageInputs(),
};

function imageInputs(): Input[] {
  return [
    { label: 'broken.png', files: ['pictures/broken.png'], job: false },
    { label: 'arithmetic.jpg (unsupported)', files: ['pictures/arithmetic.jpg'], job: false },
    { label: 'text.pdf (wrong kind)', files: ['text.pdf'], job: false },
    { label: 'details.jpg', files: ['pictures/details.jpg'], job: true },
    { label: 'small.png', files: ['pictures/small.png'], job: true },
    { label: 'details.jpg + small.png', files: ['pictures/details.jpg', 'pictures/small.png'], job: true },
  ];
}

const picker = (page: Page) => page.locator('input[type=file]').first();
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Waits for a phase to end: every expected path received and no request still being answered, then `quietMs`
 * with nothing new. Gives the paths received since `from`, or what has arrived when `limitMs` passes.
 */
async function phase(log: HostLog, from: number, expected: string[], limitMs: number): Promise<string[]> {
  const deadline = Date.now() + limitMs;
  const received = () => log.since(from).map((entry) => `${entry.method} ${entry.path}`);
  while (Date.now() < deadline) {
    const got = received();
    if (expected.every((path) => got.includes(`GET ${path}`)) && log.open() === 0) break;
    await sleep(100);
  }
  for (let seen = log.requests.length; Date.now() < deadline; seen = log.requests.length) {
    await sleep(quietMs);
    if (log.requests.length === seen && log.open() === 0) break;
  }
  return received();
}

/** Everything the page needs before its main button works, given the same way for every input. */
async function getReady(page: Page, slug: string, input: Input): Promise<void> {
  if (slug === '/extract-pdf-pages') await page.getByRole('button', { name: 'Take page 1', exact: true }).click();
  if (slug === '/delete-pdf-pages') await page.getByRole('button', { name: 'Delete page 1', exact: true }).click();
  if (slug === '/rotate-pdf') await page.getByRole('button', { name: 'Turn page 1 right', exact: true }).click();
  if (slug === '/watermark-pdf') await page.getByRole('textbox', { name: 'Watermark text' }).fill(typedText);
  if (slug === '/resize-pdf' && input.paper === 'letter') await page.getByRole('radio', { name: 'Letter, 8.5 by 11 inches', exact: true }).check();
  if (slug === '/protect-pdf') {
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Type the new password again', { exact: true }).fill(newPassword);
  }
  if (slug === '/sign-pdf' && input.sign === 'type') await page.getByRole('textbox', { name: 'Your name' }).fill(typedName);
  if (slug === '/sign-pdf' && input.sign === 'draw') {
    await page.getByRole('radio', { name: 'Draw it', exact: true }).check();
    const pad = page.getByRole('img', { name: 'Draw your signature' });
    await pad.scrollIntoViewIfNeeded();
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 0.1 * box.width, box.y + 0.5 * box.height);
    await page.mouse.down();
    await page.mouse.move(box.x + 0.9 * box.width, box.y + 0.5 * box.height, { steps: 8 });
    await page.mouse.up();
  }
}

/** A fixture picked under a unique, long name, so every input's name and stem are secrets no site file can hold. */
let pickCount = 0;
function asPicked(name: string): { name: string; mimeType: string; buffer: Buffer } {
  const base = basename(name);
  const type = base.endsWith('.png') ? 'image/png' : base.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf';
  pickCount += 1;
  return { name: `qz7pick${pickCount}x${base}`, mimeType: type, buffer: readFileSync(fixture(name)) };
}

/** What a pick shows once it has been read: a thumbnail, a file it cannot read, a password field, or the picker saying why. */
const pickShown = (page: Page) =>
  page
    .locator('astro-island img')
    .or(page.getByText(/Damaged and cannot be read|Saved in a way this tool cannot read/))
    .or(page.getByLabel(/^Password for /))
    .or(page.getByRole('status').filter({ hasText: /is not a/ }))
    .or(page.locator('p:not([role=status])', { hasText: /is already .+ or smaller, so there is nothing to do here/ }))
    .first();

type Run = { record: InputRecord; problems: string[] };

/** Runs one input in a fresh browser and gives what the host received in each phase and between them, and any no-upload problem. */
async function runInput(browser: Browser, log: HostLog, slug: string, input: Input, slowMode = false): Promise<Run> {
  const entry = findPage(tools, slug.slice(1))!;
  const words = pageWords(entry.tool, entry.page)!;
  const files = toolFiles(entry.tool.id);
  const limit = slowMode ? 60_000 : 30_000;
  const context = await browser.newContext({ baseURL: log.origin, viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await watchPolicy(context);
  const page = await context.newPage();
  const record: InputRecord = { label: input.label, phases: [], gaps: [] };
  // Each phase's record, then what arrived after it and before the next phase began, which must be nothing.
  let phaseEnd = 0;
  let lastPhase = '';
  const begin = () => {
    const from = log.mark();
    if (lastPhase) record.gaps.push({ after: lastPhase, got: log.since(phaseEnd, from).map((each) => `${each.method} ${each.path}`) });
    return from;
  };
  const end = async (what: string, from: number, expected: string[]) => {
    record.phases.push({ what, expected: expected.map((path) => `GET ${path}`), got: await phase(log, from, expected, limit) });
    phaseEnd = log.mark();
    lastPhase = what;
  };
  try {
    await page.goto(slug);
    await page.waitForLoadState('networkidle');
    await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
    const seen = watch(context, page);
    const picked = input.files.map(asPicked);

    let from = begin();
    await picker(page).setInputFiles(picked);
    // Read only once the pick has shown its outcome, so nothing it asks for later is missed.
    await expect(pickShown(page)).toBeVisible({ timeout: limit });
    await end('the pick', from, files.pick);

    if (input.held) {
      // Held from the pick: the main button is unavailable, says why, and pressing it starts no job.
      const main = page.getByRole('button', { name: words.actionLabel });
      await expect(main).toHaveAttribute('aria-disabled', 'true');
      await expect(main).toHaveAccessibleDescription(/is already .+ or smaller, so there is nothing to do here/);
      await expect(page.getByLabel(/^Password for /)).toHaveCount(0);
      from = begin();
      await main.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('p[class*=progressLine]')).toHaveCount(0);
      await end('the held main button', from, []);
    }

    if (input.password) {
      const field = page.getByLabel(/^Password for /);
      await expect(field).toBeVisible({ timeout: limit });
      from = begin();
      await field.fill(input.password);
      await page.keyboard.press('Enter');
      await expect(field).toHaveCount(0, { timeout: limit });
      await end('the password', from, []);
    }

    let picture: { name: string } | undefined;
    if (input.picture) {
      await page.getByRole('radio', { name: 'Use a picture of it', exact: true }).check();
      from = begin();
      const chosen = asPicked(input.picture);
      picture = chosen;
      await page.getByLabel(/^Choose (a|another) picture$/).setInputFiles(chosen);
      // Read and ready, or refused by its first bytes: either way the field has answered.
      await expect(page.getByLabel(/^Choose another picture$/).or(page.locator('p:not([role=status])', { hasText: /is not a JPG or PNG/ })).first()).toBeVisible({ timeout: limit });
      await end('the signature picture', from, []);
    }

    if (input.job) {
      await getReady(page, slug, input);
      const main = page.getByRole('button', { name: words.actionLabel });
      await expect(main).not.toHaveAttribute('aria-disabled', 'true', { timeout: limit });
      from = begin();
      await main.click();
      // A page that sets a target measures its result against it: its own headings in place of the done heading.
      const target = pageTarget(words, entry.page.preset);
      const done = target ? underHeading(target) : words.doneHeading;
      const endings =
        input.expect === 'done'
          ? [done]
          : input.expect === 'no-file'
            ? [words.noSmaller!.heading]
            : input.expect === 'over'
              ? [overHeading(target!)]
              : [done, ...(target ? [overHeading(target)] : []), words.failedHeading, ...(words.noSmaller ? [words.noSmaller.heading] : [])];
      await expect(page.getByRole('heading').filter({ hasText: new RegExp(`^(${endings.map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`) })).toBeVisible({ timeout: 120_000 });
      await end('the main button', from, files.job);
    }

    // Nothing more arrives after the last phase.
    await sleep(quietMs);
    record.gaps.push({ after: lastPhase, got: log.since(phaseEnd).map((each) => `${each.method} ${each.path}`) });

    // Every request passes the no-upload watcher, with every name picked, its stem, the passwords and anything typed as secrets.
    const names = [...picked.map((file) => file.name), ...(picture ? [picture.name] : [])];
    const stems = names.map((name) => name.replace(/\.[a-z]+$/, ''));
    const secrets = [...names, ...stems, password, typedName, typedText, newPassword];
    await headersRead(seen);
    return { record, problems: violations(seen, log.origin, secrets, files.all).map((problem) => `${slug}, ${input.label}: ${problem}`) };
  } finally {
    await context.close();
  }
}

/** The inputs to run: job inputs count as pick inputs too, and an input listed twice runs once. */
function uniqueInputs(list: Input[]): Input[] {
  const seen = new Set<string>();
  return list.filter((input) => {
    const key = JSON.stringify(input);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

test.describe('what the host sees of a file @desktop', () => {
  let log: HostLog;
  test.beforeAll(async () => {
    log = await startHostLog();
  });
  test.afterAll(async () => {
    await log.close();
  });

  test('every tool page has inputs listed', () => {
    expect(widgetPages.filter((slug) => !inputs[slug])).toEqual([]);
  });

  for (const slug of widgetPages) {
    test(`${slug}: the same files after every pick and every job`, async ({ browser }) => {
      const list = inputs[slug];
      expect(list, `${slug} has no inputs in uniform-requests.spec.ts`).toBeDefined();
      test.setTimeout(30_000 + 40_000 * list!.length);
      const problems: string[] = [];
      const records: InputRecord[] = [];
      for (const input of uniqueInputs(list!)) {
        const { record, problems: noUpload } = await runInput(browser, log, slug, input);
        records.push(record);
        problems.push(...noUpload, ...recordProblems(slug, record));
      }
      for (const what of ['the pick', 'the main button']) problems.push(...acrossInputs(slug, records, what));
      expect(problems).toEqual([]);
    });
  }

  test.describe('with PDF.js held back past the thumbnail limit', () => {
    test.beforeEach(() => log.setSlow(true));
    test.afterEach(() => log.setSlow(false));

    for (const [left, right] of [
      [
        { label: 'text.pdf', files: ['text.pdf'], job: false },
        { label: 'damaged-xref.pdf', files: ['damaged-xref.pdf'], job: false },
      ],
      [
        { label: 'one file', files: ['text.pdf'], job: false },
        { label: 'three files', files: ['text.pdf', 'rich.pdf', 'images.pdf'], job: false },
      ],
    ] as [Input, Input][]) {
      test(`/merge-pdf: ${left.label} and ${right.label} ask for the same files, each once`, async ({ browser }) => {
        test.setTimeout(180_000);
        const problems: string[] = [];
        const records: InputRecord[] = [];
        for (const input of [left, right]) {
          const { record, problems: noUpload } = await runInput(browser, log, '/merge-pdf', input, true);
          records.push(record);
          problems.push(...noUpload, ...recordProblems('/merge-pdf', record));
        }
        problems.push(...acrossInputs('/merge-pdf', records, 'the pick'));
        expect(problems).toEqual([]);
      });
    }

    test('/merge-pdf: a pick of the wrong kind says "Getting ready" with Remove, then says why, with focus following', async ({ browser }) => {
      test.setTimeout(90_000);
      const context = await browser.newContext({ baseURL: log.origin, viewport: { width: 1280, height: 800 } });
      await watchPolicy(context);
      const page = await context.newPage();
      try {
        await page.goto('/merge-pdf');
        await page.waitForLoadState('networkidle');
        await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
        await picker(page).setInputFiles({ name: 'notes.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK\u0003\u0004 not a PDF') });
        const line = page.locator('astro-island p[tabindex="-1"]');
        await expect(line).toHaveText('notes.docx, Getting ready');
        await expect(line).toBeFocused();
        const remove = page.getByRole('button', { name: 'Remove notes.docx' });
        await expect(remove).toBeVisible();
        await page.keyboard.press('Tab');
        await expect(remove).toBeFocused();
        // Once PDF.js's files have arrived, the picker comes back and says why, and focus is on it.
        await expect(picker(page)).toBeFocused({ timeout: 40_000 });
        await expect(page.getByRole('status').filter({ hasText: 'notes.docx' })).toContainText('notes.docx', { timeout: 5000 });
        await expect(line).toHaveCount(0);
      } finally {
        await context.close();
      }
    });

    test('/merge-pdf: Remove during that wait goes back to the picker at once, saying nothing', async ({ browser }) => {
      test.setTimeout(60_000);
      const context = await browser.newContext({ baseURL: log.origin, viewport: { width: 1280, height: 800 } });
      await watchPolicy(context);
      const page = await context.newPage();
      try {
        await page.goto('/merge-pdf');
        await page.waitForLoadState('networkidle');
        await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
        await picker(page).setInputFiles({ name: 'notes.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a PDF') });
        await page.getByRole('button', { name: 'Remove notes.docx' }).click();
        await expect(picker(page)).toBeFocused({ timeout: 2000 });
        await expect(page.getByText('notes.docx')).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  });
});

// Kept at the end: what the README says about the fixtures used here, read once so a renamed fixture fails loudly.
test('the fixtures this spec uses exist @desktop', () => {
  for (const name of new Set(Object.values(inputs).flatMap((list) => list.flatMap((input) => [...input.files, ...(input.picture ? [input.picture] : [])])))) {
    expect(() => readFileSync(fixture(name)), name).not.toThrow();
  }
});
