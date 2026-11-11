import type { ReactNode, Ref } from 'react';
import styles from './Notice.module.css';

type Props = {
  heading: string;
  children?: ReactNode;
  /** Lets a parent move focus to the heading. */
  headingRef?: Ref<HTMLHeadingElement>;
};

/** A problem or warning the visitor should read. It announces nothing by itself; the parent decides. */
export function Notice({ heading, children, headingRef }: Props) {
  return (
    <section className={styles.notice}>
      <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>
        {heading}
      </h2>
      {children}
    </section>
  );
}
