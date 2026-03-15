import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const isGithubPagesBuild = process.env.GITHUB_ACTIONS === "true" && !!repositoryName;
const pagesBase = isGithubPagesBuild ? `/${repositoryName}/` : "/";

export default defineConfig({
  plugins: [react()],
  base: pagesBase,
  server: {
    proxy: {
      "/ws": {
        target: "http://127.0.0.1:8787",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
