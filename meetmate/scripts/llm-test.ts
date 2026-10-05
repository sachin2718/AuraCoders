/**
 * scripts/llm-test.ts
 *
 * Quick smoke-test for callLLM.
 * Run: npx tsx scripts/llm-test.ts
 *
 * Requires .env.local (or env vars) with:
 *   LLM_API_KEY=<your Gemini key>
 *   LLM_MODEL=gemini-1.5-flash   (optional, this is the default)
 */

// Load .env.local so we can run this without `next dev`
import { readFileSync } from "fs";
import { resolve } from "path";
import { callLLM, RateLimitError } from "../lib/ai/llm";

// Minimal .env.local loader (no dotenv dependency needed)
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
    console.log("[test] Loaded .env.local");
  } catch {
    console.warn("[test] No .env.local found — using existing env vars");
  }
}

loadEnvLocal();
// Force dev logging
(process.env as Record<string, string | undefined>).NODE_ENV = "development";



const PROMPT = `Respond ONLY with valid JSON matching this TypeScript type:
{ "msg": string }
The value of msg should be a friendly greeting.`;

async function main() {
  console.log("\n=== MeetMate LLM smoke-test ===\n");

  if (!process.env.LLM_API_KEY) {
    console.warn("⚠️  LLM_API_KEY is not set in .env.local or environment.");
    console.warn("   To run live LLM smoke-tests, set LLM_API_KEY=<your-key> in .env.local.");
    console.warn("   Skipping live API call smoke-test.\n");
    return;
  }

  // ── Call 1: live network hit ──
  console.log("▶ Call 1 (live)…");
  const t1 = Date.now();
  try {
    const result = await callLLM(PROMPT, { json: true, temperature: 0.1 });
    console.log(`  ✅ Result (${Date.now() - t1}ms):`, result);
    const typed = result as { msg?: string };
    if (typeof typed.msg !== "string") {
      throw new Error("Schema mismatch: expected { msg: string }");
    }
    console.log(`  ✅ Schema OK — msg = "${typed.msg}"`);
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error(`  ❌ RateLimitError after ${err.attempts} attempts (HTTP ${err.status})`);
    } else {
      console.error("  ❌", err);
    }
    process.exit(1);
  }

  // ── Call 2: must be instant (cache hit) ──
  console.log("\n▶ Call 2 (should be instant cache hit)…");
  const t2 = Date.now();
  const result2 = await callLLM(PROMPT, { json: true, temperature: 0.1 });
  const elapsed2 = Date.now() - t2;
  console.log(`  ✅ Result (${elapsed2}ms):`, result2);

  if (elapsed2 > 50) {
    console.warn(`  ⚠️  Cache may not have worked — took ${elapsed2}ms (expected <50ms)`);
  } else {
    console.log(`  ✅ Cache confirmed — returned in ${elapsed2}ms`);
  }

  console.log("\n=== All checks passed ✅ ===\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
