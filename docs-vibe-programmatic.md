# Vibe CLI programmatic mode (notes for implementers)

Source: https://docs.mistral.ai/vibe/code/cli/work-with-cli

## Run
```
vibe --prompt "Analyze the codebase" --max-turns 5 --output json
```
Also: `--prompt-file PATH`, or pipe prompt on stdin with `-p` and no text.

## Key flags
- `--auto-approve` / `--yolo` — approve every tool call
- `--model ALIAS`
- `--system-prompt-file PATH`
- `--max-turns N` (recommended)
- `--max-tokens N`
- `--time-limit SECONDS`
- `--enabled-tools TOOL` (repeatable; glob / `re:` regex)
- `--disabled-tools TOOL` (repeatable)
- `--output text|json|streaming`
- `--output-dir DIR` — writes export.json + session copy
- `--max-price DOLLARS` — indicative only, not hard budget
- `--agent ask|accept-edits|smart-approve|auto-approve`
- `--trust` — temporary trust for cwd in programmatic mode
- `--worktree [name]`

## Resume / continue
- `vibe --continue` / `-c` — last session for this terminal/dir
- `vibe --resume SESSION_ID` — specific session (partial IDs ok)
- In programmatic mode: combine `-p` with `--continue` or `--resume SESSION_ID`
- Session logging default on at `~/.vibe/logs/session`

## Exit codes
0 finished; 1 start/config error; 2 API/runtime; 3 stopped early (limit/stop/decline)

## Install
```
uv tool install --upgrade mistral-vibe
```
Binary names: `vibe` or `mistral-vibe`
