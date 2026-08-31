# CLAUDE.md — Segmenta: Open-Source Modern Download Manager & Media Grabber

> Autonomous guidance for Claude Code CLI. Read before touching any code.

## Project Vision & Context
- **Title:** Segmenta — Modern Open-Source Internet Download Manager & Media Grabber
- **Platform Target:** Desktop (Windows 10/11, macOS, Linux via Tauri v2) & Browser Extension (Manifest V3)
- **License:** MIT / Apache-2.0

---

## Technical Stack
- **Core Download Engine:** Rust (`crates/segmenta-core`) with Tokio, Reqwest, Rusqlite, and Tokio-util.
- **Native Messaging Host:** Rust CLI (`crates/segmenta-host`) with STDIN/STDOUT u32-length prefixed protocol.
- **Desktop Application:** Tauri v2 (`apps/desktop`) with Svelte 5 / React 19, TypeScript, and Tailwind CSS.
- **Browser Extension:** TypeScript (`apps/extension`) with Manifest V3 for Chromium and Firefox.
- **Embedded Database:** SQLite in WAL mode (`segmenta.db`).

---

## Development Principles & Standards
1. **Test-Driven Development (TDD):** Always write or update tests before modifying engine and protocol logic.
2. **Anti-Slop Clean Code:** Zero bloated comments, no redundant abstractions, clean modular code.
3. **Strict Modularity:** Keep files focused (< 250 LOC). Split by responsibility, not artificial layers.
4. **Security & Validation:** Validate all inputs using strict type schemas, sanitize file paths to prevent directory traversal, enforce loopback isolation (`127.0.0.1`).
5. **UI & Design System:** Follow exact tokens in `DESIGN.md` (Primary `#4f46e5`, Plus Jakarta Sans typography, JetBrains Mono for metrics, zero generic icons).

---

## Key Commands
```bash
# Rust Workspace tests
cargo test --workspace

# Desktop GUI Development
pnpm --filter desktop dev  # or npm run dev

# Browser Extension Build
pnpm --filter extension build

# Cargo Lint & Check
cargo clippy --workspace --all-targets -- -D warnings
```

---

## Task Roadmap Checklist
- [ ] **Phase 1: Foundation & Core Download Engine (Rust)**
  - Inisialisasi Cargo Workspace (`segmenta-core`, `segmenta-host`) & SQLite repository.
  - Implementasi dynamic HTTP `Range` multi-segmentation & token-bucket bandwidth throttle.
  - Implementasi resumable state persistence & unit/integration tests.
- [ ] **Phase 2: Desktop GUI & Real-time State (Tauri v2)**
  - Setup Tauri v2 shell dengan modern UI (Plus Jakarta Sans, palette `#4f46e5`).
  - Dashboard antrean, visual multi-part segment inspector, & live canvas speedometer.
  - Tauri IPC command bindings & system tray integration.
- [ ] **Phase 3: Browser Extension (Manifest V3) & Native Messaging**
  - Implementasi Native Messaging Host bridge (`segmenta-host`).
  - Background service worker, media sniffer, & floating action overlay.
  - End-to-end integration antara browser extension dan desktop engine.
- [ ] **Phase 4: Media Muxer (HLS/M3U8), Hardening, & Open-Source Packaging**
  - Implementasi HLS/M3U8 parser & segment reassembler.
  - GitHub Actions CI/CD workflows untuk multi-platform build & release packaging.
  - Dokumentasi open-source (`README.md`, `CONTRIBUTING.md`, `LICENSE`).
