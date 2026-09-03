import { Worker } from "node:worker_threads";

const WORKER_URL = new URL("./woff2-worker.mjs", import.meta.url);

function abortError(): Error {
  const error = new Error("WOFF2 generation was cancelled.");
  error.name = "AbortError";
  return error;
}

/** Run the CPU-heavy WOFF2 WASM encoder outside the server event loop. */
export function compressWoff2InWorker(
  input: Uint8Array,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) return Promise.reject(abortError());

  const worker = new Worker(WORKER_URL);
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
