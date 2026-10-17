import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const endpoint = process.env.GUIDERAIL_SERVER_URL;
if (!endpoint) throw new Error("Set GUIDERAIL_SERVER_URL to the HTTPS coach origin (or http://localhost:8787 for local development).");
const server = new URL(endpoint);
if (server.username || server.password || server.search || server.hash || server.pathname !== "/" ||
    !(server.protocol === "https:" || (server.protocol === "http:" && server.hostname === "localhost"))) {
  throw new Error("GUIDERAIL_SERVER_URL must be an HTTPS origin, or localhost HTTP for development.");
}
const socket = new URL(server.origin);
socket.protocol = server.protocol === "https:" ? "wss:" : "ws:";
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
cpSync("../seed/rules/org-labeling-rules.json", "dist/rules.json");
const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
manifest.host_permissions = ["https://*.google.com/*", `${server.origin}/*`];
manifest.content_scripts[0].matches = ["https://*.google.com/*", `${server.origin}/sandbox/*`];
writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
writeFileSync("dist/build.json", JSON.stringify({ server: server.origin, revision: process.env.GUIDERAIL_BUILD_REVISION ?? "development" }, null, 2) + "\n");

const ctx = await esbuild.context({
  entryPoints: ["src/background.ts", "src/content.ts", "src/sidepanel.ts", "src/welcome.ts", "src/mic-worklet.ts"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: "inline",
  logLevel: "info",
  define: { __GUIDERAIL_HTTP__: JSON.stringify(server.origin), __GUIDERAIL_WS__: JSON.stringify(socket.origin) },
});
if (watch) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
