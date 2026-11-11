import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Progress } from '../engines/types';
import type { ToolWidgetWords } from '../tools/registry';
import { looksAccepted, sniffLength } from '../widget/accept';
import { outputName } from '../widget/format';
import { initialState, reducer, totals, type State } from '../widget/state';
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
  /** Adds files. Gives back how many were added and the names of any turned away for being of the wrong type. */
  addFiles(files: File[]): Promise<{ added: number; refused: string[] }>;
  submitPassword(id: string, password: string): Promise<void>;
  removeFile(id: string): void;
  moveFile(id: string, to: number): void;
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
  const drawing = useRef<{ id: string; stopped: boolean } | null>(null);
  const pumpRef = useRef<() => void>(() => {});

  const publishThumbnails = useCallback(() => setThumbnails(Object.fromEntries(thumbnailUrls.current)), []);

  const forgetThumbnail = useCallback(
    (id: string) => {
      const url = thumbnailUrls.current.get(id);
      if (url) URL.revokeObjectURL(url);
      thumbnailUrls.current.delete(id);
      queue.current = forget(queue.current, id);
      publishThumbnails();
    },
    [publishThumbnails],
  );

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
    const id = next(queue.current, stateRef.current);
    const file = id === undefined ? undefined : files.current.get(id);
    if (id === undefined || !file) return;
    queue.current = started(queue.current, id);
    const token = { id, stopped: false };
    drawing.current = token;
    void getClient()
      .thumbnail(file, passwords.current.get(id), 1, thumbnailBox)
      .then((image) => {
        if (token.stopped) return;
        if (drawing.current === token) drawing.current = null;
        // A file removed while its picture was drawn: the picture is thrown away before any address is made.
        if (!files.current.has(id)) {
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
  }, [getClient, publishThumbnails]);

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

  const addFiles = useCallback(
    async (picked: File[]) => {
      const accepted: { id: string; name: string; size: number }[] = [];
      const refused: string[] = [];
      for (const file of picked) {
        const head = new Uint8Array(await file.slice(0, sniffLength).arrayBuffer());
        if (!looksAccepted(head, accepts)) {
          refused.push(file.name);
          continue;
        }
        const id = `f${nextId.current++}`;
        files.current.set(id, file);
        accepted.push({ id, name: file.name, size: file.size });
      }
      if (accepted.length > 0) dispatch({ type: 'added', files: accepted });
      if (refused.length > 0) dispatch({ type: 'refused', names: refused });
      for (const { id } of accepted) await inspect(id);
      return { added: accepted.length, refused };
    },
    [accepts, inspect],
  );

  const submitPassword = useCallback(
    async (id: string, password: string) => {
      passwords.current.set(id, password);
      dispatch({ type: 'reading-again', id });
      await inspect(id);
    },
    [inspect],
  );

  const removeFile = useCallback(
    (id: string) => {
      files.current.delete(id);
      passwords.current.delete(id);
      forgetThumbnail(id);
      dispatch({ type: 'removed', id });
    },
    [forgetThumbnail],
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
      const outputs = await getClient().run(
        inputs,
        listed.map((entry) => passwords.current.get(entry.id)),
        {},
        (progress) => {
          dispatch({ type: 'progressed', progress });
          onProgress?.(progress);
        },
      );
      const output = outputs[0];
      if (!output) throw new ToolError('engine');
      const blob = new Blob([output as BlobPart], { type: 'application/pdf' });
      const name = outputName(inputs[0]!.name, words.outputSuffix);
      resultUrl.current = URL.createObjectURL(blob);
      setResult({ url: resultUrl.current, name });
      dispatch({
        type: 'finished',
        result: { name, size: blob.size, pages: words.resultPagesAreSum ? totals(stateRef.current).pages : undefined },
      });
    } catch (error) {
      if (error instanceof ToolError && error.kind === 'cancelled') return;
      dispatch({ type: 'failed', failure: error instanceof ToolError && error.kind !== 'cancelled' ? error.kind : 'engine' });
    }
  }, [getClient, onProgress, releaseResult, stopThumbnail, words.outputSuffix, words.resultPagesAreSum]);

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

  return { state, result, thumbnails, showThumbnail, addFiles, submitPassword, removeFile, moveFile, start, cancel, backToFiles, clear };
}
