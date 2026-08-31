# TASKS.md — Granular Implementation Backlog

### [TODO] Phase 1: Foundation & Core Download Engine (Rust)
- **Overview:** Setup Cargo workspace monorepo, implement embedded SQLite storage layer, and create the core multi-segment download orchestrator with dynamic Range requests.
- **Key Modules:**
  - `crates/segmenta-core/src/storage.rs`: SQLite repository with WAL mode and migrations.
  - `crates/segmenta-core/src/segment.rs`: Chunk calculation, Range request streaming, and file reassembly.
  - `crates/segmenta-core/src/throttler.rs`: Token-bucket bandwidth throttling.
  - `crates/segmenta-core/src/engine.rs`: Task lifecycle management (Queue, Download, Pause, Resume, Cancel).

---

### [TODO] Phase 2: Desktop GUI & Real-time State (Tauri v2)
- **Overview:** Setup Tauri v2 shell and build high-end UI interface with Svelte 5 / React, TypeScript, and Tailwind CSS adhering to `DESIGN.md`.
- **Key Modules:**
  - `apps/desktop/src-tauri/`: Tauri v2 command bindings for start, pause, resume, delete, and settings.
  - `apps/desktop/src/components/SegmentInspector.svelte`: Visual multi-part progress bar for active connections.
  - `apps/desktop/src/components/Speedometer.svelte`: High-performance 60fps Canvas area chart.
  - `apps/desktop/src/components/TaskQueue.svelte`: Task list with categories, search, and context actions.

---

### [TODO] Phase 3: Browser Extension (Manifest V3) & Native Messaging Host
- **Overview:** Build the Manifest V3 browser extension and the Rust Native Messaging Host CLI for bidirectional communication.
- **Key Modules:**
  - `crates/segmenta-host/`: Rust CLI reading/writing 4-byte length-prefixed JSON on STDIN/STDOUT.
  - `apps/extension/src/background/`: Intercept downloads and sniff media requests.
  - `apps/extension/src/content/`: Inject floating "Download Media" action button on video players.
  - `apps/extension/src/popup/`: Quick connection status and recent tasks.

---

### [TODO] Phase 4: Media Muxer (HLS/M3U8), Hardening, & Open-Source Packaging
- **Overview:** Implement HLS parser for adaptive streams, write comprehensive test suites, and prepare open-source release tooling.
- **Key Modules:**
  - `crates/segmenta-core/src/media.rs`: M3U8 master & media playlist parser and segment fetcher.
  - `README.md`, `CONTRIBUTING.md`, `LICENSE`, and GitHub Issue templates.
  - `.github/workflows/ci.yml`: GitHub Actions matrix for multi-platform build and automated releases.
