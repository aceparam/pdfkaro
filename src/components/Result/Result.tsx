import { useId, type Ref } from 'react';
import styles from './Result.module.css';

type Props = {
  heading: string;
  /**
   * The new file: its name, "11.6 MB, 120 pages" or "4.2 MB, was 11.8 MB, 64 pages", and its address.
   * Left out when the job gave none, because the file could not be improved.
   */
  file?: { name: string; detail: string; href: string };
  /** With no file: the one thing to try, said with the heading. */
  advice?: string;
  notes: string[];
  onStartAgain(): void;
  headingRef?: Ref<HTMLHeadingElement>;
};

/**
 * The finished file, or the words for a job that gave none. Nothing downloads
 * until the visitor presses Download, and with no file there is no Download.
 */
export function Result({ heading, file, advice, notes, onStartAgain, headingRef }: Props) {
  const adviceId = useId();
  return (
    <section className={styles.result}>
      {/* With no file, the advice is tied to the heading, so focus on the heading says both. */}
      <h2 ref={headingRef} tabIndex={-1} className={styles.heading} aria-describedby={!file && advice ? adviceId : undefined}>
        {heading}
      </h2>
      {file ? (
        <>
          <div>
            <div className={styles.name}>{file.name}</div>
            <div className="muted">{file.detail}</div>
          </div>
          <a className={`button ${styles.download}`} href={file.href} download={file.name}>
            Download
          </a>
          {notes.map((note) => (
            <p key={note} className={styles.note}>
              {note}
            </p>
          ))}
        </>
      ) : advice ? (
        <p id={adviceId} className={styles.note}>
          {advice}
        </p>
      ) : null}
      <div>
        <button type="button" className="button-secondary" onClick={onStartAgain}>
          Start again
        </button>
      </div>
    </section>
  );
}
