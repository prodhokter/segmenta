use reqwest::Client;
use segmenta_core::segment::{calculate_segments, download_segment, reassemble_segments};
use segmenta_core::throttler::TokenBucket;
use segmenta_core::types::SegmentStatus;
use std::collections::HashMap;
use std::fs;
use std::sync::Arc;
use tokio::sync::mpsc;

#[test]
fn test_calculate_segments_range_division() {
    let total_size = 1000;
    let count = 4;
    let segments = calculate_segments("task-1", total_size, count, "/temp");

    assert_eq!(segments.len(), 4);
    assert_eq!(segments[0].start_offset, 0);
    assert_eq!(segments[0].end_offset, Some(249));

    assert_eq!(segments[1].start_offset, 250);
    assert_eq!(segments[1].end_offset, Some(499));

    assert_eq!(segments[2].start_offset, 500);
    assert_eq!(segments[2].end_offset, Some(749));

    assert_eq!(segments[3].start_offset, 750);
    assert_eq!(segments[3].end_offset, Some(999));
}

#[test]
fn test_calculate_segments_single_or_zero() {
    let segments_single = calculate_segments("task-single", 500, 1, "/temp");
    assert_eq!(segments_single.len(), 1);
    assert_eq!(segments_single[0].start_offset, 0);
    assert_eq!(segments_single[0].end_offset, Some(499));

    let segments_zero = calculate_segments("task-zero", 0, 4, "/temp");
    assert_eq!(segments_zero.len(), 1);
    assert_eq!(segments_zero[0].start_offset, 0);
    assert_eq!(segments_zero[0].end_offset, Some(0));
}

#[tokio::test]
async fn test_reassemble_segments() {
    let temp_dir = tempfile::tempdir().unwrap();
    let p1 = temp_dir.path().join("file.part.000");
    let p2 = temp_dir.path().join("file.part.001");
    let p3 = temp_dir.path().join("file.part.002");
    let out = temp_dir.path().join("final.txt");

    fs::write(&p1, b"Hello, ").unwrap();
    fs::write(&p2, b"Segmenta ").unwrap();
    fs::write(&p3, b"World!").unwrap();

    let parts = vec![
        p1.to_str().unwrap().to_string(),
        p2.to_str().unwrap().to_string(),
        p3.to_str().unwrap().to_string(),
    ];
    reassemble_segments(&parts, out.to_str().unwrap())
        .await
        .unwrap();

    let content = fs::read_to_string(&out).unwrap();
    assert_eq!(content, "Hello, Segmenta World!");

    // Part files should be cleaned up
    assert!(!p1.exists());
    assert!(!p2.exists());
    assert!(!p3.exists());
}

#[tokio::test]
async fn test_download_segment_already_completed() {
    let temp_dir = tempfile::tempdir().unwrap();
    let p1 = temp_dir.path().join("file.part.000");
    fs::write(&p1, b"12345").unwrap();

    let mut segment = segmenta_core::types::SegmentRecord {
        id: "seg-1".to_string(),
        task_id: "task-1".to_string(),
        segment_index: 0,
        start_offset: 0,
        end_offset: Some(4), // 5 bytes total (0..=4), file is already 5 bytes
        downloaded_bytes: 0,
        status: SegmentStatus::Pending,
        part_filename: p1.to_str().unwrap().to_string(),
        attempts: 0,
        last_error: None,
        updated_at: chrono::Utc::now(),
    };

    let client = Client::new();
    let throttler = Arc::new(TokenBucket::new(None));
    let (tx, _rx) = mpsc::channel(10);
    let headers = HashMap::new();

    let result = download_segment(
        &client,
        "https://example.com/file",
        &headers,
        &mut segment,
        throttler,
        tx,
    )
    .await;

    assert!(result.is_ok());
    assert_eq!(segment.status, SegmentStatus::Completed);
    assert_eq!(segment.downloaded_bytes, 5);
}

#[tokio::test]
async fn test_download_segment_resume_existing_partial() {
    let temp_dir = tempfile::tempdir().unwrap();
    let p1 = temp_dir.path().join("file.part.000");
    // Write 3 bytes initially
    fs::write(&p1, b"123").unwrap();

    let segment = segmenta_core::types::SegmentRecord {
        id: "seg-resume".to_string(),
        task_id: "task-resume".to_string(),
        segment_index: 0,
        start_offset: 0,
        end_offset: Some(9), // 10 bytes total (0..=9), 3 bytes already on disk
        downloaded_bytes: 0,
        status: SegmentStatus::Pending,
        part_filename: p1.to_str().unwrap().to_string(),
        attempts: 0,
        last_error: None,
        updated_at: chrono::Utc::now(),
    };

    // Range calculation: range_start = 0 + 3 = 3, range_end = 9
    let file_path = std::path::Path::new(&segment.part_filename);
    let existing_bytes = tokio::fs::metadata(file_path).await.map(|m| m.len()).unwrap_or(0);
    assert_eq!(existing_bytes, 3);
    let range_start = segment.start_offset + existing_bytes;
    let range_end = segment.end_offset.unwrap();
    let range_header = format!("bytes={}-{}", range_start, range_end);
    assert_eq!(range_header, "bytes=3-9");
}
