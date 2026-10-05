/**
 * lib/ai/verify.ts
 *
 * quoteExistsInTranscript(quote, segments) → VerifyResult
 *
 * Algorithm:
 *  1. Normalise both quote and each segment's text
 *     (lowercase, strip punctuation, collapse whitespace, split into tokens).
 *  2. Try a single-segment window: compute token overlap ratio.
 *     overlap = |quote_tokens ∩ window_tokens| / |quote_tokens|
 *     If ≥ THRESHOLD (0.8) → hit.
 *  3. Try two adjacent segments concatenated → same check.
 *  4. Return { found, tMs, confidence }.
 *     tMs is the t_ms of the best-matching single segment (or the first of the pair).
 *     This lets pipeline.ts correct timestamp_ms when the LLM was off.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranscriptSegment {
  speaker_name: string;
  text: string;
  t_ms: number;
}

export interface VerifyResult {
  /** True when token overlap ≥ THRESHOLD in a single or adjacent-pair window. */
  found: boolean;
  /**
   * t_ms of the best-matching segment.
   * For a pair match this is the first segment's t_ms.
   * null when not found.
   */
  tMs: number | null;
  /** 0–1 overlap ratio of the best window checked. */
  confidence: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const OVERLAP_THRESHOLD = 0.8;

// ─── Normalisation ────────────────────────────────────────────────────────────

/**
 * Strip punctuation, lowercase, collapse whitespace, split into tokens.
 * We intentionally strip the speaker-name prefix (everything before the first
 * colon) so the verifier works on raw segment.text, not formatted lines.
 */
export function normaliseAndTokenise(text: string): string[] {
  return text
    .toLowerCase()
    // Remove punctuation (keep alphanumeric + whitespace)
    .replace(/[^\w\s]/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

// ─── Token overlap ────────────────────────────────────────────────────────────

/**
 * Overlap ratio: |A ∩ B| / |A|  (A = quote tokens — we care how much of the
 * quote is covered, not how much of the window is covered).
 *
 * We use a multiset intersection so duplicate tokens are counted correctly.
 */
function overlapRatio(quoteTokens: string[], windowTokens: string[]): number {
  if (quoteTokens.length === 0) return 0;

  // Build frequency map for window tokens
  const freq = new Map<string, number>();
  for (const t of windowTokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }

  let intersection = 0;
  for (const t of quoteTokens) {
    const available = freq.get(t) ?? 0;
    if (available > 0) {
      intersection++;
      freq.set(t, available - 1);
    }
  }

  return intersection / quoteTokens.length;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a source_quote appears in the transcript.
 *
 * Matches against:
 *   - Individual segments
 *   - Pairs of adjacent segments (speaker changes mid-sentence, etc.)
 *
 * @param quote    The source_quote string from the LLM.
 * @param segments The full ordered list of transcript segments.
 */
export function quoteExistsInTranscript(
  quote: string,
  segments: TranscriptSegment[],
): VerifyResult {
  if (!quote || segments.length === 0) {
    return { found: false, tMs: null, confidence: 0 };
  }

  const quoteTokens = normaliseAndTokenise(quote);
  if (quoteTokens.length === 0) {
    return { found: false, tMs: null, confidence: 0 };
  }

  let bestConfidence = 0;
  let bestTms: number | null = null;

  // Pass 1: Try single segments first
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const singleTokens = normaliseAndTokenise(seg.text);
    const singleScore = overlapRatio(quoteTokens, singleTokens);

    if (singleScore > bestConfidence) {
      bestConfidence = singleScore;
      bestTms = seg.t_ms;
    }

    if (singleScore >= OVERLAP_THRESHOLD) {
      return { found: true, tMs: seg.t_ms, confidence: singleScore };
    }
  }

  // Pass 2: Try adjacent segment pairs if no single segment met threshold
  for (let i = 0; i < segments.length - 1; i++) {
    const seg1 = segments[i];
    const seg2 = segments[i + 1];
    const pairTokens = [
      ...normaliseAndTokenise(seg1.text),
      ...normaliseAndTokenise(seg2.text),
    ];
    const pairScore = overlapRatio(quoteTokens, pairTokens);

    if (pairScore > bestConfidence) {
      bestConfidence = pairScore;
      bestTms = seg1.t_ms;
    }

    if (pairScore >= OVERLAP_THRESHOLD) {
      return { found: true, tMs: seg1.t_ms, confidence: pairScore };
    }
  }

  return { found: false, tMs: bestTms, confidence: bestConfidence };
}
