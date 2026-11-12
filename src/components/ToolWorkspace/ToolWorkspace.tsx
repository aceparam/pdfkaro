import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Progress } from '../../engines/types';
import type { ToolWidgetWords } from '../../tools/registry';
import { useFileDrop } from '../../hooks/useFileDrop';
import { useToolRun } from '../../hooks/useToolRun';
import { fileCount, formatSize, pageCount, progressLine } from '../../widget/format';
import { gridItems } from '../../widget/items';
import { allReady, canRun, currentProblem, isLarge, totals, type FileEntry } from '../../widget/state';
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
  /**
   * Called when no file is left, so the widget shows the picker alone again.
   * `message` is shown under the picker, such as why a file was turned away.
   */
  onEmpty(message?: string): void;
};

const createWorker = (): WorkerLike =>
  new Worker(new URL('../../workers/tool.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

const failureText = {
  memory: 'Your browser ran out of memory. Try fewer or smaller files.',
  'engine-load': 'The tool could not be loaded. Check your connection and try again.',
  engine: 'Something went wrong. Try again.',
} as const;

function detailFor(file: FileEntry): string {
  if (file.checking) return 'Trying the password';
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
  const [announcement, setAnnouncementText] = useState('Getting ready');
  // The same words twice in a row would not change the page, so a screen
  // reader would not say them again; a no-break space tells the two apart.
  const setAnnouncement = useCallback((text: string) => {
    setAnnouncementText((current) => (current === text ? `${text}\u00a0` : text));
  }, []);
  const lastProgressAnnounced = useRef(0);

  const announceProgress = useCallback(
    (progress: Progress) => {
      const now = Date.now();
      if (now - lastProgressAnnounced.current < 1000) return;
      lastProgressAnnounced.current = now;
      // Progress that has not moved on is not said again.
      setAnnouncementText(progressLine(progress, words.writingLabel));
    },
    [words.writingLabel],
  );

  const run = useToolRun({ toolId, accepts, words, createWorker, onProgress: announceProgress });
  const { state, result, thumbnails } = run;

  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  const mainRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const resultRef = useRef<HTMLHeadingElement | null>(null);
  const failedRef = useRef<HTMLHeadingElement | null>(null);
  const damagedRef = useRef<HTMLHeadingElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);

  // The first files: add them once, then move focus to the summary.
  const refusedText = useCallback(
    (names: string[]) => names.map((name) => `${name} is not ${words.acceptsName}, so it was not added.`).join(' '),
    [words.acceptsName],
  );
  // A tool that takes one file keeps the first of several dropped or pasted, and says so.
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const leftOutText = useCallback(
    (names: string[]) => (names.length === 0 ? '' : `This tool takes one file, so ${names.join(', ')} ${names.length === 1 ? 'was' : 'were'} not added.`),
    [],
  );
  // Tell the widget when the last file has gone. Not before the first files have
  // arrived: on the first render the list is still empty.
  const hadFiles = useRef(false);

  const add = useCallback(
    (files: File[]) => {
      void run.addFiles(files).then(({ added, refused, leftOut }) => {
        setLeftOut(leftOut);
        const said = [refused.length > 0 ? refusedText(refused) : '', leftOutText(leftOut)].filter(Boolean).join(' ');
        if (!said) return;
        // Nothing was added and nothing was listed before: back to the picker, which says why.
        if (added === 0 && !hadFiles.current) onEmpty(said);
        else setAnnouncement(said);
      });
    },
    [run, refusedText, leftOutText, onEmpty, setAnnouncement],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    add(firstFiles);
  }, [firstFiles, add]);

  useFileDrop(add, state.step === 'listing');

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

  // Problems, one at a time in list order. A file whose password is being tried
  // stays the problem until the answer comes back.
  const problem = currentProblem(state);
  const problemKey = problem ? `${problem.id}:${problem.status}${problem.checking ? ':checking' : ''}` : '';
  const previousProblem = useRef('');
  useEffect(() => {
    const before = previousProblem.current;
    previousProblem.current = problemKey;
    if (problemKey === before || problem?.checking) return;
    // A password was right: the field goes away, so focus moves on to what comes next.
    const [beforeId, beforeStatus] = before.split(':');
    const opened = beforeStatus?.endsWith('password') === true && state.files.some((file) => file.id === beforeId && file.status === 'ready');
    if (!problem) {
      // The problem has gone, so its words leave the status line too.
      if (before) setAnnouncementText('');
      if (opened) mainRef.current?.focus();
      return;
    }
    if (problem.status === 'wrong-password') {
      passwordRef.current?.focus();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the field may already have focus, so focus alone would say nothing
      setAnnouncement(`That password did not open ${problem.name}.`);
      return;
    }
    // Where focus is decides how the visitor hears about it, so this has to run after the page has drawn.
    if (problem.status === 'needs-password') {
      const onSummary = document.activeElement === summaryRef.current || document.activeElement === document.body;
      if (onSummary || opened) passwordRef.current?.focus();
      else setAnnouncement(`${problem.name} needs a password.`);
      return;
    }
    if (opened) {
      damagedRef.current?.focus();
      return;
    }
    setAnnouncement(`${problem.name} is damaged and cannot be read.`);
  }, [problem, problemKey, state.files, setAnnouncement]);

  const count = totals(state);
  const ready = canRun(state, words.minFiles);
  const tooFew = state.files.length < words.minFiles;
  const askingPassword = problem?.status === 'needs-password' || problem?.status === 'wrong-password';

  const pages = words.items === 'pages';
  const entries = useMemo(() => gridItems({ files: state.files }, words.items), [state.files, words.items]);
  const items: GridItem[] = useMemo(() => {
    const byId = new Map(state.files.map((file) => [file.id, file]));
    return entries.map((entry) => {
      const file = byId.get(entry.fileId);
      return { id: entry.id, title: entry.title, detail: pages || !file ? '' : detailFor(file), thumbnail: thumbnails[entry.id] };
    });
  }, [entries, state.files, thumbnails, pages]);
  // A tool that lists pages has one file, shown on its own line above them.
  const onlyFile = pages ? state.files[0] : undefined;

  // When that file has been read and its pages appear, say what the line now says.
  const onlyReady = onlyFile && onlyFile.status === 'ready' && !onlyFile.checking ? `${onlyFile.id}:${detailFor(onlyFile)}` : '';
  const announcedReady = useRef('');
  useEffect(() => {
    if (!onlyReady || !onlyFile || announcedReady.current === onlyReady) return;
    announcedReady.current = onlyReady;
    setAnnouncement(`${onlyFile.name}, ${detailFor(onlyFile)}.`);
  }, [onlyReady, onlyFile, setAnnouncement]);

  const others = state.files.length - 1;
  const everyReady = allReady(state);
  const anyReady = state.files.some((file) => file.status === 'ready');

  if (state.step === 'done' && state.result && result) {
    // A zip says how many files it holds; a PDF, how many pages.
    const detail = [
      state.result.parts ? fileCount(state.result.parts) : null,
      formatSize(state.result.size),
      state.result.pages ? pageCount(state.result.pages) : null,
    ]
      .filter(Boolean)
      .join(', ');
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
          {onlyFile ? (
            <div className={styles.fileLine}>
              <p ref={summaryRef} tabIndex={-1} className={styles.fileName}>
                <span className={styles.name}>{onlyFile.name}</span>
                <span className="muted">, {detailFor(onlyFile)}</span>
              </p>
              <button
                type="button"
                className={`button-secondary ${styles.small}`}
                aria-label={`Remove ${onlyFile.name}`}
                onClick={() => run.removeFile(onlyFile.id)}
              >
                Remove
              </button>
            </div>
          ) : (
            <p ref={summaryRef} tabIndex={-1} className={styles.summary}>
              {fileCount(count.files)}
              {everyReady ? `, ${pageCount(count.pages)}` : ''}, {formatSize(count.size)}.
              {words.listNote && anyReady && state.files.length > 1 ? ` ${words.listNote}` : ''}
            </p>
          )}

          {state.refused.length > 0 && (
            <p className={styles.refused}>
              {refusedText(state.refused)}
            </p>
          )}
          {leftOut.length > 0 && <p className={styles.refused}>{leftOutText(leftOut)}</p>}

          {pages && items.length > 0 && !askingPassword && problem?.status !== 'damaged' ? (
            <a
              href={`#${toolId}-main`}
              className={styles.skip}
              onClick={(event) => {
                event.preventDefault();
                mainRef.current?.focus({ preventScroll: true });
                mainRef.current?.scrollIntoView({ block: 'center' });
              }}
            >
              Skip to the main button
            </a>
          ) : null}

          {items.length > 0 ? (
            <PageGrid
              items={items}
              controls={words.itemControls}
              layout={pages ? 'grid' : 'rows'}
              onMove={run.moveFile}
              onRemove={run.removeFile}
              onMoved={(title, place, of) => setAnnouncement(`${title} moved to place ${place} of ${of}.`)}
              onVisible={run.showThumbnail}
            />
          ) : null}

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
            <Notice heading={`${problem.name} is damaged and cannot be read.`} headingRef={damagedRef}>
              <div>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    run.removeFile(problem.id);
                    summaryRef.current?.focus();
                  }}
                >
                  {others > 0 ? 'Leave this file out' : 'Choose another file'}
                </button>
              </div>
            </Notice>
          ) : null}

          {isLarge(state) && !askingPassword ? (
            <Notice heading={pages ? 'This file is more than 100 MB' : 'These files add up to more than 100 MB'}>
              <p>The job may be slow, and a phone may run out of memory. You can still go ahead.</p>
            </Notice>
          ) : null}

          {!askingPassword && problem?.status !== 'damaged' ? (
            <div className={`actions ${styles.apart}`}>
              {pages ? null : (
                <FilePicker label={words.addLabel} accepts={accepts} multiple={words.multiple} onFiles={add} look="secondary" inputRef={addRef} />
              )}
              <button
                ref={mainRef}
                id={`${toolId}-main`}
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
