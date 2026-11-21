export type VelocityTier = 'automated' | 'developing' | 'needs-practice';

export interface VelocityResult {
  tier: VelocityTier;
  t1Sec: number;
  t2Sec: number;
  label: string;
}

export interface DiffSegment {
  char: string;
  status: 'match' | 'diacritic-mismatch' | 'extra';
  expectedChar?: string;
}

export type GradeOutcome =
  | {
      kind: 'exact';
      matchedExpected: string;
      velocity: VelocityResult;
    }
  | {
      kind: 'diacritic-error';
      closestExpected: string;
      segments: DiffSegment[];
      message: string;
    }
  | {
      kind: 'single-typo';
      closestExpected: string;
      message: string;
    }
  | {
      kind: 'mismatch';
      closestExpected: string;
      velocity: VelocityResult;
      message: string;
    };

/**
 * Normalizes text for comparison: Unicode NFC, lowercase, strips common punctuation,
 * collapses whitespace.
 */
export function normalizeTextForComparison(str: string): string {
  if (!str) return '';
  return String(str)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,?!¿¡"'“”‘’]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Strips combining diacritical marks (e.g. macrons ā ē ī ō ū, acute accents á é í ó ú)
 * using explicit Unicode range \u0300-\u036f rather than literal control characters.
 */
export function stripDiacritics(str: string): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC');
}

/**
 * Computes Damerau-Levenshtein edit distance (supports adjacent transpositions).
 */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;

  const d: number[][] = Array.from({ length: al + 1 }, () => new Array<number>(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[al][bl];
}

export function isSingleTypo(a: string, b: string): boolean {
  return damerauLevenshtein(a, b) === 1;
}

/**
 * Evaluates two-stage recall latency:
 * - T1: time from prompt display to first input touch (retrieval initiation)
 * - T2: time from prompt display to submission (total execution)
 */
export function evaluateTwoStageVelocity(
  t1Sec: number,
  t2Sec: number,
  isCorrect: boolean,
): VelocityResult {
  const safeT1 = Math.max(0, Number(t1Sec.toFixed(1)));
  const safeT2 = Math.max(safeT1, Number(t2Sec.toFixed(1)));

  if (!isCorrect || safeT2 > 12.0) {
    return {
      tier: 'needs-practice',
      t1Sec: safeT1,
      t2Sec: safeT2,
      label: `${safeT2.toFixed(1)}s · Keep practicing`,
    };
  }
  if (safeT1 <= 2.5 && safeT2 <= 5.5) {
    return {
      tier: 'automated',
      t1Sec: safeT1,
      t2Sec: safeT2,
      label: `${safeT2.toFixed(1)}s · Fluid recall`,
    };
  }
  return {
    tier: 'developing',
    t1Sec: safeT1,
    t2Sec: safeT2,
    label: `${safeT2.toFixed(1)}s · Building fluency`,
  };
}

/**
 * Builds character-by-character segments showing exactly where diacritics/macrons differ.
 */
export function buildDiacriticDiff(userInput: string, expected: string): DiffSegment[] {
  const normUser = Array.from(normalizeTextForComparison(userInput));
  const normExp = Array.from(normalizeTextForComparison(expected));
  const segments: DiffSegment[] = [];

  for (let i = 0; i < Math.max(normUser.length, normExp.length); i++) {
    const uChar = normUser[i];
    const eChar = normExp[i];
    if (uChar === undefined) continue;
    if (eChar !== undefined && uChar === eChar) {
      segments.push({ char: uChar, status: 'match' });
    } else if (eChar !== undefined && stripDiacritics(uChar) === stripDiacritics(eChar)) {
      segments.push({ char: uChar, status: 'diacritic-mismatch', expectedChar: eChar });
    } else {
      segments.push({ char: uChar, status: 'extra', expectedChar: eChar });
    }
  }
  return segments;
}

/**
 * Unified answer grader shared by Step 5 Active Practice and Interleaved Review Drills.
 */
export function gradeResponse(
  rawInput: string,
  expectedList: string[],
  t1Sec: number,
  t2Sec: number,
  allowSingleTypoRetry = true,
): GradeOutcome {
  const valNorm = normalizeTextForComparison(rawInput);
  const validExpected = expectedList.filter((e) => e.trim().length > 0);

  // 1. Exact match (ignoring case & terminal punctuation)
  const exactMatch = validExpected.find((exp) => normalizeTextForComparison(exp) === valNorm);
  if (exactMatch) {
    return {
      kind: 'exact',
      matchedExpected: exactMatch,
      velocity: evaluateTwoStageVelocity(t1Sec, t2Sec, true),
    };
  }

  // 2. Diacritic / macron mismatch (exact once macrons/accents are stripped)
  const diacriticMatch = validExpected.find(
    (exp) => stripDiacritics(normalizeTextForComparison(exp)) === stripDiacritics(valNorm),
  );
  if (diacriticMatch) {
    const segments = buildDiacriticDiff(rawInput, diacriticMatch);
    return {
      kind: 'diacritic-error',
      closestExpected: diacriticMatch,
      segments,
      message: 'Almost exact! Check your macrons or accent marks (highlighted below).',
    };
  }

  // 3. Single-character typo tolerance (gives learner one free retry without penalizing SRS)
  if (allowSingleTypoRetry) {
    const typoMatch = validExpected.find((exp) =>
      isSingleTypo(normalizeTextForComparison(exp), valNorm),
    );
    if (typoMatch) {
      return {
        kind: 'single-typo',
        closestExpected: typoMatch,
        message: 'Very close — there is a single-letter typo. Check your spelling and try again.',
      };
    }
  }

  // 4. General mismatch — pick closest expected answer for helpful feedback
  let closest = validExpected[0] ?? '';
  let bestDist = Infinity;
  for (const exp of validExpected) {
    const dist = damerauLevenshtein(normalizeTextForComparison(exp), valNorm);
    if (dist < bestDist) {
      bestDist = dist;
      closest = exp;
    }
  }

  return {
    kind: 'mismatch',
    closestExpected: closest,
    velocity: evaluateTwoStageVelocity(t1Sec, t2Sec, false),
    message: 'Not quite yet — check the sentence pattern and word order.',
  };
}
