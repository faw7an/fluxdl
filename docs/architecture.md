# Architecture

FluxDL abandons the traditional heavy Electron/Node setup by embedding lightweight Electrobun bindings over the Bun runtime natively.

## The Core Concept
The application consists of three primary domains:
1. **Frontend (View):** `vite`, `React`, and `tailwind v4` compiling down to standard web assets served securely via the Electrobun internal webview layer.
2. **Backend (Bun):** The core process running `DownloadsEngine`.
3. **Workers:** True parallel execution isolating download chunks away from the UI orchestrator thread using `bun-threads`.

## The RPC Bridge
Instead of using slow IPC patterns, FluxDL uses strict Typed RPC mappings (`src/shared/rpc.ts`) allowing seamless, auto-completed invocations from the Frontend:
```ts
win.rpc.send.requests.startDownload({ url: "..." })
```
This hits the backend safely.

## Progress Callbacks
Instead of pinging the backend constantly, the backend pushes tick updates at a 500ms heartbeat interval directly to the Frontend, throttling updates dynamically to preserve 60fps React render bindings over the `DownloadRow` maps.
