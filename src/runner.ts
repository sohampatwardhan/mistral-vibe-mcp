/**
 * Thin, isolated process layer. Everything that spawns the Vibe CLI lives here so the
 * rest of the codebase stays pure and testable.
 */

import { spawn } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Binary to invoke; defaults to the VIBE_BIN env var or "vibe". */
  bin?: string;
  /** Hard wall-clock timeout in ms (safety net on top of Vibe's own --time-limit). */
  timeoutMs?: number;
  /** After the timeout's SIGTERM, wait this long before SIGKILL. Default 5000. */
  killGraceMs?: number;
}

/** Default hard timeout when neither time_limit nor VIBE_MCP_TIMEOUT_SECONDS is set. */
export const DEFAULT_TIMEOUT_SECONDS = 30 * 60;
/** Extra time after Vibe's own --time-limit, so Vibe can stop cleanly and write its export. */
export const TIME_LIMIT_GRACE_SECONDS = 60;

/**
 * Hard timeout for one Vibe run. With a time_limit, Vibe stops itself; we only step in
 * if it overruns by TIME_LIMIT_GRACE_SECONDS. Otherwise VIBE_MCP_TIMEOUT_SECONDS
 * (operator override) or DEFAULT_TIMEOUT_SECONDS.
 */
export function resolveTimeoutMs(
  timeLimitSeconds: number | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (timeLimitSeconds !== undefined) {
    return (timeLimitSeconds + TIME_LIMIT_GRACE_SECONDS) * 1000;
  }
  const fromEnv = Number(env.VIBE_MCP_TIMEOUT_SECONDS);
  const seconds = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_SECONDS;
  return seconds * 1000;
}

export class VibeNotFoundError extends Error {
  constructor(bin: string) {
    super(
      `Could not find the Vibe CLI ("${bin}") on PATH. ` +
        `Install it with: uv tool install --upgrade mistral-vibe`,
    );
    this.name = "VibeNotFoundError";
  }
}

export function resolveBin(explicit?: string): string {
  return explicit || process.env.VIBE_BIN || "vibe";
}

/** Spawn the Vibe CLI with argv (array form — no shell, no injection). */
export function runVibe(args: string[], opts: RunOptions): Promise<RunResult> {
  const bin = resolveBin(opts.bin);
  return runProcess(bin, args, opts);
}

/** Generic spawn helper reused by manage.ts. */
export function runProcess(
  bin: string,
  args: string[],
  opts: Omit<RunOptions, "bin">,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: false,
      // Nothing is ever written to the child's stdin; leaving it as an open pipe lets a
      // child that reads stdin block forever.
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const clearTimers = () => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    };

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), opts.killGraceMs ?? 5000);
      }, opts.timeoutMs);
    }

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimers();
      if (err.code === "ENOENT") {
        reject(new VibeNotFoundError(bin));
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      clearTimers();
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}
