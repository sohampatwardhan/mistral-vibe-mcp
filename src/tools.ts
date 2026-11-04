/**
 * MCP tool definitions and handlers for mistral-vibe-mcp.
 *
 * Input JSON Schemas are hand-written (small and explicit) so we don't depend on any
 * zod-to-json-schema internals; zod is still used for runtime validation of inputs.
 */

import { z } from "zod";
import { buildRunArgs, buildResumeArgs, resumeHasOverride } from "./args.js";
import { parseVibeOutput } from "./parse.js";
import { runVibe, VibeNotFoundError } from "./runner.js";
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
        prompt: { type: "string", description: "Optional follow-up instruction." },
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

async function handleVibeExec(args: string[], cwd: string, notes: string[]): Promise<ToolResult> {
  try {
    const res = await runVibe(args, { cwd });
    const parsed = parseVibeOutput(res.stdout);
    const exitClass = classifyExit(res.code);
    const payload = {
      ok: res.code === 0,
      exitCode: res.code,
      exitClass,
      timedOut: res.timedOut,
      sessionId: parsed.sessionId,
      summary: parsed.summary,
      output: parsed.json,
      notes: notes.length ? notes : undefined,
      stderr: res.stderr ? truncate(res.stderr, 2000) : undefined,
    };
    const human =
      (res.code === 0 ? "Vibe finished" : `Vibe exited ${res.code} (${exitClass})`) +
      (parsed.sessionId ? ` — session ${parsed.sessionId}` : "") +
      (parsed.summary?.cost !== undefined ? ` — ~$${parsed.summary.cost}` : "");
    return ok(payload, human);
  } catch (err) {
    if (err instanceof VibeNotFoundError) return fail(err.message);
    return fail(`Vibe execution failed: ${(err as Error).message}`);
  }
}

export async function callTool(name: string, rawArgs: unknown): Promise<ToolResult> {
  try {
    switch (name) {
      case "vibe_run": {
        const input = runSchema.parse(rawArgs ?? {});
        const cwd = input.project_dir ?? process.cwd();
        return handleVibeExec(buildRunArgs(input), cwd, []);
      }
      case "vibe_resume": {
        const input = resumeSchema.parse(rawArgs ?? {});
        const cwd = input.project_dir ?? process.cwd();
        const notes: string[] = [];
        if (resumeHasOverride(input)) {
          notes.push("Both session_id and continue were provided; session_id takes precedence.");
        }
        return handleVibeExec(buildResumeArgs(input), cwd, notes);
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
      return fail(`Invalid arguments for ${name}: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    return fail(`Tool ${name} failed: ${(err as Error).message}`);
  }
}
