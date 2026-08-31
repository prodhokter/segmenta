use crate::media::download_hls;
use crate::scheduler::DownloadScheduler;
use crate::segment::{calculate_segments, download_segment, reassemble_segments};
use crate::storage::Storage;
use crate::throttler::TokenBucket;
use crate::types::{SegmentStatus, TaskRecord, TaskStatus};
use chrono::Utc;
use reqwest::header::{ACCEPT_RANGES, CONTENT_DISPOSITION, CONTENT_LENGTH, ETAG, LAST_MODIFIED};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Clone)]
pub struct DownloadEngine {
    storage: Storage,
    client: Client,
    throttler: Arc<TokenBucket>,
    scheduler: Arc<DownloadScheduler>,
    temp_dir: String,
    active_tasks: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl DownloadEngine {
    pub fn new(storage: Storage, temp_dir: String) -> Self {
        Self {
            storage,
            client: Client::builder()
                .pool_max_idle_per_host(8)
                .build()
                .unwrap_or_default(),
            throttler: Arc::new(TokenBucket::new(None)),
            scheduler: Arc::new(DownloadScheduler::new(3)),
            temp_dir,
            active_tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn scheduler(&self) -> Arc<DownloadScheduler> {
        self.scheduler.clone()
    }

    pub fn set_speed_limit(&self, speed_limit_bytes: Option<u64>) {
        self.throttler.set_limit(speed_limit_bytes);
    }

    pub fn get_task(&self, task_id: &str) -> rusqlite::Result<Option<TaskRecord>> {
        self.storage.get_task(task_id)
    }

    pub fn get_segments(
        &self,
        task_id: &str,
    ) -> rusqlite::Result<Vec<crate::types::SegmentRecord>> {
        self.storage.get_segments_for_task(task_id)
    }

    pub fn list_tasks(&self) -> rusqlite::Result<Vec<TaskRecord>> {
        self.storage.list_tasks()
    }

    pub fn save_setting(&self, key: &str, value_json: &str) -> rusqlite::Result<()> {
        self.storage.save_setting(key, value_json)
    }

    pub fn get_setting(&self, key: &str) -> rusqlite::Result<Option<String>> {
        self.storage.get_setting(key)
    }

    pub async fn add_task(
        &self,
        url: String,
        mut filename: String,
        save_path: String,
        segments_count: u32,
        headers: HashMap<String, String>,
    ) -> Result<String, String> {
        let task_id = Uuid::new_v4().to_string();
        let temp_task_dir = format!("{}/task_{}", self.temp_dir, task_id);
        let _ = tokio::fs::create_dir_all(&temp_task_dir).await;

        let is_m3u8 = url.split('?').next().unwrap_or(&url).ends_with(".m3u8");

        // Dispatch probe request (HEAD, fallback to GET Range bytes=0-0 if HEAD fails or doesn't return length)
        let mut total_size = None;
        let mut etag = None;
        let mut last_modified = None;
        let mut accept_ranges = false;

        if !is_m3u8 {
            let mut head_req = self.client.head(&url);
            for (k, v) in &headers {
                if let (Ok(h_name), Ok(h_val)) = (
                    reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                    reqwest::header::HeaderValue::from_str(v),
                ) {
                    head_req = head_req.header(h_name, h_val);
                }
            }

            let head_res = head_req.send().await;
            if let Ok(res) = head_res {
                if res.status().is_success() {
                    let res_headers = res.headers();
                    if let Some(cl) = res_headers
                        .get(CONTENT_LENGTH)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.parse::<u64>().ok())
                    {
                        total_size = Some(cl);
                    }
                    if let Some(ar) = res_headers.get(ACCEPT_RANGES).and_then(|v| v.to_str().ok()) {
                        if ar.to_lowercase().contains("bytes") {
                            accept_ranges = true;
                        }
                    }
                    if let Some(et) = res_headers.get(ETAG).and_then(|v| v.to_str().ok()) {
                        etag = Some(et.to_string());
                    }
                    if let Some(lm) = res_headers.get(LAST_MODIFIED).and_then(|v| v.to_str().ok()) {
                        last_modified = Some(lm.to_string());
                    }
                    if filename.is_empty() {
                        if let Some(cd) = res_headers
                            .get(CONTENT_DISPOSITION)
                            .and_then(|v| v.to_str().ok())
                        {
                            if let Some(extracted) = parse_filename_from_cd(cd) {
                                filename = extracted;
                            }
                        }
                    }
                }
            }
        }

        if filename.is_empty() {
            let path_part = url
                .split('?')
                .next()
                .unwrap_or("")
                .split('/')
                .next_back()
                .filter(|s| !s.is_empty())
                .unwrap_or("download.bin");

            filename = if is_m3u8 && path_part.ends_with(".m3u8") {
                format!("{}.ts", path_part.trim_end_matches(".m3u8"))
            } else {
                path_part.to_string()
            };
        }

        let effective_segments_count = if is_m3u8 {
            1
        } else if accept_ranges || total_size.is_some() {
            segments_count.clamp(1, 32)
        } else {
            1
        };

        // Ensure save_path points to the full target file path, not just the directory
        let resolved_save_path = {
            let p = std::path::Path::new(&save_path);
            if p.is_dir()
                || save_path.ends_with('/')
                || save_path.ends_with('\\')
                || p.file_name().map_or(true, |f| f != filename.as_str())
            {
                p.join(&filename).to_string_lossy().to_string()
            } else {
                save_path.clone()
            }
        };

        let task = TaskRecord {
            id: task_id.clone(),
            url,
            filename,
            save_path: resolved_save_path,
            temp_path: temp_task_dir.clone(),
            status: TaskStatus::Queued,
            total_size,
            downloaded_size: 0,
            segments_count: effective_segments_count,
            speed_limit_bytes: None,
            priority: 5,
            category_id: None,
            headers,
            etag,
            last_modified,
            checksum_sha256: None,
            error_message: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            finished_at: None,
        };

        self.storage
            .save_task(&task)
            .map_err(|e| format!("Database error: {}", e))?;

        if !is_m3u8 {
            if let Some(size) = total_size {
                let segments = calculate_segments(&task_id, size, task.segments_count, &temp_task_dir);
                for seg in segments {
                    let _ = self.storage.save_segment(&seg);
                }
            }
        }

        self.scheduler.enqueue_task(task_id.clone()).await;

        Ok(task_id)
    }

    pub async fn pause_task(&self, task_id: &str) -> Result<(), String> {
        let mut active = self.active_tasks.lock().await;
        if let Some(token) = active.remove(task_id) {
            token.cancel();
        }

        self.scheduler.mark_completed_or_inactive(task_id).await;
        let _ = self.scheduler.remove_from_queue(task_id).await;

        self.storage
            .update_task_status(task_id, TaskStatus::Paused, None)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn cancel_task(&self, task_id: &str) -> Result<(), String> {
        let mut active = self.active_tasks.lock().await;
        if let Some(token) = active.remove(task_id) {
            token.cancel();
        }

        self.scheduler.mark_completed_or_inactive(task_id).await;
        let _ = self.scheduler.remove_from_queue(task_id).await;

        self.storage
            .update_task_status(task_id, TaskStatus::Cancelled, None)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn start_download(
        &self,
        task_id: &str,
        progress_sender: Option<broadcast::Sender<TaskRecord>>,
    ) -> Result<(), String> {
        let task_opt = self.storage.get_task(task_id).map_err(|e| e.to_string())?;
        let mut task = task_opt.ok_or_else(|| "Task not found".to_string())?;

        let cancel_token = CancellationToken::new();
        {
            let mut active = self.active_tasks.lock().await;
            active.insert(task_id.to_string(), cancel_token.clone());
        }
        self.scheduler.mark_active(task_id.to_string()).await;

        task.status = TaskStatus::Downloading;
        task.updated_at = Utc::now();
        self.storage
            .update_task_status(task_id, TaskStatus::Downloading, None)
            .map_err(|e| e.to_string())?;

        if let Some(ref sender) = progress_sender {
            let _ = sender.send(task.clone());
        }

        let is_m3u8 = task.url.split('?').next().unwrap_or(&task.url).ends_with(".m3u8");

        if is_m3u8 {
            let (tx, mut rx) = mpsc::channel::<(u32, u32)>(100);
            let progress_sender_clone = progress_sender.clone();
            let storage_clone = self.storage.clone();
            let task_clone = task.clone();
            let task_id_str = task_id.to_string();
            let progress_hdl = tokio::spawn(async move {
                let mut last_save = std::time::Instant::now();
                while let Some((curr, total)) = rx.recv().await {
                    let dl_size = curr as u64;
                    let tot_size = total as u64;

                    if last_save.elapsed() >= std::time::Duration::from_millis(100) {
                        let _ = storage_clone.update_task_progress(&task_id_str, dl_size);
                        last_save = std::time::Instant::now();
                    }

                    if let Some(ref sender) = progress_sender_clone {
                        let mut t = task_clone.clone();
                        t.downloaded_size = dl_size;
                        t.total_size = Some(tot_size);
                        let _ = sender.send(t);
                    }
                }
            });

            let res = download_hls(
                &self.client,
                &task.url,
                &task.headers,
                &task.save_path,
                self.throttler.clone(),
                Some(cancel_token.clone()),
                Some(tx),
            )
            .await;

            let _ = progress_hdl.await;

            {
                let mut active = self.active_tasks.lock().await;
                active.remove(task_id);
            }
            self.scheduler.mark_completed_or_inactive(task_id).await;

            match res {
                Ok(total_bytes) => {
                    let mut completed_task = task.clone();
                    completed_task.status = TaskStatus::Completed;
                    completed_task.downloaded_size = total_bytes;
                    completed_task.total_size = Some(total_bytes);
                    completed_task.finished_at = Some(Utc::now());
                    completed_task.updated_at = Utc::now();
                    let _ = self.storage.save_task(&completed_task);

                    if let Some(sender) = progress_sender {
                        let _ = sender.send(completed_task);
                    }
                    return Ok(());
                }
                Err(err) => {
                    if err == "Cancelled" {
                        return Ok(());
                    }
                    self.storage
                        .update_task_status(task_id, TaskStatus::Failed, Some(err.clone()))
                        .map_err(|e| e.to_string())?;
                    return Err(err);
                }
            }
        }

        let mut segments = self
            .storage
            .get_segments_for_task(task_id)
            .map_err(|e| e.to_string())?;

        // If no segments exist (e.g. dynamic/streaming file size unknown during probe), generate a single segment
        if segments.is_empty() {
            let part_filename = format!("{}/task_{}_part_000.part", task.temp_path, task_id);
            let single_seg = crate::types::SegmentRecord {
                id: format!("{}-seg-0", task_id),
                task_id: task_id.to_string(),
                segment_index: 0,
                start_offset: 0,
                end_offset: task.total_size.map(|s| if s > 0 { s - 1 } else { 0 }),
                downloaded_bytes: 0,
                status: SegmentStatus::Pending,
                part_filename,
                attempts: 0,
                last_error: None,
                updated_at: Utc::now(),
            };
            self.storage
                .save_segment(&single_seg)
                .map_err(|e| e.to_string())?;
            segments.push(single_seg);
        }

        let (tx, mut rx) = mpsc::channel::<(u32, u64)>(100);
        let mut handles = Vec::new();

        for mut seg in segments.clone() {
            if seg.status == SegmentStatus::Completed {
                continue;
            }
            let client = self.client.clone();
            let url = task.url.clone();
            let headers = task.headers.clone();
            let throttler = self.throttler.clone();
            let tx_clone = tx.clone();
            let c_token = cancel_token.clone();

            let handle = tokio::spawn(async move {
                tokio::select! {
                    _ = c_token.cancelled() => {
                        Err("Cancelled".to_string())
                    }
                    res = download_segment(&client, &url, &headers, &mut seg, throttler, tx_clone) => {
                        res
                    }
                }
            });
            handles.push(handle);
        }
        drop(tx);

        // Progress listener & state tracking
        let storage_clone = self.storage.clone();
        let progress_sender_clone = progress_sender.clone();
        let mut task_state = task.clone();
        let task_id_str = task_id.to_string();

        let progress_handle = tokio::spawn(async move {
            let mut last_save = std::time::Instant::now();
            let mut segment_progress: HashMap<u32, u64> = HashMap::new();

            while let Some((seg_idx, bytes_for_seg)) = rx.recv().await {
                segment_progress.insert(seg_idx, bytes_for_seg);
                let total_downloaded: u64 = segment_progress.values().sum();

                if last_save.elapsed() >= std::time::Duration::from_millis(100) {
                    let _ = storage_clone.update_segment_progress(&task_id_str, seg_idx, bytes_for_seg);
                    let _ = storage_clone.update_task_progress(&task_id_str, total_downloaded);

                    task_state.downloaded_size = total_downloaded;
                    task_state.updated_at = Utc::now();
                    if let Some(ref sender) = progress_sender_clone {
                        let _ = sender.send(task_state.clone());
                    }
                    last_save = std::time::Instant::now();
                }
            }

            // Final progress update when channel closes
            let total_downloaded: u64 = segment_progress.values().sum();
            for (&idx, &bytes) in &segment_progress {
                let _ = storage_clone.update_segment_progress(&task_id_str, idx, bytes);
            }
            let _ = storage_clone.update_task_progress(&task_id_str, total_downloaded);
            task_state.downloaded_size = total_downloaded;
            task_state.updated_at = Utc::now();
            if let Some(ref sender) = progress_sender_clone {
                let _ = sender.send(task_state.clone());
            }
        });

        // Await segment completions
        let mut download_error: Option<String> = None;
        for handle in handles {
            match handle.await {
                Ok(Ok(())) => {}
                Ok(Err(err)) => {
                    if err == "Cancelled" {
                        // Handled by cancel_token/pause_task
                        return Ok(());
                    }
                    download_error = Some(err);
                }
                Err(join_err) => {
                    download_error = Some(join_err.to_string());
                }
            }
        }

        let _ = progress_handle.await;

        {
            let mut active = self.active_tasks.lock().await;
            active.remove(task_id);
        }
        self.scheduler.mark_completed_or_inactive(task_id).await;

        if let Some(err) = download_error {
            self.storage
                .update_task_status(task_id, TaskStatus::Failed, Some(err.clone()))
                .map_err(|e| e.to_string())?;
            return Err(err);
        }

        // Reassembly
        let part_files: Vec<String> = segments.iter().map(|s| s.part_filename.clone()).collect();
        reassemble_segments(&part_files, &task.save_path)
            .await
            .map_err(|e| format!("Reassembly failed: {}", e))?;

        self.storage
            .update_task_status(task_id, TaskStatus::Completed, None)
            .map_err(|e| e.to_string())?;

        if let Some(sender) = progress_sender {
            if let Ok(Some(finished_task)) = self.storage.get_task(task_id) {
                let _ = sender.send(finished_task);
            }
        }

        Ok(())
    }
}

fn parse_filename_from_cd(cd: &str) -> Option<String> {
    for part in cd.split(';') {
        let trimmed = part.trim();
        if let Some(rest) = trimmed.strip_prefix("filename=") {
            let clean = rest.trim_matches('"').trim_matches('\'');
            if !clean.is_empty() {
                return Some(clean.to_string());
            }
        }
    }
    None
}
