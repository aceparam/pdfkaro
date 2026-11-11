import { useEffect, useRef, type RefObject } from 'react';
import styles from './FilePicker.module.css';

type Props = {
  /** The button's words: "Choose PDF files". */
  label: string;
  /** File types to offer in the chooser, such as "application/pdf". */
  accepts: string[];
  multiple: boolean;
  onFiles(files: File[]): void;
  /** The main button look, or the plainer look used once files are listed. */
  look?: 'main' | 'secondary';
  /** Lets a parent move focus to the picker. */
  inputRef?: RefObject<HTMLInputElement | null>;
  id?: string;
};

/**
 * A real file input inside a label that looks like a button. It works with the
 * keyboard, and files chosen before the page's script has loaded are taken as
 * soon as it has. The input is emptied after each pick, so it never holds files.
 */
export function FilePicker({ label, accepts, multiple, onFiles, look = 'main', inputRef, id }: Props) {
  const ownRef = useRef<HTMLInputElement | null>(null);
  const ref = inputRef ?? ownRef;

  const take = (input: HTMLInputElement) => {
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (picked.length > 0) onFiles(picked);
  };

  // Files chosen before the script loaded are already in the input.
  useEffect(() => {
    if (ref.current && (ref.current.files?.length ?? 0) > 0) take(ref.current);
    // Run once, when the picker wakes up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <label className={`${look === 'main' ? 'button' : 'button-secondary'} ${styles.picker}`}>
      <input
        ref={ref}
        id={id}
        className={styles.input}
        type="file"
        accept={accepts.join(',')}
        multiple={multiple}
        onChange={(event) => take(event.currentTarget)}
      />
      {label}
    </label>
  );
}
