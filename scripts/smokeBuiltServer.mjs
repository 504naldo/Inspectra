import { spawn } from "node:child_process";
import { once } from "node:events";
const port = "4387";
// An isolated process with no database URL or external-service credentials:
// startup cannot run migrations or send anything to a real integration.
const server = spawn(process.execPath, ["dist/index.js"], {
  env: {
    PATH: process.env.PATH,
    NODE_ENV: "production",
    PORT: port,
    APP_URL: `http://127.0.0.1:${port}`,
    JWT_SECRET: "disposable-built-server-smoke-secret-32-characters",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", chunk => {
  output += chunk;
});
server.stderr.on("data", chunk => {
  output += chunk;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode != null)
      throw new Error(`Built server exited: ${output}`);
    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (health.ok) {
        await health.json();
        ready = true;
        break;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Built server did not become ready: ${output}`);
  const page = await fetch(`http://127.0.0.1:${port}/`);
  if (!page.ok || !(await page.text()).includes('<div id="root">'))
    throw new Error("Built UI was not served");
  console.log(
    "PASS: built production server starts and serves health JSON and the UI without database/integration credentials"
  );
} finally {
  if (server.exitCode == null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
}
