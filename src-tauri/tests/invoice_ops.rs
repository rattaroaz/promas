//! Integration tests for invoice / cash / aging ops against a temp SQLite DB.

use promas_lib::db::open_and_migrate;
use promas_lib::models::*;
use promas_lib::ops;
use rusqlite::params;

fn temp_conn(label: &str) -> (std::path::PathBuf, rusqlite::Connection) {
    let dir = std::env::temp_dir().join(format!(
        "promas_{}_{}",
        label,
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("promas.db");
    let conn = open_and_migrate(&path).expect("migrate");
    (dir, conn)
}

fn seed_company(conn: &rusqlite::Connection) {
    conn.execute(
        "INSERT INTO companies (company_no, name, phone) VALUES (?1, ?2, ?3)",
        params!["1000", "ACME Prop", "555-0100"],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO properties (company_no, pro_no, name) VALUES (?1, ?2, ?3)",
        params!["1000", "01", "Bldg A"],
    )
    .unwrap();
}

fn blank_invoice() -> Invoice {
    Invoice {
        company_no: "1000".into(),
        pro_no: "01".into(),
        sales_date: "2026-01-15".into(),
        invoice: 0,
        order_no: 0,
        order_date: None,
        order_man: "MGR".into(),
        sales_unit: "A1".into(),
        sales_size: "".into(),
        sales_total: 0.0,
        sales_pay: 0.0,
        sales_bal: 0.0,
        pay_total: 0.0,
        balance: 0.0,
        sales_term: "Net  7 Days".into(),
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
    }
}

fn line(price: f64) -> InvoiceLine {
    InvoiceLine {
        id: None,
        company_no: "1000".into(),
        pro_no: "01".into(),
        sales_date: "2026-01-15".into(),
        invoice: 0,
        line_no: 1,
        code_no: "*".into(),
        description: "Paint".into(),
        work_date: Some("2026-01-15".into()),
        work_type: "P".into(),
        price,
        emp_no: "".into(),
        emp_price: 0.0,
        commission: 65.0,
        status: "".into(),
    }
}

#[test]
fn save_invoice_allocates_number_and_totals() {
    let (dir, mut conn) = temp_conn("save_inv");
    seed_company(&conn);

    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: blank_invoice(),
            lines: vec![line(100.0), InvoiceLine { line_no: 2, price: 50.0, ..line(50.0) }],
        },
    )
    .expect("save");
    assert_eq!(inv_no, 1);

    let (total, bal, next): (f64, f64, i64) = conn
        .query_row(
            "SELECT sales_total, balance, (SELECT next_invoice FROM sysdata WHERE id=1) FROM invoices WHERE invoice=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(total, 150.0);
    assert_eq!(bal, 150.0);
    assert_eq!(next, 2);

    let lines: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM invoice_lines WHERE invoice=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(lines, 2);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn void_invoice_sets_status() {
    let (dir, mut conn) = temp_conn("void_inv");
    seed_company(&conn);
    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: blank_invoice(),
            lines: vec![line(200.0)],
        },
    )
    .unwrap();

    ops::void_invoice(&conn, "1000", "01", "2026-01-15", inv_no).unwrap();

    let (voided, status): (i64, String) = conn
        .query_row(
            "SELECT voided, status FROM invoices WHERE invoice=?",
            params![inv_no],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(voided, 1);
    assert_eq!(status, "V");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn cash_receipt_updates_invoice_balance() {
    let (dir, mut conn) = temp_conn("cash");
    seed_company(&conn);
    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: blank_invoice(),
            lines: vec![line(250.0)],
        },
    )
    .unwrap();

    ops::save_cash_receipt(
        &mut conn,
        CashReceipt {
            id: None,
            company_no: "1000".into(),
            sales_date: "2026-01-15".into(),
            invoice: inv_no,
            payment: 100.0,
            pay_ref_no: "CHK1".into(),
            pay_date: "2026-01-20".into(),
            voided: false,
            company_name: None,
        },
    )
    .unwrap();

    let (pay_total, balance): (f64, f64) = conn
        .query_row(
            "SELECT pay_total, balance FROM invoices WHERE invoice=?",
            params![inv_no],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(pay_total, 100.0);
    assert_eq!(balance, 150.0);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn report_aging_buckets_by_age() {
    let (dir, mut conn) = temp_conn("aging");
    seed_company(&conn);

    // Current (<=30): 2026-01-15 vs as_of 2026-02-01 → 17 days
    let mut inv = blank_invoice();
    inv.sales_date = "2026-01-15".into();
    inv.invoice = 1;
    ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: inv,
            lines: vec![line(100.0)],
        },
    )
    .unwrap();

    // 30–60 bucket: 2025-12-20 vs 2026-02-01 → 43 days
    let mut inv2 = blank_invoice();
    inv2.sales_date = "2025-12-20".into();
    inv2.invoice = 2;
    ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: inv2,
            lines: vec![InvoiceLine {
                sales_date: "2025-12-20".into(),
                invoice: 2,
                price: 50.0,
                ..line(50.0)
            }],
        },
    )
    .unwrap();

    let rows = ops::report_aging(&conn, Some("2026-02-01".into())).unwrap();
    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    assert_eq!(row.company_no, "1000");
    assert_eq!(row.current, 100.0);
    assert_eq!(row.days_30, 50.0);
    assert_eq!(row.open_bal, 150.0);

    let _ = std::fs::remove_dir_all(&dir);
}
