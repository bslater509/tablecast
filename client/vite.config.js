import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "pwa-192x192.png",
        "pwa-512x512.png",
        "assets/**/*",
      ],
      manifest: {
        name: "Tablecast",
        short_name: "Tablecast",
        description:
          "Locally hosted D&D virtual tabletop, character manager, and campaign wiki for your home game.",
        theme_color: "#1e1b2e",
        background_color: "#1e1b2e",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        categories: ["games", "entertainment"],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm,json}"],
        runtimeCaching: [
          {
            // API calls: network first, fall back to cache if offline
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
            },
          },
        ],
      },
    }),
  ],

  server: {
    host: "0.0.0.0",
    // During local development, proxy API and Socket.io requests to the backend
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying for Socket.io
      },
    },
  },

  build: {
    // Output to dist/ — Docker copies this into the image
    outDir: "dist",
    emptyOutDir: true,
  },
});
