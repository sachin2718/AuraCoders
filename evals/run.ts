/**
 * evals/run.ts
 *
 * Runs runPipeline on every sample in samples/ and evaluates performance
 * against expected ground truth in samples/expected/<name>.json.
 *
 * Expected Schema:
 *   {
 *     "action_items": [{ "owner": string | null, "keywords": string[] }],
 *     "decisions_count_min": number
 *   }
 *
 * Metrics Evaluated:
 *   - Recall: (expected items found: same owner AND all keywords present in title) / total expected items
 *   - Precision: (generated items matching an expected item) / total generated items
 *   - Owner Accuracy: fraction of keyword-matched generated items having the correct owner
 *   - Unverified Quotes: count of generated items where quote_verified !== true
 *
 * Exit Code:
 *   Exits with 1 if overall precision < 0.80.
 */

import fs from "fs";
import path from "path";
import { runPipeline, type PipelineInput, type PipelineOutput } from "../lib/ai/pipeline";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpectedItem {
  owner: string | null;
  keywords: string[];
}

interface ExpectedData {
  action_items: ExpectedItem[];
  decisions_count_min: number;
}

interface SampleEvalResult {
  sampleName: string;
  generatedCount: number;
  expectedCount: number;
  recall: number;
  precision: number;
  ownerAccuracy: number;
  unverifiedQuotes: number;
  decisionsFound: number;
  decisionsMin: number;
  decisionsPassed: boolean;
}

// ─── Match Helpers ────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchOwner(expectedOwner: string | null, genOwner: string | null | undefined): boolean {
  if (expectedOwner === null) {
    return !genOwner;
  }
  if (!genOwner) return false;

  const exp = norm(expectedOwner);
  const gen = norm(genOwner);

  return (
    exp === gen ||
    exp.includes(gen) ||
    gen.includes(exp) ||
    exp.split(" ")[0] === gen.split(" ")[0]
  );
}

function matchKeywords(keywords: string[], title: string): boolean {
  const normTitle = norm(title);
  return keywords.every((kw) => normTitle.includes(norm(kw)));
}

function isItemMatch(expected: ExpectedItem, gen: { title: string; owner_name?: string | null }): boolean {
  return matchOwner(expected.owner, gen.owner_name) && matchKeywords(expected.keywords, gen.title);
}

// ─── Main Evaluation Loop ─────────────────────────────────────────────────────

async function runEvals() {
  console.log("\n=======================================================");
  console.log("       MeetMate AI Pipeline Evaluation Runner         ");
  console.log("=======================================================\n");

  const samplesDir = path.resolve(process.cwd(), "samples");
  const expectedDir = path.resolve(samplesDir, "expected");

  if (!fs.existsSync(samplesDir)) {
    console.error(`❌ Samples directory not found at: ${samplesDir}`);
    process.exit(1);
  }

  // Find all .json files in samples/ (excluding subdirectories)
  const allFiles = fs.readdirSync(samplesDir, { withFileTypes: true });
  const sampleFiles = allFiles
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);

  if (sampleFiles.length === 0) {
    console.error("❌ No sample JSON files found in samples/");
    process.exit(1);
  }

  const results: SampleEvalResult[] = [];

  for (const filename of sampleFiles) {
    const samplePath = path.join(samplesDir, filename);
    const baseName = filename.replace(/\.json$/, "");
    const expectedPath = path.join(expectedDir, filename);

    if (!fs.existsSync(expectedPath)) {
      console.warn(`⚠️ Skipping "${filename}" — missing expected file: samples/expected/${filename}`);
      continue;
    }

    const sampleContent = JSON.parse(fs.readFileSync(samplePath, "utf8"));
    const expectedContent: ExpectedData = JSON.parse(fs.readFileSync(expectedPath, "utf8"));

    console.log(`▶ Evaluating "${filename}"...`);

    // Prepare PipelineInput
    const rawParticipants = sampleContent.participants || [];
    const participants = rawParticipants.map((p: any, i: number) => ({
      user_id: p.user_id || p.userId || `usr_${i}`,
      display_name: p.display_name || p.name || `User ${i + 1}`,
    }));

    const rawSegments = sampleContent.segments || [];
    const segments = rawSegments.map((s: any) => ({
      speaker_name: s.speaker_name || s.speaker || "Unknown",
      text: s.text || "",
      t_ms: typeof s.t_ms === "number" ? s.t_ms : typeof s.tMs === "number" ? s.tMs : 0,
    }));

    const pipelineInput: PipelineInput = {
      meetingId: sampleContent.meetingId || `eval-${baseName}`,
      meetingDate: sampleContent.meetingDate || "2025-03-14",
      timezone: sampleContent.timezone || "Asia/Kolkata",
      participants,
      segments,
      visualNotes: sampleContent.visualNotes || [],
    };

    let output: PipelineOutput;
    output = await runPipeline(pipelineInput);

    const generated = output.action_items;
    const expected = expectedContent.action_items;

    // 1. Recall: (expected items found: same owner AND all keywords present in title) / total expected items
    let expectedFound = 0;
    for (const exp of expected) {
      const found = generated.some((gen) => isItemMatch(exp, gen));
      if (found) expectedFound++;
    }
    const recall = expected.length > 0 ? expectedFound / expected.length : 1.0;

    // 2. Precision: (generated items that match an expected item) / total generated items
    let genMatched = 0;
    for (const gen of generated) {
      const matchesAnyExpected = expected.some((exp) => isItemMatch(exp, gen));
      if (matchesAnyExpected) genMatched++;
    }
    const precision = generated.length > 0 ? genMatched / generated.length : (expected.length === 0 ? 1.0 : 0.0);

    // 3. Owner Accuracy: for generated items matching an expected item's keywords, did owner match?
    let kwMatchCount = 0;
    let ownerCorrectCount = 0;
    for (const gen of generated) {
      const kwMatchExp = expected.find((exp) => matchKeywords(exp.keywords, gen.title));
      if (kwMatchExp) {
        kwMatchCount++;
        if (matchOwner(kwMatchExp.owner, gen.owner_name)) {
          ownerCorrectCount++;
        }
      }
    }
    const ownerAccuracy = kwMatchCount > 0 ? ownerCorrectCount / kwMatchCount : 1.0;

    // 4. Items without a verified source quote
    const unverifiedQuotes = generated.filter((item) => item.quote_verified !== true).length;

    // 5. Decisions check
    const decisionsCount = output.summary.decisions?.length || 0;
    const decisionsPassed = decisionsCount >= expectedContent.decisions_count_min;

    results.push({
      sampleName: filename,
      generatedCount: generated.length,
      expectedCount: expected.length,
      recall,
      precision,
      ownerAccuracy,
      unverifiedQuotes,
      decisionsFound: decisionsCount,
      decisionsMin: expectedContent.decisions_count_min,
      decisionsPassed,
    });
  }

  if (results.length === 0) {
    console.error("❌ No evaluation results generated.");
    process.exit(1);
  }

  // ─── Format Table Output ────────────────────────────────────────────────────

  console.log("\n── Evaluation Results ─────────────────────────────────────────────────────────────────\n");

  const formattedRows = results.map((r) => ({
    "Sample Name": r.sampleName,
    "Gen Items": r.generatedCount,
    "Exp Items": r.expectedCount,
    "Recall": `${(r.recall * 100).toFixed(1)}%`,
    "Precision": `${(r.precision * 100).toFixed(1)}%`,
    "Owner Acc": `${(r.ownerAccuracy * 100).toFixed(1)}%`,
    "Unverified Quotes": r.unverifiedQuotes,
    "Decisions": `${r.decisionsFound}/${r.decisionsMin} ${r.decisionsPassed ? "✅" : "⚠️"}`,
  }));

  console.table(formattedRows);

  // ─── Calculate Overall Averages ─────────────────────────────────────────────

  const totalSamples = results.length;
  const avgRecall = results.reduce((acc, r) => acc + r.recall, 0) / totalSamples;
  const avgPrecision = results.reduce((acc, r) => acc + r.precision, 0) / totalSamples;
  const avgOwnerAccuracy = results.reduce((acc, r) => acc + r.ownerAccuracy, 0) / totalSamples;
  const totalUnverified = results.reduce((acc, r) => acc + r.unverifiedQuotes, 0);
  const totalDecisionsPass = results.filter((r) => r.decisionsPassed).length;

  console.log("── Overall Averages ───────────────────────────────────────────────────────────────────");
  console.log(`  Evaluated Samples       : ${totalSamples}`);
  console.log(`  Average Recall          : ${(avgRecall * 100).toFixed(1)}%`);
  console.log(`  Average Precision       : ${(avgPrecision * 100).toFixed(1)}%`);
  console.log(`  Average Owner Accuracy  : ${(avgOwnerAccuracy * 100).toFixed(1)}%`);
  console.log(`  Total Unverified Quotes : ${totalUnverified}`);
  console.log(`  Decisions Minimum Met   : ${totalDecisionsPass} / ${totalSamples} samples\n`);

  // ─── Exit Code Validation ───────────────────────────────────────────────────

  const PRECISION_THRESHOLD = 0.8;
  if (avgPrecision < PRECISION_THRESHOLD) {
    console.error(
      `❌ FAILED: Overall precision ${(avgPrecision * 100).toFixed(1)}% is below threshold ${(
        PRECISION_THRESHOLD * 100
      ).toFixed(1)}% (exit code 1).\n`
    );
    process.exit(1);
  }

  console.log(
    `✅ PASSED: Overall precision ${(avgPrecision * 100).toFixed(1)}% meets threshold ${(
      PRECISION_THRESHOLD * 100
    ).toFixed(1)}%.\n`
  );
  process.exit(0);
}

runEvals().catch((err) => {
  console.error("\n❌ Fatal error during evals execution:", err);
  process.exit(1);
});
