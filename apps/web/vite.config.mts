import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const isGithubPagesBuild = process.env.GITHUB_ACTIONS === "true" && !!repositoryName;
const pagesBase = isGithubPagesBuild ? `/${repositoryName}/` : "/";

// https://vitejs.dev/config/
export default defineConfig({
  base: pagesBase,
  plugins: [react(), tailwindcss()],
});
