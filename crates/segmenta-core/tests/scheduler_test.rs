use chrono::{Duration, Utc};
use segmenta_core::scheduler::{
    route_category_path, DownloadScheduler, FileCategory, ScheduleRule,
};
use std::path::Path;

#[test]
fn test_category_classification() {
    assert_eq!(
        FileCategory::from_filename_or_url("movie.mp4"),
        FileCategory::Video
    );
    assert_eq!(
        FileCategory::from_filename_or_url("https://example.com/stream.m3u8?token=xyz"),
        FileCategory::Video
    );
    assert_eq!(
        FileCategory::from_filename_or_url("song.mp3"),
        FileCategory::Audio
    );
    assert_eq!(
        FileCategory::from_filename_or_url("report.pdf"),
        FileCategory::Documents
    );
    assert_eq!(
        FileCategory::from_filename_or_url("archive.tar.gz"),
        FileCategory::Archives
    );
    assert_eq!(
        FileCategory::from_filename_or_url("installer.exe"),
        FileCategory::Applications
    );
    assert_eq!(
        FileCategory::from_filename_or_url("unknown.xyz"),
        FileCategory::Other
    );
}

#[test]
fn test_category_path_routing() {
    let base = Path::new("C:/Downloads");
    let routed = route_category_path(base, "video.mp4");
    assert_eq!(routed, base.join("Video").join("video.mp4"));

    let routed_doc = route_category_path(base, "book.pdf");
    assert_eq!(routed_doc, base.join("Documents").join("book.pdf"));
}

#[tokio::test]
async fn test_scheduler_queue_concurrency_limit() {
    let scheduler = DownloadScheduler::new(2);
    let now = Utc::now();

    scheduler.enqueue_task("task-1".to_string()).await;
    scheduler.enqueue_task("task-2".to_string()).await;
    scheduler.enqueue_task("task-3".to_string()).await;

    assert_eq!(scheduler.queue_len().await, 3);
    assert_eq!(scheduler.active_count().await, 0);

    // Poll 1
    let t1 = scheduler.poll_next_task(now).await;
    assert_eq!(t1, Some("task-1".to_string()));
    assert_eq!(scheduler.active_count().await, 1);

    // Poll 2
    let t2 = scheduler.poll_next_task(now).await;
    assert_eq!(t2, Some("task-2".to_string()));
    assert_eq!(scheduler.active_count().await, 2);

    // Poll 3 (Should be None because max concurrency is 2)
    let t3 = scheduler.poll_next_task(now).await;
    assert_eq!(t3, None);
    assert_eq!(scheduler.active_count().await, 2);

    // Complete task 1
    scheduler.mark_completed_or_inactive("task-1").await;
    assert_eq!(scheduler.active_count().await, 1);

    // Now Poll 3 can be pulled
    let t4 = scheduler.poll_next_task(now).await;
    assert_eq!(t4, Some("task-3".to_string()));
    assert_eq!(scheduler.active_count().await, 2);
}

#[tokio::test]
async fn test_scheduler_time_rules() {
    let scheduler = DownloadScheduler::new(2);
    let now = Utc::now();

    // Start in the future
    let rule_future = ScheduleRule {
        start_at: Some(now + Duration::hours(1)),
        stop_at: Some(now + Duration::hours(2)),
        auto_start_on_add: true,
    };
    scheduler.set_schedule_rule(rule_future).await;
    scheduler.enqueue_task("task-timed".to_string()).await;

    // Should not run now
    assert!(!scheduler.should_run_now(now).await);
    assert_eq!(scheduler.poll_next_task(now).await, None);

    // Should run within window
    let window_now = now + Duration::minutes(70);
    assert!(scheduler.should_run_now(window_now).await);
    assert_eq!(
        scheduler.poll_next_task(window_now).await,
        Some("task-timed".to_string())
    );
}
