/**
 * Pure parsers for Vibe CLI output. The exact JSON shape of `--output json` is not
 * pinned across Vibe versions, so parsing is deliberately tolerant.
 */

import type { VibeResult, VibeSummary } from "./types.js";

/**
 * Attempt to extract a session id from text. Handles common shapes:
 *   "session_id": "abc123"
 *   session: abc-123
 *   Session ID: ABC123
 *   --resume abc123
 */
export function extractSessionId(text: string): string | null {
  if (!text) return null;

  const patterns: RegExp[] = [
    /"session[_-]?id"\s*:\s*"([A-Za-z0-9._-]+)"/i,
    /session[_\s-]*id\s*[:=]\s*"?([A-Za-z0-9._-]{4,})"?/i,
    /\bsession\s*[:=]\s*"?([A-Za-z0-9._-]{4,})"?/i,
    /--resume\s+([A-Za-z0-9._-]{4,})/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

function findNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

/** Deep-ish search for a usage/summary object within parsed JSON. */
function extractSummary(json: unknown): VibeSummary | null {
  if (!json || typeof json !== "object") return null;

  const roots: Record<string, unknown>[] = [];
  const top = json as Record<string, unknown>;
  roots.push(top);
  for (const nestedKey of ["usage", "summary", "stats", "cost", "metrics"]) {
    const nested = top[nestedKey];
    if (nested && typeof nested === "object") roots.push(nested as Record<string, unknown>);
  }

  let cost: number | undefined;
  let turns: number | undefined;
  let tokens: number | undefined;

  for (const r of roots) {
    cost ??= findNumber(r, ["cost", "total_cost", "price", "usd", "total_price"]);
    turns ??= findNumber(r, ["turns", "turn", "num_turns", "steps", "iterations"]);
    tokens ??= findNumber(r, ["tokens", "total_tokens", "token_count"]);
  }

  if (cost === undefined && turns === undefined && tokens === undefined) return null;
  const summary: VibeSummary = {};
  if (cost !== undefined) summary.cost = cost;
  if (turns !== undefined) summary.turns = turns;
  if (tokens !== undefined) summary.tokens = tokens;
  return summary;
}

/**
 * Parse Vibe stdout. Tries full-string JSON first, then the last JSON object on a line
 * (streaming output), otherwise treats the text as plain output.
 */
export function parseVibeOutput(stdout: string): VibeResult {
  const text = stdout ?? "";
  let json: unknown | null = null;

  const trimmed = text.trim();
  if (trimmed) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = parseLastJsonLine(trimmed);
    }
  }

  const sessionId =
    extractSessionIdFromJson(json) ?? extractSessionId(text);

  const summary = extractSummary(json);

  return { json, text, sessionId, summary };
}

function extractSessionIdFromJson(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  for (const key of ["session_id", "sessionId", "session", "id"]) {
    const v = obj[key];
    if (typeof v === "string" && v.length >= 3) return v;
  }
  return null;
}

/** Scan lines bottom-up for a parseable JSON object (streaming / json-lines output). */
function parseLastJsonLine(text: string): unknown | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        return JSON.parse(line);
      } catch {
        // keep scanning
      }
    }
  }
  return null;
}
