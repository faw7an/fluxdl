# FluxDL

FluxDL is a high-performance download manager built with Electrobun, React, and native Bun Workers. It leverages robust multi-threading capabilities to segment file payloads natively across the operating system without traditional Node overhead.

## Architecture Highlights
- Electrobun RPC Bridge for type-safe frontend-to-backend communication.
- Native multi-threaded downloads using Bun Workers fetching concurrent HTTP byte ranges.
- SQLite persistence mapping with native Write-Ahead Logging.
- React frontend strictly decoupled via AbortControllers and React.memo components preventing render thrashing.

## Getting Started

### Prerequisites
- Bun installed on your system.

### Installation
1. Clone the repository.
2. Run \`bun install\` to fetch dependencies.
3. Run \`bun run dev:hmr\` to launch the Vite hot-module development environment alongside the Electrobun core.

### Building
- For a Linux release build, run \`bun run build:linux\`.
- Artifact outputs will be packaged inside the designated \`build\` distribution paths.

For full architectural designs and development commands, please check the \`docs/\` directory.
