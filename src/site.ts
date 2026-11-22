// Words and links that every page shares, and the checks on the build's
// address settings. No imports, so astro.config.mjs and scripts/check-seo.mjs
// can import this file straight into Node.

export const siteName = 'PDFkaro';
export const tagline = 'Every PDF job, done in your browser.';

/**
 * Puts the site's base path in front of a path that starts at the site root.
 * The base is "/" when the site sits at the root of its address, and something
 * like "/pdfkaro" when a preview sits under a sub-path. Every link the site
 * writes goes through this, so the same build works in both places.
 *
 * Only a path that starts at the site root is changed. A full address, a
 * "mailto:" link or a "#fragment" is returned as it is.
 */
export function withBase(base: string, path: string): string {
  const startsAtRoot = path.startsWith('/') && !path.startsWith('//');
  if (!startsAtRoot) return path;
  const prefix = base.replace(/\/+$/, '');
  if (prefix === '') return path;
  return path === '/' ? `${prefix}/` : `${prefix}${path}`;
}

/**
 * The site's origin when no SITE_ORIGIN is set: the address `npm run preview` and the
 * end-to-end tests serve. A local or CI build can then never point a canonical tag at a
 * real domain. playwright.config.ts writes the same address as its baseURL.
 */
export const defaultOrigin = 'http://localhost:4321';

/**
 * True for a plain origin the build may write into every absolute address: a lower-case
 * https host with no port, path, query, fragment or trailing slash, or localhost with a port.
 */
export function isSiteOrigin(value: string): boolean {
  return (
    /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value) ||
    /^http:\/\/localhost:[0-9]{1,5}$/.test(value)
  );
}

/** True for a base path the build may put in front of every link: "/" or a plain path such as "/pdfkaro". */
export function isSiteBase(value: string): boolean {
  return /^\/$|^(\/[A-Za-z0-9._-]+)+$/.test(value);
}

/** The absolute address of a path from the site root: the origin, then the path under the base. */
export function absoluteUrl(origin: string, base: string, path: string): string {
  return `${origin}${withBase(base, path)}`;
}

export type SiteLink = {
  label: string;
  href: string;
};

export type FooterLink = SiteLink & {
  /**
   * False while the page still shows an owner placeholder. Such a page carries `noindex`
   * and is left out of the sitemap. Set it to true in the change that writes the page.
   */
  written: boolean;
};

export const headerLinks: SiteLink[] = [{ label: 'All tools', href: '/' }];

export const footerLinks: FooterLink[] = [
  { label: 'About', href: '/about', written: false },
  { label: 'Privacy', href: '/privacy', written: false },
  { label: 'Changes', href: '/changes', written: false },
  { label: 'Known problems', href: '/known-problems', written: false },
  { label: 'Contact', href: '/contact', written: false },
];

/** The footer entry of a site page, by its path. Throws for a path with no entry, so a page cannot pass a wrong one. */
export function footerPage(href: string): FooterLink {
  const link = footerLinks.find((each) => each.href === href);
  if (!link) throw new Error(`No footer link has the path "${href}".`);
  return link;
}
