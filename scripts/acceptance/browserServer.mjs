import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, "../..");
// Test-only entry point. No backend, database URL, service worker or live provider.
const server = await createServer({
  configFile: false,
  root: directory,
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.join(repository, "client/src"), "@shared": path.join(repository, "shared") } },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.INSPECTRA_ACCEPTANCE_PORT ?? 4399),
    strictPort: true,
    fs: { allow: [repository] },
  },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, async () => {
  await server.close();
  process.exit(0);
});
