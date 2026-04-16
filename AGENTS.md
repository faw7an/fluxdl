# AI Agent Guide for FluxDL

This document serves as an explicit guideline for agents or sub-agents touching the FluxDL codebase in the future. Read this to understand the architectural paradigms utilized.

## Structural Boundaries

### 1. Framework Strictness
- Frontend: React 18, Vite, TailwindCSS v4, shadcn/ui.
- Backend: Bun, Electrobun 1.16+, SQLite native bindings.
- Communication strictly occurs over Typed RPC within `src/shared/rpc.ts`. Do not circumvent the `BrowserWindow.defineRPC` structure for IPC messages.

### 2. Backend Constraints
- **Concurrency**: Governed via `p-queue` across `DownloadsEngine`. Wait logic must respect active limits. Do not open raw TCP/Fetch instances blindly.
- **Workers**: Each HTTP download chunks via native `Worker` instantiations in `src/bun/download-worker.ts`. Do not pull chunk payloads into memory Buffers directly. Use `node:fs` Streams or `Bun.file(..).stream()` to stream bytes cleanly to `writer()`.
- **Database**: `PRAGMA WAL` mode is on. UI ticks fetch data every 500ms, but SQLite persistence runs on a modulo (throttled). Never perform sync-writes repeatedly over intervals without throttling.

### 3. Frontend Constraints
- UI states run inside `src/mainview/App.tsx`.
- Component reconciliation is strictly limited via `React.memo` (specifically inside mappings like `DownloadRow.tsx`). Always map parity states strictly. Do not allow 100+ row diffs upon a single download progress update.
- Always use `min-w-0` or `truncate` over unbounded flex elements to prevent breaking the application boundaries grid.
- Do not add standard electron dependencies, as this operates purely in `electrobun`.

### 4. Build Pipelines
- `bump:version` and packaging strictly hook through the `electrobun.config.ts` mapping. Always test Linux `.AppImage` bindings cleanly. Github Actions `.github/workflows/release.yml` performs the distribution sequence.
