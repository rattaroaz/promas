/**
 * Local Windows build wrapper.
 * With signing env / --signed: full updater artifacts.
 * Without: disables createUpdaterArtifacts so unsigned local builds still work.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const keyPath = resolve(root, "scripts/tauri-signing.key");
const wantSigned = process.argv.includes("--signed");

let signed = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);

if (wantSigned && !signed && existsSync(keyPath)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, "utf8");
  signed = true;
}

const tauriArgs = ["build"];
if (!signed) {
  tauriArgs.push(
    "-c",
    JSON.stringify({ bundle: { createUpdaterArtifacts: false } })
  );
  console.log(
    "[tauri-build] Unsigned build (createUpdaterArtifacts=false).\n" +
      "  For release-parity: set TAURI_SIGNING_PRIVATE_KEY(+_PASSWORD) or use npm run build:win:signed"
  );
} else {
  console.log("[tauri-build] Signed build with updater artifacts.");
}

const result = spawnSync("npm", ["run", "tauri", "--", ...tauriArgs], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
