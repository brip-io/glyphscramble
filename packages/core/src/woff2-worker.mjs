import { parentPort } from "node:worker_threads";
import { compress } from "woff2-encoder";

if (!parentPort) throw new Error("WOFF2 worker requires a parent port.");

parentPort.on("message", async ({ input }) => {
  try {
    const output = await compress(new Uint8Array(input));
    const bytes = Uint8Array.from(output);
    parentPort.postMessage({ output: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    parentPort.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
