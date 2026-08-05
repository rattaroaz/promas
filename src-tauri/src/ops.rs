//! Connection-level business operations (testable without Tauri State).

use crate::models::*;
use rusqlite::{params, Connection};

fn map_err(e: impl ToString) -> String {
    e.to_string()
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

    let total: f64 = data.lines.iter().map(|l| l.price).sum();
    inv.sales_total = total;
    inv.sales_bal = total - inv.sales_pay;
    inv.balance = inv.sales_bal - inv.pay_total;

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
        let emp_price = if line.emp_price > 0.0 {
            line.emp_price
        } else {
            line.price * line.commission / 100.0
        };
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
                line.price,
                line.emp_no,
                emp_price,
                line.commission,
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

    if let Some(id) = receipt.id {
        tx.execute(
            r#"UPDATE cash_receipts SET company_no=?,sales_date=?,invoice=?,payment=?,pay_ref_no=?,pay_date=?,voided=?
               WHERE id=?"#,
            params![
                receipt.company_no,
                receipt.sales_date,
                receipt.invoice,
                receipt.payment,
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
                receipt.payment,
                receipt.pay_ref_no,
                receipt.pay_date,
                if receipt.voided { 1 } else { 0 },
            ],
        )
        .map_err(map_err)?;
    }

    let pay_total: f64 = tx
        .query_row(
            "SELECT COALESCE(SUM(payment),0) FROM cash_receipts WHERE company_no=? AND invoice=? AND voided=0",
            params![receipt.company_no, receipt.invoice],
            |r| r.get(0),
        )
        .map_err(map_err)?;

    tx.execute(
        r#"UPDATE invoices SET pay_total=?, balance=sales_bal-?
           WHERE company_no=? AND invoice=?"#,
        params![
            pay_total,
            pay_total,
            receipt.company_no,
            receipt.invoice
        ],
    )
    .map_err(map_err)?;

    tx.commit().map_err(map_err)?;
    Ok(())
}

pub fn report_aging(
    conn: &Connection,
    as_of: Option<String>,
) -> Result<Vec<AgingRow>, String> {
    let as_of = as_of.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());

    let mut stmt = conn
        .prepare(
            r#"SELECT i.company_no, COALESCE(c.name,''), COALESCE(c.phone,''),
               SUM(CASE WHEN julianday(?1)-julianday(i.sales_date) <= 30 THEN i.balance ELSE 0 END),
               SUM(CASE WHEN julianday(?1)-julianday(i.sales_date) > 30 AND julianday(?1)-julianday(i.sales_date) <= 60 THEN i.balance ELSE 0 END),
               SUM(CASE WHEN julianday(?1)-julianday(i.sales_date) > 60 AND julianday(?1)-julianday(i.sales_date) <= 90 THEN i.balance ELSE 0 END),
               SUM(CASE WHEN julianday(?1)-julianday(i.sales_date) > 90 AND julianday(?1)-julianday(i.sales_date) <= 120 THEN i.balance ELSE 0 END),
               SUM(CASE WHEN julianday(?1)-julianday(i.sales_date) > 120 THEN i.balance ELSE 0 END),
               SUM(i.balance)
               FROM invoices i
               LEFT JOIN companies c ON c.company_no=i.company_no
               WHERE i.voided=0 AND i.balance > 0
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
