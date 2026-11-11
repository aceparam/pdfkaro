import { footerLinks } from '../../src/site';
import { allPages as registryPages } from '../../src/tools/queries';
import { tools } from '../../src/tools/registry';

// The lists below come from the registry and the footer, so a new tool or
// page is checked without anyone remembering to add it here.

/** Every tool URL in the registry. */
export const toolPages = registryPages(tools).map(({ page }) => `/${page.slug}`);

/** Every meta description in the registry. They must never reach a script. */
export const registryDescriptions = registryPages(tools).map(({ page }) => page.description);

/** The site pages linked from the footer. */
export const sitePages = footerLinks.map((link) => link.href);

/** Tool URLs whose tool has its widget, and so ships the one island. */
export const widgetPages = registryPages(tools)
  .filter(({ tool }) => tool.widget)
  .map(({ page }) => `/${page.slug}`);

/** Pages with nothing to interact with yet. Tool pages leave this list when the tool widget arrives. */
export const staticPages = [...toolPages.filter((path) => !widgetPages.includes(path)), ...sitePages, '/no-such-page'];

export const allPages = ['/', ...toolPages, ...sitePages, '/no-such-page'];

// Words that SPEC.md bans from every page.
export const bannedWords = [
  'seamless',
  'effortless',
  'powerful',
  'blazing',
  'supercharge',
  'unlock',
  'elevate',
  'revolutionise',
  'all-in-one',
  '100%',
];
