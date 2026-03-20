import cors from "cors";
import express from "express";
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
  app.set("trust proxy", 1);
  const server = createServer(app);

  // ── Security headers ──
  app.use(helmet({
    contentSecurityPolicy: false,
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

  // Use PORT from environment (production) or find available port (development)
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : await findAvailablePort();
  
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
