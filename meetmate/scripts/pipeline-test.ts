/**
 * scripts/pipeline-test.ts
 *
 * Acceptance test: runs the full pipeline against samples/standup.json.
 * Expected: validated PipelineOutput printed to console in < 30s.
 *
 * Run: npx tsx scripts/pipeline-test.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { runPipeline, type PipelineInput } from "../lib/ai/pipeline";

// ── Minimal .env.local loader ────────────────────────────────────────────────
function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    console.warn("[test] No .env.local — using existing env vars");
  }
}

loadEnvLocal();
process.env.NODE_ENV = "development";



async function main() {
  console.log("\n=== MeetMate Pipeline Acceptance Test ===\n");

  const samplePath = resolve(process.cwd(), "samples/standup.json");
  const input: PipelineInput = JSON.parse(readFileSync(samplePath, "utf8"));

  console.log(
    `▶ Running pipeline on "${samplePath}"`,
    `\n  Segments : ${input.segments.length}`,
    `\n  Speakers : ${[...new Set(input.segments.map((s) => s.speaker_name))].join(", ")}`,
    `\n  Duration : ${(input.segments.at(-1)?.t_ms ?? 0) / 1000}s\n`,
  );

  const deadline = setTimeout(() => {
    console.error("❌ TIMEOUT: pipeline did not complete within 30s");
    process.exit(1);
  }, 30_000);

  const output = await runPipeline(input);
  clearTimeout(deadline);

  // ── Assertions ─────────────────────────────────────────────────────────────
  const { summary, action_items, meta } = output;

  console.log("── Summary ─────────────────────────────────────────────────");
  console.log("TL;DR       :", summary.tldr);
  console.log("Key points  :", summary.key_points.length, "items");
  summary.key_points.forEach((kp: string, i: number) => console.log(`  ${i + 1}. ${kp}`));
  console.log("Decisions   :", summary.decisions.length, "items");
  summary.decisions.forEach((d: string, i: number) => console.log(`  ${i + 1}. ${d}`));
  console.log("Open Q's    :", summary.open_questions.length, "items");
  summary.open_questions.forEach((q: string, i: number) => console.log(`  ${i + 1}. ${q}`));

  console.log("\n── Action Items ────────────────────────────────────────────");
  action_items.forEach((item, i: number) => {
    console.log(
      `\n  [${i + 1}] ${item.title}`,
      `\n      Owner     : ${item.owner_name ?? "(unassigned)"} → user_id=${item.owner_id ?? "null"}`,
      `\n      Due       : ${item.due_date ?? "none"}`,
      `\n      Priority  : ${item.priority}`,
      `\n      Verified  : ${item.quote_verified} (confidence=${item.quote_confidence.toFixed(2)})`,
      `\n      Quote     : "${item.source_quote}"`,
    );
  });

  console.log("\n── Meta ────────────────────────────────────────────────────");
  console.log(meta);

  // ── Basic checks ──────────────────────────────────────────────────────────
  let ok = true;

  if (!summary.tldr || summary.tldr === "Not enough content to summarise.") {
    console.error("\n❌ tldr is empty or stub — pipeline may have short-circuited");
    ok = false;
  }
  if (action_items.length === 0) {
    console.error("\n❌ No action items returned — standup sample has at least 3 clear tasks");
    ok = false;
  }
  if (meta.elapsedMs > 30_000) {
    console.error(`\n❌ Took ${meta.elapsedMs}ms — exceeds 30s SLA`);
    ok = false;
  }
  // Check owner resolution for known participants
  const danItem = action_items.find((i) =>
    i.owner_name?.toLowerCase().includes("dan"),
  );
  if (danItem && danItem.owner_id !== "usr_dan") {
    console.warn(
      `\n⚠️  Dan's owner_id resolved to "${danItem.owner_id}" instead of "usr_dan"`,
    );
  }

  if (ok) {
    console.log(`\n✅ All checks passed in ${meta.elapsedMs}ms\n`);
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
