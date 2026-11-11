import { useEffect } from 'react';

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Takes files dropped anywhere on the page, or pasted, and hands them on while
 * `enabled`. A file dropped while not enabled is still kept from the browser,
 * which would otherwise open it in place of the page and lose the visitor's
 * work. Drags of anything else, such as text, are left to the browser.
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true): void {
  useEffect(() => {
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (!enabled) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles(files);
    };
    const paste = (event: ClipboardEvent) => {
      if (!enabled) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      onFiles(files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, [onFiles, enabled]);
}
