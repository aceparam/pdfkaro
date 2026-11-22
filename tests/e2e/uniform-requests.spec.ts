// What the host sees of a file that never leaves the device: on every tool page, the site files requested after a
// pick, and after the main button, must be the same whatever was picked. The built site is served by a stand-in
// for the host (host-log.ts) that sends GitHub Pages' cache headers and records every request it receives. Each
// input runs in a fresh browser, so its cache starts empty, and no compared browser routes or replays requests,
// which would turn the cache off. A phase ends once every request expected for it has arrived and none is still
// being answered, then a short quiet. Each phase's record must equal the tool's list (tool-files.ts): the same
// files, each asked for once. A slow mode holds PDF.js's files back past the thumbnail limit for the cases that
// need it. Every request also passes the no-upload watcher. (add-uniform-requests, design.md decision 11)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from '@playwright/test';
import { findPage, pageWords } from '../../src/tools/queries';
import { tools } from '../../src/tools/registry';
import { expect, test, watchPolicy } from './fixtures';
import { startHostLog, type HostLog } from './host-log';
import { headersRead, violations, watch } from './no-upload';
import { widgetPages } from './pages';
import { toolFiles } from './tool-files';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, '../fixtures', name);
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
  job: boolean;
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
const asPicks = (inputs: Input[]) => inputs.map((input) => ({ ...input, job: false }));

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
  '/compress-pdf': [
    ...pdfPicks,
    ...pdfJobs,
    { label: 'compress-lossless.pdf (smaller, lossless picture)', files: ['compress-lossless.pdf'], job: true },
    { label: 'compress-text.pdf (no new file)', files: ['compress-text.pdf'], job: true },
    { label: 'compress-scans.pdf (JPGs)', files: ['compress-scans.pdf'], job: true },
  ],
  // A one-page file gives one picture, a longer one a zip: both fetch the same files, fflate among them.
  '/pdf-to-jpg': [...pdfPicks, ...pdfJobs, { label: 'form.pdf (one page, one picture)', files: ['form.pdf'], job: true }],
  '/pdf-to-png': [...pdfPicks, ...pdfJobs, { label: 'form.pdf (one page, one picture)', files: ['form.pdf'], job: true }],
  '/add-page-numbers-to-pdf': [...pdfPicks, ...pdfJobs],
  '/watermark-pdf': [...pdfPicks, ...pdfJobs],
  '/sign-pdf': [
    ...pdfPicks,
    ...pdfJobs.map((input) => ({ ...input, sign: 'type' as const })),
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
const counted = (paths: string[]) => [...paths].sort();

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

type Record_ = { pick: string[]; password?: string[]; picture?: string[]; job?: string[]; problems: string[] };

/** Runs one input in a fresh browser and gives what the host received in each phase, and any no-upload problem. */
async function runInput(browser: Browser, log: HostLog, slug: string, input: Input, slowMode = false): Promise<Record_> {
  const entry = findPage(tools, slug.slice(1))!;
  const words = pageWords(entry.tool, entry.page)!;
  const files = toolFiles(entry.tool.id);
  const limit = slowMode ? 60_000 : 30_000;
  const context = await browser.newContext({ baseURL: log.origin, viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await watchPolicy(context);
  const page = await context.newPage();
  try {
    await page.goto(slug);
    await page.waitForLoadState('networkidle');
    await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
    const seen = watch(context, page);
    const record: Record_ = { pick: [], problems: [] };

    let from = log.mark();
    await picker(page).setInputFiles(input.files.map(fixture));
    record.pick = await phase(log, from, files.pick, limit);

    if (input.password) {
      const field = page.getByLabel(/^Password for /);
      await expect(field).toBeVisible({ timeout: limit });
      from = log.mark();
      await field.fill(input.password);
      await page.keyboard.press('Enter');
      await expect(field).toHaveCount(0, { timeout: limit });
      record.password = await phase(log, from, [], limit);
    }

    if (input.picture) {
      await page.getByRole('radio', { name: 'Use a picture of it', exact: true }).check();
      from = log.mark();
      await page.getByLabel(/^Choose (a|another) picture$/).setInputFiles(fixture(input.picture));
      // Read and ready, or refused by its first bytes: either way the field has answered.
      await expect(page.getByLabel(/^Choose another picture$/).or(page.locator('p:not([role=status])', { hasText: /is not a JPG or PNG/ })).first()).toBeVisible({ timeout: limit });
      record.picture = await phase(log, from, [], limit);
    }

    if (input.job) {
      await getReady(page, slug, input);
      const main = page.getByRole('button', { name: words.actionLabel });
      await expect(main).not.toHaveAttribute('aria-disabled', 'true', { timeout: limit });
      from = log.mark();
      await main.click();
      const endings = [words.doneHeading, words.failedHeading, ...(words.noSmaller ? [words.noSmaller.heading] : [])];
      await expect(page.getByRole('heading').filter({ hasText: new RegExp(`^(${endings.map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`) })).toBeVisible({ timeout: 120_000 });
      record.job = await phase(log, from, files.job, limit);
    }

    // Every request passes the no-upload watcher, with the file names, their stems, the passwords and anything typed as secrets.
    const names = [...input.files, ...(input.picture ? [input.picture] : [])].map((name) => name.split('/').pop()!);
    // A stem shorter than six letters is an ordinary word the browser writes itself ("text" in `Accept: text/css`), and
    // one inside the site's own file names ("images" in pdf-to-images) is the site's; the full names are secrets still.
    const stems = names.map((name) => name.replace(/\.[a-z]+$/, '')).filter((stem) => stem.length >= 6 && !files.all.some((path) => path.includes(stem)));
    const secrets = [...names, ...stems, password, typedName, typedText, newPassword];
    await headersRead(seen);
    record.problems = violations(seen, log.origin, secrets, files.all).map((problem) => `${slug}, ${input.label}: ${problem}`);
    return record;
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

const differs = (slug: string, what: string, label: string, expected: string[], got: string[]) =>
  `${slug}: after ${what} for ${label}, expected ${JSON.stringify(counted(expected))}, got ${JSON.stringify(counted(got))}`;

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
      const entry = findPage(tools, slug.slice(1))!;
      const files = toolFiles(entry.tool.id);
      const expectedPick = files.pick.map((path) => `GET ${path}`);
      const expectedJob = files.job.map((path) => `GET ${path}`);
      const problems: string[] = [];
      for (const input of uniqueInputs(list!)) {
        const record = await runInput(browser, log, slug, input);
        problems.push(...record.problems);
        if (JSON.stringify(counted(record.pick)) !== JSON.stringify(counted(expectedPick))) problems.push(differs(slug, 'the pick', input.label, expectedPick, record.pick));
        if (record.password && record.password.length > 0) problems.push(differs(slug, 'the password', input.label, [], record.password));
        if (record.picture && record.picture.length > 0) problems.push(differs(slug, 'the signature picture', input.label, [], record.picture));
        if (record.job && JSON.stringify(counted(record.job)) !== JSON.stringify(counted(expectedJob))) problems.push(differs(slug, 'the main button', input.label, expectedJob, record.job));
      }
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
        const expected = toolFiles('merge-pdf').pick.map((path) => `GET ${path}`);
        const problems: string[] = [];
        for (const input of [left, right]) {
          const record = await runInput(browser, log, '/merge-pdf', input, true);
          problems.push(...record.problems);
          if (JSON.stringify(counted(record.pick)) !== JSON.stringify(counted(expected))) problems.push(differs('/merge-pdf', 'the pick (slow)', input.label, expected, record.pick));
        }
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
