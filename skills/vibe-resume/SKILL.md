---
name: vibe-resume
description: Call the vibe_resume MCP tool to continue a previous Mistral Vibe session. Load this when a vibe_run task isn't finished, the user asks to keep going, or you want to add a follow-up instruction to an earlier session. Explains resume-vs-continue precedence and when to pass session_id.
---

# vibe-resume

Continues an existing Vibe session so context carries across calls. Accepts the same guardrail
fields as `vibe_run` (`max_turns`, `agent`, `auto_approve`, etc.).

## Two ways to target a session

- **Specific session** — pass `session_id` (maps to `--resume`). Partial ids are accepted by
  Vibe. Use this when you captured a `sessionId` from an earlier result, or across different
  working directories.
  ```json
  { "session_id": "abc123", "prompt": "now add tests for that change" }
  ```

- **Last session** — pass `continue: true` (maps to `--continue`). Continues the most recent
  session **for the project directory**. Use this for a quick follow-up right after a run in
  the same dir.
  ```json
  { "continue": true, "prompt": "keep going" }
  ```

## Precedence rules

- If **neither** `session_id` nor `continue` is given → defaults to `--continue`.
- If **both** are given → `session_id` wins (an explicit resume), and the result's `notes`
  records the override.

So: prefer `session_id` when you have one (unambiguous); fall back to `continue` for same-dir
follow-ups.

## prompt is optional

Omit `prompt` to let Vibe resume where it left off, or include one to steer the next step.

## After the call

Same result shape as `vibe_run`. Keep using the returned `sessionId` for further follow-ups.
