use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FileCategory {
    Video,
    Audio,
    Documents,
    Archives,
    Applications,
    Other,
}

impl FileCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Video => "Video",
            Self::Audio => "Audio",
            Self::Documents => "Documents",
            Self::Archives => "Archives",
            Self::Applications => "Applications",
            Self::Other => "Other",
        }
    }

    pub fn from_filename_or_url(name_or_url: &str) -> Self {
        let clean = name_or_url.split('?').next().unwrap_or(name_or_url);
        let ext = Path::new(clean)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        match ext.as_str() {
            "mp4" | "mkv" | "avi" | "mov" | "webm" | "flv" | "wmv" | "ts" | "m3u8" | "m4v" => {
                Self::Video
            }
            "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" | "opus" => Self::Audio,
            "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "epub"
            | "csv" => Self::Documents,
            "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" | "dmg" => Self::Archives,
            "exe" | "msi" | "apk" | "deb" | "rpm" | "appimage" | "dmg_app" | "bat" | "sh" => {
                Self::Applications
            }
            _ => Self::Other,
        }
    }
}

pub fn route_category_path<P: AsRef<Path>>(base_download_dir: P, filename: &str) -> PathBuf {
    let category = FileCategory::from_filename_or_url(filename);
    base_download_dir.as_ref().join(category.as_str()).join(filename)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleRule {
    pub start_at: Option<DateTime<Utc>>,
    pub stop_at: Option<DateTime<Utc>>,
    pub auto_start_on_add: bool,
}

impl Default for ScheduleRule {
    fn default() -> Self {
        Self {
            start_at: None,
            stop_at: None,
            auto_start_on_add: true,
        }
    }
}

pub struct DownloadScheduler {
    max_active_downloads: usize,
    queue: Arc<Mutex<VecDeque<String>>>,
    active_set: Arc<Mutex<Vec<String>>>,
    rules: Arc<Mutex<ScheduleRule>>,
}

impl DownloadScheduler {
    pub fn new(max_active_downloads: usize) -> Self {
        Self {
            max_active_downloads: max_active_downloads.max(1),
            queue: Arc::new(Mutex::new(VecDeque::new())),
            active_set: Arc::new(Mutex::new(Vec::new())),
            rules: Arc::new(Mutex::new(ScheduleRule::default())),
        }
    }

    pub fn max_active(&self) -> usize {
        self.max_active_downloads
    }

    pub fn set_max_active(&mut self, max: usize) {
        self.max_active_downloads = max.max(1);
    }

    pub async fn set_schedule_rule(&self, rule: ScheduleRule) {
        let mut r = self.rules.lock().await;
        *r = rule;
    }

    pub async fn get_schedule_rule(&self) -> ScheduleRule {
        let r = self.rules.lock().await;
        r.clone()
    }

    pub async fn enqueue_task(&self, task_id: String) {
        let mut q = self.queue.lock().await;
        if !q.contains(&task_id) {
            q.push_back(task_id);
        }
    }

    pub async fn remove_from_queue(&self, task_id: &str) -> bool {
        let mut q = self.queue.lock().await;
        if let Some(pos) = q.iter().position(|id| id == task_id) {
            q.remove(pos);
            true
        } else {
            false
        }
    }

    pub async fn mark_active(&self, task_id: String) {
        let mut act = self.active_set.lock().await;
        if !act.contains(&task_id) {
            act.push(task_id);
        }
    }

    pub async fn mark_completed_or_inactive(&self, task_id: &str) {
        let mut act = self.active_set.lock().await;
        act.retain(|id| id != task_id);
    }

    pub async fn active_count(&self) -> usize {
        let act = self.active_set.lock().await;
        act.len()
    }

    pub async fn queue_len(&self) -> usize {
        let q = self.queue.lock().await;
        q.len()
    }

    pub async fn should_run_now(&self, now: DateTime<Utc>) -> bool {
        let r = self.rules.lock().await;
        if let Some(start) = r.start_at {
            if now < start {
                return false;
            }
        }
        if let Some(stop) = r.stop_at {
            if now >= stop {
                return false;
            }
        }
        true
    }

    pub async fn poll_next_task(&self, now: DateTime<Utc>) -> Option<String> {
        if !self.should_run_now(now).await {
            return None;
        }

        let mut act = self.active_set.lock().await;
        if act.len() >= self.max_active_downloads {
            return None;
        }

        let mut q = self.queue.lock().await;
        if let Some(task_id) = q.pop_front() {
            act.push(task_id.clone());
            Some(task_id)
        } else {
            None
        }
    }
}
