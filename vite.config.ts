import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3000",
        changeOrigin: true,
        // В dev режиме, если нет API сервера, показываем понятное сообщение
        configure: (proxy, options) => {
          proxy.on("error", (err, req, res) => {
            console.log(
              "[Vite Proxy Error] API route not available in dev mode",
            );
            console.log(
              "[Vite Proxy Error] Use `vercel dev` instead of `npm run dev`",
            );
            console.log(
              "[Vite Proxy Error] Or set VITE_API_URL to production URL",
            );
          });
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(
    Boolean,
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
