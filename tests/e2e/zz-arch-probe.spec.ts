import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
const here = dirname(fileURLToPath(import.meta.url));
const out = '/tmp/claude-0/-home-user-pdfkaro/ff0de6c5-bd64-53b4-8057-46c7c082958d/scratchpad/pw';
for (const slug of ['rotate-pdf', 'rearrange-pdf-pages', 'split-pdf'] as const) {
  test(`probe ${slug}`, async ({ page }) => {
    await page.goto('/' + slug);
    await page.waitForLoadState('networkidle');
    await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
    await page.locator('input[type=file]').first().setInputFiles(join(here, '../fixtures/mixed.pdf'));
    const cell = page.locator('astro-island ol > li').first();
    await cell.waitFor();
    await page.waitForTimeout(1500);
    const btns = cell.locator('button');
    const n = await btns.count();
    const btn = btns.nth(n - 1);
    await btn.focus();
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    const box = (await cell.boundingBox())!;
    await page.screenshot({ path: `${out}/v2-${slug}-${test.info().project.name}.png`, clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 } });
  });
}
