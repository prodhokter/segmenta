use crate::types::{SegmentRecord, SegmentStatus, TaskRecord, TaskStatus};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct Storage {
    conn: Arc<Mutex<Connection>>,
}

impl Storage {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )?;

        let storage = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.migrate()?;
        Ok(storage)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                filename TEXT NOT NULL,
                save_path TEXT NOT NULL,
                temp_path TEXT NOT NULL,
                status TEXT NOT NULL,
                total_size INTEGER,
                downloaded_size INTEGER NOT NULL DEFAULT 0,
                segments_count INTEGER NOT NULL DEFAULT 8,
                speed_limit_bytes INTEGER,
                priority INTEGER NOT NULL DEFAULT 5,
                category_id TEXT,
                headers_json TEXT NOT NULL DEFAULT '{}',
                etag TEXT,
                last_modified TEXT,
                checksum_sha256 TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                finished_at TEXT
            );
            CREATE TABLE IF NOT EXISTS segments (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                segment_index INTEGER NOT NULL,
                start_offset INTEGER NOT NULL,
                end_offset INTEGER,
                downloaded_bytes INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                part_filename TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_segments_task ON segments(task_id);",
        )?;
        Ok(())
    }

    pub fn save_task(&self, task: &TaskRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let headers_json =
            serde_json::to_string(&task.headers).unwrap_or_else(|_| "{}".to_string());
        conn.execute(
            "INSERT OR REPLACE INTO tasks (
                id, url, filename, save_path, temp_path, status, total_size,
                downloaded_size, segments_count, speed_limit_bytes, priority,
                category_id, headers_json, etag, last_modified, checksum_sha256,
                error_message, created_at, updated_at, finished_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![
                task.id,
                task.url,
                task.filename,
                task.save_path,
                task.temp_path,
                task.status.as_str(),
                task.total_size,
                task.downloaded_size,
                task.segments_count,
                task.speed_limit_bytes,
                task.priority,
                task.category_id,
                headers_json,
                task.etag,
                task.last_modified,
                task.checksum_sha256,
                task.error_message,
                task.created_at.to_rfc3339(),
                task.updated_at.to_rfc3339(),
                task.finished_at.map(|t| t.to_rfc3339()),
            ],
        )?;
        Ok(())
    }

    pub fn get_task(&self, id: &str) -> Result<Option<TaskRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, url, filename, save_path, temp_path, status, total_size,
                    downloaded_size, segments_count, speed_limit_bytes, priority,
                    category_id, headers_json, etag, last_modified, checksum_sha256,
                    error_message, created_at, updated_at, finished_at
             FROM tasks WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let headers_json: String = row.get(12)?;
            let headers: HashMap<String, String> =
                serde_json::from_str(&headers_json).unwrap_or_default();
            let status_str: String = row.get(5)?;
            let created_at_str: String = row.get(17)?;
            let updated_at_str: String = row.get(18)?;
            let finished_at_str: Option<String> = row.get(19)?;

            Ok(Some(TaskRecord {
                id: row.get(0)?,
                url: row.get(1)?,
                filename: row.get(2)?,
                save_path: row.get(3)?,
                temp_path: row.get(4)?,
                status: TaskStatus::from_str(&status_str),
                total_size: row.get(6)?,
                downloaded_size: row.get(7)?,
                segments_count: row.get(8)?,
                speed_limit_bytes: row.get(9)?,
                priority: row.get(10)?,
                category_id: row.get(11)?,
                headers,
                etag: row.get(13)?,
                last_modified: row.get(14)?,
                checksum_sha256: row.get(15)?,
                error_message: row.get(16)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_at_str)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                finished_at: finished_at_str.and_then(|s| {
                    DateTime::parse_from_rfc3339(&s)
                        .map(|d| d.with_timezone(&Utc))
                        .ok()
                }),
            }))
        } else {
            Ok(None)
        }
    }

    pub fn list_tasks(&self) -> Result<Vec<TaskRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, url, filename, save_path, temp_path, status, total_size,
                    downloaded_size, segments_count, speed_limit_bytes, priority,
                    category_id, headers_json, etag, last_modified, checksum_sha256,
                    error_message, created_at, updated_at, finished_at
             FROM tasks ORDER BY created_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            let headers_json: String = row.get(12)?;
            let headers: HashMap<String, String> =
                serde_json::from_str(&headers_json).unwrap_or_default();
            let status_str: String = row.get(5)?;
            let created_at_str: String = row.get(17)?;
            let updated_at_str: String = row.get(18)?;
            let finished_at_str: Option<String> = row.get(19)?;

            Ok(TaskRecord {
                id: row.get(0)?,
                url: row.get(1)?,
                filename: row.get(2)?,
                save_path: row.get(3)?,
                temp_path: row.get(4)?,
                status: TaskStatus::from_str(&status_str),
                total_size: row.get(6)?,
                downloaded_size: row.get(7)?,
                segments_count: row.get(8)?,
                speed_limit_bytes: row.get(9)?,
                priority: row.get(10)?,
                category_id: row.get(11)?,
                headers,
                etag: row.get(13)?,
                last_modified: row.get(14)?,
                checksum_sha256: row.get(15)?,
                error_message: row.get(16)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_at_str)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                finished_at: finished_at_str.and_then(|s| {
                    DateTime::parse_from_rfc3339(&s)
                        .map(|d| d.with_timezone(&Utc))
                        .ok()
                }),
            })
        })?;

        let mut tasks = Vec::new();
        for task in rows {
            tasks.push(task?);
        }
        Ok(tasks)
    }

    pub fn update_task_status(
        &self,
        task_id: &str,
        status: TaskStatus,
        error_message: Option<String>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let finished_at = if status == TaskStatus::Completed || status == TaskStatus::Failed {
            Some(Utc::now().to_rfc3339())
        } else {
            None
        };

        conn.execute(
            "UPDATE tasks SET status = ?1, error_message = ?2, updated_at = ?3, finished_at = COALESCE(?4, finished_at) WHERE id = ?5",
            params![status.as_str(), error_message, Utc::now().to_rfc3339(), finished_at, task_id],
        )?;
        Ok(())
    }

    pub fn save_segment(&self, segment: &SegmentRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO segments (
                id, task_id, segment_index, start_offset, end_offset,
                downloaded_bytes, status, part_filename, attempts, last_error, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                segment.id,
                segment.task_id,
                segment.segment_index,
                segment.start_offset,
                segment.end_offset,
                segment.downloaded_bytes,
                segment.status.as_str(),
                segment.part_filename,
                segment.attempts,
                segment.last_error,
                segment.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn get_segments_for_task(&self, task_id: &str) -> Result<Vec<SegmentRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, task_id, segment_index, start_offset, end_offset,
                    downloaded_bytes, status, part_filename, attempts, last_error, updated_at
             FROM segments WHERE task_id = ?1 ORDER BY segment_index ASC",
        )?;

        let rows = stmt.query_map(params![task_id], |row| {
            let status_str: String = row.get(6)?;
            let updated_at_str: String = row.get(10)?;
            Ok(SegmentRecord {
                id: row.get(0)?,
                task_id: row.get(1)?,
                segment_index: row.get(2)?,
                start_offset: row.get(3)?,
                end_offset: row.get(4)?,
                downloaded_bytes: row.get(5)?,
                status: SegmentStatus::from_str(&status_str),
                part_filename: row.get(7)?,
                attempts: row.get(8)?,
                last_error: row.get(9)?,
                updated_at: DateTime::parse_from_rfc3339(&updated_at_str)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        })?;

        let mut segments = Vec::new();
        for seg in rows {
            segments.push(seg?);
        }
        Ok(segments)
    }

    pub fn delete_task(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        Ok(())
    }
}
