# FluxDL

<div align="center">

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**A high-performance, multi-threaded download manager built with Electrobun, React, and native Bun Workers.**

---

[Architecture](docs/architecture.md) • [Development](docs/development.md) • [Agents Guide](AGENTS.md)

</div>

## Overview

FluxDL leverages Bun's native multi-threading capabilities to segment file payloads natively across the operating system. By bypassing traditional Node overhead and utilizing raw OS streams, it provides maximum throughput and reliability for heavy downloads.

## Core Features

- **Segmented Downloads**: Native Bun Workers fetch concurrent HTTP byte ranges for accelerated speeds.
- **RPC Bridge**: Type-safe frontend-to-backend communication via Electrobun.
- **SQLite Persistence**: Native Write-Ahead Logging (WAL) for durable, fast metadata and settings storage.
- **Optimized UI**: React frontend utilizing `React.memo` and AbortControllers to prevent render thrashing even during high-speed transfers.
- **Dynamic Configuration**: Hot-swappable concurrency limits and category-based download directories.

## Getting Started

### Prerequisites

You must have [Bun](https://bun.sh) installed on your system.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/faw7an/fluxdl.git
   ```
2. Install dependencies:
   ```bash
   bun install
   ```
3. Launch development mode (Vite HMR + Electrobun):
   ```bash
   bun run dev:hmr
   ```

### Building

To generate a production-ready Linux release build:

```bash
bun run build:linux
```

Artifacts will be packaged inside the `build/` directory.

## Documentation

- [Project Architecture](docs/architecture.md) - Deep dive into the RPC bridge and engine.
- [Development Guide](docs/development.md) - Workflow, debugging, and build scripts.
- [AI Agents Guide](AGENTS.md) - Structural boundaries and coding standards for this repo.

---
<div align="center">
Built with precision over the Bun runtime.
</div>
