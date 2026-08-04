import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import signalingPlugin from "./vite-plugin-signaling";

export default defineConfig({
  plugins: [react(), tailwindcss(), signalingPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
