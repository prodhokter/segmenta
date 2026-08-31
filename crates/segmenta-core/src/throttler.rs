use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::{sleep, Instant};

#[derive(Clone)]
pub struct TokenBucket {
    rate_bytes_per_sec: Arc<AtomicU64>,
    state: Arc<Mutex<TokenBucketState>>,
}

struct TokenBucketState {
    available_tokens: f64,
    last_update: Instant,
}

impl TokenBucket {
    pub fn new(rate_bytes_per_sec: Option<u64>) -> Self {
        let rate = rate_bytes_per_sec.unwrap_or(0);
        let rate_f64 = rate as f64;
        Self {
            rate_bytes_per_sec: Arc::new(AtomicU64::new(rate)),
            state: Arc::new(Mutex::new(TokenBucketState {
                available_tokens: rate_f64,
                last_update: Instant::now(),
            })),
        }
    }

    pub fn set_limit(&self, rate_bytes_per_sec: Option<u64>) {
        let rate = rate_bytes_per_sec.unwrap_or(0);
        self.rate_bytes_per_sec.store(rate, Ordering::SeqCst);
    }

    pub fn limit(&self) -> Option<u64> {
        let rate = self.rate_bytes_per_sec.load(Ordering::SeqCst);
        if rate == 0 {
            None
        } else {
            Some(rate)
        }
    }

    pub async fn consume(&self, bytes: usize) {
        if bytes == 0 {
            return;
        }

        loop {
            let rate = self.rate_bytes_per_sec.load(Ordering::SeqCst);
            if rate == 0 {
                return;
            }

            let rate_f64 = rate as f64;
            let max_capacity = rate_f64 * 2.0;

            let mut state = self.state.lock().await;
            let now = Instant::now();
            let elapsed_sec = (now - state.last_update).as_secs_f64();
            state.last_update = now;

            state.available_tokens =
                (state.available_tokens + elapsed_sec * rate_f64).min(max_capacity);

            let needed = bytes as f64;
            if state.available_tokens >= needed {
                state.available_tokens -= needed;
                return;
            }

            let deficit = needed - state.available_tokens;
            let wait_sec = deficit / rate_f64;
            drop(state);

            sleep(Duration::from_secs_f64(wait_sec)).await;
        }
    }
}
