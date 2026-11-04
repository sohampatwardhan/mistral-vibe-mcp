/**
 * Shared types for mistral-vibe-mcp.
 *
 * Clean-room implementation (MIT). Flag semantics based on the current Vibe CLI
 * programmatic mode documented in docs-vibe-programmatic.md.
 */

export type OutputFormat = "json" | "text" | "streaming";

export type VibeAgent =
  | "ask"
  | "accept-edits"
  | "smart-approve"
  | "auto-approve";

/** Options common to running and resuming a Vibe session. */
export interface CommonVibeOptions {
  project_dir?: string;
  max_turns?: number;
  max_tokens?: number;
  max_price?: number;
  time_limit?: number;
  model?: string;
  agent?: VibeAgent;
  enabled_tools?: string[];
  disabled_tools?: string[];
  auto_approve?: boolean;
  worktree?: string | boolean;
  trust?: boolean;
  output?: OutputFormat;
}

export interface RunInput extends CommonVibeOptions {
  prompt: string;
}

export interface ResumeInput extends CommonVibeOptions {
  prompt?: string;
  session_id?: string;
  continue?: boolean;
}

/** Parsed view of a Vibe run's stdout. */
export interface VibeResult {
  json: unknown | null;
  text: string;
  sessionId: string | null;
  summary: VibeSummary | null;
}

export interface VibeSummary {
  cost?: number;
  turns?: number;
  tokens?: number;
}

/** Documented Vibe exit-code classification. */
export type ExitClass =
  | "finished"
  | "start-or-config-error"
  | "api-or-runtime-error"
  | "stopped-early"
  | "unknown";

export function classifyExit(code: number): ExitClass {
  switch (code) {
    case 0:
      return "finished";
    case 1:
      return "start-or-config-error";
    case 2:
      return "api-or-runtime-error";
    case 3:
      return "stopped-early";
    default:
      return "unknown";
  }
}
