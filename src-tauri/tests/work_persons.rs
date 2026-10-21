//! Work-person catalog used by the invoice line dropdown.

use promas_lib::commands::{remove_work_person, write_work_person};
use promas_lib::db::open_and_migrate;
use promas_lib::models::WorkPerson;
use rusqlite::params;

fn person(name: &str, worker_no: &str, active: bool, original_name: &str) -> WorkPerson {
    WorkPerson {
        name: name.to_string(),
        worker_no: worker_no.to_string(),
        active,
        original_name: original_name.to_string(),
    }
}

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

#[test]
fn existing_dropdown_names_migrate_active_with_blank_worker_numbers() {
    let dir = std::env::temp_dir().join(format!(
        "promas_wp_migrate_{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("promas.db");
    let conn = rusqlite::Connection::open(&path).unwrap();
    conn.execute_batch(
        "CREATE TABLE work_persons (name TEXT PRIMARY KEY COLLATE NOCASE);
         INSERT INTO work_persons (name) VALUES ('Jose Ramirez');",
    )
    .unwrap();
    drop(conn);

    let conn = open_and_migrate(&path).expect("migrate old catalog");
    let (name, worker_no, active): (String, String, i64) = conn
        .query_row(
            "SELECT name, worker_no, active FROM work_persons",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(name, "Jose Ramirez");
    assert_eq!(worker_no, "");
    assert_eq!(active, 1);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn delete_and_rename_leave_invoice_lines_untouched() {
    let (dir, conn) = temp_conn("keep-invoice");
    write_work_person(&conn, &person("Jose Ramirez", "", true, "")).unwrap();
    write_work_person(&conn, &person("Ana Cruz", "15", false, "")).unwrap();
    conn.execute(
        "INSERT INTO invoice_lines (company_no, pro_no, sales_date, invoice, line_no, description, emp_no, price)
         VALUES ('1000', '01', '2026-01-15', 1, 1, 'Hallway', 'Jose Ramirez', 220)",
        [],
    )
    .unwrap();

    write_work_person(
        &conn,
        &person("Jose R.", "4", true, "Jose Ramirez"),
    )
    .unwrap();
    let emp_after_rename: String = conn
        .query_row("SELECT emp_no FROM invoice_lines", [], |r| r.get(0))
        .unwrap();
    assert_eq!(emp_after_rename, "Jose Ramirez");

    remove_work_person(&conn, "Jose R.").unwrap();
    let (emp, price): (String, f64) = conn
        .query_row(
            "SELECT emp_no, price FROM invoice_lines",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(emp, "Jose Ramirez");
    assert_eq!(price, 220.0);
    assert_eq!(names(&conn), vec!["Ana Cruz".to_string()]);

    let active: i64 = conn
        .query_row("SELECT active FROM work_persons", [], |r| r.get(0))
        .unwrap();
    assert_eq!(active, 0);
    let _ = std::fs::remove_dir_all(&dir);
}
