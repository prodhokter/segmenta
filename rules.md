# rules.md — Architectural & Coding Guardrails

1. **Deterministic Execution:** Hindari unhandled promise rejections dan silent failures.
2. **Error Handling:** Setiap API route wajib memiliki try/catch dengan response JSON terstruktur.
3. **No Placeholders:** Jangan pernah commit kode dengan 'TODO' atau stub fungsi kosong.
4. **Security Hardening:** Validasi input ketat, sanitasi payload, dan parameterize database queries.
