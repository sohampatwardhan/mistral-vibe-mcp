/**
 * Pure argv builders for the Vibe CLI. No I/O here so these are fully unit-testable.
 *
 * Every user-supplied value is passed as a single `--flag=value` token. Several Vibe
 * options (`--prompt`, `--resume`, `--worktree`) take an *optional* value, so the
 * two-token form `--prompt "-n x"` is parsed as an unknown flag `-n`.
 */

import type { CommonVibeOptions, RunInput, ResumeInput } from "./types.js";

/**
 * Follow-up sent when vibe_resume is called without a prompt. Vibe only runs headless
 * (and exits) when given -p/--prompt; without it, it opens the interactive UI and hangs.
 */
export const DEFAULT_RESUME_PROMPT = "Continue where you left off.";

function pushCommon(args: string[], opts: CommonVibeOptions): void {
  const output = opts.output ?? "json";
  args.push("--output", output);

  if (opts.max_turns !== undefined) args.push("--max-turns", String(opts.max_turns));
  if (opts.max_tokens !== undefined) args.push("--max-tokens", String(opts.max_tokens));
  if (opts.max_price !== undefined) args.push("--max-price", String(opts.max_price));
  if (opts.time_limit !== undefined) args.push("--time-limit", String(opts.time_limit));
  if (opts.model) args.push(`--model=${opts.model}`);
  if (opts.agent) args.push(`--agent=${opts.agent}`);

  for (const tool of opts.enabled_tools ?? []) args.push(`--enabled-tools=${tool}`);
  for (const tool of opts.disabled_tools ?? []) args.push(`--disabled-tools=${tool}`);

  if (opts.auto_approve === true) args.push("--auto-approve");
  if (opts.trust === true) args.push("--trust");

  if (opts.worktree === true) {
    args.push("--worktree");
  } else if (typeof opts.worktree === "string" && opts.worktree.length > 0) {
    args.push(`--worktree=${opts.worktree}`);
  }
}

/** Build argv for a brand new `vibe` run. */
export function buildRunArgs(input: RunInput): string[] {
  const args: string[] = [`--prompt=${input.prompt}`];
  pushCommon(args, input);
  return args;
}

/** True when vibe_resume will fall back to DEFAULT_RESUME_PROMPT. */
export function resumeUsesDefaultPrompt(input: ResumeInput): boolean {
  return !input.prompt?.trim();
}

/**
 * Build argv for resuming/continuing a session.
 * Precedence: an explicit session_id wins over `continue`; otherwise `--continue`
 * (resuming is the whole point of this tool, so `continue: false` alone still continues).
 */
export function buildResumeArgs(input: ResumeInput): string[] {
  const prompt = resumeUsesDefaultPrompt(input) ? DEFAULT_RESUME_PROMPT : input.prompt;
  const args: string[] = [`--prompt=${prompt}`];
  args.push(input.session_id ? `--resume=${input.session_id}` : "--continue");
  pushCommon(args, input);
  return args;
}

/** True when both selectors are present (session_id takes precedence). */
export function resumeHasOverride(input: ResumeInput): boolean {
  return Boolean(input.session_id) && input.continue === true;
}
