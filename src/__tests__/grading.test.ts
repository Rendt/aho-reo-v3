import { describe, expect, it } from 'vitest';
import {
  buildDiacriticDiff,
  damerauLevenshtein,
  evaluateTwoStageVelocity,
  gradeResponse,
  normalizeTextForComparison,
  stripDiacritics,
} from '../engine/grading';

describe('grading engine', () => {
  it('normalizes case, punctuation, whitespace, and Unicode NFC', () => {
    expect(normalizeTextForComparison('  Ko Mere   ahau!  ')).toBe('ko mere ahau');
    expect(normalizeTextForComparison('Kua oti te mahi?')).toBe('kua oti te mahi');
    // NFD decomposed ā vs NFC precomposed ā
    const nfd = 'No\u0304 Ta\u0304maki Makaurau ahau';
    const nfc = 'Nō Tāmaki Makaurau ahau';
    expect(normalizeTextForComparison(nfd)).toBe(normalizeTextForComparison(nfc));
  });

  it('strips macrons and acute accents cleanly', () => {
    expect(stripDiacritics('Nō Tāmaki Makaurau ahau')).toBe('No Tamaki Makaurau ahau');
    expect(stripDiacritics('āēīōū áéíóú')).toBe('aeiou aeiou');
  });

  it('computes Damerau-Levenshtein including adjacent transpositions', () => {
    expect(damerauLevenshtein('ahau', 'ahau')).toBe(0);
    expect(damerauLevenshtein('ahau', 'aahu')).toBe(1);
    expect(damerauLevenshtein('kōrero', 'kōreo')).toBe(1);
  });

  it('grades exact matches across accepted variants with velocity tiers', () => {
    const fast = gradeResponse('Ko Mere au.', ['Ko Mere ahau', 'Ko Mere au'], 1.2, 3.4);
    expect(fast.kind).toBe('exact');
    if (fast.kind === 'exact') {
      expect(fast.velocity.tier).toBe('automated');
    }

    const medium = gradeResponse('ko mere ahau', ['Ko Mere ahau'], 3.5, 6.2);
    expect(medium.kind).toBe('exact');
    if (medium.kind === 'exact') {
      expect(medium.velocity.tier).toBe('developing');
    }
  });

  it('detects missing macrons and produces character-level diff highlights', () => {
    const res = gradeResponse('No Tamaki Makaurau ahau', ['Nō Tāmaki Makaurau ahau'], 2.0, 4.0);
    expect(res.kind).toBe('diacritic-error');
    if (res.kind === 'diacritic-error') {
      const flagged = res.segments.filter((s) => s.status === 'diacritic-mismatch');
      expect(flagged.map((f) => f.expectedChar)).toEqual(['ō', 'ā']);
    }

    const diff = buildDiacriticDiff('Kei te panui ia', 'Kei te pānui ia');
    expect(diff.some((s) => s.status === 'diacritic-mismatch' && s.expectedChar === 'ā')).toBe(true);
  });

  it('offers single-typo tolerance when enabled and fails mismatch when disabled', () => {
    const retry = gradeResponse('Ko Mree ahau', ['Ko Mere ahau'], 2.0, 4.0, true);
    expect(retry.kind).toBe('single-typo');

    const strict = gradeResponse('Ko Mree ahau', ['Ko Mere ahau'], 2.0, 4.0, false);
    expect(strict.kind).toBe('mismatch');
  });

  it('evaluates velocity safely for slow or incorrect attempts', () => {
    expect(evaluateTwoStageVelocity(1.0, 15.0, true).tier).toBe('needs-practice');
    expect(evaluateTwoStageVelocity(1.0, 2.0, false).tier).toBe('needs-practice');
  });
});
