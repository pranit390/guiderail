import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
cpSync("../seed/rules/org-labeling-rules.json", "dist/rules.json");

const ctx = await esbuild.context({
  entryPoints: ["src/background.ts", "src/content.ts", "src/sidepanel.ts", "src/welcome.ts", "src/mic-worklet.ts"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: "inline",
  logLevel: "info",
});
if (watch) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
