# Segmenta — Modern Open-Source Internet Download Manager & Media Grabber
## Architecture & Implementation Design Specification

- **Project Name:** Segmenta
- **Tagline:** High-performance, modular, and privacy-respecting open-source download manager with smart media grabbing.
- **Target Platforms:** Windows 10/11, macOS, Linux (Desktop) & Chromium/Firefox (Browser Extension).
- **Date:** 2026-08-31
- **Status:** Approved for Implementation

---

## 1. Executive Summary & Open-Source Vision

**Segmenta** is a modern, extensible, open-source download manager designed as a high-performance alternative to commercial download utilities like Internet Download Manager (IDM). It combines an ultra-fast Rust core download engine with an elegant desktop interface (Tauri v2 + Svelte 5/Tailwind CSS) and a browser extension (Manifest V3) equipped with adaptive media detection.

### Core Value Propositions:
1. **Multi-Connection Dynamic Slicing:** Accelerates download throughput by dynamically splitting files into HTTP `Range` chunks (1–32 connections).
2. **Smart Media Grabber:** Automatically sniffs video/audio streams (`.mp4`, `.mp3`, `.m3u8`, `.webm`) and injects a floating download trigger preserving session cookies and auth headers.
3. **Lightweight & High-Performance:** Memory footprint < 50MB RAM idle, native async I/O disk writes via Tokio, and zero-polling telemetry.
4. **Transparent & Open-Source:** Fully open under the MIT/Apache-2.0 license, clean modular architecture, and zero intrusive telemetry.

---

## 2. Workspace & Monorepo Structure

The project is structured as a unified monorepo leveraging Cargo Workspaces and PNPM/NPM Workspaces:

```text
Segmenta/
├── Cargo.toml                    # Rust Workspace configuration
├── package.json                  # Root scripts & tooling
├── crates/
│   ├── segmenta-core/            # Core download engine library (tokio, reqwest, rusqlite)
│   │   ├── src/
│   │   │   ├── engine.rs         # Download orchestrator, queue, worker pool
│   │   │   ├── segment.rs        # Range calculation, chunk slicing & reassembly
│   │   │   ├── throttler.rs      # Token-bucket bandwidth governor
│   │   │   ├── media.rs          # HLS/M3U8 parser & metadata sniffer logic
│   │   │   ├── storage.rs        # SQLite repository & schema migrations
│   │   │   └── lib.rs
│   │   └── Cargo.toml
│   └── segmenta-host/            # Native Messaging Host CLI for browsers
│       ├── src/main.rs           # STDIO u32-prefixed JSON protocol bridge
│       └── Cargo.toml
├── apps/
│   ├── desktop/                  # Tauri v2 Desktop Application
│   │   ├── src-tauri/            # Tauri native shell & command bindings
│   │   │   ├── src/
│   │   │   │   ├── commands.rs   # Tauri IPC invokable commands
│   │   │   │   └── main.rs
│   │   │   └── Cargo.toml
│   │   └── src/                  # High-end GUI (Svelte 5 / React + Tailwind CSS)
│   │       ├── components/       # Speedometer canvas, segment visualizer, task list
│   │       ├── stores/           # Reactive task & metrics state
│   │       └── routes/           # App views (Dashboard, Settings, Scheduler)
│   └── extension/                # Manifest V3 Browser Extension (Chrome/Firefox)
│       ├── src/
│       │   ├── background/       # WebRequest & download listener, native messaging
│       │   ├── content/          # Media sniffer & floating download button overlay
│       │   └── popup/            # Fast status popup & recent task list
│       └── manifest.json
└── docs/                         # Specifications, PRD, & architecture diagrams
```

---

## 3. Core Download Engine Specification (`crates/segmenta-core`)

### 3.1 HTTP Probing & Capability Negotiation
1. **Probe Request:** An initial HTTP `HEAD` or `GET` (`Range: bytes=0-0`) request is dispatched to examine:
   - `Content-Length`: Total size in bytes.
   - `Accept-Ranges`: Verifies whether `bytes` is supported.
   - `ETag` & `Last-Modified`: Captured for mid-stream change detection.
   - `Content-Disposition`: Extracts canonical filename.
2. **Range Support Fallback:**
   - If `Accept-Ranges: bytes` is returned with `206 Partial Content`, multi-segment slicing is activated.
   - If `200 OK` is returned, the engine cancels other planned segments and falls back immediately to single-connection streaming into the output file.

### 3.2 Dynamic Segmentation & File Slicing
- Given file size $S$ and configured segment count $N$ ($N \in [1, 32]$, default: 8):
  $$\text{chunk\_size} = \lfloor S / N \rfloor$$
  $$\text{Segment } i: \quad \text{start} = i \times \text{chunk\_size}, \quad \text{end} = \begin{cases} (i+1) \times \text{chunk\_size} - 1 & \text{if } i < N-1 \\ S - 1 & \text{if } i = N-1 \end{cases}$$
- **Asynchronous Chunk Streaming:** Each segment is downloaded via a dedicated `tokio::spawn` task.
- **Temporary Part Files:** Data is written to buffered temporary files (`<task_id>.part.<index>`) with 64KB write buffers.

### 3.3 Bandwidth Throttling (Token Bucket Algorithm)
- A thread-safe, async `TokenBucket` regulates byte consumption globally and per-task.
- Token refill rate $\rho$ (bytes/sec) and burst capacity $\beta = 3\rho$ guarantee tight adherence to user-configured limits within $\pm 5\%$.

### 3.4 Reassembly & Integrity Verification
- When all $N$ segments complete, the reassembly worker streams `.part` files sequentially into the final destination path using buffered I/O.
- Optional checksum calculation (SHA-256 / MD5) verifies file integrity against expected hashes.
- Temporary part files are cleaned up upon successful reassembly.

### 3.5 Network Resilience & Error Recovery
- **Exponential Backoff with Full Jitter:** Transient network errors (`5xx`, socket timeouts) trigger up to 5 retries with randomized backoff:
  $$t_{\text{retry}}(k) = \text{rand}(0, t_{\text{base}} \cdot 2^{k-1}), \quad t_{\text{base}} = 1.0\text{s}$$
- **Resumable State:** Byte offsets are persisted to SQLite on progress ticks. Resuming requests byte range `Range: bytes=<downloaded_offset>-<end_offset>`.
- **ETag Validation:** If `ETag` changes upon resumption, the engine halts the task and notifies the user of remote file mutation.

---

## 4. Desktop Client UI/UX Specification (`apps/desktop`)

### 4.1 Visual Design Tokens (`DESIGN.md` Compliant)
- **Aesthetic Direction:** Clean High-End Studio & Editorial Platform (Anti-Slop).
- **Colors:**
  - Background Ground: `#fafafa` (Light) / `#09090b` (Dark)
  - Card/Surface: `#ffffff` (Light) / `#121215` (Dark, border: `1px solid #27272a`)
  - Brand Primary Accent: `#4f46e5` (Indigo)
  - Secondary Accent: `#06b6d4` (Cyan - Speed & Segment indicators)
  - Status Indicators: Emerald (`#10b981`), Amber (`#f59e0b`), Rose (`#ef4444`)
- **Typography:** Plus Jakarta Sans (Headings & UI), JetBrains Mono (Speed, Bytes, Offsets).

### 4.2 Key Interface Modules
1. **Interactive Dashboard:**
   - Real-time download queue filtered by status (`All`, `Downloading`, `Completed`, `Paused`, `Failed`).
   - Smart Category filters (`Video`, `Audio`, `Documents`, `Archives`, `Applications`, `Other`).
2. **Visual Multi-Part Segment Inspector:**
   - Dynamic visual blocks showing active byte range, download speed, and status per segment connection.
3. **High-Performance Canvas Speedometer:**
   - 60fps HTML5 Canvas area chart plotting global and task-specific throughput without DOM bloat.
4. **Quick Action Modals & System Integration:**
   - Quick Add URL dialog with automatic clipboard URL detection and header customization.
   - System Tray integration with speed gauges and quick pause/resume controls.
   - OS Native notifications with direct "Open File" and "Open Folder" actions.

---

## 5. Browser Extension & IPC Specification (`apps/extension` & `crates/segmenta-host`)

### 5.1 Extension Architecture (Manifest V3)
- **Background Service Worker:** Intercepts browser download events (`chrome.downloads`) and inspects network requests (`chrome.webRequest`) for video/audio streams.
- **Content Script:** Detects HTML5 video/audio elements and renders an unobtrusive, elegant floating action button ("Download Media") with quality selection.
- **Context Preservation:** Extracts cookies, `Referer`, `Origin`, and `User-Agent` headers to guarantee authenticated downloads proceed without permission drops.

### 5.2 Inter-Process Communication (IPC)
- **Primary Channel (Native Messaging):**
  - Standard Chromium/Firefox Native Messaging protocol (`STDIN`/`STDOUT` with 4-byte length prefix).
  - High performance, secure, and isolated from web-page interference.
- **Secondary Channel (Local WebSocket/HTTP):**
  - Bound to `127.0.0.1:8456` with local Bearer Token authentication for developer scripting and fallback integration.

---

## 6. Database Schema (SQLite WAL Mode)

```sql
-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    filename TEXT NOT NULL,
    save_path TEXT NOT NULL,
    temp_path TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('QUEUED', 'DOWNLOADING', 'PAUSED', 'PAUSED_BY_ERROR', 'COMPLETED', 'FAILED', 'CANCELLED')),
    total_size INTEGER,
    downloaded_size INTEGER NOT NULL DEFAULT 0,
    segments_count INTEGER NOT NULL DEFAULT 8,
    speed_limit_bytes INTEGER,
    priority INTEGER NOT NULL DEFAULT 5,
    category_id TEXT,
    headers_json TEXT NOT NULL DEFAULT '{}',
    etag TEXT,
    last_modified TEXT,
    checksum_sha256 TEXT,
    error_message TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Segments Table
CREATE TABLE IF NOT EXISTS segments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER,
    downloaded_bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'DOWNLOADING', 'PAUSED', 'COMPLETED', 'FAILED')),
    part_filename TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    extensions TEXT NOT NULL,
    folder_template TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Open-Source Governance & Delivery Plan

1. **License:** MIT License (Permissive & Community Friendly).
2. **Community Standards:** `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and GitHub Issue/PR templates.
3. **Automated CI/CD:** GitHub Actions workflow running `cargo test`, `cargo clippy`, `pnpm test`, and multi-platform packaging (Windows `.msi`/`.exe`, Linux `.deb`/`.AppImage`, macOS `.dmg`).
