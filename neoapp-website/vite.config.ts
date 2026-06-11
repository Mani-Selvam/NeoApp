import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
    plugins: [react(), tailwindcss()],

    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@assets": path.resolve(__dirname, "./src/assets"),
        },
    },

    build: {
        outDir: "dist",
        emptyOutDir: true,
    },

    server: {
        host: "0.0.0.0",
        port: 5000,
        allowedHosts: true,
        hmr: true,
        proxy: {
            "/api": {
                target: "http://localhost:7000",
                changeOrigin: true,
            },
        },
    },

    preview: {
        host: "0.0.0.0",
        port: 5000,
        allowedHosts: true,
    },
});
