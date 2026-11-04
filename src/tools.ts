/**
 * MCP tool definitions and handlers for mistral-vibe-mcp.
 *
 * Input JSON Schemas are hand-written (small and explicit) so we don't depend on any
 * zod-to-json-schema internals; zod is still used for runtime validation of inputs.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  buildRunArgs,
  buildResumeArgs,
  resumeHasOverride,
  resumeUsesDefaultPrompt,
  DEFAULT_RESUME_PROMPT,
} from "./args.js";
import { parseExport, parseVibeOutput } from "./parse.js";
import { resolveTimeoutMs, runVibe, VibeNotFoundError } from "./runner.js";
import { manage, type ManageAction } from "./manage.js";
import { classifyExit } from "./types.js";

/* ---------------------------------- validation ---------------------------------- */

const agentEnum = z.enum(["ask", "accept-edits", "smart-approve", "auto-approve"]);

const commonShape = {
  project_dir: z.string().optional(),
  max_turns: z.number().int().positive().optional(),
  max_tokens: z.number().int().positive().optional(),
  max_price: z.number().positive().optional(),
  time_limit: z.number().int().positive().optional(),
  model: z.string().optional(),
  agent: agentEnum.optional(),
  enabled_tools: z.array(z.string()).optional(),
  disabled_tools: z.array(z.string()).optional(),
  auto_approve: z.boolean().optional(),
  worktree: z.union([z.string(), z.boolean()]).optional(),
  trust: z.boolean().optional(),
  output: z.enum(["json", "text", "streaming"]).optional(),
};

const runSchema = z.object({ prompt: z.string().min(1), ...commonShape });
const resumeSchema = z.object({
  prompt: z.string().optional(),
  session_id: z.string().optional(),
  continue: z.boolean().optional(),
  ...commonShape,
});
const manageSchema = z.object({ action: z.enum(["status", "install", "update"]) });

/* ------------------------------- JSON Schema (MCP) ------------------------------- */

const commonProps: Record<string, unknown> = {
  project_dir: { type: "string", description: "Directory the agent runs in. Defaults to the server's cwd." },
  max_turns: { type: "integer", minimum: 1, description: "Cap agent turns (--max-turns)." },
  max_tokens: { type: "integer", minimum: 1, description: "Cap tokens (--max-tokens)." },
  max_price: { type: "number", exclusiveMinimum: 0, description: "Indicative budget in dollars (--max-price; not a hard limit)." },
  time_limit: { type: "integer", minimum: 1, description: "Wall-clock seconds (--time-limit)." },
  model: { type: "string", description: "Model alias (--model)." },
  agent: { type: "string", enum: ["ask", "accept-edits", "smart-approve", "auto-approve"], description: "Approval profile (--agent)." },
  enabled_tools: { type: "array", items: { type: "string" }, description: "Allow-list tools (--enabled-tools, repeatable; globs/re:)." },
  disabled_tools: { type: "array", items: { type: "string" }, description: "Deny-list tools (--disabled-tools, repeatable)." },
  auto_approve: { type: "boolean", description: "Approve every tool call (--auto-approve/--yolo). Default false." },
  worktree: { type: ["string", "boolean"], description: "Run in a git worktree (--worktree [name])." },
  trust: { type: "boolean", description: "Temporarily trust cwd (--trust)." },
  output: { type: "string", enum: ["json", "text", "streaming"], description: "Vibe output format. Default json." },
};

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const toolDefinitions: ToolDef[] = [
  {
    name: "vibe_run",
    description:
      "Start a new Mistral Vibe coding-agent session with a prompt in a project directory. " +
      "Returns parsed JSON output, session id, exit classification, and a cost/turn summary when available.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, description: "The instruction for the Vibe agent." },
        ...commonProps,
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "vibe_resume",
    description:
      "Continue a previous Vibe session. Provide session_id to resume a specific session (--resume), " +
      "or continue:true (default when no session_id) to continue the last session for the directory.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: `Follow-up instruction. Defaults to "${DEFAULT_RESUME_PROMPT}"` },
        session_id: { type: "string", description: "Resume a specific session (--resume). Partial ids accepted." },
        continue: { type: "boolean", description: "Continue the last session (--continue). Default when no session_id." },
        ...commonProps,
      },
      additionalProperties: false,
    },
  },
  {
    name: "vibe_manage",
    description:
      "Operational helper for the Vibe CLI: status (installed? version), install, or update " +
      "via `uv tool install --upgrade mistral-vibe`.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["status", "install", "update"],
          description: "status: check install/version; install/update: run uv tool install --upgrade.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
];

/* ---------------------------------- handlers ---------------------------------- */

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function ok(payload: unknown, human: string): ToolResult {
  return {
    content: [
      { type: "text", text: human },
      { type: "text", text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function truncate(s: string, n = 4000): string {
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;
}

/** Read and parse <dir>/export.json; null if Vibe did not write one. */
async function readExport(dir: string) {
  try {
    return parseExport(await readFile(join(dir, "export.json"), "utf8"));
  } catch {
    return null;
  }
}

async function handleVibeExec(
  args: string[],
  cwd: string,
  notes: string[],
  timeLimit: number | undefined,
): Promise<ToolResult> {
  // Vibe writes export.json (session id, cost, outcome) to --output-dir on every exit;
  // it is far more reliable than scraping stdout. One private temp dir per run.
  const outputDir = await mkdtemp(join(tmpdir(), "mistral-vibe-mcp-"));
  try {
    const timeoutMs = resolveTimeoutMs(timeLimit);
    const res = await runVibe([...args, `--output-dir=${outputDir}`], { cwd, timeoutMs });
    const parsed = parseVibeOutput(res.stdout);
    const exported = await readExport(outputDir);
    const sessionId = exported?.sessionId ?? parsed.sessionId;
    const summary = exported?.summary ?? parsed.summary;
    const exitClass = classifyExit(res.code);
    if (res.timedOut) {
      notes.push(`Stopped by the server's hard timeout after ${timeoutMs / 1000}s.`);
    }
    const payload = {
      ok: res.code === 0 && !res.timedOut,
      exitCode: res.code,
      exitClass,
      timedOut: res.timedOut,
      sessionId,
      summary,
      outcome: exported?.outcome ?? undefined,
      stopReason: exported?.stopReason ?? undefined,
      error: exported?.error ?? undefined,
      output: parsed.json,
      // Text-mode (or unparseable) output would otherwise be lost.
      text: parsed.json === null && parsed.text ? truncate(parsed.text, 100_000) : undefined,
      notes: notes.length ? notes : undefined,
      stderr: res.stderr ? truncate(res.stderr, 2000) : undefined,
    };
    const status = res.timedOut
      ? "Vibe timed out"
      : res.code === 0
        ? "Vibe finished"
        : `Vibe exited ${res.code} (${exitClass})`;
    const human =
      status +
      (sessionId ? ` — session ${sessionId}` : "") +
      (summary?.cost !== undefined ? ` — ~$${summary.cost}` : "") +
      (exported?.error ? ` — ${exported.error}` : "");
    return ok(payload, human);
  } catch (err) {
    if (err instanceof VibeNotFoundError) return fail(err.message);
    return fail(`Vibe execution failed: ${(err as Error).message}`);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

export async function callTool(name: string, rawArgs: unknown): Promise<ToolResult> {
  try {
    switch (name) {
      case "vibe_run": {
        const input = runSchema.parse(rawArgs ?? {});
        const cwd = input.project_dir ?? process.cwd();
        return handleVibeExec(buildRunArgs(input), cwd, [], input.time_limit);
      }
      case "vibe_resume": {
        const input = resumeSchema.parse(rawArgs ?? {});
        const cwd = input.project_dir ?? process.cwd();
        const notes: string[] = [];
        if (resumeHasOverride(input)) {
          notes.push("Both session_id and continue were provided; session_id takes precedence.");
        }
        if (resumeUsesDefaultPrompt(input)) {
          notes.push(`No prompt given; sent the default follow-up: ${DEFAULT_RESUME_PROMPT}`);
        }
        return handleVibeExec(buildResumeArgs(input), cwd, notes, input.time_limit);
      }
      case "vibe_manage": {
        const input = manageSchema.parse(rawArgs ?? {});
        const result = await manage(input.action as ManageAction, process.cwd());
        return ok(result, result.message);
      }
      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return fail(`Invalid arguments for ${name}: ${err.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("; ")}`);
    }
    return fail(`Tool ${name} failed: ${(err as Error).message}`);
  }
}
