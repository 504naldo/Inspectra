import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";


const plugins = [
  react(),
  tailwindcss(),
  VitePWA({
    registerType: "autoUpdate",
    includeAssets: ["icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png"],
    manifest: {
      name: "Inspectra",
      short_name: "Inspectra",
      description: "Professional fire safety inspection and compliance management",
      theme_color: "#16324F",
      background_color: "#ffffff",
      display: "standalone",
      orientation: "portrait-primary",
      scope: "/",
      start_url: "/",
      icons: [
        {
          src: "/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any"
        },
        {
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any"
        },
        {
          src: "/icon-maskable-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable"
        },
        {
          src: "/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable"
        }
      ]
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/api\..*/i,
          handler: "NetworkFirst",
          options: {
            cacheName: "api-cache",
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 60 * 24 // 24 hours
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-cache",
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/i,
          handler: "CacheFirst",
          options: {
            cacheName: "images-cache",
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
            }
          }
        }
      ]
    },
    devOptions: {
      enabled: true,
      type: "module"
    }
  })
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".inspectrafire.ca",
      ".up.railway.app",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
