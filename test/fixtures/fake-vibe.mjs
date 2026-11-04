#!/usr/bin/env node
// Stand-in for the Vibe CLI used by test/tools.test.ts. Behaviour is driven by env vars:
//   FAKE_VIBE_MODE    "echo" (default): print {"argv": [...]} as JSON
//                     "stdout": print FAKE_VIBE_STDOUT verbatim
//                     "hang": never exit
//   FAKE_VIBE_EXPORT  if set, written to <--output-dir>/export.json
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const mode = process.env.FAKE_VIBE_MODE ?? "echo";

if (mode === "hang") {
  setInterval(() => {}, 1000);
} else {
  const outDir = argv.find((a) => a.startsWith("--output-dir="))?.slice("--output-dir=".length);
  if (outDir && process.env.FAKE_VIBE_EXPORT) {
    writeFileSync(join(outDir, "export.json"), process.env.FAKE_VIBE_EXPORT);
  }
  process.stdout.write(mode === "echo" ? JSON.stringify({ argv }) : (process.env.FAKE_VIBE_STDOUT ?? ""));
}
