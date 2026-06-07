import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

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
