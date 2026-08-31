use byteorder::{NativeEndian, ReadBytesExt, WriteBytesExt};
use segmenta_core::engine::DownloadEngine;
use segmenta_core::storage::Storage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct TaskCreatePayload {
    pub url: String,
    pub filename: Option<String>,
    pub save_path: Option<String>,
    pub segments: Option<u32>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub media_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type")]
pub enum HostRequest {
    #[serde(rename = "PING")]
    Ping,
    #[serde(rename = "CREATE_TASK")]
    CreateTask {
        #[serde(default)]
        payload: Option<TaskCreatePayload>,
    },
    #[serde(rename = "STATUS")]
    Status {
        #[serde(default)]
        task_id: Option<String>,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum HostResponse {
    #[serde(rename = "PONG")]
    Pong { status: String, version: String },
    #[serde(rename = "TASK_CREATED")]
    TaskCreated {
        status: String,
        task_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        filename: Option<String>,
    },
    #[serde(rename = "STATUS_INFO")]
    StatusInfo {
        status: String,
        task_id: Option<String>,
    },
    #[serde(rename = "ERROR")]
    Error { message: String },
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
    std::env::temp_dir().join("SegmentaDownloads").to_string_lossy().to_string()
}

pub fn read_message<R: Read>(reader: &mut R) -> io::Result<Option<serde_json::Value>> {
    let length = match reader.read_u32::<NativeEndian>() {
        Ok(len) => len as usize,
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    };

    if length > 10 * 1024 * 1024 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Message exceeds 10MB limit",
        ));
    }

    let mut buffer = vec![0u8; length];
    reader.read_exact(&mut buffer)?;
    let value = serde_json::from_slice(&buffer)?;
    Ok(Some(value))
}

pub fn write_message<W: Write>(writer: &mut W, value: &HostResponse) -> io::Result<()> {
    let bytes = serde_json::to_vec(value)?;
    writer.write_u32::<NativeEndian>(bytes.len() as u32)?;
    writer.write_all(&bytes)?;
    writer.flush()?;
    Ok(())
}

pub async fn handle_request(req: HostRequest, engine: &DownloadEngine) -> HostResponse {
    match req {
        HostRequest::Ping => HostResponse::Pong {
            status: "connected".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
        HostRequest::CreateTask { payload } => {
            if let Some(data) = payload {
                let url = data.url;
                let filename = data.filename.unwrap_or_default();
                let save_dir = data.save_path.unwrap_or_else(get_default_download_dir);
                let segments_count = data.segments.unwrap_or(8);
                let headers = data.headers;

                match engine.add_task(url, filename.clone(), save_dir, segments_count, headers).await {
                    Ok(task_id) => {
                        // Spawn background worker to start download immediately
                        let worker = engine.clone();
                        let tid = task_id.clone();
                        tokio::spawn(async move {
                            if let Err(e) = worker.start_download(&tid, None).await {
                                eprintln!("[Segmenta Host Worker] Download error for {}: {}", tid, e);
                            }
                        });

                        HostResponse::TaskCreated {
                            status: "SUCCESS".to_string(),
                            task_id,
                            filename: if filename.is_empty() { None } else { Some(filename) },
                        }
                    }
                    Err(e) => HostResponse::Error {
                        message: format!("Failed to create download task: {}", e),
                    },
                }
            } else {
                HostResponse::Error {
                    message: "Missing payload in CREATE_TASK request".to_string(),
                }
            }
        }
        HostRequest::Status { task_id } => HostResponse::StatusInfo {
            status: "ACTIVE".to_string(),
            task_id,
        },
        HostRequest::Unknown => HostResponse::Error {
            message: "Unsupported or unknown request type".to_string(),
        },
    }
}

pub fn run_loop<R: Read, W: Write>(
    mut reader: R,
    mut writer: W,
    engine: &DownloadEngine,
    rt: &tokio::runtime::Handle,
) -> io::Result<()> {
    while let Ok(Some(json_val)) = read_message(&mut reader) {
        let resp = match serde_json::from_value::<HostRequest>(json_val) {
            Ok(req) => rt.block_on(handle_request(req, engine)),
            Err(e) => HostResponse::Error {
                message: format!("Invalid payload: {}", e),
            },
        };
        write_message(&mut writer, &resp)?;
    }
    Ok(())
}

#[tokio::main]
async fn main() -> io::Result<()> {
    let temp_dir = std::env::temp_dir().join("segmenta");
    let _ = std::fs::create_dir_all(&temp_dir);
    let db_path = temp_dir.join("segmenta.db");
    let storage = Storage::new(&db_path).map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    let engine = DownloadEngine::new(storage, temp_dir.to_string_lossy().to_string());
    let handle = tokio::runtime::Handle::current();

    let stdin = io::stdin();
    let stdout = io::stdout();
    let stdin_lock = stdin.lock();
    let stdout_lock = stdout.lock();

    run_loop(stdin_lock, stdout_lock, &engine, &handle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn setup_test_engine() -> DownloadEngine {
        let temp_dir = std::env::temp_dir().join(format!("segmenta_test_host_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let db_path = temp_dir.join("segmenta.db");
        let storage = Storage::new(&db_path).expect("Failed to initialize test storage");
        DownloadEngine::new(storage, temp_dir.to_string_lossy().to_string())
    }

    #[tokio::test]
    async fn test_encode_decode_ping_pong() {
        let engine = setup_test_engine();
        let request_json = serde_json::json!({
            "type": "PING"
        });
        let req_bytes = serde_json::to_vec(&request_json).unwrap();

        let mut input_buffer = Vec::new();
        input_buffer
            .write_u32::<NativeEndian>(req_bytes.len() as u32)
            .unwrap();
        input_buffer.extend_from_slice(&req_bytes);

        let mut reader = Cursor::new(input_buffer);
        let decoded = read_message(&mut reader).unwrap().expect("Should decode");
        let req: HostRequest = serde_json::from_value(decoded).unwrap();
        assert_eq!(req, HostRequest::Ping);

        let resp = handle_request(req, &engine).await;
        let mut output_buffer = Vec::new();
        write_message(&mut output_buffer, &resp).unwrap();

        let mut out_reader = Cursor::new(output_buffer);
        let out_len = out_reader.read_u32::<NativeEndian>().unwrap() as usize;
        let mut resp_bytes = vec![0u8; out_len];
        out_reader.read_exact(&mut resp_bytes).unwrap();

        let out_json: HostResponse = serde_json::from_slice(&resp_bytes).unwrap();
        match out_json {
            HostResponse::Pong { status, version } => {
                assert_eq!(status, "connected");
                assert_eq!(version, env!("CARGO_PKG_VERSION"));
            }
            _ => panic!("Expected Pong response"),
        }
    }

    #[tokio::test]
    async fn test_create_task_and_status() {
        let engine = setup_test_engine();
        let create_req = HostRequest::CreateTask {
            payload: Some(TaskCreatePayload {
                url: "https://example.com/test.iso".to_string(),
                filename: Some("test.iso".to_string()),
                save_path: None,
                segments: Some(4),
                headers: HashMap::new(),
                media_type: None,
            }),
        };
        let create_resp = handle_request(create_req, &engine).await;
        match create_resp {
            HostResponse::TaskCreated { status, task_id, filename } => {
                assert_eq!(status, "SUCCESS");
                assert!(!task_id.is_empty());
                assert_eq!(filename, Some("test.iso".to_string()));

                // Verify task was written to storage
                let task = engine.get_task(&task_id).unwrap();
                assert!(task.is_some());
                assert_eq!(task.unwrap().url, "https://example.com/test.iso");
            }
            _ => panic!("Expected TaskCreated response"),
        }

        let status_req = HostRequest::Status {
            task_id: Some("task-12345".to_string()),
        };
        let status_resp = handle_request(status_req, &engine).await;
        match status_resp {
            HostResponse::StatusInfo { status, task_id } => {
                assert_eq!(status, "ACTIVE");
                assert_eq!(task_id, Some("task-12345".to_string()));
            }
            _ => panic!("Expected StatusInfo response"),
        }
    }

    #[test]
    fn test_run_loop() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let engine = setup_test_engine();
        let req1 = serde_json::json!({ "type": "PING" });
        let req2 = serde_json::json!({
            "type": "CREATE_TASK",
            "payload": {
                "url": "https://example.com/video.mp4",
                "filename": "video.mp4"
            }
        });

        let mut input = Vec::new();
        for req in [req1, req2] {
            let bytes = serde_json::to_vec(&req).unwrap();
            input.write_u32::<NativeEndian>(bytes.len() as u32).unwrap();
            input.extend_from_slice(&bytes);
        }

        let reader = Cursor::new(input);
        let mut writer = Vec::new();

        run_loop(reader, &mut writer, &engine, rt.handle()).unwrap();

        let mut out_reader = Cursor::new(writer);
        // First message (PONG)
        let len1 = out_reader.read_u32::<NativeEndian>().unwrap() as usize;
        let mut buf1 = vec![0u8; len1];
        out_reader.read_exact(&mut buf1).unwrap();
        let resp1: HostResponse = serde_json::from_slice(&buf1).unwrap();
        assert!(matches!(resp1, HostResponse::Pong { .. }));

        // Second message (TASK_CREATED)
        let len2 = out_reader.read_u32::<NativeEndian>().unwrap() as usize;
        let mut buf2 = vec![0u8; len2];
        out_reader.read_exact(&mut buf2).unwrap();
        let resp2: HostResponse = serde_json::from_slice(&buf2).unwrap();
        assert!(matches!(resp2, HostResponse::TaskCreated { .. }));
    }
}
