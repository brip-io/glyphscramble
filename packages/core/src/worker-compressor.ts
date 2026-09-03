import { Worker } from "node:worker_threads";

let workerSourcePromise: Promise<string> | undefined;

function loadWorkerSource(): Promise<string> {
  workerSourcePromise ??= import("./woff2-worker-source.js").then(
    ({ default: source }) => source,
  );
  return workerSourcePromise;
}

function abortError(): Error {
  const error = new Error("WOFF2 generation was cancelled.");
  error.name = "AbortError";
  return error;
}

/** Run the CPU-heavy WOFF2 WASM encoder outside the server event loop. */
export async function compressWoff2InWorker(
  input: Uint8Array,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) throw abortError();

  const workerSource = await loadWorkerSource();
  if (signal.aborted) throw abortError();

  // The payload is generated as one self-contained CommonJS program. Using an
  // evaluated worker avoids framework-specific URL/asset rewriting while the
  // lazy import keeps the ~1 MB encoder payload out of startup evaluation.
  const worker = new Worker(workerSource, { eval: true });
  const transferable = input.slice().buffer;

  return new Promise<Uint8Array>((resolve, reject) => {
    let settled = false;
    const finish = (result: { value?: Uint8Array; error?: Error }): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      worker.removeAllListeners();
      void worker.terminate();
      if (result.error) reject(result.error);
      else resolve(result.value!);
    };
    const onAbort = (): void => finish({ error: abortError() });

    signal.addEventListener("abort", onAbort, { once: true });
    worker.once(
      "message",
      (message: { output?: ArrayBuffer; error?: string }) => {
        if (message.error)
          finish({ error: new Error(`WOFF2 worker failed: ${message.error}`) });
        else if (message.output)
          finish({ value: new Uint8Array(message.output) });
        else finish({ error: new Error("WOFF2 worker returned no output.") });
      },
    );
    worker.once("error", (error) => finish({ error }));
    worker.once("exit", (code) => {
      if (code !== 0 && !settled)
        finish({
          error: new Error(`WOFF2 worker exited with status ${code}.`),
        });
    });
    worker.postMessage({ input: transferable }, [transferable]);
  });
}
