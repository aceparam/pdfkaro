import type { Ref } from 'react';
import type { TextOption } from '../../tools/registry';
import styles from './TextField.module.css';

type Props = {
  option: TextOption;
  /** The field's id, unique on the page. The sentence and the hint take ids built from it. */
  id: string;
  /** The text exactly as typed. */
  raw: string;
  /** What is wrong with it, shown between the label and the field. Left out while nothing is, or while it is only empty. */
  error?: string;
  onType(value: string): void;
  /** Enter in the field: does what the main button does. */
  onEnter(): void;
  /** Put on the field, so focus can move to it. */
  focusRef?: Ref<HTMLInputElement>;
};

/** The id of a text field's sentence about what is wrong, which the main button points at too. */
export const errorId = (id: string) => `${id}-error`;

/**
 * One typed text, one line: a visible label, the sentence about what is wrong (if any) between the
 * label and the field, where a phone keyboard does not cover it, and the hint under the field, read
 * with it. No name and no form, so it is never submitted to an address; `autocomplete="off"` keeps it
 * out of the browser's form memory and saved form state, and `spellcheck="false"` from an online
 * spell checker. No `maxlength`, so a paste is never cut without a word. No hooks, so it can be drawn
 * and tested on its own.
 */
export function TextField({ option, id, raw, error, onType, onEnter, focusRef }: Props) {
  const hintId = `${id}-hint`;
  return (
    <div className={`field field-short ${styles.text}`}>
      <label htmlFor={id}>{option.label}</label>
      {error ? (
        <p id={errorId(id)} className={styles.error}>
          {error}
        </p>
      ) : null}
      <input
        ref={focusRef}
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        value={raw}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${errorId(id)} ${hintId}` : hintId}
        onChange={(event) => onType(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onEnter();
          }
        }}
      />
      <p id={hintId} className={styles.note}>
        {option.hint}
      </p>
    </div>
  );
}
