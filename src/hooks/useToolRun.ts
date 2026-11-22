import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Progress } from '../engines/types';
import type { ToolWidgetWords } from '../tools/registry';
import { chooseFiles, looksAccepted, sniffLength } from '../widget/accept';
import { outputName, outputType, stem } from '../widget/format';
import { initialState, reducer, totals, type State } from '../widget/state';
import { shownItems } from '../widget/items';
import { jobOptions, picturesToReread, picturesToSend, rereadPicture, type NewPasswordField, type NewPasswords } from '../widget/options';
import { pictureRule, type Drawing } from '../widget/option-values';
import { orderToSend } from '../widget/order';
import { turnRules } from '../widget/turns';
import { toggleRules } from '../widget/toggles';
import { emptyQueue, finished, forget, next, started, stop, want } from '../widget/thumbnails';
import { ToolClient, ToolError, type WorkerLike } from '../workers/client';
import { settleHoldMs } from '../workers/messages';

// Clients whose workspace has gone while a retired worker was still finishing its set (a pick of the wrong kind past
// the hold): that worker is left to finish, and ended on leaving the page or at the visitor's next pick.
const lingering = new Set<ToolClient>();
function endLingering(): void {
  for (const each of lingering) each.end();
  lingering.clear();
}
// Registered when this file is first loaded, so it runs on leaving even after the workspace has unmounted.
if (typeof window !== 'undefined') window.addEventListener('pagehide', endLingering);
import { runJob } from './run-job';

export type ToolRunResult = { url: string; name: string };

export type ToolRun = {
  state: State;
  result: ToolRunResult | null;
  /** Thumbnail addresses (`blob:`) by file id, for the files that have one. */
  thumbnails: Readonly<Record<string, string>>;
  /** A listed file has come into view, so its thumbnail may be drawn. */
  showThumbnail(id: string): void;
  /**
   * Adds files. Gives back how many were added, the names of any turned away for being of the wrong
   * type, and, for a tool that takes one file, the names of the others left out. When nothing was listed and
   * every file is of the wrong kind, it first waits for the worker's set (`waiting`), and `ended` says the
   * wait was ended by Remove or by the page being cleared, so nothing is to be said.
   */
  addFiles(files: File[]): Promise<{ added: number; refused: string[]; leftOut: string[]; ended?: 'removed' | 'cleared' }>;
  /**
   * The files of a pick that took none, while the worker's set loads: shown as "Getting ready" with Remove, so a
   * pick of the wrong kind loads the same files as any other. Null when no such wait is under way.
   */
  waiting: readonly { name: string; size: number }[] | null;
  /** Ends a wrong-kind wait, and its worker, as Remove does. */
  removeWaiting(): void;
  submitPassword(id: string, password: string): Promise<void>;
  removeFile(id: string): void;
  moveFile(id: string, to: number): void;
  /** Marks or clears the toggle on a page, such as a cut after it. */
  toggleMark(page: number): void;
  /** Moves a page of the one file to a new place, counted from 0: Reorder pages. */
  movePage(page: number, to: number): void;
  /** Turns a page of the one file a quarter, right (1) or left (-1): Rotate PDF. */
  turnPage(page: number, by: 1 | -1): void;
  /** Turns every page of the one file a quarter. */
  turnAll(by: 1 | -1): void;
  /** Shows the next batch of pages. */
  showMore(): void;
  /** Sets what one of the tool's options shows. */
  setOption(key: string, value: string): void;
  /** Sets a drawing's lines, once per finished line or on Clear. */
  setDrawing(key: string, drawing: Drawing): void;
  /** What each new password's two fields hold, exactly as typed. Held here, never in the state. */
  newPasswords: NewPasswords;
  /** Sets what one of a new password's two fields holds. */
  setNewPassword(key: string, field: NewPasswordField, value: string): void;
  /**
   * Chooses a picture for the picture option `key`, replacing any chosen before. One of the wrong type, by its
   * first bytes, leaves no picture chosen; any other is held in memory beside the files and read in the worker.
   */
  pickPicture(key: string, file: File): Promise<void>;
  start(): Promise<void>;
  cancel(): void;
  backToFiles(): void;
  /**
   * Forgets every file, password (an input file's and a new one) and result, and ends every worker. On unmount alone,
   * a retired worker still finishing its set is left to finish, and ended on leaving or at the next pick.
   */
  clear(how?: 'all' | 'unmount'): void;
};

/** The thumbnail box, twice the 52 by 68 CSS slot so the picture is sharp on a phone. */
const thumbnailBox = { width: 104, height: 136 };

type Options = {
  toolId: string;
  accepts: string[];
  words: ToolWidgetWords;
  /** The page's preset, such as PDF to JPG's `{ format: 'jpg' }`: engine options that every job starts from. */
  preset?: Readonly<Record<string, string | number | boolean>>;
  createWorker: () => WorkerLike;
  onProgress?: (progress: Progress) => void;
};

/**
 * Joins the reducer to the tool worker. The files, any passwords (an input file's, and
 * a new password typed for an option) and any pictures chosen for options live here, in
 * memory only. They never go into the reducer, storage or the address, and no address
 * is made for a picture. Only a new password's first field goes to the worker, with the job.
 */
export function useToolRun({ toolId, accepts, words, preset, createWorker, onProgress }: Options): ToolRun {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [result, setResult] = useState<ToolRunResult | null>(null);
  const files = useRef(new Map<string, File>());
  const passwords = useRef(new Map<string, string>());
  // Each picture option's chosen picture, by key: the one place its bytes are held on the page.
  const pictures = useRef(new Map<string, File>());
  // The file each key's read in the worker is for, while one is in flight; and a count of picks per key, so a pick
  // whose first bytes come back after a later pick's is dropped.
  // Each attempt has its own token, so an attempt that ends never clears the mark of a newer read of the same file.
  const picturesInFlight = useRef(new Map<string, { file: File }>());
  const pictureTickets = useRef(new Map<string, number>());
  // Each new password's two fields, by option key: in a state of its own, so the fields redraw as typed, never in
  // the reducer; the ref is kept in step by the one setter, so `start` reads what is typed now. Kept through Cancel,
  // a failure and "Choose another file"; forgotten when a job finishes, by "Start again", when the last file is
  // removed and on leaving the page, each in the handler that causes it.
  const [newPasswords, setNewPasswords] = useState<NewPasswords>({});
  const newPasswordsRef = useRef<NewPasswords>({});
  const setNewPassword = useCallback((key: string, field: NewPasswordField, value: string) => {
    const now = newPasswordsRef.current;
    const entry = Object.hasOwn(now, key) ? now[key] : undefined;
    const next: NewPasswords = { ...now, [key]: { first: entry?.first ?? '', again: entry?.again ?? '', [field]: value } };
    newPasswordsRef.current = next;
    setNewPasswords(next);
  }, []);
  const forgetNewPasswords = useCallback(() => {
    if (Object.keys(newPasswordsRef.current).length === 0) return;
    newPasswordsRef.current = {};
    setNewPasswords({});
  }, []);
  const nextId = useRef(1);
  const client = useRef<ToolClient | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const getClient = useCallback(() => {
    client.current ??= new ToolClient(toolId, createWorker);
    return client.current;
  }, [toolId, createWorker]);

  // The download address is kept in a ref as well as in state, so that it is
  // released even when the widget is unmounting and state updates no longer run.
  const resultUrl = useRef<string | null>(null);
  const releaseResult = useCallback(() => {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = null;
    setResult(null);
  }, []);

  // Thumbnails: their addresses, which item comes next, and the one being drawn.
  const [thumbnails, setThumbnails] = useState<Readonly<Record<string, string>>>({});
  const thumbnailUrls = useRef(new Map<string, string>());
  const queue = useRef(emptyQueue);
  const drawing = useRef<{ id: string; fileId: string; stopped: boolean } | null>(null);
  const pumpRef = useRef<() => void>(() => {});

  const publishThumbnails = useCallback(() => setThumbnails(Object.fromEntries(thumbnailUrls.current)), []);

  // Forgets the thumbnails of a file: its own item, or every page of it.
  const forgetThumbnails = useCallback(
    (fileId: string) => {
      for (const [id, url] of [...thumbnailUrls.current]) {
        if (id !== fileId && !id.startsWith(`${fileId}:`)) continue;
        URL.revokeObjectURL(url);
        thumbnailUrls.current.delete(id);
      }
      for (const id of [...queue.current.wanted, ...queue.current.drawn, ...queue.current.failed]) {
        if (id === fileId || id.startsWith(`${fileId}:`)) queue.current = forget(queue.current, id);
      }
      publishThumbnails();
    },
    [publishThumbnails],
  );

  // The file whose document the worker keeps open for drawing its pages, if any.
  const keptFile = useRef<string | null>(null);

  // Forgets the thumbnail being drawn, which is asked for again later. Says whether there was one.
  const forgetDrawing = useCallback((): boolean => {
    if (!drawing.current) return false;
    drawing.current.stopped = true;
    drawing.current = null;
    queue.current = stop(queue.current);
    return true;
  }, []);

  // The job and reading come first: a thumbnail being drawn is stopped, and is
  // asked for again later. Before the worker's set has settled, no drawing can
  // be under way, so a thumbnail waiting for the set is dropped by message and
  // the worker is kept: ending it then would cut its files short, and the next
  // worker would ask for them again, for some files only. Once the set has
  // settled, or when the drop came too late, the drawing is stopped by ending
  // the worker, as before. The next read is sent only after this, so no read
  // ever waits behind a document being opened, and no read is ever pending when
  // a thumbnail's time limit ends a worker.
  const stopThumbnail = useCallback(async () => {
    if (!forgetDrawing()) return;
    const current = client.current;
    if (!current) return;
    if ((await current.dropThumbnail()) !== 'too-late' || client.current !== current) return;
    // While the drop was answered, the queue may have started another drawing on this worker (a file was removed
    // meanwhile). It is forgotten too, so it is asked for again, before the worker it runs on is ended.
    forgetDrawing();
    current.endCurrent('cancelled');
    pumpRef.current();
  }, [forgetDrawing]);

  const pump = useCallback(() => {
    // Only the pages shown are made, so a file of very many pages costs the page no more than one batch.
    const items = shownItems(stateRef.current, words.items);
    const id = next(queue.current, stateRef.current, items);
    const item = items.find((entry) => entry.id === id);
    const file = item ? files.current.get(item.fileId) : undefined;
    if (id === undefined || !item || !file) return;
    queue.current = started(queue.current, id);
    const token = { id, fileId: item.fileId, stopped: false };
    drawing.current = token;
    // Only a tool that lists one file's pages keeps its document open between pictures;
    // a list of files draws one picture from each, so each document is let go at once.
    const keep = words.items === 'pages';
    keptFile.current = keep ? item.fileId : null;
    const worker = getClient();
    void worker
      .thumbnail(file, passwords.current.get(item.fileId), item.page, thumbnailBox, item.fileId)
      .then((image) => {
        if (!keep && !token.stopped) worker.closeDocument();
        if (token.stopped) return;
        if (drawing.current === token) drawing.current = null;
        // A file removed while its picture was drawn: the picture is thrown away before any address is made.
        if (!files.current.has(item.fileId)) {
          pumpRef.current();
          return;
        }
        if (image) {
          thumbnailUrls.current.set(id, URL.createObjectURL(new Blob([image as BlobPart], { type: 'image/png' })));
          publishThumbnails();
        }
        queue.current = finished(queue.current, id, image ? 'drawn' : 'failed');
        pumpRef.current();
      });
  }, [getClient, publishThumbnails, words.items]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  // Each change of step or of the list may let the next thumbnail be drawn.
  useEffect(() => {
    pump();
  }, [state, pump]);

  const showThumbnail = useCallback(
    (id: string) => {
      queue.current = want(queue.current, id);
      pumpRef.current();
    },
    [],
  );

  // Each file's latest read: a password can be tried again before the last try is answered, and the worker reads
  // both at once, so their answers can come back in either order. Only the latest read's answer is shown.
  const inspectTickets = useRef(new Map<string, number>());
  const inspect = useCallback(
    async (id: string) => {
      const file = files.current.get(id);
      if (!file) return;
      const password = passwords.current.get(id);
      const ticket = (inspectTickets.current.get(id) ?? 0) + 1;
      inspectTickets.current.set(id, ticket);
      const latest = () => files.current.has(id) && inspectTickets.current.get(id) === ticket;
      await stopThumbnail();
      try {
        const outcome = await getClient().inspect(file, password);
        const shown = outcome.kind === 'needs-password' && password !== undefined ? { kind: 'wrong-password' as const } : outcome;
        if (latest()) dispatch({ type: 'inspected', id, outcome: shown });
      } catch (error) {
        if (error instanceof ToolError && error.kind === 'cancelled') return;
        if (latest()) dispatch({ type: 'failed', failure: error instanceof ToolError && error.kind !== 'cancelled' ? error.kind : 'engine' });
      }
    },
    [getClient, stopThumbnail],
  );

  const removeFile = useCallback(
    (id: string) => {
      // A file removed while its picture is drawn: stop that drawing, so no two are ever drawn at once.
      if (drawing.current?.fileId === id) void stopThumbnail();
      // The worker lets go of the copy it kept open to draw this file's pages.
      if (keptFile.current === id) {
        client.current?.closeDocument();
        keptFile.current = null;
      }
      files.current.delete(id);
      passwords.current.delete(id);
      inspectTickets.current.delete(id);
      // Removing the last file ends the working area and resets the state, so the pictures and new passwords go with it.
      if (files.current.size === 0) {
        pictures.current.clear();
        forgetNewPasswords();
      }
      forgetThumbnails(id);
      dispatch({ type: 'removed', id });
    },
    [forgetNewPasswords, forgetThumbnails, stopThumbnail],
  );

  // A pick that took no file waits for the worker's set (decision 9): its files, and how the wait is ended early.
  const [waiting, setWaiting] = useState<readonly { name: string; size: number }[] | null>(null);
  const endWait = useRef<((how: 'removed' | 'cleared') => void) | null>(null);
  const removeWaiting = useCallback(() => endWait.current?.('removed'), []);

  const addFiles = useCallback(
    async (picked: File[]): Promise<{ added: number; refused: string[]; leftOut: string[]; ended?: 'removed' | 'cleared' }> => {
      // A worker an earlier wrong-kind pick left finishing its set is ended now: this pick is the visitor's action.
      endLingering();
      // Every pick loads the tool's pick set first, before the files are looked at, so a pick that takes no file
      // fetches the same files as any other. A worker already running answers at once.
      const preparing = getClient().prepare(settleHoldMs);
      const looked: File[] = [];
      const refused: string[] = [];
      for (const file of picked) {
        const head = new Uint8Array(await file.slice(0, sniffLength).arrayBuffer());
        if (looksAccepted(head, accepts)) looked.push(file);
        else refused.push(file.name);
      }
      const listed = stateRef.current.files.map((entry) => entry.id);
      if (looked.length === 0 && listed.length === 0 && refused.length > 0) {
        // Nothing to list: the files' line says "Getting ready" until the set has loaded or failed, or the page has
        // waited the hold; then the picker says why. The worker, never sent a file, is ended if its set has settled,
        // and otherwise retired, so it finishes loading first. Remove ends the wait and the worker at once.
        setWaiting(picked.map((file) => ({ name: file.name, size: file.size })));
        const ended = await new Promise<'removed' | 'cleared' | undefined>((resolve) => {
          const finish = (how?: 'removed' | 'cleared') => {
            if (endWait.current === finish) endWait.current = null;
            resolve(how);
          };
          endWait.current = finish;
          void preparing.then(() => finish());
        });
        if (ended === 'removed') client.current?.end();
        if (ended !== 'cleared') {
          setWaiting(null);
          client.current?.retire();
        }
        return { added: 0, refused: ended ? [] : refused, leftOut: [], ...(ended ? { ended } : {}) };
      }
      const { take, leftOut, replace } = chooseFiles(looked, listed, words.multiple);
      const accepted = take.map((file) => {
        const id = `f${nextId.current++}`;
        files.current.set(id, file);
        return { id, name: file.name, size: file.size };
      });
      if (accepted.length > 0) dispatch({ type: 'added', files: accepted });
      // The file it replaces goes after the new one is listed, so the list is never empty in between.
      for (const id of replace) removeFile(id);
      if (refused.length > 0) dispatch({ type: 'refused', names: refused });
      for (const { id } of accepted) await inspect(id);
      return { added: accepted.length, refused, leftOut: leftOut.map((file) => file.name) };
    },
    [accepts, getClient, inspect, removeFile, words.multiple],
  );

  const submitPassword = useCallback(
    async (id: string, password: string) => {
      passwords.current.set(id, password);
      dispatch({ type: 'reading-again', id });
      await inspect(id);
    },
    [inspect],
  );

  const moveFile = useCallback((id: string, to: number) => dispatch({ type: 'moved', id, to }), []);

  // Reads a held picture in the worker, and records the answer only if the same file is still held for its key.
  // A read cut short by the worker being ended (a thumbnail's time limit, or `stopThumbnail`) is read again while
  // the picture is still chosen and still being read, at most twice, then called damaged (`rereadPicture`).
  const readChosenPicture = useCallback(
    async (key: string, file: File): Promise<void> => {
      for (let tries = 0; ; tries += 1) {
        await stopThumbnail();
        const attempt = { file };
        picturesInFlight.current.set(key, attempt);
        try {
          const outcome = await getClient().inspectPicture(file, key);
          if (pictures.current.get(key) === file) dispatch({ type: 'picture-read', key, outcome });
          return;
        } catch (error) {
          const held = pictures.current.get(key) === file;
          if (error instanceof ToolError && error.kind === 'cancelled') {
            const entry = Object.hasOwn(stateRef.current.pictures, key) ? stateRef.current.pictures[key] : undefined;
            // Only while listing: the job's own end cancels a read too, and a read again then would start a worker.
            const step = rereadPicture(entry, held, tries, stateRef.current.step === 'listing');
            if (step === 'read-again') continue;
            if (step === 'damaged') dispatch({ type: 'picture-read', key, outcome: { kind: 'damaged' } });
            return;
          }
          // The engine could not be loaded, or the worker ran out of memory: the tool's failure, as for a file.
          if (held) dispatch({ type: 'failed', failure: error instanceof ToolError && error.kind !== 'cancelled' ? error.kind : 'engine' });
          return;
        } finally {
          if (picturesInFlight.current.get(key) === attempt) picturesInFlight.current.delete(key);
        }
      }
    },
    [getClient, stopThumbnail],
  );

  // A read still in flight for a key that was just picked again is for a file no longer held. Reading a hostile PNG
  // can take minutes, and the next read would wait behind it, so the worker is ended and the new read starts on a
  // fresh one. It is ended only once its set has settled (held to a limit), so its files are never cut short for a
  // picture's sake; the new read waits for that. The old read's answer is "cancelled" for a file not held, so it is
  // not read again; the new pick counts its own tries from 0. No file is being read then: the field is shown only
  // once every file has been read.
  const endReplacedRead = useCallback(
    async (key: string) => {
      const inFlight = picturesInFlight.current.get(key);
      if (inFlight === undefined || pictures.current.get(key) === inFlight.file) return;
      picturesInFlight.current.delete(key);
      await stopThumbnail();
      await client.current?.retireWhenSettled();
    },
    [stopThumbnail],
  );

  const pickPicture = useCallback(
    async (key: string, file: File) => {
      if (stateRef.current.step !== 'listing') return;
      const ticket = (pictureTickets.current.get(key) ?? 0) + 1;
      pictureTickets.current.set(key, ticket);
      const head = new Uint8Array(await file.slice(0, sniffLength).arrayBuffer());
      // "Start again", leaving or a later pick while the first bytes were read: this pick is dropped.
      if (stateRef.current.step !== 'listing' || pictureTickets.current.get(key) !== ticket) return;
      const types = pictureRule(toolId, key)?.types ?? [];
      if (!looksAccepted(head, [...types])) {
        // A wrong pick leaves no picture chosen, even if one was ready before: the field holds the last pick.
        pictures.current.delete(key);
        dispatch({ type: 'picture-chosen', key, name: file.name, size: file.size, status: 'refused' });
        await endReplacedRead(key);
        return;
      }
      pictures.current.set(key, file);
      dispatch({ type: 'picture-chosen', key, name: file.name, size: file.size, status: 'reading' });
      await endReplacedRead(key);
      // "Start again", leaving or a later pick while the old read was ended: this pick is dropped.
      if (stateRef.current.step !== 'listing' || pictureTickets.current.get(key) !== ticket || pictures.current.get(key) !== file) return;
      await readChosenPicture(key, file);
    },
    [endReplacedRead, readChosenPicture, toolId],
  );

  // How many pages the one result has: from the toggle kind when it knows (Extract: the pages chosen);
  // else 'sum' adds the inputs up and 'input' is the one input as it was, both the listed total.
  const resultPageCount = useCallback((): number | undefined => {
    const rules = words.itemToggle ? toggleRules[words.itemToggle.kind] : undefined;
    const listed = totals(stateRef.current).pages;
    if (rules?.resultPages) return rules.resultPages(listed, stateRef.current.marks);
    return words.resultPages === 'none' ? undefined : listed;
  }, [words.itemToggle, words.resultPages]);

  // What the engine is sent besides the files: the toggle kind's option, or, for a tool whose pages
  // move, the order shown (every page in its place when none has moved).
  const jobOption = useCallback((): Record<string, unknown> => {
    // The toggle kind's option, from marks sorted as numbers: sorted as text, 10 would come before 9.
    if (words.itemToggle) return toggleRules[words.itemToggle.kind].option([...stateRef.current.marks].sort((a, b) => a - b));
    if (words.items === 'pages' && words.itemControls) return { order: orderToSend(stateRef.current.order, totals(stateRef.current).pages) };
    if (words.itemTurns) return turnRules.option(stateRef.current.turns, totals(stateRef.current).pages);
    return {};
  }, [words.itemToggle, words.items, words.itemControls, words.itemTurns]);

  const start = useCallback(async () => {
    const listed = stateRef.current.files;
    const inputs = listed.map((entry) => files.current.get(entry.id)).filter((file): file is File => file !== undefined);
    if (inputs.length !== listed.length || inputs.length === 0) return;
    // Every job runs in a fresh worker, which loads the tool's whole job set before the engine sees a file: the
    // reading worker, any thumbnail it draws and the document it keeps open are ended here, at the visitor's press.
    forgetDrawing();
    client.current?.end();
    releaseResult();
    dispatch({ type: 'started' });
    try {
      keptFile.current = null;
      // A tool that can give several files always says how to name them in a zip, so the worker fetches the
      // zip code on every run, whatever the file gives.
      const extension = words.outputExtension ?? 'pdf';
      const zip = words.outputs === 'several' ? { stem: stem(inputs[0]!.name), partSuffix: words.partSuffix, extension } : undefined;
      // Sending the job and reading its outcome is a plain function (run-job.ts), which forgets the new passwords
      // and the input files' own passwords itself once the job has finished with a file or with no new file.
      const outcome = await runJob({
        client: getClient(),
        inputs,
        passwords: listed.map((entry) => passwords.current.get(entry.id)),
        // The page's preset, what the page's items say, then the options chosen; no preset key is an option key.
        // A new password's first field goes with it, as typed; its second never leaves the page.
        options: jobOptions(preset, jobOption(), words.options, stateRef.current.choices, { newPasswords: newPasswordsRef.current }),
        onProgress: (progress) => {
          dispatch({ type: 'progressed', progress });
          onProgress?.(progress);
        },
        zip,
        // Each shown, ready picture beside the files; a hidden or unready one is not sent.
        pictures: picturesToSend(words.options, stateRef.current.choices, stateRef.current.pictures, pictures.current),
        hasNoSmallerWords: words.noSmaller !== undefined,
        forgetNewPasswords,
        // The listed files keep their status; the worker that held them opened was ended with the job, and no
        // result screen reads this map (no way back to the files from a result, no thumbnails there).
        forgetInputPasswords: () => passwords.current.clear(),
      });
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind === 'failed') {
        dispatch({ type: 'failed', failure: outcome.failure });
        return;
      }
      if (outcome.kind === 'no-new-file') {
        dispatch({ type: 'finished', result: { none: true } });
        return;
      }
      const { output, parts } = outcome;
      const inputSize = inputs.reduce((sum, file) => sum + file.size, 0);
      const zipped = parts !== undefined && parts > 1;
      // The download's type follows its extension: a zip, or one output of the tool's own kind.
      const named = zipped ? 'zip' : extension;
      const blob = new Blob([output as BlobPart], { type: outputType(named) });
      const name = outputName(inputs[0]!.name, words.outputSuffix, named);
      resultUrl.current = URL.createObjectURL(blob);
      setResult({ url: resultUrl.current, name });
      dispatch({
        type: 'finished',
        result: {
          name,
          size: blob.size,
          pages: zipped ? undefined : resultPageCount(),
          parts: zipped ? parts : undefined,
          was: words.resultWas ? inputSize : undefined,
        },
      });
    } catch (error) {
      if (error instanceof ToolError && error.kind === 'cancelled') return;
      dispatch({ type: 'failed', failure: error instanceof ToolError && error.kind !== 'cancelled' ? error.kind : 'engine' });
    }
  }, [getClient, onProgress, releaseResult, forgetDrawing, forgetNewPasswords, words.outputSuffix, words.outputs, words.partSuffix, words.outputExtension, words.noSmaller, words.resultWas, words.options, preset, jobOption, resultPageCount]);

  const toggleMark = useCallback((page: number) => dispatch({ type: 'toggled', page }), []);
  const movePage = useCallback((page: number, to: number) => dispatch({ type: 'page-moved', page, to }), []);
  const turnPage = useCallback((page: number, by: 1 | -1) => dispatch({ type: 'page-turned', page, by }), []);
  const turnAll = useCallback((by: 1 | -1) => dispatch({ type: 'all-turned', by }), []);
  const showMore = useCallback(() => dispatch({ type: 'shown-more' }), []);
  const setOption = useCallback((key: string, value: string) => dispatch({ type: 'option-set', key, value }), []);
  const setDrawing = useCallback((key: string, drawing: Drawing) => dispatch({ type: 'drawing-set', key, drawing }), []);

  // Reads again, in turn, each picture still held among `keys`: those a failure or Cancel left being read.
  const rereadPictures = useCallback(
    async (keys: readonly string[]) => {
      for (const key of keys) {
        const file = pictures.current.get(key);
        if (file) await readChosenPicture(key, file);
      }
    },
    [readChosenPicture],
  );

  // Cancel ends the worker, which cancels a hidden picture's read still running; that read's own answer comes
  // before the page is listing again, so it is not read again there (`rereadPicture`). Cancel reads it again
  // here, as "Go back to your file" does, so it never stays "Getting ready" and thumbnails are not held back.
  const cancel = useCallback(() => {
    const unreadPictures = picturesToReread(stateRef.current);
    client.current?.end();
    dispatch({ type: 'back-to-files' });
    void rereadPictures(unreadPictures);
  }, [rereadPictures]);

  // Going back after a failure reads again any file or picture the failure left unread,
  // such as when the engine could not be fetched while they were being read.
  const backToFiles = useCallback(() => {
    const unread = stateRef.current.files.filter((file) => file.status === 'reading' || file.checking).map((file) => file.id);
    const unreadPictures = picturesToReread(stateRef.current);
    dispatch({ type: 'back-to-files' });
    void (async () => {
      for (const id of unread) await inspect(id);
      await rereadPictures(unreadPictures);
    })();
  }, [inspect, rereadPictures]);

  // Forgets everything and ends every worker: "Start again" and leaving the page. On unmount alone (the picker came
  // back after a wrong-kind pick), a retired worker still finishing its set is left to finish (`lingering`).
  const clear = useCallback((how: 'all' | 'unmount' = 'all') => {
    endWait.current?.('cleared');
    setWaiting(null);
    if (drawing.current) drawing.current.stopped = true;
    drawing.current = null;
    keptFile.current = null;
    if (how === 'unmount' && client.current?.lingering) {
      client.current.endCurrent('cancelled');
      lingering.add(client.current);
    } else client.current?.end();
    client.current = null;
    files.current.clear();
    passwords.current.clear();
    inspectTickets.current.clear();
    pictures.current.clear();
    picturesInFlight.current.clear();
    forgetNewPasswords();
    for (const url of thumbnailUrls.current.values()) URL.revokeObjectURL(url);
    thumbnailUrls.current.clear();
    queue.current = emptyQueue;
    publishThumbnails();
    releaseResult();
    dispatch({ type: 'reset' });
  }, [forgetNewPasswords, publishThumbnails, releaseResult]);

  // Leaving the page, including into the back-forward cache, drops everything.
  useEffect(() => {
    const leave = () => clear('all');
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      clear('unmount');
    };
  }, [clear]);

  return { state, result, thumbnails, showThumbnail, addFiles, waiting, removeWaiting, submitPassword, removeFile, moveFile, toggleMark, movePage, turnPage, turnAll, showMore, setOption, setDrawing, newPasswords, setNewPassword, pickPicture, start, cancel, backToFiles, clear };
}
