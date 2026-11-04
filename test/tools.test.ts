import { describe, it, expect, beforeEach } from "vitest";
import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { callTool, type ToolResult } from "../src/tools.js";
import { DEFAULT_RESUME_PROMPT } from "../src/args.js";

const fakeVibe = fileURLToPath(new URL("./fixtures/fake-vibe.mjs", import.meta.url));
chmodSync(fakeVibe, 0o755);

function payload(result: ToolResult): Record<string, any> {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[1].text);
}

beforeEach(() => {
  process.env.VIBE_BIN = fakeVibe;
  delete process.env.FAKE_VIBE_MODE;
  delete process.env.FAKE_VIBE_STDOUT;
  delete process.env.FAKE_VIBE_EXPORT;
  delete process.env.VIBE_MCP_TIMEOUT_SECONDS;
});

describe("vibe_run", () => {
  it("returns plain-text output instead of dropping it", async () => {
    process.env.FAKE_VIBE_MODE = "stdout";
    process.env.FAKE_VIBE_STDOUT = "Here is the plain answer.";
    const p = payload(await callTool("vibe_run", { prompt: "hi", output: "text" }));
    expect(p.output).toBeNull();
    expect(p.text).toBe("Here is the plain answer.");
  });

  it("prefers session id and cost from export.json over scraping stdout", async () => {
    process.env.FAKE_VIBE_MODE = "stdout";
    process.env.FAKE_VIBE_STDOUT = "Session ID: wrong-123";
    process.env.FAKE_VIBE_EXPORT = JSON.stringify({
      outcome: "completed",
      stop_reason: "end_turn",
      error: null,
      session_id: "28610fb0-6989-bbd5-220f-4bd5b1a0acb0",
      cost_usd: 0.02,
      exit_code: 0,
    });
    const p = payload(await callTool("vibe_run", { prompt: "hi" }));
    expect(p.sessionId).toBe("28610fb0-6989-bbd5-220f-4bd5b1a0acb0");
    expect(p.summary).toEqual({ cost: 0.02 });
    expect(p.outcome).toBe("completed");
    expect(p.stopReason).toBe("end_turn");
  });

  it("stops a run that exceeds the hard timeout and says so", async () => {
    process.env.FAKE_VIBE_MODE = "hang";
    process.env.VIBE_MCP_TIMEOUT_SECONDS = "0.3";
    const result = await callTool("vibe_run", { prompt: "hi" });
    const p = payload(result);
    expect(p.timedOut).toBe(true);
    expect(result.content[0].text).toMatch(/timed out/i);
  });
});

describe("input validation", () => {
  it("reports invalid arguments with the offending field", async () => {
    const result = await callTool("vibe_run", { prompt: "hi", max_turns: -1, agent: "nope" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Invalid arguments for vibe_run: /);
    expect(result.content[0].text).toContain("max_turns");
    expect(result.content[0].text).toContain("agent");
  });
});

describe("vibe_resume", () => {
  it("sends a default prompt when none is given and notes it", async () => {
    const p = payload(await callTool("vibe_resume", { session_id: "s1" }));
    expect(p.output.argv).toContain(`--prompt=${DEFAULT_RESUME_PROMPT}`);
    expect(p.notes.join(" ")).toMatch(/default/i);
  });
});
