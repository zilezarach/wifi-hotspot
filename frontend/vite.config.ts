import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: true,
    rollupOptions: {
      output: {
        manualChunks: undefined // Disable code splitting that might cause blob URLs
      }
    }
  },
  server: {
    port: 3000,
    host: true
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  }
});
