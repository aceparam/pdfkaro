import type { Ref } from 'react';
import type { ChoiceOption } from '../../tools/registry';
import styles from './ChoiceGroup.module.css';

type Props = {
  option: ChoiceOption;
  /** The value shown as chosen. */
  value: string;
  /** The radio buttons' shared name, unique on the page. */
  name: string;
  onChoose(value: string): void;
  /** Put on the chosen radio button, so focus can move to it. */
  chosenRef?: Ref<HTMLInputElement>;
};

/**
 * One choice: native radio buttons, one per line, in a fieldset named by its legend. The browser's
 * own radio group gives one Tab stop, the arrow keys and the "1 of 6" a screen reader says, so no
 * ARIA role is added. No hooks, so it can be drawn and tested on its own.
 */
export function ChoiceGroup({ option, value, name, onChoose, chosenRef }: Props) {
  return (
    <fieldset className={styles.choiceGroup}>
      <legend className={styles.legend}>{option.legend}</legend>
      {option.choices.map((choice) => (
        <label key={choice.value} className={styles.choice}>
          <input
            ref={choice.value === value ? chosenRef : undefined}
            type="radio"
            name={name}
            value={choice.value}
            checked={choice.value === value}
            onChange={() => onChoose(choice.value)}
          />
          <span>{choice.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
