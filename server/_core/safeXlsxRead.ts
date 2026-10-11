import { Worker } from "node:worker_threads";
import type { ParsingOptions, WorkBook } from "xlsx";

// SheetJS 0.20.3 is installed from the official CDN with lockfile integrity;
// it fixes CVE-2023-30533 (prototype pollution) and CVE-2024-22363 (ReDoS).
// Keep parsing user-uploaded files in a disposable worker as defense in depth:
// its separate V8 isolate contains unexpected parser state, and a slow or hung
// parse can be terminated without blocking the main server process.
const PARSE_TIMEOUT_MS = 15_000;

// IMPORTANT: this source runs via `new Worker(code, { eval: true })`, whose
// default module type is CommonJS. Keep CJS (`require`; no static `import`,
// no top-level `await`) rather than relying on Node's ESM auto-detection.
const WORKER_SOURCE = `
  const { parentPort, workerData } = require("node:worker_threads");
  try {
    const XLSX = require("xlsx");
    const { buffer, options } = workerData;
    const workbook = XLSX.read(buffer, options);
    parentPort.postMessage({ ok: true, workbook });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
`;

/** Drop-in replacement for `XLSX.read()` that parses in an isolated, time-boxed worker thread. */
export function safeXlsxRead(buffer: Buffer | Uint8Array, options: ParsingOptions = {}): Promise<WorkBook> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { buffer, options } });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Excel file took too long to parse and was rejected"));
    }, PARSE_TIMEOUT_MS);

    worker.once("message", (msg: { ok: boolean; workbook?: WorkBook; error?: string }) => {
      clearTimeout(timer);
      worker.terminate();
      if (msg.ok && msg.workbook) resolve(msg.workbook);
      else reject(new Error(msg.error || "Failed to parse Excel file"));
    });

    worker.once("error", (err) => {
      clearTimeout(timer);
      worker.terminate();
      reject(err);
    });
  });
}
