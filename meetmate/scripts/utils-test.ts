/**
 * scripts/utils-test.ts
 *
 * Unit tests for lib/ai/owners.ts and lib/ai/verify.ts.
 * No external test runner — plain assertions, exits 0 on pass.
 *
 * Run: npx tsx scripts/utils-test.ts
 */

import { resolveOwner } from "../lib/ai/owners";
import {
  quoteExistsInTranscript,
  normaliseAndTokenise,
  OVERLAP_THRESHOLD,
  type TranscriptSegment,
} from "../lib/ai/verify";

// ─── Tiny harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${label}`);
    console.error(`     → ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, label?: string) {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const PARTICIPANTS = [
  { user_id: "usr_alice",  display_name: "Alice Chen" },
  { user_id: "usr_bob",    display_name: "Bob Sharma" },
  { user_id: "usr_priya",  display_name: "Priya Nair" },
  { user_id: "usr_peter",  display_name: "Peter Ng" },
  { user_id: "usr_carol",  display_name: "Carol Davis" },
];

const SEGMENTS: TranscriptSegment[] = [
  { speaker_name: "Alice Chen", text: "Good morning everyone, let's get started.", t_ms: 5000 },
  { speaker_name: "Bob Sharma", text: "Sure. I finished the migration script yesterday and it looks good.", t_ms: 14000 },
  { speaker_name: "Priya Nair", text: "I'll send the revised proposal to the client by end of week.", t_ms: 27000 },
  { speaker_name: "Alice Chen", text: "Perfect. Bob, can you own the end-to-end tests with Carol?", t_ms: 38000 },
  { speaker_name: "Bob Sharma", text: "Yep Carol and I will pair on that and target March 25th.", t_ms: 47000 },
  { speaker_name: "Carol Davis", text: "Agreed March 25th works for me.", t_ms: 54000 },
];

// ════════════════════════════════════════════════════════════════════════════
// owners.ts tests
// ════════════════════════════════════════════════════════════════════════════

console.log("\n── resolveOwner ─────────────────────────────────────────────────");

// ── Exact full name ──────────────────────────────────────────────────────────
test("exact full name (correct casing)", () => {
  assertEqual(resolveOwner("Alice Chen", PARTICIPANTS), "usr_alice");
});

test("exact full name (all lowercase)", () => {
  assertEqual(resolveOwner("alice chen", PARTICIPANTS), "usr_alice");
});

test("exact full name (mixed case + extra spaces)", () => {
  assertEqual(resolveOwner("  ALICE  CHEN  ", PARTICIPANTS), "usr_alice");
});

// ── First name ───────────────────────────────────────────────────────────────
test("first name only — unambiguous (Bob)", () => {
  assertEqual(resolveOwner("Bob", PARTICIPANTS), "usr_bob");
});

test("first name only — unambiguous (Carol)", () => {
  assertEqual(resolveOwner("carol", PARTICIPANTS), "usr_carol");
});

// ── Prefix / nickname ────────────────────────────────────────────────────────
test("prefix 'Pri' resolves to Priya (unique prefix)", () => {
  assertEqual(resolveOwner("Pri", PARTICIPANTS), "usr_priya");
});

test("prefix 'Pri' resolves to Priya (unique prefix, longer)", () => {
  assertEqual(resolveOwner("Priy", PARTICIPANTS), "usr_priya");
});

// ── Ambiguous ────────────────────────────────────────────────────────────────
test("ambiguous prefix 'P' (matches Priya AND Peter) → null", () => {
  assertEqual(resolveOwner("P", PARTICIPANTS), null, "ambiguous prefix must be null");
});

test("ambiguous first name 'Al' is a prefix match for Alice only → resolves", () => {
  // Only Alice starts with 'Al', Peter doesn't, so this should resolve
  assertEqual(resolveOwner("Al", PARTICIPANTS), "usr_alice");
});

test("completely unknown name → null", () => {
  assertEqual(resolveOwner("Zara Smith", PARTICIPANTS), null);
});

test("null input → null", () => {
  assertEqual(resolveOwner(null, PARTICIPANTS), null);
});

test("empty string → null", () => {
  assertEqual(resolveOwner("", PARTICIPANTS), null);
});

// ── Self-referential pronouns ─────────────────────────────────────────────────
test('"I" with speakerUserId → returns speakerUserId', () => {
  assertEqual(resolveOwner("I", PARTICIPANTS, "usr_bob"), "usr_bob");
});

test('"me" → speakerUserId', () => {
  assertEqual(resolveOwner("me", PARTICIPANTS, "usr_priya"), "usr_priya");
});

test('"myself" → speakerUserId', () => {
  assertEqual(resolveOwner("Myself", PARTICIPANTS, "usr_alice"), "usr_alice");
});

test('"I" without speakerUserId → null', () => {
  assertEqual(resolveOwner("I", PARTICIPANTS, null), null);
});

test('"I" without speakerUserId (omitted) → null', () => {
  assertEqual(resolveOwner("I", PARTICIPANTS), null);
});

// ── Edge: partial name that is also a valid full name if only 1 participant ──
test("single-participant list — any reasonable prefix resolves", () => {
  const single = [{ user_id: "usr_solo", display_name: "Dana Lee" }];
  assertEqual(resolveOwner("Dan", single), "usr_solo");
});

// ════════════════════════════════════════════════════════════════════════════
// verify.ts tests
// ════════════════════════════════════════════════════════════════════════════

console.log("\n── quoteExistsInTranscript ──────────────────────────────────────");

// ── normaliseAndTokenise helper ───────────────────────────────────────────────
test("normaliseAndTokenise strips punctuation and lowercases", () => {
  const tokens = normaliseAndTokenise("Hello, World! It's great.");
  assert(
    !tokens.some((t) => /[^a-z0-9]/.test(t)),
    `tokens contain non-alphanumeric: ${tokens.join(",")}`,
  );
  assert(tokens.includes("hello"), "expected 'hello'");
  assert(tokens.includes("world"), "expected 'world'");
});

// ── Exact quote ───────────────────────────────────────────────────────────────
test("exact quote from segment 2 — found with confidence 1.0", () => {
  const result = quoteExistsInTranscript(
    "I finished the migration script yesterday and it looks good",
    SEGMENTS,
  );
  assert(result.found, "should be found");
  assert(result.confidence >= OVERLAP_THRESHOLD, `confidence ${result.confidence} < threshold`);
  assertEqual(result.tMs, 14000, "tMs should be segment 2 (14000)");
});

test("exact quote from segment 2 with punctuation added — still found", () => {
  const result = quoteExistsInTranscript(
    "I finished the migration script yesterday, and it looks good!",
    SEGMENTS,
  );
  assert(result.found, "should be found despite punctuation");
  assertEqual(result.tMs, 14000);
});

// ── Minor wording drift ────────────────────────────────────────────────────────
test("minor wording drift — 'send the updated proposal to client by end of week' → found (≥0.8 overlap)", () => {
  // Quote differs slightly from "I'll send the revised proposal to the client by end of week"
  // Shared tokens: send, the, proposal, to, client, by, end, of, week  (9 tokens)
  // Quote tokens after norm: send the updated proposal to client by end of week (9)
  // Overlap = 8/9 ≈ 0.89 — should pass
  const result = quoteExistsInTranscript(
    "send the updated proposal to client by end of week",
    SEGMENTS,
  );
  assert(result.found, `should be found despite wording drift (confidence=${result.confidence.toFixed(2)})`);
  assertEqual(result.tMs, 27000, "tMs should point to Priya's segment (27000)");
});

test("quote spanning adjacent segments — found via pair window", () => {
  // Bob's seg (47000): "Yep Carol and I will pair on that and target March 25th"
  // Carol's seg (54000): "Agreed March 25th works for me"
  // Quote bridges both:
  const result = quoteExistsInTranscript(
    "pair on that and target March 25th Agreed March 25th works",
    SEGMENTS,
  );
  assert(result.found, `adjacent-pair quote should be found (confidence=${result.confidence.toFixed(2)})`);
  assertEqual(result.tMs, 47000, "tMs should be start of the pair (47000)");
});

// ── Invented / hallucinated quote ─────────────────────────────────────────────
test("invented quote — not found", () => {
  const result = quoteExistsInTranscript(
    "We have decided to completely rewrite the backend in Rust by tomorrow",
    SEGMENTS,
  );
  assert(!result.found, `invented quote should not be found (confidence=${result.confidence.toFixed(2)})`);
});

test("short invented quote with only 1 common word — not found", () => {
  const result = quoteExistsInTranscript(
    "deploy to production immediately",
    SEGMENTS,
  );
  assert(!result.found, `confidence=${result.confidence.toFixed(2)}`);
});

// ── Edge cases ────────────────────────────────────────────────────────────────
test("empty quote → not found, confidence 0", () => {
  const result = quoteExistsInTranscript("", SEGMENTS);
  assert(!result.found, "empty quote should not be found");
  assertEqual(result.confidence, 0);
  assertEqual(result.tMs, null);
});

test("empty segments → not found", () => {
  const result = quoteExistsInTranscript("something", []);
  assert(!result.found, "empty segments should not be found");
});

test("single segment list — exact match", () => {
  const single: TranscriptSegment[] = [
    { speaker_name: "X", text: "We must ship by Friday.", t_ms: 9000 },
  ];
  const result = quoteExistsInTranscript("We must ship by Friday", single);
  assert(result.found, "should match");
  assertEqual(result.tMs, 9000);
});

test("duplicate tokens handled correctly (multiset intersection)", () => {
  // Quote: "test test test" → 3 tokens, all 'test'
  // Segment: "this is a test" → only 1 'test'
  // overlap = 1/3 ≈ 0.33 → should NOT match (not a set intersection bug)
  const seg: TranscriptSegment[] = [
    { speaker_name: "X", text: "this is a test", t_ms: 1000 },
  ];
  const result = quoteExistsInTranscript("test test test", seg);
  assert(!result.found, `multiset: confidence=${result.confidence.toFixed(2)} should be < threshold`);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`
══════════════════════════════════════════
Results: ${passed} passed  ${failed} failed
══════════════════════════════════════════
`);

if (failed > 0) process.exit(1);
