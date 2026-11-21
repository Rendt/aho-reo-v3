import { ArrowRight, CheckCircle2, Circle, Shuffle } from 'lucide-react';
import {
  formatRelativeDue,
  getDuePromptItems,
  getModuleMastery,
  type CurriculumProgress,
} from '../engine/srs';
import type { Curriculum } from '../schema/curriculum';

interface ReviewViewProps {
  curriculum: Curriculum;
  progress: CurriculumProgress;
  onReviewPrompt: (moduleId: string, promptIndex: number) => void;
  onOpenModule: (moduleId: string) => void;
  onLaunchMixedDrill: () => void;
}

export function ReviewView({
  curriculum,
  progress,
  onReviewPrompt,
  onOpenModule,
  onLaunchMixedDrill,
}: ReviewViewProps) {
  const dueItems = getDuePromptItems(curriculum.modules, progress);
  const summaries = curriculum.modules.map((mod) => ({
    mod,
    mastery: getModuleMastery(mod, progress),
  }));
  const startedCount = summaries.filter((s) => s.mastery.reviewedPrompts > 0).length;
  const masteredCount = summaries.filter((s) => s.mastery.level === 3).length;

  return (
    <div className="stack-lg">
      <section className="panel stack-md">
        <div className="row-between">
          <div>
            <h1 className="page-heading">Review Hub</h1>
            <p className="page-lead">
              Each sentence is scheduled individually with adaptive spaced repetition (FSRS).
            </p>
          </div>
          <button
            type="button"
            id="launchMixedDrillBtn"
            className="btn btn-primary"
            onClick={onLaunchMixedDrill}
          >
            <Shuffle size={16} />
            <span>Mixed Pattern Drill</span>
          </button>
        </div>

        {dueItems.length === 0 ? (
          <div className="concept-box stack-sm" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ display: 'inline-flex', justifyContent: 'center', color: 'var(--accent)' }}>
              <CheckCircle2 size={28} />
            </div>
            <strong>All caught up!</strong>
            <span className="vocab-meaning">
              No sentences are due right now. Practice mixed patterns above or start a new lesson.
            </span>
          </div>
        ) : (
          <div className="stack-sm">
            <div className="field-label">Due Now ({dueItems.length})</div>
            {dueItems.map((item) => (
              <div key={item.promptId} className="list-item">
                <div>
                  <strong>“{item.target}”</strong>
                  <div className="vocab-meaning">
                    {item.module.title} · {item.record.card.reps} review(s)
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onReviewPrompt(item.module.id, item.promptIndex)}
                >
                  <span>Practice</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel stack-md">
        <div className="row-between">
          <div>
            <h2 className="step-title" style={{ fontSize: '1.1rem' }}>
              Lesson Progress
            </h2>
            <p className="vocab-meaning">
              {startedCount} of {curriculum.modules.length} lessons started · {masteredCount} mastered
            </p>
          </div>
        </div>

        <div className="stack-sm">
          {summaries.map(({ mod, mastery }) => (
            <button
              key={mod.id}
              type="button"
              className="list-item list-item-btn"
              onClick={() => onOpenModule(mod.id)}
            >
              <div className="row-wrap" style={{ alignItems: 'flex-start' }}>
                {mastery.reviewedPrompts > 0 ? (
                  <CheckCircle2
                    size={18}
                    style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}
                  />
                ) : (
                  <Circle
                    size={18}
                    style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }}
                  />
                )}
                <div>
                  <strong>{mod.title}</strong>
                  <div className="vocab-meaning">{mod.canDo}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span className="mastery-tag" data-level={mastery.level}>
                  {mastery.label}
                </span>
                {mastery.nextDueAt && (
                  <div className="vocab-meaning" style={{ marginTop: 4 }}>
                    {formatRelativeDue(new Date(mastery.nextDueAt).toISOString())}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
