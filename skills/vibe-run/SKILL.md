---
name: vibe-run
description: Call the vibe_run MCP tool to start a new Mistral Vibe coding-agent session. Load this when the user wants Vibe to make a code change, investigate, or complete a self-contained task in a project directory, and you need the right prompt, guardrails, and agent profile.
---

# vibe-run

Starts a **new** Vibe session. Use it for the first turn of any task; use `vibe_resume` for
follow-ups.

## Minimal call

```json
{ "prompt": "Add input validation to the login form" }
```

`project_dir` defaults to the server's working directory. Pass it explicitly when the task
targets a specific repo:

```json
{ "prompt": "Fix the failing unit tests", "project_dir": "/abs/path/to/repo" }
```

## Guardrails (recommended for automated use)

- `max_turns` (int) — cap agent turns. **Set this** for unattended runs (e.g. `6`).
- `time_limit` (int seconds) — wall-clock cap.
- `max_tokens` (int) — token cap.
- `max_price` (number) — indicative dollar budget. **Not a hard limit** — still set `max_turns`.
- `enabled_tools` / `disabled_tools` (string[]) — allow/deny Vibe tools; supports globs and
  `re:` regex. Use `disabled_tools: ["shell"]` to forbid shell, for example.

## Agent profiles (`agent`)

- `ask` — Vibe asks before each tool call (safest; may stall unattended runs).
- `accept-edits` — auto-accept file edits, still ask for riskier actions. Good default for
  supervised coding.
- `smart-approve` — Vibe decides what needs approval.
- `auto-approve` — approve everything (same effect as `auto_approve: true`).

## auto_approve — use with care

`auto_approve: true` (`--auto-approve`/`--yolo`) approves **every** tool call, including shell
and file writes. Default is **false**. Only enable when the user has explicitly accepted
unattended changes in that directory. For risky dirs, prefer `agent: "accept-edits"` plus
`disabled_tools` over full auto-approve. `trust: true` and `worktree` help contain blast radius.

## After the call

Read the JSON block: check `ok`/`exitClass`, save `sessionId` for a follow-up, and report the
`summary` (cost/turns). If `exitClass` is `stopped-early`, the run hit a limit — resume with a
higher cap or continue.
