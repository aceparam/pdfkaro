// Words and links that every page shares.

export const siteName = 'PDFkaro';
export const tagline = 'Every PDF job, done in your browser.';

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
