#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod autostart;
mod tray;

use autostart::{is_launch_on_startup_enabled, set_launch_on_startup};
use chrono::{DateTime, Utc};
use segmenta_core::engine::DownloadEngine;
use segmenta_core::media::{parse_m3u8, HlsPlaylist, VariantStream};
use segmenta_core::scheduler::ScheduleRule;
use segmenta_core::server::start_http_server;
use segmenta_core::storage::Storage;
use segmenta_core::types::{AppSettings, SegmentRecord, TaskRecord};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tray::setup_tray;

struct AppState {
    engine: Mutex<DownloadEngine>,
}

pub fn spawn_progress_window(app: &AppHandle, task_id: &str) -> Result<(), String> {
    let window_label = format!("download-progress-{}", task_id);

    // If window already exists, focus and show it
    if let Some(existing_window) = app.get_webview_window(&window_label) {
        let _ = existing_window.show();
        let _ = existing_window.unminimize();
        let _ = existing_window.set_focus();
        return Ok(());
    }

    let url_str = format!("/progress?id={}", task_id);
    let webview_url = WebviewUrl::App(url_str.into());

    let win_builder = WebviewWindowBuilder::new(app, &window_label, webview_url)
        .title("Download Status — Segmenta")
        .inner_size(500.0, 310.0)
        .min_inner_size(460.0, 280.0)
        .resizable(false)
        .decorations(true)
        .center();

    let _window = win_builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn open_progress_window(task_id: String, app: AppHandle) -> Result<(), String> {
    spawn_progress_window(&app, &task_id)
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
    open_progress: Option<bool>,
    state: State<'_, AppState>,
    app: AppHandle,
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

    // Check if auto-popup progress dialog setting is enabled
    let should_popup = if let Some(explicit) = open_progress {
        explicit
    } else if let Ok(Some(json_str)) = engine.get_setting("app_settings") {
        serde_json::from_str::<AppSettings>(&json_str)
            .map(|s| s.show_progress_dialog)
            .unwrap_or(true)
    } else {
        true
    };

    if should_popup {
        let _ = spawn_progress_window(&app, &task_id);
    }

    // Auto-start download in background worker
    let engine_worker = engine.clone();
    let tid = task_id.clone();
    tokio::spawn(async move {
        if let Err(e) = engine_worker.start_download(&tid, None).await {
            eprintln!("[Worker Error] Task {} failed: {}", tid, e);
        }
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
    engine.resume_task(&task_id).await
}

#[tauri::command]
async fn cancel_task(
    task_id: String,
    cleanup_partial: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let engine = {
        let guard = state.engine.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    engine.cancel_task(&task_id, cleanup_partial.unwrap_or(false)).await
}

#[tauri::command]
async fn delete_task(
    task_id: String,
    delete_files: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let engine = {
        let guard = state.engine.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    engine.delete_task(&task_id, delete_files.unwrap_or(false)).await
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
fn set_autostart(enable: bool, state: State<AppState>) -> Result<(), String> {
    set_launch_on_startup(enable, false)?;
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let mut settings = if let Ok(Some(json_str)) = engine.get_setting("app_settings") {
        serde_json::from_str::<AppSettings>(&json_str).unwrap_or_default()
    } else {
        AppSettings::default()
    };
    settings.autostart = enable;
    if let Ok(json_str) = serde_json::to_string(&settings) {
        let _ = engine.save_setting("app_settings", &json_str);
    }
    Ok(())
}

#[tauri::command]
fn get_autostart() -> bool {
    is_launch_on_startup_enabled()
}

#[tauri::command]
fn open_file_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let p = std::path::Path::new(&path);
        if p.exists() {
            let _ = Command::new("explorer").args(["/select,", &path]).spawn();
        } else if let Some(parent) = p.parent() {
            let _ = Command::new("explorer").arg(parent).spawn();
        } else {
            let _ = Command::new("explorer").arg(&path).spawn();
        }
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let _ = Command::new("open").args(["-R", &path]).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let p = std::path::Path::new(&path);
        let dir = if p.is_dir() { &path } else { p.parent().and_then(|x| x.to_str()).unwrap_or(&path) };
        let _ = Command::new("xdg-open").arg(dir).spawn();
    }
    Ok(())
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
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

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let launch_minimized = args
        .iter()
        .any(|arg| arg == "--minimized" || arg == "--autostart");

    let temp_dir = std::env::temp_dir().join("segmenta");
    let _ = std::fs::create_dir_all(&temp_dir);
    let db_path = temp_dir.join("segmenta.db");
    let storage = Storage::new(&db_path).expect("Failed to initialize database");
    let engine = DownloadEngine::new(storage, temp_dir.to_str().unwrap().to_string());
    let engine_copy = engine.clone();

    let (task_tx, mut task_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Start embedded HTTP server on 127.0.0.1:45678 for browser extensions & local integration
    let engine_http = engine.clone();
    let task_tx_clone = task_tx.clone();
    tokio::spawn(async move {
        let cb = move |task_id: String| {
            let _ = task_tx_clone.send(task_id);
        };
        if let Err(e) = start_http_server(engine_http, "127.0.0.1:45678", Some(cb)).await {
            eprintln!("[Desktop HTTP Server] Could not bind 127.0.0.1:45678: {}", e);
        }
    });

    // Background scheduler loop to poll scheduled and queued tasks
    let engine_sched = engine.clone();
    tokio::spawn(async move {
        let scheduler = engine_sched.scheduler();
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            if let Some(next_id) = scheduler.poll_next_task(chrono::Utc::now()).await {
                let worker = engine_sched.clone();
                tokio::spawn(async move {
                    if let Err(e) = worker.start_download(&next_id, None).await {
                        eprintln!("[Scheduler Error] Task {} failed: {}", next_id, e);
                    }
                });
            }
        }
    });

    tauri::Builder::default()
        .setup(move |app| {
            setup_tray(app.handle())?;
            if let Some(window) = app.get_webview_window("main") {
                if launch_minimized {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                }
            }

            // Task event listener from HTTP server / Extension interception
            let app_handle = app.handle().clone();
            let engine_popup_check = engine_copy.clone();
            tokio::spawn(async move {
                while let Some(task_id) = task_rx.recv().await {
                    let should_popup = if let Ok(Some(json_str)) = engine_popup_check.get_setting("app_settings") {
                        serde_json::from_str::<AppSettings>(&json_str)
                            .map(|s| s.show_progress_dialog)
                            .unwrap_or(true)
                    } else {
                        true
                    };

                    if should_popup {
                        let _ = spawn_progress_window(&app_handle, &task_id);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // If closing a progress window, let Tauri destroy the progress window without cancelling download
                if window.label().starts_with("download-progress-") {
                    return;
                }

                // If closing main window, prevent destruction and hide to system tray
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .manage(AppState {
            engine: Mutex::new(engine),
        })
        .invoke_handler(tauri::generate_handler![
            list_tasks,
            get_task,
            get_segments,
            add_task,
            open_progress_window,
            pause_task,
            resume_task,
            cancel_task,
            delete_task,
            set_speed_limit,
            get_settings,
            save_settings,
            schedule_task,
            list_scheduled,
            probe_m3u8_variants,
            set_autostart,
            get_autostart,
            open_file_folder,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

