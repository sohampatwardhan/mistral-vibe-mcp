import { describe, it, expect } from "vitest";
import { runProcess, resolveTimeoutMs } from "../src/runner.js";

const node = process.execPath;
const cwd = process.cwd();

describe("runProcess", () => {
  it("gives the child a closed stdin so nothing blocks waiting for input", async () => {
    const script =
      "process.stdin.on('data',()=>{});" +
      "process.stdin.on('end',()=>{process.stdout.write('eof');process.exit(0)});";
    const res = await runProcess(node, ["-e", script], { cwd, timeoutMs: 3000 });
    expect(res.timedOut).toBe(false);
    expect(res.stdout).toBe("eof");
  });

  it("kills a child that runs past the timeout and reports it", async () => {
    const started = Date.now();
    const res = await runProcess(node, ["-e", "setInterval(()=>{},1000)"], {
      cwd,
      timeoutMs: 200,
    });
    expect(res.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("escalates to SIGKILL when the child ignores SIGTERM", async () => {
    const script = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdout.write('ready')";
    const started = Date.now();
    const res = await runProcess(node, ["-e", script], {
      cwd,
      timeoutMs: 300,
      killGraceMs: 300,
    });
    expect(res.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("resolveTimeoutMs", () => {
  it("allows Vibe's own --time-limit to fire first, plus a grace period", () => {
    expect(resolveTimeoutMs(120, {})).toBe((120 + 60) * 1000);
  });

  it("uses VIBE_MCP_TIMEOUT_SECONDS when no time_limit is given", () => {
    expect(resolveTimeoutMs(undefined, { VIBE_MCP_TIMEOUT_SECONDS: "90" })).toBe(90_000);
  });

  it("defaults to 30 minutes and ignores invalid env values", () => {
    expect(resolveTimeoutMs(undefined, {})).toBe(30 * 60 * 1000);
    expect(resolveTimeoutMs(undefined, { VIBE_MCP_TIMEOUT_SECONDS: "abc" })).toBe(30 * 60 * 1000);
    expect(resolveTimeoutMs(undefined, { VIBE_MCP_TIMEOUT_SECONDS: "0" })).toBe(30 * 60 * 1000);
  });
});
