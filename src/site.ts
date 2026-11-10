// Words and links that every page shares.

export const siteName = 'PDFkaro';
export const tagline = 'Every PDF job, done in your browser.';

/**
 * Puts the site's base path in front of a path that starts at the site root.
 * The base is "/" when the site sits at the root of its address, and something
 * like "/pdfkaro" when a preview sits under a sub-path. Every link the site
 * writes goes through this, so the same build works in both places.
 */
export function withBase(base: string, path: string): string {
  const prefix = base.replace(/\/+$/, '');
  if (prefix === '') return path;
  return path === '/' ? `${prefix}/` : `${prefix}${path}`;
}

export type SiteLink = {
  label: string;
  href: string;
};

export const headerLinks: SiteLink[] = [{ label: 'All tools', href: '/' }];

export const footerLinks: SiteLink[] = [
  { label: 'About', href: '/about' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Changes', href: '/changes' },
  { label: 'Known problems', href: '/known-problems' },
  { label: 'Contact', href: '/contact' },
];
