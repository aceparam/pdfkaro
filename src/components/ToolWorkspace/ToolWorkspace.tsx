import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Progress } from '../../engines/types';
import type { ToolWidgetWords } from '../../tools/registry';
import { useFileDrop } from '../../hooks/useFileDrop';
import { useToolRun } from '../../hooks/useToolRun';
import { fileCount, formatSize, pageCount, progressLine } from '../../widget/format';
import { failureSentence, workingLine } from '../../widget/failures';
import { gridItems } from '../../widget/items';
import { orderSummary } from '../../widget/order';
import { allAnnouncement, turnAnnouncement, turnCaption, turnedAll, turnedPage, turnOf, turnRules, type Turns } from '../../widget/turns';

/** How many drawn cells "Turn every page" reaches in each frame: one chunk of PageGrid's. */
const turnBatch = 50;

/** A number for each turns value, so a chunk of pages can tell whether the turns it shows have changed. */
const versions = new WeakMap<Turns, number>();
let nextVersion = 1;
function turnsVersion(turns: Turns | null): number {
  if (!turns) return 0;
  let version = versions.get(turns);
  if (version === undefined) {
    version = nextVersion++;
    versions.set(turns, version);
  }
  return version;
}
import { number, showMoreLabel, shownAnnouncement } from '../../widget/format';
import { toggledMarks, toggleRules } from '../../widget/toggles';
import { allReady, canRun, currentProblem, isLarge, isManyPages, manyPages, pageBatch, totals, type FileEntry } from '../../widget/state';
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

/** How many pages are put on the page first (about a screenful), and how many are added each frame after. */
const drawFirst = 30;
const drawStep = 100;

const createWorker = (): WorkerLike =>
  new Worker(new URL('../../workers/tool.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

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
  const askingPassword = problem?.status === 'needs-password' || problem?.status === 'wrong-password';

  const pages = words.items === 'pages';
  const entries = useMemo(() => gridItems({ files: state.files, order: state.order }, words.items, state.shown), [state.files, state.order, words.items, state.shown]);
  const items: GridItem[] = useMemo(() => {
    const byId = new Map(state.files.map((file) => [file.id, file]));
    return entries.map((entry) => {
      const file = byId.get(entry.fileId);
      return { id: entry.id, title: entry.title, detail: pages || !file ? '' : detailFor(file), thumbnail: thumbnails[entry.id] };
    });
  }, [entries, state.files, thumbnails, pages]);
  // A tool that lists pages has one file, shown on its own line above them.
  const onlyFile = pages ? state.files[0] : undefined;

  // Pages are put on the page a screenful first, then 100 a frame, so that 500 at once never
  // block the page for more than 100 ms on a slow phone. A list of files is drawn whole.
  const [drawn, setDrawn] = useState(drawFirst);
  const drawnFor = useRef<string | undefined>(undefined);
  if (drawnFor.current !== onlyFile?.id) {
    drawnFor.current = onlyFile?.id;
    if (drawn !== drawFirst) setDrawn(drawFirst);
  }
  useEffect(() => {
    if (!pages || drawn >= items.length) return;
    const frame = requestAnimationFrame(() => setDrawn((count) => count + drawStep));
    return () => cancelAnimationFrame(frame);
  }, [pages, drawn, items.length]);
  const gridItemsDrawn = useMemo(() => (pages ? items.slice(0, drawn) : items), [pages, items, drawn]);

  // When that file has been read and its pages appear, say what the line now says.
  const onlyReady = onlyFile && onlyFile.status === 'ready' && !onlyFile.checking ? `${onlyFile.id}:${detailFor(onlyFile)}` : '';
  const announcedReady = useRef('');
  useEffect(() => {
    if (!onlyReady || !onlyFile || announcedReady.current === onlyReady) return;
    announcedReady.current = onlyReady;
    setAnnouncement(`${onlyFile.name}, ${detailFor(onlyFile)}.`);
  }, [onlyReady, onlyFile, setAnnouncement]);

  // A toggle on each page, such as Split's cuts or Extract's choice. What it means comes from toggles.ts.
  const itemToggle = words.itemToggle;
  const rules = itemToggle ? toggleRules[itemToggle.kind] : undefined;
  const filePages = onlyFile?.status === 'ready' && !onlyFile.checking ? (onlyFile.pages ?? 0) : 0;
  const marks = state.marks;
  const pressed = useMemo(() => new Set(onlyFile ? marks.map((page) => `${onlyFile.id}:${page}`) : []), [marks, onlyFile]);
  const skip = useMemo(
    () => new Set(onlyFile && rules ? rules.skip(filePages).map((page) => `${onlyFile.id}:${page}`) : []),
    [onlyFile, rules, filePages],
  );
  const toggle = useMemo(
    () =>
      itemToggle && rules
        ? {
            label: itemToggle.label,
            name: (title: string) => `${itemToggle.label} ${title.toLowerCase()}`,
            pressed,
            skip,
            drawsCut: rules.drawsCut,
            onToggle: (id: string) => {
              const page = Number(id.slice(id.lastIndexOf(':') + 1));
              const marked = !marks.includes(page);
              run.toggleMark(page);
              setAnnouncement(rules.announce(filePages, toggledMarks(marks, page), page, marked));
            },
          }
        : undefined,
    [itemToggle, rules, pressed, skip, marks, run, filePages, setAnnouncement],
  );

  // A tool whose pages move (Reorder pages): moves by the page, and the line that says whether the order changed.
  const pageMoves = pages && words.itemControls;
  const orderLine = useMemo(() => (pageMoves && filePages > 0 ? orderSummary(state.order, filePages) : null), [pageMoves, filePages, state.order]);
  const onMove = useCallback(
    (id: string, to: number) => {
      if (!pageMoves) return run.moveFile(id, to);
      run.movePage(Number(id.slice(id.lastIndexOf(':') + 1)), to);
    },
    [pageMoves, run],
  );

  // A tool whose pages turn (Rotate PDF): each page's turn, read by PageGrid inside its map so a turn
  // draws only the cells it changes, and the line that says how many pages will be turned.
  const pageTurns = pages && words.itemTurns === true;
  const turnLine = useMemo(() => (pageTurns && filePages > 0 ? turnRules.summary(state.turns, filePages) : null), [pageTurns, filePages, state.turns]);
  const turnsBlocked = pageTurns && filePages > 0 ? turnRules.blocked(state.turns, filePages) : null;
  // "Turn every page" changes every drawn cell's picture and caption. To keep each frame short on a
  // slow phone, the new turns reach the drawn cells 100 a frame: pages up to `front` show the new
  // turns, pages beyond it the turns from before the press. Rotate never moves pages, so a page's
  // number is its place in the grid.
  const [turnFront, setTurnFront] = useState<{ before: Turns | null; front: number } | null>(null);
  useEffect(() => {
    if (!turnFront) return;
    // Each frame moves the front on; once it has passed the drawn cells, the batching ends.
    const frame = requestAnimationFrame(() => setTurnFront((now) => (now && now.front < drawn ? { ...now, front: now.front + turnBatch } : null)));
    return () => cancelAnimationFrame(frame);
  }, [turnFront, drawn]);
  const turns = useMemo(
    () =>
      pageTurns
        ? {
            of: (id: string) => {
              const page = Number(id.slice(id.lastIndexOf(':') + 1));
              return turnOf(turnFront && page > turnFront.front ? turnFront.before : state.turns, page);
            },
            caption: turnCaption,
            // A chunk of pages shows the new turns, the turns from before the press, or (only while
            // the front is inside it) a mix; its stamp changes only when what it shows does.
            stamp: (firstId: string, lastId: string) => {
              const first = Number(firstId.slice(firstId.lastIndexOf(':') + 1));
              const last = Number(lastId.slice(lastId.lastIndexOf(':') + 1));
              // The stamp is the version of the turns the chunk shows, so a chunk that keeps showing the same
              // turns (the ones from before the press, beyond the front) is not drawn again.
              if (!turnFront || last <= turnFront.front) return `${turnsVersion(state.turns)}`;
              if (first > turnFront.front) return `${turnsVersion(turnFront.before)}`;
              return `front:${turnFront.front}:${turnsVersion(state.turns)}`;
            },
            onTurn: (id: string, _title: string, by: 1 | -1) => {
              const page = Number(id.slice(id.lastIndexOf(':') + 1));
              // A single turn while the front is moving draws every cell with the current turns.
              setTurnFront(null);
              run.turnPage(page, by);
              setAnnouncement(turnAnnouncement(page, turnOf(turnedPage(state.turns, page, by), page)));
            },
          }
        : undefined,
    [pageTurns, state.turns, turnFront, run, setAnnouncement],
  );
  const turnEveryPage = (by: 1 | -1) => {
    setTurnFront({ before: turnFront ? turnFront.before : state.turns, front: turnBatch });
    run.turnAll(by);
    setAnnouncement(allAnnouncement(turnedAll(state.turns, by), by));
  };

  // The main button: too few files, or, once a page tool's pages are shown, what its toggle kind still needs.
  const tooFew = state.files.length < words.minFiles;
  const blocked = rules && filePages > 0 ? rules.blocked(filePages, marks) : turnsBlocked;
  const ready = canRun(state, words.minFiles, blocked === null);
  const tiedSentence = tooFew ? words.tooFewFiles : blocked;

  // More pages: focus goes to the first new page, which sits where the button was.
  const [focusId, setFocusId] = useState<string | null>(null);
  const moreToShow = pages && onlyFile && filePages > state.shown;
  const showMore = () => {
    if (!onlyFile) return;
    setFocusId(`${onlyFile.id}:${state.shown + 1}`);
    run.showMore();
    setAnnouncement(shownAnnouncement(state.shown + pageBatch, filePages));
  };

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
          <p>{failureSentence(state.failure, words)}</p>
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
            {workingLine(state.progress, words, state.files.length)}
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

          {rules && filePages > 0 ? <p className={styles.toggleSummary}>{rules.summary(filePages, marks)}</p> : null}
          {orderLine ? <p className={styles.toggleSummary}>{orderLine}</p> : null}
          {turnLine ? <p className={styles.toggleSummary}>{turnLine}</p> : null}
          {turnLine && filePages > 1 ? (
            <div className={styles.turnAll}>
              <button type="button" className="button-secondary" onClick={() => turnEveryPage(-1)}>
                Turn every page left
              </button>
              <button type="button" className="button-secondary" onClick={() => turnEveryPage(1)}>
                Turn every page right
              </button>
            </div>
          ) : null}

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
              items={gridItemsDrawn}
              controls={words.itemControls}
              layout={pages ? 'grid' : 'rows'}
              onMove={onMove}
              total={pageMoves ? filePages : undefined}
              turns={turns}
              onRemove={run.removeFile}
              onMoved={(title, place, of) => setAnnouncement(`${title} moved to place ${number(place)} of ${number(of)}.`)}
              onVisible={run.showThumbnail}
              toggle={toggle}
              focusId={focusId}
              onFocused={() => setFocusId(null)}
            />
          ) : null}

          {moreToShow ? (
            <div className={styles.more}>
              <button type="button" className="button-secondary" onClick={showMore}>
                {showMoreLabel(state.shown, filePages, pageBatch)}
              </button>
            </div>
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
              leaveLabel={others > 0 ? 'Leave this file out' : 'Choose another file'}
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

          {pages && isManyPages(state) ? (
            <Notice heading={`This file has more than ${number(manyPages)} pages`}>
              <p>The job may take a long time. You can still go ahead.</p>
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
                aria-describedby={tiedSentence ? `${toolId}-why-not` : undefined}
                onClick={() => {
                  if (ready) void run.start();
                }}
              >
                {words.actionLabel}
              </button>
              {tiedSentence ? (
                <p id={`${toolId}-why-not`} className={styles.tooFew}>
                  {tiedSentence}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
