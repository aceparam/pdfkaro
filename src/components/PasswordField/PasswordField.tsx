import { useId, useState, type Ref } from 'react';
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
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-note`}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        <p id={`${id}-note`} className={styles.note}>
          {error && <strong className={styles.error}>{error} </strong>}
          The password stays in your browser. It is not sent anywhere.
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
