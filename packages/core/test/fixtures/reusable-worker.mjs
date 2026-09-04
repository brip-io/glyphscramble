import { parentPort } from "node:worker_threads";
import process from "node:process";
import { setTimeout } from "node:timers";

if (!parentPort) throw new Error("Fixture requires a worker parent.");

parentPort.on("message", ({ input }) => {
  const bytes = new Uint8Array(input);
  if (bytes[0] === 0xff) process.exit(1);
  const send = () => parentPort.postMessage({ output: input }, [input]);
  if (bytes[0] === 0xfe) setTimeout(send, 250);
  else send();
});
