import type { SiteLink } from '../../site';
import styles from './SiteHeader.module.css';

type Props = {
  siteName: string;
  /** Where the site name links to: the home page. */
  homeHref: string;
  links: SiteLink[];
};

/** The site name as a link, then plain links. It scrolls away with the page. */
export function SiteHeader({ siteName, homeHref, links }: Props) {
  return (
    <header className={styles.header}>
      <a className={styles.name} href={homeHref}>
        {siteName}
      </a>
      {links.map((link) => (
        <a key={link.href + link.label} href={link.href}>
          {link.label}
        </a>
      ))}
    </header>
  );
}
