/**
 * CI guard for npm's optional-dependency bug (npm/cli#4828).
 *
 * `npm ci` sometimes skips Rollup's platform binding ("added 190 packages"
 * instead of 191). Vite then fails with:
 *   Cannot find module '@rollup/rollup-win32-arm64-msvc'
 *
 * Usage, after npm ci, from the repo root:
 *   node scripts/ensure-rollup-native.mjs @rollup/rollup-win32-arm64-msvc
 *
 * The package name may also be passed as ROLLUP_NATIVE_PACKAGE so Windows
 * PowerShell does not treat a leading @ as the splat operator.
 *
 * When the module is already resolvable this exits 0. Otherwise it reads the
 * exact version from the installed rollup package's optionalDependencies and
 * runs `npm install <pkg>@<version> --no-save` in a temporary prefix, then
 * copies only that package into node_modules. Installing in the project
 * directory reifies the whole tree and can delete unrelated packages, so the
 * temp prefix keeps package.json, package-lock.json, and the rest of
 * node_modules unchanged. --force is limited to that prefix so npm's os/cpu
 * filter cannot skip the binding this job already decided it needs.
 *
 * Exits non-zero if the version cannot be determined, the install fails, or
 * the module still does not resolve afterwards.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

const PACKAGE_RE = /^@rollup\/rollup-[a-z0-9-]+$/;
const EXACT_VERSION_RE =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

class GuardError extends Error {}

function fail(message) {
  throw new GuardError(message);
}

function packageNameFromArgs() {
  const cli = process.argv.slice(2).filter((arg) => arg !== "--");
  if (cli.length > 1) {
    fail(`Expected one package name, got: ${cli.join(" ")}`);
  }
  const name = cli[0] || process.env.ROLLUP_NATIVE_PACKAGE;
  if (!name) {
    fail(
      "Pass the binding name, for example:\n" +
        "  node scripts/ensure-rollup-native.mjs @rollup/rollup-win32-arm64-msvc\n" +
        "or set ROLLUP_NATIVE_PACKAGE."
    );
  }
  if (!PACKAGE_RE.test(name)) {
    fail(
      `Refusing package name ${JSON.stringify(name)} (expected @rollup/rollup-*).`
    );
  }
  return name;
}

function resolvedPath(pkg) {
  try {
    return require.resolve(pkg);
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") return null;
    fail(
      `Unexpected error resolving ${pkg}: ${
        error && error.message ? error.message : error
      }`
    );
  }
}

function expectedVersion(pkg) {
  let rollupPkgPath;
  try {
    rollupPkgPath = require.resolve("rollup/package.json");
  } catch (error) {
    fail(
      `Cannot resolve rollup/package.json (${
        error && error.code ? error.code : error
      }). Run this after npm ci.`
    );
  }
  let rollupPkg;
  try {
    rollupPkg = JSON.parse(readFileSync(rollupPkgPath, "utf8"));
  } catch (error) {
    fail(`Cannot read ${rollupPkgPath}: ${error.message}`);
  }
  const version =
    rollupPkg.optionalDependencies && rollupPkg.optionalDependencies[pkg];
  if (typeof version !== "string" || !EXACT_VERSION_RE.test(version)) {
    fail(
      `Installed rollup@${rollupPkg.version || "unknown"} (${rollupPkgPath}) ` +
        `does not declare an exact optionalDependencies["${pkg}"] version. ` +
        "Refusing to guess a version."
    );
  }
  return { version, rollupPkgPath };
}

function packageDir(base, pkg) {
  return join(base, "node_modules", ...pkg.split("/"));
}

function runNpm(args, cwd) {
  const bundledCli = join(
    dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js"
  );
  const invocation = existsSync(bundledCli)
    ? { cmd: process.execPath, args: [bundledCli, ...args], shell: false }
    : { cmd: "npm", args, shell: process.platform === "win32" };

  const result = spawnSync(invocation.cmd, invocation.args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    shell: invocation.shell,
  });
  if (result.error) {
    fail(`Failed to start npm: ${result.error.message}`);
  }
  if (result.signal) {
    fail(`npm was killed by signal ${result.signal}`);
  }
  return result.status ?? 1;
}

function installPinned(pkg, version, rollupPkgPath) {
  const spec = `${pkg}@${version}`;
  const staging = mkdtempSync(join(tmpdir(), "ensure-rollup-native-"));
  console.error(
    `[ensure-rollup-native] ${pkg} did not resolve after npm ci.\n` +
      "[ensure-rollup-native] This is the npm optional-dependency bug npm/cli#4828.\n" +
      `[ensure-rollup-native] Installing ${spec} --no-save ` +
      `(exact version from ${rollupPkgPath} optionalDependencies).\n` +
      "[ensure-rollup-native] The install runs in a temporary directory so package.json, " +
      "package-lock.json, and the rest of node_modules stay unchanged."
  );
  try {
    const status = runNpm(
      [
        "install",
        spec,
        "--no-save",
        "--force",
        "--ignore-scripts",
        "--prefix",
        staging,
      ],
      staging
    );
    if (status !== 0) {
      fail(`npm install ${spec} --no-save failed (exit ${status}).`);
    }
    const stagedPkg = packageDir(staging, pkg);
    const stagedManifest = join(stagedPkg, "package.json");
    if (!existsSync(stagedManifest)) {
      fail(
        `npm install ${spec} --no-save exited 0 but did not produce ${stagedPkg}. ` +
          `${pkg} is still missing.`
      );
    }
    const installed = JSON.parse(readFileSync(stagedManifest, "utf8"));
    if (installed.version !== version) {
      fail(
        `Staged ${pkg}@${installed.version || "unknown"}, but rollup optionalDependencies requires ${version}.`
      );
    }
    const dest = packageDir(root, pkg);
    mkdirSync(dirname(dest), { recursive: true });
    rmSync(dest, { recursive: true, force: true });
    cpSync(stagedPkg, dest, { recursive: true, dereference: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function main() {
  const pkg = packageNameFromArgs();
  const already = resolvedPath(pkg);
  if (already) {
    console.log(`[ensure-rollup-native] ${pkg} resolves to ${already}`);
    return;
  }

  const { version, rollupPkgPath } = expectedVersion(pkg);
  installPinned(pkg, version, rollupPkgPath);

  const resolved = resolvedPath(pkg);
  if (!resolved) {
    fail(
      `${pkg}@${version} was copied into node_modules but still cannot be resolved. ` +
        "The Windows installer build cannot continue without this Rollup native binding."
    );
  }
  console.log(
    `[ensure-rollup-native] ${pkg}@${version} installed and resolves to ${resolved}`
  );
}

try {
  main();
} catch (error) {
  if (error instanceof GuardError) {
    console.error(`[ensure-rollup-native] ${error.message}`);
  } else {
    console.error(
      `[ensure-rollup-native] ${error && error.stack ? error.stack : error}`
    );
  }
  process.exit(1);
}
