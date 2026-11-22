// The published tools that do not run in the browser, by id. Shared by the guards that hold
// the site's words to where files go: the tagline (site.test.ts) and the Privacy page
// (privacy-page.test.ts). Empty today: every published tool runs in the browser.

import type { Tool } from '../../src/tools/registry';

export function serverTools(tools: readonly Pick<Tool, 'id' | 'runsIn'>[]): string[] {
  return tools.filter((tool) => tool.runsIn !== 'browser').map((tool) => tool.id);
}
