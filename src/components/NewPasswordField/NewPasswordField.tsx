import type { Ref } from 'react';
import type { NewPasswordOption } from '../../tools/registry';
import { passwordStaysSentence } from '../../widget/format';
import { pressesButton } from '../../widget/keys';
import type { NewPasswordField as Field } from '../../widget/options';
import styles from './NewPasswordField.module.css';

type Props = {
  option: NewPasswordOption;
  /** The first field's id, unique on the page. The second field, the sentences and the hint take ids built from it. */
  id: string;
  /** What the first field holds, exactly as typed. */
  first: string;
  /** What the second field holds, exactly as typed. */
  again: string;
  /** What is wrong with the first field, shown between its label and the field. Left out while nothing is, or while the sentence goes under the main button. */
  firstError?: string;
  /** What is wrong with the second field (the two differ), shown between its label and the field. */
  againError?: string;
  onType(field: Field, value: string): void;
  /** Enter in either field: does what the main button does. */
  onEnter(field: Field): void;
  /** Focus left the first field, so a space at its end is no longer being typed. */
  onFirstBlur(): void;
  /** Put on the first field, so focus can move to it. */
  focusRef?: Ref<HTMLInputElement>;
};

/**
 * The rest of the note under the first field, after `passwordStaysSentence`. A draft for the owner. With
 * `autocomplete="new-password"` the browser may offer to save or suggest a password, so the note says so rather
 * than claiming the password goes nowhere at all. Part of the component, not registry words, so no tool can leave it out.
 */
export const newPasswordSavingNote =
  'This site does not send it anywhere. Your browser may offer to save it or to suggest one. A saved password is kept by your browser and may be copied to your browser account.';

/** The id of the first field's sentence about what is wrong, which the main button points at too. */
export const firstPasswordErrorId = (id: string) => `${id}-error`;
/** The id of the second field. */
export const againPasswordId = (id: string) => `${id}-again`;
/** The id of the second field's sentence about what is wrong, which the main button points at too. */
export const againPasswordErrorId = (id: string) => `${againPasswordId(id)}-error`;

/**
 * A new password, typed twice in two hidden one-line fields, one under the other: each with a visible label and,
 * between the label and the field where a phone keyboard does not cover it, the sentence about what is wrong. Under
 * the first, read with it, the tool's hint and the shared note. Both are `type="password"` always, so no keyboard
 * corrects or capitalises them and form restore does not keep them; `autocomplete="new-password"` is the token for a
 * password being set, so a password manager fills in no saved one. No name and no form, so neither is ever submitted
 * to an address; no `maxlength`, so a paste is never cut without a word. No hooks, so it can be drawn and tested on its own.
 */
export function NewPasswordField({ option, id, first, again, firstError, againError, onType, onEnter, onFirstBlur, focusRef }: Props) {
  const hintId = `${id}-hint`;
  const againId = againPasswordId(id);
  const keyDown = (field: Field) => (event: { key: string; keyCode?: number; nativeEvent?: { isComposing?: boolean }; preventDefault(): void }) => {
    // Not the Enter that confirms a word in an input method or a phone keyboard's suggestion.
    if (pressesButton(event)) {
      event.preventDefault();
      onEnter(field);
    }
  };
  return (
    <div className={styles.group}>
      <div className="field field-short">
        <label htmlFor={id}>{option.label}</label>
        {firstError ? (
          <p id={firstPasswordErrorId(id)} className={styles.error}>
            {firstError}
          </p>
        ) : null}
        <input
          ref={focusRef}
          id={id}
          type="password"
          autoComplete="new-password"
          enterKeyHint="go"
          value={first}
          aria-invalid={firstError ? true : undefined}
          aria-describedby={firstError ? `${firstPasswordErrorId(id)} ${hintId}` : hintId}
          onChange={(event) => onType('first', event.currentTarget.value)}
          onKeyDown={keyDown('first')}
          onBlur={onFirstBlur}
        />
        <p id={hintId} className={styles.note}>
          {`${option.hint} ${passwordStaysSentence} ${newPasswordSavingNote}`}
        </p>
      </div>
      <div className={`field field-short ${styles.again}`}>
        <label htmlFor={againId}>{option.againLabel}</label>
        {againError ? (
          <p id={againPasswordErrorId(id)} className={styles.error}>
            {againError}
          </p>
        ) : null}
        <input
          id={againId}
          type="password"
          autoComplete="new-password"
          enterKeyHint="go"
          value={again}
          aria-invalid={againError ? true : undefined}
          aria-describedby={againError ? againPasswordErrorId(id) : undefined}
          onChange={(event) => onType('again', event.currentTarget.value)}
          onKeyDown={keyDown('again')}
        />
      </div>
    </div>
  );
}
