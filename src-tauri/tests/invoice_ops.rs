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
        "INSERT INTO companies (company_no, name, phone, contact) VALUES (?1, ?2, ?3, ?4)",
        params!["1000", "ACME Prop", "555-0100", "ELAINE"],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO properties (company_no, pro_no, name, street, city, zip) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params!["1000", "01", "Bldg A", "1105 QUAIL ST.", "NEWPORT BEACH", "92660"],
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
        material_cost: 0.0,
        paint_supply_co: "".into(),
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

    let mut assigned = blank_invoice();
    assigned.invoice = 2;
    let inv_no2 = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: assigned,
            lines: vec![line(10.0)],
        },
    )
    .expect("save preassigned");
    assert_eq!(inv_no2, 2);
    let next2: i64 = conn
        .query_row("SELECT next_invoice FROM sysdata WHERE id=1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(next2, 3);

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
fn save_invoice_stores_material_cost_and_paint_supply() {
    let (dir, mut conn) = temp_conn("mat_cost");
    seed_company(&conn);
    let mut inv = blank_invoice();
    inv.material_cost = 37.5;
    inv.paint_supply_co = "Dunn-Edwards".into();
    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: inv,
            lines: vec![line(100.0)],
        },
    )
    .unwrap();
    let (cost, supplier): (f64, String) = conn
        .query_row(
            "SELECT material_cost, paint_supply_co FROM invoices WHERE invoice=?",
            params![inv_no],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(cost, 37.5);
    assert_eq!(supplier, "Dunn-Edwards");

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

    let rows = ops::report_aging(&conn, Some("2026-02-01".into()), None).unwrap();
    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    assert_eq!(row.company_no, "1000");
    assert_eq!(row.contact, "ELAINE");
    assert_eq!(row.current, 100.0);
    assert_eq!(row.days_30, 50.0);
    assert_eq!(row.open_bal, 150.0);

    let by_contact =
        ops::report_aging(&conn, Some("2026-02-01".into()), Some("ELAINE".into())).unwrap();
    assert_eq!(by_contact.len(), 1);
    let by_name =
        ops::report_aging(&conn, Some("2026-02-01".into()), Some("ACME".into())).unwrap();
    assert_eq!(by_name.len(), 1);
    let by_no =
        ops::report_aging(&conn, Some("2026-02-01".into()), Some("1000".into())).unwrap();
    assert_eq!(by_no.len(), 1);
    let by_street =
        ops::report_aging(&conn, Some("2026-02-01".into()), Some("QUAIL".into())).unwrap();
    assert_eq!(by_street.len(), 1);
    let by_city =
        ops::report_aging(&conn, Some("2026-02-01".into()), Some("NEWPORT".into())).unwrap();
    assert_eq!(by_city.len(), 1);
    let miss =
        ops::report_aging(&conn, Some("2026-02-01".into()), Some("NOPE".into())).unwrap();
    assert!(miss.is_empty());
    let by_qmark =
        ops::report_aging(&conn, Some("2026-02-01".into()), Some("?".into())).unwrap();
    assert_eq!(by_qmark.len(), 1);
    assert_eq!(by_qmark[0].open_bal, 150.0);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn report_sales_analysis_lists_open_invoices() {
    let (dir, mut conn) = temp_conn("sales");
    seed_company(&conn);
    ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: blank_invoice(),
            lines: vec![line(250.0)],
        },
    )
    .unwrap();

    let rows = ops::report_sales_analysis(
        &conn,
        &ListParams {
            search: None,
            company_no: Some("1000".into()),
            pro_no: None,
            from_date: Some("2026-01-01".into()),
            to_date: Some("2026-12-31".into()),
            include_voided: None,
            limit: None,
            offset: None,
            sort: None,
            paint_supply_co: None,
        },
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].invoice, 1);
    assert_eq!(rows[0].sales_amount, 250.0);

    let by_name = ops::report_sales_analysis(
        &conn,
        &ListParams {
            search: None,
            company_no: Some("ACME".into()),
            pro_no: None,
            from_date: Some("2026-01-01".into()),
            to_date: Some("2026-12-31".into()),
            include_voided: None,
            limit: None,
            offset: None,
            sort: None,
            paint_supply_co: None,
        },
    )
    .unwrap();
    assert_eq!(by_name.len(), 1);
    assert_eq!(by_name[0].company_no, "1000");

    let miss = ops::report_sales_analysis(
        &conn,
        &ListParams {
            search: None,
            company_no: Some("NOPE".into()),
            pro_no: None,
            from_date: None,
            to_date: None,
            include_voided: None,
            limit: None,
            offset: None,
            sort: None,
            paint_supply_co: None,
        },
    )
    .unwrap();
    assert!(miss.is_empty());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn deposit_and_cash_combine_for_balance() {
    let (dir, mut conn) = temp_conn("deposit");
    seed_company(&conn);
    let mut inv = blank_invoice();
    inv.sales_pay = 50.0;
    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: inv,
            lines: vec![line(250.0)],
        },
    )
    .unwrap();
    let (sb, bal): (f64, f64) = conn
        .query_row(
            "SELECT sales_bal, balance FROM invoices WHERE invoice=?",
            params![inv_no],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(sb, 200.0);
    assert_eq!(bal, 200.0);

    ops::save_cash_receipt(
        &mut conn,
        CashReceipt {
            id: None,
            company_no: "1000".into(),
            sales_date: "2026-01-15".into(),
            invoice: inv_no,
            payment: 75.5,
            pay_ref_no: "CHK".into(),
            pay_date: "2026-01-20".into(),
            voided: false,
            company_name: None,
        },
    )
    .unwrap();
    let bal: f64 = conn
        .query_row(
            "SELECT balance FROM invoices WHERE invoice=?",
            params![inv_no],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(bal, 124.5);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn voided_invoices_excluded_from_aging_and_sales() {
    let (dir, mut conn) = temp_conn("void_excl");
    seed_company(&conn);
    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: blank_invoice(),
            lines: vec![line(99.0)],
        },
    )
    .unwrap();
    ops::void_invoice(&conn, "1000", "01", "2026-01-15", inv_no).unwrap();

    let aging = ops::report_aging(&conn, Some("2026-02-01".into()), None).unwrap();
    assert!(aging.is_empty() || aging.iter().all(|r| r.open_bal < 0.01));

    let sales = ops::report_sales_analysis(
        &conn,
        &ListParams {
            search: None,
            company_no: Some("1000".into()),
            pro_no: None,
            from_date: None,
            to_date: None,
            include_voided: None,
            limit: None,
            offset: None,
            sort: None,
            paint_supply_co: None,
        },
    )
    .unwrap();
    assert!(sales.is_empty());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn report_worker_wages_includes_emp_lines() {
    let (dir, mut conn) = temp_conn("wages");
    seed_company(&conn);
    conn.execute(
        "INSERT INTO employees (emp_no, name) VALUES (?1, ?2)",
        params!["E1", "Pat Worker"],
    )
    .unwrap();

    let mut ln = line(200.0);
    ln.emp_no = "E1".into();
    ln.commission = 50.0;
    ln.emp_price = 0.0; // save_invoice computes from commission
    ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: blank_invoice(),
            lines: vec![ln],
        },
    )
    .unwrap();

    let rows = ops::report_worker_wages(
        &conn,
        &ListParams {
            search: Some("E1".into()),
            company_no: None,
            pro_no: None,
            from_date: None,
            to_date: None,
            include_voided: None,
            limit: None,
            offset: None,
            sort: None,
            paint_supply_co: None,
        },
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].emp_no, "E1");
    assert_eq!(rows[0].emp_name, "Pat Worker");
    assert_eq!(rows[0].wages, 100.0); // 200 * 50%

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn delete_cash_receipt_voids_and_restores_balance() {
    let (dir, mut conn) = temp_conn("del_cash");
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
            pay_ref_no: "CHK".into(),
            pay_date: "2026-01-20".into(),
            voided: false,
            company_name: None,
        },
    )
    .unwrap();
    let id: i64 = conn
        .query_row(
            "SELECT id FROM cash_receipts WHERE invoice=?",
            params![inv_no],
            |r| r.get(0),
        )
        .unwrap();

    ops::delete_cash_receipt(&mut conn, id).unwrap();

    let (pay, bal, voided): (f64, f64, i64) = conn
        .query_row(
            "SELECT i.pay_total, i.balance, c.voided
             FROM invoices i JOIN cash_receipts c ON c.id=?
             WHERE i.invoice=?",
            params![id, inv_no],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(voided, 1);
    assert_eq!(pay, 0.0);
    assert_eq!(bal, 250.0);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn overpayment_allowed_negative_balance() {
    let (dir, mut conn) = temp_conn("overpay");
    seed_company(&conn);
    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: blank_invoice(),
            lines: vec![line(100.0)],
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
            payment: 125.0,
            pay_ref_no: "OVR".into(),
            pay_date: "2026-01-20".into(),
            voided: false,
            company_name: None,
        },
    )
    .unwrap();
    let bal: f64 = conn
        .query_row(
            "SELECT balance FROM invoices WHERE invoice=?",
            params![inv_no],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(bal, -25.0);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn two_receipts_sum_to_pay_total() {
    let (dir, mut conn) = temp_conn("two_rcpt");
    seed_company(&conn);
    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: blank_invoice(),
            lines: vec![line(500.0)],
        },
    )
    .unwrap();
    for (amt, r) in [(100.0, "A"), (150.5, "B")] {
        ops::save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: None,
                company_no: "1000".into(),
                sales_date: "2026-01-15".into(),
                invoice: inv_no,
                payment: amt,
                pay_ref_no: r.into(),
                pay_date: "2026-01-20".into(),
                voided: false,
                company_name: None,
            },
        )
        .unwrap();
    }
    let (pay, bal): (f64, f64) = conn
        .query_row(
            "SELECT pay_total, balance FROM invoices WHERE invoice=?",
            params![inv_no],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(pay, 250.5);
    assert_eq!(bal, 249.5);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn list_cash_receipts_matches_property_address() {
    let (dir, mut conn) = temp_conn("cash_addr");
    seed_company(&conn);
    conn.execute(
        "UPDATE properties SET street='1105 QUAIL ST.', city='NEWPORT BEACH', zip='92660' WHERE company_no='1000' AND pro_no='01'",
        [],
    )
    .unwrap();
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
            payment: 80.0,
            pay_ref_no: "CHK".into(),
            pay_date: "2026-01-20".into(),
            voided: false,
            company_name: None,
        },
    )
    .unwrap();

    let empty = ListParams {
        search: None,
        company_no: None,
        pro_no: None,
        from_date: None,
        to_date: None,
        include_voided: None,
        limit: None,
        offset: None,
        sort: None,
        paint_supply_co: None,
    };
    let by_street = ops::list_cash_receipts(
        &conn,
        &ListParams {
            search: Some("QUAIL".into()),
            ..empty.clone()
        },
    )
    .unwrap();
    assert_eq!(by_street.len(), 1);
    assert_eq!(by_street[0].invoice, inv_no);

    let by_city = ops::list_cash_receipts(
        &conn,
        &ListParams {
            search: Some("NEWPORT".into()),
            ..empty.clone()
        },
    )
    .unwrap();
    assert_eq!(by_city.len(), 1);

    let miss = ops::list_cash_receipts(
        &conn,
        &ListParams {
            search: Some("NOPE".into()),
            ..empty
        },
    )
    .unwrap();
    assert!(miss.is_empty());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn report_paint_usage_filters_by_supply_work_date_and_person() {
    let (dir, mut conn) = temp_conn("paint_usage");
    seed_company(&conn);

    let mut inv = blank_invoice();
    inv.material_cost = 40.0;
    inv.paint_supply_co = "Dunn-Edwards".into();

    let mut jose = line(150.0);
    jose.emp_no = "Jose Ramirez".into();
    jose.work_date = Some("2026-01-20".into());

    let mut jose_dup = line(25.0);
    jose_dup.line_no = 2;
    jose_dup.emp_no = "Jose Ramirez".into();
    jose_dup.work_date = Some("2026-01-20".into());

    let mut maria = line(80.0);
    maria.line_no = 3;
    maria.emp_no = "Maria Lopez".into();
    maria.work_date = Some("2026-01-22".into());

    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: inv,
            lines: vec![jose, jose_dup, maria],
        },
    )
    .unwrap();

    let mut other = blank_invoice();
    other.material_cost = 12.0;
    other.paint_supply_co = "Sherwin-Williams".into();
    let mut pat = line(90.0);
    pat.emp_no = "Pat Worker".into();
    pat.work_date = Some("2026-02-05".into());
    ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: other,
            lines: vec![pat],
        },
    )
    .unwrap();

    let by_supply = ops::report_paint_usage(
        &conn,
        &ListParams {
            paint_supply_co: Some("Dunn".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(by_supply.len(), 1);
    assert_eq!(by_supply[0].invoice, inv_no);
    assert_eq!(by_supply[0].work_person, "Jose Ramirez");
    assert_eq!(by_supply[0].paint_supply_co, "Dunn-Edwards");
    assert!((by_supply[0].material_cost - 40.0).abs() < 0.01);
    assert!((by_supply[0].invoice_total - 255.0).abs() < 0.01);

    let by_person = ops::report_paint_usage(
        &conn,
        &ListParams {
            search: Some("jose".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(by_person.len(), 1);
    assert_eq!(by_person[0].work_person, "Jose Ramirez");
    assert_eq!(by_person[0].work_date, "2026-01-20");

    let by_person_case = ops::report_paint_usage(
        &conn,
        &ListParams {
            search: Some("JOSE RAMIREZ".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(by_person_case.len(), 1);
    assert_eq!(by_person_case[0].invoice, inv_no);

    let by_work_date = ops::report_paint_usage(
        &conn,
        &ListParams {
            from_date: Some("2026-01-21".into()),
            to_date: Some("2026-01-31".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(by_work_date.len(), 1);
    assert_eq!(by_work_date[0].invoice, inv_no);
    assert_eq!(by_work_date[0].work_person, "Jose Ramirez");
    assert_eq!(by_work_date[0].work_date, "2026-01-22");

    let miss_person = ops::report_paint_usage(
        &conn,
        &ListParams {
            search: Some("Nobody".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(miss_person.is_empty());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn report_payroll_filters_by_invoice_date_and_work_person() {
    let (dir, mut conn) = temp_conn("payroll");
    seed_company(&conn);

    let mut inv = blank_invoice();
    inv.material_cost = 40.0;
    inv.sales_unit = "A1".into();
    let mut jose = line(250.0);
    jose.emp_no = "Jose Ramirez".into();
    let inv_no = ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: inv,
            lines: vec![jose],
        },
    )
    .unwrap();

    let mut other = blank_invoice();
    other.sales_date = "2026-02-01".into();
    other.material_cost = 12.0;
    let mut pat = line(90.0);
    pat.emp_no = "Pat Worker".into();
    pat.sales_date = "2026-02-01".into();
    ops::save_invoice(
        &mut conn,
        InvoiceWithLines {
            invoice: other,
            lines: vec![pat],
        },
    )
    .unwrap();

    let by_person = ops::report_payroll(
        &conn,
        &ListParams {
            search: Some("jose".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(by_person.len(), 1);
    assert_eq!(by_person[0].invoice, inv_no);
    assert_eq!(by_person[0].sales_date, "2026-01-15");
    assert_eq!(by_person[0].sales_unit, "A1");
    assert_eq!(by_person[0].property_address, "1105 QUAIL ST.");
    assert_eq!(by_person[0].job_description, "Paint");
    assert!((by_person[0].material_cost - 40.0).abs() < 0.01);
    assert!((by_person[0].invoice_total - 250.0).abs() < 0.01);

    let by_date = ops::report_payroll(
        &conn,
        &ListParams {
            from_date: Some("2026-01-01".into()),
            to_date: Some("2026-01-31".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(by_date.len(), 1);
    assert_eq!(by_date[0].invoice, inv_no);

    let miss = ops::report_payroll(
        &conn,
        &ListParams {
            search: Some("Nobody".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(miss.is_empty());

    let _ = std::fs::remove_dir_all(&dir);
}
