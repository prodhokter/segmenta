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

pub async fn start_http_server(
    engine: DownloadEngine,
    addr_str: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind(addr_str).await?;
    let engine = Arc::new(engine);

    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let engine_clone = engine.clone();
                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(stream, engine_clone).await {
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

async fn handle_connection(
    mut stream: TcpStream,
    engine: Arc<DownloadEngine>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
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
                let filename = req.filename.clone().unwrap_or_default();
                let save_dir = req.save_path.clone().unwrap_or_else(get_default_download_dir);
                let segments_count = req.segments.unwrap_or(8);
                let headers = req.headers.clone();

                match engine
                    .add_task(req.url, filename.clone(), save_dir, segments_count, headers)
                    .await
                {
                    Ok(task_id) => {
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
                            filename: if filename.is_empty() { None } else { Some(filename) },
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
