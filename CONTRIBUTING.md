# Contributing to mistral-vibe-mcp

Thanks for helping. This file covers setup, how changes reach `main`, and the rules the
code depends on. The [README](./README.md) explains what the server does and how the
modules fit together.

## Setup

You need Node 20 or later and npm. The Vibe CLI is optional: the tests never run it.

```bash
npm ci          # install exact locked dependencies
npm test        # run the test suite
npm run build   # typecheck and emit dist/
npm run dev     # compiler in watch mode
```

To try the server against your own Vibe install, build it and point an MCP client at
`dist/index.js` (see the README for client configs).

## How changes reach `main`

- **Code, tests, dependencies and docs go through a pull request.** Branch from `main`,
  push the branch, and open a PR against `main`. Don't push these straight to `main`.
- **Specs are the exception.** Spec documents under `.kiro/specs/` are committed directly
  to `main`. If a spec relates to a GitHub issue, post the spec on that issue as a reply.
- Name branches by type: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- Write commit messages as [Conventional Commits](https://www.conventionalcommits.org/):
  `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `test: ...`.

## Before you open a PR

- `npm test` and `npm run build` pass. CI (`.github/workflows/ci.yml`) runs the same
  checks on every PR, on Node 20, 22 and 24 and on macOS, plus `npm audit` for runtime
  dependencies. Wait for CI to pass before merging.
- A bug fix comes with a test that failed before the fix.
- `CHANGELOG.md` has an entry under **Unreleased** for anything a user would notice.
- If a tool's inputs or result fields change, update the README and the matching skill in
  `skills/`.
- If you add or upgrade a dependency, run `npm audit` and mention any advisory in the PR.

## Rules the code depends on

These rules prevent bugs that have already happened. Keep them when you change the code.

- **Spawn Vibe with an argv array, never through a shell.** `src/runner.ts` uses
  `shell: false`, so a prompt can't inject shell commands.
- **Pass every user value as one `--flag=value` token.** Vibe's `--prompt`, `--resume` and
  `--worktree` take optional values, so `--prompt "-n x"` is read as an unknown flag `-n`.
- **Always run Vibe headless.** Every call must include `--prompt`. Without it, Vibe opens
  its interactive UI and the call never returns.
- **Keep `src/args.ts` and `src/parse.ts` pure.** No I/O there, so they stay unit-testable.
  Process spawning stays in `src/runner.ts`.
- **Prefer `export.json` over stdout.** Session id, cost and outcome come from the
  `export.json` Vibe writes to `--output-dir`. Parsing stdout is only a fallback.

## Tests

- Tests must not call the real Vibe CLI or the Mistral API.
- Tool handlers are tested end to end against `test/fixtures/fake-vibe.mjs`, selected
  through `VIBE_BIN`. Extend that script when a test needs new Vibe behaviour.
- Runner tests start real child processes (`node -e ...`) instead of mocking `spawn`.

To check a change against a real Vibe install without spending API credit, trigger an
error that Vibe raises before contacting the API. Two that work: an unknown model
(`--model=nope`) and a session id that doesn't exist (`--resume=00000000-0000-0000-0000-000000000000`).
Both exit 1 and still write `export.json`.

## Releasing

1. Set the new version in `package.json` and in `src/index.ts` (the server reports its
   version from there).
2. In `CHANGELOG.md`, rename **Unreleased** to the version and date, start a new empty
   **Unreleased** section, and update the compare links at the bottom.
3. Merge that through a PR, then tag the merge commit `vX.Y.Z`.

## Licensing

Contributions are licensed under the [MIT License](./LICENSE). This is a clean-room
implementation: don't copy code from `DarkPhilosophy/vibe-mcp`, which is GPL-licensed.
Work from the Vibe CLI's documentation and behaviour instead.
