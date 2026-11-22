import { useId, useState, type Ref } from 'react';
import { passwordStaysSentence } from '../../widget/format';
import { pressesButton } from '../../widget/keys';
import styles from './PasswordField.module.css';

type Props = {
  fileName: string;
  /** Shown, and read with the field, after a wrong password. */
  error?: string;
  onSubmit(password: string): void;
  onLeaveOut(): void;
  /** The words of the button that goes on without this file: "Leave this file out", or "Choose another file" when it is the only one. */
  leaveLabel?: string;
  inputRef?: Ref<HTMLInputElement>;
};

/**
 * Asks for one file's password. It sits in no form and the field has no name,
 * so the password can never be sent to an address. Enter does the same as the button.
 * The field is uncontrolled: what is typed is kept in state for the button to read,
 * but never passed back as `value`, which React would write into the HTML `value`
 * attribute, putting the password in the markup.
 */
export function PasswordField({ fileName, error, onSubmit, onLeaveOut, inputRef, leaveLabel = 'Leave this file out' }: Props) {
  const [value, setValue] = useState('');
  const id = useId();
  const submit = () => {
    if (value !== '') onSubmit(value);
  };
  return (
    <div className={styles.group}>
      <div className="field field-short">
        <label htmlFor={`${id}-input`}>Password for {fileName}</label>
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="password"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-note`}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (pressesButton(event)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <p id={`${id}-note`} className={styles.note}>
          {error && <strong className={styles.error}>{error} </strong>}
          {`${passwordStaysSentence} It is not sent anywhere.`}
        </p>
      </div>
      <div className="actions">
        <button type="button" className="button" onClick={submit}>
          Open the file
        </button>
        <button type="button" className="button-secondary" onClick={onLeaveOut}>
          {leaveLabel}
        </button>
      </div>
    </div>
  );
}
