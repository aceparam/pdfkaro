import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Progress } from '../engines/types';
import type { ToolWidgetWords } from '../tools/registry';
import { looksAccepted, sniffLength } from '../widget/accept';
import { outputName } from '../widget/format';
import { initialState, reducer, totals, type State } from '../widget/state';
import { ToolClient, ToolError, type WorkerLike } from '../workers/client';

export type ToolRunResult = { url: string; name: string };

export type ToolRun = {
  state: State;
  result: ToolRunResult | null;
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

  const inspect = useCallback(
    async (id: string) => {
      const file = files.current.get(id);
      if (!file) return;
      const password = passwords.current.get(id);
      try {
        const outcome = await getClient().inspect(file, password);
        const shown = outcome.kind === 'needs-password' && password !== undefined ? { kind: 'wrong-password' as const } : outcome;
        if (files.current.has(id)) dispatch({ type: 'inspected', id, outcome: shown });
      } catch (error) {
        if (error instanceof ToolError && error.kind === 'cancelled') return;
        if (files.current.has(id)) dispatch({ type: 'failed', failure: error instanceof ToolError && error.kind !== 'cancelled' ? error.kind : 'engine' });
      }
    },
    [getClient],
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

  const removeFile = useCallback((id: string) => {
    files.current.delete(id);
    passwords.current.delete(id);
    dispatch({ type: 'removed', id });
  }, []);

  const moveFile = useCallback((id: string, to: number) => dispatch({ type: 'moved', id, to }), []);

  const start = useCallback(async () => {
    const listed = stateRef.current.files;
    const inputs = listed.map((entry) => files.current.get(entry.id)).filter((file): file is File => file !== undefined);
    if (inputs.length !== listed.length || inputs.length === 0) return;
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
  }, [getClient, onProgress, releaseResult, words.outputSuffix, words.resultPagesAreSum]);

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
    client.current?.end();
    client.current = null;
    files.current.clear();
    passwords.current.clear();
    releaseResult();
    dispatch({ type: 'reset' });
  }, [releaseResult]);

  // Leaving the page, including into the back-forward cache, drops everything.
  useEffect(() => {
    window.addEventListener('pagehide', clear);
    return () => {
      window.removeEventListener('pagehide', clear);
      clear();
    };
  }, [clear]);

  return { state, result, addFiles, submitPassword, removeFile, moveFile, start, cancel, backToFiles, clear };
}
