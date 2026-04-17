# AI Agent Guide for FluxDL

Welcome to the FluxDL codebase. This guide outlines the core architectural principles, constraints, and patterns you must follow to maintain the project's performance and "Premium" aesthetic.

---

## 🏗️ Structural Boundaries

### 1. Framework Strictness
- **Frontend**: React 18 + Vite + tailwindcss v4 + shadcn/ui.
- **Backend**: Bun + Electrobun 1.16+ + SQLite (native bindings).
- **Communication**: Strictly via **Typed RPC** in `src/shared/rpc.ts`. 
    - *Constraint*: Never use raw IPC or bypass the `BrowserWindow.defineRPC` / `initRPC` bridge.

### 2. State Management (The "Event-Driven" Rule)
FluxDL has transitioned from a polling-based UI to a **Push-Based Event System**.
- **The Brain**: All download state is managed by a central **Zustand Store** at `src/mainview/store/downloads.ts`.
- **The Pulse**: The store initializes the RPC bridge and listens for `downloadProgress`, `downloadComplete`, and `downloadError` events.
- **Atomic Subscriptions**: Components (like `DownloadRow`) must subscribe only to specific slices of state (e.g., a single download by ID) to prevent global re-renders.

### 3. Backend Architecture
- **Concurrency**: Governed via `p-queue` in `DownloadsEngine.ts`. Respect the user's `max_concurrent_downloads` setting.
- **Workers**: HTTP downloads are multi-segmented, using native Bun `Worker` instances in `src/bun/download-worker.ts`.
- **Streaming**: Always stream bytes to disk using `Bun.file(...).writer()`. Never buffer large payloads into memory.
- **Database**: SQLite is in `PRAGMA WAL` mode. Persistence is throttled; avoid rapid-fire sync writes to the DB.

---

## 🎨 Design & Aesthetic Standards

- **Premium UI**: We use high-end CSS including glassmorphism, HSL-tailored colors, and smooth micro-animations.
- **CEF Bundling**: `bundleCEF: true` is enabled for Linux and Windows to ensure rendering consistency. Do not rely on system WebKitGTK versions.
- **Responsiveness**: Always use `min-w-0` and `truncate` to handle long URLs/Filenames without breaking layout boundaries.

---

## 🚀 Build & Release Pipeline

- **Version Management**: Bump versions in **both** `package.json` and `electrobun.config.ts`.
- **Linux Packaging**: A custom script at `scripts/package-linux.sh` wraps Electrobun builds into:
    - **.AppImage** (Portable)
    - **.deb** (Debian/Ubuntu)
    - **.rpm** (Fedora/RHEL)
- **CI/CD**: The GitHub Actions workflow in `.github/workflows/release.yml` handles the multi-format generation and distribution to GitHub Releases.

---

## 🛠️ Working with the Code
- **Adding logic?** Put it in the Zustand store as an action, not in `App.tsx`.
- **Adding a UI element?** Use `memo` to shield from progress-pulse re-renders.
- **Fixing a download bug?** Check `DownloadsEngine.ts` first, specifically the pre-flight metadata extraction.

> [!TIP]
> Use `bun run dev` for a hot-reloading development experience, and `bun run build:canary` to test the full packaging pipeline locally.
