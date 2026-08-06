use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SysData {
    pub company: String,
    pub address1: String,
    pub address2: String,
    pub city: String,
    pub zip: String,
    pub close_date: Option<String>,
    pub next_invoice: i64,
    pub next_order: i64,
    pub next_estimate: i64,
    pub terms_days: i64,
    pub interest_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Company {
    pub company_no: String,
    pub name: String,
    pub class: String,
    pub street: String,
    pub city: String,
    pub state: String,
    pub zip: String,
    pub phone: String,
    pub phone2: String,
    pub phone3: String,
    pub phone4: String,
    pub contact: String,
    pub enter_date: Option<String>,
    pub page_map: String,
    pub last_pro_id: i64,
    pub memo: String,
    pub voided: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Property {
    pub company_no: String,
    pub pro_no: String,
    pub name: String,
    pub class: String,
    pub street: String,
    pub city: String,
    pub state: String,
    pub zip: String,
    pub phone: String,
    pub phone2: String,
    pub contact: String,
    pub no_of_unit: i64,
    pub manager: String,
    pub page_map: String,
    pub key_info: String,
    pub paint_time: String,
    pub comment1: String,
    pub comment2: String,
    pub memo: String,
    pub voided: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Employee {
    pub emp_no: String,
    pub name: String,
    pub class: String,
    pub street: String,
    pub city: String,
    pub state: String,
    pub zip: String,
    pub phone: String,
    pub contact: String,
    pub enter_date: Option<String>,
    pub commission: f64,
    pub ssno: String,
    pub birth_date: Option<String>,
    pub voided: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkType {
    pub code_no: String,
    pub work_type: String,
    pub description: String,
    pub price: f64,
    pub voided: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub company_no: String,
    pub pro_no: String,
    pub sales_date: String,
    pub invoice: i64,
    pub order_no: i64,
    pub order_date: Option<String>,
    pub order_man: String,
    pub sales_unit: String,
    pub sales_size: String,
    pub sales_total: f64,
    pub sales_pay: f64,
    pub sales_bal: f64,
    pub pay_total: f64,
    pub balance: f64,
    pub sales_term: String,
    pub sales_due: Option<String>,
    pub cust_po_no: String,
    pub discount_on: i64,
    pub discount: f64,
    pub deposit_ref: String,
    pub remark1: String,
    pub remark2: String,
    pub status: String,
    pub voided: bool,
    pub company_name: Option<String>,
    pub property_name: Option<String>,
    pub property_street: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceLine {
    pub id: Option<i64>,
    pub company_no: String,
    pub pro_no: String,
    pub sales_date: String,
    pub invoice: i64,
    pub line_no: i64,
    pub code_no: String,
    pub description: String,
    pub work_date: Option<String>,
    pub work_type: String,
    pub price: f64,
    pub emp_no: String,
    pub emp_price: f64,
    pub commission: f64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashReceipt {
    pub id: Option<i64>,
    pub company_no: String,
    pub sales_date: String,
    pub invoice: i64,
    pub payment: f64,
    pub pay_ref_no: String,
    pub pay_date: String,
    pub voided: bool,
    pub company_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkOrder {
    pub company_no: String,
    pub pro_no: String,
    pub order_date: String,
    pub order_no: i64,
    pub work_date: Option<String>,
    pub order_unit: String,
    pub order_size: String,
    pub order_man: String,
    pub order_by: String,
    pub cust_po_no: String,
    pub remark1: String,
    pub remark2: String,
    pub status: String,
    pub voided: bool,
    pub company_name: Option<String>,
    pub property_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkOrderLine {
    pub id: Option<i64>,
    pub company_no: String,
    pub pro_no: String,
    pub order_date: String,
    pub order_no: i64,
    pub line_no: i64,
    pub code_no: String,
    pub description: String,
    pub work_type: String,
    pub price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: Option<i64>,
    pub emp_no: String,
    pub description: String,
    pub mat_date: String,
    pub amount: f64,
    pub status: String,
    pub voided: bool,
    pub emp_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Estimate {
    pub id: Option<i64>,
    pub company_no: String,
    pub est_date: Option<String>,
    pub est_no: i64,
    pub form_no: String,
    pub memo: String,
    pub status: String,
    pub voided: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerLine {
    pub invoice: i64,
    pub inv_date: String,
    pub inv_amount: f64,
    pub pay_date: Option<String>,
    pub pay_ref_no: Option<String>,
    pub pay_amount: Option<f64>,
    pub balance: f64,
    pub unit: String,
    pub pro_no: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingInvoiceRow {
    pub order_no: i64,
    pub order_date: String,
    pub company_no: String,
    pub pro_no: String,
    pub order_by: String,
    pub invoice: Option<i64>,
    pub inv_date: Option<String>,
    pub balance: f64,
    pub status: String,
    pub property_address: String,
    pub unit_size: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormRecord {
    pub form_no: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub company_count: i64,
    pub property_count: i64,
    pub employee_count: i64,
    pub invoice_count: i64,
    pub open_balance: f64,
    pub total_sales: f64,
    pub total_payments: f64,
    pub recent_invoices: Vec<Invoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgingRow {
    pub company_no: String,
    pub company_name: String,
    pub phone: String,
    pub current: f64,
    pub days_30: f64,
    pub days_60: f64,
    pub days_90: f64,
    pub days_120: f64,
    pub open_bal: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub companies: i64,
    pub properties: i64,
    pub employees: i64,
    pub work_types: i64,
    pub invoices: i64,
    pub invoice_lines: i64,
    pub cash_receipts: i64,
    pub materials: i64,
    pub work_orders: i64,
    pub estimates: i64,
    pub messages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListParams {
    pub search: Option<String>,
    pub company_no: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub include_voided: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    /// materials sort: "worker" | "date" | "desc" | default
    pub sort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceWithLines {
    pub invoice: Invoice,
    pub lines: Vec<InvoiceLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkOrderWithLines {
    pub order: WorkOrder,
    pub lines: Vec<WorkOrderLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesAnalysisRow {
    pub sales_date: String,
    pub invoice: i64,
    pub company_no: String,
    pub pro_no: String,
    pub sales_amount: f64,
    pub deposit: f64,
    pub sales_bal: f64,
    pub pay_total: f64,
    pub balance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerWageRow {
    pub emp_no: String,
    pub emp_name: String,
    pub work_date: Option<String>,
    pub inv_date: String,
    pub invoice: i64,
    pub company_no: String,
    pub pro_no: String,
    pub inv_amount: f64,
    pub rate: f64,
    pub wages: f64,
    pub description: String,
}
