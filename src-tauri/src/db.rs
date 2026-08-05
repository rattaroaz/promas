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

/// Returns the configured database file path (custom location or default app-data path).
pub fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;

    let config = data_dir.join(DB_LOCATION_FILE);
    if config.exists() {
        let raw = std::fs::read_to_string(&config).map_err(|e| format!("read db location: {e}"))?;
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    Ok(data_dir.join(DEFAULT_DB_NAME))
}

pub fn save_db_location(app: &AppHandle, path: &Path) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;
    let config = data_dir.join(DB_LOCATION_FILE);
    std::fs::write(&config, path.display().to_string())
        .map_err(|e| format!("save db location: {e}"))
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
