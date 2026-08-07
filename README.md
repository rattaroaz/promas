# PROMAS — Modern Rewrite

A TypeScript + [Tauri](https://tauri.app) + SQLite rewrite of the classic **PROMAS** (Property Management System) DOS/Clipper application originally used by Q Maintenance Co. for apartment painting & maintenance work.

## What was replaced

| Original (Clipper 5 / FreeDOS) | Modern stack |
|---|---|
| `PROMAS.EXE` | Tauri desktop app |
| dBase III/IV `.DBF` + `.NTX` | SQLite (`promas.db`) |
| Text-mode menus | React + TypeScript UI |
| Printer-oriented reports | On-screen + print reports |

### Domain modules (mapped from original menus)

1. **Companies / Properties** — management companies and their buildings  
2. **Workers** — crew with commission/wage rates  
3. **Job Codes** — work types (Paint / Clean / Floor / Other)  
4. **Work Orders** — job tickets with line items  
5. **Invoices** — header + lines (`SALES2` / `SALES1`)  
6. **Cash Receipts** — payments applied to invoices  
7. **Materials** — material costs by worker  
8. **Reports** — aging, sales analysis, worker wages  
9. **Settings / Import** — company info + **DBF migration**

## Requirements

- Node.js 18+
- Rust (stable) — [rustup](https://rustup.rs)
- Windows build tools (Visual Studio C++ build tools), including **both**  
  x64 and ARM64 MSVC toolsets if you cross-compile

## Architectures

PROMAS ships for **Windows x86_64** and **Windows ARM64**:

| Arch | Rust target | Typical host |
|------|-------------|--------------|
| x64 | `x86_64-pc-windows-msvc` | Intel/AMD PCs; `windows-latest` CI |
| ARM64 | `aarch64-pc-windows-msvc` | Snapdragon / Windows on ARM; `windows-11-arm` CI |

`rust-toolchain.toml` installs both targets. The in-app updater `latest.json` includes  
platform keys for both (`windows-x86_64*` and `windows-aarch64*`).

## Run

```bash
cd promas
npm install
npm run tauri dev
```

## Import legacy data

1. Start the app  
2. Open **Settings / Import**  
3. Click **Select PROMAS Folder & Import**  
4. Choose the folder that contains the `.DBF` files, e.g.  

   `...\DKSKapp\COMPBACK\PROMAS`

The importer loads:

- `SYSDATA`, `COMPANY`, `PROPERTY`, `EMPLOYEE`, `WORKTYPE`
- `SALES2` (invoice headers), `SALES1` (lines)
- `CASHRECT`, `MATERIAL`, `ORDER1`/`ORDER2`, `EST`

## Build release

Native host arch (unsigned local installers):

```bash
npm run build:win
```

Explicit architectures:

```bash
npm run build:win:x64      # x86_64 — use this from an ARM64 machine to ship Intel/AMD builds
npm run build:win:arm64    # aarch64
npm run build:win:all      # both, sequential
```

Signed / updater-artifact builds (needs signing key + password):

```bash
npm run build:win:x64:signed
npm run build:win:all:signed
```

Bundles land under:

```
src-tauri/target/<triple>/release/bundle/nsis/
src-tauri/target/<triple>/release/bundle/msi/
```

CI release tags build **both** arches via GitHub Actions (`windows-latest` + `windows-11-arm`).

### Publish installers on GitHub

Pushing a `v*` tag runs the **Release** workflow, which builds **NSIS `.exe` / MSI** installers and attaches them to the GitHub Release (not just source zip).

```bash
git push origin main
git tag v2.4.1          # bump version files first if needed
git push origin v2.4.1
```

Then open **Actions → Release**. When green, download `PROMAS_*_x64-setup.exe` from the Release assets — ignore “Source code”.

Optional for in-app updates: set Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Without them, installers still build; updater signatures are skipped.

## Project layout

```
promas/
  src/                 # React + TypeScript frontend
    api.ts             # Tauri invoke wrappers + types
    pages/             # UI modules
  src-tauri/
    src/
      db.rs            # SQLite schema
      dbf.rs           # dBase reader
      import.rs        # DBF → SQLite migration
      commands.rs      # Tauri command handlers
      models.rs        # Shared data models
```

## Notes

- Soft-delete uses a `voided` flag (matching original Void behavior).  
- Some original date fields had century quirks; the importer normalizes YYYYMMDD dates.  
- SQLite file lives in the OS app data directory (shown on the Settings page).
