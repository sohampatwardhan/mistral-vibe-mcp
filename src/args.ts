/**
 * Pure argv builders for the Vibe CLI. No I/O here so these are fully unit-testable.
 */

import type { CommonVibeOptions, RunInput, ResumeInput } from "./types.js";

function pushCommon(args: string[], opts: CommonVibeOptions): void {
  const output = opts.output ?? "json";
  args.push("--output", output);

  if (opts.max_turns !== undefined) args.push("--max-turns", String(opts.max_turns));
  if (opts.max_tokens !== undefined) args.push("--max-tokens", String(opts.max_tokens));
  if (opts.max_price !== undefined) args.push("--max-price", String(opts.max_price));
  if (opts.time_limit !== undefined) args.push("--time-limit", String(opts.time_limit));
  if (opts.model) args.push("--model", opts.model);
  if (opts.agent) args.push("--agent", opts.agent);

  for (const tool of opts.enabled_tools ?? []) args.push("--enabled-tools", tool);
  for (const tool of opts.disabled_tools ?? []) args.push("--disabled-tools", tool);

  if (opts.auto_approve === true) args.push("--auto-approve");
  if (opts.trust === true) args.push("--trust");

  if (opts.worktree === true) {
    args.push("--worktree");
  } else if (typeof opts.worktree === "string" && opts.worktree.length > 0) {
    args.push("--worktree", opts.worktree);
  }
}

/** Build argv for a brand new `vibe` run. */
export function buildRunArgs(input: RunInput): string[] {
  const args: string[] = ["--prompt", input.prompt];
  pushCommon(args, input);
  return args;
}

/**
 * Build argv for resuming/continuing a session.
 * Precedence: an explicit session_id wins over `continue`. If neither is given,
 * default to `--continue`.
 */
export function buildResumeArgs(input: ResumeInput): string[] {
  const args: string[] = [];
  if (input.prompt) args.push("--prompt", input.prompt);

  if (input.session_id) {
    args.push("--resume", input.session_id);
  } else if (input.continue === false) {
    // Explicitly disabled continue and no session id: still default to continue,
    // because resume/continue tools are meaningless otherwise.
    args.push("--continue");
  } else {
    args.push("--continue");
  }

  pushCommon(args, input);
  return args;
}

/** True when both selectors are present (session_id takes precedence). */
export function resumeHasOverride(input: ResumeInput): boolean {
  return Boolean(input.session_id) && input.continue === true;
}
