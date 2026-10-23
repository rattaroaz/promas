# Promas v2.16.2 round 2

Branch `cursor/uniform-date-invoice-e131`. Round 2 fixes the seven gate failures from `4331b58`. Proof was measured in Chromium at 1280×800 and 1024×768. Numbers below are from `metrics.json`.

## What the gate found, and what changed

1. **Workers Delete was clipped, and the list was exempt from fit.** `.workers-scroll` is no longer skipped in `contentWidthOf`, `skipPainted`, or `e2e/tests/fit-hints.spec.ts`. The row is a fixed grid (`7.6ch`, at least `13.2ch`, `9.8ch`, `7.6ch`) inside a scrollport with `overflow-x: hidden` and `overflow-y: scroll`. At both sizes `scrollWidth === clientWidth` (1223 and 975) and the Delete button’s right edge is inside the window (1243 of 1280, 992 of 1024). The label reads `Delete`.

2. **Long names widened the row.** The Work Person field is `width: 100%` in that middle track, so every row is the same width (spread 0). Typing `Montgomery-Fitzgerald` does not change the scrollport width. `Jose Ramirez` fits in the field (`scrollWidth === clientWidth`). A longer name scrolls inside the field. The type stays 1.5× the screen font (51.70 / 34.47 at 1280, 40.87 / 27.24 at 1024).

3. **Headers wrapped, sat on different baselines, and scrolled away.** `Active?`, `Work Person`, and `ID number` are one line (`white-space: nowrap`, `scrollWidth === clientWidth`) and share a top (87.03 at 1280, 68.78 at 1024). The header grid is outside `.workers-scroll`, with 16px of right padding matching the scrollbar, so its column left edges match the row (0 px). Control gaps are 12, 12, 12. After scrolling the list, the header is still on screen.

4. **Material dates and worker names were ellipsized.** `Mat_Date` / `Trans Date` tracks are `13ch`. Empno tracks are `18ch`. Amount tracks are `14ch` or `17ch`. Every body cell at both sizes has `scrollWidth <= clientWidth`. Dates read `02/01/2026` and `02/02/2026`. Empno reads `Jose Ramirez` and `Inactive Ian` in date order and descript order.

5. **Payroll search wrapped, then the scale jumped on Run.** `.payroll-toolbar` is `flex-wrap: nowrap`, and `.payroll-fit` does not force a 110ch minimum. The toolbar is one row before and after Run. `--fit-scale` stays `0.4925` at 1280 and `0.4558` at 1024.

6. **Historical lines store the numeric id.** Payroll, paint usage, and material list match `emp_no` to the typed name, to `work_persons.worker_no`, or to `employees.emp_no`. `report_payroll_matches_numeric_emp_no_for_worker_name` returns the invoice line and the material row stored as `400` when the search is `Jose Ramirez`. Import calls `seed_work_persons` and `backfill_numeric_worker_numbers` after commit. Startup backfill runs on the first migration and when that open just copied an empty catalog. A number cleared after that stays blank (`cleared_worker_number_stays_cleared_across_restart`). Menu item 2 is `Material Transaction in Worker Name`.

7. **Off-screen worker rows do not shrink the window.** `visibleBottom` ignores a painted control that an `overflow-y` ancestor has clipped, so a long Workers list does not change `--fit-scale`. Horizontal overflow is still measured.

## Checks

- `tsc --noEmit`
- Vitest: 36 files, 347 tests
- Rust: `schema`, `work_persons`, `invoice_ops`, and `ops` unit tests, including the numeric worker match
- Playwright: `v2162-r2` (this folder), `v2162`, `workers`, `fit-hints` (status lines, tables, and the long-value audit at 1280 and 1024)

## Files in `git diff --name-only 5dab9a0..HEAD`

- `artifacts/promas_v2162_r2/1024x768/material-date.png` — date-order material list at 1024×768
- `artifacts/promas_v2162_r2/1024x768/material-default.png` — default material list at 1024×768
- `artifacts/promas_v2162_r2/1024x768/material-desc.png` — descript-order material list at 1024×768
- `artifacts/promas_v2162_r2/1024x768/payroll-after.png` — payroll toolbar and rows after Run at 1024×768
- `artifacts/promas_v2162_r2/1024x768/payroll-before.png` — payroll toolbar before Run at 1024×768
- `artifacts/promas_v2162_r2/1024x768/workers-initial.png` — Workers with Jose Ramirez at 1024×768
- `artifacts/promas_v2162_r2/1024x768/workers-longname.png` — long name kept inside the column at 1024×768
- `artifacts/promas_v2162_r2/1024x768/workers-scrolled.png` — header still visible after scroll at 1024×768
- `artifacts/promas_v2162_r2/1280x800/material-date.png` — date-order material list at 1280×800
- `artifacts/promas_v2162_r2/1280x800/material-default.png` — default material list at 1280×800
- `artifacts/promas_v2162_r2/1280x800/material-desc.png` — descript-order material list at 1280×800
- `artifacts/promas_v2162_r2/1280x800/payroll-after.png` — payroll toolbar and rows after Run at 1280×800
- `artifacts/promas_v2162_r2/1280x800/payroll-before.png` — payroll toolbar before Run at 1280×800
- `artifacts/promas_v2162_r2/1280x800/workers-initial.png` — Workers with Jose Ramirez at 1280×800
- `artifacts/promas_v2162_r2/1280x800/workers-longname.png` — long name kept inside the column at 1280×800
- `artifacts/promas_v2162_r2/1280x800/workers-scrolled.png` — header still visible after scroll at 1280×800
- `artifacts/promas_v2162_r2/REPORT.md` — this note
- `artifacts/promas_v2162_r2/metrics.json` — computed style measurements for both viewports
- `e2e/mocks/tauriCore.ts` — e2e fixture for workers, materials, and payroll
- `e2e/tests/invoice.spec.ts` — invoice date and blank-row coverage
- `e2e/tests/v2162-r2.spec.ts` — round 2 layout proof at both viewports
- `e2e/tests/v2162.spec.ts` — date, workers, material, and payroll coverage; menu label is Worker Name
- `e2e/tests/workers.spec.ts` — workers catalog add, edit, and delete
- `package-lock.json` — lockfile for the 2.16.2 dependency set
- `package.json` — app version 2.16.2
- `src-tauri/Cargo.lock` — Rust lockfile for 2.16.2
- `src-tauri/Cargo.toml` — crate version 2.16.2
- `src-tauri/src/commands.rs` — material list goes through the shared query
- `src-tauri/src/db.rs` — one-shot worker-number backfill and the meta flag
- `src-tauri/src/import.rs` — seed and backfill workers at the end of a DBF import
- `src-tauri/src/ops.rs` — payroll, paint, and materials match a worker name or numeric id
- `src-tauri/tauri.conf.json` — package version 2.16.2
- `src-tauri/tests/invoice_ops.rs` — payroll and material rows stored as emp_no 400
- `src-tauri/tests/schema.rs` — empty catalog still seeds names and numeric ids
- `src-tauri/tests/work_persons.rs` — a cleared worker number survives restart
- `src/App.css` — Workers grid, sticky header, and the one-line payroll toolbar
- `src/App.tsx` — menu label Material Transaction in Worker Name
- `src/dos/hooks.ts` — Workers is measured for horizontal overflow; clipped rows are not
- `src/screens/MaterialBrowse.tsx` — wider date and Empno tracks
- `src/screens/ReportsScreen.test.tsx` — payroll dropdown coverage
- `src/screens/ReportsScreen.tsx` — payroll toolbar stays on one line
- `src/screens/WorkersScreen.test.tsx` — header text and numeric id
- `src/screens/WorkersScreen.tsx` — header outside the scroller; fields fill their tracks
- `src/screens/browseSmoke.test.tsx` — Worker Name filter coverage
- `src/screens/flow/InvoiceProcess.test.tsx` — aligned terms and four blank description rows
- `src/screens/flow/InvoiceProcess.tsx` — shared date width and the four blank rows
