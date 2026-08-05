/**
 * Local Windows build wrapper with multi-arch support.
 *
 * Usage:
 *   node scripts/tauri-build.mjs                  # native host arch
 *   node scripts/tauri-build.mjs --arch x64       # x86_64-pc-windows-msvc
 *   node scripts/tauri-build.mjs --arch arm64     # aarch64-pc-windows-msvc
 *   node scripts/tauri-build.mjs --arch all       # both (sequential)
 *   node scripts/tauri-build.mjs --signed         # enable updater signatures
 *
 * Env:
 *   TAURI_SIGNING_PRIVATE_KEY / _PASSWORD — or --signed + scripts/tauri-signing.key
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { arch as hostNodeArch } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const keyPath = resolve(root, "scripts/tauri-signing.key");

const TARGETS = {
  x64: "x86_64-pc-windows-msvc",
  arm64: "aarch64-pc-windows-msvc",
};

function parseArchFlag() {
  const idx = process.argv.indexOf("--arch");
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1].toLowerCase();
  }
  // Also allow --x64 / --arm64 / --all
  if (process.argv.includes("--x64")) return "x64";
  if (process.argv.includes("--arm64")) return "arm64";
  if (process.argv.includes("--all")) return "all";
  return "native";
}

function nativeTarget() {
  // node: os.arch() → 'arm64' | 'x64' | ...
  if (hostNodeArch() === "arm64") return TARGETS.arm64;
  return TARGETS.x64;
}

function resolveTargets(archFlag) {
  if (archFlag === "all") return [TARGETS.x64, TARGETS.arm64];
  if (archFlag === "native") return [nativeTarget()];
  if (archFlag === "x64" || archFlag === "x86_64" || archFlag === "amd64") {
    return [TARGETS.x64];
  }
  if (archFlag === "arm64" || archFlag === "aarch64") {
    return [TARGETS.arm64];
  }
  console.error(
    `[tauri-build] Unknown --arch "${archFlag}". Use native|x64|arm64|all`
  );
  process.exit(1);
}

function ensureRustTarget(target) {
  const listed = spawnSync("rustup", ["target", "list", "--installed"], {
    encoding: "utf8",
    shell: true,
  });
  if (listed.status === 0 && listed.stdout.includes(target)) {
    return;
  }
  console.log(`[tauri-build] Installing Rust target ${target}…`);
  const add = spawnSync("rustup", ["target", "add", target], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (add.status !== 0) {
    console.error(`[tauri-build] Failed to add Rust target ${target}`);
    process.exit(add.status ?? 1);
  }
}

const wantSigned = process.argv.includes("--signed");
let signed = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);

if (wantSigned && !signed && existsSync(keyPath)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, "utf8");
  signed = true;
}

const archFlag = parseArchFlag();
const targets = resolveTargets(archFlag);

console.log(
  `[tauri-build] Host arch=${hostNodeArch()}  targets=${targets.join(", ")}  signed=${signed}`
);

if (!signed) {
  console.log(
    "[tauri-build] Unsigned build (createUpdaterArtifacts=false).\n" +
      "  For release-parity: set TAURI_SIGNING_PRIVATE_KEY(+_PASSWORD) or use --signed"
  );
} else {
  console.log("[tauri-build] Signed build with updater artifacts.");
}

for (const target of targets) {
  ensureRustTarget(target);

  const tauriArgs = ["build", "--target", target, "--bundles", "nsis,msi"];
  if (!signed) {
    tauriArgs.push(
      "-c",
      JSON.stringify({ bundle: { createUpdaterArtifacts: false } })
    );
  }

  console.log(`\n[tauri-build] >>> tauri ${tauriArgs.join(" ")}\n`);
  const result = spawnSync("npm", ["run", "tauri", "--", ...tauriArgs], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`[tauri-build] Build failed for ${target}`);
    process.exit(result.status ?? 1);
  }

  console.log(
    `[tauri-build] OK ${target}\n` +
      `  bundles: src-tauri/target/${target}/release/bundle/`
  );
}

console.log("\n[tauri-build] Done.");
