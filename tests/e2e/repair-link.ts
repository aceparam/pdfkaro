// The damaged notice's link to Repair PDF (add-repair-pdf, group 8), checked the same way on every PDF tool's page:
// after the button that carries on without the file, in the page and in Tab order, on its own line, at least 44px
// tall, to Repair PDF's plain address with nothing of the file in it.

import { expect, type Page } from '@playwright/test';
import { repairLinkLabel, repairSentence } from '../../src/widget/failures';

export { repairLinkLabel, repairSentence };

export const repairLink = (page: Page) => page.getByRole('link', { name: repairLinkLabel });

/**
 * The notice shows the sentence and the link after the button named `button`, which Tab reaches first; the link is
 * at least 44px tall, apart from the button, and goes to /repair-pdf under the page's own origin, with no query or fragment.
 */
export async function expectRepairLink(page: Page, button: 'Leave this file out' | 'Choose another file' = 'Choose another file') {
  const link = repairLink(page);
  await expect(link).toBeVisible();
  await expect(page.locator('p:not([role=status])', { hasText: repairSentence })).toBeVisible();
  const href = await link.getAttribute('href');
  const address = new URL(href!, page.url());
  expect(address.origin).toBe(new URL(page.url()).origin);
  expect(address.pathname).toMatch(/\/repair-pdf$/);
  expect(address.search).toBe('');
  expect(address.hash).toBe('');
  expect(await link.getAttribute('target')).toBeNull();
  const box = await link.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const leave = page.getByRole('button', { name: button }).last();
  const leaveBox = await leave.boundingBox();
  // On its own line, below the button.
  expect(box!.y).toBeGreaterThanOrEqual(leaveBox!.y + leaveBox!.height);
  // After the button in the page's order, so Tab reaches the button first.
  expect(await leave.evaluate((element, other) => Boolean(element.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await link.elementHandle())).toBe(true);
}
