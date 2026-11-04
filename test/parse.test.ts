import { describe, it, expect } from "vitest";
import { parseVibeOutput, extractSessionId } from "../src/parse.js";

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
