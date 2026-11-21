import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Progress } from '../../engines/types';
import type { DrawingOption, ToolWidgetWords } from '../../tools/registry';
import { useFileDrop } from '../../hooks/useFileDrop';
import { useToolRun } from '../../hooks/useToolRun';
import { fileCount, formatSize, number, pageCount, progressLine, resultDetail, showMoreLabel, shownAnnouncement } from '../../widget/format';
import { failureSentence, pixelsAdvice, pixelsHeading, refusedSentence, unreadableNotice, workingLine } from '../../widget/failures';
import { gridItems, pageOf } from '../../widget/items';
import {
  chosenPicture,
  chosenValue,
  drawnLines,
  enterAction,
  focusMovesToOptions,
  holdsUnderButton,
  optionsHold,
  optionsShown,
  pictureLine,
  pictureNotice,
  picturePicked,
  pictureSentence,
  readyKey,
  shownOptions,
  typedText,
} from '../../widget/options';
import { drawingRule, pictureRule, type Drawing } from '../../widget/option-values';
import { orderSummary } from '../../widget/order';
import { allAnnouncement, turnAnnouncement, turnCaption, turnChunk, turnedAll, turnedPage, turnOf, turnRules, turnsVersion, type Turns } from '../../widget/turns';
import { toggledMarks, toggleRules } from '../../widget/toggles';
import { allReady, canRun, currentProblem, hugeFiles, isLarge, isManyPages, isNoNewFile, isUnreadable, manyPages, pageBatch, totals, type FileEntry } from '../../widget/state';
import type { WorkerLike } from '../../workers/client';
import { ChoiceGroup } from '../ChoiceGroup/ChoiceGroup';
import { DrawingPad } from '../DrawingPad/DrawingPad';
import { FilePicker } from '../FilePicker/FilePicker';
import { Notice } from '../Notice/Notice';
import { PageGrid, type GridItem } from '../PageGrid/PageGrid';
import { PasswordField } from '../PasswordField/PasswordField';
import { PictureField, pictureErrorId } from '../PictureField/PictureField';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import { Result } from '../Result/Result';
import { errorId, TextField } from '../TextField/TextField';
import styles from './ToolWorkspace.module.css';

type Props = {
  toolId: string;
  accepts: string[];
  words: ToolWidgetWords;
  /** The page's preset, passed on to every job. */
  preset?: Record<string, string | number | boolean>;
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

/** What a file's row says beside its name. `listPages: false` leaves the page count out, for a tool whose every file is one page. */
function detailFor(file: FileEntry, listPages = true): string {
  if (file.checking) return 'Trying the password';
  switch (file.status) {
    case 'reading':
      return 'Getting ready';
    case 'ready':
      return listPages ? `${pageCount(file.pages ?? 0)}, ${formatSize(file.size)}` : formatSize(file.size);
    case 'needs-password':
    case 'wrong-password':
      return 'Needs a password';
    case 'damaged':
      return 'Damaged and cannot be read';
    case 'unsupported':
      return 'Saved in a way this tool cannot read';
  }
}

/** Everything after the first pick: the list, problems, progress, the result. */
export default function ToolWorkspace({ toolId, accepts, words, preset, firstFiles, onEmpty }: Props) {
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

  const run = useToolRun({ toolId, accepts, words, preset, createWorker, onProgress: announceProgress });
  const { state, result, thumbnails } = run;

  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  const mainRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const resultRef = useRef<HTMLHeadingElement | null>(null);
  const failedRef = useRef<HTMLHeadingElement | null>(null);
  const damagedRef = useRef<HTMLHeadingElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);
  // The first option's focus target, where focus goes once the file has been read: a choice's chosen radio button, or a text's field.
  const optionRef = useRef<HTMLInputElement | null>(null);
  const optionName = useId();

  // The first files: add them once, then move focus to the summary.
  const refusedText = useCallback(
    (names: string[]) => refusedSentence(names, words),
    [words],
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
    // A one-file tool that lists its file as a row has no summary line, so focus goes to the main button.
    if (state.step === 'listing' && from === 'empty') (summaryRef.current ?? mainRef.current)?.focus();
    if (state.step === 'working') cancelRef.current?.focus();
    if (state.step === 'done') resultRef.current?.focus();
    if (state.step === 'failed') failedRef.current?.focus();
    if (state.step === 'listing' && (from === 'working' || from === 'failed')) mainRef.current?.focus();
  }, [state.step]);

  // Problems, one at a time in list order. A file whose password is being tried
  // stays the problem until the answer comes back.
  const problem = currentProblem(state);
  const problemKey = problem ? `${problem.id}:${problem.status}${problem.checking ? ':checking' : ''}` : '';
  // A file that cannot be read: its heading and the tool's advice, worked out once per render.
  const unreadableWords = problem && (problem.status === 'damaged' || problem.status === 'unsupported') ? unreadableNotice(problem.name, problem.status, words) : undefined;
  const unreadableSaid = unreadableWords?.announcement;
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
    // The heading and the advice are said together.
    if (unreadableSaid) setAnnouncement(unreadableSaid);
  }, [problem, problemKey, state.files, setAnnouncement, unreadableSaid]);

  // A tool with options: once a new set of files has been read, focus moves to the first option (a choice's
  // chosen radio button, or a text's field), if it is still where the widget put it or on the page body. The status line still
  // says the file's line. Cancel and "Go back to your file" keep the key, so focus stays on the main button.
  const options = useMemo(() => words.options ?? [], [words.options]);
  const showOptions = options.length > 0 && optionsShown(state);
  // The options drawn: those whose condition holds, in registry order, so one shown by a choice comes after the
  // options before it. Changing the choice neither moves focus nor says anything; the next Tab reaches the option
  // now shown. The first option has no condition (the registry test), so optionRef always has a target.
  const drawnOptions = useMemo(() => shownOptions(options, state.choices), [options, state.choices]);
  const filesRead = readyKey(state);
  const filesReadBefore = useRef('');
  useEffect(() => {
    if (!filesRead) return;
    const before = filesReadBefore.current;
    filesReadBefore.current = filesRead;
    const active = document.activeElement;
    const free = active === null || active === document.body || active === mainRef.current || active === summaryRef.current;
    if (focusMovesToOptions(showOptions, filesRead, before, free)) optionRef.current?.focus();
  }, [filesRead, showOptions]);

  // A shown text that holds the main button back: empty, too long, or with characters its rule does not take.
  // Memoised, so a long paste is not cleaned and checked again on every thumbnail's render.
  // A shown picture holds it too, until one is chosen and read, and while the one chosen cannot be used.
  const hold = useMemo(() => optionsHold(toolId, options, state.choices, undefined, undefined, state.pictures), [toolId, options, state.choices, state.pictures]);
  const fieldId = (key: string) => `${optionName}-${key}`;
  // Too long or refused characters, or a picture's problem: the sentence is shown by the field, and tied to the main button from there.
  const fieldHold = showOptions && hold && !holdsUnderButton(hold) ? hold : null;
  const fieldHoldKey = fieldHold ? `${fieldHold.key}:${fieldHold.kind}` : '';
  // Typing in a text's field. The sentence by the field is said once by the status line when it first appears
  // or changes kind; not again for each character typed past the limit, and nothing when it goes, or for an
  // empty text, which is tied to the main button from the start. Focus never moves for it.
  const typeText = (key: string, value: string) => {
    run.setOption(key, value);
    const next = optionsHold(toolId, options, { ...state.choices, [key]: value }, undefined, undefined, state.pictures);
    if (next && !holdsUnderButton(next) && next.key === key && `${next.key}:${next.kind}` !== fieldHoldKey) setAnnouncement(next.sentence);
  };

  // A picture: the line naming it is said once when it is ready ("signature.png, 120 KB."), and each problem's
  // sentence once when it appears. Each pick gives a new entry, so the same file picked again is said again.
  // Focus never moves for it: it stays on the button.
  const pictureSaid = useRef<Record<string, unknown>>({});
  useEffect(() => {
    if (!showOptions) return;
    for (const option of drawnOptions) {
      if (option.kind !== 'picture') continue;
      const entry = chosenPicture(option, state.pictures);
      if (entry === undefined || entry.status === 'reading' || pictureSaid.current[option.key] === entry) continue;
      pictureSaid.current[option.key] = entry;
      const said = entry.status === 'ready' ? pictureLine(entry) : pictureSentence(option, entry);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the worker's answer reaches the page through the state, so it is said here
      if (said) setAnnouncement(said);
    }
  }, [showOptions, drawnOptions, state.pictures, setAnnouncement]);
  const pictureNoticeId = (key: string) => `${fieldId(key)}-notice`;
  const pictureNotices = showOptions
    ? drawnOptions.flatMap((option) => {
        if (option.kind !== 'picture') return [];
        const notice = pictureNotice(option, chosenPicture(option, state.pictures), pictureRule(toolId, option.key));
        return notice ? [{ key: option.key, notice }] : [];
      })
    : [];
  // A drawing: the widget is told once per finished line. When a line fills the drawing, the status line says
  // so once; the pad takes no more lines until it is cleared, so it is not said again. An empty drawing's
  // sentence is tied to the main button, as an empty text's is.
  const draw = (key: string, drawing: Drawing, full: boolean) => {
    run.setDrawing(key, drawing);
    if (full) setAnnouncement('The drawing is full. Clear it to start again.');
  };
  const clearDrawing = (option: DrawingOption) => {
    // Clear on an empty pad changes nothing, so it says nothing (UX, stage 2).
    if (drawnLines(option, state.choices).length === 0) return;
    run.setDrawing(option.key, []);
    setAnnouncement('The drawing is cleared.');
  };

  const count = totals(state);
  const askingPassword = problem?.status === 'needs-password' || problem?.status === 'wrong-password';
  const unreadable = isUnreadable(problem);
  const listPages = words.listPages !== false;
  // Very large pictures, each with a notice tied to the main button (Image to PDF).
  const huge = hugeFiles(state);
  const hugeId = (file: FileEntry) => `${toolId}-pixels-${file.id}`;

  const pages = words.items === 'pages';
  const entries = useMemo(() => gridItems({ files: state.files, order: state.order }, words.items, state.shown), [state.files, state.order, words.items, state.shown]);
  const items: GridItem[] = useMemo(() => {
    const byId = new Map(state.files.map((file) => [file.id, file]));
    return entries.map((entry) => {
      const file = byId.get(entry.fileId);
      return { id: entry.id, title: entry.title, detail: pages || !file ? '' : detailFor(file, listPages), thumbnail: thumbnails[entry.id] };
    });
  }, [entries, state.files, thumbnails, pages, listPages]);
  // A tool that lists pages has one file, shown on its own line above them.
  const onlyFile = pages ? state.files[0] : undefined;
  // A tool that takes one file and lists it as a row (Compress PDF): the row says it all, so no summary line above it.
  const oneFileRow = !pages && !words.multiple && state.files.length === 1;
  const soleFile = onlyFile ?? (oneFileRow ? state.files[0] : undefined);

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

  // When that file has been read and its pages or its row appear, say what the line now says.
  const onlyReady = soleFile && soleFile.status === 'ready' && !soleFile.checking ? `${soleFile.id}:${detailFor(soleFile)}` : '';
  const announcedReady = useRef('');
  useEffect(() => {
    if (!onlyReady || !soleFile || announcedReady.current === onlyReady) return;
    announcedReady.current = onlyReady;
    setAnnouncement(`${soleFile.name}, ${detailFor(soleFile)}.`);
  }, [onlyReady, soleFile, setAnnouncement]);

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
              const page = pageOf(id);
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
      run.movePage(pageOf(id), to);
    },
    [pageMoves, run],
  );

  // A tool whose pages turn (Rotate PDF): each page's turn, read by PageGrid inside its map so a turn
  // draws only the cells it changes, and the line that says how many pages will be turned.
  const pageTurns = pages && words.itemTurns === true;
  const turnLine = useMemo(() => (pageTurns && filePages > 0 ? turnRules.summary(state.turns, filePages) : null), [pageTurns, filePages, state.turns]);
  const turnsBlocked = pageTurns && filePages > 0 ? turnRules.blocked(state.turns, filePages) : null;
  // "Turn every page" changes every drawn cell's picture and caption. To keep each frame short on a
  // slow phone, the new turns reach the drawn cells one chunk (`turnChunk`, 50) a frame: pages up to `front` show the new
  // turns, pages beyond it the turns from before the press. Rotate never moves pages, so a page's
  // number is its place in the grid.
  const [turnFront, setTurnFront] = useState<{ before: Turns | null; front: number } | null>(null);
  useEffect(() => {
    if (!turnFront) return;
    // Each frame moves the front on; once it has passed the drawn cells, the batching ends.
    const frame = requestAnimationFrame(() => setTurnFront((now) => (now && now.front < drawn ? { ...now, front: now.front + turnChunk } : null)));
    return () => cancelAnimationFrame(frame);
  }, [turnFront, drawn]);
  const turns = useMemo(
    () =>
      pageTurns
        ? {
            of: (id: string) => {
              const page = pageOf(id);
              return turnOf(turnFront && page > turnFront.front ? turnFront.before : state.turns, page);
            },
            caption: turnCaption,
            // A chunk of pages shows the new turns, the turns from before the press, or (only while
            // the front is inside it) a mix; its stamp changes only when what it shows does.
            stamp: (firstId: string, lastId: string) => {
              const first = pageOf(firstId);
              const last = pageOf(lastId);
              // The stamp is the version of the turns the chunk shows, so a chunk that keeps showing the same
              // turns (the ones from before the press, beyond the front) is not drawn again.
              if (!turnFront || last <= turnFront.front) return `${turnsVersion(state.turns)}`;
              if (first > turnFront.front) return `${turnsVersion(turnFront.before)}`;
              return `front:${turnFront.front}:${turnsVersion(state.turns)}`;
            },
            onTurn: (id: string, _title: string, by: 1 | -1) => {
              const page = pageOf(id);
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
    // The front starts before the first page, so the press itself changes no cell and the first chunk
    // is drawn in the next frame. The press can already lay out the whole grid once (focus leaving a
    // page does), and drawing the first chunk in the same task laid it out a second time.
    setTurnFront({ before: turnFront ? turnFront.before : state.turns, front: 0 });
    run.turnAll(by);
    setAnnouncement(allAnnouncement(turnedAll(state.turns, by), by));
  };

  // The main button: too few files, or, once a page tool's pages are shown, what its toggle kind still needs.
  const tooFew = state.files.length < words.minFiles;
  const blocked = rules && filePages > 0 ? rules.blocked(filePages, marks) : turnsBlocked;
  const ready = canRun(state, words.minFiles, blocked === null) && hold === null;
  // An empty text's sentence goes under the main button once its field is shown, after too few files and the toggles' sentence.
  // A picture still being read says so there too.
  const tiedSentence = tooFew ? words.tooFewFiles : (blocked ?? (showOptions && hold && holdsUnderButton(hold) ? hold.sentence : null));
  const fieldHoldId = fieldHold ? (options.find((option) => option.key === fieldHold.key)?.kind === 'picture' ? pictureErrorId : errorId)(fieldId(fieldHold.key)) : null;
  const describedBy = [tiedSentence ? `${toolId}-why-not` : null, fieldHoldId, ...huge.map(hugeId), ...pictureNotices.map(({ key }) => pictureNoticeId(key))]
    .filter(Boolean)
    .join(' ');
  // The main button's press, and Enter in a text's field: starts the job only when the button works.
  const pressMain = () => {
    if (ready) void run.start();
  };
  // Enter in a text's field: as the main button when it works; else the reason it waits is said, on every press.
  const enterInField = () => {
    const action = enterAction(ready, [tiedSentence, fieldHold?.sentence]);
    if (action.kind === 'start') pressMain();
    else if (action.kind === 'say') setAnnouncement(action.sentence);
  };

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

  // A job that gave no new file, for a tool with words for it: its sentence and advice, Start again, no Download.
  if (state.step === 'done' && isNoNewFile(state.result) && words.noSmaller) {
    return (
      <Result heading={words.noSmaller.heading} advice={words.noSmaller.advice} notes={[]} onStartAgain={run.clear} headingRef={resultRef} />
    );
  }

  if (state.step === 'done' && state.result && !isNoNewFile(state.result) && result) {
    // A zip says how many files it holds; a PDF, how many pages; a tool that makes files smaller, the old size.
    return (
      <Result
        heading={words.doneHeading}
        file={{ name: state.result.name, detail: resultDetail(state.result), href: result.url }}
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
          <p>{failureSentence(state.failure, words, state.choices, state.pictures)}</p>
          <div>
            <button type="button" className="button-secondary" onClick={run.backToFiles}>
              {words.multiple ? 'Go back to your files' : 'Go back to your file'}
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
          ) : oneFileRow ? null : (
            <p ref={summaryRef} tabIndex={-1} className={styles.summary}>
              {fileCount(count.files)}
              {everyReady && listPages ? `, ${pageCount(count.pages)}` : ''}, {formatSize(count.size)}.
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

          {pages && items.length > 0 && !askingPassword && !unreadable ? (
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

          {showOptions
            ? drawnOptions.map((option, index) =>
                option.kind === 'drawing' ? (
                  // Never first (the registry test), so never the focus target. With no rule (which the registry
                  // test forbids) it takes no lines, and holds the main button back.
                  <DrawingPad
                    key={option.key}
                    option={option}
                    id={fieldId(option.key)}
                    drawing={drawnLines(option, state.choices)}
                    rule={drawingRule(toolId, option.key) ?? { maxLines: 0, maxPoints: 0 }}
                    onDraw={(drawing, full) => draw(option.key, drawing, full)}
                    onClear={() => clearDrawing(option)}
                  />
                ) : option.kind === 'choice' ? (
                  <ChoiceGroup
                    key={option.key}
                    option={option}
                    value={chosenValue(option, state.choices)}
                    name={fieldId(option.key)}
                    onChoose={(value) => run.setOption(option.key, value)}
                    chosenRef={index === 0 ? optionRef : undefined}
                  />
                ) : option.kind === 'picture' ? (
                  // Its types come from its line in optionPictures; with none (which the registry test forbids) the
                  // chooser offers nothing named and every pick is turned away, so the main button waits.
                  <PictureField
                    key={option.key}
                    option={option}
                    id={fieldId(option.key)}
                    types={pictureRule(toolId, option.key)?.types ?? []}
                    picked={picturePicked(chosenPicture(option, state.pictures))}
                    chosen={pictureLine(chosenPicture(option, state.pictures))}
                    error={(() => {
                      const entry = chosenPicture(option, state.pictures);
                      return entry ? pictureSentence(option, entry) : null;
                    })()}
                    onPick={(file) => void run.pickPicture(option.key, file)}
                    focusRef={index === 0 ? optionRef : undefined}
                  />
                ) : (
                  <TextField
                    key={option.key}
                    option={option}
                    id={fieldId(option.key)}
                    raw={typedText(option, state.choices)}
                    error={fieldHold?.key === option.key ? fieldHold.sentence : undefined}
                    onType={(value) => typeText(option.key, value)}
                    onEnter={enterInField}
                    focusRef={index === 0 ? optionRef : undefined}
                  />
                ),
              )
            : null}

          {pictureNotices.map(({ key, notice }) => (
            <div key={key} id={pictureNoticeId(key)}>
              <Notice heading={notice.heading}>
                <p>{notice.advice}</p>
              </Notice>
            </div>
          ))}

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

          {problem && unreadableWords ? (
            <Notice heading={unreadableWords.heading} headingRef={damagedRef}>
              {unreadableWords.advice ? <p>{unreadableWords.advice}</p> : null}
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

          {(pages || !words.multiple) && isManyPages(state) ? (
            <Notice heading={`This file has more than ${number(manyPages)} pages`}>
              <p>The job may take a long time. You can still go ahead.</p>
            </Notice>
          ) : null}

          {huge.map((file) => (
            <div key={file.id} id={hugeId(file)}>
              <Notice heading={pixelsHeading(file.name, file.pixels)}>
                <p>{pixelsAdvice}</p>
              </Notice>
            </div>
          ))}

          {isLarge(state) && !askingPassword ? (
            <Notice heading={pages || !words.multiple ? 'This file is more than 100 MB' : 'These files add up to more than 100 MB'}>
              <p>The job may be slow, and a phone may run out of memory. You can still go ahead.</p>
            </Notice>
          ) : null}

          {!askingPassword && !unreadable ? (
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
                aria-describedby={describedBy || undefined}
                onClick={pressMain}
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
