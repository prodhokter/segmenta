# Segmenta

<p align="center">
  <img src="apps/desktop/static/favicon.png" alt="Segmenta Logo" width="80" height="80" />
</p>

<p align="center">
  <strong>High-performance, modular, and privacy-respecting open-source internet download manager and media grabber.</strong>
</p>

<p align="center">
  <a href="https://github.com/segmenta-org/segmenta/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/segmenta-org/segmenta/ci.yml?branch=main&label=CI&style=flat-square" alt="CI Status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT%20%7C%20Apache--2.0-blue.svg?style=flat-square" alt="License" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Rust-2021%20Edition-orange.svg?style=flat-square" alt="Rust Edition" /></a>
  <a href="https://v2.tauri.app/"><img src="https://img.shields.io/badge/Tauri-v2-24C8D8.svg?style=flat-square" alt="Tauri v2" /></a>
  <a href="https://svelte.dev/"><img src="https://img.shields.io/badge/Svelte-5-FF3E00.svg?style=flat-square" alt="Svelte 5" /></a>
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/manifest-v3"><img src="https://img.shields.io/badge/Manifest-V3-4285F4.svg?style=flat-square" alt="Manifest V3" /></a>
</p>

---

## Overview

**Segmenta** is a modern, lightweight, and extensible download manager engineered as a privacy-first alternative to traditional tools like Internet Download Manager (IDM). It pairs an ultra-fast, asynchronous Rust core download engine with an editorial desktop interface built on Tauri v2 and Svelte 5, accompanied by a Manifest V3 browser extension with automated media sniffing.

### Key Capabilities
- **Multi-Connection Dynamic Slicing:** Accelerates download throughput by slicing files into 1–32 parallel HTTP `Range` streams with byte-accurate chunk reassembly.
- **Automatic Fallback:** Seamlessly detects non-range-capable servers (`Accept-Ranges: none` or `200 OK`) and falls back to robust single-stream writing.
- **Smart Media Sniffer:** Manifest V3 browser extension sniffs streaming video and audio elements (`.mp4`, `.m3u8`, `.mp3`) and provides a non-intrusive floating action overlay.
- **Authentication & Header Preservation:** Automatically captures and passes session cookies, `Referer`, and `User-Agent` headers across native IPC to prevent authentication drops.
- **Bandwidth Governor:** Token-bucket rate limiter enabling dynamic, sub-millisecond throughput shaping without resetting active connections.
- **Editorial Desktop Experience:** High-performance GUI featuring a 60 FPS Canvas speedometer, real-time segment chunk inspector, priority queueing, and file categories.
- **Privacy-First & Secure:** Zero telemetry, no third-party tracking, strict local path sanitization against directory traversal, and loopback communication over standard STDIO/IPC.

---

## Architecture

Segmenta is organized as a unified monorepo containing modular Rust crates and frontend packages:

```mermaid
graph TD
    subgraph Browser ["Web Browser (Chrome / Edge / Firefox)"]
        EXT_BG["Extension Background Worker (MV3)"]
        EXT_CONTENT["Content Script & Media Sniffer"]
        EXT_POPUP["Popup Quick Dashboard"]
        EXT_CONTENT -->|Detected Stream| EXT_BG
        EXT_POPUP -->|Manual Trigger| EXT_BG
    end

    subgraph IPC ["Inter-Process Bridge"]
        HOST["Native Messaging CLI Host (segmenta-host)"]
        EXT_BG <-->|STDIO u32 JSON Protocol| HOST
    end

    subgraph Core ["Segmenta Engine & Desktop App"]
        TAURI["Tauri v2 Native Shell (apps/desktop/src-tauri)"]
        GUI["Svelte 5 + Tailwind Desktop GUI"]
        ENGINE["Download Engine Orchestrator (segmenta-core)"]
        STORAGE["SQLite Local Repository (rusqlite)"]
        THROTTLE["Token-Bucket Bandwidth Governor"]
        WORKERS["Async Segment Workers (tokio + reqwest)"]

        HOST -->|Command Payload| ENGINE
        GUI <-->|Tauri IPC Commands & Events| TAURI
        TAURI <-->|Direct In-Process API| ENGINE
        ENGINE <-->|Persist State| STORAGE
        ENGINE -->|Rate Limiting| THROTTLE
        ENGINE -->|Spawn Chunk Tasks| WORKERS
    end

    subgraph RemoteServer ["Internet / Remote HTTP Servers"]
        SERVER["HTTP / HTTPS Server (Byte Ranges)"]
        WORKERS <-->|Parallel Range Requests| SERVER
    end
```

### Monorepo Structure

| Path | Description | Tech Stack |
| :--- | :--- | :--- |
| `crates/segmenta-core` | Core download engine, dynamic chunk scheduler, throttler, and SQLite repository. | Rust, Tokio, Reqwest, Rusqlite, Sha2 |
| `crates/segmenta-host` | Native Messaging Host executable for browser extension IPC bridge. | Rust, Serde JSON, Tokio STDIO |
| `apps/desktop` | Cross-platform desktop interface with real-time metrics and task management. | Tauri v2, Svelte 5, Tailwind CSS, TypeScript |
| `apps/extension` | Manifest V3 browser extension with automated stream sniffer and overlay trigger. | TypeScript, Vite, Chrome Extensions API |

---

## Quick Start

Segmenta offers two installation methods:

### Method 1: Automated One-Click Setup (Recommended for Windows)

Run the included automated setup script in PowerShell to compile the native host, register browser registry keys, and build the extension in one step:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

Once finished, simply start the desktop app:
```bash
npm run dev:desktop
```

---

### Method 2: Manual Developer Setup (Cross-Platform)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/prodhokter/segmenta.git
   cd segmenta
   ```

2. **Install dependencies & build:**
   ```bash
   npm install
   cargo test --workspace
   ```

3. **Launch Desktop GUI:**
   ```bash
   npm run dev:desktop
   ```

4. **Build Desktop Standalone Installer (.exe / .msi):**
   ```bash
   npm --prefix apps/desktop run tauri build
   ```
   *The installer will be generated in `apps/desktop/src-tauri/target/release/bundle/nsis/Segmenta_0.1.0_x64-setup.exe`.*

5. **Build Browser Extension:**
   ```bash
   npm run build:extension
   ```
   *Load the `apps/extension/dist` folder into `chrome://extensions` via "Load unpacked".*

---

## Browser Native Messaging Setup

To allow the browser extension to forward intercepted downloads to the desktop engine:

### Chrome / Edge (Windows)
Create a registry key at `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.segmenta.downloader` (or `Microsoft\Edge\NativeMessagingHosts\...`) with the default value pointing to the absolute path of `manifest-chrome.json`.

### Firefox (Windows)
Create a registry key at `HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\com.segmenta.downloader` with the default value pointing to `manifest-firefox.json`.

---

## Development & Quality Gate

Run full verification before submitting any changes:

```bash
# Check code formatting
cargo fmt --all -- --check

# Run Rust linter
cargo clippy --workspace --all-targets -- -D warnings

# Execute all tests
cargo test --workspace

# Validate Desktop frontend types and bundle
npm --prefix apps/desktop run check
npm --prefix apps/desktop run build

# Validate Extension frontend types and bundle
npm --prefix apps/extension run check
npm --prefix apps/extension run build
```

---

## Contributing

Contributions are welcome and appreciated. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for development workflows, coding standards, and PR guidelines. All participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License

Segmenta is dual-licensed under either of:
- **Apache License, Version 2.0** ([LICENSE](LICENSE) or http://www.apache.org/licenses/LICENSE-2.0)
- **MIT License** ([LICENSE](LICENSE) or http://opensource.org/licenses/MIT)

at your option.
