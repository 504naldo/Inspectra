import { spawn } from "node:child_process";
import { accessSync, closeSync, constants, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDisposableS3Environment } from "./disposableS3Config.mjs";

// CI builds the official, commit-pinned MinIO source into this fixed location.
// This wrapper owns every child until cleanup; its PID file is diagnostic only.
assertDisposableS3Environment();
const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = join(root, "tmp/minio-acceptance");
const binary = join(evidence, "minio");
accessSync(binary, constants.X_OK);
const runtime = mkdtempSync(join(evidence, "runtime-"));
const data = join(runtime, "data");
mkdirSync(data);
const logPath = join(evidence, "minio.log");
const pidPath = join(evidence, "minio.pid");
let active;
let minio;
let interrupted;

function launch(command, args, options = {}) {
  // Each Linux CI child gets its own process group so CLI worker descendants
  // are included in cancellation. No PID is read back from disk for signaling.
  const child = spawn(command, args, { cwd: root, detached: true, stdio: "inherit", ...options });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  return { child, done };
}

function signalGroup(handle, signal) {
  if (!handle?.child.pid) return false;
  try { process.kill(-handle.child.pid, signal); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

function interrupt(signal) {
  interrupted = signal;
  signalGroup(active, signal);
  signalGroup(minio, signal);
}
const onSigint = () => interrupt("SIGINT");
const onSigterm = () => interrupt("SIGTERM");
process.once("SIGINT", onSigint);
process.once("SIGTERM", onSigterm);

async function run(command, args) {
  if (interrupted) throw new Error(`Storage acceptance interrupted by ${interrupted}`);
  active = launch(command, args);
  const outcome = await Promise.race([
    active.done,
    minio.done.then(result => { throw new Error(`Disposable MinIO exited early (${result.code ?? result.signal})`); }),
  ]);
  active = undefined;
  if (outcome.code !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${outcome.code ?? outcome.signal}`);
}

async function stop(handle) {
  if (!handle) return;
  signalGroup(handle, "SIGTERM");
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!signalGroup(handle, 0)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (signalGroup(handle, 0)) signalGroup(handle, "SIGKILL");
  await handle.done.catch(() => {});
}

try {
  const log = openSync(logPath, "w");
  try {
    minio = launch(binary, ["server", data, "--address", "127.0.0.1:9000", "--console-address", "127.0.0.1:9001"], {
      stdio: ["ignore", log, log],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: runtime,
        MINIO_ROOT_USER: process.env.S3_ACCESS_KEY_ID,
        MINIO_ROOT_PASSWORD: process.env.S3_SECRET_ACCESS_KEY,
        MINIO_BROWSER: "off",
        MINIO_UPDATE: "off",
      },
    });
  } finally {
    closeSync(log);
  }
  if (minio.child.pid) writeFileSync(pidPath, String(minio.child.pid));
  await run(process.execPath, ["scripts/prepareDisposableS3.mjs"]);
  await run("pnpm", ["exec", "drizzle-kit", "migrate"]);
  await run("pnpm", ["exec", "vitest", "run", "server/assetImport.test.ts", "server/fullWorkbookImport.test.ts",
    "server/filesRouterSiteImport.test.ts", "server/sheetSelection.test.ts", "server/storageAcceptance.test.ts"]);
} catch (error) {
  console.error(error);
  try { console.error(readFileSync(logPath, "utf8").slice(-20000)); } catch { /* Startup may fail before the log opens. */ }
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled([stop(active), stop(minio)]);
  process.removeListener("SIGINT", onSigint);
  process.removeListener("SIGTERM", onSigterm);
  rmSync(pidPath, { force: true });
  rmSync(runtime, { recursive: true, force: true });
  for (const result of cleanup) {
    if (result.status === "rejected") { console.error(result.reason); process.exitCode = 1; }
  }
}
