MCP server that wraps the Mistral Vibe CLI (mistral-vibe / vibe) as an MCP stdio server.

Goals (inspired by, but not a fork of, the stale DarkPhilosophy/vibe-mcp from ~9 months ago):
- Tools: vibe_run, vibe_resume (or continue), vibe_manage (status/install/update), plus improvements for today's Vibe CLI
- Use current Vibe programmatic API: vibe -p/--prompt, --output json, --max-turns, --max-price, --resume SESSION_ID, --continue, --auto-approve/--yolo, --agent, --enabled-tools, --plan if still supported
- TypeScript preferred (MCP SDK), Node 20+, proper package.json, README, MIT or Apache-2.0 (not GPL unless needed)
- Session state per project_dir; support --continue as well as explicit session_id
- Cost/session summary when available from ~/.vibe/logs/session
- Config for Codex, Claude Desktop, Cursor-style MCP configs in README
- Tests where practical (unit for parsing/state); CI with GitHub Actions
- Do not copy GPL code from DarkPhilosophy/vibe-mcp; reimplement cleanly against current docs: https://docs.mistral.ai/vibe/code/cli/work-with-cli

Install Vibe via: uv tool install --upgrade mistral-vibe

Make sensible defaults. Keep the spec lean. Put open questions as comments if any — otherwise decide and record.
