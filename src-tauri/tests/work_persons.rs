//! Work-person catalog used by the invoice line dropdown.

use promas_lib::commands::{remove_work_person, write_work_person};
use promas_lib::db::open_and_migrate;
use promas_lib::models::WorkPerson;
use rusqlite::params;

fn person(name: &str, worker_no: &str, active: bool, original_name: &str) -> WorkPerson {
    WorkPerson {
        name: name.to_string(),
        worker_no: worker_no.to_string(),
        address: String::new(),
        phone: String::new(),
        active,
        original_name: original_name.to_string(),
    }
}

fn temp_conn(label: &str) -> (std::path::PathBuf, rusqlite::Connection) {
    let dir = std::env::temp_dir().join(format!("promas_wp_{}_{}", label, std::process::id()));
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

    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn empty_catalog_is_valid() {
    let (dir, conn) = temp_conn("empty");
    assert!(names(&conn).is_empty());
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn existing_dropdown_names_migrate_active_with_blank_worker_numbers() {
    let dir = std::env::temp_dir().join(format!("promas_wp_migrate_{}", std::process::id()));
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
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn numeric_employee_ids_fill_blank_worker_numbers() {
    let (dir, conn) = temp_conn("ids");
    conn.execute(
        "INSERT INTO employees (emp_no, name) VALUES ('400', 'Jose Ramirez')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO employees (emp_no, name) VALUES ('E1', 'Ana Cruz')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO employees (emp_no, name) VALUES ('12', 'Pat Lee')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO employees (emp_no, name) VALUES ('7', 'Pat Lee')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO work_persons (name, worker_no, active) VALUES ('Jose Ramirez', '', 1)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO work_persons (name, worker_no, active) VALUES ('Ana Cruz', '', 1)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO work_persons (name, worker_no, active) VALUES ('Pat Lee', '', 1)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO work_persons (name, worker_no, active) VALUES ('Kept', '99', 1)",
        [],
    )
    .unwrap();
    conn.execute(
        "DELETE FROM app_meta WHERE key = 'worker_no_backfill_v1'",
        [],
    )
    .unwrap();
    let path = dir.join("promas.db");
    drop(conn);

    let conn = open_and_migrate(&path).expect("backfill");
    let mut stmt = conn
        .prepare("SELECT name, worker_no FROM work_persons ORDER BY name COLLATE NOCASE")
        .unwrap();
    let rows: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    assert_eq!(
        rows,
        vec![
            ("Ana Cruz".to_string(), "".to_string()),
            ("Jose Ramirez".to_string(), "400".to_string()),
            ("Kept".to_string(), "99".to_string()),
            ("Pat Lee".to_string(), "7".to_string()),
        ]
    );
    drop(stmt);
    drop(conn);
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

    write_work_person(&conn, &person("Jose R.", "4", true, "Jose Ramirez")).unwrap();
    let emp_after_rename: String = conn
        .query_row("SELECT emp_no FROM invoice_lines", [], |r| r.get(0))
        .unwrap();
    assert_eq!(emp_after_rename, "Jose Ramirez");

    remove_work_person(&conn, "Jose R.").unwrap();
    let (emp, price): (String, f64) = conn
        .query_row("SELECT emp_no, price FROM invoice_lines", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!(emp, "Jose Ramirez");
    assert_eq!(price, 220.0);
    assert_eq!(names(&conn), vec!["Ana Cruz".to_string()]);

    let active: i64 = conn
        .query_row("SELECT active FROM work_persons", [], |r| r.get(0))
        .unwrap();
    assert_eq!(active, 0);
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn cleared_worker_number_stays_cleared_across_restart() {
    let (dir, conn) = temp_conn("keep-cleared");
    conn.execute(
        "INSERT INTO employees (emp_no, name) VALUES ('400', 'Jose Ramirez')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO work_persons (name, worker_no, active) VALUES ('Jose Ramirez', '400', 1)",
        [],
    )
    .unwrap();
    conn.execute("UPDATE work_persons SET worker_no = ''", [])
        .unwrap();
    let path = dir.join("promas.db");
    drop(conn);

    let conn = open_and_migrate(&path).expect("reopen");
    let worker_no: String = conn
        .query_row("SELECT worker_no FROM work_persons", [], |r| r.get(0))
        .unwrap();
    assert_eq!(worker_no, "");
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn worker_id_is_unique_and_address_is_stored() {
    let (dir, conn) = temp_conn("unique-id");
    let mut jose = person("Jose Ramirez", "400", true, "");
    jose.address = "12 Oak St".into();
    jose.phone = "555-0100".into();
    write_work_person(&conn, &jose).unwrap();
    let (address, phone): (String, String) = conn
        .query_row(
            "SELECT address, phone FROM work_persons WHERE name = 'Jose Ramirez'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(address, "12 Oak St");
    assert_eq!(phone, "555-0100");

    let err = write_work_person(&conn, &person("Ana Cruz", "400", true, "")).unwrap_err();
    assert_eq!(err, "Worker ID must be unique");
    let err = write_work_person(&conn, &person("Ana Cruz", " 400 ", true, "")).unwrap_err();
    assert_eq!(err, "Worker ID must be unique");

    write_work_person(&conn, &person("Ana Cruz", "15", true, "")).unwrap();
    write_work_person(&conn, &person("Jose Ramirez", "400", true, "Jose Ramirez")).unwrap();
    write_work_person(&conn, &person("Pat Lee", "", true, "")).unwrap();
    write_work_person(&conn, &person("Sam Lee", "", true, "")).unwrap();
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}
