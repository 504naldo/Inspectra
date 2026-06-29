import { Worker } from "node:worker_threads";
import type { ParsingOptions, WorkBook } from "xlsx";

// The npm "xlsx" package is pinned at 0.18.5 — SheetJS's last npm release —
// which carries a known prototype-pollution issue (CVE-2023-30533) and ReDoS
// issue (CVE-2024-22363) when parsing crafted input. The fixed releases were
// only ever published to SheetJS's own CDN, which this environment's network
// policy blocks, so the library itself can't be upgraded here.
//
// Since every caller feeds XLSX.read() a user-uploaded file, we contain the
// parse in a disposable worker thread instead: it has its own V8 isolate, so
// a prototype-pollution write lands on that isolate's Object.prototype and is
// discarded when the worker is torn down, and a ReDoS hang can be killed via
// worker.terminate() without affecting the main server process.
const PARSE_TIMEOUT_MS = 15_000;

// IMPORTANT: this source runs via `new Worker(code, { eval: true })`, whose
// default module type is CommonJS. It MUST stay CJS (`require`; no static
// `import`, no top-level `await`). An earlier ESM version happened to work on
// Node 22 (which auto-detects ESM in eval workers) but threw a SyntaxError on
// startup under Node 20 — the version production runs (nixpacks `nodejs_20`) —
// so the worker never started and every upload failed with "could not parse
// file. Ensure it is a valid .xlsx workbook."
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
