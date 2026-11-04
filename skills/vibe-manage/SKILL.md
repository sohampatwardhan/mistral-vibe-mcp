---
name: vibe-manage
description: Call the vibe_manage MCP tool to check, install, or update the Mistral Vibe CLI. Load this when vibe_run or vibe_resume fail with "Vibe CLI not found", when the user asks whether Vibe is installed or what version, or when they ask to install/update Vibe.
---

# vibe-manage

Operational helper for the underlying Vibe CLI. One required field: `action`.

## Actions

- **status** — reports whether the `vibe` binary resolves on PATH and its `--version`.
  ```json
  { "action": "status" }
  ```
  Returns `{ "installed": true|false, "version": "...", "ok": ... }`. Call this first if a
  run fails with a "Vibe CLI not found" error.

- **install** — runs `uv tool install --upgrade mistral-vibe`.
  ```json
  { "action": "install" }
  ```

- **update** — same upgrade command (idempotent). Use to pull the latest Vibe.
  ```json
  { "action": "update" }
  ```

## Requires `uv`

`install`/`update` need the `uv` tool on PATH. If `uv` is missing, the result explains it and
links the uv install guide (https://docs.astral.sh/uv/getting-started/installation/). `uv` is
not something this server installs for you.

## VIBE_BIN

If the `vibe` binary isn't on PATH for the MCP server process (custom install location), set
the `VIBE_BIN` environment variable to its absolute path in the MCP client config. `status`
then checks that binary.

## Typical flow

1. A `vibe_run` call fails → `vibe_manage { "action": "status" }`.
2. If not installed → `vibe_manage { "action": "install" }` (needs `uv`).
3. Retry the original `vibe_run`.
