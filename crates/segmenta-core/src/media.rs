use crate::throttler::TokenBucket;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::fs::{create_dir_all, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc::Sender;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VariantStream {
    pub bandwidth: Option<u64>,
    pub resolution: Option<String>,
    pub codecs: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaSegment {
    pub duration: f64,
    pub title: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum HlsPlaylist {
    Master {
        variants: Vec<VariantStream>,
    },
    Media {
        target_duration: Option<f64>,
        media_sequence: Option<u64>,
        segments: Vec<MediaSegment>,
        is_endlist: bool,
    },
}

pub fn resolve_url(base_url: &str, path_or_url: &str) -> String {
    if path_or_url.starts_with("http://") || path_or_url.starts_with("https://") {
        return path_or_url.to_string();
    }
    if let Ok(base) = Url::parse(base_url) {
        if let Ok(resolved) = base.join(path_or_url) {
            return resolved.to_string();
        }
    }
    if let Some(pos) = base_url.rfind('/') {
        format!("{}/{}", &base_url[..pos], path_or_url.trim_start_matches('/'))
    } else {
        path_or_url.to_string()
    }
}

fn parse_stream_inf_attributes(line: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut chars = line.chars().peekable();
    while chars.peek().is_some() {
        while let Some(&c) = chars.peek() {
            if c == ',' || c.is_whitespace() {
                chars.next();
            } else {
                break;
            }
        }
        let mut key = String::new();
        while let Some(&c) = chars.peek() {
            if c == '=' {
                chars.next();
                break;
            } else if c == ',' {
                break;
            } else {
                key.push(c);
                chars.next();
            }
        }
        let key = key.trim().to_uppercase();
        if key.is_empty() {
            continue;
        }
        let mut val = String::new();
        if let Some(&'"') = chars.peek() {
            chars.next();
            for c in chars.by_ref() {
                if c == '"' {
                    break;
                }
                val.push(c);
            }
        } else {
            while let Some(&c) = chars.peek() {
                if c == ',' {
                    break;
                }
                val.push(c);
                chars.next();
            }
        }
        map.insert(key, val.trim().to_string());
    }
    map
}

pub fn parse_m3u8(content: &str, base_url: &str) -> Result<HlsPlaylist, String> {
    let lines: Vec<&str> = content.lines().map(|l| l.trim()).collect();
    if !lines.iter().any(|l| l.starts_with("#EXTM3U")) {
        return Err("Invalid M3U8: Missing #EXTM3U header".to_string());
    }

    let is_master = lines.iter().any(|l| l.starts_with("#EXT-X-STREAM-INF"));
    if is_master {
        let mut variants = Vec::new();
        let mut i = 0;
        while i < lines.len() {
            let line = lines[i];
            if let Some(attrs_str) = line.strip_prefix("#EXT-X-STREAM-INF:") {
                let attrs = parse_stream_inf_attributes(attrs_str);
                let bandwidth = attrs.get("BANDWIDTH").and_then(|s| s.parse::<u64>().ok());
                let resolution = attrs.get("RESOLUTION").cloned();
                let codecs = attrs.get("CODECS").cloned();

                i += 1;
                while i < lines.len() && (lines[i].is_empty() || lines[i].starts_with('#')) {
                    i += 1;
                }
                if i < lines.len() {
                    let stream_url = resolve_url(base_url, lines[i]);
                    variants.push(VariantStream {
                        bandwidth,
                        resolution,
                        codecs,
                        url: stream_url,
                    });
                }
            }
            i += 1;
        }
        Ok(HlsPlaylist::Master { variants })
    } else {
        let mut target_duration = None;
        let mut media_sequence = None;
        let mut is_endlist = false;
        let mut segments = Vec::new();

        let mut i = 0;
        while i < lines.len() {
            let line = lines[i];
            if let Some(val) = line.strip_prefix("#EXT-X-TARGETDURATION:") {
                target_duration = val.parse::<f64>().ok();
            } else if let Some(val) = line.strip_prefix("#EXT-X-MEDIA-SEQUENCE:") {
                media_sequence = val.parse::<u64>().ok();
            } else if line.starts_with("#EXT-X-ENDLIST") {
                is_endlist = true;
            } else if let Some(inf) = line.strip_prefix("#EXTINF:") {
                let mut parts = inf.splitn(2, ',');
                let duration = parts.next().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
                let title = parts.next().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

                i += 1;
                while i < lines.len() && (lines[i].is_empty() || lines[i].starts_with('#')) {
                    i += 1;
                }
                if i < lines.len() {
                    let seg_url = resolve_url(base_url, lines[i]);
                    segments.push(MediaSegment {
                        duration,
                        title,
                        url: seg_url,
                    });
                }
            }
            i += 1;
        }
        Ok(HlsPlaylist::Media {
            target_duration,
            media_sequence,
            segments,
            is_endlist,
        })
    }
}

pub fn select_best_variant(variants: &[VariantStream]) -> Option<&VariantStream> {
    variants.iter().max_by_key(|v| v.bandwidth.unwrap_or(0))
}

pub async fn download_hls(
    client: &Client,
    playlist_url: &str,
    headers: &HashMap<String, String>,
    output_path: &str,
    throttler: Arc<TokenBucket>,
    cancel_token: Option<CancellationToken>,
    progress_tx: Option<Sender<(u32, u32)>>,
) -> Result<u64, String> {
    let mut header_map = HeaderMap::new();
    for (k, v) in headers {
        if let (Ok(h_name), Ok(h_val)) = (
            HeaderName::from_bytes(k.as_bytes()),
            HeaderValue::from_str(v),
        ) {
            header_map.insert(h_name, h_val);
        }
    }

    let res = client
        .get(playlist_url)
        .headers(header_map.clone())
        .send()
        .await
        .map_err(|e| format!("Failed to fetch M3U8: {}", e))?;
    let content = res.text().await.map_err(|e| e.to_string())?;

    let parsed = parse_m3u8(&content, playlist_url)?;
    let (media_playlist_url, initial_segments) = match parsed {
        HlsPlaylist::Master { ref variants } => {
            let best = select_best_variant(variants)
                .ok_or_else(|| "No variants found in master playlist".to_string())?;
            (best.url.clone(), None)
        }
        HlsPlaylist::Media { segments, .. } => (playlist_url.to_string(), Some(segments)),
    };

    let segments = if let Some(segs) = initial_segments {
        segs
    } else {
        let res = client
            .get(&media_playlist_url)
            .headers(header_map.clone())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch variant M3U8: {}", e))?;
        let sub_content = res.text().await.map_err(|e| e.to_string())?;
        match parse_m3u8(&sub_content, &media_playlist_url)? {
            HlsPlaylist::Media { segments, .. } => segments,
            _ => return Err("Expected media playlist in variant stream".to_string()),
        }
    };

    if let Some(parent) = Path::new(output_path).parent() {
        create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create output dir: {}", e))?;
    }

    let mut out_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(output_path)
        .await
        .map_err(|e| format!("Failed to open output file: {}", e))?;

    let total_segments = segments.len() as u32;
    let mut total_bytes: u64 = 0;

    for (idx, seg) in segments.iter().enumerate() {
        if let Some(ref token) = cancel_token {
            if token.is_cancelled() {
                return Err("Cancelled".to_string());
            }
        }

        let seg_res = client
            .get(&seg.url)
            .headers(header_map.clone())
            .send()
            .await
            .map_err(|e| format!("Failed to download segment {}: {}", idx, e))?;

        if !seg_res.status().is_success() {
            return Err(format!(
                "Segment {} download returned status {}",
                idx,
                seg_res.status()
            ));
        }

        let mut stream = seg_res.bytes_stream();
        while let Some(chunk_res) = stream.next().await {
            if let Some(ref token) = cancel_token {
                if token.is_cancelled() {
                    return Err("Cancelled".to_string());
                }
            }
            let chunk = chunk_res.map_err(|e| e.to_string())?;
            let len = chunk.len();
            throttler.consume(len).await;
            out_file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            total_bytes += len as u64;
        }

        if let Some(ref tx) = progress_tx {
            let _ = tx.send((idx as u32 + 1, total_segments)).await;
        }
    }

    out_file.flush().await.map_err(|e| e.to_string())?;
    Ok(total_bytes)
}
