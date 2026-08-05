use crate::dbf::{normalize_date_field, read_dbf};
use crate::models::ImportResult;
use rusqlite::{params, Connection};
use std::path::Path;

pub fn import_promas_folder(conn: &mut Connection, folder: &Path) -> Result<ImportResult, String> {
    let mut result = ImportResult {
        companies: 0,
        properties: 0,
        employees: 0,
        work_types: 0,
        invoices: 0,
        invoice_lines: 0,
        cash_receipts: 0,
        materials: 0,
        work_orders: 0,
        estimates: 0,
        messages: Vec::new(),
    };

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin tx: {e}"))?;

    // Clear existing data for clean import
    tx.execute_batch(
        r#"
        DELETE FROM invoice_lines;
        DELETE FROM invoices;
        DELETE FROM cash_receipts;
        DELETE FROM work_order_lines;
        DELETE FROM work_orders;
        DELETE FROM materials;
        DELETE FROM estimates;
        DELETE FROM forms;
        DELETE FROM properties;
        DELETE FROM companies;
        DELETE FROM employees;
        DELETE FROM work_types;
        "#,
    )
    .map_err(|e| format!("clear tables: {e}"))?;

    // SYSDATA
    let sys_path = folder.join("SYSDATA.DBF");
    if sys_path.exists() {
        let table = read_dbf(&sys_path)?;
        if let Some(rec) = table.records.iter().find(|r| !r.deleted) {
            let f = &table.fields;
            tx.execute(
                r#"UPDATE sysdata SET
                    company=?, address1=?, address2=?, city=?, zip=?,
                    close_date=?, next_invoice=?, next_order=?
                    WHERE id=1"#,
                params![
                    rec.get(f, "COMPANY"),
                    rec.get(f, "ADDRESS1"),
                    rec.get(f, "ADDRESS2"),
                    rec.get(f, "CITY"),
                    rec.get(f, "ZIP"),
                    normalize_date_field(&rec.get(f, "CLOSEDATE")),
                    rec.get_i64(f, "INT2").max(1),
                    rec.get_i64(f, "INT1").max(1),
                ],
            )
            .map_err(|e| format!("sysdata: {e}"))?;
            result.messages.push("Imported system settings".into());
        }
    }

    // COMPANY
    let path = folder.join("COMPANY.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT OR REPLACE INTO companies
                (company_no,name,class,street,city,state,zip,phone,phone2,phone3,phone4,
                 contact,enter_date,page_map,last_pro_id,memo,voided)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            if rec.get(f, "COMPANYNO").is_empty() {
                continue;
            }
            stmt.execute(params![
                rec.get(f, "COMPANYNO"),
                rec.get(f, "COMNAME"),
                rec.get(f, "COMCLASS"),
                rec.get(f, "COMSTREET"),
                rec.get(f, "COMCITY"),
                rec.get(f, "COMSTATE"),
                rec.get(f, "COMZIP"),
                rec.get(f, "COMPHONE"),
                rec.get(f, "COMPHONE2"),
                rec.get(f, "COMPHONE3"),
                rec.get(f, "COMPHONE4"),
                rec.get(f, "COMCONTACT"),
                normalize_date_field(&rec.get(f, "COMENTERDA")),
                rec.get(f, "COMPAGEMAP"),
                rec.get_i64(f, "LASTPROID"),
                "",
                if rec.deleted { 1 } else { 0 },
            ])
            .map_err(|e| format!("company: {e}"))?;
            result.companies += 1;
        }
        result
            .messages
            .push(format!("Companies: {}", result.companies));
    }

    // PROPERTY
    let path = folder.join("PROPERTY.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT OR REPLACE INTO properties
                (company_no,pro_no,name,class,street,city,state,zip,phone,phone2,
                 contact,no_of_unit,manager,page_map,key_info,paint_time,comment1,comment2,memo,voided)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            if rec.get(f, "COMPANYNO").is_empty() || rec.get(f, "PRONO").is_empty() {
                continue;
            }
            // Ensure company exists for FK
            let _ = tx.execute(
                "INSERT OR IGNORE INTO companies (company_no, name) VALUES (?, ?)",
                params![rec.get(f, "COMPANYNO"), "(imported)"],
            );
            stmt.execute(params![
                rec.get(f, "COMPANYNO"),
                rec.get(f, "PRONO"),
                rec.get(f, "PRONAME"),
                rec.get(f, "PROCLASS"),
                rec.get(f, "PROSTREET"),
                rec.get(f, "PROCITY"),
                rec.get(f, "PROSTATE"),
                rec.get(f, "PROZIP"),
                rec.get(f, "PROPHONE"),
                rec.get(f, "PROPHONE2"),
                rec.get(f, "PROCONT"),
                rec.get_i64(f, "NOOFUNIT"),
                rec.get(f, "PROCONTACT"),
                rec.get(f, "PROPAGEMAP"),
                rec.get(f, "PROKEY"),
                rec.get(f, "PROTIME"),
                rec.get(f, "PROCOMM1"),
                rec.get(f, "PROCOMM2"),
                "",
                if rec.deleted { 1 } else { 0 },
            ])
            .map_err(|e| format!("property: {e}"))?;
            result.properties += 1;
        }
        result
            .messages
            .push(format!("Properties: {}", result.properties));
    }

    // EMPLOYEE
    let path = folder.join("EMPLOYEE.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT OR REPLACE INTO employees
                (emp_no,name,class,street,city,state,zip,phone,contact,enter_date,commission,ssno,birth_date,voided)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            if rec.get(f, "EMPNO").is_empty() {
                continue;
            }
            stmt.execute(params![
                rec.get(f, "EMPNO"),
                rec.get(f, "EMPNAME"),
                rec.get(f, "EMPCLASS"),
                rec.get(f, "EMPSTREET"),
                rec.get(f, "EMPCITY"),
                rec.get(f, "EMPSTATE"),
                rec.get(f, "EMPZIP"),
                rec.get(f, "EMPPHONE"),
                rec.get(f, "EMPCONTACT"),
                normalize_date_field(&rec.get(f, "EMPENTERDA")),
                rec.get_f64(f, "COMMISION"),
                rec.get(f, "SSNO"),
                normalize_date_field(&rec.get(f, "BIRTHDATE")),
                if rec.deleted { 1 } else { 0 },
            ])
            .map_err(|e| format!("employee: {e}"))?;
            result.employees += 1;
        }
        result
            .messages
            .push(format!("Employees: {}", result.employees));
    }

    // WORKTYPE
    let path = folder.join("WORKTYPE.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT OR REPLACE INTO work_types (code_no,work_type,description,price,voided)
                   VALUES (?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            if rec.get(f, "CODENO").is_empty() {
                continue;
            }
            stmt.execute(params![
                rec.get(f, "CODENO"),
                rec.get(f, "WORKTYPE"),
                rec.get(f, "DESCRIPT"),
                rec.get_f64(f, "PRICE"),
                if rec.deleted { 1 } else { 0 },
            ])
            .map_err(|e| format!("worktype: {e}"))?;
            result.work_types += 1;
        }
        result
            .messages
            .push(format!("Work types: {}", result.work_types));
    }

    // SALES2 (invoice headers)
    let path = folder.join("SALES2.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT OR REPLACE INTO invoices
                (company_no,pro_no,sales_date,invoice,order_no,order_date,order_man,sales_unit,sales_size,
                 sales_total,sales_pay,sales_bal,pay_total,balance,sales_term,sales_due,cust_po_no,
                 discount_on,discount,deposit_ref,remark1,remark2,status,voided)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            let inv = rec.get_i64(f, "INVOICE");
            let company = rec.get(f, "COMPANYNO");
            let pro = rec.get(f, "PRONO");
            let sales_date = normalize_date_field(&rec.get(f, "SALESDATE"))
                .unwrap_or_else(|| "1900-01-01".into());
            if company.is_empty() || inv == 0 {
                continue;
            }
            let status = rec.get(f, "STATUS");
            let voided = rec.deleted || status.eq_ignore_ascii_case("V");
            stmt.execute(params![
                company,
                pro,
                sales_date,
                inv,
                rec.get_i64(f, "ORDERNO"),
                normalize_date_field(&rec.get(f, "ORDERDATE")),
                rec.get(f, "ORDERMAN"),
                rec.get(f, "SALESUNIT"),
                rec.get(f, "SALESSIZE"),
                rec.get_f64(f, "SALESTOTAL"),
                rec.get_f64(f, "SALESPAY"),
                rec.get_f64(f, "SALESBAL"),
                rec.get_f64(f, "PAYTOTAL"),
                rec.get_f64(f, "BALANCE"),
                rec.get(f, "SALESTERM"),
                normalize_date_field(&rec.get(f, "SALESDUE")),
                rec.get(f, "CUSTPONO"),
                rec.get_i64(f, "DISCOUNTON"),
                rec.get_f64(f, "DISCOUNT"),
                rec.get(f, "DEPOSITREF"),
                rec.get(f, "REMARK1"),
                rec.get(f, "REMARK2"),
                status,
                if voided { 1 } else { 0 },
            ])
            .map_err(|e| format!("invoice: {e}"))?;
            result.invoices += 1;
        }
        result
            .messages
            .push(format!("Invoices: {}", result.invoices));
    }

    // SALES1 (invoice lines)
    let path = folder.join("SALES1.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT INTO invoice_lines
                (company_no,pro_no,sales_date,invoice,line_no,code_no,description,work_date,
                 work_type,price,emp_no,emp_price,commission,status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            if rec.deleted {
                continue;
            }
            let inv = rec.get_i64(f, "INVOICE");
            let company = rec.get(f, "COMPANYNO");
            if company.is_empty() || inv == 0 {
                continue;
            }
            let sales_date = normalize_date_field(&rec.get(f, "SALESDATE"))
                .unwrap_or_else(|| "1900-01-01".into());
            stmt.execute(params![
                company,
                rec.get(f, "PRONO"),
                sales_date,
                inv,
                rec.get_i64(f, "NO"),
                rec.get(f, "CODENO"),
                rec.get(f, "DESCRIPT"),
                normalize_date_field(&rec.get(f, "WORKDATE")),
                rec.get(f, "WORKTYPE"),
                rec.get_f64(f, "PRICE"),
                rec.get(f, "EMPNO"),
                rec.get_f64(f, "EMPPRICE"),
                rec.get_f64(f, "COMMISION"),
                rec.get(f, "STATUS"),
            ])
            .map_err(|e| format!("invoice line: {e}"))?;
            result.invoice_lines += 1;
        }
        result
            .messages
            .push(format!("Invoice lines: {}", result.invoice_lines));
    }

    // CASHRECT
    let path = folder.join("CASHRECT.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT INTO cash_receipts
                (company_no,sales_date,invoice,payment,pay_ref_no,pay_date,voided)
                VALUES (?,?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            if rec.deleted {
                continue;
            }
            let inv = rec.get_i64(f, "INVOICE");
            let company = rec.get(f, "COMPANYNO");
            if company.is_empty() || inv == 0 {
                continue;
            }
            stmt.execute(params![
                company,
                normalize_date_field(&rec.get(f, "SALESDATE"))
                    .unwrap_or_else(|| "1900-01-01".into()),
                inv,
                rec.get_f64(f, "PAYMENT"),
                rec.get(f, "PAYREFNO"),
                normalize_date_field(&rec.get(f, "PAYDATE"))
                    .unwrap_or_else(|| "1900-01-01".into()),
                0,
            ])
            .map_err(|e| format!("cash: {e}"))?;
            result.cash_receipts += 1;
        }
        result
            .messages
            .push(format!("Cash receipts: {}", result.cash_receipts));
    }

    // MATERIAL
    let path = folder.join("MATERIAL.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT INTO materials (emp_no,description,mat_date,amount,status,voided)
                   VALUES (?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            if rec.get(f, "EMPNO").is_empty() {
                continue;
            }
            let status = rec.get(f, "STATUS");
            stmt.execute(params![
                rec.get(f, "EMPNO"),
                rec.get(f, "MATDESCRIP"),
                normalize_date_field(&rec.get(f, "MATDATE"))
                    .unwrap_or_else(|| "1900-01-01".into()),
                rec.get_f64(f, "MATAMOUNT"),
                &status,
                if rec.deleted || status.eq_ignore_ascii_case("V") {
                    1
                } else {
                    0
                },
            ])
            .map_err(|e| format!("material: {e}"))?;
            result.materials += 1;
        }
        result
            .messages
            .push(format!("Materials: {}", result.materials));
    }

    // ORDER2
    let path = folder.join("ORDER2.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT OR REPLACE INTO work_orders
                (company_no,pro_no,order_date,order_no,work_date,order_unit,order_size,
                 order_man,order_by,cust_po_no,remark1,remark2,status,voided)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            let order_no = rec.get_i64(f, "ORDERNO");
            let company = rec.get(f, "COMPANYNO");
            if company.is_empty() {
                continue;
            }
            let status = rec.get(f, "STATUS");
            stmt.execute(params![
                company,
                rec.get(f, "PRONO"),
                normalize_date_field(&rec.get(f, "ORDERDATE"))
                    .unwrap_or_else(|| "1900-01-01".into()),
                order_no,
                normalize_date_field(&rec.get(f, "WORKDATE")),
                rec.get(f, "ORDERUNIT"),
                rec.get(f, "ORDERSIZE"),
                rec.get(f, "ORDERMAN"),
                rec.get(f, "ORDERBY"),
                rec.get(f, "CUSTPONO"),
                rec.get(f, "REMARK1"),
                rec.get(f, "REMARK2"),
                &status,
                if rec.deleted || status.eq_ignore_ascii_case("V") {
                    1
                } else {
                    0
                },
            ])
            .map_err(|e| format!("order: {e}"))?;
            result.work_orders += 1;
        }
        result
            .messages
            .push(format!("Work orders: {}", result.work_orders));
    }

    // ORDER1 lines
    let path = folder.join("ORDER1.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT INTO work_order_lines
                (company_no,pro_no,order_date,order_no,line_no,code_no,description,work_type,price)
                VALUES (?,?,?,?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            if rec.deleted {
                continue;
            }
            let company = rec.get(f, "COMPANYNO");
            if company.is_empty() {
                continue;
            }
            stmt.execute(params![
                company,
                rec.get(f, "PRONO"),
                normalize_date_field(&rec.get(f, "ORDERDATE"))
                    .unwrap_or_else(|| "1900-01-01".into()),
                rec.get_i64(f, "ORDERNO"),
                rec.get_i64(f, "NO"),
                rec.get(f, "CODENO"),
                rec.get(f, "DESCRIPT"),
                rec.get(f, "WORKTYPE"),
                rec.get_f64(f, "PRICE"),
            ])
            .map_err(|e| format!("order line: {e}"))?;
        }
    }

    // EST
    let path = folder.join("EST.DBF");
    if path.exists() {
        let table = read_dbf(&path)?;
        let f = &table.fields;
        let mut stmt = tx
            .prepare(
                r#"INSERT INTO estimates (company_no,est_date,est_no,form_no,memo,status,voided)
                   VALUES (?,?,?,?,?,?,?)"#,
            )
            .map_err(|e| e.to_string())?;
        for rec in &table.records {
            if rec.deleted {
                continue;
            }
            stmt.execute(params![
                rec.get(f, "COMPANYNO"),
                normalize_date_field(&rec.get(f, "ESTDATE")),
                rec.get_i64(f, "ESTNO"),
                rec.get(f, "FORMNO"),
                "",
                rec.get(f, "STATUS"),
                0,
            ])
            .map_err(|e| format!("estimate: {e}"))?;
            result.estimates += 1;
        }
        result
            .messages
            .push(format!("Estimates: {}", result.estimates));
    }

    // Update next invoice number
    let max_inv: i64 = tx
        .query_row("SELECT COALESCE(MAX(invoice),0)+1 FROM invoices", [], |r| {
            r.get(0)
        })
        .unwrap_or(1);
    tx.execute(
        "UPDATE sysdata SET next_invoice=? WHERE id=1",
        params![max_inv],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| format!("commit: {e}"))?;
    result.messages.push("Import completed successfully".into());
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_and_migrate;
    use crate::dbf::tests::{write_minimal_company_dbf, write_multi_table_fixture};
    use std::path::PathBuf;

    #[test]
    fn import_minimal_company_dbf_fixture() {
        let dir = std::env::temp_dir().join(format!(
            "promas_import_fix_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        write_minimal_company_dbf(&dir.join("COMPANY.DBF")).unwrap();

        let tmp = dir.join("out.db");
        let mut conn = open_and_migrate(&tmp).expect("open db");
        let result = import_promas_folder(&mut conn, &dir).expect("import");
        assert_eq!(result.companies, 1);
        let name: String = conn
            .query_row(
                "SELECT name FROM companies WHERE company_no='1000'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(name, "ACME");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_multi_table_company_property_invoice_fixture() {
        let dir = std::env::temp_dir().join(format!(
            "promas_import_multi_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        write_multi_table_fixture(&dir).unwrap();

        let tmp = dir.join("out.db");
        let mut conn = open_and_migrate(&tmp).expect("open db");
        let result = import_promas_folder(&mut conn, &dir).expect("import");
        assert_eq!(result.companies, 1);
        assert_eq!(result.properties, 1);
        assert_eq!(result.invoices, 1);
        assert_eq!(result.invoice_lines, 1);

        let (bal, prop): (f64, String) = conn
            .query_row(
                r#"SELECT i.balance, p.name FROM invoices i
                   JOIN properties p ON p.company_no=i.company_no AND p.pro_no=i.pro_no
                   WHERE i.invoice=1"#,
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(bal, 250.0);
        assert_eq!(prop, "Bldg A");

        let desc: String = conn
            .query_row(
                "SELECT description FROM invoice_lines WHERE invoice=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(desc, "Paint");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_checked_in_promas_mini_fixture() {
        let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("promas_mini");
        assert!(
            folder.join("COMPANY.DBF").exists(),
            "missing checked-in fixture at {}",
            folder.display()
        );
        let tmp = std::env::temp_dir().join(format!(
            "promas_fixture_import_{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&tmp);
        let mut conn = open_and_migrate(&tmp).expect("open db");
        let result = import_promas_folder(&mut conn, &folder).expect("import");
        assert_eq!(result.companies, 1);
        assert_eq!(result.properties, 1);
        assert_eq!(result.invoices, 1);
        assert_eq!(result.invoice_lines, 1);
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn import_legacy_promas_sample() {
        let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("COMPBACK")
            .join("PROMAS");
        if !folder.join("COMPANY.DBF").exists() {
            eprintln!("skip: legacy PROMAS data not found at {}", folder.display());
            return;
        }
        let tmp = std::env::temp_dir().join("promas_import_test.db");
        let _ = std::fs::remove_file(&tmp);
        let mut conn = open_and_migrate(&tmp).expect("open db");
        let result = import_promas_folder(&mut conn, &folder).expect("import");
        assert!(result.companies > 0, "expected companies");
        assert!(result.properties > 0, "expected properties");
        assert!(result.invoices > 0, "expected invoices");
        assert!(result.invoice_lines > 0, "expected invoice lines");
        println!("{:?}", result);
        let _ = std::fs::remove_file(&tmp);
    }
}
