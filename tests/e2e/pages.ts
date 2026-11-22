import { footerLinks } from '../../src/site';
import { hubPages as registryHubs, allPages as registryPages } from '../../src/tools/queries';
import { groups, tools } from '../../src/tools/registry';

// The lists below come from the registry and the footer, so a new tool or
// page is checked without anyone remembering to add it here.

/** Every tool URL in the registry. */
export const toolPages = registryPages(tools).map(({ page }) => `/${page.slug}`);

/** Every meta description in the registry. They must never reach a script. */
export const registryDescriptions = registryPages(tools).map(({ page }) => page.description);

/** The site pages linked from the footer. */
export const sitePages = footerLinks.map((link) => link.href);

/** The footer pages that still show an owner placeholder, and so carry noindex. */
export const placeholderPages = footerLinks.filter((link) => !link.written).map((link) => link.href);

/** Each group's hub page, for the groups with a published tool, with what it lists. */
export const hubs = registryHubs(groups, tools, '/');

/** The hub page URLs. */
export const hubPages = hubs.map((hub) => `/${hub.slug}`);

/** Tool URLs whose tool has its widget, and so ships the one island. */
export const widgetPages = registryPages(tools)
  .filter(({ tool }) => tool.widget)
  .map(({ page }) => `/${page.slug}`);

/** Pages with nothing to interact with yet. Tool pages leave this list when the tool widget arrives. */
export const staticPages = [...toolPages.filter((path) => !widgetPages.includes(path)), ...hubPages, ...sitePages, '/no-such-page'];

export const allPages = ['/', ...toolPages, ...hubPages, ...sitePages, '/no-such-page'];

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
