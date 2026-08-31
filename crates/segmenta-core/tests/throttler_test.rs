use segmenta_core::throttler::TokenBucket;
use std::sync::Arc;
use std::time::Instant;

#[tokio::test]
async fn test_token_bucket_rate_limiting() {
    let limit_bytes_per_sec = 100_000; // 100 KB/s
    let throttler = Arc::new(TokenBucket::new(Some(limit_bytes_per_sec)));

    let start = Instant::now();
    // First consume up to available tokens
    throttler.consume(100_000).await;
    // Next consume should wait approximately 1 second
    throttler.consume(100_000).await;
    let elapsed = start.elapsed();

    assert!(
        elapsed.as_millis() >= 800,
        "Throttling was not enforced, elapsed: {:?}",
        elapsed
    );
}

#[tokio::test]
async fn test_token_bucket_unlimited() {
    let throttler = Arc::new(TokenBucket::new(None));
    let start = Instant::now();
    throttler.consume(10_000_000).await;
    let elapsed = start.elapsed();
    assert!(
        elapsed.as_millis() < 50,
        "Unlimited throttler delayed execution"
    );
}

#[tokio::test]
async fn test_token_bucket_dynamic_set_limit() {
    let throttler = Arc::new(TokenBucket::new(Some(50_000)));
    assert_eq!(throttler.limit(), Some(50_000));

    // Remove limit
    throttler.set_limit(None);
    assert_eq!(throttler.limit(), None);

    let start = Instant::now();
    throttler.consume(1_000_000).await;
    let elapsed = start.elapsed();
    assert!(elapsed.as_millis() < 50);

    // Set new limit
    throttler.set_limit(Some(200_000));
    assert_eq!(throttler.limit(), Some(200_000));
}

#[tokio::test]
async fn test_token_bucket_concurrent_consumers() {
    let limit_bytes_per_sec = 200_000; // 200 KB/s
    let throttler = Arc::new(TokenBucket::new(Some(limit_bytes_per_sec)));

    let start = Instant::now();
    let mut handles = Vec::new();

    // Initial drain
    throttler.consume(200_000).await;

    // Spawn 2 tasks each consuming 100 KB
    for _ in 0..2 {
        let t = throttler.clone();
        handles.push(tokio::spawn(async move {
            t.consume(100_000).await;
        }));
    }

    for handle in handles {
        handle.await.unwrap();
    }

    let elapsed = start.elapsed();
    assert!(
        elapsed.as_millis() >= 800,
        "Concurrent throttling was not enforced, elapsed: {:?}",
        elapsed
    );
}
