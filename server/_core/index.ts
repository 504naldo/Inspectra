import cors from "cors";
import express from "express";
import type { ErrorRequestHandler } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { handleMultipartUpload } from "./upload";
import { serveStatic, setupVite } from "./vite";
import { runMigrations } from "../runMigrations";
import { runAutoScheduler } from "../scheduler";
import { validateJwtSecret } from "./env";

/**
 * Builds CSP directives for production. script-src/connect-src additions
 * beyond 'self' are limited to the Google Maps JS API (used by client/src/components/Map.tsx)
 * plus whatever analytics/storage origins are actually configured for this
 * deployment — img-src/style-src stay broader since attachment/Drive thumbnails
 * and component-library inline styles come from origins not known at build time.
 */
function buildCspDirectives() {
  const scriptSrc = ["'self'", "https://maps.googleapis.com", "https://maps.gstatic.com"];
  const connectSrc = ["'self'", "https://maps.googleapis.com"];

  for (const envVar of [process.env.VITE_ANALYTICS_ENDPOINT, process.env.S3_ENDPOINT]) {
    if (!envVar) continue;
    try {
      connectSrc.push(new URL(envVar).origin);
    } catch {
      // Malformed/unset — simply not allowlisted.
    }
  }
  if (process.env.VITE_ANALYTICS_ENDPOINT) {
    try {
      scriptSrc.push(new URL(process.env.VITE_ANALYTICS_ENDPOINT).origin);
    } catch {}
  }

  return {
    defaultSrc: ["'self'"],
    scriptSrc,
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    connectSrc,
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
  };
}

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
  // Fail fast on an unset/placeholder JWT_SECRET rather than letting every
  // login fail later with a lazy error once a user actually tries to sign in.
  validateJwtSecret();

  // Run pending database migrations before starting the server
  await runMigrations();

  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);

  // ── Security headers ──
  // CSP is enforced only in production: Vite's dev server relies on inline/eval'd
  // HMR scripts that a real policy would block.
  app.use(helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production"
        ? { directives: buildCspDirectives() }
        : false,
    crossOriginEmbedderPolicy: false,
  }));

  // ── Rate limiting ──
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts, please try again later" },
  });

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many uploads, please try again later" },
  });
  
  // OAuth callback must be registered BEFORE CORS middleware
  registerOAuthRoutes(app);
  
  // ── CORS ──
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server, etc.)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        // Production
        /^https:\/\/(app\.)?inspectrafire\.ca$/,
        // Railway preview deploys
        /^https:\/\/.*\.up\.railway\.app$/,
        // Local development
        /^http:\/\/localhost:\d+$/,
        /^https:\/\/localhost:\d+$/,
        // Capacitor Android webview (androidScheme: "https")
        /^https:\/\/localhost$/,
      ];
      
      const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn('[CORS] Origin not allowed:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Apply rate limiters to sensitive routes
  app.use("/api/oauth", authLimiter);
  app.use("/api/upload", uploadLimiter);
  app.use("/api/trpc", apiLimiter);
  
  // Multipart file upload endpoint
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

  // Catch-all error handler — defense in depth so any error that escapes a
  // route's own try/catch never leaks a raw message (stack traces, SQL/driver
  // errors) to the client. Must be registered last and take 4 args so Express
  // recognizes it as an error handler.
  const handleUnhandledError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error("[Express] Unhandled error:", err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(handleUnhandledError);

  // Use PORT from environment (production) or find available port (development)
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : await findAvailablePort();
  
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Auto-scheduler: create pending jobs 14 days before nextDueAt.
// Runs once 2 minutes after startup, then every 24 hours.
const SCHEDULER_INTERVAL_MS = 24 * 60 * 60 * 1000;
setTimeout(() => {
  void runAutoScheduler();
  setInterval(() => void runAutoScheduler(), SCHEDULER_INTERVAL_MS);
}, 2 * 60 * 1000);
