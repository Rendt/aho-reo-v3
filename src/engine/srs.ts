import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { LessonModule } from '../schema/curriculum';
import type { VelocityTier } from './grading';

const scheduler = fsrs({ enable_fuzz: false, enable_short_term: false });

export interface SerializedFSRSCard {
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  state: number;
  last_review?: string;
}

export interface ItemReviewRecord {
  itemId: string;
  moduleId: string;
  card: SerializedFSRSCard;
  lastVelocity: VelocityTier;
  lastT1: number;
  lastT2: number;
  updatedAt: string;
}

export interface CurriculumProgress {
  curriculumId: string;
  activeModId: string;
  items: Record<string, ItemReviewRecord>;
  completedDrills: Record<string, string>; // drillId -> ISO timestamp (prevents repeat-click farming)
  practiceDates: string[]; // YYYY-MM-DD local dates for genuine daily streak
  sessionFlow: number; // XP / successful completions in current session
}

export interface ModuleMasterySummary {
  moduleId: string;
  totalPrompts: number;
  reviewedPrompts: number;
  masteredPrompts: number;
  duePrompts: number;
  /** 0 = New, 1 = Learning, 2 = Familiar, 3 = Mastered */
  level: 0 | 1 | 2 | 3;
  label: 'New' | 'Learning' | 'Familiar' | 'Mastered';
  shouldFadeChips: boolean;
  nextDueAt: number | null;
}

export function serializeCard(card: Card): SerializedFSRSCard {
  return {
    due: card.due instanceof Date ? card.due.toISOString() : String(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state,
    last_review: card.last_review instanceof Date ? card.last_review.toISOString() : card.last_review,
  };
}

export function deserializeCard(raw?: SerializedFSRSCard): Card {
  if (!raw) return createEmptyCard(new Date());
  return {
    due: new Date(raw.due),
    stability: raw.stability,
    difficulty: raw.difficulty,
    scheduled_days: raw.scheduled_days,
    reps: raw.reps,
    lapses: raw.lapses,
    learning_steps: raw.learning_steps ?? 0,
    state: raw.state as State,
    last_review: raw.last_review ? new Date(raw.last_review) : undefined,
  };
}

export function velocityToRating(isCorrect: boolean, velocity: VelocityTier): Grade {
  if (!isCorrect) return Rating.Again;
  if (velocity === 'automated') return Rating.Easy;
  if (velocity === 'developing') return Rating.Good;
  return Rating.Hard;
}

/**
 * Formats a Date into local YYYY-MM-DD for calendar-day streak tracking.
 */
export function toLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes consecutive daily study streak (counting today or yesterday as active).
 */
export function computeDailyStreak(practiceDates: string[], now: Date = new Date()): number {
  if (!practiceDates || practiceDates.length === 0) return 0;
  const uniqueSet = new Set(practiceDates);
  const todayKey = toLocalDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday);

  let cursor = new Date(now);
  if (uniqueSet.has(todayKey)) {
    // start from today
  } else if (uniqueSet.has(yesterdayKey)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (uniqueSet.has(toLocalDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function createInitialProgress(curriculumId: string, firstModuleId: string): CurriculumProgress {
  return {
    curriculumId,
    activeModId: firstModuleId,
    items: {},
    completedDrills: {},
    practiceDates: [],
    sessionFlow: 0,
  };
}

/**
 * Records an item-level FSRS review and updates the learner's daily study log.
 */
export function recordItemReview(
  progress: CurriculumProgress,
  itemId: string,
  moduleId: string,
  isCorrect: boolean,
  velocity: VelocityTier,
  t1Sec: number,
  t2Sec: number,
  now: Date = new Date(),
): { progress: CurriculumProgress; record: ItemReviewRecord } {
  const existing = progress.items[itemId];
  const currentCard = existing ? deserializeCard(existing.card) : createEmptyCard(now);
  const grade = velocityToRating(isCorrect, velocity);
  const scheduled = scheduler.next(currentCard, now, grade);

  const record: ItemReviewRecord = {
    itemId,
    moduleId,
    card: serializeCard(scheduled.card),
    lastVelocity: velocity,
    lastT1: Number(t1Sec.toFixed(2)),
    lastT2: Number(t2Sec.toFixed(2)),
    updatedAt: now.toISOString(),
  };

  const todayKey = toLocalDateKey(now);
  const practiceDates = progress.practiceDates.includes(todayKey)
    ? progress.practiceDates
    : [...progress.practiceDates, todayKey];

  return {
    record,
    progress: {
      ...progress,
      items: {
        ...progress.items,
        [itemId]: record,
      },
      practiceDates,
      sessionFlow: isCorrect ? progress.sessionFlow + 1 : progress.sessionFlow,
    },
  };
}

/**
 * Records a Step 6 consolidation drill completion with anti-farming guard:
 * each drill ID only grants SRS/flow credit once per cooldown window (12 hours).
 */
export function recordDrillCompletion(
  progress: CurriculumProgress,
  drillId: string,
  primaryPromptId: string,
  moduleId: string,
  t2Sec: number,
  now: Date = new Date(),
): { progress: CurriculumProgress; credited: boolean } {
  const lastDoneIso = progress.completedDrills[drillId];
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  if (lastDoneIso && now.getTime() - new Date(lastDoneIso).getTime() < TWELVE_HOURS_MS) {
    return { progress, credited: false };
  }

  const velocity: VelocityTier = t2Sec <= 3.5 ? 'automated' : 'developing';
  const { progress: nextProg } = recordItemReview(
    progress,
    primaryPromptId,
    moduleId,
    true,
    velocity,
    Math.min(t2Sec, 1.5),
    t2Sec,
    now,
  );

  return {
    credited: true,
    progress: {
      ...nextProg,
      completedDrills: {
        ...nextProg.completedDrills,
        [drillId]: now.toISOString(),
      },
    },
  };
}

/**
 * Rolls up item-level FSRS states into a learner-friendly module mastery summary.
 */
export function getModuleMastery(
  mod: LessonModule,
  progress: CurriculumProgress,
  now: Date = new Date(),
): ModuleMasterySummary {
  const nowMs = now.getTime();
  const totalPrompts = mod.prompts.length;
  let reviewedPrompts = 0;
  let masteredPrompts = 0;
  let duePrompts = 0;
  let totalReps = 0;
  let earliestDue: number | null = null;

  for (const prompt of mod.prompts) {
    const rec = progress.items[prompt.id];
    if (!rec) continue;
    reviewedPrompts++;
    totalReps += rec.card.reps;
    const dueMs = new Date(rec.card.due).getTime();
    if (dueMs <= nowMs) duePrompts++;
    if (earliestDue === null || dueMs < earliestDue) earliestDue = dueMs;

    if (rec.card.state === State.Review && rec.card.stability >= 5) {
      masteredPrompts++;
    }
  }

  let level: 0 | 1 | 2 | 3 = 0;
  let label: ModuleMasterySummary['label'] = 'New';

  if (reviewedPrompts === 0) {
    level = 0;
    label = 'New';
  } else if (masteredPrompts >= totalPrompts) {
    level = 3;
    label = 'Mastered';
  } else if (reviewedPrompts >= totalPrompts && totalReps >= totalPrompts * 2) {
    level = 2;
    label = 'Familiar';
  } else {
    level = 1;
    label = 'Learning';
  }

  return {
    moduleId: mod.id,
    totalPrompts,
    reviewedPrompts,
    masteredPrompts,
    duePrompts,
    level,
    label,
    // Auto-fade word-bank chips once learner has completed the module's prompts at least twice
    shouldFadeChips: level >= 2,
    nextDueAt: earliestDue,
  };
}

export interface DuePromptItem {
  module: LessonModule;
  promptIndex: number;
  promptId: string;
  target: string;
  record: ItemReviewRecord;
}

export function getDuePromptItems(
  modules: LessonModule[],
  progress: CurriculumProgress,
  now: Date = new Date(),
): DuePromptItem[] {
  const nowMs = now.getTime();
  const due: DuePromptItem[] = [];

  for (const mod of modules) {
    mod.prompts.forEach((prompt, idx) => {
      const rec = progress.items[prompt.id];
      if (rec && new Date(rec.card.due).getTime() <= nowMs) {
        due.push({
          module: mod,
          promptIndex: idx,
          promptId: prompt.id,
          target: prompt.target,
          record: rec,
        });
      }
    });
  }

  return due.sort(
    (a, b) => new Date(a.record.card.due).getTime() - new Date(b.record.card.due).getTime(),
  );
}

export function formatRelativeDue(dueIso: string, now: Date = new Date()): string {
  const diffMs = new Date(dueIso).getTime() - now.getTime();
  if (diffMs <= 0) return 'Due now';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `In ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `In ${hrs}h`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'In 1 day' : `In ${days} days`;
}
