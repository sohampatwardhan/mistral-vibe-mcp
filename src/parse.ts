/**
 * Pure parsers for Vibe CLI output.
 *
 * The authoritative source is the export.json Vibe writes to `--output-dir` on every
 * exit (see parseExport). Stdout parsing is a tolerant fallback, since the exact shape
 * of `--output json` / `streaming` is not pinned across Vibe versions.
 */

import type { VibeExport, VibeResult, VibeSummary } from "./types.js";

/**
 * Heuristic for ids scraped from free text or loosely named keys: id characters only,
 * at least 4 long, and containing a digit. Vibe session ids are UUIDs, so this keeps
 * real ids while rejecting ordinary words ("Session: restored from cache").
 */
function looksLikeId(value: string): boolean {
  return /^[A-Za-z0-9._-]{4,}$/.test(value) && /\d/.test(value);
}

/**
 * Attempt to extract a session id from text. Handles common shapes:
 *   "session_id": "abc123"
 *   session: abc-123
 *   Session ID: ABC123
 *   --resume abc123
 */
export function extractSessionId(text: string): string | null {
  if (!text) return null;

  // Explicitly labelled ids: trust any id-shaped token.
  const labelled: RegExp[] = [
    /"session[_-]?id"\s*:\s*"([A-Za-z0-9._-]+)"/i,
    /session[_\s-]*id\s*[:=]\s*"?([A-Za-z0-9._-]{4,})"?/i,
    /--resume[=\s]+([A-Za-z0-9._-]{4,})/i,
  ];
  for (const re of labelled) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }

  // A bare "session: X" is common in prose, so X must also look like an id.
  const loose = text.match(/\bsession\s*[:=]\s*"?([A-Za-z0-9._-]+)"?/i);
  if (loose && loose[1] && looksLikeId(loose[1])) return loose[1];
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

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

const COST_KEYS = ["cost_usd", "cost", "total_cost", "price", "usd", "total_price"];
const TURN_KEYS = ["turns", "turn", "num_turns", "steps", "iterations"];
const TOKEN_KEYS = ["tokens", "total_tokens", "token_count"];

/** Deep-ish search for a usage/summary object within parsed JSON. */
function extractSummary(json: unknown): VibeSummary | null {
  if (!isObject(json)) return null;

  const roots: Record<string, unknown>[] = [json];
  for (const nestedKey of ["usage", "summary", "stats", "cost", "metrics"]) {
    const nested = json[nestedKey];
    if (isObject(nested)) roots.push(nested);
  }

  let cost: number | undefined;
  let turns: number | undefined;
  let tokens: number | undefined;

  for (const r of roots) {
    cost ??= findNumber(r, COST_KEYS);
    turns ??= findNumber(r, TURN_KEYS);
    tokens ??= findNumber(r, TOKEN_KEYS);
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
  if (!isObject(json)) return null;
  // Explicitly named keys are trusted as-is.
  for (const key of ["session_id", "sessionId"]) {
    const v = json[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  // `session` may be a nested object or a bare string; a bare string must look like an id.
  const session = json.session;
  if (isObject(session)) {
    for (const key of ["session_id", "sessionId", "id"]) {
      const v = session[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
  } else if (typeof session === "string" && looksLikeId(session)) {
    return session;
  }
  return null;
}

/**
 * Parse the export.json Vibe writes to `--output-dir`. Returns null when the content is
 * not a JSON object (missing file, older Vibe, partial write).
 */
export function parseExport(content: string): VibeExport | null {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isObject(json)) return null;

  const sessionId = typeof json.session_id === "string" && json.session_id ? json.session_id : null;
  const outcome = typeof json.outcome === "string" ? json.outcome : null;
  const stopReason = typeof json.stop_reason === "string" ? json.stop_reason : null;
  const err = json.error;
  const error = isObject(err) && typeof err.message === "string"
    ? err.message
    : typeof err === "string" ? err : null;

  return { sessionId, summary: extractSummary(json), outcome, stopReason, error };
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
