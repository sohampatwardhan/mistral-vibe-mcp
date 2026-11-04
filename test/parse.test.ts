import { describe, it, expect } from "vitest";
import { parseVibeOutput, extractSessionId, parseExport } from "../src/parse.js";

describe("extractSessionId", () => {
  it("reads json-style session_id", () => {
    expect(extractSessionId('{"session_id": "abc123"}')).toBe("abc123");
  });
  it("reads human 'Session ID: X'", () => {
    expect(extractSessionId("Session ID: XYZ-789")).toBe("XYZ-789");
  });
  it("reads --resume hint", () => {
    expect(extractSessionId("resume with: vibe --resume deadbeef")).toBe("deadbeef");
  });
  it("returns null when absent", () => {
    expect(extractSessionId("nothing here")).toBeNull();
  });
});

describe("parseVibeOutput", () => {
  it("parses a full JSON object and extracts session + summary", () => {
    const stdout = JSON.stringify({
      session_id: "s-42",
      result: "done",
      usage: { cost: 0.0123, turns: 3, total_tokens: 2048 },
    });
    const r = parseVibeOutput(stdout);
    expect(r.json).not.toBeNull();
    expect(r.sessionId).toBe("s-42");
    expect(r.summary).toEqual({ cost: 0.0123, turns: 3, tokens: 2048 });
  });

  it("falls back to the last JSON line for streaming output", () => {
    const stdout = [
      "starting up",
      '{"event":"progress"}',
      '{"session_id":"stream-1","usage":{"cost":0.5}}',
    ].join("\n");
    const r = parseVibeOutput(stdout);
    expect(r.sessionId).toBe("stream-1");
    expect(r.summary?.cost).toBe(0.5);
  });

  it("treats non-JSON as plain text and still scrapes a session id", () => {
    const stdout = "All good.\nsession: plain-99\n";
    const r = parseVibeOutput(stdout);
    expect(r.json).toBeNull();
    expect(r.sessionId).toBe("plain-99");
    expect(r.text).toContain("All good.");
  });

  it("returns null summary when no usage fields are present", () => {
    const r = parseVibeOutput('{"result":"ok"}');
    expect(r.summary).toBeNull();
  });

  it("handles empty output", () => {
    const r = parseVibeOutput("");
    expect(r.json).toBeNull();
    expect(r.sessionId).toBeNull();
    expect(r.summary).toBeNull();
  });
});

describe("session id false positives", () => {
  it("ignores a plain word after 'Session:' in text output", () => {
    const r = parseVibeOutput("I updated the session handling.\nSession: restored from cache\nDone.");
    expect(r.sessionId).toBeNull();
  });

  it("does not treat a generic top-level id field as the session id", () => {
    expect(parseVibeOutput(JSON.stringify({ id: "msg_01", result: "ok" })).sessionId).toBeNull();
  });

  it("still reads a uuid after 'Session:'", () => {
    const r = parseVibeOutput("Session: 28610fb0-6989-bbd5-220f-4bd5b1a0acb0\n");
    expect(r.sessionId).toBe("28610fb0-6989-bbd5-220f-4bd5b1a0acb0");
  });
});

describe("parseVibeOutput cost keys", () => {
  it("reads cost_usd, the key Vibe 3 uses", () => {
    const r = parseVibeOutput(JSON.stringify({ session_id: "s-1", cost_usd: 0.02 }));
    expect(r.summary?.cost).toBe(0.02);
  });
});

describe("parseExport", () => {
  // Shape captured from a real Vibe 3.0.4 `--output-dir` run.
  const failed = {
    outcome: "infrastructure_failure",
    stop_reason: null,
    error: { message: "Agent 'x' not found.", code: null },
    session_id: null,
    usage: null,
    cost_usd: null,
    steps: null,
    schema_version: 1,
    vibe_version: "3.0.4",
    exit_code: 2,
  };

  it("extracts session id, cost and outcome from a successful export", () => {
    const r = parseExport(
      JSON.stringify({
        ...failed,
        outcome: "completed",
        stop_reason: "end_turn",
        error: null,
        session_id: "28610fb0-6989-bbd5-220f-4bd5b1a0acb0",
        cost_usd: 0.0123,
        usage: { total_tokens: 2048 },
        exit_code: 0,
      }),
    );
    expect(r).toEqual({
      sessionId: "28610fb0-6989-bbd5-220f-4bd5b1a0acb0",
      summary: { cost: 0.0123, tokens: 2048 },
      outcome: "completed",
      stopReason: "end_turn",
      error: null,
    });
  });

  it("surfaces the error message from a failed export", () => {
    const r = parseExport(JSON.stringify(failed));
    expect(r?.sessionId).toBeNull();
    expect(r?.summary).toBeNull();
    expect(r?.outcome).toBe("infrastructure_failure");
    expect(r?.error).toBe("Agent 'x' not found.");
  });

  it("returns null for unreadable export content", () => {
    expect(parseExport("not json")).toBeNull();
    expect(parseExport("[1,2]")).toBeNull();
  });
});
