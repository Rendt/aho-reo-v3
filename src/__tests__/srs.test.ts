import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Curriculum } from '../schema/curriculum';
import {
  computeDailyStreak,
  createInitialProgress,
  getDuePromptItems,
  getModuleMastery,
  recordDrillCompletion,
  recordItemReview,
} from '../engine/srs';

const maoriCourse = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/curricula/te-reo-maori-a1.json'), 'utf-8'),
) as Curriculum;

describe('FSRS spaced repetition engine', () => {
  const firstMod = maoriCourse.modules[0];
  const prompt1 = firstMod.prompts[0];
  const prompt2 = firstMod.prompts[1];

  it('schedules item-level FSRS cards and tracks daily study streak separately from session flow', () => {
    const day1 = new Date('2026-11-18T10:00:00Z');
    const day2 = new Date('2026-11-19T10:00:00Z');
    const day3 = new Date('2026-11-20T10:00:00Z');

    let prog = createInitialProgress(maoriCourse.meta.id, firstMod.id);
    ({ progress: prog } = recordItemReview(prog, prompt1.id, firstMod.id, true, 'automated', 1.2, 3.0, day1));
    ({ progress: prog } = recordItemReview(prog, prompt2.id, firstMod.id, true, 'developing', 2.8, 5.8, day1));

    // Two completions on same calendar day = 2 session flow, 1-day daily streak
    expect(prog.sessionFlow).toBe(2);
    expect(computeDailyStreak(prog.practiceDates, day1)).toBe(1);

    // Practice consecutive days
    ({ progress: prog } = recordItemReview(prog, prompt1.id, firstMod.id, true, 'automated', 1.1, 2.5, day2));
    ({ progress: prog } = recordItemReview(prog, prompt2.id, firstMod.id, true, 'automated', 1.0, 2.8, day3));

    expect(computeDailyStreak(prog.practiceDates, day3)).toBe(3);
    expect(prog.items[prompt1.id].card.reps).toBe(2);
  });

  it('prevents repeat-click SRS farming on Step 6 consolidation drills', () => {
    const t0 = new Date('2026-11-20T10:00:00Z');
    const t5Min = new Date('2026-11-20T10:05:00Z');
    const tNextDay = new Date('2026-11-21T10:00:00Z');

    let prog = createInitialProgress(maoriCourse.meta.id, firstMod.id);
    const first = recordDrillCompletion(prog, 'MRA_W1_M01_D1', prompt1.id, firstMod.id, 2.1, t0);
    expect(first.credited).toBe(true);
    prog = first.progress;

    // Clicking again 5 minutes later should NOT farm extra SRS reps
    const spam = recordDrillCompletion(prog, 'MRA_W1_M01_D1', prompt1.id, firstMod.id, 1.5, t5Min);
    expect(spam.credited).toBe(false);
    expect(spam.progress.items[prompt1.id].card.reps).toBe(1);

    // Next day (past 12h cooldown) grants credit again
    const later = recordDrillCompletion(prog, 'MRA_W1_M01_D1', prompt1.id, firstMod.id, 2.0, tNextDay);
    expect(later.credited).toBe(true);
    expect(later.progress.items[prompt1.id].card.reps).toBe(2);
  });

  it('rolls up module mastery and identifies due items accurately', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    let prog = createInitialProgress(maoriCourse.meta.id, firstMod.id);

    expect(getModuleMastery(firstMod, prog, now).level).toBe(0);
    expect(getModuleMastery(firstMod, prog, now).shouldFadeChips).toBe(false);

    // Complete each prompt twice -> Familiar (level >= 2, fades chips)
    ({ progress: prog } = recordItemReview(prog, prompt1.id, firstMod.id, true, 'developing', 2, 4, now));
    ({ progress: prog } = recordItemReview(prog, prompt2.id, firstMod.id, true, 'developing', 2, 4, now));
    ({ progress: prog } = recordItemReview(prog, prompt1.id, firstMod.id, true, 'automated', 1.2, 3, now));
    ({ progress: prog } = recordItemReview(prog, prompt2.id, firstMod.id, true, 'automated', 1.2, 3, now));

    const summary = getModuleMastery(firstMod, prog, now);
    expect(summary.level).toBeGreaterThanOrEqual(2);
    expect(summary.shouldFadeChips).toBe(true);

    // Advance 60 days into the future -> items become due
    const future = new Date('2027-01-20T10:00:00Z');
    const due = getDuePromptItems(maoriCourse.modules, prog, future);
    expect(due.length).toBe(2);
  });
});
