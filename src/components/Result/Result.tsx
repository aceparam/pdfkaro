import type { Ref } from 'react';
import styles from './Result.module.css';

type Props = {
  heading: string;
  name: string;
  /** "11.6 MB, 120 pages" */
  detail: string;
  href: string;
  notes: string[];
  onStartAgain(): void;
  headingRef?: Ref<HTMLHeadingElement>;
};

/** The finished file. Nothing downloads until the visitor presses Download. */
export function Result({ heading, name, detail, href, notes, onStartAgain, headingRef }: Props) {
  return (
    <section className={styles.result}>
      <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>
        {heading}
      </h2>
      <div>
        <div className={styles.name}>{name}</div>
        <div className="muted">{detail}</div>
      </div>
      <a className={`button ${styles.download}`} href={href} download={name}>
        Download
      </a>
      {notes.map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}
      <div>
        <button type="button" className="button-secondary" onClick={onStartAgain}>
          Start again
        </button>
      </div>
    </section>
  );
}
