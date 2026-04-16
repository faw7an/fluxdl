# Development Guide

This document captures standard procedures to spin up the local project parameters.

## Bootstrapping
1. `bun install` — resolves all core dependencies.

## Local Hot Reloading
We use a concurrent dual-process stream:
1. `bun run dev:hmr`
   - This fires `vite --port 5173` on the background binding standard HMR React modifications.
   - It also initiates `electrobun dev` which watches backend `src/bun/*` logic natively.

## Testing Builds
When modifying Electrobun configurations (`electrobun.config.ts`), you can verify structural bounds gracefully using:
- `bun run build:canary`

For hard native outputs, you will want to target standard OS builds immediately validating binary bounds:
- `bun run build:linux`

## Debugging
If standard logs fail, verify `database.sqlite` inside `~/.config/FluxDL/`. Dropping this entirely will soft-reset the persistence layers gracefully if manual database schema injections freeze the RPC bridge streams locally.
