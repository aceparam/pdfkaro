// The one place the site starts a worker.
//
// A Content Security Policy given as a meta tag reaches a worker only when the
// worker starts from a local address such as blob:. A worker started straight
// from a same-origin file gets its policy from its own response headers, and
// the static host sends none. So each worker starts from a tiny blob: script
// that holds nothing but an import of the real worker file by its full
// address. The worker then runs under the page's policy, and the file still
// runs at its plain address, so its own import()s resolve against it.
//
// Lint allows `new Worker` nowhere else in src/, and check:worker finds no other
// worker start in the built files.

/**
 * Starts `file`, resolved against `base`, as a module worker from a blob:
 * address of this page. The blob holds only `import "<address>";`, never file
 * data. Ending the worker with `terminate()` also revokes the blob: address.
 */
export function workerFromBlob(file: string, base: string): Worker {
  const address = new URL(file, base).href;
  if (new URL(address).origin !== new URL(base).origin) throw new Error('A worker starts only from a file of the site itself.');
  const blob = new Blob([`import ${JSON.stringify(address)};`], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: 'module' });
  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    terminate();
    URL.revokeObjectURL(url);
  };
  return worker;
}
