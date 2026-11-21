// Keyboard rules shared by the widget's typed fields, as plain functions.

/** The parts of a key event the rule reads. */
type KeyEventLike = { key: string; keyCode?: number; nativeEvent?: { isComposing?: boolean } };

/**
 * Whether a key press in a typed field should do what its button does: Enter, but not the Enter
 * that confirms a word in an input method or a phone keyboard's suggestion, which browsers mark as
 * composing or with key code 229.
 */
export function pressesButton(event: KeyEventLike): boolean {
  if (event.nativeEvent?.isComposing === true || event.keyCode === 229) return false;
  return event.key === 'Enter';
}
