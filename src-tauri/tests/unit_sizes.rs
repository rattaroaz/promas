//! Unit-size catalog used by the Job Descriptions size field.

use promas_lib::db::open_and_migrate;
use rusqlite::params;

fn temp_conn(label: &str) -> (std::path::PathBuf, rusqlite::Connection) {
    let dir = std::env::temp_dir().join(format!("promas_sizes_{}_{}", label, std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("promas.db");
    let conn = open_and_migrate(&path).expect("migrate");
    (dir, conn)
}

fn names(conn: &rusqlite::Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare("SELECT name FROM unit_sizes ORDER BY sort_order, name COLLATE NOCASE")
        .unwrap();
    stmt.query_map([], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

const SEED: &[&str] = &[
    "Single",
    "1+1",
    "2+1",
    "2+2",
    "3+2",
    "1+1 Loft",
    "2+1 Loft",
    "2+2 Loft",
    "2+1.5",
    "2+2.5",
    "3+2.5",
];

#[test]
fn open_seeds_unit_sizes_and_a_delete_stays_deleted() {
    let (dir, conn) = temp_conn("seed");
    assert_eq!(names(&conn), SEED.iter().map(|s| s.to_string()).collect::<Vec<_>>());
    conn.execute(
        "DELETE FROM unit_sizes WHERE name = ?1 COLLATE NOCASE",
        params!["1+1 Loft"],
    )
    .unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO unit_sizes (name, sort_order) VALUES ('Studio', 100)",
        [],
    )
    .unwrap();
    let path = dir.join("promas.db");
    drop(conn);
    let conn = open_and_migrate(&path).expect("reopen");
    let left = names(&conn);
    assert!(!left.iter().any(|n| n == "1+1 Loft"));
    assert!(left.iter().any(|n| n == "Studio"));
    assert!(left.iter().any(|n| n == "Single"));
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}
