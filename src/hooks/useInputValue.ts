import { useCallback, useSyncExternalStore } from 'react';

/**
 * The current text of an input, found by its id.
 *
 * The input is left to the browser, so text typed before this script loads is
 * kept, and is read as soon as the component wakes up. On the server the text
 * is always empty.
 */
export function useInputValue(inputId: string): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const input = document.getElementById(inputId);
      input?.addEventListener('input', onChange);
      return () => input?.removeEventListener('input', onChange);
    },
    [inputId],
  );

  const read = useCallback(() => {
    const input = document.getElementById(inputId);
    return input instanceof HTMLInputElement ? input.value : '';
  }, [inputId]);

  return useSyncExternalStore(subscribe, read, () => '');
}
