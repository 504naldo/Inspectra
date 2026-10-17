import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeXlsxRead } from "./_core/safeXlsxRead";

const state = vi.hoisted(() => ({ workers: [] as any[], failConstruction: false }));

vi.mock("node:worker_threads", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    Worker: vi.fn(function (source, options) {
      if (state.failConstruction) throw new Error("Could not start worker");
      const worker = Object.assign(new EventEmitter(), {
        source,
        options,
        terminate: vi.fn(() => Promise.resolve(0)),
      });
      state.workers.push(worker);
      return worker;
    }),
  };
});

const workbook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } };
const input = Buffer.from("workbook");

beforeEach(() => {
  vi.useFakeTimers();
  state.workers = [];
  state.failConstruction = false;
});

afterEach(async () => {
  for (const worker of state.workers) worker.emit("exit", 0);
  await Promise.resolve();
  await Promise.resolve();
  vi.useRealTimers();
});

describe("Excel parser resource and lifecycle boundaries", () => {
  it("rejects empty and oversized uploads before allocating a worker", async () => {
    await expect(safeXlsxRead(Buffer.alloc(0))).rejects.toThrow("50 MiB");
    await expect(safeXlsxRead(Buffer.alloc(50 * 1024 * 1024 + 1))).rejects.toThrow("50 MiB");
    expect(state.workers).toHaveLength(0);
  });

  it("starts an isolated worker with a finite V8 heap budget and preserves parsing options", async () => {
    const result = safeXlsxRead(input, { type: "buffer", cellDates: true });
    const worker = state.workers[0];
    expect(worker.options.eval).toBe(true);
    expect(worker.options.resourceLimits.maxOldGenerationSizeMb).toBeGreaterThan(0);
    expect(worker.options.resourceLimits.maxOldGenerationSizeMb).toBeLessThanOrEqual(256);
    expect(worker.options.workerData.options).toEqual({ type: "buffer", cellDates: true });
    worker.emit("message", { ok: true, workbook });
    await expect(result).resolves.toEqual(workbook);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an early exit immediately instead of leaving the request waiting for its deadline", async () => {
    const result = expect(safeXlsxRead(input)).rejects.toThrow("exited before returning");
    state.workers[0].emit("exit", 1);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kills a hung parser once and makes its slot available again", async () => {
    const result = expect(safeXlsxRead(input)).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    const worker = state.workers[0];
    worker.emit("exit", 1);
    worker.emit("error", new Error("late worker error"));
    expect(worker.terminate).toHaveBeenCalledOnce();

    const retry = safeXlsxRead(input);
    state.workers[1].emit("message", { ok: true, workbook });
    await expect(retry).resolves.toEqual(workbook);
  });

  it("returns worker memory failures and parser errors without leaking capacity", async () => {
    const failed = expect(safeXlsxRead(input)).rejects.toThrow("Worker out of memory");
    state.workers[0].emit("error", new Error("Worker out of memory"));
    await failed;
    const malformed = expect(safeXlsxRead(input)).rejects.toThrow("Invalid workbook");
    state.workers[1].emit("message", { ok: false, error: "Invalid workbook" });
    await malformed;

    const retry = safeXlsxRead(input);
    state.workers[2].emit("message", { ok: true, workbook });
    await expect(retry).resolves.toEqual(workbook);
  });

  it("bounds simultaneous parses and waits for termination before releasing capacity", async () => {
    const first = safeXlsxRead(input);
    const second = safeXlsxRead(input);
    await expect(safeXlsxRead(input)).rejects.toThrow("busy");
    expect(state.workers).toHaveLength(2);

    let release!: (code: number) => void;
    state.workers[0].terminate.mockImplementation(() => new Promise<number>(resolve => { release = resolve; }));
    state.workers[0].emit("message", { ok: true, workbook });
    await expect(safeXlsxRead(input)).rejects.toThrow("busy");
    release(0);
    await first;

    const retry = safeXlsxRead(input);
    state.workers[2].emit("message", { ok: true, workbook });
    state.workers[1].emit("message", { ok: true, workbook });
    await Promise.all([second, retry]);
  });

  it("releases the reserved slot when worker construction fails", async () => {
    state.failConstruction = true;
    for (let i = 0; i < 3; i += 1) {
      await expect(safeXlsxRead(input)).rejects.toThrow("Could not start worker");
    }
    state.failConstruction = false;
    const retry = safeXlsxRead(input);
    state.workers[0].emit("message", { ok: true, workbook });
    await expect(retry).resolves.toEqual(workbook);
  });
});
