use crate::engine::DownloadEngine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTaskHttpRequest {
    pub url: String,
    pub filename: Option<String>,
    pub save_path: Option<String>,
    pub segments: Option<u32>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub media_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PingHttpResponse {
    pub status: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateTaskHttpResponse {
    pub status: String,
    pub task_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorHttpResponse {
    pub error: String,
}

pub fn is_generic_filename(filename: &str) -> bool {
    let name = filename.trim();
    if name.is_empty() {
        return true;
    }
    let lower = name.to_ascii_lowercase();
    let generic_names = [
        "download",
        "download.bin",
        "download.octet-stream",
        "download.mp4",
        "download.zip",
        "videoplayback",
        "media_stream.mp4",
        "video.mp4",
        "file",
        "file.bin",
        "document",
        "stream",
        "stream.mp4",
        "stream.bin",
    ];
    if generic_names.contains(&lower.as_str()) {
        return true;
    }
    if !lower.contains('.') || lower.starts_with("download.") {
        return true;
    }
    false
}

pub fn percent_decode(input: &str) -> String {
    let mut bytes = Vec::new();
    let input_bytes = input.as_bytes();
    let mut i = 0;
    while i < input_bytes.len() {
        if input_bytes[i] == b'%' && i + 2 < input_bytes.len() {
            if let Ok(val) = u8::from_str_radix(
                std::str::from_utf8(&input_bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                bytes.push(val);
                i += 3;
                continue;
            }
        }
        bytes.push(input_bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&bytes).to_string()
}

pub fn sanitize_filename(name: &str) -> String {
    // If there is a directory path separator (/ or \), get the last segment
    let clean = if let Some(last) = name.rsplit_once('/') {
        last.1
    } else if let Some(last) = name.rsplit_once('\\') {
        last.1
    } else {
        name
    };

    let sanitized: String = clean
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'..='\x1f' => '_',
            _ => c,
        })
        .collect();

    let trimmed = sanitized.trim_matches(|c: char| c == ' ' || c == '"' || c == '\'');
    if trimmed.is_empty() {
        "download.bin".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn parse_filename_from_content_disposition(cd: &str) -> Option<String> {
    // 1. Try filename*=UTF-8''... (RFC 5987 / RFC 6266)
    for part in cd.split(';') {
        let trimmed = part.trim();
        if let Some(rest) = trimmed.strip_prefix("filename*=") {
            let clean = rest.trim_matches('"').trim_matches('\'');
            let encoded_part = if let Some(idx) = clean.find("''") {
                &clean[idx + 2..]
            } else {
                clean
            };
            let decoded = percent_decode(encoded_part);
            let sanitized = sanitize_filename(&decoded);
            if !sanitized.is_empty() && !is_generic_filename(&sanitized) {
                return Some(sanitized);
            }
        }
    }

    // 2. Try filename="..."
    for part in cd.split(';') {
        let trimmed = part.trim();
        if let Some(rest) = trimmed.strip_prefix("filename=") {
            let clean = rest.trim_matches('"').trim_matches('\'').trim();
            let sanitized = sanitize_filename(clean);
            if !sanitized.is_empty() && !is_generic_filename(&sanitized) {
                return Some(sanitized);
            }
        }
    }

    None
}

pub fn extract_filename_from_url(url_str: &str) -> Option<String> {
    if let Ok(parsed) = reqwest::Url::parse(url_str) {
        if let Some(segments) = parsed.path_segments() {
            let last_opt = segments.filter(|s| !s.is_empty()).next_back();
            if let Some(last) = last_opt {
                let decoded = percent_decode(last);
                let clean = sanitize_filename(&decoded);
                if !clean.is_empty() && !is_generic_filename(&clean) {
                    return Some(clean);
                }
            }
        }
    }
    None
}

pub async fn probe_and_extract_filename(
    client: &reqwest::Client,
    url: &str,
    suggested_filename: Option<&str>,
    headers: &HashMap<String, String>,
) -> String {
    if let Some(name) = suggested_filename {
        let clean = sanitize_filename(name);
        if !is_generic_filename(&clean) {
            return clean;
        }
    }

    // Probe 1: Send HEAD request
    let mut head_req = client.head(url).timeout(std::time::Duration::from_secs(5));
    for (k, v) in headers {
        if let (Ok(h_name), Ok(h_val)) = (
            reqwest::header::HeaderName::from_bytes(k.as_bytes()),
            reqwest::header::HeaderValue::from_str(v),
        ) {
            head_req = head_req.header(h_name, h_val);
        }
    }

    if let Ok(res) = head_req.send().await {
        if res.status().is_success() || res.status().is_redirection() {
            if let Some(cd) = res
                .headers()
                .get(reqwest::header::CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
            {
                if let Some(cd_name) = parse_filename_from_content_disposition(cd) {
                    return cd_name;
                }
            }

            let final_url = res.url().as_str();
            if let Some(url_name) = extract_filename_from_url(final_url) {
                return url_name;
            }
        }
    }

    // Probe 2: If HEAD didn't work (e.g. 405 Method Not Allowed), send GET with Range: bytes=0-0
    let mut get_req = client
        .get(url)
        .header(reqwest::header::RANGE, "bytes=0-0")
        .timeout(std::time::Duration::from_secs(5));
    for (k, v) in headers {
        if let (Ok(h_name), Ok(h_val)) = (
            reqwest::header::HeaderName::from_bytes(k.as_bytes()),
            reqwest::header::HeaderValue::from_str(v),
        ) {
            get_req = get_req.header(h_name, h_val);
        }
    }

    if let Ok(res) = get_req.send().await {
        if let Some(cd) = res
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
        {
            if let Some(cd_name) = parse_filename_from_content_disposition(cd) {
                return cd_name;
            }
        }

        let final_url = res.url().as_str();
        if let Some(url_name) = extract_filename_from_url(final_url) {
            return url_name;
        }
    }

    // Probe 3: Extract from original URL path
    if let Some(url_name) = extract_filename_from_url(url) {
        return url_name;
    }

    if let Some(name) = suggested_filename {
        let clean = sanitize_filename(name);
        if !clean.is_empty() {
            return clean;
        }
    }

    "download.bin".to_string()
}

pub fn get_default_download_dir() -> String {
    if let Some(user_dirs) = std::env::var_os("USERPROFILE") {
        let p = PathBuf::from(user_dirs).join("Downloads");
        return p.to_string_lossy().to_string();
    }
    if let Some(home) = std::env::var_os("HOME") {
        let p = PathBuf::from(home).join("Downloads");
        return p.to_string_lossy().to_string();
    }
    std::env::temp_dir()
        .join("SegmentaDownloads")
        .to_string_lossy()
        .to_string()
}

pub async fn start_http_server<F>(
    engine: DownloadEngine,
    addr_str: &str,
    on_task_created: Option<F>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
where
    F: Fn(String) + Send + Sync + 'static + Clone,
{
    let listener = TcpListener::bind(addr_str).await?;
    let engine = Arc::new(engine);

    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let engine_clone = engine.clone();
                    let on_task_created_clone = on_task_created.clone();
                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(stream, engine_clone, on_task_created_clone).await {
                            eprintln!("[HTTP Server] Connection error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    eprintln!("[HTTP Server] Accept error: {}", e);
                    break;
                }
            }
        }
    });

    Ok(())
}

async fn handle_connection<F>(
    mut stream: TcpStream,
    engine: Arc<DownloadEngine>,
    on_task_created: Option<F>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
where
    F: Fn(String) + Send + Sync + 'static,
{
    let mut buffer = vec![0u8; 64 * 1024];
    let mut total_read = 0;

    let (header_end, content_length) = loop {
        let n = stream.read(&mut buffer[total_read..]).await?;
        if n == 0 {
            return Ok(());
        }
        total_read += n;

        if let Some(pos) = buffer[..total_read]
            .windows(4)
            .position(|w| w == b"\r\n\r\n")
        {
            let headers_str = String::from_utf8_lossy(&buffer[..pos]);
            let mut cl = 0usize;
            for line in headers_str.lines() {
                if let Some(val) = line.strip_prefix("Content-Length:")
                    .or_else(|| line.strip_prefix("content-length:"))
                {
                    if let Ok(parsed) = val.trim().parse::<usize>() {
                        cl = parsed;
                    }
                }
            }
            break (pos + 4, cl);
        }

        if total_read >= buffer.len() {
            buffer.resize(buffer.len() * 2, 0);
        }
    };

    let body_start = header_end;
    let body_needed = content_length;
    let body_have = total_read.saturating_sub(body_start);

    if body_have < body_needed {
        let remaining = body_needed - body_have;
        if total_read + remaining > buffer.len() {
            buffer.resize(total_read + remaining, 0);
        }
        stream.read_exact(&mut buffer[total_read..total_read + remaining]).await?;
        total_read += remaining;
    }

    let request_str = String::from_utf8_lossy(&buffer[..total_read]);
    let first_line = request_str.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");

    // Support CORS for browser extensions / local web apps
    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
Content-Length: 0\r\n\r\n";
        stream.write_all(response.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    let (status_code, body_bytes) = if method == "GET" && (path == "/ping" || path == "/ping/") {
        let resp = PingHttpResponse {
            status: "online".to_string(),
            version: "0.1.0".to_string(),
        };
        let body = serde_json::to_vec(&resp)?;
        ("200 OK", body)
    } else if method == "POST" && (path == "/api/tasks" || path == "/api/tasks/") {
        let body_slice = &buffer[body_start..body_start + body_needed];
        match serde_json::from_slice::<CreateTaskHttpRequest>(body_slice) {
            Ok(req) => {
                let client = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(8))
                    .build()
                    .unwrap_or_default();

                let resolved_filename = probe_and_extract_filename(
                    &client,
                    &req.url,
                    req.filename.as_deref(),
                    &req.headers,
                )
                .await;

                let save_dir = req.save_path.clone().unwrap_or_else(get_default_download_dir);
                let segments_count = req.segments.unwrap_or(8);
                let headers = req.headers.clone();

                match engine
                    .add_task(req.url, resolved_filename.clone(), save_dir, segments_count, headers)
                    .await
                {
                    Ok(task_id) => {
                        if let Some(ref cb) = on_task_created {
                            cb(task_id.clone());
                        }

                        let worker = engine.as_ref().clone();
                        let tid = task_id.clone();
                        tokio::spawn(async move {
                            if let Err(e) = worker.start_download(&tid, None).await {
                                eprintln!("[HTTP Server] Task {} failed: {}", tid, e);
                            }
                        });

                        let resp = CreateTaskHttpResponse {
                            status: "SUCCESS".to_string(),
                            task_id,
                            filename: Some(resolved_filename),
                        };
                        let body = serde_json::to_vec(&resp)?;
                        ("200 OK", body)
                    }
                    Err(e) => {
                        let resp = ErrorHttpResponse {
                            error: format!("Failed to create task: {}", e),
                        };
                        let body = serde_json::to_vec(&resp)?;
                        ("500 Internal Server Error", body)
                    }
                }
            }
            Err(e) => {
                let resp = ErrorHttpResponse {
                    error: format!("Invalid JSON payload: {}", e),
                };
                let body = serde_json::to_vec(&resp)?;
                ("400 Bad Request", body)
            }
        }
    } else {
        let resp = ErrorHttpResponse {
            error: "Not Found".to_string(),
        };
        let body = serde_json::to_vec(&resp)?;
        ("404 Not Found", body)
    };

    let header = format!(
        "HTTP/1.1 {}\r\n\
Content-Type: application/json\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
Content-Length: {}\r\n\
Connection: close\r\n\r\n",
        status_code,
        body_bytes.len()
    );

    stream.write_all(header.as_bytes()).await?;
    stream.write_all(&body_bytes).await?;
    stream.flush().await?;

    Ok(())
}
