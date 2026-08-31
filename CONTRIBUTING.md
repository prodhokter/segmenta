# Contributing to Segmenta

Thank you for your interest in contributing to Segmenta. As an open-source project, we welcome bug fixes, architecture improvements, documentation refinements, and feature additions.

Please take a moment to review this document to ensure a smooth collaboration process.

---

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior to `maintainers@segmenta.org` (or open an issue).

---

## Development Setup

### 1. Prerequisites
- **Rust Toolchain:** Stable version 1.78+ (`rustup default stable`)
- **Rust Components:** `rustfmt`, `clippy` (`rustup component add rustfmt clippy`)
- **Node.js:** v20.x or higher with `npm`
- **C/C++ Build Tools:** Visual Studio C++ Build Tools (Windows), Xcode command line tools (macOS), or `build-essential` (Linux)

### 2. Fork and Clone
```bash
git clone https://github.com/<your-username>/segmenta.git
cd segmenta
git remote add upstream https://github.com/segmenta-org/segmenta.git
```

### 3. Install Node Workspaces
```bash
npm install
```

### 4. Verify Local Workspace
```bash
cargo test --workspace
npm --prefix apps/desktop run check
npm --prefix apps/extension run check
```

---

## Code Style & Architectural Standards

### Rust Coding Standards
- **Formatting:** Code must be formatted with `cargo fmt --all`.
- **Linter:** `cargo clippy --workspace --all-targets -- -D warnings` must pass with zero warnings.
- **Error Handling:** Avoid `.unwrap()` and `.expect()` in production engine paths. Propagate structured errors using `Result<T, E>` with `thiserror`.
- **Modularity:** Maintain focused modules (< 250 LOC per file where feasible).
- **Zero AI-Slop Comments:** Do not add redundant or decorative comments explaining what the code is visibly doing. Keep comments strictly focused on complex concurrency invariants, protocol limits, or edge-case reasoning.

### TypeScript / Svelte Standards
- **Strict Typing:** All TypeScript files must compile with `noImplicitAny: true` and zero compiler warnings (`npm run check`).
- **UI Design System:** Follow tokens defined in `DESIGN.md`:
  - Ground: `#fafafa` (Dark: `#09090b`)
  - Primary Brand Accent: `#4f46e5`
  - Secondary Accent: `#06b6d4`
  - Typography: Plus Jakarta Sans (Headings/Body) and JetBrains Mono (Code/Numbers/Logs).
- **Anti-Slop UI Guidelines:** No decorative emojis in UI layouts, no card-in-card nesting excess, minimum 44x44px touch targets.

---

## Pull Request Workflow

1. **Create a Feature Branch:**
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```

2. **Write Tests First (TDD):**
   - For engine or storage features, add unit and integration tests in `crates/segmenta-core/tests/` or `crates/segmenta-host/src/main.rs`.
   - Ensure all tests pass.

3. **Verify Pre-Commit Gates:**
   ```bash
   cargo fmt --all -- --check
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   npm --prefix apps/desktop run check
   npm --prefix apps/desktop run build
   npm --prefix apps/extension run check
   npm --prefix apps/extension run build
   ```

4. **Commit with Conventional Commits:**
   Use standard commit prefixes:
   - `feat(core): ...`
   - `feat(desktop): ...`
   - `feat(extension): ...`
   - `fix(engine): ...`
   - `docs: ...`
   - `chore: ...`

5. **Submit Pull Request:**
   - Provide a clear explanation of changes, problem solved, and test results.
   - Link any related issues (e.g., `Closes #123`).

---

## Reporting Issues

If you find a bug or have a feature proposal:
- Use our [Issue Templates](https://github.com/segmenta-org/segmenta/issues/new/choose) on GitHub.
- Include OS version, browser version, detailed reproduction steps, and relevant log output.
