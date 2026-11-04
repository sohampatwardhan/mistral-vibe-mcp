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
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, opts.timeoutMs);
    }

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new VibeNotFoundError(bin));
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}
