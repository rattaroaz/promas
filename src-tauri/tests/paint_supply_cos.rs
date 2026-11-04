//! Paint-supply-company catalog used by the invoice dropdown.

use promas_lib::commands::remove_paint_supply_co;
use promas_lib::db::open_and_migrate;
use rusqlite::params;

fn temp_conn(label: &str) -> (std::path::PathBuf, rusqlite::Connection) {
    let dir = std::env::temp_dir().join(format!("promas_psc_{}_{}", label, std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("promas.db");
    let conn = open_and_migrate(&path).expect("migrate");
    (dir, conn)
}

fn names(conn: &rusqlite::Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare("SELECT name FROM paint_supply_cos ORDER BY sort_order, name COLLATE NOCASE")
        .unwrap();
    stmt.query_map([], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

const SEED: &[&str] = &[
    "Shilpark",
    "Dunn Edwards",
    "Sherman Williams",
    "Vista",
    "Home Depot",
    "Lowes",
];

#[test]
fn open_seeds_the_paint_supply_companies_in_order() {
    let (dir, conn) = temp_conn("seed");
    assert_eq!(names(&conn), SEED.iter().map(|s| s.to_string()).collect::<Vec<_>>());
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn insert_ignore_and_delete_are_case_insensitive() {
    let (dir, conn) = temp_conn("crud");
    conn.execute(
        "INSERT OR IGNORE INTO paint_supply_cos (name, sort_order) VALUES (?1, 50)",
        params!["Dunn-Edwards"],
    )
    .unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO paint_supply_cos (name, sort_order) VALUES (?1, 51)",
        params!["dunn-edwards"],
    )
    .unwrap();
    assert_eq!(
        names(&conn).iter().filter(|n| n.eq_ignore_ascii_case("dunn-edwards")).count(),
        1
    );

    remove_paint_supply_co(&conn, "DUNN-EDWARDS").unwrap();
    assert!(!names(&conn).iter().any(|n| n.eq_ignore_ascii_case("dunn-edwards")));
    assert!(names(&conn).iter().any(|n| n == "Shilpark"));

    remove_paint_supply_co(&conn, "shilpark").unwrap();
    let path = dir.join("promas.db");
    drop(conn);
    let conn = open_and_migrate(&path).expect("reopen");
    let left = names(&conn);
    assert!(!left.iter().any(|n| n.eq_ignore_ascii_case("shilpark")));
    assert!(left.iter().any(|n| n == "Vista"));
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn historical_invoice_names_are_copied_once() {
    let (dir, conn) = temp_conn("from_inv");
    conn.execute(
        "INSERT INTO companies (company_no, name) VALUES ('1000', 'ACME')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO invoices (company_no, pro_no, sales_date, invoice, paint_supply_co)
         VALUES ('1000', '01', '2026-01-15', 1, 'Kelly-Moore')",
        [],
    )
    .unwrap();
    let path = dir.join("promas.db");
    drop(conn);
    let conn = open_and_migrate(&path).expect("migrate again");
    assert!(
        !names(&conn).iter().any(|n| n == "Kelly-Moore"),
        "a name added after the first seed is not copied on later opens"
    );
    conn.execute("DELETE FROM app_meta WHERE key = 'paint_supply_seed_v1'", [])
        .unwrap();
    conn.execute("DELETE FROM paint_supply_cos", []).unwrap();
    drop(conn);
    let conn = open_and_migrate(&path).expect("seed again");
    let listed = names(&conn);
    assert!(listed.starts_with(&SEED.iter().map(|s| s.to_string()).collect::<Vec<_>>()));
    assert!(listed.iter().any(|n| n == "Kelly-Moore"));
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}
