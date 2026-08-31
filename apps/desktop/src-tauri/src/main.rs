#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use segmenta_core::engine::DownloadEngine;
use segmenta_core::storage::Storage;
use segmenta_core::types::{SegmentRecord, TaskRecord};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

struct AppState {
    engine: Mutex<DownloadEngine>,
}

#[tauri::command]
fn list_tasks(state: State<AppState>) -> Result<Vec<TaskRecord>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.list_tasks().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_task(task_id: String, state: State<AppState>) -> Result<Option<TaskRecord>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.get_task(&task_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_segments(task_id: String, state: State<AppState>) -> Result<Vec<SegmentRecord>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.get_segments(&task_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_task(
    url: String,
    filename: String,
    save_path: String,
    segments: Option<u32>,
    headers: Option<HashMap<String, String>>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let engine = {
        let guard = state.engine.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    let seg_count = segments.unwrap_or(8);
    let hdrs = headers.unwrap_or_default();
    let task_id = engine
        .add_task(url, filename, save_path, seg_count, hdrs)
        .await?;

    // Auto-start download in background worker
    let engine_worker = engine.clone();
    let tid = task_id.clone();
    tokio::spawn(async move {
        let _ = engine_worker.start_download(&tid, None).await;
    });

    Ok(task_id)
}

#[tauri::command]
async fn pause_task(task_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let engine = {
        let guard = state.engine.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    engine.pause_task(&task_id).await
}

#[tauri::command]
async fn resume_task(task_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let engine = {
        let guard = state.engine.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    tokio::spawn(async move {
        let _ = engine.start_download(&task_id, None).await;
    });
    Ok(())
}

#[tauri::command]
async fn cancel_task(task_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let engine = {
        let guard = state.engine.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    engine.cancel_task(&task_id).await
}

#[tauri::command]
fn set_speed_limit(limit_bytes: Option<u64>, state: State<AppState>) -> Result<(), String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.set_speed_limit(limit_bytes);
    Ok(())
}

fn main() {
    let temp_dir = std::env::temp_dir().join("segmenta");
    let _ = std::fs::create_dir_all(&temp_dir);
    let db_path = temp_dir.join("segmenta.db");
    let storage = Storage::new(&db_path).expect("Failed to initialize database");
    let engine = DownloadEngine::new(storage, temp_dir.to_str().unwrap().to_string());

    tauri::Builder::default()
        .manage(AppState {
            engine: Mutex::new(engine),
        })
        .invoke_handler(tauri::generate_handler![
            list_tasks,
            get_task,
            get_segments,
            add_task,
            pause_task,
            resume_task,
            cancel_task,
            set_speed_limit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
