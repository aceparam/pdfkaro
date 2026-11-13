import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Progress } from '../engines/types';
import type { ToolWidgetWords } from '../tools/registry';
import { chooseFiles, looksAccepted, sniffLength } from '../widget/accept';
import { outputName, stem } from '../widget/format';
import { initialState, reducer, totals, type State } from '../widget/state';
import { shownItems } from '../widget/items';
import { emptyQueue, finished, forget, next, started, stop, want } from '../widget/thumbnails';
import { ToolClient, ToolError, type WorkerLike } from '../workers/client';

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
   * type, and, for a tool that takes one file, the names of the others left out.
   */
  addFiles(files: File[]): Promise<{ added: number; refused: string[]; leftOut: string[] }>;
  submitPassword(id: string, password: string): Promise<void>;
  removeFile(id: string): void;
  moveFile(id: string, to: number): void;
  /** Marks or clears the toggle on a page, such as a cut after it. */
  toggleMark(page: number): void;
  /** Shows the next batch of pages. */
  showMore(): void;
  start(): Promise<void>;
  cancel(): void;
  backToFiles(): void;
  /** Forgets every file, password and result, and ends the worker. */
  clear(): void;
};

/** The thumbnail box, twice the 52 by 68 CSS slot so the picture is sharp on a phone. */
const thumbnailBox = { width: 104, height: 136 };

type Options = {
  toolId: string;
  accepts: string[];
  words: ToolWidgetWords;
  createWorker: () => WorkerLike;
  onProgress?: (progress: Progress) => void;
};

/**
 * Joins the reducer to the tool worker. The files and any passwords live here,
 * in memory only. They never go into the reducer, storage or the address.
 */
export function useToolRun({ toolId, accepts, words, createWorker, onProgress }: Options): ToolRun {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [result, setResult] = useState<ToolRunResult | null>(null);
  const files = useRef(new Map<string, File>());
  const passwords = useRef(new Map<string, string>());
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

  // The job and reading come first: a thumbnail being drawn is stopped by
  // ending the worker, and is asked for again later. Every file has been read
  // before the job can start, and a file about to be read has not started, so
  // nothing else is lost; and no read is ever pending when a thumbnail's time
  // limit ends a worker.
  const stopThumbnail = useCallback(() => {
    if (!drawing.current) return;
    drawing.current.stopped = true;
    drawing.current = null;
    queue.current = stop(queue.current);
    client.current?.end();
  }, []);

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

  const inspect = useCallback(
    async (id: string) => {
      const file = files.current.get(id);
      if (!file) return;
      const password = passwords.current.get(id);
      stopThumbnail();
      try {
        const outcome = await getClient().inspect(file, password);
        const shown = outcome.kind === 'needs-password' && password !== undefined ? { kind: 'wrong-password' as const } : outcome;
        if (files.current.has(id)) dispatch({ type: 'inspected', id, outcome: shown });
      } catch (error) {
        if (error instanceof ToolError && error.kind === 'cancelled') return;
        if (files.current.has(id)) dispatch({ type: 'failed', failure: error instanceof ToolError && error.kind !== 'cancelled' ? error.kind : 'engine' });
      }
    },
    [getClient, stopThumbnail],
  );

  const removeFile = useCallback(
    (id: string) => {
      // A file removed while its picture is drawn: stop that drawing, so no two are ever drawn at once.
      if (drawing.current?.fileId === id) stopThumbnail();
      // The worker lets go of the copy it kept open to draw this file's pages.
      if (keptFile.current === id) {
        client.current?.closeDocument();
        keptFile.current = null;
      }
      files.current.delete(id);
      passwords.current.delete(id);
      forgetThumbnails(id);
      dispatch({ type: 'removed', id });
    },
    [forgetThumbnails, stopThumbnail],
  );

  const addFiles = useCallback(
    async (picked: File[]) => {
      const looked: File[] = [];
      const refused: string[] = [];
      for (const file of picked) {
        const head = new Uint8Array(await file.slice(0, sniffLength).arrayBuffer());
        if (looksAccepted(head, accepts)) looked.push(file);
        else refused.push(file.name);
      }
      const listed = stateRef.current.files.map((entry) => entry.id);
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
    [accepts, inspect, removeFile, words.multiple],
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

  const start = useCallback(async () => {
    const listed = stateRef.current.files;
    const inputs = listed.map((entry) => files.current.get(entry.id)).filter((file): file is File => file !== undefined);
    if (inputs.length !== listed.length || inputs.length === 0) return;
    stopThumbnail();
    releaseResult();
    dispatch({ type: 'started' });
    try {
      keptFile.current = null;
      // A tool that can give several files always says how to name them in a zip, so the worker fetches the
      // zip code on every run, whatever the file gives.
      const zip = words.outputs === 'several' ? { stem: stem(inputs[0]!.name), partSuffix: words.partSuffix } : undefined;
      const { outputs, parts } = await getClient().run(
        inputs,
        listed.map((entry) => passwords.current.get(entry.id)),
        // Split's cuts, sorted as numbers: sorted as text, 10 would come before 9.
        words.itemToggle?.kind === 'cut-after' ? { cuts: [...stateRef.current.marks].sort((a, b) => a - b) } : {},
        (progress) => {
          dispatch({ type: 'progressed', progress });
          onProgress?.(progress);
        },
        zip,
      );
      const output = outputs[0];
      if (!output) throw new ToolError('engine');
      const zipped = parts !== undefined && parts > 1;
      const blob = new Blob([output as BlobPart], { type: zipped ? 'application/zip' : 'application/pdf' });
      const name = outputName(inputs[0]!.name, words.outputSuffix, zipped ? 'zip' : 'pdf');
      resultUrl.current = URL.createObjectURL(blob);
      setResult({ url: resultUrl.current, name });
      dispatch({
        type: 'finished',
        result: {
          name,
          size: blob.size,
          // 'sum' adds the inputs up; 'input' is the one input as it was. Both are the listed total.
          pages: !zipped && words.resultPages !== 'none' ? totals(stateRef.current).pages : undefined,
          parts: zipped ? parts : undefined,
        },
      });
    } catch (error) {
      if (error instanceof ToolError && error.kind === 'cancelled') return;
      dispatch({ type: 'failed', failure: error instanceof ToolError && error.kind !== 'cancelled' ? error.kind : 'engine' });
    }
  }, [getClient, onProgress, releaseResult, stopThumbnail, words.outputSuffix, words.resultPages, words.outputs, words.partSuffix, words.itemToggle]);

  const toggleMark = useCallback((page: number) => dispatch({ type: 'toggled', page }), []);
  const showMore = useCallback(() => dispatch({ type: 'shown-more' }), []);

  const cancel = useCallback(() => {
    client.current?.end();
    dispatch({ type: 'back-to-files' });
  }, []);

  // Going back after a failure reads again any file the failure left unread,
  // such as when the engine could not be fetched while files were being read.
  const backToFiles = useCallback(() => {
    const unread = stateRef.current.files.filter((file) => file.status === 'reading' || file.checking).map((file) => file.id);
    dispatch({ type: 'back-to-files' });
    void (async () => {
      for (const id of unread) await inspect(id);
    })();
  }, [inspect]);

  const clear = useCallback(() => {
    if (drawing.current) drawing.current.stopped = true;
    drawing.current = null;
    keptFile.current = null;
    client.current?.end();
    client.current = null;
    files.current.clear();
    passwords.current.clear();
    for (const url of thumbnailUrls.current.values()) URL.revokeObjectURL(url);
    thumbnailUrls.current.clear();
    queue.current = emptyQueue;
    publishThumbnails();
    releaseResult();
    dispatch({ type: 'reset' });
  }, [publishThumbnails, releaseResult]);

  // Leaving the page, including into the back-forward cache, drops everything.
  useEffect(() => {
    window.addEventListener('pagehide', clear);
    return () => {
      window.removeEventListener('pagehide', clear);
      clear();
    };
  }, [clear]);

  return { state, result, thumbnails, showThumbnail, addFiles, submitPassword, removeFile, moveFile, toggleMark, showMore, start, cancel, backToFiles, clear };
}
