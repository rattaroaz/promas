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
- Windows build tools (Visual Studio C++ build tools)

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

```bash
npm run tauri build
```

Installer/binary will be under `src-tauri/target/release/bundle/`.

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
