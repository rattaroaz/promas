use crate::db::DbState;
use crate::import::import_promas_folder;
use crate::models::*;
use rusqlite::{params, OptionalExtension};
use std::path::PathBuf;
use tauri::{Manager, State};

fn map_err(e: impl ToString) -> String {
    e.to_string()
}

// ─── System ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_sysdata(state: State<DbState>) -> Result<SysData, String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.query_row(
        "SELECT company,address1,address2,city,zip,close_date,next_invoice,next_order,next_estimate,terms_days,interest_rate FROM sysdata WHERE id=1",
        [],
        |r| {
            Ok(SysData {
                company: r.get(0)?,
                address1: r.get(1)?,
                address2: r.get(2)?,
                city: r.get(3)?,
                zip: r.get(4)?,
                close_date: r.get(5)?,
                next_invoice: r.get(6)?,
                next_order: r.get(7)?,
                next_estimate: r.get(8)?,
                terms_days: r.get(9)?,
                interest_rate: r.get(10)?,
            })
        },
    )
    .map_err(map_err)
}

#[tauri::command]
pub fn save_sysdata(state: State<DbState>, data: SysData) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute(
        r#"UPDATE sysdata SET company=?,address1=?,address2=?,city=?,zip=?,close_date=?,
           next_invoice=?,next_order=?,next_estimate=?,terms_days=?,interest_rate=? WHERE id=1"#,
        params![
            data.company,
            data.address1,
            data.address2,
            data.city,
            data.zip,
            data.close_date,
            data.next_invoice,
            data.next_order,
            data.next_estimate,
            data.terms_days,
            data.interest_rate
        ],
    )
    .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn get_dashboard(state: State<DbState>) -> Result<DashboardStats, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let company_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM companies WHERE voided=0",
            [],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    let property_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM properties WHERE voided=0",
            [],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    let employee_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM employees WHERE voided=0",
            [],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    let invoice_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM invoices WHERE voided=0",
            [],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    let open_balance: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(balance),0) FROM invoices WHERE voided=0 AND balance>0",
            [],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    let total_sales: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(sales_total),0) FROM invoices WHERE voided=0",
            [],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    let total_payments: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(payment),0) FROM cash_receipts WHERE voided=0",
            [],
            |r| r.get(0),
        )
        .map_err(map_err)?;

    let mut stmt = conn
        .prepare(
            r#"SELECT i.company_no,i.pro_no,i.sales_date,i.invoice,i.order_no,i.order_date,i.order_man,
               i.sales_unit,i.sales_size,i.sales_total,i.sales_pay,i.sales_bal,i.pay_total,i.balance,
               i.sales_term,i.sales_due,i.cust_po_no,i.discount_on,i.discount,i.deposit_ref,
               i.remark1,i.remark2,i.status,i.voided,c.name,p.name,p.street
               FROM invoices i
               LEFT JOIN companies c ON c.company_no=i.company_no
               LEFT JOIN properties p ON p.company_no=i.company_no AND p.pro_no=i.pro_no
               WHERE i.voided=0
               ORDER BY i.sales_date DESC, i.invoice DESC LIMIT 10"#,
        )
        .map_err(map_err)?;
    let recent_invoices = stmt
        .query_map([], map_invoice)
        .map_err(map_err)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(DashboardStats {
        company_count,
        property_count,
        employee_count,
        invoice_count,
        open_balance,
        total_sales,
        total_payments,
        recent_invoices,
    })
}

fn map_invoice(r: &rusqlite::Row<'_>) -> rusqlite::Result<Invoice> {
    Ok(Invoice {
        company_no: r.get(0)?,
        pro_no: r.get(1)?,
        sales_date: r.get(2)?,
        invoice: r.get(3)?,
        order_no: r.get(4)?,
        order_date: r.get(5)?,
        order_man: r.get(6)?,
        sales_unit: r.get(7)?,
        sales_size: r.get(8)?,
        sales_total: r.get(9)?,
        sales_pay: r.get(10)?,
        sales_bal: r.get(11)?,
        pay_total: r.get(12)?,
        balance: r.get(13)?,
        sales_term: r.get(14)?,
        sales_due: r.get(15)?,
        cust_po_no: r.get(16)?,
        discount_on: r.get(17)?,
        discount: r.get(18)?,
        deposit_ref: r.get(19)?,
        remark1: r.get(20)?,
        remark2: r.get(21)?,
        status: r.get(22)?,
        voided: r.get::<_, i64>(23)? != 0,
        company_name: r.get(24)?,
        property_name: r.get(25)?,
        property_street: r.get(26)?,
    })
}

// ─── Companies ────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_companies(state: State<DbState>, params: ListParams) -> Result<Vec<Company>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let include_voided = params.include_voided.unwrap_or(false);
    let search = params.search.unwrap_or_default();
    let limit = params.limit.unwrap_or(500);
    let offset = params.offset.unwrap_or(0);
    let like = format!("%{}%", search);

    let mut stmt = conn
        .prepare(
            r#"SELECT company_no,name,class,street,city,state,zip,phone,phone2,phone3,phone4,
               contact,enter_date,page_map,last_pro_id,memo,voided
               FROM companies
               WHERE (?1 OR voided=0)
                 AND (?2='' OR company_no LIKE ?3 OR name LIKE ?3 OR phone LIKE ?3 OR contact LIKE ?3)
               ORDER BY company_no
               LIMIT ?4 OFFSET ?5"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(
            params![include_voided, search, like, limit, offset],
            |r| {
                Ok(Company {
                    company_no: r.get(0)?,
                    name: r.get(1)?,
                    class: r.get(2)?,
                    street: r.get(3)?,
                    city: r.get(4)?,
                    state: r.get(5)?,
                    zip: r.get(6)?,
                    phone: r.get(7)?,
                    phone2: r.get(8)?,
                    phone3: r.get(9)?,
                    phone4: r.get(10)?,
                    contact: r.get(11)?,
                    enter_date: r.get(12)?,
                    page_map: r.get(13)?,
                    last_pro_id: r.get(14)?,
                    memo: r.get(15)?,
                    voided: r.get::<_, i64>(16)? != 0,
                })
            },
        )
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn get_company(state: State<DbState>, company_no: String) -> Result<Option<Company>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.query_row(
        r#"SELECT company_no,name,class,street,city,state,zip,phone,phone2,phone3,phone4,
           contact,enter_date,page_map,last_pro_id,memo,voided FROM companies WHERE company_no=?"#,
        params![company_no],
        |r| {
            Ok(Company {
                company_no: r.get(0)?,
                name: r.get(1)?,
                class: r.get(2)?,
                street: r.get(3)?,
                city: r.get(4)?,
                state: r.get(5)?,
                zip: r.get(6)?,
                phone: r.get(7)?,
                phone2: r.get(8)?,
                phone3: r.get(9)?,
                phone4: r.get(10)?,
                contact: r.get(11)?,
                enter_date: r.get(12)?,
                page_map: r.get(13)?,
                last_pro_id: r.get(14)?,
                memo: r.get(15)?,
                voided: r.get::<_, i64>(16)? != 0,
            })
        },
    )
    .optional()
    .map_err(map_err)
}

#[tauri::command]
pub fn save_company(state: State<DbState>, company: Company) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute(
        r#"INSERT INTO companies
           (company_no,name,class,street,city,state,zip,phone,phone2,phone3,phone4,
            contact,enter_date,page_map,last_pro_id,memo,voided)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(company_no) DO UPDATE SET
             name=excluded.name,class=excluded.class,street=excluded.street,city=excluded.city,
             state=excluded.state,zip=excluded.zip,phone=excluded.phone,phone2=excluded.phone2,
             phone3=excluded.phone3,phone4=excluded.phone4,contact=excluded.contact,
             enter_date=excluded.enter_date,page_map=excluded.page_map,last_pro_id=excluded.last_pro_id,
             memo=excluded.memo,voided=excluded.voided"#,
        params![
            company.company_no,
            company.name,
            company.class,
            company.street,
            company.city,
            company.state,
            company.zip,
            company.phone,
            company.phone2,
            company.phone3,
            company.phone4,
            company.contact,
            company.enter_date,
            company.page_map,
            company.last_pro_id,
            company.memo,
            if company.voided { 1 } else { 0 },
        ],
    )
    .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_company(state: State<DbState>, company_no: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute(
        "UPDATE companies SET voided=1 WHERE company_no=?",
        params![company_no],
    )
    .map_err(map_err)?;
    Ok(())
}

// ─── Properties ───────────────────────────────────────────────────────

#[tauri::command]
pub fn list_properties(state: State<DbState>, params: ListParams) -> Result<Vec<Property>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let include_voided = params.include_voided.unwrap_or(false);
    let search = params.search.unwrap_or_default();
    let company_no = params.company_no.unwrap_or_default();
    let limit = params.limit.unwrap_or(500);
    let offset = params.offset.unwrap_or(0);
    let like = format!("%{}%", search);

    let mut stmt = conn
        .prepare(
            r#"SELECT company_no,pro_no,name,class,street,city,state,zip,phone,phone2,
               contact,no_of_unit,manager,page_map,key_info,paint_time,comment1,comment2,memo,voided
               FROM properties
               WHERE (?1 OR voided=0)
                 AND (?2='' OR company_no=?2)
                 AND (?3='' OR pro_no LIKE ?4 OR name LIKE ?4 OR street LIKE ?4 OR phone LIKE ?4)
               ORDER BY company_no, pro_no
               LIMIT ?5 OFFSET ?6"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(
            params![include_voided, company_no, search, like, limit, offset],
            |r| {
                Ok(Property {
                    company_no: r.get(0)?,
                    pro_no: r.get(1)?,
                    name: r.get(2)?,
                    class: r.get(3)?,
                    street: r.get(4)?,
                    city: r.get(5)?,
                    state: r.get(6)?,
                    zip: r.get(7)?,
                    phone: r.get(8)?,
                    phone2: r.get(9)?,
                    contact: r.get(10)?,
                    no_of_unit: r.get(11)?,
                    manager: r.get(12)?,
                    page_map: r.get(13)?,
                    key_info: r.get(14)?,
                    paint_time: r.get(15)?,
                    comment1: r.get(16)?,
                    comment2: r.get(17)?,
                    memo: r.get(18)?,
                    voided: r.get::<_, i64>(19)? != 0,
                })
            },
        )
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn save_property(state: State<DbState>, property: Property) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute(
        r#"INSERT INTO properties
           (company_no,pro_no,name,class,street,city,state,zip,phone,phone2,
            contact,no_of_unit,manager,page_map,key_info,paint_time,comment1,comment2,memo,voided)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(company_no,pro_no) DO UPDATE SET
             name=excluded.name,class=excluded.class,street=excluded.street,city=excluded.city,
             state=excluded.state,zip=excluded.zip,phone=excluded.phone,phone2=excluded.phone2,
             contact=excluded.contact,no_of_unit=excluded.no_of_unit,manager=excluded.manager,
             page_map=excluded.page_map,key_info=excluded.key_info,paint_time=excluded.paint_time,
             comment1=excluded.comment1,comment2=excluded.comment2,memo=excluded.memo,voided=excluded.voided"#,
        params![
            property.company_no,
            property.pro_no,
            property.name,
            property.class,
            property.street,
            property.city,
            property.state,
            property.zip,
            property.phone,
            property.phone2,
            property.contact,
            property.no_of_unit,
            property.manager,
            property.page_map,
            property.key_info,
            property.paint_time,
            property.comment1,
            property.comment2,
            property.memo,
            if property.voided { 1 } else { 0 },
        ],
    )
    .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_property(
    state: State<DbState>,
    company_no: String,
    pro_no: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute(
        "UPDATE properties SET voided=1 WHERE company_no=? AND pro_no=?",
        params![company_no, pro_no],
    )
    .map_err(map_err)?;
    Ok(())
}

// ─── Employees ────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_employees(state: State<DbState>, params: ListParams) -> Result<Vec<Employee>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let include_voided = params.include_voided.unwrap_or(false);
    let search = params.search.unwrap_or_default();
    let like = format!("%{}%", search);
    let mut stmt = conn
        .prepare(
            r#"SELECT emp_no,name,class,street,city,state,zip,phone,contact,enter_date,
               commission,ssno,birth_date,voided FROM employees
               WHERE (?1 OR voided=0)
                 AND (?2='' OR emp_no LIKE ?3 OR name LIKE ?3 OR phone LIKE ?3)
               ORDER BY emp_no"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![include_voided, search, like], |r| {
            Ok(Employee {
                emp_no: r.get(0)?,
                name: r.get(1)?,
                class: r.get(2)?,
                street: r.get(3)?,
                city: r.get(4)?,
                state: r.get(5)?,
                zip: r.get(6)?,
                phone: r.get(7)?,
                contact: r.get(8)?,
                enter_date: r.get(9)?,
                commission: r.get(10)?,
                ssno: r.get(11)?,
                birth_date: r.get(12)?,
                voided: r.get::<_, i64>(13)? != 0,
            })
        })
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn save_employee(state: State<DbState>, employee: Employee) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute(
        r#"INSERT INTO employees
           (emp_no,name,class,street,city,state,zip,phone,contact,enter_date,commission,ssno,birth_date,voided)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(emp_no) DO UPDATE SET
             name=excluded.name,class=excluded.class,street=excluded.street,city=excluded.city,
             state=excluded.state,zip=excluded.zip,phone=excluded.phone,contact=excluded.contact,
             enter_date=excluded.enter_date,commission=excluded.commission,ssno=excluded.ssno,
             birth_date=excluded.birth_date,voided=excluded.voided"#,
        params![
            employee.emp_no,
            employee.name,
            employee.class,
            employee.street,
            employee.city,
            employee.state,
            employee.zip,
            employee.phone,
            employee.contact,
            employee.enter_date,
            employee.commission,
            employee.ssno,
            employee.birth_date,
            if employee.voided { 1 } else { 0 },
        ],
    )
    .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_employee(state: State<DbState>, emp_no: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute(
        "UPDATE employees SET voided=1 WHERE emp_no=?",
        params![emp_no],
    )
    .map_err(map_err)?;
    Ok(())
}

// ─── Work Types ───────────────────────────────────────────────────────

#[tauri::command]
pub fn list_work_types(state: State<DbState>, params: ListParams) -> Result<Vec<WorkType>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let include_voided = params.include_voided.unwrap_or(false);
    let search = params.search.unwrap_or_default();
    let like = format!("%{}%", search);
    let mut stmt = conn
        .prepare(
            r#"SELECT code_no,work_type,description,price,voided FROM work_types
               WHERE (?1 OR voided=0)
                 AND (?2='' OR code_no LIKE ?3 OR description LIKE ?3)
               ORDER BY code_no"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![include_voided, search, like], |r| {
            Ok(WorkType {
                code_no: r.get(0)?,
                work_type: r.get(1)?,
                description: r.get(2)?,
                price: r.get(3)?,
                voided: r.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn save_work_type(state: State<DbState>, work_type: WorkType) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute(
        r#"INSERT INTO work_types (code_no,work_type,description,price,voided)
           VALUES (?,?,?,?,?)
           ON CONFLICT(code_no) DO UPDATE SET
             work_type=excluded.work_type,description=excluded.description,
             price=excluded.price,voided=excluded.voided"#,
        params![
            work_type.code_no,
            work_type.work_type,
            work_type.description,
            work_type.price,
            if work_type.voided { 1 } else { 0 },
        ],
    )
    .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_work_type(state: State<DbState>, code_no: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute(
        "UPDATE work_types SET voided=1 WHERE code_no=?",
        params![code_no],
    )
    .map_err(map_err)?;
    Ok(())
}

// ─── Invoices ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_invoices(state: State<DbState>, params: ListParams) -> Result<Vec<Invoice>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let include_voided = params.include_voided.unwrap_or(false);
    let search = params.search.unwrap_or_default();
    let company_no = params.company_no.unwrap_or_default();
    let from_date = params.from_date.unwrap_or_default();
    let to_date = params.to_date.unwrap_or_default();
    let limit = params.limit.unwrap_or(200);
    let offset = params.offset.unwrap_or(0);
    let like = format!("%{}%", search);

    let mut stmt = conn
        .prepare(
            r#"SELECT i.company_no,i.pro_no,i.sales_date,i.invoice,i.order_no,i.order_date,i.order_man,
               i.sales_unit,i.sales_size,i.sales_total,i.sales_pay,i.sales_bal,i.pay_total,i.balance,
               i.sales_term,i.sales_due,i.cust_po_no,i.discount_on,i.discount,i.deposit_ref,
               i.remark1,i.remark2,i.status,i.voided,c.name,p.name,p.street
               FROM invoices i
               LEFT JOIN companies c ON c.company_no=i.company_no
               LEFT JOIN properties p ON p.company_no=i.company_no AND p.pro_no=i.pro_no
               WHERE (?1 OR i.voided=0)
                 AND (?2='' OR i.company_no=?2)
                 AND (?3='' OR i.sales_date>=?3)
                 AND (?4='' OR i.sales_date<=?4)
                 AND (?5='' OR CAST(i.invoice AS TEXT) LIKE ?6 OR i.sales_unit LIKE ?6
                      OR c.name LIKE ?6 OR i.cust_po_no LIKE ?6)
               ORDER BY i.sales_date DESC, i.invoice DESC
               LIMIT ?7 OFFSET ?8"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(
            params![
                include_voided,
                company_no,
                from_date,
                to_date,
                search,
                like,
                limit,
                offset
            ],
            map_invoice,
        )
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn get_invoice(
    state: State<DbState>,
    company_no: String,
    pro_no: String,
    sales_date: String,
    invoice: i64,
) -> Result<Option<InvoiceWithLines>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let inv = conn
        .query_row(
            r#"SELECT i.company_no,i.pro_no,i.sales_date,i.invoice,i.order_no,i.order_date,i.order_man,
               i.sales_unit,i.sales_size,i.sales_total,i.sales_pay,i.sales_bal,i.pay_total,i.balance,
               i.sales_term,i.sales_due,i.cust_po_no,i.discount_on,i.discount,i.deposit_ref,
               i.remark1,i.remark2,i.status,i.voided,c.name,p.name,p.street
               FROM invoices i
               LEFT JOIN companies c ON c.company_no=i.company_no
               LEFT JOIN properties p ON p.company_no=i.company_no AND p.pro_no=i.pro_no
               WHERE i.company_no=? AND i.pro_no=? AND i.sales_date=? AND i.invoice=?"#,
            params![company_no, pro_no, sales_date, invoice],
            map_invoice,
        )
        .optional()
        .map_err(map_err)?;

    let Some(invoice_row) = inv else {
        return Ok(None);
    };

    let mut stmt = conn
        .prepare(
            r#"SELECT id,company_no,pro_no,sales_date,invoice,line_no,code_no,description,
               work_date,work_type,price,emp_no,emp_price,commission,status
               FROM invoice_lines
               WHERE company_no=? AND pro_no=? AND sales_date=? AND invoice=?
               ORDER BY line_no"#,
        )
        .map_err(map_err)?;
    let lines = stmt
        .query_map(
            params![
                invoice_row.company_no,
                invoice_row.pro_no,
                invoice_row.sales_date,
                invoice_row.invoice
            ],
            |r| {
                Ok(InvoiceLine {
                    id: r.get(0)?,
                    company_no: r.get(1)?,
                    pro_no: r.get(2)?,
                    sales_date: r.get(3)?,
                    invoice: r.get(4)?,
                    line_no: r.get(5)?,
                    code_no: r.get(6)?,
                    description: r.get(7)?,
                    work_date: r.get(8)?,
                    work_type: r.get(9)?,
                    price: r.get(10)?,
                    emp_no: r.get(11)?,
                    emp_price: r.get(12)?,
                    commission: r.get(13)?,
                    status: r.get(14)?,
                })
            },
        )
        .map_err(map_err)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Some(InvoiceWithLines {
        invoice: invoice_row,
        lines,
    }))
}

#[tauri::command]
pub fn save_invoice(state: State<DbState>, data: InvoiceWithLines) -> Result<i64, String> {
    let mut conn = state.0.lock().map_err(map_err)?;
    crate::ops::save_invoice(&mut conn, data)
}

#[tauri::command]
pub fn void_invoice(
    state: State<DbState>,
    company_no: String,
    pro_no: String,
    sales_date: String,
    invoice: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    crate::ops::void_invoice(&conn, &company_no, &pro_no, &sales_date, invoice)
}

// ─── Cash Receipts ────────────────────────────────────────────────────

#[tauri::command]
pub fn list_cash_receipts(
    state: State<DbState>,
    params: ListParams,
) -> Result<Vec<CashReceipt>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let search = params.search.unwrap_or_default();
    let company_no = params.company_no.unwrap_or_default();
    let from_date = params.from_date.unwrap_or_default();
    let to_date = params.to_date.unwrap_or_default();
    let limit = params.limit.unwrap_or(200);
    let like = format!("%{}%", search);

    let mut stmt = conn
        .prepare(
            r#"SELECT cr.id,cr.company_no,cr.sales_date,cr.invoice,cr.payment,cr.pay_ref_no,cr.pay_date,cr.voided,c.name
               FROM cash_receipts cr
               LEFT JOIN companies c ON c.company_no=cr.company_no
               WHERE cr.voided=0
                 AND (?1='' OR cr.company_no=?1)
                 AND (?2='' OR cr.pay_date>=?2)
                 AND (?3='' OR cr.pay_date<=?3)
                 AND (?4='' OR CAST(cr.invoice AS TEXT) LIKE ?5 OR cr.pay_ref_no LIKE ?5 OR c.name LIKE ?5)
               ORDER BY cr.pay_date DESC, cr.id DESC
               LIMIT ?6"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(
            params![company_no, from_date, to_date, search, like, limit],
            |r| {
                Ok(CashReceipt {
                    id: r.get(0)?,
                    company_no: r.get(1)?,
                    sales_date: r.get(2)?,
                    invoice: r.get(3)?,
                    payment: r.get(4)?,
                    pay_ref_no: r.get(5)?,
                    pay_date: r.get(6)?,
                    voided: r.get::<_, i64>(7)? != 0,
                    company_name: r.get(8)?,
                })
            },
        )
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn save_cash_receipt(state: State<DbState>, receipt: CashReceipt) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(map_err)?;
    crate::ops::save_cash_receipt(&mut conn, receipt)
}

#[tauri::command]
pub fn delete_cash_receipt(state: State<DbState>, id: i64) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(map_err)?;
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

    let pay_total: f64 = tx
        .query_row(
            "SELECT COALESCE(SUM(payment),0) FROM cash_receipts WHERE company_no=? AND invoice=? AND voided=0",
            params![company_no, invoice],
            |r| r.get(0),
        )
        .map_err(map_err)?;

    tx.execute(
        "UPDATE invoices SET pay_total=?, balance=sales_bal-? WHERE company_no=? AND invoice=?",
        params![pay_total, pay_total, company_no, invoice],
    )
    .map_err(map_err)?;

    tx.commit().map_err(map_err)?;
    Ok(())
}

// ─── Work Orders ──────────────────────────────────────────────────────

#[tauri::command]
pub fn list_work_orders(
    state: State<DbState>,
    params: ListParams,
) -> Result<Vec<WorkOrder>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let include_voided = params.include_voided.unwrap_or(false);
    let search = params.search.unwrap_or_default();
    let company_no = params.company_no.unwrap_or_default();
    let limit = params.limit.unwrap_or(200);
    let like = format!("%{}%", search);

    let mut stmt = conn
        .prepare(
            r#"SELECT w.company_no,w.pro_no,w.order_date,w.order_no,w.work_date,w.order_unit,w.order_size,
               w.order_man,w.order_by,w.cust_po_no,w.remark1,w.remark2,w.status,w.voided,c.name,p.name
               FROM work_orders w
               LEFT JOIN companies c ON c.company_no=w.company_no
               LEFT JOIN properties p ON p.company_no=w.company_no AND p.pro_no=w.pro_no
               WHERE (?1 OR w.voided=0)
                 AND (?2='' OR w.company_no=?2)
                 AND (?3='' OR CAST(w.order_no AS TEXT) LIKE ?4 OR w.order_unit LIKE ?4 OR c.name LIKE ?4)
               ORDER BY w.order_date DESC, w.order_no DESC
               LIMIT ?5"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(
            params![include_voided, company_no, search, like, limit],
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
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn save_work_order(state: State<DbState>, data: WorkOrderWithLines) -> Result<i64, String> {
    let mut conn = state.0.lock().map_err(map_err)?;
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
                line.price,
            ],
        )
        .map_err(map_err)?;
    }

    let order_no = order.order_no;
    tx.commit().map_err(map_err)?;
    Ok(order_no)
}

// ─── Materials ────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_materials(state: State<DbState>, params: ListParams) -> Result<Vec<Material>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let search = params.search.unwrap_or_default();
    let from_date = params.from_date.unwrap_or_default();
    let to_date = params.to_date.unwrap_or_default();
    let like = format!("%{}%", search);

    let mut stmt = conn
        .prepare(
            r#"SELECT m.id,m.emp_no,m.description,m.mat_date,m.amount,m.status,m.voided,e.name
               FROM materials m
               LEFT JOIN employees e ON e.emp_no=m.emp_no
               WHERE m.voided=0
                 AND (?1='' OR m.mat_date>=?1)
                 AND (?2='' OR m.mat_date<=?2)
                 AND (?3='' OR m.emp_no LIKE ?4 OR m.description LIKE ?4 OR e.name LIKE ?4)
               ORDER BY m.mat_date DESC, m.id DESC"#,
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![from_date, to_date, search, like], |r| {
            Ok(Material {
                id: r.get(0)?,
                emp_no: r.get(1)?,
                description: r.get(2)?,
                mat_date: r.get(3)?,
                amount: r.get(4)?,
                status: r.get(5)?,
                voided: r.get::<_, i64>(6)? != 0,
                emp_name: r.get(7)?,
            })
        })
        .map_err(map_err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn save_material(state: State<DbState>, material: Material) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    if let Some(id) = material.id {
        conn.execute(
            r#"UPDATE materials SET emp_no=?,description=?,mat_date=?,amount=?,status=?,voided=? WHERE id=?"#,
            params![
                material.emp_no,
                material.description,
                material.mat_date,
                material.amount,
                material.status,
                if material.voided { 1 } else { 0 },
                id
            ],
        )
        .map_err(map_err)?;
    } else {
        conn.execute(
            r#"INSERT INTO materials (emp_no,description,mat_date,amount,status,voided)
               VALUES (?,?,?,?,?,?)"#,
            params![
                material.emp_no,
                material.description,
                material.mat_date,
                material.amount,
                material.status,
                if material.voided { 1 } else { 0 },
            ],
        )
        .map_err(map_err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_material(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute("UPDATE materials SET voided=1 WHERE id=?", params![id])
        .map_err(map_err)?;
    Ok(())
}

// ─── Reports ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn report_aging(state: State<DbState>, as_of: Option<String>) -> Result<Vec<AgingRow>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    crate::ops::report_aging(&conn, as_of)
}

#[tauri::command]
pub fn report_sales_analysis(
    state: State<DbState>,
    params: ListParams,
) -> Result<Vec<SalesAnalysisRow>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    crate::ops::report_sales_analysis(&conn, &params)
}

#[tauri::command]
pub fn report_worker_wages(
    state: State<DbState>,
    params: ListParams,
) -> Result<Vec<WorkerWageRow>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    crate::ops::report_worker_wages(&conn, &params)
}

// ─── Import ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn import_dbf_folder(state: State<DbState>, folder: String) -> Result<ImportResult, String> {
    log::info!(target: "promas::db", "import_dbf_folder {folder}");
    let mut conn = state.0.lock().map_err(map_err)?;
    let path = PathBuf::from(&folder);
    if !path.is_dir() {
        return Err(format!("Not a directory: {folder}"));
    }
    // Accept either the PROMAS folder or COMPBACK parent
    let promas = if path.join("COMPANY.DBF").exists() || path.join("company.dbf").exists() {
        path
    } else if path.join("PROMAS").is_dir() {
        path.join("PROMAS")
    } else {
        return Err(
            "Could not find COMPANY.DBF. Select the PROMAS data folder (containing .DBF files)."
                .into(),
        );
    };
    import_promas_folder(&mut conn, &promas)
}

#[tauri::command]
pub fn get_db_path(app: tauri::AppHandle) -> Result<String, String> {
    let path = crate::db::resolve_db_path(&app)?;
    Ok(path.display().to_string())
}

fn vacuum_into(state: &State<DbState>, dest_path: &str) -> Result<(), String> {
    let dest = PathBuf::from(dest_path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create export dir: {e}"))?;
    }
    if dest.exists() {
        std::fs::remove_file(&dest).map_err(|e| format!("remove existing file: {e}"))?;
    }
    let conn = state.0.lock().map_err(map_err)?;
    conn.execute("VACUUM INTO ?1", [dest.display().to_string()])
        .map_err(|e| format!("export database: {e}"))?;
    Ok(())
}

/// Export a consistent copy of the live database to `dest_path` (VACUUM INTO).
#[tauri::command]
pub fn export_database(state: State<DbState>, dest_path: String) -> Result<(), String> {
    log::info!(target: "promas::db", "export_database → {dest_path}");
    let result = vacuum_into(&state, &dest_path);
    if let Err(ref e) = result {
        log::error!(target: "promas::db", "export_database failed: {e}");
    }
    result
}

/// Backup the live database to `dest_path`.
#[tauri::command]
pub fn backup_database(state: State<DbState>, dest_path: String) -> Result<(), String> {
    log::info!(target: "promas::db", "backup_database → {dest_path}");
    let result = vacuum_into(&state, &dest_path);
    if let Err(ref e) = result {
        log::error!(target: "promas::db", "backup_database failed: {e}");
    }
    result
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDbLocationResult {
    pub path: String,
    /// false when an existing file was opened (never overwritten).
    pub created: bool,
}

/// Point the app at a database file path.
/// - If the file exists: open it as-is (never overwrite / copy into it).
/// - If it does not exist: create a new empty database there.
/// The path is persisted for future startups.
#[tauri::command]
pub fn set_db_location(
    app: tauri::AppHandle,
    state: State<DbState>,
    path: String,
) -> Result<SetDbLocationResult, String> {
    let new_path = crate::db::normalize_db_file_path(&path)?;
    crate::db::ensure_db_parent(&new_path)?;

    let current = crate::db::resolve_db_path(&app)?;
    let existed = new_path.exists();

    // Never write/copy into an existing file. `open_and_migrate` only opens +
    // applies CREATE IF NOT EXISTS schema; it does not replace file contents.
    if current != new_path || !existed {
        crate::db::with_db_closed(&state, &new_path, &current, || Ok(()))?;
    }

    crate::db::save_db_location(&app, &new_path)?;
    log::info!(
        target: "promas::db",
        "set_db_location → {} ({})",
        new_path.display(),
        if existed {
            "opened existing — not overwritten"
        } else {
            "created new empty database"
        }
    );

    Ok(SetDbLocationResult {
        path: new_path.display().to_string(),
        created: !existed,
    })
}

/// Replace the live database with a user-selected SQLite file.
#[tauri::command]
pub fn import_database(
    app: tauri::AppHandle,
    state: State<DbState>,
    source_path: String,
) -> Result<String, String> {
    log::info!(target: "promas::db", "import_database from {source_path}");
    let source = PathBuf::from(&source_path);
    let current = crate::db::resolve_db_path(&app)?;

    crate::db::with_db_closed(&state, &current, &current, || {
        crate::db::import_replace_database(&current, &source)
    })?;

    Ok(current.display().to_string())
}

// ─── Observability ─────────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendDiagnostics {
    pub db_path: String,
    pub log_dir: String,
    pub rust_version: String,
    pub crate_version: String,
    /// Compile-time target triple (e.g. x86_64-pc-windows-msvc).
    pub target_triple: String,
}

#[tauri::command]
pub fn get_backend_diagnostics(app: tauri::AppHandle) -> Result<BackendDiagnostics, String> {
    let db_path = crate::db::resolve_db_path(&app)?;
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| e.to_string())?;
    if !log_dir.exists() {
        let _ = std::fs::create_dir_all(&log_dir);
    }
    let triple = compile_target_triple();
    log::info!(
        target: "promas::diag",
        "diagnostics snapshot db={} log_dir={} target={}",
        db_path.display(),
        log_dir.display(),
        triple
    );
    Ok(BackendDiagnostics {
        db_path: db_path.display().to_string(),
        log_dir: log_dir.display().to_string(),
        rust_version: rustc_version_runtime(),
        crate_version: env!("CARGO_PKG_VERSION").to_string(),
        target_triple: triple,
    })
}

fn rustc_version_runtime() -> String {
    format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS)
}

fn compile_target_triple() -> String {
    #[cfg(all(target_arch = "x86_64", target_os = "windows"))]
    {
        "x86_64-pc-windows-msvc".into()
    }
    #[cfg(all(target_arch = "aarch64", target_os = "windows"))]
    {
        "aarch64-pc-windows-msvc".into()
    }
    #[cfg(not(any(
        all(target_arch = "x86_64", target_os = "windows"),
        all(target_arch = "aarch64", target_os = "windows")
    )))]
    {
        format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS)
    }
}

#[tauri::command]
pub fn open_log_dir(app: tauri::AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&log_dir).map_err(|e| format!("create log dir: {e}"))?;
    log::info!(target: "promas::diag", "open log dir {}", log_dir.display());
    tauri_plugin_opener::open_path(&log_dir, None::<&str>)
        .map_err(|e| format!("open log dir: {e}"))
}

/// Write a UTF-8 text file (used for diagnostics export).
#[tauri::command]
pub fn save_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
        }
    }
    std::fs::write(&path, contents.as_bytes()).map_err(|e| format!("write {path}: {e}"))?;
    log::info!(target: "promas::diag", "saved text file → {path}");
    Ok(())
}

