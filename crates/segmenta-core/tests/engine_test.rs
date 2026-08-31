use segmenta_core::engine::DownloadEngine;
use segmenta_core::storage::Storage;
use segmenta_core::types::TaskStatus;
use std::collections::HashMap;

#[tokio::test]
async fn test_engine_add_and_probe_task() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("engine_test.db");
    let storage = Storage::new(&db_path).unwrap();
    let engine = DownloadEngine::new(storage, temp_dir.path().to_str().unwrap().to_string());

    let task_id = engine
        .add_task(
            "https://httpbin.org/bytes/10240".to_string(),
            "bytes.bin".to_string(),
            temp_dir
                .path()
                .join("bytes.bin")
                .to_str()
                .unwrap()
                .to_string(),
            4,
            HashMap::new(),
        )
        .await
        .unwrap();

    let task = engine.get_task(&task_id).unwrap().expect("Task not found");
    assert_eq!(task.filename, "bytes.bin");
    assert_eq!(task.status, TaskStatus::Queued);
    assert_eq!(task.segments_count, 4);

    let list = engine.list_tasks().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, task_id);
}

#[tokio::test]
async fn test_engine_pause_and_cancel_task() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("engine_control_test.db");
    let storage = Storage::new(&db_path).unwrap();
    let engine = DownloadEngine::new(storage, temp_dir.path().to_str().unwrap().to_string());

    let task_id = engine
        .add_task(
            "https://example.com/test.zip".to_string(),
            "test.zip".to_string(),
            temp_dir
                .path()
                .join("test.zip")
                .to_str()
                .unwrap()
                .to_string(),
            2,
            HashMap::new(),
        )
        .await
        .unwrap();

    // Test pause
    engine.pause_task(&task_id).await.unwrap();
    let paused_task = engine.get_task(&task_id).unwrap().unwrap();
    assert_eq!(paused_task.status, TaskStatus::Paused);

    // Test resume task updates status to queued and doesn't fail
    engine.resume_task(&task_id).await.unwrap();
    let resumed_task = engine.get_task(&task_id).unwrap().unwrap();
    assert!(resumed_task.status == TaskStatus::Queued || resumed_task.status == TaskStatus::Downloading);

    // Test cancel without file cleanup
    engine.cancel_task(&task_id, false).await.unwrap();
    let cancelled_task = engine.get_task(&task_id).unwrap().unwrap();
    assert_eq!(cancelled_task.status, TaskStatus::Cancelled);

    // Test delete task
    engine.delete_task(&task_id, true).await.unwrap();
    let deleted_task = engine.get_task(&task_id).unwrap();
    assert!(deleted_task.is_none());
}

#[tokio::test]
async fn test_engine_cancel_with_partial_cleanup() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("engine_cleanup_test.db");
    let storage = Storage::new(&db_path).unwrap();
    let engine = DownloadEngine::new(storage, temp_dir.path().to_str().unwrap().to_string());

    let task_id = engine
        .add_task(
            "https://example.com/test2.zip".to_string(),
            "test2.zip".to_string(),
            temp_dir
                .path()
                .join("test2.zip")
                .to_str()
                .unwrap()
                .to_string(),
            2,
            HashMap::new(),
        )
        .await
        .unwrap();

    let task = engine.get_task(&task_id).unwrap().unwrap();
    let part_path = std::path::Path::new(&task.temp_path).join("dummy.part");
    std::fs::write(&part_path, b"partial data").unwrap();
    assert!(part_path.exists());

    engine.cancel_task(&task_id, true).await.unwrap();
    let cancelled_task = engine.get_task(&task_id).unwrap().unwrap();
    assert_eq!(cancelled_task.status, TaskStatus::Cancelled);
    assert!(!part_path.exists());
}

#[tokio::test]
async fn test_engine_save_path_resolution() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("engine_path_test.db");
    let storage = Storage::new(&db_path).unwrap();
    let engine = DownloadEngine::new(storage, temp_dir.path().to_str().unwrap().to_string());

    // When save_path is just a directory
    let dir_save_path = temp_dir.path().to_str().unwrap().to_string();
    let task_id = engine
        .add_task(
            "https://example.com/somefile.zip".to_string(),
            "somefile.zip".to_string(),
            dir_save_path.clone(),
            2,
            HashMap::new(),
        )
        .await
        .unwrap();

    let task = engine.get_task(&task_id).unwrap().unwrap();
    let expected_file_path = temp_dir.path().join("somefile.zip").to_string_lossy().to_string();
    assert_eq!(task.save_path, expected_file_path);
}

#[tokio::test]
async fn test_engine_set_speed_limit() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("engine_speed_test.db");
    let storage = Storage::new(&db_path).unwrap();
    let engine = DownloadEngine::new(storage, temp_dir.path().to_str().unwrap().to_string());

    engine.set_speed_limit(Some(500_000));
}

#[tokio::test]
async fn test_engine_unknown_content_length_and_single_segment() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("engine_stream_test.db");
    let storage = Storage::new(&db_path).unwrap();
    let engine = DownloadEngine::new(storage, temp_dir.path().to_str().unwrap().to_string());

    // Task created with fallback filename and single segment when length is unknown
    let task_id = engine
        .add_task(
            "https://httpbin.org/stream-bytes/5000".to_string(),
            "".to_string(),
            temp_dir.path().to_str().unwrap().to_string(),
            8,
            HashMap::new(),
        )
        .await
        .unwrap();

    let task = engine.get_task(&task_id).unwrap().unwrap();
    assert_eq!(task.filename, "5000");
    assert_eq!(task.status, TaskStatus::Queued);
}

