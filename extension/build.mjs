import * as esbuild from "esbuild";
import { cpSync, mkdirSync, appendFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
cpSync("../seed/rules/org-labeling-rules.json", "dist/rules.json");

const states = await esbuild.build({ entryPoints:["src/states.ts"], bundle:true, write:false, format:"esm" });
const { GLYPH_CSS } = await import(`data:text/javascript;base64,${Buffer.from(states.outputFiles[0].text).toString("base64")}`);
appendFileSync("dist/panel.css", GLYPH_CSS);

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
