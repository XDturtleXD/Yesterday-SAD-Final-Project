import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": {
          // 使用 env 取代 import.meta.env
          target: env.VITE_API_URL || "http://localhost:3001",
          changeOrigin: true,
          // 如果你的後端 API 本身沒有 /api 前綴，記得加上 rewrite
          // rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
