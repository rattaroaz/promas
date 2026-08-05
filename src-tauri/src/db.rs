use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState(pub Mutex<Connection>);

pub fn init_db(app: &AppHandle) -> Result<Connection, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;
    let db_path = data_dir.join("promas.db");
    open_and_migrate(&db_path)
}

pub fn open_and_migrate(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("open db: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(|e| format!("pragma: {e}"))?;
    create_schema(&conn).map_err(|e| format!("schema: {e}"))?;
    Ok(conn)
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
