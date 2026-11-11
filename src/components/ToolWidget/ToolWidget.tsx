import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
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
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const nextBatch = useRef(1);

  const take = useCallback((files: File[]) => {
    setBatch({ id: nextBatch.current++, files });
  }, []);

  // Before the workspace exists, drops and pastes start it; after, it takes them itself.
  useFileDrop(take, batch === null);

  const onEmpty = useCallback(() => {
    setBatch(null);
    setReturned(true);
  }, []);

  useEffect(() => {
    if (returned && batch === null) pickerRef.current?.focus();
  }, [returned, batch]);

  if (batch === null) {
    return (
      <div className={styles.widget}>
        <FilePicker label={words.pickerLabel} accepts={accepts} multiple={words.multiple} onFiles={take} inputRef={pickerRef} />
        <p className={styles.hint}>{words.dropHint}</p>
      </div>
    );
  }

  return (
    <div className={styles.widget}>
      <Suspense fallback={<p role="status">Getting ready</p>}>
        <ToolWorkspace toolId={toolId} accepts={accepts} words={words} firstFiles={batch.files} onEmpty={onEmpty} />
      </Suspense>
    </div>
  );
}
