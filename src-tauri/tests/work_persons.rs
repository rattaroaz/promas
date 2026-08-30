//! Work-person catalog used by the invoice line dropdown.

use promas_lib::db::open_and_migrate;
use rusqlite::params;

fn temp_conn(label: &str) -> (std::path::PathBuf, rusqlite::Connection) {
    let dir = std::env::temp_dir().join(format!(
        "promas_wp_{}_{}",
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
        .prepare("SELECT name FROM work_persons ORDER BY name COLLATE NOCASE")
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
        "INSERT OR IGNORE INTO work_persons (name) VALUES (?1)",
        params!["Jose Ramirez"],
    )
    .unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO work_persons (name) VALUES (?1)",
        params!["jose ramirez"],
    )
    .unwrap();
    assert_eq!(names(&conn), vec!["Jose Ramirez".to_string()]);

    conn.execute(
        "INSERT OR IGNORE INTO work_persons (name) VALUES (?1)",
        params!["Ana Cruz"],
    )
    .unwrap();
    assert_eq!(
        names(&conn),
        vec!["Ana Cruz".to_string(), "Jose Ramirez".to_string()]
    );

    conn.execute(
        "DELETE FROM work_persons WHERE name = ?1 COLLATE NOCASE",
        params!["JOSE RAMIREZ"],
    )
    .unwrap();
    assert_eq!(names(&conn), vec!["Ana Cruz".to_string()]);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn empty_catalog_is_valid() {
    let (dir, conn) = temp_conn("empty");
    assert!(names(&conn).is_empty());
    let _ = std::fs::remove_dir_all(&dir);
}
