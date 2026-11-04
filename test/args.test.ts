import { describe, it, expect } from "vitest";
import {
  buildRunArgs,
  buildResumeArgs,
  resumeHasOverride,
  DEFAULT_RESUME_PROMPT,
} from "../src/args.js";

describe("buildRunArgs", () => {
  it("puts prompt first and defaults output to json", () => {
    const args = buildRunArgs({ prompt: "hello" });
    expect(args[0]).toBe("--prompt=hello");
    expect(args).toContain("--output");
    const i = args.indexOf("--output");
    expect(args[i + 1]).toBe("json");
  });

  it("keeps a prompt that starts with a dash attached to --prompt", () => {
    // Vibe's --prompt takes an optional value, so `--prompt "-n x"` is parsed as an
    // unknown flag `-n`. The `--prompt=<value>` form is always unambiguous.
    const args = buildRunArgs({ prompt: "- fix the bug\n- add tests" });
    expect(args[0]).toBe("--prompt=- fix the bug\n- add tests");
    expect(args).not.toContain("- fix the bug\n- add tests");
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
        "--model=mistral-large",
        "--agent=accept-edits",
      ]),
    );
  });

  it("expands repeatable enabled/disabled tools", () => {
    const args = buildRunArgs({
      prompt: "p",
      enabled_tools: ["read", "re:write.*"],
      disabled_tools: ["shell"],
    });
    expect(args.filter((a) => a.startsWith("--enabled-tools="))).toEqual([
      "--enabled-tools=read",
      "--enabled-tools=re:write.*",
    ]);
    expect(args).toContain("--disabled-tools=shell");
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
    expect(buildRunArgs({ prompt: "p", worktree: "feature-x" })).toContain("--worktree=feature-x");
  });

  it("respects an explicit output override", () => {
    const args = buildRunArgs({ prompt: "p", output: "text" });
    expect(args[args.indexOf("--output") + 1]).toBe("text");
  });
});

describe("buildResumeArgs", () => {
  it("uses --resume with a session id", () => {
    const args = buildResumeArgs({ session_id: "abc123", prompt: "go on" });
    expect(args).toEqual(expect.arrayContaining(["--resume=abc123", "--prompt=go on"]));
    expect(args).not.toContain("--continue");
  });

  it("uses --continue when continue:true and no session id", () => {
    const args = buildResumeArgs({ continue: true, prompt: "p" });
    expect(args).toContain("--continue");
    expect(args.some((a) => a.startsWith("--resume"))).toBe(false);
  });

  it("defaults to --continue when nothing is specified", () => {
    const args = buildResumeArgs({});
    expect(args).toContain("--continue");
  });

  it("prefers session_id over continue (override)", () => {
    const input = { session_id: "s1", continue: true };
    expect(resumeHasOverride(input)).toBe(true);
    const args = buildResumeArgs(input);
    expect(args).toContain("--resume=s1");
    expect(args).not.toContain("--continue");
  });

  it("sends a default prompt when none is given, so Vibe stays in headless mode", () => {
    // Without -p/--prompt Vibe starts its interactive UI and never exits.
    for (const prompt of [undefined, "", "   "]) {
      const args = buildResumeArgs({ session_id: "s1", prompt });
      expect(args).toContain(`--prompt=${DEFAULT_RESUME_PROMPT}`);
    }
  });

  it("keeps a resume prompt that starts with a dash attached to --prompt", () => {
    const args = buildResumeArgs({ prompt: "--now add tests" });
    expect(args).toContain("--prompt=--now add tests");
  });
});
