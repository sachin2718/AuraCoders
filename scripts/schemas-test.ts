/**
 * scripts/schemas-test.ts
 *
 * Unit tests for SummarySchema and ActionItemSchema.
 * No external test runner needed — plain assertions, exits 0 on pass.
 *
 * Run: npx tsx scripts/schemas-test.ts
 */

import {
  SummarySchema,
  ActionItemSchema,
  ActionItemsSchema,
  AIOutputSchema,
  parseAIOutput,
} from "../lib/ai/schemas";
import { ZodError } from "zod";

// ─── Tiny test harness ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${label}`);
    console.error(`     ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function assertThrowsZod(fn: () => unknown) {
  try {
    fn();
    throw new Error("Expected ZodError but no error was thrown");
  } catch (err) {
    if (!(err instanceof ZodError)) {
      throw new Error(`Expected ZodError, got: ${String(err)}`);
    }
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_SUMMARY = {
  tldr: "The team aligned on the Q3 roadmap and agreed to ship the auth module by Friday.",
  key_points: [
    "Auth module is the top priority for Q3.",
    "Design review scheduled for Wednesday.",
  ],
  decisions: ["Ship auth module by Friday.", "Alice owns the design review."],
  open_questions: ["Who handles load testing after the release?"],
};

const VALID_ACTION_ITEM = {
  title: "Send revised proposal to client",
  owner_name: "Alice",
  due_date: "2025-03-21",
  priority: "high" as const,
  source_quote: "Alice: I'll send the revised proposal to the client by end of week.",
  timestamp_ms: 183000,
};

const VALID_ACTION_ITEM_NULLS = {
  title: "Review open pull requests",
  owner_name: null,
  due_date: null,
  priority: "low" as const,
  source_quote: "Bob: We should also review the open pull requests at some point.",
  timestamp_ms: 0,
};

const VALID_AI_OUTPUT = {
  summary: VALID_SUMMARY,
  action_items: [VALID_ACTION_ITEM, VALID_ACTION_ITEM_NULLS],
};

// ─── SummarySchema tests ──────────────────────────────────────────────────────

console.log("\n── SummarySchema ──────────────────────────────────────────────");

expect("accepts a valid summary", () => {
  const result = SummarySchema.parse(VALID_SUMMARY);
  assert(result.tldr === VALID_SUMMARY.tldr, "tldr mismatch");
  assert(result.key_points.length === 2, "key_points count mismatch");
  assert(result.decisions.length === 2, "decisions count mismatch");
  assert(result.open_questions.length === 1, "open_questions count mismatch");
});

expect("accepts empty decisions array", () => {
  SummarySchema.parse({ ...VALID_SUMMARY, decisions: [] });
});

expect("accepts empty open_questions array", () => {
  SummarySchema.parse({ ...VALID_SUMMARY, open_questions: [] });
});

expect("rejects missing tldr", () => {
  assertThrowsZod(() => {
    const { tldr: _, ...rest } = VALID_SUMMARY;
    SummarySchema.parse(rest);
  });
});

expect("rejects empty tldr string", () => {
  assertThrowsZod(() => SummarySchema.parse({ ...VALID_SUMMARY, tldr: "" }));
});

expect("rejects empty key_points array", () => {
  assertThrowsZod(() => SummarySchema.parse({ ...VALID_SUMMARY, key_points: [] }));
});

expect("rejects key_points containing empty string", () => {
  assertThrowsZod(() =>
    SummarySchema.parse({ ...VALID_SUMMARY, key_points: ["Valid point", ""] }),
  );
});

expect("rejects non-string in decisions", () => {
  assertThrowsZod(() =>
    SummarySchema.parse({ ...VALID_SUMMARY, decisions: [123] }),
  );
});

// ─── ActionItemSchema tests ───────────────────────────────────────────────────

console.log("\n── ActionItemSchema ───────────────────────────────────────────");

expect("accepts a full valid action item", () => {
  const result = ActionItemSchema.parse(VALID_ACTION_ITEM);
  assert(result.owner_name === "Alice", "owner_name mismatch");
  assert(result.due_date === "2025-03-21", "due_date mismatch");
  assert(result.priority === "high", "priority mismatch");
  assert(result.timestamp_ms === 183000, "timestamp_ms mismatch");
});

expect("accepts null owner_name and null due_date", () => {
  const result = ActionItemSchema.parse(VALID_ACTION_ITEM_NULLS);
  assert(result.owner_name === null, "expected null owner_name");
  assert(result.due_date === null, "expected null due_date");
});

expect("accepts all three priority values", () => {
  for (const priority of ["low", "medium", "high"] as const) {
    ActionItemSchema.parse({ ...VALID_ACTION_ITEM, priority });
  }
});

expect("rejects invalid priority value", () => {
  assertThrowsZod(() =>
    ActionItemSchema.parse({ ...VALID_ACTION_ITEM, priority: "urgent" }),
  );
});

expect("rejects due_date in wrong format (MM/DD/YYYY)", () => {
  assertThrowsZod(() =>
    ActionItemSchema.parse({ ...VALID_ACTION_ITEM, due_date: "03/21/2025" }),
  );
});

expect("rejects due_date in wrong format (natural language)", () => {
  assertThrowsZod(() =>
    ActionItemSchema.parse({ ...VALID_ACTION_ITEM, due_date: "next Friday" }),
  );
});

expect("rejects negative timestamp_ms", () => {
  assertThrowsZod(() =>
    ActionItemSchema.parse({ ...VALID_ACTION_ITEM, timestamp_ms: -1 }),
  );
});

expect("rejects float timestamp_ms", () => {
  assertThrowsZod(() =>
    ActionItemSchema.parse({ ...VALID_ACTION_ITEM, timestamp_ms: 183.5 }),
  );
});

expect("rejects empty title", () => {
  assertThrowsZod(() =>
    ActionItemSchema.parse({ ...VALID_ACTION_ITEM, title: "" }),
  );
});

expect("rejects empty source_quote", () => {
  assertThrowsZod(() =>
    ActionItemSchema.parse({ ...VALID_ACTION_ITEM, source_quote: "" }),
  );
});

// ─── ActionItemsSchema (array) tests ─────────────────────────────────────────

console.log("\n── ActionItemsSchema (array) ──────────────────────────────────");

expect("accepts an empty array (no action items)", () => {
  const result = ActionItemsSchema.parse([]);
  assert(Array.isArray(result) && result.length === 0, "expected empty array");
});

expect("accepts array with multiple valid items", () => {
  const result = ActionItemsSchema.parse([VALID_ACTION_ITEM, VALID_ACTION_ITEM_NULLS]);
  assert(result.length === 2, "expected 2 items");
});

expect("rejects array containing an invalid item", () => {
  assertThrowsZod(() =>
    ActionItemsSchema.parse([VALID_ACTION_ITEM, { ...VALID_ACTION_ITEM, priority: "ASAP" }]),
  );
});

// ─── AIOutputSchema (combined) tests ─────────────────────────────────────────

console.log("\n── AIOutputSchema (full output) ───────────────────────────────");

expect("accepts valid combined AI output", () => {
  const result = AIOutputSchema.parse(VALID_AI_OUTPUT);
  assert(result.action_items.length === 2, "expected 2 action items");
  assert(result.summary.decisions.length === 2, "expected 2 decisions");
});

expect("parseAIOutput helper returns typed object", () => {
  const result = parseAIOutput(VALID_AI_OUTPUT);
  assert(typeof result.summary.tldr === "string", "tldr should be string");
  assert(Array.isArray(result.action_items), "action_items should be array");
});

expect("rejects output with invalid summary nested inside", () => {
  assertThrowsZod(() =>
    AIOutputSchema.parse({ ...VALID_AI_OUTPUT, summary: { ...VALID_SUMMARY, tldr: "" } }),
  );
});

expect("rejects output with missing action_items key", () => {
  assertThrowsZod(() => {
    const { action_items: _, ...rest } = VALID_AI_OUTPUT;
    AIOutputSchema.parse(rest);
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`
══════════════════════════════════════
Results: ${passed} passed, ${failed} failed
══════════════════════════════════════
`);

if (failed > 0) process.exit(1);
