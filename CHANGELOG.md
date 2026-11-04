# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `vibe_resume` without a `prompt` no longer hangs. Without `-p`, Vibe started its
  interactive UI and never exited. The tool now sends `Continue where you left off.` and
  says so in `notes`. ([#1])
- Prompts that start with `-` (for example a markdown list) are no longer rejected by Vibe
  as unknown flags. Every user value is passed as `--flag=value`. ([#1])
- `output: "text"` no longer drops Vibe's answer. Non-JSON stdout is returned in a new
  `text` field. ([#1])
- Session ids are no longer scraped from prose such as `Session: restored from cache` or from
  generic `id` fields, and the cost is no longer missed on Vibe 3, which reports it as
  `cost_usd`. ([#1])

### Added

- Hard timeout on every `vibe_run` / `vibe_resume` call: `time_limit` plus 60 seconds, or
  `VIBE_MCP_TIMEOUT_SECONDS` (default 1800) when no `time_limit` is set. A run that ignores
  SIGTERM is killed 5 seconds later. ([#1])
- `outcome`, `stopReason` and `error` result fields, read with `sessionId` and `summary`
  from the `export.json` Vibe writes to a private temporary `--output-dir`. ([#1])
- Tests for the process runner, using real child processes, and for the tool handlers end
  to end, using a fake `vibe` script. ([#1])

### Changed

- The Vibe child process now gets a closed stdin. ([#1])

### Security

- Upgraded zod from 3.25.76 to 4.6.7 for
  [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (memory
  exhaustion on unbounded arrays). ([#1])
- Upgraded vitest (dev only) from 2.1.9 to 4.1.12, clearing the tinypool, vite and esbuild
  advisories. ([#1])

## [0.1.0] - 2026-11-04

Initial version. Not published to npm.

### Added

- MCP stdio server wrapping the Mistral Vibe CLI, with the `vibe_run`, `vibe_resume` and
  `vibe_manage` tools.
- Agent Skills for the tools under `skills/`, installable with `npx skills`.

[Unreleased]: https://github.com/sohampatwardhan/mistral-vibe-mcp/compare/0662f151722864f40825e0d27b059204f8fd0e6e...main
[0.1.0]: https://github.com/sohampatwardhan/mistral-vibe-mcp/tree/0662f151722864f40825e0d27b059204f8fd0e6e
[#1]: https://github.com/sohampatwardhan/mistral-vibe-mcp/pull/1
