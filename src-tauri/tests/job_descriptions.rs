//! Job-description catalog used by invoice and work-order lines.

use promas_lib::commands::{
    list_job_description_records, remove_job_description, write_job_description,
};
use promas_lib::db::open_and_migrate;
use promas_lib::models::JobDescription;

fn temp_conn(label: &str) -> (std::path::PathBuf, rusqlite::Connection) {
    let dir = std::env::temp_dir().join(format!("promas_jobs_{}_{}", label, std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("promas.db");
    let conn = open_and_migrate(&path).expect("migrate");
    (dir, conn)
}

fn blank(description: &str, fixed: Option<f64>) -> JobDescription {
    JobDescription {
        description: description.to_string(),
        original_description: String::new(),
        single: None,
        one_plus_one: None,
        two_plus_one: None,
        two_plus_two: None,
        three_plus_two: None,
        four_plus_two: None,
        occupied: None,
        fixed,
    }
}

#[test]
fn empty_database_imports_the_built_in_descriptions_and_prices() {
    let (dir, conn) = temp_conn("seed");
    let rows = list_job_description_records(&conn).unwrap();
    assert_eq!(rows.len(), 15);
    let interior = rows
        .iter()
        .find(|row| row.description == "Interior Painting of Wall/Closet Inside")
        .unwrap();
    assert_eq!(interior.single, Some(220.0));
    assert_eq!(interior.four_plus_two, Some(545.0));
    assert_eq!(interior.fixed, None);
    let cabinet = rows
        .iter()
        .find(|row| row.description == "Paint Kitchen Cabinet Inside")
        .unwrap();
    assert_eq!(cabinet.fixed, Some(130.0));
    assert_eq!(cabinet.single, None);
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn add_rename_and_delete_leave_the_rest_of_the_catalog() {
    let (dir, conn) = temp_conn("crud");
    let mut added = blank("Touch up", Some(40.0));
    write_job_description(&conn, &added).unwrap();
    added.original_description = "Touch up".to_string();
    added.description = "Touch-up walls".to_string();
    added.fixed = Some(45.0);
    write_job_description(&conn, &added).unwrap();

    let rows = list_job_description_records(&conn).unwrap();
    assert!(rows
        .iter()
        .any(|row| row.description == "Touch-up walls" && row.fixed == Some(45.0)));
    assert!(!rows.iter().any(|row| row.description == "Touch up"));
    assert_eq!(rows.len(), 16);

    remove_job_description(&conn, "touch-up walls").unwrap();
    let left = list_job_description_records(&conn).unwrap();
    assert_eq!(left.len(), 15);
    assert!(left
        .iter()
        .any(|row| row.description == "Painting of Ceiling"));

    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}
