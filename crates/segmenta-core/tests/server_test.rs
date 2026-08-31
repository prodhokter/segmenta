use segmenta_core::engine::DownloadEngine;
use segmenta_core::server::{
    extract_filename_from_url, is_generic_filename, parse_filename_from_content_disposition,
    sanitize_filename, start_http_server,
};
use segmenta_core::storage::Storage;
use serde_json::json;

#[tokio::test]
async fn test_http_server_ping_and_create_task() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("server_test.db");
    let storage = Storage::new(&db_path).unwrap();
    let engine = DownloadEngine::new(storage.clone(), temp_dir.path().to_str().unwrap().to_string());

    // Use a random local port
    let addr = "127.0.0.1:45679";
    start_http_server::<fn(String)>(engine.clone(), addr, None).await.expect("Failed to start server");

    // Wait for listener to bind
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let client = reqwest::Client::new();

    // 1. Test GET /ping
    let ping_res = client
        .get(format!("http://{}/ping", addr))
        .send()
        .await
        .expect("Ping request failed");
    assert_eq!(ping_res.status(), reqwest::StatusCode::OK);
    let ping_body: serde_json::Value = ping_res.json().await.unwrap();
    assert_eq!(ping_body["status"], "online");
    assert_eq!(ping_body["version"], "0.1.0");

    // 2. Test POST /api/tasks
    let create_payload = json!({
        "url": "https://example.com/download.iso",
        "filename": "download.iso",
        "save_path": temp_dir.path().to_str().unwrap().to_string(),
        "segments": 4
    });

    let task_res = client
        .post(format!("http://{}/api/tasks", addr))
        .json(&create_payload)
        .send()
        .await
        .expect("Create task request failed");

    assert_eq!(task_res.status(), reqwest::StatusCode::OK);
    let task_body: serde_json::Value = task_res.json().await.unwrap();
    assert_eq!(task_body["status"], "SUCCESS");
    let task_id = task_body["task_id"].as_str().expect("Expected task_id");

    // Verify task exists in storage
    let stored_task = storage.get_task(task_id).unwrap().expect("Task not found in DB");
    assert_eq!(stored_task.filename, "download.iso");
    assert_eq!(stored_task.save_path, temp_dir.path().join("download.iso").to_string_lossy().to_string());
}

#[test]
fn test_filename_parsing_and_sanitization() {
    assert!(is_generic_filename(""));
    assert!(is_generic_filename("download"));
    assert!(is_generic_filename("download.bin"));
    assert!(is_generic_filename("download.mp4"));
    assert!(is_generic_filename("videoplayback"));
    assert!(!is_generic_filename("archlinux-2026.08.01-x86_64.iso"));
    assert!(!is_generic_filename("my-document.pdf"));

    let sanitized = sanitize_filename("invalid:filename*with?illegal<chars>.zip");
    assert_eq!(sanitized, "invalid_filename_with_illegal_chars_.zip");

    let cd1 = r#"attachment; filename="archive_release_v1.0.tar.gz""#;
    assert_eq!(
        parse_filename_from_content_disposition(cd1),
        Some("archive_release_v1.0.tar.gz".to_string())
    );

    let cd2 = "attachment; filename*=UTF-8''my%20presentation%20file.pdf";
    assert_eq!(
        parse_filename_from_content_disposition(cd2),
        Some("my presentation file.pdf".to_string())
    );

    let url = "https://example.org/files/linux-distro-v2.3.iso?token=123#frag";
    assert_eq!(
        extract_filename_from_url(url),
        Some("linux-distro-v2.3.iso".to_string())
    );
}
