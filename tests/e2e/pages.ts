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

/** Pages with nothing to interact with yet. Tool pages leave this list when the tool widget arrives. */
export const staticPages = [...toolPages, ...sitePages, '/no-such-page'];

export const allPages = ['/', ...staticPages];

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
