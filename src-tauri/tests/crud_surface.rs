//! Integration tests covering company/property/material/estimate/work-order
//! surfaces that Tauri commands expose (via ops + schema SQL).

use promas_lib::db::open_and_migrate;
use promas_lib::models::*;
use promas_lib::ops;
use rusqlite::params;

fn temp_conn(label: &str) -> (std::path::PathBuf, rusqlite::Connection) {
    let dir = std::env::temp_dir().join(format!(
        "promas_crud_{}_{}",
        label,
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("promas.db");
    let conn = open_and_migrate(&path).expect("migrate");
    (dir, conn)
}

fn upsert_company(conn: &rusqlite::Connection, no: &str, name: &str) {
    conn.execute(
        r#"INSERT INTO companies
           (company_no,name,class,street,city,state,zip,phone,phone2,phone3,phone4,
            contact,enter_date,page_map,last_pro_id,memo,voided)
           VALUES (?1,?2,'A','','','CA','','','','','','',NULL,'',100,'',0)
           ON CONFLICT(company_no) DO UPDATE SET name=excluded.name"#,
        params![no, name],
    )
    .unwrap();
}

fn upsert_property(conn: &rusqlite::Connection, company: &str, pro: &str, name: &str) {
    conn.execute(
        r#"INSERT INTO properties
           (company_no,pro_no,name,class,street,city,state,zip,phone,phone2,contact,
            no_of_unit,manager,page_map,key_info,paint_time,comment1,comment2,memo,voided)
           VALUES (?1,?2,?3,'','','','CA','','','','',0,'','','','','','','',0)
           ON CONFLICT(company_no,pro_no) DO UPDATE SET name=excluded.name"#,
        params![company, pro, name],
    )
    .unwrap();
}

#[test]
fn company_property_soft_delete_and_list() {
    let (dir, conn) = temp_conn("co_pr");
    upsert_company(&conn, "1000", "ACME");
    upsert_property(&conn, "1000", "01", "Bldg A");

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM companies WHERE voided=0",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);

    conn.execute(
        "UPDATE companies SET voided=1 WHERE company_no=?",
        params!["1000"],
    )
    .unwrap();
    let active: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM companies WHERE voided=0",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(active, 0);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn work_order_save_find_and_void() {
    let (dir, mut conn) = temp_conn("wo");
    upsert_company(&conn, "1000", "ACME");
    upsert_property(&conn, "1000", "01", "Bldg A");

    let no = ops::save_work_order(
        &mut conn,
        WorkOrderWithLines {
            order: WorkOrder {
                company_no: "1000".into(),
                pro_no: "01".into(),
                order_date: "2026-02-01".into(),
                order_no: 0,
                work_date: Some("2026-02-02".into()),
                order_unit: "A1".into(),
                order_size: "".into(),
                order_man: "MGR".into(),
                order_by: "".into(),
                cust_po_no: "".into(),
                remark1: "".into(),
                remark2: "".into(),
                status: "".into(),
                voided: false,
                company_name: None,
                property_name: None,
            },
            lines: vec![WorkOrderLine {
                id: None,
                company_no: "1000".into(),
                pro_no: "01".into(),
                order_date: "2026-02-01".into(),
                order_no: 0,
                line_no: 1,
                code_no: "*".into(),
                description: "Prep".into(),
                work_type: "P".into(),
                price: 100.0,
            }],
        },
    )
    .unwrap();
    assert!(no > 0);

    let found = ops::find_work_order(&conn, "1000", "01", no)
        .unwrap()
        .expect("found");
    assert_eq!(found.order.order_unit, "A1");
    assert_eq!(found.lines.len(), 1);

    ops::void_work_order(&mut conn, "1000", "01", "2026-02-01", no).unwrap();
    let voided: i64 = conn
        .query_row(
            "SELECT voided FROM work_orders WHERE order_no=?",
            params![no],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(voided, 1);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn material_and_estimate_round_trip() {
    let (dir, conn) = temp_conn("mat_est");
    upsert_company(&conn, "1000", "ACME");

    conn.execute(
        r#"INSERT INTO materials (emp_no, description, mat_date, amount, status, voided)
           VALUES ('E1', 'Paint', '2026-03-01', 12.5, '', 0)"#,
        [],
    )
    .unwrap();
    let mat_amt: f64 = conn
        .query_row(
            "SELECT amount FROM materials WHERE emp_no='E1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(mat_amt, 12.5);

    conn.execute(
        r#"INSERT INTO estimates (company_no, est_date, est_no, form_no, memo, status, voided)
           VALUES ('1000', '2026-03-02', 1, 'EST-1', 'quote', '', 0)"#,
        [],
    )
    .unwrap();
    let est: i64 = conn
        .query_row(
            "SELECT est_no FROM estimates WHERE company_no='1000'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(est, 1);

    conn.execute("UPDATE estimates SET voided=1 WHERE est_no=1", [])
        .unwrap();
    let voided: i64 = conn
        .query_row("SELECT voided FROM estimates WHERE est_no=1", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(voided, 1);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn aging_report_after_open_invoice() {
    let (dir, mut conn) = temp_conn("aging");
    upsert_company(&conn, "1000", "ACME");
    upsert_property(&conn, "1000", "01", "Bldg A");

    let inv = Invoice {
        company_no: "1000".into(),
        pro_no: "01".into(),
        sales_date: "2026-01-15".into(),
        invoice: 0,
        order_no: 0,
        order_date: None,
        order_man: "".into(),
        sales_unit: "A1".into(),
        sales_size: "".into(),
        sales_total: 0.0,
        sales_pay: 0.0,
        sales_bal: 0.0,
        pay_total: 0.0,
        balance: 0.0,
        sales_term: "".into(),
        sales_due: None,
        cust_po_no: "".into(),
        discount_on: 0,
        discount: 0.0,
        deposit_ref: "".into(),
        remark1: "".into(),
        remark2: "".into(),
        status: "".into(),
        voided: false,
        company_name: None,
        property_name: None,
        property_street: None,
    };
    ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: inv,
            lines: vec![InvoiceLine {
                id: None,
                company_no: "1000".into(),
                pro_no: "01".into(),
                sales_date: "2026-01-15".into(),
                invoice: 0,
                line_no: 1,
                code_no: "*".into(),
                description: "Job".into(),
                work_date: Some("2026-01-15".into()),
                work_type: "P".into(),
                price: 200.0,
                emp_no: "".into(),
                emp_price: 0.0,
                commission: 65.0,
                status: "".into(),
            }],
        },
    )
    .unwrap();

    let rows = ops::report_aging(&conn, Some("2026-02-15".into())).unwrap();
    assert!(!rows.is_empty());
    assert!(rows.iter().any(|r| r.company_no == "1000"));

    let _ = std::fs::remove_dir_all(&dir);
}
