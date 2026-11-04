---
name: mistral-vibe
description: Use the mistral-vibe-mcp server to drive the Mistral Vibe coding agent. Load this when the user wants to delegate a coding task to Vibe, continue a prior Vibe session, or check/install the Vibe CLI. Points at the vibe-run, vibe-resume, and vibe-manage skills.
---

# mistral-vibe

`mistral-vibe-mcp` is an MCP server that exposes the Mistral Vibe coding agent as three tools.
Use it to hand a self-contained coding task to Vibe and get structured results back.

## Tools at a glance

- `vibe_run` — start a **new** Vibe session with a prompt in a project directory.
- `vibe_resume` — **continue** the last session or **resume** a specific one by `session_id`.
- `vibe_manage` — `status` / `install` / `update` the Vibe CLI via `uv`.

## When to load which skill

- Starting fresh work → load **vibe-run**.
- Following up on a run (the task isn't finished, or you have the `session_id`) → load **vibe-resume**.
- Tool calls fail with "Vibe CLI not found", or you need to check the version → load **vibe-manage**.

## Result shape (all run/resume calls)

A human summary line plus a JSON block:

```json
{ "ok": true, "exitCode": 0, "exitClass": "finished", "timedOut": false,
  "sessionId": "28610fb0-6989-bbd5-220f-4bd5b1a0acb0", "summary": { "cost": 0.01 },
  "outcome": "completed", "output": { }, "stderr": "" }
```

With `output: "text"` the answer is in `text` (and `output` is null). On failure, `error`
carries Vibe's message. `timedOut: true` means the server's hard timeout stopped the run.

`exitClass`: `finished` (0), `start-or-config-error` (1), `api-or-runtime-error` (2),
`stopped-early` (3). Capture `sessionId` so you can resume.

## Safety

Prefer the default (no auto-approve) for anything that writes files or runs shell. Only set
`auto_approve: true` when the user has explicitly accepted unattended edits in that directory.
