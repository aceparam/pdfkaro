import { readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';
import { expectNothingStored } from './no-upload';
import { draftSentence } from '../../src/site';
import { allPages, bannedWords, hubPages, hubs, sitePages, unwrittenPages, staticPages, toolPages } from './pages';

/** Every file in the build, as the address path a browser asks for at the root. */
const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../dist');
const builtPaths = new Set(
  readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${relative(distDir, join(entry.parentPath, entry.name)).split(sep).join('/')}`),
);

/** The built file an address path is served from: "/" is index.html, a page path its .html file. */
function builtFileOf(pathname: string): string {
  if (pathname === '/') return '/index.html';
  if (pathname.endsWith('/')) return `${pathname}index.html`;
  return /\.[a-z0-9]+$/i.test(pathname.slice(pathname.lastIndexOf('/'))) ? pathname : `${pathname}.html`;
}

test.describe('every page', () => {
  for (const path of allPages) {
    test(`${path} keeps to the look and the rules`, async ({ page, context, baseURL }) => {
      const requests: { url: string; type: string; method: string; body: string | null }[] = [];
      page.on('request', (request) => requests.push({ url: request.url(), type: request.resourceType(), method: request.method(), body: request.postData() }));
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

      // The real site, at the root of its address, asks search engines to stay away only from a page
      // that still shows an owner placeholder or an agent's draft.
      await expect(page.locator('meta[name="robots"]')).toHaveCount(unwrittenPages.includes(path) ? 1 : 0);

      // Nothing scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      // Everything comes from the site itself, and no font or image is fetched.
      for (const request of requests) {
        expect(new URL(request.url).origin, request.url).toBe(new URL(baseURL!).origin);
        expect(['font', 'image'], request.url).not.toContain(request.type);
        // The social image, the sitemap and robots.txt are for crawlers and link previews only.
        expect(new URL(request.url).pathname, request.url).not.toMatch(/\/(social\.png|sitemap\.xml|robots\.txt)$/);
        // A plain GET with nothing sent: no body, no query string, and a file that is in the build. The page
        // with no file of its own is served the 404 page.
        expect(request.method, request.url).toBe('GET');
        expect(request.body, request.url).toBeNull();
        expect(new URL(request.url).search, request.url).toBe('');
        const pathname = new URL(request.url).pathname;
        const file = path === '/no-such-page' && pathname === path ? '/404.html' : builtFileOf(pathname);
        expect(builtPaths.has(file), `${request.url} is not a file in the build`).toBe(true);
      }

      // No cookie, and nothing in the browser's storage.
      await expectNothingStored(page, context);
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
  test('cover every tool in the registry, every hub page and every footer link', async ({ page }) => {
    expect(toolPages.length).toBeGreaterThan(0);
    expect(hubPages.length).toBeGreaterThan(0);
    for (const path of hubPages) expect((await page.request.get(path)).status(), path).toBe(200);
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

  // The related list only: the link to the group's hub page follows it in the same section.
  test('links only to related tools that are published', async ({ page }) => {
    await page.goto('/merge-pdf');
    await expect(page.getByRole('heading', { name: 'Related tools' })).toHaveCount(1);
    const related = page.locator('section', { has: page.getByRole('heading', { name: 'Related tools' }) }).getByRole('list').getByRole('link');
    // Compress PDF is published since its own change; JPG to PDF since Image to PDF.
    await expect(related).toHaveText(['Split PDF', 'Reorder pages', 'Rotate PDF', 'Compress PDF', 'JPG to PDF']);
    // Compress PDF names PDF to JPG, published since its own change. Every related tool named in the registry is
    // now published, so leaving out an unpublished one is checked in tests/unit/queries.test.ts.
    await page.goto('/compress-pdf');
    const own = page.locator('section', { has: page.getByRole('heading', { name: 'Related tools' }) }).getByRole('list').getByRole('link');
    await expect(own).toHaveText(['Merge PDF', 'Split PDF', 'Delete pages', 'JPG to PDF', 'PDF to JPG']);
    // A tool of several pages links each page to the others, never to itself.
    await page.goto('/pdf-to-jpg');
    const sibling = page.locator('section', { has: page.getByRole('heading', { name: 'Related tools' }) }).getByRole('list').getByRole('link');
    await expect(sibling).toHaveText(['PDF to PNG', 'JPG to PDF', 'Extract pages', 'Compress PDF', 'Split PDF']);
  });
});

test.describe('canonical tags', () => {
  test('equal the address the browser shows on the home page, a hub page and a tool page; the 404 page has none', async ({ page }) => {
    for (const path of ['/', '/organise-pages', '/merge-pdf']) {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      expect(await page.locator('link[rel="canonical"]').getAttribute('href'), path).toBe(page.url());
    }
    await page.goto('/no-such-page');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('meta[property^="og:"]')).toHaveCount(0);
  });
});

test.describe('hub pages', () => {
  test('list their tools as a list, and Tab reaches every tool link in order', async ({ page }) => {
    for (const hub of hubs) {
      await page.goto(`/${hub.slug}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(hub.name);
      await expect(page.locator('main p.lede')).toHaveText(hub.sentence);
      const list = page.locator('main ul');
      await expect(list).toHaveCount(1);
      await expect(list).toHaveAttribute('role', 'list');
      await expect(list.getByRole('listitem')).toHaveCount(hub.items.length);
      await expect(page.locator('main a')).toHaveText(hub.items.map((item) => item.name));
    }

    // Tab from the last link of the header into the list, through every tool in order.
    const organise = hubs.find((hub) => hub.slug === 'organise-pages')!;
    await page.goto('/organise-pages');
    await page.locator('header a').last().focus();
    for (const item of organise.items) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toHaveAttribute('href', item.href);
      expect(await focused.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
    }
  });
});

test.describe('the link from a tool page to its hub page', () => {
  test('follows the related tools, is at least 44px tall and opens the hub page', async ({ page }) => {
    await page.goto('/merge-pdf');
    const below = page.locator('section', { has: page.getByRole('heading', { name: 'Related tools' }) });
    const links = await below.getByRole('link').allTextContents();
    expect(links.at(-1)).toBe('All tools in Organise pages');
    expect(links.slice(0, -1)).toEqual(['Split PDF', 'Reorder pages', 'Rotate PDF', 'Compress PDF', 'JPG to PDF']);
    const hub = page.getByRole('link', { name: 'All tools in Organise pages' });
    await expect(hub).toHaveCount(1);
    expect((await hub.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // It takes focus straight after the last related tool.
    await below.getByRole('link', { name: 'JPG to PDF' }).focus();
    await page.keyboard.press('Tab');
    await expect(hub).toBeFocused();

    await hub.click();
    await expect(page).toHaveURL('/organise-pages');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organise pages');
  });

  test('every tool page links to its own hub page', async ({ request }) => {
    for (const hub of hubs) {
      for (const item of hub.items) {
        const html = await (await request.get(item.href)).text();
        expect(html, item.href).toContain(`<a class="tap" href="/${hub.slug}">All tools in ${hub.name}</a>`);
      }
    }
  });
});

test.describe('home page group headings', () => {
  test('hold no link, as before', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h2 a')).toHaveCount(0);
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

test.describe('placeholder and draft pages', () => {
  test('the contact page shows no address', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('main')).toContainText('No contact address has been added yet.');
    expect(await page.locator('main').innerText()).not.toContain('@');
    await expect(page.locator('main a')).toHaveCount(0);
  });

  test('the privacy page is a marked draft', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Privacy');
    expect((await page.locator('main p').first().innerText()).startsWith(draftSentence)).toBe(true);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('main a')).toHaveCount(0);
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
