use segmenta_core::storage::Storage;
use segmenta_core::types::{SegmentRecord, SegmentStatus, TaskRecord, TaskStatus};
use std::collections::HashMap;

#[tokio::test]
async fn test_storage_task_crud_and_segments() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("test_segmenta.db");

    let storage = Storage::new(&db_path).expect("Failed to init storage");

    let task = TaskRecord {
        id: "task-123".to_string(),
        url: "https://example.com/file.zip".to_string(),
        filename: "file.zip".to_string(),
        save_path: "/downloads/file.zip".to_string(),
        temp_path: "/temp/task-123".to_string(),
        status: TaskStatus::Queued,
        total_size: Some(10485760),
        downloaded_size: 0,
        segments_count: 2,
        speed_limit_bytes: None,
        priority: 5,
        category_id: None,
        headers: HashMap::new(),
        etag: Some("etag-xyz".to_string()),
        last_modified: None,
        checksum_sha256: None,
        error_message: None,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        finished_at: None,
    };

    storage.save_task(&task).unwrap();
    let retrieved = storage
        .get_task("task-123")
        .unwrap()
        .expect("Task not found");
    assert_eq!(retrieved.id, "task-123");
    assert_eq!(retrieved.status, TaskStatus::Queued);

    let seg1 = SegmentRecord {
        id: "seg-1".to_string(),
        task_id: "task-123".to_string(),
        segment_index: 0,
        start_offset: 0,
        end_offset: Some(5242879),
        downloaded_bytes: 0,
        status: SegmentStatus::Pending,
        part_filename: "file.part.000".to_string(),
        attempts: 0,
        last_error: None,
        updated_at: chrono::Utc::now(),
    };
    storage.save_segment(&seg1).unwrap();

    let segments = storage.get_segments_for_task("task-123").unwrap();
    assert_eq!(segments.len(), 1);
    assert_eq!(segments[0].segment_index, 0);

    // Test fast progress updates
    storage.update_segment_progress("task-123", 0, 1024).unwrap();
    let segments_after = storage.get_segments_for_task("task-123").unwrap();
    assert_eq!(segments_after[0].downloaded_bytes, 1024);

    storage.update_task_progress("task-123", 1024).unwrap();
    let task_after = storage.get_task("task-123").unwrap().unwrap();
    assert_eq!(task_after.downloaded_size, 1024);

    storage
        .update_task_status("task-123", TaskStatus::Downloading, None)
        .unwrap();
    let updated = storage.get_task("task-123").unwrap().unwrap();
    assert_eq!(updated.status, TaskStatus::Downloading);

    let list = storage.list_tasks().unwrap();
    assert_eq!(list.len(), 1);

    storage.delete_task("task-123").unwrap();
    let deleted = storage.get_task("task-123").unwrap();
    assert!(deleted.is_none());
}
