use crate::throttler::TokenBucket;
use crate::types::{SegmentRecord, SegmentStatus};
use chrono::Utc;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, RANGE};
use reqwest::Client;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc::Sender;

pub fn calculate_segments(
    task_id: &str,
    total_size: u64,
    segment_count: u32,
    temp_dir: &str,
) -> Vec<SegmentRecord> {
    let count = segment_count.max(1);
    if total_size == 0 {
        let part_filename = Path::new(temp_dir)
            .join(format!("task_{}_part_000.part", task_id))
            .to_string_lossy()
            .to_string();
        return vec![SegmentRecord {
            id: format!("{}-seg-0", task_id),
            task_id: task_id.to_string(),
            segment_index: 0,
            start_offset: 0,
            end_offset: Some(0),
            downloaded_bytes: 0,
            status: SegmentStatus::Pending,
            part_filename,
            attempts: 0,
            last_error: None,
            updated_at: Utc::now(),
        }];
    }

    let chunk_size = total_size / (count as u64);
    let mut segments = Vec::with_capacity(count as usize);

    for i in 0..count {
        let start = (i as u64) * chunk_size;
        let end = if i == count - 1 {
            total_size - 1
        } else {
            ((i as u64) + 1) * chunk_size - 1
        };

        let part_filename = Path::new(temp_dir)
            .join(format!("task_{}_part_{:03}.part", task_id, i))
            .to_string_lossy()
            .to_string();

        segments.push(SegmentRecord {
            id: format!("{}-seg-{}", task_id, i),
            task_id: task_id.to_string(),
            segment_index: i,
            start_offset: start,
            end_offset: Some(end),
            downloaded_bytes: 0,
            status: SegmentStatus::Pending,
            part_filename,
            attempts: 0,
            last_error: None,
            updated_at: Utc::now(),
        });
    }

    segments
}

pub async fn download_segment(
    client: &Client,
    url: &str,
    headers: &HashMap<String, String>,
    segment: &mut SegmentRecord,
    throttler: Arc<TokenBucket>,
    progress_tx: Sender<(u32, u64)>,
) -> Result<(), String> {
    let file_path = Path::new(&segment.part_filename);
    if let Some(parent) = file_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    let existing_bytes = if file_path.exists() {
        tokio::fs::metadata(file_path)
            .await
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    segment.downloaded_bytes = existing_bytes;
    let range_start = segment.start_offset + existing_bytes;
    let range_end = segment.end_offset.unwrap_or(0);

    if segment.end_offset.is_some() && range_start > range_end {
        segment.status = SegmentStatus::Completed;
        segment.updated_at = Utc::now();
        return Ok(());
    }

    segment.status = SegmentStatus::Downloading;
    segment.updated_at = Utc::now();

    let mut req = client.get(url);
    let mut header_map = HeaderMap::new();
    for (k, v) in headers {
        if let (Ok(h_name), Ok(h_val)) = (
            HeaderName::from_bytes(k.as_bytes()),
            HeaderValue::from_str(v),
        ) {
            header_map.insert(h_name, h_val);
        }
    }
    req = req.headers(header_map);

    let range_header = if segment.end_offset.is_some() {
        format!("bytes={}-{}", range_start, range_end)
    } else {
        format!("bytes={}-", range_start)
    };
    req = req.header(RANGE, range_header);

    let res = req
        .send()
        .await
        .map_err(|e| format!("Request error: {}", e))?;
    let status = res.status();
    if !status.is_success() && status.as_u16() != 206 {
        let err_msg = format!("Server returned HTTP status: {}", status);
        segment.status = SegmentStatus::Failed;
        segment.last_error = Some(err_msg.clone());
        segment.updated_at = Utc::now();
        return Err(err_msg);
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(file_path)
        .await
        .map_err(|e| format!("File open error: {}", e))?;

    let mut stream = res.bytes_stream();
    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| {
            let err = format!("Chunk stream error: {}", e);
            segment.status = SegmentStatus::Failed;
            segment.last_error = Some(err.clone());
            segment.updated_at = Utc::now();
            err
        })?;

        let len = chunk.len();
        throttler.consume(len).await;
        file.write_all(&chunk).await.map_err(|e| {
            let err = format!("File write error: {}", e);
            segment.status = SegmentStatus::Failed;
            segment.last_error = Some(err.clone());
            segment.updated_at = Utc::now();
            err
        })?;

        segment.downloaded_bytes += len as u64;
        let _ = progress_tx
            .send((segment.segment_index, segment.downloaded_bytes))
            .await;
    }

    file.flush()
        .await
        .map_err(|e| format!("File flush error: {}", e))?;
    segment.status = SegmentStatus::Completed;
    segment.updated_at = Utc::now();
    Ok(())
}

pub async fn reassemble_segments(
    part_files: &[String],
    output_path: &str,
) -> Result<(), std::io::Error> {
    if let Some(parent) = Path::new(output_path).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let mut outfile = File::create(output_path).await?;
    let mut buffer = vec![0u8; 64 * 1024];

    for part in part_files {
        let mut infile = File::open(part).await?;
        loop {
            let n = infile.read(&mut buffer).await?;
            if n == 0 {
                break;
            }
            outfile.write_all(&buffer[..n]).await?;
        }
    }

    outfile.flush().await?;

    for part in part_files {
        let _ = tokio::fs::remove_file(part).await;
    }

    Ok(())
}
