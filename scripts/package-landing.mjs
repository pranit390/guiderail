import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coachOrigin = "https://guiderail-coach-q7tihot5sq-uc.a.run.app";
const zipPath = join(root, "landing/dist/download/guiderail-extension.zip");

function run(command, args, options) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(join(root, "node_modules/esbuild")) || !existsSync(join(root, "landing/node_modules/astro"))) {
  console.error("Install dependencies first: npm ci && npm ci --prefix landing");
  process.exit(1);
}

const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (revision.status !== 0) process.exit(revision.status ?? 1);
const head = revision.stdout.trim();

run("npm", ["run", "build", "-w", "extension"], {
  env: {
    ...process.env,
    GUIDERAIL_SERVER_URL: coachOrigin,
    GUIDERAIL_BUILD_REVISION: head,
  },
});
run("npm", ["run", "build"], { cwd: join(root, "landing") });

const packer = `
import zipfile
from pathlib import Path
src = Path(${JSON.stringify(join(root, "extension/dist"))})
out = Path(${JSON.stringify(zipPath)})
out.parent.mkdir(parents=True, exist_ok=True)
if out.exists():
    out.unlink()
stamp = (2026, 1, 1, 0, 0, 0)
files = sorted(p for p in src.rglob("*") if p.is_file() and p.name != ".DS_Store")
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in files:
        info = zipfile.ZipInfo(("guiderail-extension" / path.relative_to(src)).as_posix())
        info.date_time = stamp
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        zf.writestr(info, path.read_bytes())
with zipfile.ZipFile(out) as zf:
    manifest = zf.read("guiderail-extension/manifest.json").decode()
    build = zf.read("guiderail-extension/build.json").decode()
print("files", len(files))
print("manifest", " ".join(manifest.split()))
print("build", " ".join(build.split()))
`;
const packed = spawnSync("python3", ["-c", packer], { cwd: root, encoding: "utf8" });
if (packed.status !== 0) {
  console.error(packed.stderr);
  process.exit(packed.status ?? 1);
}
process.stdout.write(packed.stdout);
if (!packed.stdout.includes(coachOrigin)) {
  console.error("Extension build.json is missing the hosted coach origin.");
  process.exit(1);
}
console.log(`Wrote ${zipPath}`);
