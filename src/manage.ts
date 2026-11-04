/**
 * vibe_manage helpers: status / install / update.
 */

import { runProcess, resolveBin, VibeNotFoundError } from "./runner.js";

export type ManageAction = "status" | "install" | "update";

export interface ManageResult {
  action: ManageAction;
  ok: boolean;
  installed?: boolean;
  version?: string;
  message: string;
  exitCode?: number;
}

const INSTALL_CMD = ["tool", "install", "--upgrade", "mistral-vibe"];

/** Report whether the Vibe CLI resolves and its version. */
export async function vibeStatus(cwd: string, bin?: string): Promise<ManageResult> {
  const resolved = resolveBin(bin);
  try {
    const res = await runProcess(resolved, ["--version"], { cwd });
    const version = (res.stdout || res.stderr).trim();
    return {
      action: "status",
      ok: res.code === 0,
      installed: res.code === 0,
      version: version || undefined,
      exitCode: res.code,
      message:
        res.code === 0
          ? `Vibe is installed: ${version || "(version unknown)"}`
          : `"${resolved} --version" exited ${res.code}.`,
    };
  } catch (err) {
    if (err instanceof VibeNotFoundError) {
      return {
        action: "status",
        ok: false,
        installed: false,
        message: err.message,
      };
    }
    throw err;
  }
}

/** Install or update Vibe via `uv tool install --upgrade mistral-vibe`. */
export async function vibeInstallOrUpdate(
  action: "install" | "update",
  cwd: string,
): Promise<ManageResult> {
  try {
    const res = await runProcess("uv", INSTALL_CMD, { cwd });
    return {
      action,
      ok: res.code === 0,
      exitCode: res.code,
      message:
        res.code === 0
          ? `Vibe ${action} succeeded via uv.`
          : `uv ${INSTALL_CMD.join(" ")} exited ${res.code}: ${res.stderr.trim()}`,
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT" || (err instanceof VibeNotFoundError)) {
      return {
        action,
        ok: false,
        message:
          "Could not find `uv`. Install uv first: https://docs.astral.sh/uv/getting-started/installation/",
      };
    }
    throw err;
  }
}

export async function manage(
  action: ManageAction,
  cwd: string,
  bin?: string,
): Promise<ManageResult> {
  if (action === "status") return vibeStatus(cwd, bin);
  return vibeInstallOrUpdate(action, cwd);
}
