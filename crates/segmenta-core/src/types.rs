use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskStatus {
    Queued,
    Downloading,
    Paused,
    PausedByError,
    Completed,
    Failed,
    Cancelled,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "QUEUED",
            Self::Downloading => "DOWNLOADING",
            Self::Paused => "PAUSED",
            Self::PausedByError => "PAUSED_BY_ERROR",
            Self::Completed => "COMPLETED",
            Self::Failed => "FAILED",
            Self::Cancelled => "CANCELLED",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s {
            "DOWNLOADING" => Self::Downloading,
            "PAUSED" => Self::Paused,
            "PAUSED_BY_ERROR" => Self::PausedByError,
            "COMPLETED" => Self::Completed,
            "FAILED" => Self::Failed,
            "CANCELLED" => Self::Cancelled,
            _ => Self::Queued,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SegmentStatus {
    Pending,
    Downloading,
    Paused,
    Completed,
    Failed,
}

impl SegmentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Downloading => "DOWNLOADING",
            Self::Paused => "PAUSED",
            Self::Completed => "COMPLETED",
            Self::Failed => "FAILED",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s {
            "DOWNLOADING" => Self::Downloading,
            "PAUSED" => Self::Paused,
            "COMPLETED" => Self::Completed,
            "FAILED" => Self::Failed,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRecord {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub save_path: String,
    pub temp_path: String,
    pub status: TaskStatus,
    pub total_size: Option<u64>,
    pub downloaded_size: u64,
    pub segments_count: u32,
    pub speed_limit_bytes: Option<u64>,
    pub priority: u32,
    pub category_id: Option<String>,
    pub headers: HashMap<String, String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub checksum_sha256: Option<String>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentRecord {
    pub id: String,
    pub task_id: String,
    pub segment_index: u32,
    pub start_offset: u64,
    pub end_offset: Option<u64>,
    pub downloaded_bytes: u64,
    pub status: SegmentStatus,
    pub part_filename: String,
    pub attempts: u32,
    pub last_error: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub download_dir: String,
    pub max_concurrent_downloads: usize,
    pub default_segments: u32,
    pub speed_limit_kb: u64,
    pub theme: String,
    pub auto_categorize: bool,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default)]
    pub start_minimized: bool,
    #[serde(default = "default_true")]
    pub show_progress_dialog: bool,
    #[serde(default)]
    pub language: Option<String>,
}

fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            download_dir: dirs_fallback_download_dir(),
            max_concurrent_downloads: 3,
            default_segments: 8,
            speed_limit_kb: 0,
            theme: "system".to_string(),
            auto_categorize: true,
            autostart: false,
            start_minimized: false,
            show_progress_dialog: true,
            language: Some("en".to_string()),
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

