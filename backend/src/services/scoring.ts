/**
 * Pronunciation scoring — pure and deterministic.
 *
 * Given a target phrase and the Whisper transcript of what the learner said,
 * produce a 0–100 score plus per-word feedback. This is intentionally a *coarse*
 * signal: Whisper emits clean text and can silently "correct" a mispronunciation,
 * so we compare transcript-vs-target at the word and character level rather than
 * claiming true phoneme accuracy. A phoneme forced-alignment upgrade is a later phase.
 *
 * No I/O, no randomness — fully unit-testable with golden cases.
 */

/** A word this target word was matched against, and whether it counts as correct. */
export interface WordScore {
  /** The (normalized) target word. */
  target: string;
  /** True if the aligned transcript word was close enough (>= WORD_MATCH_THRESHOLD). */
  matched: boolean;
  /** Character similarity (0–1) to the aligned transcript word. */
  similarity: number;
  /** What the learner appears to have said for this word, if anything aligned. */
  heard?: string;
}

export interface PronunciationResult {
  /** Composite 0–100 score. */
  score: number;
  /** Per target-word breakdown, in target order. */
  perWord: WordScore[];
  /** Normalized transcript that was scored. */
  transcript: string;
  /** Normalized target that was scored. */
  targetText: string;
}

/** A word is "hit" when its aligned transcript word is at least this similar. */
export const WORD_MATCH_THRESHOLD = 0.8;

/** Small discouragement for unnecessary gaps so real words align positionally. */
const GAP_PENALTY = -0.1;

/**
 * Normalize for comparison: NFC, lowercase, hyphens→spaces, strip punctuation,
 * collapse whitespace. Bosnian diacritics (č ć đ š ž, plus dž/lj/nj digraphs) are
 * preserved — they are meaningful letters, not decoration.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    // strip punctuation but keep letters (incl. diacritics), numbers, whitespace
    .replace(/[.,!?;:"'`()[\]{}…»«„""''*/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Character similarity in [0,1]; two empty strings are identical (1). */
export function charSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

interface AlignedPair {
  target?: string;
  heard?: string;
}

/**
 * Needleman–Wunsch global alignment of two token sequences, maximizing total
 * character similarity with a small gap penalty. Preserves order (so word-order
 * errors are penalized, as they should be for speech).
 */
function alignTokens(target: string[], transcript: string[]): AlignedPair[] {
  const n = target.length;
  const m = transcript.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) dp[i]![0] = i * GAP_PENALTY;
  for (let j = 1; j <= m; j++) dp[0]![j] = j * GAP_PENALTY;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = dp[i - 1]![j - 1]! + charSimilarity(target[i - 1]!, transcript[j - 1]!);
      const up = dp[i - 1]![j]! + GAP_PENALTY;
      const left = dp[i]![j - 1]! + GAP_PENALTY;
      dp[i]![j] = Math.max(diag, up, left);
    }
  }

  // Traceback
  const pairs: AlignedPair[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const diag = dp[i - 1]![j - 1]! + charSimilarity(target[i - 1]!, transcript[j - 1]!);
      if (dp[i]![j] === diag) {
        pairs.push({ target: target[i - 1], heard: transcript[j - 1] });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + GAP_PENALTY) {
      pairs.push({ target: target[i - 1] }); // target word with nothing heard
      i--;
      continue;
    }
    // otherwise an inserted (extra) transcript word
    pairs.push({ heard: transcript[j - 1] });
    j--;
  }
  pairs.reverse();
  return pairs;
}

export function scorePronunciation(target: string, transcript: string): PronunciationResult {
  const targetText = normalizeText(target);
  const transcriptText = normalizeText(transcript);
  const targetTokens = tokenize(targetText);
  const transcriptTokens = tokenize(transcriptText);

  // Degenerate: empty target.
  if (targetTokens.length === 0) {
    return {
      score: transcriptTokens.length === 0 ? 100 : 0,
      perWord: [],
      transcript: transcriptText,
      targetText,
    };
  }

  const pairs = alignTokens(targetTokens, transcriptTokens);

  const perWord: WordScore[] = [];
  let insertionCount = 0;
  for (const p of pairs) {
    if (p.target === undefined) {
      insertionCount++; // extra word the learner added
      continue;
    }
    const similarity = p.heard === undefined ? 0 : charSimilarity(p.target, p.heard);
    perWord.push({
      target: p.target,
      matched: similarity >= WORD_MATCH_THRESHOLD,
      similarity,
      heard: p.heard,
    });
  }

  const targetCount = perWord.length;
  const matchedCount = perWord.filter((w) => w.matched).length;
  const matchFraction = matchedCount / targetCount;
  const meanSim = perWord.reduce((s, w) => s + w.similarity, 0) / targetCount;
  const globalSim = charSimilarity(targetText, transcriptText);
  const insertionPenalty = Math.min(0.3, 0.15 * (insertionCount / targetCount));

  const raw = 0.5 * matchFraction + 0.3 * meanSim + 0.2 * globalSim - insertionPenalty;
  const score = Math.round(Math.max(0, Math.min(1, raw)) * 100);

  return { score, perWord, transcript: transcriptText, targetText };
}
