import type { SiteLink } from '../../site';
import styles from './SiteFooter.module.css';

type Props = {
  links: SiteLink[];
};

/** A row of plain text links. */
export function SiteFooter({ links }: Props) {
  return (
    <footer className={styles.footer}>
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </footer>
  );
}
