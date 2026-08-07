//! Connection-level business operations (testable without Tauri State).
//!
//! Money model (matches original PROMAS / Clipper SALES2 fields):
//!   sales_total  = Σ line.price
//!   sales_pay    = deposit on the invoice
//!   sales_bal    = sales_total − sales_pay          (amount after deposit)
//!   pay_total    = Σ cash_receipts.payment (voided=0)
//!   balance      = sales_bal − pay_total            (open AR)
//!
//! Worker wages (SALES1):
//!   emp_price    = line.price × commission ÷ 100    (rounded to cents)

use crate::models::*;
use rusqlite::{params, Connection};

fn map_err(e: impl ToString) -> String {
    e.to_string()
}

/// Round to cents (banker's? no — half-away-from-zero via f64 round).
pub fn money2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Compute wage amount for a line.
pub fn calc_emp_price(price: f64, commission_pct: f64) -> f64 {
    money2(price * commission_pct / 100.0)
}

/// Recompute header money fields from lines + deposit + receipts already on file.
pub fn recompute_invoice_totals(
    lines: &[InvoiceLine],
    sales_pay: f64,
    pay_total: f64,
) -> (f64, f64, f64, f64) {
    let sales_total = money2(lines.iter().map(|l| l.price).sum::<f64>());
    let sales_pay = money2(sales_pay.max(0.0));
    let pay_total = money2(pay_total.max(0.0));
    let sales_bal = money2(sales_total - sales_pay);
    let balance = money2(sales_bal - pay_total);
    (sales_total, sales_pay, sales_bal, balance)
}

fn sum_receipts_for_invoice(
    tx: &rusqlite::Transaction<'_>,
    company_no: &str,
    invoice: i64,
) -> Result<f64, String> {
    let pay: f64 = tx
        .query_row(
            "SELECT COALESCE(SUM(payment),0) FROM cash_receipts \
             WHERE company_no=? AND invoice=? AND voided=0",
            params![company_no, invoice],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    Ok(money2(pay))
}

/// Apply pay_total + balance on every invoice row for this company+invoice#.
fn apply_pay_total_to_invoices(
    tx: &rusqlite::Transaction<'_>,
    company_no: &str,
    invoice: i64,
    pay_total: f64,
) -> Result<(), String> {
    tx.execute(
        "UPDATE invoices SET pay_total=?, balance=ROUND((sales_bal - ?) * 100) / 100 \
         WHERE company_no=? AND invoice=?",
        params![pay_total, pay_total, company_no, invoice],
    )
    .map_err(map_err)?;
    Ok(())
}

pub fn save_invoice(conn: &mut Connection, data: InvoiceWithLines) -> Result<i64, String> {
    let tx = conn.transaction().map_err(map_err)?;
    let mut inv = data.invoice;

    if inv.invoice == 0 {
        let next: i64 = tx
            .query_row(
                "SELECT next_invoice FROM sysdata WHERE id=1",
                [],
                |r| r.get(0),
            )
            .map_err(map_err)?;
        inv.invoice = next;
        tx.execute(
            "UPDATE sysdata SET next_invoice=? WHERE id=1",
            params![next + 1],
        )
        .map_err(map_err)?;
    }

    // Always recompute payments from the ledger — never trust client pay_total.
    let pay_total = sum_receipts_for_invoice(&tx, &inv.company_no, inv.invoice)?;
    let (sales_total, sales_pay, sales_bal, balance) =
        recompute_invoice_totals(&data.lines, inv.sales_pay, pay_total);
    inv.sales_total = sales_total;
    inv.sales_pay = sales_pay;
    inv.sales_bal = sales_bal;
    inv.pay_total = pay_total;
    inv.balance = balance;

    tx.execute(
        r#"INSERT INTO invoices
           (company_no,pro_no,sales_date,invoice,order_no,order_date,order_man,sales_unit,sales_size,
            sales_total,sales_pay,sales_bal,pay_total,balance,sales_term,sales_due,cust_po_no,
            discount_on,discount,deposit_ref,remark1,remark2,status,voided)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(company_no,pro_no,sales_date,invoice) DO UPDATE SET
             order_no=excluded.order_no,order_date=excluded.order_date,order_man=excluded.order_man,
             sales_unit=excluded.sales_unit,sales_size=excluded.sales_size,sales_total=excluded.sales_total,
             sales_pay=excluded.sales_pay,sales_bal=excluded.sales_bal,pay_total=excluded.pay_total,
             balance=excluded.balance,sales_term=excluded.sales_term,sales_due=excluded.sales_due,
             cust_po_no=excluded.cust_po_no,discount_on=excluded.discount_on,discount=excluded.discount,
             deposit_ref=excluded.deposit_ref,remark1=excluded.remark1,remark2=excluded.remark2,
             status=excluded.status,voided=excluded.voided"#,
        params![
            inv.company_no,
            inv.pro_no,
            inv.sales_date,
            inv.invoice,
            inv.order_no,
            inv.order_date,
            inv.order_man,
            inv.sales_unit,
            inv.sales_size,
            inv.sales_total,
            inv.sales_pay,
            inv.sales_bal,
            inv.pay_total,
            inv.balance,
            inv.sales_term,
            inv.sales_due,
            inv.cust_po_no,
            inv.discount_on,
            inv.discount,
            inv.deposit_ref,
            inv.remark1,
            inv.remark2,
            inv.status,
            if inv.voided { 1 } else { 0 },
        ],
    )
    .map_err(map_err)?;

    tx.execute(
        "DELETE FROM invoice_lines WHERE company_no=? AND pro_no=? AND sales_date=? AND invoice=?",
        params![inv.company_no, inv.pro_no, inv.sales_date, inv.invoice],
    )
    .map_err(map_err)?;

    for (i, line) in data.lines.iter().enumerate() {
        let line_no = if line.line_no > 0 {
            line.line_no
        } else {
            (i + 1) as i64
        };
        let commission = if line.commission > 0.0 {
            line.commission
        } else {
            0.0
        };
        // Always derive wages from price × rate (matches PROMAS empprice).
        let emp_price = calc_emp_price(line.price, commission);
        let price = money2(line.price);
        tx.execute(
            r#"INSERT INTO invoice_lines
               (company_no,pro_no,sales_date,invoice,line_no,code_no,description,work_date,
                work_type,price,emp_no,emp_price,commission,status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            params![
                inv.company_no,
                inv.pro_no,
                inv.sales_date,
                inv.invoice,
                line_no,
                line.code_no,
                line.description,
                line.work_date,
                line.work_type,
                price,
                line.emp_no,
                emp_price,
                commission,
                line.status,
            ],
        )
        .map_err(map_err)?;
    }

    let invoice_no = inv.invoice;
    tx.commit().map_err(map_err)?;
    Ok(invoice_no)
}

pub fn void_invoice(
    conn: &Connection,
    company_no: &str,
    pro_no: &str,
    sales_date: &str,
    invoice: i64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE invoices SET voided=1, status='V' WHERE company_no=? AND pro_no=? AND sales_date=? AND invoice=?",
        params![company_no, pro_no, sales_date, invoice],
    )
    .map_err(map_err)?;
    Ok(())
}

pub fn save_cash_receipt(conn: &mut Connection, receipt: CashReceipt) -> Result<(), String> {
    let tx = conn.transaction().map_err(map_err)?;
    let payment = money2(receipt.payment);

    if payment < 0.0 {
        return Err("Payment cannot be negative".into());
    }

    if let Some(id) = receipt.id {
        tx.execute(
            r#"UPDATE cash_receipts SET company_no=?,sales_date=?,invoice=?,payment=?,pay_ref_no=?,pay_date=?,voided=?
               WHERE id=?"#,
            params![
                receipt.company_no,
                receipt.sales_date,
                receipt.invoice,
                payment,
                receipt.pay_ref_no,
                receipt.pay_date,
                if receipt.voided { 1 } else { 0 },
                id
            ],
        )
        .map_err(map_err)?;
    } else {
        tx.execute(
            r#"INSERT INTO cash_receipts (company_no,sales_date,invoice,payment,pay_ref_no,pay_date,voided)
               VALUES (?,?,?,?,?,?,?)"#,
            params![
                receipt.company_no,
                receipt.sales_date,
                receipt.invoice,
                payment,
                receipt.pay_ref_no,
                receipt.pay_date,
                if receipt.voided { 1 } else { 0 },
            ],
        )
        .map_err(map_err)?;
    }

    let pay_total = sum_receipts_for_invoice(&tx, &receipt.company_no, receipt.invoice)?;
    apply_pay_total_to_invoices(&tx, &receipt.company_no, receipt.invoice, pay_total)?;

    tx.commit().map_err(map_err)?;
    Ok(())
}

pub fn delete_cash_receipt(conn: &mut Connection, id: i64) -> Result<(), String> {
    let tx = conn.transaction().map_err(map_err)?;

    let (company_no, invoice): (String, i64) = tx
        .query_row(
            "SELECT company_no, invoice FROM cash_receipts WHERE id=?",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(map_err)?;

    tx.execute(
        "UPDATE cash_receipts SET voided=1 WHERE id=?",
        params![id],
    )
    .map_err(map_err)?;

    let pay_total = sum_receipts_for_invoice(&tx, &company_no, invoice)?;
    apply_pay_total_to_invoices(&tx, &company_no, invoice, pay_total)?;

    tx.commit().map_err(map_err)?;
    Ok(())
}

pub fn report_sales_analysis(
    conn: &Connection,
    params: &ListParams,
) -> Result<Vec<SalesAnalysisRow>, String> {
    let from_date = params.from_date.clone().unwrap_or_default();
    let to_date = params.to_date.clone().unwrap_or_default();
    let company_no = params.company_no.clone().unwrap_or_default();

    let mut stmt = conn
        .prepare(
            r#"SELECT sales_date,invoice,company_no,pro_no,sales_total,sales_pay,sales_bal,pay_total,balance
               FROM invoices
               WHERE voided=0
                 AND (?1='' OR company_no=?1)
                 AND (?2='' OR sales_date>=?2)
                 AND (?3='' OR sales_date<=?3)
               ORDER BY sales_date, invoice"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![company_no, from_date, to_date], |r| {
            Ok(SalesAnalysisRow {
                sales_date: r.get(0)?,
                invoice: r.get(1)?,
                company_no: r.get(2)?,
                pro_no: r.get(3)?,
                sales_amount: r.get(4)?,
                deposit: r.get(5)?,
                sales_bal: r.get(6)?,
                pay_total: r.get(7)?,
                balance: r.get(8)?,
            })
        })
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn report_worker_wages(
    conn: &Connection,
    params: &ListParams,
) -> Result<Vec<WorkerWageRow>, String> {
    let from_date = params.from_date.clone().unwrap_or_default();
    let to_date = params.to_date.clone().unwrap_or_default();
    let search = params.search.clone().unwrap_or_default();

    let mut stmt = conn
        .prepare(
            r#"SELECT l.emp_no, COALESCE(e.name,''), l.work_date, l.sales_date, l.invoice,
               l.company_no, l.pro_no, l.price, l.commission,
               CASE WHEN l.emp_price IS NOT NULL AND l.emp_price != 0
                    THEN l.emp_price
                    ELSE ROUND(l.price * l.commission / 100.0, 2)
               END,
               l.description
               FROM invoice_lines l
               LEFT JOIN employees e ON e.emp_no=l.emp_no
               JOIN invoices i ON i.company_no=l.company_no AND i.pro_no=l.pro_no
                 AND i.sales_date=l.sales_date AND i.invoice=l.invoice
               WHERE i.voided=0 AND TRIM(l.emp_no) != ''
                 AND (?1='' OR COALESCE(l.work_date, l.sales_date)>=?1)
                 AND (?2='' OR COALESCE(l.work_date, l.sales_date)<=?2)
                 AND (?3='' OR l.emp_no=?3)
               ORDER BY l.emp_no, COALESCE(l.work_date, l.sales_date), l.invoice"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![from_date, to_date, search], |r| {
            Ok(WorkerWageRow {
                emp_no: r.get(0)?,
                emp_name: r.get(1)?,
                work_date: r.get(2)?,
                inv_date: r.get(3)?,
                invoice: r.get(4)?,
                company_no: r.get(5)?,
                pro_no: r.get(6)?,
                inv_amount: r.get(7)?,
                rate: r.get(8)?,
                wages: r.get(9)?,
                description: r.get(10)?,
            })
        })
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

// ─── Work orders ───────────────────────────────────────────────────────

pub fn save_work_order(conn: &mut Connection, data: WorkOrderWithLines) -> Result<i64, String> {
    let tx = conn.transaction().map_err(map_err)?;
    let mut order = data.order;

    if order.order_no == 0 {
        let next: i64 = tx
            .query_row("SELECT next_order FROM sysdata WHERE id=1", [], |r| r.get(0))
            .map_err(map_err)?;
        order.order_no = next;
        tx.execute(
            "UPDATE sysdata SET next_order=? WHERE id=1",
            params![next + 1],
        )
        .map_err(map_err)?;
    }

    tx.execute(
        r#"INSERT INTO work_orders
           (company_no,pro_no,order_date,order_no,work_date,order_unit,order_size,
            order_man,order_by,cust_po_no,remark1,remark2,status,voided)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(company_no,pro_no,order_date,order_no) DO UPDATE SET
             work_date=excluded.work_date,order_unit=excluded.order_unit,order_size=excluded.order_size,
             order_man=excluded.order_man,order_by=excluded.order_by,cust_po_no=excluded.cust_po_no,
             remark1=excluded.remark1,remark2=excluded.remark2,status=excluded.status,voided=excluded.voided"#,
        params![
            order.company_no,
            order.pro_no,
            order.order_date,
            order.order_no,
            order.work_date,
            order.order_unit,
            order.order_size,
            order.order_man,
            order.order_by,
            order.cust_po_no,
            order.remark1,
            order.remark2,
            order.status,
            if order.voided { 1 } else { 0 },
        ],
    )
    .map_err(map_err)?;

    tx.execute(
        "DELETE FROM work_order_lines WHERE company_no=? AND pro_no=? AND order_date=? AND order_no=?",
        params![order.company_no, order.pro_no, order.order_date, order.order_no],
    )
    .map_err(map_err)?;

    for (i, line) in data.lines.iter().enumerate() {
        let line_no = if line.line_no > 0 {
            line.line_no
        } else {
            (i + 1) as i64
        };
        tx.execute(
            r#"INSERT INTO work_order_lines
               (company_no,pro_no,order_date,order_no,line_no,code_no,description,work_type,price)
               VALUES (?,?,?,?,?,?,?,?,?)"#,
            params![
                order.company_no,
                order.pro_no,
                order.order_date,
                order.order_no,
                line_no,
                line.code_no,
                line.description,
                line.work_type,
                money2(line.price),
            ],
        )
        .map_err(map_err)?;
    }

    let order_no = order.order_no;
    tx.commit().map_err(map_err)?;
    Ok(order_no)
}

pub fn void_work_order(
    conn: &Connection,
    company_no: &str,
    pro_no: &str,
    order_date: &str,
    order_no: i64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE work_orders SET voided=1, status='V' WHERE company_no=? AND pro_no=? AND order_date=? AND order_no=?",
        params![company_no, pro_no, order_date, order_no],
    )
    .map_err(map_err)?;
    Ok(())
}

pub fn get_work_order(
    conn: &Connection,
    company_no: &str,
    pro_no: &str,
    order_date: &str,
    order_no: i64,
) -> Result<Option<WorkOrderWithLines>, String> {
    use rusqlite::OptionalExtension;
    let order = conn
        .query_row(
            r#"SELECT w.company_no,w.pro_no,w.order_date,w.order_no,w.work_date,w.order_unit,w.order_size,
               w.order_man,w.order_by,w.cust_po_no,w.remark1,w.remark2,w.status,w.voided,c.name,p.name
               FROM work_orders w
               LEFT JOIN companies c ON c.company_no=w.company_no
               LEFT JOIN properties p ON p.company_no=w.company_no AND p.pro_no=w.pro_no
               WHERE w.company_no=? AND w.pro_no=? AND w.order_date=? AND w.order_no=?"#,
            params![company_no, pro_no, order_date, order_no],
            |r| {
                Ok(WorkOrder {
                    company_no: r.get(0)?,
                    pro_no: r.get(1)?,
                    order_date: r.get(2)?,
                    order_no: r.get(3)?,
                    work_date: r.get(4)?,
                    order_unit: r.get(5)?,
                    order_size: r.get(6)?,
                    order_man: r.get(7)?,
                    order_by: r.get(8)?,
                    cust_po_no: r.get(9)?,
                    remark1: r.get(10)?,
                    remark2: r.get(11)?,
                    status: r.get(12)?,
                    voided: r.get::<_, i64>(13)? != 0,
                    company_name: r.get(14)?,
                    property_name: r.get(15)?,
                })
            },
        )
        .optional()
        .map_err(map_err)?;

    let Some(order) = order else {
        return Ok(None);
    };

    let mut stmt = conn
        .prepare(
            r#"SELECT id,company_no,pro_no,order_date,order_no,line_no,code_no,description,work_type,price
               FROM work_order_lines
               WHERE company_no=? AND pro_no=? AND order_date=? AND order_no=?
               ORDER BY line_no"#,
        )
        .map_err(map_err)?;
    let lines = stmt
        .query_map(
            params![
                order.company_no,
                order.pro_no,
                order.order_date,
                order.order_no
            ],
            |r| {
                Ok(WorkOrderLine {
                    id: r.get(0)?,
                    company_no: r.get(1)?,
                    pro_no: r.get(2)?,
                    order_date: r.get(3)?,
                    order_no: r.get(4)?,
                    line_no: r.get(5)?,
                    code_no: r.get(6)?,
                    description: r.get(7)?,
                    work_type: r.get(8)?,
                    price: r.get(9)?,
                })
            },
        )
        .map_err(map_err)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Some(WorkOrderWithLines { order, lines }))
}

pub fn find_work_order(
    conn: &Connection,
    company_no: &str,
    pro_no: &str,
    order_no: i64,
) -> Result<Option<WorkOrderWithLines>, String> {
    use rusqlite::OptionalExtension;
    let key: Option<(String, String, String, i64)> = conn
        .query_row(
            r#"SELECT company_no,pro_no,order_date,order_no FROM work_orders
               WHERE company_no=? AND pro_no=? AND order_no=?
               ORDER BY order_date DESC LIMIT 1"#,
            params![company_no, pro_no, order_no],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(map_err)?
        .or_else(|| {
            conn.query_row(
                r#"SELECT company_no,pro_no,order_date,order_no FROM work_orders
                   WHERE company_no=? AND order_no=?
                   ORDER BY order_date DESC LIMIT 1"#,
                params![company_no, order_no],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .ok()
            .flatten()
        });
    match key {
        Some((c, p, d, n)) => get_work_order(conn, &c, &p, &d, n),
        None => Ok(None),
    }
}

pub fn report_aging(
    conn: &Connection,
    as_of: Option<String>,
) -> Result<Vec<AgingRow>, String> {
    let as_of = as_of.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());

    // Age from invoice date (original invoice register / aging used Inv_Date).
    // Buckets: Current (0–30), >30 (31–60), >60 (61–90), >90 (91–120), >120.
    let mut stmt = conn
        .prepare(
            r#"SELECT i.company_no, COALESCE(c.name,''), COALESCE(c.phone,''),
               SUM(CASE WHEN CAST(julianday(?1)-julianday(i.sales_date) AS INTEGER) <= 30 THEN i.balance ELSE 0 END),
               SUM(CASE WHEN CAST(julianday(?1)-julianday(i.sales_date) AS INTEGER) BETWEEN 31 AND 60 THEN i.balance ELSE 0 END),
               SUM(CASE WHEN CAST(julianday(?1)-julianday(i.sales_date) AS INTEGER) BETWEEN 61 AND 90 THEN i.balance ELSE 0 END),
               SUM(CASE WHEN CAST(julianday(?1)-julianday(i.sales_date) AS INTEGER) BETWEEN 91 AND 120 THEN i.balance ELSE 0 END),
               SUM(CASE WHEN CAST(julianday(?1)-julianday(i.sales_date) AS INTEGER) > 120 THEN i.balance ELSE 0 END),
               SUM(i.balance)
               FROM invoices i
               LEFT JOIN companies c ON c.company_no=i.company_no
               WHERE i.voided=0 AND i.balance > 0.0005
               GROUP BY i.company_no
               ORDER BY i.company_no"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![as_of], |r| {
            Ok(AgingRow {
                company_no: r.get(0)?,
                company_name: r.get(1)?,
                phone: r.get(2)?,
                current: r.get(3)?,
                days_30: r.get(4)?,
                days_60: r.get(5)?,
                days_90: r.get(6)?,
                days_120: r.get(7)?,
                open_bal: r.get(8)?,
            })
        })
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_and_migrate;

    fn tmp_conn() -> (Connection, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!(
            "promas_ops_{}_{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&path);
        let conn = open_and_migrate(&path).unwrap();
        (conn, path)
    }

    fn sample_line(price: f64, commission: f64, emp: &str) -> InvoiceLine {
        InvoiceLine {
            id: None,
            company_no: "1000".into(),
            pro_no: "100".into(),
            sales_date: "2020-01-15".into(),
            invoice: 0,
            line_no: 0, // 0 → auto-assign 1..n on save
            code_no: "*".into(),
            description: "Paint walls".into(),
            work_date: Some("2020-01-15".into()),
            work_type: "P".into(),
            price,
            emp_no: emp.into(),
            emp_price: 0.0,
            commission,
            status: "".into(),
        }
    }

    fn sample_invoice(lines: Vec<InvoiceLine>, deposit: f64) -> InvoiceWithLines {
        InvoiceWithLines {
            invoice: Invoice {
                company_no: "1000".into(),
                pro_no: "100".into(),
                sales_date: "2020-01-15".into(),
                invoice: 0,
                order_no: 0,
                order_date: None,
                order_man: "MGR".into(),
                sales_unit: "101".into(),
                sales_size: "1+1".into(),
                sales_total: 0.0,
                sales_pay: deposit,
                sales_bal: 0.0,
                pay_total: 0.0,
                balance: 0.0,
                sales_term: "Net  7 Days".into(),
                sales_due: Some("2020-01-22".into()),
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
            },
            lines,
        }
    }

    #[test]
    fn money2_rounds_half_up() {
        assert_eq!(money2(10.005), 10.01);
        assert_eq!(money2(10.004), 10.0);
        assert_eq!(money2(65.0 * 0.65), 42.25); // wait 42.25
        assert_eq!(calc_emp_price(100.0, 65.0), 65.0);
        assert_eq!(calc_emp_price(270.0, 65.0), 175.5);
        assert_eq!(calc_emp_price(75.0, 65.0), 48.75);
    }

    #[test]
    fn recompute_totals_matches_promas_model() {
        let lines = vec![
            sample_line(270.0, 65.0, "400"),
            sample_line(75.0, 65.0, "400"),
            sample_line(100.0, 65.0, "400"),
        ];
        // total 445, deposit 50 → bal 395; paid 100 → open 295
        let (st, sp, sb, bal) = recompute_invoice_totals(&lines, 50.0, 100.0);
        assert_eq!(st, 445.0);
        assert_eq!(sp, 50.0);
        assert_eq!(sb, 395.0);
        assert_eq!(bal, 295.0);
    }

    #[test]
    fn save_invoice_computes_totals_and_wages() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        let data = sample_invoice(
            vec![
                sample_line(270.0, 65.0, "400"),
                sample_line(75.0, 65.0, "400"),
            ],
            45.0,
        );
        let inv_no = save_invoice(&mut conn, data).unwrap();
        assert!(inv_no > 0);

        let (st, sp, sb, pt, bal): (f64, f64, f64, f64, f64) = conn
            .query_row(
                "SELECT sales_total,sales_pay,sales_bal,pay_total,balance FROM invoices WHERE invoice=?",
                params![inv_no],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap();
        assert_eq!(st, 345.0);
        assert_eq!(sp, 45.0);
        assert_eq!(sb, 300.0);
        assert_eq!(pt, 0.0);
        assert_eq!(bal, 300.0);

        let wages: f64 = conn
            .query_row(
                "SELECT SUM(emp_price) FROM invoice_lines WHERE invoice=?",
                params![inv_no],
                |r| r.get(0),
            )
            .unwrap();
        // 270*0.65 + 75*0.65 = 175.5 + 48.75 = 224.25
        assert_eq!(wages, 224.25);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn cash_receipt_updates_balance() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        let inv_no = save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(200.0, 65.0, "105")], 0.0),
        )
        .unwrap();

        save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: None,
                company_no: "1000".into(),
                sales_date: "2020-01-15".into(),
                invoice: inv_no,
                payment: 75.0,
                pay_ref_no: "CHK1".into(),
                pay_date: "2020-01-20".into(),
                voided: false,
                company_name: None,
            },
        )
        .unwrap();

        let (pt, bal): (f64, f64) = conn
            .query_row(
                "SELECT pay_total, balance FROM invoices WHERE invoice=?",
                params![inv_no],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(pt, 75.0);
        assert_eq!(bal, 125.0);

        // second payment
        save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: None,
                company_no: "1000".into(),
                sales_date: "2020-01-15".into(),
                invoice: inv_no,
                payment: 125.0,
                pay_ref_no: "CHK2".into(),
                pay_date: "2020-01-25".into(),
                voided: false,
                company_name: None,
            },
        )
        .unwrap();
        let (pt, bal): (f64, f64) = conn
            .query_row(
                "SELECT pay_total, balance FROM invoices WHERE invoice=?",
                params![inv_no],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(pt, 200.0);
        assert_eq!(bal, 0.0);

        // void first receipt → pay_total drops
        let id: i64 = conn
            .query_row(
                "SELECT id FROM cash_receipts WHERE pay_ref_no='CHK1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        delete_cash_receipt(&mut conn, id).unwrap();
        let (pt, bal): (f64, f64) = conn
            .query_row(
                "SELECT pay_total, balance FROM invoices WHERE invoice=?",
                params![inv_no],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(pt, 125.0);
        assert_eq!(bal, 75.0);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn save_invoice_preserves_receipts_when_editing_lines() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        let inv_no = save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(100.0, 65.0, "105")], 0.0),
        )
        .unwrap();
        save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: None,
                company_no: "1000".into(),
                sales_date: "2020-01-15".into(),
                invoice: inv_no,
                payment: 40.0,
                pay_ref_no: "X".into(),
                pay_date: "2020-01-20".into(),
                voided: false,
                company_name: None,
            },
        )
        .unwrap();

        // Edit lines, client wrongly sends pay_total=0 — must not wipe receipts
        let mut data = sample_invoice(vec![sample_line(150.0, 65.0, "105")], 10.0);
        data.invoice.invoice = inv_no;
        data.invoice.pay_total = 0.0; // stale client value
        save_invoice(&mut conn, data).unwrap();

        let (st, sp, sb, pt, bal): (f64, f64, f64, f64, f64) = conn
            .query_row(
                "SELECT sales_total,sales_pay,sales_bal,pay_total,balance FROM invoices WHERE invoice=?",
                params![inv_no],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap();
        assert_eq!(st, 150.0);
        assert_eq!(sp, 10.0);
        assert_eq!(sb, 140.0);
        assert_eq!(pt, 40.0); // preserved from cash_receipts
        assert_eq!(bal, 100.0); // 140 - 40

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn deposit_reduces_open_balance_before_cash() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();
        let inv_no = save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(500.0, 65.0, "105")], 100.0),
        )
        .unwrap();
        let (sb, bal): (f64, f64) = conn
            .query_row(
                "SELECT sales_bal, balance FROM invoices WHERE invoice=?",
                params![inv_no],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(sb, 400.0);
        assert_eq!(bal, 400.0);
        save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: None,
                company_no: "1000".into(),
                sales_date: "2020-01-15".into(),
                invoice: inv_no,
                payment: 150.0,
                pay_ref_no: "D".into(),
                pay_date: "2020-01-20".into(),
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
        assert_eq!(bal, 250.0); // 400 - 150
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn reject_negative_payment() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();
        let inv_no = save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(100.0, 65.0, "105")], 0.0),
        )
        .unwrap();
        let err = save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: None,
                company_no: "1000".into(),
                sales_date: "2020-01-15".into(),
                invoice: inv_no,
                payment: -5.0,
                pay_ref_no: "X".into(),
                pay_date: "2020-01-20".into(),
                voided: false,
                company_name: None,
            },
        );
        assert!(err.is_err());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn work_order_save_get_void_find() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        let data = WorkOrderWithLines {
            order: WorkOrder {
                company_no: "1000".into(),
                pro_no: "100".into(),
                order_date: "2020-02-01".into(),
                order_no: 0,
                work_date: Some("2020-02-02".into()),
                order_unit: "12".into(),
                order_size: "2+1".into(),
                order_man: "MGR".into(),
                order_by: "Bob".into(),
                cust_po_no: "PO1".into(),
                remark1: "".into(),
                remark2: "".into(),
                status: "".into(),
                voided: false,
                company_name: None,
                property_name: None,
            },
            lines: vec![
                WorkOrderLine {
                    id: None,
                    company_no: "1000".into(),
                    pro_no: "100".into(),
                    order_date: "2020-02-01".into(),
                    order_no: 0,
                    line_no: 0,
                    code_no: "S".into(),
                    description: "Walls".into(),
                    work_type: "P".into(),
                    price: 100.0,
                },
                WorkOrderLine {
                    id: None,
                    company_no: "1000".into(),
                    pro_no: "100".into(),
                    order_date: "2020-02-01".into(),
                    order_no: 0,
                    line_no: 0,
                    code_no: "*".into(),
                    description: "Ceilings".into(),
                    work_type: "P".into(),
                    price: 50.0,
                },
            ],
        };
        let ono = save_work_order(&mut conn, data).unwrap();
        assert_eq!(ono, 1);

        let full = get_work_order(&conn, "1000", "100", "2020-02-01", 1)
            .unwrap()
            .expect("found");
        assert_eq!(full.lines.len(), 2);
        assert_eq!(full.lines[0].price, 100.0);
        assert_eq!(full.order.order_by, "Bob");

        let found = find_work_order(&conn, "1000", "100", 1)
            .unwrap()
            .expect("find");
        assert_eq!(found.order.order_no, 1);
        assert_eq!(found.lines.len(), 2);

        void_work_order(&conn, "1000", "100", "2020-02-01", 1).unwrap();
        let voided = get_work_order(&conn, "1000", "100", "2020-02-01", 1)
            .unwrap()
            .unwrap();
        assert!(voided.order.voided);
        assert_eq!(voided.order.status, "V");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn auto_apply_multiple_invoices_oldest_first_logic() {
        // Simulate CashProcess auto-receipt: pay 180 across two open invoices
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        let mut a = sample_invoice(vec![sample_line(100.0, 65.0, "105")], 0.0);
        a.invoice.sales_date = "2020-01-01".into();
        let inv1 = save_invoice(&mut conn, a).unwrap();

        let mut b = sample_invoice(vec![sample_line(200.0, 65.0, "105")], 0.0);
        b.invoice.sales_date = "2020-01-10".into();
        for l in &mut b.lines {
            l.sales_date = "2020-01-10".into();
        }
        let inv2 = save_invoice(&mut conn, b).unwrap();

        let mut remaining: f64 = 180.0;
        let open: Vec<(i64, String, f64)> = conn
            .prepare(
                "SELECT invoice, sales_date, balance FROM invoices WHERE voided=0 AND balance>0 ORDER BY sales_date, invoice",
            )
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert_eq!(open[0].0, inv1);
        assert_eq!(open[1].0, inv2);

        for (invoice, sales_date, bal) in open {
            if remaining <= 0.005 {
                break;
            }
            let pay = remaining.min(bal);
            save_cash_receipt(
                &mut conn,
                CashReceipt {
                    id: None,
                    company_no: "1000".into(),
                    sales_date,
                    invoice,
                    payment: pay,
                    pay_ref_no: "AUTO".into(),
                    pay_date: "2020-01-20".into(),
                    voided: false,
                    company_name: None,
                },
            )
            .unwrap();
            remaining = money2(remaining - pay);
        }
        assert_eq!(remaining, 0.0);

        let b1: f64 = conn
            .query_row(
                "SELECT balance FROM invoices WHERE invoice=?",
                params![inv1],
                |r| r.get(0),
            )
            .unwrap();
        let b2: f64 = conn
            .query_row(
                "SELECT balance FROM invoices WHERE invoice=?",
                params![inv2],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(b1, 0.0); // fully paid
        assert_eq!(b2, 120.0); // 200 - 80 remaining after first took 100

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn aging_buckets_sum_to_open_balance() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        // force specific dates via direct insert after save
        let inv_no = save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(100.0, 65.0, "105")], 0.0),
        )
        .unwrap();
        conn.execute(
            "UPDATE invoices SET sales_date='2020-01-01', balance=100.0, sales_bal=100.0 WHERE invoice=?",
            params![inv_no],
        )
        .unwrap();

        let rows = report_aging(&conn, Some("2020-03-15".into())).unwrap();
        assert_eq!(rows.len(), 1);
        let r = &rows[0];
        // days from Jan 1 to Mar 15 = 74 → bucket >60 (61-90)
        assert!((r.days_60 - 100.0).abs() < 0.01);
        assert!((r.open_bal - 100.0).abs() < 0.01);
        assert!((r.current + r.days_30 + r.days_60 + r.days_90 + r.days_120 - r.open_bal).abs() < 0.01);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_cash_receipt_restores_balance() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        let inv = save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(200.0, 65.0, "105")], 0.0),
        )
        .unwrap();
        save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: None,
                company_no: "1000".into(),
                sales_date: "2020-01-15".into(),
                invoice: inv,
                payment: 50.0,
                pay_ref_no: "CHK1".into(),
                pay_date: "2020-01-20".into(),
                voided: false,
                company_name: None,
            },
        )
        .unwrap();

        let id: i64 = conn
            .query_row(
                "SELECT id FROM cash_receipts WHERE invoice=? AND voided=0",
                params![inv],
                |r| r.get(0),
            )
            .unwrap();

        delete_cash_receipt(&mut conn, id).unwrap();

        let (pay_total, balance, voided): (f64, f64, i64) = conn
            .query_row(
                "SELECT i.pay_total, i.balance, c.voided
                 FROM invoices i
                 JOIN cash_receipts c ON c.invoice=i.invoice
                 WHERE i.invoice=? AND c.id=?",
                params![inv, id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(voided, 1);
        assert_eq!(pay_total, 0.0);
        assert_eq!(balance, 200.0);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn overpayment_drives_balance_negative() {
        // PROMAS allows overpay; open AR can go negative (credit).
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        let inv = save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(100.0, 65.0, "105")], 0.0),
        )
        .unwrap();
        save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: None,
                company_no: "1000".into(),
                sales_date: "2020-01-15".into(),
                invoice: inv,
                payment: 150.0,
                pay_ref_no: "OVER".into(),
                pay_date: "2020-01-20".into(),
                voided: false,
                company_name: None,
            },
        )
        .unwrap();

        let (pay_total, balance): (f64, f64) = conn
            .query_row(
                "SELECT pay_total, balance FROM invoices WHERE invoice=?",
                params![inv],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(pay_total, 150.0);
        assert_eq!(balance, -50.0);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn worker_wages_report_uses_emp_price() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO employees (emp_no,name) VALUES ('400','Painter')",
            [],
        )
        .unwrap();

        save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(200.0, 65.0, "400")], 0.0),
        )
        .unwrap();

        let rows = report_worker_wages(
            &conn,
            &ListParams {
                search: Some("400".into()),
                company_no: None,
                from_date: Some("2020-01-01".into()),
                to_date: Some("2020-12-31".into()),
                include_voided: None,
                limit: None,
                offset: None,
                sort: None,
            },
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].emp_no, "400");
        assert_eq!(rows[0].emp_name, "Painter");
        assert_eq!(rows[0].inv_amount, 200.0);
        assert_eq!(rows[0].wages, 130.0); // 200 * 65%
        assert_eq!(rows[0].rate, 65.0);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn voided_invoice_excluded_from_wages_and_sales() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        let inv = save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(100.0, 65.0, "105")], 0.0),
        )
        .unwrap();
        void_invoice(&conn, "1000", "100", "2020-01-15", inv).unwrap();

        let wages = report_worker_wages(
            &conn,
            &ListParams {
                search: None,
                company_no: None,
                from_date: None,
                to_date: None,
                include_voided: None,
                limit: None,
                offset: None,
                sort: None,
            },
        )
        .unwrap();
        assert!(wages.is_empty());

        let sales = report_sales_analysis(
            &conn,
            &ListParams {
                search: None,
                company_no: Some("1000".into()),
                from_date: None,
                to_date: None,
                include_voided: None,
                limit: None,
                offset: None,
                sort: None,
            },
        )
        .unwrap();
        assert!(sales.is_empty());

        let aging = report_aging(&conn, Some("2020-02-01".into())).unwrap();
        assert!(aging.is_empty());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn edit_cash_receipt_recomputes_pay_total() {
        let (mut conn, path) = tmp_conn();
        conn.execute(
            "INSERT OR REPLACE INTO companies (company_no,name) VALUES ('1000','Test Co')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO properties (company_no,pro_no,name) VALUES ('1000','100','Apt')",
            [],
        )
        .unwrap();

        let inv = save_invoice(
            &mut conn,
            sample_invoice(vec![sample_line(300.0, 65.0, "105")], 0.0),
        )
        .unwrap();
        save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: None,
                company_no: "1000".into(),
                sales_date: "2020-01-15".into(),
                invoice: inv,
                payment: 100.0,
                pay_ref_no: "A".into(),
                pay_date: "2020-01-20".into(),
                voided: false,
                company_name: None,
            },
        )
        .unwrap();
        let id: i64 = conn
            .query_row(
                "SELECT id FROM cash_receipts WHERE invoice=?",
                params![inv],
                |r| r.get(0),
            )
            .unwrap();

        // Increase payment via update path
        save_cash_receipt(
            &mut conn,
            CashReceipt {
                id: Some(id),
                company_no: "1000".into(),
                sales_date: "2020-01-15".into(),
                invoice: inv,
                payment: 175.25,
                pay_ref_no: "A-REV".into(),
                pay_date: "2020-01-21".into(),
                voided: false,
                company_name: None,
            },
        )
        .unwrap();

        let (pay_total, balance): (f64, f64) = conn
            .query_row(
                "SELECT pay_total, balance FROM invoices WHERE invoice=?",
                params![inv],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(pay_total, 175.25);
        assert_eq!(balance, 124.75);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn zero_deposit_and_penny_rounding() {
        let lines = vec![
            sample_line(33.33, 65.0, "1"),
            sample_line(33.33, 65.0, "1"),
            sample_line(33.34, 65.0, "1"),
        ];
        let (st, sp, sb, bal) = recompute_invoice_totals(&lines, 0.0, 0.0);
        assert_eq!(st, 100.0);
        assert_eq!(sp, 0.0);
        assert_eq!(sb, 100.0);
        assert_eq!(bal, 100.0);

        // Deposit larger than total → sales_bal and balance can go negative
        let (st2, sp2, sb2, bal2) = recompute_invoice_totals(&lines, 150.0, 0.0);
        assert_eq!(st2, 100.0);
        assert_eq!(sp2, 150.0);
        assert_eq!(sb2, -50.0);
        assert_eq!(bal2, -50.0);
    }
}
