/**
 * lib/ai/owners.ts
 *
 * resolveOwner(name, participants, speakerUserId?) → userId | null
 *
 * Resolution order (stops at first hit):
 *  0. "I" / "me" / "myself" → speakerUserId (the person who spoke the line)
 *  1. Exact full-name match        (case-insensitive, whitespace-collapsed)
 *  2. Exact first-name match       (case-insensitive, unambiguous)
 *  3. Unique prefix / nickname     (e.g. "Pri" → "Priya") — null if 0 or ≥2 match
 *  4. null  →  Unassigned
 *
 * No fuzzy edit-distance here — that is intentionally left out so we
 * never silently mis-assign a task to the wrong person.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Participant {
  user_id: string;
  display_name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lowercase + collapse all internal whitespace. */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** First token of a normalised full name. */
function firstName(normName: string): string {
  return normName.split(" ")[0];
}

const SELF_REFERENTIAL = new Set(["i", "me", "myself"]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve an owner name string → a user_id, or null.
 *
 * @param name          Raw owner name from LLM output (may be null / empty).
 * @param participants  All participants in the meeting.
 * @param speakerUserId user_id of the person who spoke the source line.
 *                      Required to resolve "I"/"me"/"myself". Pass null to skip.
 */
export function resolveOwner(
  name: string | null | undefined,
  participants: Participant[],
  speakerUserId?: string | null,
): string | null {
  if (!name) return null;

  const query = norm(name);
  if (!query) return null;

  // ── Step 0: Self-referential pronoun ────────────────────────────────────────
  if (SELF_REFERENTIAL.has(query)) {
    return speakerUserId ?? null;
  }

  // ── Step 1: Exact full-name match ────────────────────────────────────────────
  for (const p of participants) {
    if (norm(p.display_name) === query) return p.user_id;
  }

  // ── Step 2: Exact first-name match (unambiguous) ─────────────────────────────
  const firstNameMatches = participants.filter(
    (p) => firstName(norm(p.display_name)) === query,
  );
  if (firstNameMatches.length === 1) return firstNameMatches[0].user_id;
  // ≥2 first-name matches → ambiguous, fall through

  // ── Step 3: Unique prefix / nickname match ───────────────────────────────────
  // Participant qualifies if their normalised full name OR first name STARTS WITH query.
  const prefixMatches = participants.filter((p) => {
    const n = norm(p.display_name);
    return n.startsWith(query) || firstName(n).startsWith(query);
  });
  if (prefixMatches.length === 1) return prefixMatches[0].user_id;

  // ── Step 4: Unresolved ───────────────────────────────────────────────────────
  return null;
}

/**
 * Batch resolve.  Returns a Map<raw_name, user_id | null>.
 * De-duplicates so identical names are only resolved once.
 */
export function resolveOwners(
  names: Array<string | null | undefined>,
  participants: Participant[],
  speakerUserId?: string | null,
): Map<string | null | undefined, string | null> {
  const result = new Map<string | null | undefined, string | null>();
  for (const name of names) {
    if (!result.has(name)) {
      result.set(name, resolveOwner(name, participants, speakerUserId));
    }
  }
  return result;
}
