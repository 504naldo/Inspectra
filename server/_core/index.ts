import cors from "cors";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { handleMultipartUpload } from "./upload";
import { serveStatic, setupVite } from "./vite";
import { runMigrations } from "../runMigrations";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Run pending database migrations before starting the server
  await runMigrations();

  const app = express();
  const server = createServer(app);
  
  // OAuth callback must be registered BEFORE CORS middleware
  // because it's a server-to-server redirect from Manus, not a browser request
  registerOAuthRoutes(app);
  
  // Configure CORS for cookie authentication
  // Allow credentials (cookies) to be sent cross-origin
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // Allow all manus.space subdomains, manus VM domains, and localhost for development
      const allowedOrigins = [
        /^https:\/\/[a-zA-Z0-9-]+\.manus\.space$/,
        /^https:\/\/[0-9]+-[a-zA-Z0-9-]+\.manusvm\.computer$/,  // Old dev server URLs
        /^https:\/\/[0-9]+-[a-zA-Z0-9-]+\.[a-z0-9]+\.manus\.computer$/,  // New dev server URLs
        /^http:\/\/localhost:\d+$/,
        /^https:\/\/localhost:\d+$/,
      ];
      
      const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn('[CORS] Origin not allowed:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow cookies to be sent
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // Multipart file upload endpoint (must be before body parser middleware)
  app.post("/api/upload", handleMultipartUpload);
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Serve static files and setup Vite
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  // Use PORT from environment (production) or find available port (development)
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : await findAvailablePort();
  
  // Listen on 0.0.0.0 to accept connections from any interface (required for containers/production)
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
