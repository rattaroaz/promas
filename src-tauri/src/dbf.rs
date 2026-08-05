//! Minimal dBase III/IV .DBF reader for migrating PROMAS data.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct DbfField {
    pub name: String,
    #[allow(dead_code)]
    pub field_type: char,
    pub length: u8,
    #[allow(dead_code)]
    pub decimal: u8,
}

#[derive(Debug)]
pub struct DbfTable {
    pub fields: Vec<DbfField>,
    pub records: Vec<DbfRecord>,
}

#[derive(Debug, Clone)]
pub struct DbfRecord {
    pub deleted: bool,
    pub values: Vec<String>,
}

impl DbfRecord {
    pub fn get(&self, fields: &[DbfField], name: &str) -> String {
        fields
            .iter()
            .position(|f| f.name.eq_ignore_ascii_case(name))
            .map(|i| self.values.get(i).cloned().unwrap_or_default())
            .unwrap_or_default()
    }

    pub fn get_f64(&self, fields: &[DbfField], name: &str) -> f64 {
        parse_f64(&self.get(fields, name))
    }

    pub fn get_i64(&self, fields: &[DbfField], name: &str) -> i64 {
        parse_i64(&self.get(fields, name))
    }
}

pub fn read_dbf(path: &Path) -> Result<DbfTable, String> {
    let mut file = File::open(path).map_err(|e| format!("open {}: {e}", path.display()))?;
    let mut header = [0u8; 32];
    file.read_exact(&mut header)
        .map_err(|e| format!("read header {}: {e}", path.display()))?;

    let num_records = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
    let header_len = u16::from_le_bytes(header[8..10].try_into().unwrap()) as u64;
    let record_len = u16::from_le_bytes(header[10..12].try_into().unwrap()) as usize;

    // Field descriptors start at offset 32; count from header length.
    // Standard: header_len = 32 + 32*nfields + 1 (0x0D terminator)
    let mut fields = Vec::new();
    let mut offset: u64 = 32;
    while offset + 32 <= header_len {
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| format!("seek field: {e}"))?;
        let mut desc = [0u8; 32];
        if file.read_exact(&mut desc).is_err() {
            break;
        }
        if desc[0] == 0x0D || desc[0] == 0x00 {
            break;
        }
        let name_bytes = &desc[0..11];
        let end = name_bytes.iter().position(|&b| b == 0).unwrap_or(11);
        let name = String::from_utf8_lossy(&name_bytes[..end])
            .trim()
            .to_string();
        if name.is_empty() {
            break;
        }
        let field_type = desc[11] as char;
        let length = desc[16];
        let decimal = desc[17];
        if length == 0 {
            break;
        }
        fields.push(DbfField {
            name,
            field_type,
            length,
            decimal,
        });
        offset += 32;
    }

    if fields.is_empty() {
        return Err(format!("no fields found in {}", path.display()));
    }

    file.seek(SeekFrom::Start(header_len))
        .map_err(|e| format!("seek records: {e}"))?;

    let mut records = Vec::with_capacity(num_records.min(1_000_000));
    let mut buf = vec![0u8; record_len.max(1)];
    for _ in 0..num_records {
        match file.read_exact(&mut buf) {
            Ok(()) => {}
            Err(_) => break,
        }
        // EOF marker
        if buf[0] == 0x1A {
            break;
        }
        let deleted = buf[0] == b'*';
        let mut values = Vec::with_capacity(fields.len());
        let mut pos = 1usize;
        for field in &fields {
            let len = field.length as usize;
            let end = (pos + len).min(buf.len());
            let raw = if pos < buf.len() { &buf[pos..end] } else { &[] };
            let s = decode_bytes(raw).trim().to_string();
            values.push(s);
            pos += len;
        }
        records.push(DbfRecord { deleted, values });
    }

    Ok(DbfTable { fields, records })
}

fn decode_bytes(bytes: &[u8]) -> String {
    // PROMAS data is largely ASCII; fall back to lossy UTF-8.
    String::from_utf8_lossy(bytes).into_owned()
}

pub fn parse_date(s: &str) -> Option<String> {
    let s = s.trim();
    if s.is_empty() || s.len() < 8 {
        return None;
    }
    // dBase dates: YYYYMMDD
    let y = &s[0..4];
    let m = &s[4..6];
    let d = &s[6..8];
    let year: i32 = y.parse().ok()?;
    // Fix century glitches common in this dataset (19xx for 201x work dates)
    let fixed_year = if (1900..1990).contains(&year) {
        year + 100
    } else {
        year
    };
    // Validate month/day roughly
    let month: u32 = m.parse().ok()?;
    let day: u32 = d.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    Some(format!("{fixed_year:04}-{m}-{d}"))
}

pub fn parse_f64(s: &str) -> f64 {
    s.trim().parse::<f64>().unwrap_or(0.0)
}

pub fn parse_i64(s: &str) -> i64 {
    s.trim()
        .parse::<f64>()
        .map(|v| v as i64)
        .unwrap_or(0)
}

pub fn normalize_date_field(s: &str) -> Option<String> {
    parse_date(s)
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn parse_date_yyyyymmdd_and_century_fix() {
        assert_eq!(parse_date("20150805").as_deref(), Some("2015-08-05"));
        // 19xx before 1990 is bumped +100 (PROMAS quirk)
        assert_eq!(parse_date("19850312").as_deref(), Some("2085-03-12"));
        assert_eq!(parse_date("19950312").as_deref(), Some("1995-03-12"));
        assert_eq!(parse_date(""), None);
        assert_eq!(parse_date("20251399"), None);
    }

    #[test]
    fn parse_numbers() {
        assert_eq!(parse_f64(" 12.50 "), 12.5);
        assert_eq!(parse_f64("x"), 0.0);
        assert_eq!(parse_i64("42.9"), 42);
        assert_eq!(parse_i64(""), 0);
    }

    #[test]
    fn read_minimal_dbf() {
        let dir = std::env::temp_dir().join(format!(
            "promas_dbf_test_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("SAMPLE.DBF");
        write_minimal_company_dbf(&path).unwrap();

        let table = read_dbf(&path).expect("read dbf");
        assert_eq!(table.fields.len(), 2);
        assert_eq!(table.fields[0].name, "COMPANYNO");
        assert_eq!(table.records.len(), 1);
        assert_eq!(table.records[0].get(&table.fields, "COMPANYNO"), "1000");
        assert_eq!(table.records[0].get(&table.fields, "COMNAME"), "ACME");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Tiny dBase III file: COMPANYNO C(4), COMNAME C(4), one record.
    pub fn write_minimal_company_dbf(path: &std::path::Path) -> std::io::Result<()> {
        let mut f = std::fs::File::create(path)?;
        let num_records: u32 = 1;
        let header_len: u16 = 32 + 32 * 2 + 1; // header + 2 fields + terminator
        let record_len: u16 = 1 + 4 + 4; // delete flag + fields

        let mut header = [0u8; 32];
        header[0] = 0x03; // dBase III
        header[4..8].copy_from_slice(&num_records.to_le_bytes());
        header[8..10].copy_from_slice(&header_len.to_le_bytes());
        header[10..12].copy_from_slice(&record_len.to_le_bytes());
        f.write_all(&header)?;

        write_field_desc(&mut f, b"COMPANYNO", b'C', 4)?;
        write_field_desc(&mut f, b"COMNAME", b'C', 4)?;
        f.write_all(&[0x0D])?; // header terminator

        // record: not deleted + values
        f.write_all(b" ")?;
        f.write_all(b"1000")?;
        f.write_all(b"ACME")?;
        f.write_all(&[0x1A])?; // EOF
        Ok(())
    }

    fn write_field_desc(
        f: &mut std::fs::File,
        name: &[u8],
        field_type: u8,
        length: u8,
    ) -> std::io::Result<()> {
        let mut desc = [0u8; 32];
        desc[..name.len().min(11)].copy_from_slice(&name[..name.len().min(11)]);
        desc[11] = field_type;
        desc[16] = length;
        desc[17] = 0;
        f.write_all(&desc)
    }
}
