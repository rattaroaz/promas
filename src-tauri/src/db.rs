use rusqlite::{Connection, Result};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState(pub Mutex<Connection>);

const DB_LOCATION_FILE: &str = "db_location.txt";
const DEFAULT_DB_NAME: &str = "promas.db";

pub fn init_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = resolve_db_path(app)?;
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create data dir: {e}"))?;
    }
    open_and_migrate(&db_path)
}

/// Validate / normalize a user-chosen database file path (not a folder).
pub fn normalize_db_file_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Database path is empty.".into());
    }
    let mut new_path = PathBuf::from(trimmed);
    if new_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.is_empty() || n == "." || n == "..")
        .unwrap_or(true)
    {
        return Err("Choose a database file name (not a folder).".into());
    }
    // Reject existing directories before appending a default extension.
    if new_path.is_dir() {
        return Err(format!(
            "Path is a folder; choose a .db file: {}",
            new_path.display()
        ));
    }
    if new_path.extension().is_none() {
        new_path.set_extension("db");
    }
    Ok(new_path)
}

pub fn ensure_db_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("create database folder: {e}"))?;
        }
    }
    Ok(())
}

/// Persist chosen DB path under a config directory (`db_location.txt`).
pub fn persist_db_location(config_dir: &Path, db_path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(config_dir).map_err(|e| format!("create data dir: {e}"))?;
    let config = config_dir.join(DB_LOCATION_FILE);
    std::fs::write(&config, db_path.display().to_string())
        .map_err(|e| format!("save db location: {e}"))
}

/// Read persisted DB path from a config directory, if present.
pub fn load_persisted_db_location(config_dir: &Path) -> Option<PathBuf> {
    let config = config_dir.join(DB_LOCATION_FILE);
    if !config.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(&config).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

/// Replace `current` with a copy of `source` (keeps `.db.bak` safety copy).
pub fn import_replace_database(current: &Path, source: &Path) -> Result<(), String> {
    if !source.is_file() {
        return Err(format!("Not a file: {}", source.display()));
    }
    if source == current {
        return Err("Source path is the same as the current database.".into());
    }
    if let Some(parent) = current.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create db dir: {e}"))?;
    }
    if current.exists() {
        let bak = current.with_extension("db.bak");
        let _ = std::fs::copy(current, &bak);
    }
    std::fs::copy(source, current).map_err(|e| format!("import database: {e}"))?;
    let wal = PathBuf::from(format!("{}-wal", current.display()));
    let shm = PathBuf::from(format!("{}-shm", current.display()));
    let _ = std::fs::remove_file(&wal);
    let _ = std::fs::remove_file(&shm);
    Ok(())
}

/// Returns the configured database file path (custom location or default app-data path).
pub fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;

    if let Some(path) = load_persisted_db_location(&data_dir) {
        return Ok(path);
    }
    Ok(data_dir.join(DEFAULT_DB_NAME))
}

pub fn save_db_location(app: &AppHandle, path: &Path) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    persist_db_location(&data_dir, path)
}

/// Close the live connection (via in-memory placeholder), run `op`, then reopen.
/// On success reopens `reopen_on_ok`; on failure reopens `reopen_on_err`.
pub fn with_db_closed<F, T>(
    state: &DbState,
    reopen_on_ok: &Path,
    reopen_on_err: &Path,
    op: F,
) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let _ = guard.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    let old = std::mem::replace(
        &mut *guard,
        Connection::open_in_memory().map_err(|e| format!("temp db: {e}"))?,
    );
    drop(old);

    let result = op();
    let reopen = if result.is_ok() {
        reopen_on_ok
    } else {
        reopen_on_err
    };
    *guard = open_and_migrate(reopen)?;
    result
}

pub fn open_and_migrate(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("open db: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(|e| format!("pragma: {e}"))?;
    create_schema(&conn).map_err(|e| format!("schema: {e}"))?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn open_and_migrate_creates_schema_and_sysdata() {
        let dir = std::env::temp_dir().join(format!("promas_db_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("promas.db");
        let conn = open_and_migrate(&path).expect("migrate");
        let company: String = conn
            .query_row("SELECT company FROM sysdata WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert!(!company.is_empty());
        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='companies'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn vacuum_into_exports_copy() {
        let dir = std::env::temp_dir().join(format!("promas_vac_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("promas.db");
        let export = dir.join("export.db");
        let conn = open_and_migrate(&path).expect("migrate");
        conn.execute(
            "UPDATE sysdata SET company=?1 WHERE id=1",
            ["Export Co"],
        )
        .unwrap();
        conn.execute("VACUUM INTO ?1", [export.display().to_string()])
            .unwrap();
        assert!(export.exists());
        let exported = Connection::open(&export).unwrap();
        let company: String = exported
            .query_row("SELECT company FROM sysdata WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(company, "Export Co");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn with_db_closed_reopens_on_success() {
        let dir = std::env::temp_dir().join(format!("promas_closed_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("promas.db");
        let conn = open_and_migrate(&path).unwrap();
        let state = DbState(Mutex::new(conn));
        with_db_closed(&state, &path, &path, || {
            assert!(path.exists());
            Ok::<_, String>(())
        })
        .unwrap();
        let guard = state.0.lock().unwrap();
        let _: String = guard
            .query_row("SELECT company FROM sysdata WHERE id=1", [], |r| r.get(0))
            .unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn normalize_db_file_path_rejects_empty_and_folders() {
        assert!(normalize_db_file_path("").is_err());
        assert!(normalize_db_file_path("   ").is_err());
        assert!(normalize_db_file_path(".").is_err());
        let dir = std::env::temp_dir().join(format!(
            "promas_norm_dir_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(normalize_db_file_path(dir.to_str().unwrap()).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn normalize_db_file_path_adds_db_extension() {
        let p = normalize_db_file_path(r"C:\data\mydata").unwrap();
        assert_eq!(p.extension().and_then(|e| e.to_str()), Some("db"));
        let p2 = normalize_db_file_path(r"C:\data\keep.sqlite").unwrap();
        assert_eq!(p2.extension().and_then(|e| e.to_str()), Some("sqlite"));
    }

    #[test]
    fn persist_and_load_db_location() {
        let dir = std::env::temp_dir().join(format!(
            "promas_loc_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let db = dir.join("custom").join("acct.db");
        persist_db_location(&dir, &db).unwrap();
        let loaded = load_persisted_db_location(&dir).unwrap();
        assert_eq!(loaded, db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn switching_to_existing_db_preserves_data() {
        let dir = std::env::temp_dir().join(format!(
            "promas_keep_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let current = dir.join("current.db");
        let existing = dir.join("existing.db");

        let keep = open_and_migrate(&existing).unwrap();
        keep.execute("UPDATE sysdata SET company=?1 WHERE id=1", ["Keep Me"])
            .unwrap();
        drop(keep);

        let conn = open_and_migrate(&current).unwrap();
        let state = DbState(Mutex::new(conn));
        // Switch to existing — must not wipe "Keep Me"
        with_db_closed(&state, &existing, &current, || Ok::<_, String>(())).unwrap();

        let company: String = state
            .0
            .lock()
            .unwrap()
            .query_row("SELECT company FROM sysdata WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(company, "Keep Me");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_or_create_via_with_db_closed_creates_new_file() {
        let dir = std::env::temp_dir().join(format!(
            "promas_switch_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let current = dir.join("old.db");
        let new_path = dir.join("nested").join("new.db");
        let conn = open_and_migrate(&current).unwrap();
        let state = DbState(Mutex::new(conn));
        assert!(!new_path.exists());
        ensure_db_parent(&new_path).unwrap();
        with_db_closed(&state, &new_path, &current, || Ok::<_, String>(())).unwrap();
        assert!(new_path.exists());
        let company: String = state
            .0
            .lock()
            .unwrap()
            .query_row("SELECT company FROM sysdata WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert!(!company.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_replace_database_copies_and_keeps_bak() {
        let dir = std::env::temp_dir().join(format!(
            "promas_imp_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let current = dir.join("live.db");
        let source = dir.join("incoming.db");
        let c1 = open_and_migrate(&current).unwrap();
        c1.execute("UPDATE sysdata SET company=?1 WHERE id=1", ["Old Co"])
            .unwrap();
        drop(c1);
        let c2 = open_and_migrate(&source).unwrap();
        c2.execute("UPDATE sysdata SET company=?1 WHERE id=1", ["New Co"])
            .unwrap();
        drop(c2);

        import_replace_database(&current, &source).unwrap();
        assert!(current.with_extension("db.bak").exists());
        let opened = Connection::open(&current).unwrap();
        let company: String = opened
            .query_row("SELECT company FROM sysdata WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(company, "New Co");
        assert!(import_replace_database(&current, &current).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

fn create_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS sysdata (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            company TEXT NOT NULL DEFAULT '',
            address1 TEXT NOT NULL DEFAULT '',
            address2 TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            zip TEXT NOT NULL DEFAULT '',
            close_date TEXT,
            next_invoice INTEGER NOT NULL DEFAULT 1,
            next_order INTEGER NOT NULL DEFAULT 1,
            next_estimate INTEGER NOT NULL DEFAULT 1,
            terms_days INTEGER NOT NULL DEFAULT 7,
            interest_rate REAL NOT NULL DEFAULT 1.5
        );

        INSERT OR IGNORE INTO sysdata (id, company) VALUES (1, 'Q Maintenance Co.');

        CREATE TABLE IF NOT EXISTS companies (
            company_no TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            class TEXT NOT NULL DEFAULT '',
            street TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            state TEXT NOT NULL DEFAULT '',
            zip TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            phone2 TEXT NOT NULL DEFAULT '',
            phone3 TEXT NOT NULL DEFAULT '',
            phone4 TEXT NOT NULL DEFAULT '',
            contact TEXT NOT NULL DEFAULT '',
            enter_date TEXT,
            page_map TEXT NOT NULL DEFAULT '',
            last_pro_id INTEGER NOT NULL DEFAULT 0,
            memo TEXT NOT NULL DEFAULT '',
            voided INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS properties (
            company_no TEXT NOT NULL,
            pro_no TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            class TEXT NOT NULL DEFAULT '',
            street TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            state TEXT NOT NULL DEFAULT '',
            zip TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            phone2 TEXT NOT NULL DEFAULT '',
            contact TEXT NOT NULL DEFAULT '',
            no_of_unit INTEGER NOT NULL DEFAULT 0,
            manager TEXT NOT NULL DEFAULT '',
            page_map TEXT NOT NULL DEFAULT '',
            key_info TEXT NOT NULL DEFAULT '',
            paint_time TEXT NOT NULL DEFAULT '',
            comment1 TEXT NOT NULL DEFAULT '',
            comment2 TEXT NOT NULL DEFAULT '',
            memo TEXT NOT NULL DEFAULT '',
            voided INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (company_no, pro_no),
            FOREIGN KEY (company_no) REFERENCES companies(company_no)
        );

        CREATE TABLE IF NOT EXISTS employees (
            emp_no TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            class TEXT NOT NULL DEFAULT '',
            street TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            state TEXT NOT NULL DEFAULT '',
            zip TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            contact TEXT NOT NULL DEFAULT '',
            enter_date TEXT,
            commission REAL NOT NULL DEFAULT 65.0,
            ssno TEXT NOT NULL DEFAULT '',
            birth_date TEXT,
            voided INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS work_types (
            code_no TEXT PRIMARY KEY,
            work_type TEXT NOT NULL DEFAULT 'P',
            description TEXT NOT NULL DEFAULT '',
            price REAL NOT NULL DEFAULT 0,
            voided INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS invoices (
            company_no TEXT NOT NULL,
            pro_no TEXT NOT NULL,
            sales_date TEXT NOT NULL,
            invoice INTEGER NOT NULL,
            order_no INTEGER NOT NULL DEFAULT 0,
            order_date TEXT,
            order_man TEXT NOT NULL DEFAULT '',
            sales_unit TEXT NOT NULL DEFAULT '',
            sales_size TEXT NOT NULL DEFAULT '',
            sales_total REAL NOT NULL DEFAULT 0,
            sales_pay REAL NOT NULL DEFAULT 0,
            sales_bal REAL NOT NULL DEFAULT 0,
            pay_total REAL NOT NULL DEFAULT 0,
            balance REAL NOT NULL DEFAULT 0,
            sales_term TEXT NOT NULL DEFAULT 'Net  7 Days',
            sales_due TEXT,
            cust_po_no TEXT NOT NULL DEFAULT '',
            discount_on INTEGER NOT NULL DEFAULT 0,
            discount REAL NOT NULL DEFAULT 0,
            deposit_ref TEXT NOT NULL DEFAULT '',
            remark1 TEXT NOT NULL DEFAULT '',
            remark2 TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '',
            voided INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (company_no, pro_no, sales_date, invoice)
        );

        CREATE TABLE IF NOT EXISTS invoice_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_no TEXT NOT NULL,
            pro_no TEXT NOT NULL,
            sales_date TEXT NOT NULL,
            invoice INTEGER NOT NULL,
            line_no INTEGER NOT NULL,
            code_no TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            work_date TEXT,
            work_type TEXT NOT NULL DEFAULT '',
            price REAL NOT NULL DEFAULT 0,
            emp_no TEXT NOT NULL DEFAULT '',
            emp_price REAL NOT NULL DEFAULT 0,
            commission REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT '',
            UNIQUE (company_no, pro_no, sales_date, invoice, line_no)
        );

        CREATE TABLE IF NOT EXISTS cash_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_no TEXT NOT NULL,
            sales_date TEXT NOT NULL,
            invoice INTEGER NOT NULL,
            payment REAL NOT NULL DEFAULT 0,
            pay_ref_no TEXT NOT NULL DEFAULT '',
            pay_date TEXT NOT NULL,
            voided INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS work_orders (
            company_no TEXT NOT NULL,
            pro_no TEXT NOT NULL,
            order_date TEXT NOT NULL,
            order_no INTEGER NOT NULL,
            work_date TEXT,
            order_unit TEXT NOT NULL DEFAULT '',
            order_size TEXT NOT NULL DEFAULT '',
            order_man TEXT NOT NULL DEFAULT '',
            order_by TEXT NOT NULL DEFAULT '',
            cust_po_no TEXT NOT NULL DEFAULT '',
            remark1 TEXT NOT NULL DEFAULT '',
            remark2 TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '',
            voided INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (company_no, pro_no, order_date, order_no)
        );

        CREATE TABLE IF NOT EXISTS work_order_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_no TEXT NOT NULL,
            pro_no TEXT NOT NULL,
            order_date TEXT NOT NULL,
            order_no INTEGER NOT NULL,
            line_no INTEGER NOT NULL,
            code_no TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            work_type TEXT NOT NULL DEFAULT '',
            price REAL NOT NULL DEFAULT 0,
            UNIQUE (company_no, pro_no, order_date, order_no, line_no)
        );

        CREATE TABLE IF NOT EXISTS materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emp_no TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            mat_date TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT '',
            voided INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS estimates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_no TEXT NOT NULL DEFAULT '',
            est_date TEXT,
            est_no INTEGER NOT NULL DEFAULT 0,
            form_no TEXT NOT NULL DEFAULT '',
            memo TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '',
            voided INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS forms (
            form_no TEXT PRIMARY KEY,
            content TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
        CREATE INDEX IF NOT EXISTS idx_properties_name ON properties(name);
        CREATE INDEX IF NOT EXISTS idx_invoices_invoice ON invoices(invoice);
        CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(sales_date);
        CREATE INDEX IF NOT EXISTS idx_invoices_balance ON invoices(balance);
        CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice);
        CREATE INDEX IF NOT EXISTS idx_invoice_lines_emp ON invoice_lines(emp_no, work_date);
        CREATE INDEX IF NOT EXISTS idx_cash_invoice ON cash_receipts(invoice);
        CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_receipts(pay_date);
        CREATE INDEX IF NOT EXISTS idx_materials_emp ON materials(emp_no, mat_date);
        "#,
    )?;
    Ok(())
}
