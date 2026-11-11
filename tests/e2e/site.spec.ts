import { expect, test } from '@playwright/test';
import { allPages, bannedWords, sitePages, staticPages, toolPages } from './pages';

test.describe('every page', () => {
  for (const path of allPages) {
    test(`${path} keeps to the look and the rules`, async ({ page, baseURL }) => {
      const requests: { url: string; type: string }[] = [];
      page.on('request', (request) => requests.push({ url: request.url(), type: request.resourceType() }));
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      // One heading, and words that follow the rules.
      await expect(page.locator('h1')).toHaveCount(1);
      const text = (await page.locator('body').innerText()).toLowerCase();
      for (const word of bannedWords) expect(text, `banned word "${word}"`).not.toContain(word);
      expect(text).not.toContain('!');

      // 17px text, a header that scrolls away, five footer links.
      expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('17px');
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('header')!).position)).toBe('static');
      await expect(page.locator('footer a')).toHaveCount(5);

      // The real site, at the root of its address, does not ask search engines to stay away.
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

      // Nothing scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      // Everything comes from the site itself, and no font or image is fetched.
      for (const request of requests) {
        expect(new URL(request.url).origin, request.url).toBe(new URL(baseURL!).origin);
        expect(['font', 'image'], request.url).not.toContain(request.type);
      }
    });
  }

  test('every page has its own title', async ({ page }) => {
    const titles: string[] = [];
    for (const path of allPages) {
      await page.goto(path);
      titles.push(await page.title());
    }
    expect(new Set(titles).size).toBe(titles.length);
  });

  test('every link and control is at least 44px tall', async ({ page }) => {
    for (const path of allPages) {
      await page.goto(path);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('a, button, input')]
          // A file input is hidden inside its label, which is what a finger presses.
          .map((element) => (element.matches('input[type=file]') ? (element.closest('label') ?? element) : element))
          .filter((element) => element.getBoundingClientRect().height < 44 && !element.closest('[hidden]'))
          .map((element) => element.textContent || element.id),
      );
      expect(small, path).toEqual([]);
    }
  });
});

test.describe('pages with nothing to interact with', () => {
  for (const path of staticPages) {
    test(`${path} loads no script`, async ({ page }) => {
      const scripts: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'script') scripts.push(request.url());
      });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('script')).toHaveCount(0);
      expect(scripts).toEqual([]);
    });
  }
});

test.describe('the lists of pages', () => {
  test('cover every tool in the registry and every footer link', async ({ page }) => {
    expect(toolPages.length).toBeGreaterThan(0);
    await page.goto('/');
    const footer = await page.locator('footer a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(footer).toEqual(sitePages);
    for (const path of [...toolPages, ...sitePages]) {
      expect((await page.request.get(path)).status(), path).toBe(200);
    }
  });
});

test.describe('tool page', () => {
  test('has its heading and sentence in the served HTML', async ({ request }) => {
    const html = await (await request.get('/merge-pdf')).text();
    expect(html).toContain('<h1>Merge PDF files</h1>');
    expect(html).toContain('Combine several PDFs into one. Files stay on your device.');
  });

  test('shows no related tools heading while none is published', async ({ page }) => {
    await page.goto('/merge-pdf');
    await expect(page.getByRole('heading', { name: 'Related tools' })).toHaveCount(0);
  });
});

test.describe('page not found', () => {
  test('answers 404 and links to the list of tools', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await page.getByRole('link', { name: 'See the list of all tools' }).click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('placeholder pages', () => {
  test('the contact page shows no address', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('main')).toContainText('No contact address has been added yet.');
    expect(await page.locator('main').innerText()).not.toContain('@');
    await expect(page.locator('main a')).toHaveCount(0);
  });

  test('the privacy page makes no claim', async ({ page }) => {
    await page.goto('/privacy');
    expect((await page.locator('main').innerText()).trim()).toBe('Privacy\n\nThis page has not been written yet.');
  });
});

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('follows the device setting', async ({ page }) => {
    await page.goto('/');
    const colours = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return { background: style.backgroundColor, text: style.color };
    });
    expect(colours.background).toBe('rgb(23, 22, 20)');
    expect(colours.text).toBe('rgb(236, 235, 230)');
  });
});
