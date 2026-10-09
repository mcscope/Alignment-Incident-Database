import { defineConfig } from "astro/config";

// Served from GitHub Pages at https://mcscope.github.io/Alignment-Incident-Database/.
// Set SITE_BASE=/ when moving to a custom domain.
export default defineConfig({
  site: "https://mcscope.github.io",
  base: process.env.SITE_BASE ?? "/Alignment-Incident-Database",
  srcDir: "./site/src",
  publicDir: "./site/public",
  outDir: "./dist",
  trailingSlash: "always",
});
