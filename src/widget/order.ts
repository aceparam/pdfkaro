// The line above the pages of a tool whose pages move: Reorder pages.
// A plain function, tested in Node.

const howToMove = 'Press “Earlier” or “Later” under a page to move it.';

/**
 * Whether the order has changed, and how to move a page. It gives no count:
 * after moving one page, "3 pages are in a new place" would read as a mistake.
 * It stops at the first page out of place.
 */
export function orderSummary(order: readonly number[] | null, pages: number): string {
  if (pages === 1) return 'This file has one page, so there is nothing to move.';
  const changed = order !== null && order.some((page, index) => page !== index + 1);
  return changed ? `The order has changed. ${howToMove}` : `Pages in their original order. ${howToMove}`;
}

/** The order to send the engine: the one shown, or every page in its place. */
export function orderToSend(order: readonly number[] | null, pages: number): number[] {
  return order ? [...order] : Array.from({ length: pages }, (_, index) => index + 1);
}
