pub mod commands;
pub mod db;
pub mod dbf;
pub mod import;
pub mod models;

use db::{init_db, DbState};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let conn = init_db(app.handle()).map_err(|e| -> Box<dyn std::error::Error> {
                e.into()
            })?;
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_sysdata,
            commands::save_sysdata,
            commands::get_dashboard,
            commands::list_companies,
            commands::get_company,
            commands::save_company,
            commands::delete_company,
            commands::list_properties,
            commands::save_property,
            commands::delete_property,
            commands::list_employees,
            commands::save_employee,
            commands::delete_employee,
            commands::list_work_types,
            commands::save_work_type,
            commands::delete_work_type,
            commands::list_invoices,
            commands::get_invoice,
            commands::save_invoice,
            commands::void_invoice,
            commands::list_cash_receipts,
            commands::save_cash_receipt,
            commands::delete_cash_receipt,
            commands::list_work_orders,
            commands::save_work_order,
            commands::list_materials,
            commands::save_material,
            commands::delete_material,
            commands::report_aging,
            commands::report_sales_analysis,
            commands::report_worker_wages,
            commands::import_dbf_folder,
            commands::get_db_path,
            commands::export_database,
            commands::backup_database,
            commands::set_db_location,
            commands::import_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
