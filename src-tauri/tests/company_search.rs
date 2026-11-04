//! A company search matches one property's own text. Words from two properties
//! of the same company do not combine.

use promas_lib::db::open_and_migrate;
use rusqlite::params;

fn temp_conn(label: &str) -> (std::path::PathBuf, rusqlite::Connection) {
    let dir = std::env::temp_dir().join(format!("promas_search_{}_{}", label, std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let conn = open_and_migrate(&dir.join("promas.db")).expect("migrate");
    (dir, conn)
}

fn company(conn: &rusqlite::Connection, no: &str, name: &str) {
    conn.execute(
        r#"INSERT INTO companies
           (company_no,name,class,street,city,state,zip,phone,phone2,phone3,phone4,
            contact,enter_date,page_map,last_pro_id,memo,voided)
           VALUES (?1,?2,'A','','','CA','','','','','','',NULL,'',100,'',0)"#,
        params![no, name],
    )
    .unwrap();
}

fn property(conn: &rusqlite::Connection, company: &str, pro: &str, street: &str) {
    conn.execute(
        r#"INSERT INTO properties
           (company_no,pro_no,name,class,street,city,state,zip,phone,phone2,contact,
            no_of_unit,manager,page_map,key_info,paint_time,comment1,comment2,memo,voided)
           VALUES (?1,?2,?3,'',?4,'','CA','','','','',0,'','','','','','','',0)"#,
        params![company, pro, pro, street],
    )
    .unwrap();
}

fn matching(conn: &rusqlite::Connection, search: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            r#"SELECT company_no FROM companies
               WHERE voided=0
                 AND (
                   promas_match(
                        COALESCE(companies.company_no,'') || ' ' || COALESCE(companies.name,'') || ' ' || COALESCE(companies.phone,'') || ' ' ||
                        COALESCE(companies.contact,'') || ' ' || COALESCE(companies.street,'') || ' ' || COALESCE(companies.city,'') || ' ' ||
                        COALESCE(companies.zip,''),
                        ?1)
                   OR EXISTS (
                     SELECT 1 FROM properties
                     WHERE properties.company_no = companies.company_no
                       AND promas_match(
                            COALESCE(properties.pro_no,'') || ' ' || COALESCE(properties.name,'') || ' ' ||
                            COALESCE(properties.street,'') || ' ' || COALESCE(properties.city,'') || ' ' ||
                            COALESCE(properties.state,'') || ' ' || COALESCE(properties.zip,'') || ' ' ||
                            COALESCE(properties.contact,'') || ' ' || COALESCE(properties.manager,''),
                            ?1)
                   )
                 )
               ORDER BY company_no"#,
        )
        .unwrap();
    stmt.query_map(params![search], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect()
}

#[test]
fn secco_maple_does_not_match_across_properties() {
    let (dir, conn) = temp_conn("secco-maple");
    company(&conn, "1000", "ACME");
    property(&conn, "1000", "09", "11334 W. Secco Canyon Hwy");
    property(&conn, "1000", "02", "1105 MAPLE ST");
    property(&conn, "1000", "01", "14755 NORTH VENTURA CANYON AVENUE");

    assert_eq!(matching(&conn, "Secco Maple"), Vec::<String>::new());
    assert_eq!(matching(&conn, "Secco Canyon"), vec!["1000".to_string()]);
    assert_eq!(matching(&conn, "Maple"), vec!["1000".to_string()]);
    assert_eq!(matching(&conn, "ACME Canyon"), Vec::<String>::new());

    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}
