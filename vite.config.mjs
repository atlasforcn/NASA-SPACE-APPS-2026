import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "build-metadata",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "build-info.json",
          source: JSON.stringify({ base: process.env.PAGES_BASE_PATH || "/" }),
        });
      },
    },
  ],
  resolve: { preserveSymlinks: true },
  base: process.env.PAGES_BASE_PATH || "/",
  build: {
    rollupOptions: {
      input: { main: resolve("index.html") },
    },
  },
});
