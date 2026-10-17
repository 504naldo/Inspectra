import { Worker } from "node:worker_threads";
import type { ParsingOptions, WorkBook } from "xlsx";

// The npm "xlsx" package is pinned at 0.18.5 — SheetJS's last npm release —
// which carries a known prototype-pollution issue (CVE-2023-30533) and ReDoS
// issue (CVE-2024-22363) when parsing crafted input. The fixed releases were
// only ever published to SheetJS's own CDN, which this environment's network
// policy blocks, so the library itself can't be upgraded here.
//
// Since every caller feeds XLSX.read() a user-uploaded file, we contain the
// parse in a disposable worker thread: it has its own V8 isolate, so
// a prototype-pollution write lands on that isolate's Object.prototype and is
// discarded when the worker is torn down, and a ReDoS hang can be killed via
// worker.terminate() without blocking the main server thread. These limits
// reduce exposure; they do not fix the dependency advisories or put a hard
// process-wide bound on native/external memory allocations.
const PARSE_TIMEOUT_MS = 15_000;
const MAX_INPUT_BYTES = 50 * 1024 * 1024; // Match the attachment upload limit.
const MAX_CONCURRENT_PARSES = 2;
let activeParses = 0;

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

    // Consumers call sheet_to_json on the main thread. A tiny sparse worksheet
    // can declare an enormous !ref, causing that conversion to loop over
    // billions of empty cells after parsing has escaped this worker's timeout.
    if (workbook.SheetNames.length > 100) {
      throw new Error("Excel file has too many worksheets");
    }
    let rangeCells = 0;
    for (const name of workbook.SheetNames) {
      const ref = workbook.Sheets?.[name]?.["!ref"];
      if (ref === undefined) continue;
      if (typeof ref !== "string" || !/^[A-Z]{1,3}[1-9][0-9]{0,6}(?::[A-Z]{1,3}[1-9][0-9]{0,6})?$/.test(ref)) {
        throw new Error("Excel file has an invalid worksheet range");
      }
      const { s, e } = XLSX.utils.decode_range(ref);
      if (e.r < s.r || e.c < s.c || e.r >= 1048576 || e.c >= 16384) {
        throw new Error("Excel file has an invalid worksheet range");
      }
      rangeCells += (e.r - s.r + 1) * (e.c - s.c + 1);
      if (rangeCells > 1000000) {
        throw new Error("Excel file worksheet ranges are too large");
      }
    }
    parentPort.postMessage({ ok: true, workbook });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
`;

/** Drop-in replacement for `XLSX.read()` that parses in an isolated, time-boxed worker thread. */
export function safeXlsxRead(buffer: Buffer | Uint8Array, options: ParsingOptions = {}): Promise<WorkBook> {
  return new Promise((resolve, reject) => {
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_INPUT_BYTES) {
      reject(new Error("Excel file must be between 1 byte and 50 MiB"));
      return;
    }
    if (activeParses >= MAX_CONCURRENT_PARSES) {
      reject(new Error("Excel parser is busy. Please try again shortly"));
      return;
    }

    activeParses += 1;
    let worker: Worker;
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { buffer, options },
        resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      });
    } catch (error) {
      activeParses -= 1;
      reject(error);
      return;
    }

    let completed = false;
    const finish = (error?: Error, workbook?: WorkBook) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      // Keep the slot occupied until the worker is actually gone, including
      // after a successful parse. Fast retries cannot pile up live isolates.
      void worker.terminate().catch(() => undefined).finally(() => {
        activeParses -= 1;
        if (error) reject(error);
        else resolve(workbook!);
      });
    };
    const timer = setTimeout(() => {
      finish(new Error("Excel file took too long to parse and was rejected"));
    }, PARSE_TIMEOUT_MS);

    worker.once("message", (msg: { ok: boolean; workbook?: WorkBook; error?: string } | null) => {
      if (msg?.ok && msg.workbook) finish(undefined, msg.workbook);
      else finish(new Error(msg?.error || "Failed to parse Excel file"));
    });

    worker.once("error", (err) => {
      finish(err);
    });
    worker.once("exit", () => {
      finish(new Error("Excel parser exited before returning a workbook"));
    });
  });
}
