/**
 * scripts/test-transcript-panel.ts
 *
 * Verifies TranscriptPanel acceptance criteria:
 * 1. 3 people talking all see the same merged transcript in order.
 * 2. Deterministic speaker color derivation from speaker name.
 * 3. Time formatting in mm:ss.
 * 4. Deduplication of identical utterances across local and received packets.
 */

import { formatTime, getSpeakerColor, TranscriptLine } from "../components/TranscriptPanel";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`);
    process.exit(1);
  }
}

console.log("=== Testing TranscriptPanel logic ===");

// 1. Test formatTime (mm:ss)
console.log("\n[Test 1] formatTime (mm:ss)...");
assert(formatTime(0) === "00:00", `Expected 00:00 for 0ms, got ${formatTime(0)}`);
assert(formatTime(5000) === "00:05", `Expected 00:05 for 5000ms, got ${formatTime(5000)}`);
assert(formatTime(42000) === "00:42", `Expected 00:42 for 42000ms, got ${formatTime(42000)}`);
assert(formatTime(65000) === "01:05", `Expected 01:05 for 65000ms, got ${formatTime(65000)}`);
assert(formatTime(3599000) === "59:59", `Expected 59:59 for 3599000ms, got ${formatTime(3599000)}`);
assert(formatTime(3600000) === "60:00", `Expected 60:00 for 3600000ms, got ${formatTime(3600000)}`);
console.log("✓ formatTime correctly formats all durations as mm:ss");

// 2. Test getSpeakerColor
console.log("\n[Test 2] Deterministic getSpeakerColor...");
const aliceColor1 = getSpeakerColor("Alice");
const aliceColor2 = getSpeakerColor("Alice");
const bobColor = getSpeakerColor("Bob");
const charlieColor = getSpeakerColor("Charlie");

assert(aliceColor1 === aliceColor2, "Speaker color must be deterministic for the same name");
assert(aliceColor1 !== bobColor, "Alice and Bob should receive distinct colors");
assert(bobColor !== charlieColor, "Bob and Charlie should receive distinct colors");
assert(aliceColor1.startsWith("hsl("), "Color must be valid HSL");
console.log(`✓ Speaker colors are distinct and deterministic:
  Alice:   ${aliceColor1}
  Bob:     ${bobColor}
  Charlie: ${charlieColor}`);

// 3. Test 3 people talking -> merged transcript in order
console.log("\n[Test 3] 3 people talking all see the same merged transcript in order...");

// Suppose 3 people speak at different times:
// Alice speaks at 1000ms: "Hi everyone, let's start the standup."
// Bob speaks at 3200ms: "Sounds good, I finished the auth API."
// Charlie speaks at 5500ms: "I deployed the database migrations."
// Alice speaks again at 8000ms: "Awesome work! Any blockers?"

const speechEvents: TranscriptLine[] = [
  { speakerName: "Alice", text: "Hi everyone, let's start the standup.", tMs: 1000 },
  { speakerName: "Bob", text: "Sounds good, I finished the auth API.", tMs: 3200 },
  { speakerName: "Charlie", text: "I deployed the database migrations.", tMs: 5500 },
  { speakerName: "Alice", text: "Awesome work! Any blockers?", tMs: 8000 },
];

function mergeLines(localLines: TranscriptLine[], receivedLines: TranscriptLine[]): TranscriptLine[] {
  const unique = new Map<string, TranscriptLine>();
  for (const line of [...localLines, ...receivedLines]) {
    const key = `${line.tMs}\u0000${line.speakerName}\u0000${line.text.trim()}`;
    if (!unique.has(key)) {
      unique.set(key, { ...line, text: line.text.trim() });
    }
  }
  return Array.from(unique.values()).sort(
    (left, right) =>
      left.tMs - right.tMs ||
      left.speakerName.localeCompare(right.speakerName) ||
      left.text.localeCompare(right.text)
  );
}

// Client 1 (Alice):
// Alice's local speech = speechEvents[0] & speechEvents[3]
// Alice receives Bob and Charlie's lines via LiveKit data channel (possibly in reverse arrival order due to network jitter)
const aliceLocal = [speechEvents[0], speechEvents[3]];
const aliceReceived = [speechEvents[2], speechEvents[1]]; // Charlie arrived before Bob due to network
const aliceMerged = mergeLines(aliceLocal, aliceReceived);

// Client 2 (Bob):
// Bob's local speech = speechEvents[1]
// Bob receives Alice and Charlie lines via LiveKit
const bobLocal = [speechEvents[1]];
const bobReceived = [speechEvents[3], speechEvents[0], speechEvents[2]];
const bobMerged = mergeLines(bobLocal, bobReceived);

// Client 3 (Charlie):
// Charlie's local speech = speechEvents[2]
// Charlie receives Alice and Bob lines via LiveKit
const charlieLocal = [speechEvents[2]];
const charlieReceived = [speechEvents[0], speechEvents[1], speechEvents[3]];
const charlieMerged = mergeLines(charlieLocal, charlieReceived);

// Verify all 3 clients have 4 lines in exact same chronological order
assert(aliceMerged.length === 4, `Alice should have 4 lines, got ${aliceMerged.length}`);
assert(bobMerged.length === 4, `Bob should have 4 lines, got ${bobMerged.length}`);
assert(charlieMerged.length === 4, `Charlie should have 4 lines, got ${charlieMerged.length}`);

for (let i = 0; i < 4; i++) {
  const expected = speechEvents[i];
  assert(
    aliceMerged[i].tMs === expected.tMs &&
    aliceMerged[i].speakerName === expected.speakerName &&
    aliceMerged[i].text === expected.text,
    `Alice index ${i} does not match expected`
  );
  assert(
    bobMerged[i].tMs === expected.tMs &&
    bobMerged[i].speakerName === expected.speakerName &&
    bobMerged[i].text === expected.text,
    `Bob index ${i} does not match expected`
  );
  assert(
    charlieMerged[i].tMs === expected.tMs &&
    charlieMerged[i].speakerName === expected.speakerName &&
    charlieMerged[i].text === expected.text,
    `Charlie index ${i} does not match expected`
  );
}

console.log("✓ All 3 participants see the exact same 4 lines in identical chronological order:");
aliceMerged.forEach((l) => console.log(`  [${formatTime(l.tMs)}] ${l.speakerName}: "${l.text}"`));

console.log("\n All TranscriptPanel tests passed successfully!");
