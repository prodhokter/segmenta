# DATABASE.md — Database Architecture & Schema Spec

## Database Engine
- **Primary Database:** AI Auto-Selected for Platform desktop

## Relational Structure & Table Rules
Semua tabel wajib mematuhi standar enterprise:
- Primary key menggunakan UUID / ULID (`id TEXT PRIMARY KEY`).
- Pencatatan waktu konsisten (`created_at`, `updated_at`).
- Foreign key constraints eksplisit dengan indexation pada foreign key columns.
