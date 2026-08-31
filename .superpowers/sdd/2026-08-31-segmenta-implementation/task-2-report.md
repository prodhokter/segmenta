# Task 2 Implementation Report: Core Data Storage & SQLite Migration Layer

## Summary
Completed Task 2 of the Segmenta implementation plan for `crates/segmenta-core`:
- Configured `crates/segmenta-core/Cargo.toml` with dependencies from the workspace (`rusqlite`, `tokio`, `serde`, `chrono`, etc.) and `tempfile` for testing.
- Created `crates/segmenta-core/src/types.rs` defining domain types:
  - `TaskStatus` (`Queued`, `Downloading`, `Paused`, `PausedByError`, `Completed`, `Failed`, `Cancelled`) with string conversion methods and serde serialization.
  - `SegmentStatus` (`Pending`, `Downloading`, `Paused`, `Completed`, `Failed`) with string conversion methods and serde serialization.
  - `TaskRecord` struct representing task state, options, timing, and metadata.
  - `SegmentRecord` struct representing individual file slice ranges, downloaded progress, and retry attempts.
- Created `crates/segmenta-core/src/storage.rs` implementing thread-safe `Storage` struct:
  - SQLite initialization in WAL mode (`PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = NORMAL;`, `PRAGMA foreign_keys = ON;`).
  - Migration schemas for `tasks`, `segments`, and `settings` tables along with status and foreign key indexes.
  - CRUD operations: `save_task`, `get_task`, `list_tasks`, `update_task_status`, `save_segment`, `get_segments_for_task`, `delete_task`.
- Created `crates/segmenta-core/src/lib.rs` exporting `storage` and `types` modules.
- Created `crates/segmenta-core/tests/storage_test.rs` covering task insertion, retrieval, segment association, status updates, listing, and cascading deletion.

## Created Files
- `crates/segmenta-core/Cargo.toml`
- `crates/segmenta-core/src/types.rs`
- `crates/segmenta-core/src/storage.rs`
- `crates/segmenta-core/src/lib.rs`
- `crates/segmenta-core/tests/storage_test.rs`

## Verification
- Executed `cargo test -p segmenta-core` with 100% pass (`test_storage_task_crud_and_segments ... ok`).
- Committed changes to git with message `feat(core): implement SQLite embedded storage layer and migrations`.
