#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{DateTime, Utc};
use segmenta_core::engine::DownloadEngine;
use segmenta_core::media::{parse_m3u8, HlsPlaylist, VariantStream};
use segmenta_core::scheduler::ScheduleRule;
use segmenta_core::storage::Storage;
use segmenta_core::types::{SegmentRecord, TaskRecord};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

struct AppState {
    engine: Mutex<DownloadEngine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub download_dir: String,
    pub max_concurrent_downloads: usize,
    pub default_segments: u32,
    pub speed_limit_kb: u64,
    pub theme: String,
    pub auto_categorize: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        let default_download = dirs_fallback_download_dir();
        Self {
            download_dir: default_download,
            max_concurrent_downloads: 3,
            default_segments: 8,
            speed_limit_kb: 0,
            theme: "system".to_string(),
            auto_categorize: true,
        }
    }
}

fn dirs_fallback_download_dir() -> String {
    if let Some(user_dirs) = std::env::var_os("USERPROFILE") {
        let p = std::path::PathBuf::from(user_dirs).join("Downloads");
        return p.to_string_lossy().to_string();
    }
    if let Some(home) = std::env::var_os("HOME") {
        let p = std::path::PathBuf::from(home).join("Downloads");
        return p.to_string_lossy().to_string();
    }
    "C:\\Downloads".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTaskItem {
    pub task: TaskRecord,
    pub rule: ScheduleRule,
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

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let val_json = engine.get_setting("app_settings").map_err(|e| e.to_string())?;
    if let Some(json_str) = val_json {
        serde_json::from_str::<AppSettings>(&json_str).map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}

#[tauri::command]
fn save_settings(settings: AppSettings, state: State<AppState>) -> Result<(), String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let json_str = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    engine
        .save_setting("app_settings", &json_str)
        .map_err(|e| e.to_string())?;

    // Apply speed limit if set
    let limit_bytes = if settings.speed_limit_kb > 0 {
        Some(settings.speed_limit_kb * 1024)
    } else {
        None
    };
    engine.set_speed_limit(limit_bytes);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn schedule_task(
    url: String,
    filename: String,
    save_path: String,
    segments: Option<u32>,
    headers: Option<HashMap<String, String>>,
    start_at: Option<String>,
    stop_at: Option<String>,
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

    let start_dt = start_at.and_then(|s| {
        DateTime::parse_from_rfc3339(&s)
            .map(|d| d.with_timezone(&Utc))
            .ok()
    });
    let stop_dt = stop_at.and_then(|s| {
        DateTime::parse_from_rfc3339(&s)
            .map(|d| d.with_timezone(&Utc))
            .ok()
    });

    let rule = ScheduleRule {
        start_at: start_dt,
        stop_at: stop_dt,
        auto_start_on_add: false,
    };

    // Store schedule rule associated with this task in settings storage
    let key = format!("schedule_rule_{}", task_id);
    let json_rule = serde_json::to_string(&rule).map_err(|e| e.to_string())?;
    engine.save_setting(&key, &json_rule).map_err(|e| e.to_string())?;

    // Background timer / monitor if scheduled for future
    if let Some(start) = start_dt {
        let now = Utc::now();
        if start > now {
            let duration = (start - now).to_std().unwrap_or_default();
            let engine_worker = engine.clone();
            let tid = task_id.clone();
            tokio::spawn(async move {
                tokio::time::sleep(duration).await;
                let _ = engine_worker.start_download(&tid, None).await;
            });
        } else {
            let engine_worker = engine.clone();
            let tid = task_id.clone();
            tokio::spawn(async move {
                let _ = engine_worker.start_download(&tid, None).await;
            });
        }
    } else {
        let engine_worker = engine.clone();
        let tid = task_id.clone();
        tokio::spawn(async move {
            let _ = engine_worker.start_download(&tid, None).await;
        });
    }

    Ok(task_id)
}

#[tauri::command]
fn list_scheduled(state: State<AppState>) -> Result<Vec<ScheduledTaskItem>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let tasks = engine.list_tasks().map_err(|e| e.to_string())?;
    let mut scheduled_tasks = Vec::new();

    for task in tasks {
        let key = format!("schedule_rule_{}", task.id);
        if let Ok(Some(json_rule)) = engine.get_setting(&key) {
            if let Ok(rule) = serde_json::from_str::<ScheduleRule>(&json_rule) {
                scheduled_tasks.push(ScheduledTaskItem { task, rule });
            }
        }
    }

    Ok(scheduled_tasks)
}

#[tauri::command]
async fn probe_m3u8_variants(url: String) -> Result<Vec<VariantStream>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch M3U8: {}", e))?;

    let text = res.text().await.map_err(|e| e.to_string())?;
    let playlist = parse_m3u8(&text, &url)?;

    match playlist {
        HlsPlaylist::Master { variants } => Ok(variants),
        HlsPlaylist::Media { .. } => {
            // Single media stream without sub-variants
            Ok(vec![VariantStream {
                bandwidth: None,
                resolution: Some("Auto / Source".to_string()),
                codecs: None,
                url,
            }])
        }
    }
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
            set_speed_limit,
            get_settings,
            save_settings,
            schedule_task,
            list_scheduled,
            probe_m3u8_variants
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
