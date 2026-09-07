//! Paint-supply-company catalog used by the invoice dropdown.

use promas_lib::db::open_and_migrate;
use rusqlite::params;

fn temp_conn(label: &str) -> (std::path::PathBuf, rusqlite::Connection) {
    let dir = std::env::temp_dir().join(format!(
        "promas_psc_{}_{}",
        label,
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("promas.db");
    let conn = open_and_migrate(&path).expect("migrate");
    (dir, conn)
}

fn names(conn: &rusqlite::Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare("SELECT name FROM paint_supply_cos ORDER BY name COLLATE NOCASE")
        .unwrap();
    stmt.query_map([], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

#[test]
fn insert_ignore_and_delete_are_case_insensitive() {
    let (dir, conn) = temp_conn("crud");
    conn.execute(
        "INSERT OR IGNORE INTO paint_supply_cos (name) VALUES (?1)",
        params!["Dunn-Edwards"],
    )
    .unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO paint_supply_cos (name) VALUES (?1)",
        params!["dunn-edwards"],
    )
    .unwrap();
    assert_eq!(names(&conn), vec!["Dunn-Edwards".to_string()]);

    conn.execute(
        "INSERT OR IGNORE INTO paint_supply_cos (name) VALUES (?1)",
        params!["Sherwin-Williams"],
    )
    .unwrap();
    assert_eq!(
        names(&conn),
        vec![
            "Dunn-Edwards".to_string(),
            "Sherwin-Williams".to_string()
        ]
    );

    conn.execute(
        "DELETE FROM paint_supply_cos WHERE name = ?1 COLLATE NOCASE",
        params!["DUNN-EDWARDS"],
    )
    .unwrap();
    assert_eq!(names(&conn), vec!["Sherwin-Williams".to_string()]);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn empty_catalog_is_valid() {
    let (dir, conn) = temp_conn("empty");
    assert!(names(&conn).is_empty());
    let _ = std::fs::remove_dir_all(&dir);
}
