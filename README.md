# mistral-vibe-mcp

An [MCP](https://modelcontextprotocol.io) **stdio server** that wraps the
[Mistral Vibe CLI](https://docs.mistral.ai/vibe/code/cli/work-with-cli) (`vibe` /
`mistral-vibe`) so any MCP client — Claude Desktop, Codex, Cursor, etc. — can drive the
Vibe coding agent programmatically.

This is a clean-room implementation under the **MIT** license. It is inspired by the idea
of an earlier `vibe-mcp` project but shares no code with it.

## Tools

| Tool | Purpose |
|------|---------|
| `vibe_run` | Start a **new** Vibe session with a prompt in a project directory. |
| `vibe_resume` | **Continue** the last session (`--continue`) or **resume** a specific one (`--resume SESSION_ID`). |
| `vibe_manage` | `status` (installed? version), `install`, or `update` Vibe via `uv`. |

### `vibe_run`

| Field | Type | Notes |
|-------|------|-------|
| `prompt` | string (required) | Instruction for the agent. |
| `project_dir` | string | Working dir. Defaults to the server cwd. |
| `max_turns` | integer | `--max-turns` (recommended). |
| `max_tokens` | integer | `--max-tokens`. |
| `max_price` | number | `--max-price` (indicative, **not** a hard budget). |
| `time_limit` | integer | `--time-limit` (seconds). |
| `model` | string | `--model` alias. |
| `agent` | enum | `ask` \| `accept-edits` \| `smart-approve` \| `auto-approve`. |
| `enabled_tools` | string[] | `--enabled-tools` (repeatable; globs / `re:` regex). |
| `disabled_tools` | string[] | `--disabled-tools` (repeatable). |
| `auto_approve` | boolean | `--auto-approve`/`--yolo`. **Default false.** |
| `worktree` | string\|boolean | `--worktree [name]`. |
| `trust` | boolean | `--trust` (temporary trust for cwd). |
| `output` | enum | `json` (default) \| `text` \| `streaming`. |

### `vibe_resume`

Same fields as `vibe_run`, plus the ones below. `prompt` is optional: when omitted, the
server sends `"Continue where you left off."` (Vibe only runs headless when given a prompt)
and says so in `notes`.

| Field | Type | Notes |
|-------|------|-------|
| `session_id` | string | Resume a specific session (`--resume`). Partial ids are accepted by Vibe. |
| `continue` | boolean | Continue the last session for the dir (`--continue`). **Default** when no `session_id`. |

If both `session_id` and `continue` are given, `session_id` wins and a note is returned.

### `vibe_manage`

| Field | Type | Notes |
|-------|------|-------|
| `action` | enum (required) | `status` \| `install` \| `update`. `install`/`update` run `uv tool install --upgrade mistral-vibe`. |

### Result shape

Each `vibe_run` / `vibe_resume` call returns a human summary line plus a JSON block:

```json
{
  "ok": true,
  "exitCode": 0,
  "exitClass": "finished",
  "timedOut": false,
  "sessionId": "28610fb0-6989-bbd5-220f-4bd5b1a0acb0",
  "summary": { "cost": 0.012, "tokens": 2048 },
  "outcome": "completed",
  "stopReason": "end_turn",
  "output": { "...": "parsed vibe --output json, or null" },
  "text": "raw stdout, only when output is not JSON (e.g. output: \"text\")",
  "error": "Vibe's error message, when the run failed",
  "notes": ["..."],
  "stderr": "..."
}
```

`sessionId`, `summary`, `outcome`, `stopReason` and `error` come from the `export.json` Vibe
writes to a private temporary `--output-dir` on every exit (deleted afterwards); stdout is
only scraped as a fallback.

`exitClass` maps Vibe's documented exit codes: `0 finished`, `1 start-or-config-error`,
`2 api-or-runtime-error`, `3 stopped-early`.

## Prerequisites

- **Node 20+**
- **Mistral Vibe CLI** installed:
  ```bash
  uv tool install --upgrade mistral-vibe
  ```
  (Need `uv`? See the [uv install guide](https://docs.astral.sh/uv/getting-started/installation/).)
  You can also run `vibe_manage { "action": "install" }` from any MCP client.

If the `vibe` binary lives somewhere non-standard, set `VIBE_BIN` to its path.

## Install & build

```bash
git clone https://github.com/sohampatwardhan/mistral-vibe-mcp.git
cd mistral-vibe-mcp
npm install
npm run build
```

The server entrypoint is `dist/index.js` (also exposed as the `mistral-vibe-mcp` bin).

## MCP client configuration

All clients launch the server over stdio with `node /abs/path/to/dist/index.js`.

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mistral-vibe": {
      "command": "node",
      "args": ["/abs/path/to/mistral-vibe-mcp/dist/index.js"]
    }
  }
}
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.mistral-vibe]
command = "node"
args = ["/abs/path/to/mistral-vibe-mcp/dist/index.js"]
```

### Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "mistral-vibe": {
      "command": "node",
      "args": ["/abs/path/to/mistral-vibe-mcp/dist/index.js"]
    }
  }
}
```

> Optional env (add an `"env": { ... }` block to any of the above):
> - `VIBE_BIN`: path to `vibe` if it isn't on PATH for the client process.
> - `VIBE_MCP_TIMEOUT_SECONDS`: hard timeout for a run without `time_limit` (default 1800).
>   With `time_limit`, the server lets Vibe stop itself and only kills it 60s after that.

## Example calls

```jsonc
// vibe_run
{ "prompt": "Add input validation to the login form", "max_turns": 6, "agent": "accept-edits" }

// vibe_resume - specific session
{ "session_id": "abc123", "prompt": "now add tests" }

// vibe_resume - continue last
{ "continue": true, "prompt": "keep going" }

// vibe_manage
{ "action": "status" }
```

## Development

- `npm test` runs the unit tests (no Vibe binary or network needed).
- `npm run build` typechecks and emits `dist/`.
- `npm run dev` runs the compiler in watch mode.

Tests cover the pure core (CLI argument building, output and export.json parsing), the
process runner (timeouts, closed stdin) against real child processes, and the tool handlers
end to end against a fake `vibe` script (`test/fixtures/fake-vibe.mjs`).

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the PR workflow and code rules, and
[CHANGELOG.md](./CHANGELOG.md) for what changed in each version.

## How it works

```
MCP client <-> (stdio/JSON-RPC) <-> index.ts
                                      |- tools.ts  (schemas + dispatch)
                                      |- args.ts   (pure argv builders)
                                      |- parse.ts  (pure output parsing)
                                      |- runner.ts (spawn vibe)
                                      |- manage.ts (status/install/update)
```

The server never builds shell strings; it spawns `vibe` with an argv array, so prompts and
tool names can't inject shell commands.

## Agent Skills

This repo ships [Agent Skills](https://github.com/vercel-labs/skills) so an agent can learn how
to drive these MCP tools. Install them with the `skills` CLI:

```bash
# all skills in this repo
npx skills add sohampatwardhan/mistral-vibe-mcp

# a specific skill
npx skills add sohampatwardhan/mistral-vibe-mcp --skill vibe-run
```

Skills live under `skills/<name>/SKILL.md` (the standard `npx skills` discovery path):

| Skill | Teaches |
|-------|---------|
| `mistral-vibe` | Umbrella overview + when to load the others. |
| `vibe-run` | Starting a new session: prompt, `project_dir`, guardrails, agent profiles, `auto_approve` caution. |
| `vibe-resume` | Resume (`session_id`) vs continue precedence and when to use each. |
| `vibe-manage` | `status`/`install`/`update` via `uv`, and `VIBE_BIN`. |

These skills teach how to use **this server's** tools; they are not a copy of Vibe's own docs.

## License

MIT - see [LICENSE](./LICENSE).

Session and flag behavior is based on the current Vibe CLI programmatic docs:
<https://docs.mistral.ai/vibe/code/cli/work-with-cli>.
