import { describe, it, expect } from "vitest";
import { buildRunArgs, buildResumeArgs, resumeHasOverride } from "../src/args.js";

describe("buildRunArgs", () => {
  it("puts prompt first and defaults output to json", () => {
    const args = buildRunArgs({ prompt: "hello" });
    expect(args.slice(0, 2)).toEqual(["--prompt", "hello"]);
    expect(args).toContain("--output");
    const i = args.indexOf("--output");
    expect(args[i + 1]).toBe("json");
  });

  it("maps scalar guardrail flags", () => {
    const args = buildRunArgs({
      prompt: "p",
      max_turns: 5,
      max_tokens: 1000,
      max_price: 0.5,
      time_limit: 120,
      model: "mistral-large",
      agent: "accept-edits",
    });
    expect(args).toEqual(
      expect.arrayContaining([
        "--max-turns", "5",
        "--max-tokens", "1000",
        "--max-price", "0.5",
        "--time-limit", "120",
        "--model", "mistral-large",
        "--agent", "accept-edits",
      ]),
    );
  });

  it("expands repeatable enabled/disabled tools", () => {
    const args = buildRunArgs({
      prompt: "p",
      enabled_tools: ["read", "re:write.*"],
      disabled_tools: ["shell"],
    });
    const enabled = args.filter((_, idx) => args[idx - 1] === "--enabled-tools");
    expect(enabled).toEqual(["read", "re:write.*"]);
    expect(args[args.indexOf("--disabled-tools") + 1]).toBe("shell");
  });

  it("only emits boolean flags when true", () => {
    const off = buildRunArgs({ prompt: "p", auto_approve: false, trust: false });
    expect(off).not.toContain("--auto-approve");
    expect(off).not.toContain("--trust");
    const on = buildRunArgs({ prompt: "p", auto_approve: true, trust: true });
    expect(on).toContain("--auto-approve");
    expect(on).toContain("--trust");
  });

  it("handles worktree as boolean and as name", () => {
    expect(buildRunArgs({ prompt: "p", worktree: true })).toContain("--worktree");
    const named = buildRunArgs({ prompt: "p", worktree: "feature-x" });
    expect(named[named.indexOf("--worktree") + 1]).toBe("feature-x");
  });

  it("respects an explicit output override", () => {
    const args = buildRunArgs({ prompt: "p", output: "text" });
    expect(args[args.indexOf("--output") + 1]).toBe("text");
  });
});

describe("buildResumeArgs", () => {
  it("uses --resume with a session id", () => {
    const args = buildResumeArgs({ session_id: "abc123", prompt: "go on" });
    expect(args).toEqual(expect.arrayContaining(["--resume", "abc123", "--prompt", "go on"]));
    expect(args).not.toContain("--continue");
  });

  it("uses --continue when continue:true and no session id", () => {
    const args = buildResumeArgs({ continue: true });
    expect(args).toContain("--continue");
    expect(args).not.toContain("--resume");
  });

  it("defaults to --continue when nothing is specified", () => {
    const args = buildResumeArgs({});
    expect(args).toContain("--continue");
  });

  it("prefers session_id over continue (override)", () => {
    const input = { session_id: "s1", continue: true };
    expect(resumeHasOverride(input)).toBe(true);
    const args = buildResumeArgs(input);
    expect(args).toContain("--resume");
    expect(args).not.toContain("--continue");
  });

  it("omits --prompt when no follow-up prompt is given", () => {
    const args = buildResumeArgs({ session_id: "s1" });
    expect(args).not.toContain("--prompt");
  });
});
