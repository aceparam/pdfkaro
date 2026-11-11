import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Progress } from '../../engines/types';
import type { ToolWidgetWords } from '../../tools/registry';
import { useFileDrop } from '../../hooks/useFileDrop';
import { useToolRun } from '../../hooks/useToolRun';
import { fileCount, formatSize, pageCount, progressLine } from '../../widget/format';
import { canRun, currentProblem, isLarge, isReading, totals, type FileEntry } from '../../widget/state';
import type { WorkerLike } from '../../workers/client';
import { FilePicker } from '../FilePicker/FilePicker';
import { Notice } from '../Notice/Notice';
import { PageGrid, type GridItem } from '../PageGrid/PageGrid';
import { PasswordField } from '../PasswordField/PasswordField';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import { Result } from '../Result/Result';
import styles from './ToolWorkspace.module.css';

type Props = {
  toolId: string;
  accepts: string[];
  words: ToolWidgetWords;
  firstFiles: File[];
  /** Called when no file is left, so the widget shows the picker alone again. */
  onEmpty(): void;
};

const createWorker = (): WorkerLike =>
  new Worker(new URL('../../workers/tool.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

const failureText = {
  memory: 'Your browser ran out of memory. Try fewer or smaller files.',
  'engine-load': 'The tool could not be loaded. Check your connection and try again.',
  engine: 'Something went wrong. Try again.',
} as const;

function detailFor(file: FileEntry): string {
  switch (file.status) {
    case 'reading':
      return 'Getting ready';
    case 'ready':
      return `${pageCount(file.pages ?? 0)}, ${formatSize(file.size)}`;
    case 'needs-password':
    case 'wrong-password':
      return 'Needs a password';
    case 'damaged':
      return 'Damaged and cannot be read';
  }
}

/** Everything after the first pick: the list, problems, progress, the result. */
export default function ToolWorkspace({ toolId, accepts, words, firstFiles, onEmpty }: Props) {
  const [announcement, setAnnouncement] = useState('Getting ready');
  const lastProgressAnnounced = useRef(0);

  const announceProgress = useCallback(
    (progress: Progress) => {
      const now = Date.now();
      if (now - lastProgressAnnounced.current < 1000) return;
      lastProgressAnnounced.current = now;
      setAnnouncement(progressLine(progress, words.writingLabel));
    },
    [words.writingLabel],
  );

  const run = useToolRun({ toolId, accepts, words, createWorker, onProgress: announceProgress });
  const { state, result } = run;

  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  const mainRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const resultRef = useRef<HTMLHeadingElement | null>(null);
  const failedRef = useRef<HTMLHeadingElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);

  // The first files: add them once, then move focus to the summary.
  const refusedText = useCallback(
    (names: string[]) => names.map((name) => `${name} is not ${words.acceptsName}, so it was not added.`).join(' '),
    [words.acceptsName],
  );
  const add = useCallback(
    (files: File[]) => {
      void run.addFiles(files).then((refused) => {
        if (refused.length > 0) setAnnouncement(refusedText(refused));
      });
    },
    [run, refusedText],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    add(firstFiles);
  }, [firstFiles, add]);

  useFileDrop(add, state.step === 'listing');

  // Tell the widget when the last file has gone. Not before the first files have
  // arrived: on the first render the list is still empty.
  const hadFiles = useRef(false);
  useEffect(() => {
    if (state.step !== 'empty') hadFiles.current = true;
    else if (hadFiles.current) onEmpty();
  }, [state.step, onEmpty]);

  // Focus follows the step: the summary, Cancel, the result, the failure, or back to the main button.
  const previousStep = useRef(state.step);
  useEffect(() => {
    const from = previousStep.current;
    previousStep.current = state.step;
    if (state.step === 'listing' && from === 'empty') summaryRef.current?.focus();
    if (state.step === 'working') cancelRef.current?.focus();
    if (state.step === 'done') resultRef.current?.focus();
    if (state.step === 'failed') failedRef.current?.focus();
    if (state.step === 'listing' && (from === 'working' || from === 'failed')) mainRef.current?.focus();
  }, [state.step]);

  // Problems, one at a time in list order.
  const problem = currentProblem(state);
  const problemKey = problem ? `${problem.id}:${problem.status}` : '';
  const previousProblem = useRef('');
  useEffect(() => {
    const before = previousProblem.current;
    previousProblem.current = problemKey;
    if (!problem || problemKey === before) {
      // The password was right: the problem is gone, so the main button comes back.
      if (!problem && before.endsWith(':wrong-password')) mainRef.current?.focus();
      return;
    }
    if (problem.status === 'wrong-password') {
      passwordRef.current?.focus();
      return;
    }
    // Where focus is decides how the visitor hears about it, so this has to run after the page has drawn.
    if (problem.status === 'needs-password') {
      const onSummary = document.activeElement === summaryRef.current || document.activeElement === document.body;
      if (onSummary) passwordRef.current?.focus();
      else setAnnouncement(`${problem.name} needs a password.`);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the message depends on where focus is, known only after render
    setAnnouncement(`${problem.name} is damaged and cannot be read.`);
  }, [problem, problemKey]);

  const count = totals(state);
  const ready = canRun(state, words.minFiles);
  const tooFew = state.files.length < words.minFiles;
  const askingPassword = problem?.status === 'needs-password' || problem?.status === 'wrong-password';

  const items: GridItem[] = useMemo(
    () => state.files.map((file) => ({ id: file.id, title: file.name, detail: detailFor(file) })),
    [state.files],
  );

  const others = state.files.length - 1;
  const carryOn = others === 1 ? words.carryOnOne : words.carryOnMany.replace('{count}', String(others));

  if (state.step === 'done' && state.result && result) {
    const detail = [formatSize(state.result.size), state.result.pages ? pageCount(state.result.pages) : null].filter(Boolean).join(', ');
    return (
      <Result
        heading={words.doneHeading}
        name={state.result.name}
        detail={detail}
        href={result.url}
        notes={words.resultNotes}
        onStartAgain={run.clear}
        headingRef={resultRef}
      />
    );
  }

  return (
    <div>
      <p role="status" className="visually-hidden">
        {announcement}
      </p>

      {state.step === 'failed' && state.failure ? (
        <Notice heading={words.failedHeading} headingRef={failedRef}>
          <p>{failureText[state.failure]}</p>
          <div>
            <button type="button" className="button-secondary" onClick={run.backToFiles}>
              Go back to your files
            </button>
          </div>
        </Notice>
      ) : null}

      {state.step === 'working' ? (
        <div className={styles.working}>
          <p className={styles.progressLine}>
            {state.progress ? progressLine(state.progress, words.writingLabel) : `Starting on ${fileCount(state.files.length)}`}
          </p>
          <ProgressBar fraction={state.fraction} label={words.actionLabel} />
          <div className="actions">
            <button ref={cancelRef} type="button" className="button-secondary" onClick={run.cancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {state.step === 'listing' ? (
        <>
          <p ref={summaryRef} tabIndex={-1} className={styles.summary}>
            {fileCount(count.files)}
            {isReading(state) ? '' : `, ${pageCount(count.pages)}`}, {formatSize(count.size)}.
            {words.listNote ? ` ${words.listNote}` : ''}
          </p>

          {state.refused.length > 0 && (
            <p className={styles.refused}>
              {refusedText(state.refused)}
            </p>
          )}

          <PageGrid
            items={items}
            onMove={run.moveFile}
            onRemove={run.removeFile}
            onMoved={(title, place, of) => setAnnouncement(`${title} moved to place ${place} of ${of}.`)}
          />

          {askingPassword && problem ? (
            <PasswordField
              key={problem.id}
              fileName={problem.name}
              error={problem.status === 'wrong-password' ? 'That password did not open the file. Check it and try again.' : undefined}
              onSubmit={(password) => void run.submitPassword(problem.id, password)}
              onLeaveOut={() => {
                run.removeFile(problem.id);
                summaryRef.current?.focus();
              }}
              inputRef={passwordRef}
            />
          ) : null}

          {problem?.status === 'damaged' ? (
            <Notice heading={`${problem.name} is damaged and cannot be read.`}>
              <div>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    run.removeFile(problem.id);
                    summaryRef.current?.focus();
                  }}
                >
                  {others > 0 ? carryOn : 'Choose another file'}
                </button>
              </div>
            </Notice>
          ) : null}

          {isLarge(state) && !askingPassword ? (
            <Notice heading="These files add up to more than 100 MB">
              <p>The job may be slow, and a phone may run out of memory. You can still go ahead.</p>
            </Notice>
          ) : null}

          {!askingPassword && problem?.status !== 'damaged' ? (
            <div className={`actions ${styles.apart}`}>
              <FilePicker label={words.addLabel} accepts={accepts} multiple={words.multiple} onFiles={add} look="secondary" inputRef={addRef} />
              <button
                ref={mainRef}
                type="button"
                className="button"
                aria-disabled={ready ? undefined : true}
                aria-describedby={tooFew ? `${toolId}-too-few` : undefined}
                onClick={() => {
                  if (ready) void run.start();
                }}
              >
                {words.actionLabel}
              </button>
              {tooFew ? (
                <p id={`${toolId}-too-few`} className={styles.tooFew}>
                  {words.tooFewFiles}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
