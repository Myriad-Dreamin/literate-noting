import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  }
});
