import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ToolWidgetWords } from '../../tools/registry';
import { useFileDrop } from '../../hooks/useFileDrop';
import { FilePicker } from '../FilePicker/FilePicker';
import styles from './ToolWidget.module.css';

// Everything after the first pick, including the worker, loads only then.
const ToolWorkspace = lazy(() => import('../ToolWorkspace/ToolWorkspace'));

type Props = {
  toolId: string;
  /** File types the tool accepts, from the registry. */
  accepts: string[];
  words: ToolWidgetWords;
};

export type FileBatch = { id: number; files: File[] };

/**
 * The one island on every tool page. Before a file is picked it is only the
 * file picker; after, it loads the workspace, which does the rest.
 */
export function ToolWidget({ toolId, accepts, words }: Props) {
  const [batch, setBatch] = useState<FileBatch | null>(null);
  const [returned, setReturned] = useState(false);
  const [message, setMessage] = useState('');
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const nextBatch = useRef(1);

  const take = useCallback((files: File[]) => {
    setMessage('');
    setBatch({ id: nextBatch.current++, files });
  }, []);

  // Before the workspace exists, drops and pastes start it; after, it takes them itself.
  useFileDrop(take, batch === null);

  const onEmpty = useCallback((why?: string) => {
    setBatch(null);
    setReturned(true);
    setMessage(why ?? '');
  }, []);

  // Leaving the page forgets the files at once, so a page kept for the Back
  // button holds no file or name. Unmounting the workspace ends its worker and
  // clears its memory too.
  useEffect(() => {
    const forget = () =>
      flushSync(() => {
        setBatch(null);
        setMessage('');
      });
    window.addEventListener('pagehide', forget);
    return () => window.removeEventListener('pagehide', forget);
  }, []);

  useEffect(() => {
    if (returned && batch === null) pickerRef.current?.focus();
  }, [returned, batch]);

  // The status line under the picker stays on the page through every step, so
  // that a message put in it is read out: one that appears together with its
  // text may not be.
  return (
    <div className={styles.widget}>
      {batch === null ? (
        <>
          <FilePicker label={words.pickerLabel} accepts={accepts} multiple={words.multiple} onFiles={take} inputRef={pickerRef} />
          <p className={styles.hint}>{words.dropHint}</p>
        </>
      ) : (
        <Suspense fallback={<p>Getting ready</p>}>
          <ToolWorkspace toolId={toolId} accepts={accepts} words={words} firstFiles={batch.files} onEmpty={onEmpty} />
        </Suspense>
      )}
      <p role="status" className={message ? styles.message : 'visually-hidden'}>
        {message}
      </p>
    </div>
  );
}
