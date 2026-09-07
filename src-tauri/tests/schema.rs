//! Crate-level integration checks against a temp SQLite database.

use promas_lib::db::open_and_migrate;

#[test]
fn companies_and_invoices_round_trip() {
    let dir = std::env::temp_dir().join(format!(
        "promas_schema_{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("promas.db");
    let conn = open_and_migrate(&path).expect("migrate");

    conn.execute(
        "INSERT INTO companies (company_no, name, class, state) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params!["1000", "ACME Prop", "A", "CA"],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO properties (company_no, pro_no, name) VALUES (?1, ?2, ?3)",
        rusqlite::params!["1000", "01", "Bldg A"],
    )
    .unwrap();
    conn.execute(
        r#"INSERT INTO invoices
        (company_no, pro_no, sales_date, invoice, sales_total, sales_bal, balance, status, voided)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '', 0)"#,
        rusqlite::params!["1000", "01", "2026-01-15", 1, 250.0, 250.0, 250.0],
    )
    .unwrap();

    let bal: f64 = conn
        .query_row(
            "SELECT balance FROM invoices WHERE invoice=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(bal, 250.0);

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM companies", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);

    let tables: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='work_persons'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(tables, 1);

    let paint: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='paint_supply_cos'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(paint, 1);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn work_persons_seed_from_employee_names_when_catalog_empty() {
    let dir = std::env::temp_dir().join(format!(
        "promas_work_persons_{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("promas.db");
    let conn = open_and_migrate(&path).expect("migrate");
    conn.execute(
        "INSERT INTO employees (emp_no, name) VALUES (?1, ?2)",
        rusqlite::params!["400", "Jose Ramirez"],
    )
    .unwrap();
    drop(conn);

    let conn = open_and_migrate(&path).expect("migrate again");
    let name: String = conn
        .query_row("SELECT name FROM work_persons", [], |r| r.get(0))
        .unwrap();
    assert_eq!(name, "Jose Ramirez");

    conn.execute(
        "INSERT OR IGNORE INTO work_persons (name) VALUES (?1)",
        rusqlite::params!["Ana Cruz"],
    )
    .unwrap();
    drop(conn);

    let conn = open_and_migrate(&path).expect("migrate third");
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM work_persons", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 2);

    let _ = std::fs::remove_dir_all(&dir);
}
