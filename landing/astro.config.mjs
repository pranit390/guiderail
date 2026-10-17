import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  compressHTML: true,
  devToolbar: { enabled: false },
  build: {
    inlineStylesheets: "always",
  },
});
