# CONTEXT.md — System & Domain Architecture

## 1. Domain Background
- **Project:** Segmenta — Modern Open-Source Internet Download Manager & Media Grabber
- **Objective:** Build an ultra-fast, reliable, and privacy-first download manager with dynamic multi-connection slicing, resume capabilities, media stream sniffing, and browser extension integration.

---

## 2. Technical Boundaries
- **Core Engine:** Rust (`crates/segmenta-core`) using Tokio asynchronous runtime, Reqwest, and Rusqlite.
- **IPC Protocol:** Chromium & Firefox Native Messaging Host (`crates/segmenta-host`) via 4-byte u32 length-prefixed JSON on STDIN/STDOUT + Local WebSocket fallback on `127.0.0.1:8456`.
- **Client Desktop:** Tauri v2 (`apps/desktop`) using Svelte 5 / React 19 + TypeScript + Tailwind CSS.
- **Browser Extension:** TypeScript (`apps/extension`) with Manifest V3.
- **Storage Layer:** Embedded SQLite (`segmenta.db`) operating in WAL mode.

---

## 3. Key Invariants & Assumptions
- **Zero Telemetry / Full Privacy:** All network activities are confined to user requests; no analytics or metrics sent to third-party servers.
- **Loopback Isolation:** Local HTTP/WS APIs bind exclusively to `127.0.0.1`.
- **Safe Reassembly:** Temporary file segments (`.part`) are validated before merging; final files are placed only after verified reassembly.
- **Strict Path Sanitization:** Filenames from HTTP headers or browser payloads are sanitized against directory traversal (`../`).
