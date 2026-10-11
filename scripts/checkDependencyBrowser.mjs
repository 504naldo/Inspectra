import { spawn } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Playwright is optional external verification tooling, not an application dependency.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ||
    "/tmp/ewf-browser-tools/node_modules/playwright/index.mjs"
);
const name = `dependency-check-${randomUUID()}`;
const htmlFile = `client/${name}.html`,
  moduleFile = `client/src/${name}.mjs`;
const content =
  '**Fictional estimate**\n\n$$2 \\times 4 = 8$$\n\n<script>window.__unsafeExecuted=true</script>\n\n<img src="x" onerror="window.__unsafeExecuted=true">\n\n[unsafe](javascript:window.__unsafeExecuted=true)\n\n$$\\href{javascript:window.__unsafeExecuted=true}{unsafe}$$';
let browser, server;
const pageErrors = [];
try {
  await writeFile(
    htmlFile,
    `<div id="root"></div><script type="module" src="/src/${name}.mjs"></script>`
  );
  await writeFile(
    moduleFile,
    `import React from "react";import {createRoot} from "react-dom/client";import {Streamdown} from "streamdown";createRoot(document.getElementById("root")).render(React.createElement(Streamdown,{children:${JSON.stringify(content)}}));`
  );
  server = spawn(
    "corepack",
    [
      "pnpm",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      "4561",
      "--strictPort",
    ],
    {
      env: {
        PATH: process.env.PATH,
        COREPACK_HOME: process.env.COREPACK_HOME,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let output = "";
  server.stdout.on("data", c => (output += c));
  server.stderr.on("data", c => (output += c));
  const url = `http://127.0.0.1:4561/${name}.html`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert(ready, output);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.route("**/*", route =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.goto(url);
  await page
    .locator('[data-streamdown="strong"]')
    .filter({ hasText: "Fictional estimate" })
    .waitFor();
  assert.match(await page.locator("#root").innerText(), /2×4=8/);
  assert.equal(
    await page
      .locator("#root script, #root [onerror], #root a[href^='javascript:']")
      .count(),
    0
  );
  assert.equal(await page.evaluate(() => window.__unsafeExecuted), undefined);
  console.log(
    "PASS: mobile chat Markdown and mathematics render; untrusted HTML/JavaScript is blocked; no external requests"
  );
  server.kill("SIGTERM");
  server = spawn(process.execPath, ["dist/index.js"], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      PORT: "4562",
      APP_URL: "http://localhost:4562",
      JWT_SECRET: "fictional-browser-check-secret-32-characters",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", c => (output += c));
  server.stderr.on("data", c => (output += c));
  ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      if (
        (
          await fetch("http://127.0.0.1:4562/health", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert(ready, output);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const app = await context.newPage();
  app.on("pageerror", error => pageErrors.push(error.message));
  app.on("console", message => {
    if (message.type() === "error") console.error(message.text());
  });
  await app.route("**/*", route =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await app.goto("http://localhost:4562/login");
  await app.getByRole("heading", { name: "Welcome to Inspectra" }).waitFor();
  await app.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await app.reload();
  assert(await app.evaluate(() => Boolean(navigator.serviceWorker.controller)));
  await context.setOffline(true);
  await app.reload();
  await app.getByRole("heading", { name: "Welcome to Inspectra" }).waitFor();
  assert.deepEqual(pageErrors, []);
  console.log(
    "PASS: built PWA installs its worker, controls the page and reloads the public login shell offline; no database or external credentials"
  );
} finally {
  await browser?.close();
  if (server && server.exitCode === null) server.kill("SIGTERM");
  await Promise.all([
    rm(htmlFile, { force: true }),
    rm(moduleFile, { force: true }),
  ]);
}
