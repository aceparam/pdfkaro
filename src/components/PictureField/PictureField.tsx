import type { RefObject } from 'react';
import type { PictureOption } from '../../tools/registry';
import type { PictureMime } from '../../widget/option-values';
import { FilePicker } from '../FilePicker/FilePicker';
import styles from './PictureField.module.css';

type Props = {
  option: PictureOption;
  /** The field's id, unique on the page. The label, the line, the sentence and the hint take ids built from it. */
  id: string;
  /** The tool's types for this picture, offered in the system's chooser. */
  types: readonly PictureMime[];
  /** Whether a picture is chosen or was tried (`picturePicked`), so the button reads "Choose another picture". Not after a wrong pick, which leaves none chosen. */
  picked: boolean;
  /** The line naming the chosen picture: "signature.png, 120 KB." Left out when none is chosen, or for a problem. */
  chosen?: string | null;
  /** What is wrong with the picture picked, shown between the label and the button. */
  error?: string | null;
  /** One picture was chosen in the system's chooser. */
  onPick(file: File): void;
  /** Put on the button's file input, so focus can move to it. */
  focusRef?: RefObject<HTMLInputElement | null>;
};

/** The id of a picture field's sentence about what is wrong, which the main button points at too. */
export const pictureErrorId = (id: string) => `${id}-error`;

/**
 * One picture chosen beside the tool's file: a visible label, the sentence about what is wrong (if any), the line
 * naming the picture (if one is chosen), a secondary button that opens the system's chooser for one picture of the
 * tool's types, and the hint. The button reads its words, then the label, the line, the sentence and the hint, in
 * that order, each once. The picture itself is never shown, decoded or given an address: "Look and feel" allows no
 * image but the visitor's own page thumbnails. Not inside the site's `field` class, whose input and label rules
 * would make the button bold and full width and undo the hidden input's 1px size. No hooks, so it can be drawn and
 * tested on its own.
 */
export function PictureField({ option, id, types, picked, chosen, error, onPick, focusRef }: Props) {
  const labelId = `${id}-label`;
  const chosenId = `${id}-chosen`;
  const hintId = `${id}-hint`;
  return (
    <div className={styles.picture}>
      <p id={labelId} className={styles.label}>
        {option.label}
      </p>
      {error ? (
        <p id={pictureErrorId(id)} className={styles.error}>
          {error}
        </p>
      ) : null}
      {chosen ? (
        <p id={chosenId} className={styles.chosen}>
          {chosen}
        </p>
      ) : null}
      <FilePicker
        id={id}
        label={picked ? option.againLabel : option.pickLabel}
        accepts={[...types]}
        multiple={false}
        look="secondary"
        onFiles={(files) => {
          const first = files[0];
          if (first !== undefined) onPick(first);
        }}
        describedBy={[labelId, chosen ? chosenId : null, error ? pictureErrorId(id) : null, hintId]}
        inputRef={focusRef}
      />
      <p id={hintId} className={styles.note}>
        {option.hint}
      </p>
    </div>
  );
}
