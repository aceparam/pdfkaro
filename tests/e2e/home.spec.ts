import { expect, test } from '@playwright/test';

const filterBox = 'What do you need to do?';

test.describe('home page', () => {
  test('lists every published tool as a link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('PDFkaro');
    await expect(page.getByRole('heading', { level: 2, name: 'Organise pages' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Merge PDF' })).toHaveAttribute('href', '/merge-pdf');
    // Groups with no published tool are not drawn.
    await expect(page.getByRole('heading', { name: 'Read and check' })).toHaveCount(0);
  });

  test('lists the tools with JavaScript off', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Merge PDF' })).toBeVisible();
    await expect(page.getByLabel(filterBox)).toBeVisible();
    await context.close();
  });

  test('has an empty status line in the served HTML', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/<p role="status"[^>]*><\/p>/);
    expect(html).toContain('href="/merge-pdf"');
  });

  test('filters by name and by summary', async ({ page }) => {
    await page.goto('/');
    const box = page.getByLabel(filterBox);
    const merge = page.getByRole('link', { name: 'Merge PDF' });
    const status = page.getByRole('status');

    await box.fill('MERGE');
    await expect(status).toHaveText('1 tool matches.');
    await expect(merge).toBeVisible();

    await box.fill('  combine ');
    await expect(status).toHaveText('1 tool matches.');
    await expect(merge).toBeVisible();

    // The count is for screen readers: it is in the page but takes no room on screen.
    const size = await status.boundingBox();
    expect(size?.width).toBeLessThanOrEqual(1);
    expect(size?.height).toBeLessThanOrEqual(1);

    await box.fill('');
    await expect(status).toHaveText('');
    await expect(merge).toBeVisible();
  });

  test('says so when nothing matches, and hides the empty group', async ({ page }) => {
    await page.goto('/');
    const box = page.getByLabel(filterBox);
    await box.fill('zzz');

    const status = page.getByRole('status');
    await expect(status).toHaveText('No tools match.');
    await expect(status).toBeVisible();
    expect((await status.boundingBox())?.height).toBeGreaterThan(10);

    await expect(page.locator('a[href="/merge-pdf"]')).toBeHidden();
    await expect(page.locator('h2', { hasText: 'Organise pages' })).toBeHidden();

    // A hidden link is out of the tab order: Tab goes from the box to the footer.
    await box.focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('footer a').first()).toBeFocused();
  });

  test('ignores Enter', async ({ page }) => {
    await page.goto('/');
    const box = page.getByLabel(filterBox);
    await box.fill('merge');
    await expect(page.getByRole('status')).toHaveText('1 tool matches.');
    await box.press('Enter');
    await expect(page).toHaveURL('/');
    await expect(box).toHaveValue('merge');
    await expect(page.getByRole('link', { name: 'Merge PDF' })).toBeVisible();
  });

  test('applies text typed before the script loads', async ({ page }) => {
    // Hold every script back, type, then let the scripts through.
    const held: (() => Promise<void>)[] = [];
    let holding = true;
    await page.route('**/*.js', (route) => {
      if (holding) held.push(() => route.continue());
      else void route.continue();
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByLabel(filterBox).fill('zzz');
    await expect(page.getByRole('status')).toHaveText('');

    holding = false;
    await Promise.all(held.map((release) => release()));
    await expect(page.getByRole('status')).toHaveText('No tools match.');
    await expect(page.locator('a[href="/merge-pdf"]')).toBeHidden();
  });

  test('shows a focus outline on the filter box', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(filterBox).focus();
    const outline = await page.getByLabel(filterBox).evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(outline).toEqual({ style: 'solid', width: '2px' });
  });

  test('draws the edge of the filter box dark enough to see', async ({ page }) => {
    await page.goto('/');
    const edge = await page.getByLabel(filterBox).evaluate((element) => getComputedStyle(element).borderTopColor);
    expect(edge).toBe('rgb(92, 92, 92)');
  });

  test('keeps the registry out of the script it ships', async ({ page, request }) => {
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(scripts.length).toBeGreaterThan(0);
    for (const url of scripts) {
      const source = await (await request.get(url)).text();
      // The meta description lives only in the registry. It must not be in any script.
      expect(source, url).not.toContain('in the order you choose');
    }
  });
});
