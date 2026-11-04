# Requirements Document

## Introduction

`mistral-vibe-mcp` is an MCP (Model Context Protocol) stdio server, written in TypeScript,
that wraps the **Mistral Vibe CLI** (`vibe` / `mistral-vibe`) so any MCP client (Claude
Desktop, Codex, Cursor, etc.) can run the Vibe coding agent programmatically as a set of
tools. It is a clean-room reimplementation under the MIT license and is not a fork of the
GPL `DarkPhilosophy/vibe-mcp` project.

The server exposes three tools:
- `vibe_run` — start a new Vibe session with a prompt in a project directory.
- `vibe_resume` — continue the last session (`--continue`) or a specific session (`--resume SESSION_ID`).
- `vibe_manage` — operational helper: `status` (is Vibe installed / version), `install`, `update`.

## Glossary

- **Vibe CLI**: Mistral's terminal coding agent, installed via `uv tool install --upgrade mistral-vibe`. Binary: `vibe` (or `mistral-vibe`).
- **Programmatic mode**: Running Vibe non-interactively with `--prompt/-p` and `--output json`.
- **Session**: One Vibe run; identified by a SESSION_ID and logged under `~/.vibe/logs/session`.
- **project_dir**: Working directory the agent operates in; session state is tracked per project_dir.
- **MCP**: Model Context Protocol; this server speaks it over stdio.

## Requirements

### Requirement 1: Expose an MCP stdio server

**User Story:** As an MCP client user, I want a stdio server that advertises Vibe tools, so that I can invoke the Vibe agent from my client.

#### Acceptance Criteria
1. WHEN the server starts THEN THE SYSTEM SHALL connect over stdio using the MCP SDK and respond to `initialize`.
2. WHEN a client lists tools THEN THE SYSTEM SHALL return exactly `vibe_run`, `vibe_resume`, and `vibe_manage` with JSON-schema input definitions.
3. WHERE the Node runtime is below version 20 THE SYSTEM SHALL still start but SHOULD document Node 20+ as the supported baseline.
4. IF an unknown tool name is called THEN THE SYSTEM SHALL return an MCP error result rather than crash.

### Requirement 2: Run a new Vibe session (`vibe_run`)

**User Story:** As a developer, I want to run a Vibe prompt in a chosen directory with guardrails, so that I can automate coding tasks.

#### Acceptance Criteria
1. WHEN `vibe_run` is called with a `prompt` THEN THE SYSTEM SHALL invoke the Vibe CLI with `--prompt <prompt> --output json` in the given `project_dir` (default: current working directory).
2. THE SYSTEM SHALL map optional inputs to CLI flags: `max_turns`→`--max-turns`, `max_tokens`→`--max-tokens`, `max_price`→`--max-price`, `time_limit`→`--time-limit`, `model`→`--model`, `agent`→`--agent`, `enabled_tools`→repeated `--enabled-tools`, `disabled_tools`→repeated `--disabled-tools`, `auto_approve`→`--auto-approve`, `worktree`→`--worktree [name]`, `trust`→`--trust`.
3. WHEN `auto_approve` is not provided THEN THE SYSTEM SHALL default to NOT auto-approving (safe default).
4. WHEN the CLI exits THEN THE SYSTEM SHALL return structured output including the parsed JSON (when `--output json` yields valid JSON), the session id when discoverable, the exit code, and a cost/session summary when available.
5. IF the Vibe binary is not found THEN THE SYSTEM SHALL return a clear error instructing the user to install Vibe (`uv tool install --upgrade mistral-vibe`), not a raw ENOENT.
6. IF the CLI exits non-zero THEN THE SYSTEM SHALL surface the exit code and stderr and classify it (1=start/config, 2=API/runtime, 3=stopped early).

### Requirement 3: Resume or continue a session (`vibe_resume`)

**User Story:** As a developer, I want to continue a previous Vibe session, so that the agent keeps context across calls.

#### Acceptance Criteria
1. WHEN `vibe_resume` is called with `session_id` THEN THE SYSTEM SHALL invoke Vibe with `--resume <session_id>` plus the prompt.
2. WHEN `vibe_resume` is called with `continue: true` and no `session_id` THEN THE SYSTEM SHALL invoke Vibe with `--continue`.
3. WHEN neither `session_id` nor `continue` is provided THEN THE SYSTEM SHALL default to `--continue` for the given `project_dir`.
4. THE SYSTEM SHALL accept the same optional guardrail flags as `vibe_run`.
5. IF both `session_id` and `continue` are provided THEN THE SYSTEM SHALL prefer `session_id` and note the override.

### Requirement 4: Manage the Vibe install (`vibe_manage`)

**User Story:** As an operator, I want to check and install/update Vibe, so that the server is usable out of the box.

#### Acceptance Criteria
1. WHEN `vibe_manage` is called with `action: "status"` THEN THE SYSTEM SHALL report whether `vibe` resolves on PATH and its `--version` output.
2. WHEN `action: "install"` THEN THE SYSTEM SHALL run `uv tool install --upgrade mistral-vibe` and report success/failure.
3. WHEN `action: "update"` THEN THE SYSTEM SHALL run the same upgrade command (idempotent update).
4. IF `uv` is not installed THEN THE SYSTEM SHALL return a clear error pointing to the uv install guide.

### Requirement 5: Session summary & logs

**User Story:** As a developer, I want a cost/turn summary after a run, so that I can track usage.

#### Acceptance Criteria
1. WHERE the Vibe JSON output contains usage/cost/session fields THE SYSTEM SHALL extract and include them in the tool result summary.
2. WHERE `~/.vibe/logs/session` contains a session log for the run THE SYSTEM SHALL best-effort reference it, without failing the call if absent.

### Requirement 6: Quality gates

**User Story:** As a maintainer, I want tests and CI, so that regressions are caught.

#### Acceptance Criteria
1. THE SYSTEM SHALL include unit tests for CLI argument building, output parsing, and session-id extraction.
2. WHEN `npm test` runs THEN THE SYSTEM SHALL pass without requiring the Vibe binary to be installed (pure-unit, no network).
3. THE SYSTEM SHALL include a GitHub Actions workflow running build + test on Node 20.
4. THE SYSTEM SHALL ship a README documenting the tools and MCP client config, a LICENSE (MIT), and a .gitignore.
