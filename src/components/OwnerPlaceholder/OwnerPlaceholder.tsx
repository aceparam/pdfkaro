import type { ReactNode } from 'react';
import styles from './OwnerPlaceholder.module.css';

type Props = {
  /** The line that says the page is not there yet. */
  title: string;
  /** One sentence on what will go here, if anything can be said. */
  children?: ReactNode;
};

/** A marked box for a page that has not been written. It never holds made-up content. */
export function OwnerPlaceholder({ title, children }: Props) {
  return (
    <div className={styles.box}>
      <p>
        <strong>{title}</strong>
      </p>
      {children && <p>{children}</p>}
    </div>
  );
}
