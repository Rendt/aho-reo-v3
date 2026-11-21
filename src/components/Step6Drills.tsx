import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { playPhraseAudio, playPounamuChime } from '../engine/audio';
import type { CurriculumMeta, DrillItem, LessonModule } from '../schema/curriculum';

interface Step6DrillsProps {
  mod: LessonModule;
  meta: CurriculumMeta;
  audioMuted: boolean;
  onCompleteDrill: (drillId: string, primaryPromptId: string, moduleId: string, t2Sec: number) => boolean;
  onGoToReview: () => void;
  onSwitchModule: (moduleId: string) => void;
  nextLessonModule?: LessonModule;
}

const KIND_LABELS: Record<DrillItem['kind'], string> = {
  cloze: 'Marker Cloze',
  'context-swap': 'Topic Swap',
  'slot-fill': 'Slot Fill',
  'pattern-match': 'Pattern Match',
};

function deterministicOrder(choices: string[], seed: string): string[] {
  const unique = Array.from(new Set(choices));
  return unique
    .map((item) => {
      let hash = 0;
      const key = `${seed}:${item}`;
      for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
      }
      return { item, hash };
    })
    .sort((a, b) => a.hash - b.hash)
    .map((entry) => entry.item);
}

export function Step6Drills({
  mod,
  meta,
  audioMuted,
  onCompleteDrill,
  onGoToReview,
  onSwitchModule,
  nextLessonModule,
}: Step6DrillsProps) {
  const [drillIdx, setDrillIdx] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [creditedMessage, setCreditedMessage] = useState<string | null>(null);
  const mountTimeRef = useRef<number>(0);

  const drills = mod.drills;
  const activeDrill = drills[drillIdx % drills.length] ?? drills[0];

  useEffect(() => {
    mountTimeRef.current = Date.now();
  }, [drillIdx]);

  const orderedChoices = useMemo(
    () => deterministicOrder(activeDrill.choices, activeDrill.id),
    [activeDrill.choices, activeDrill.id],
  );

  const handleSelectChoice = (choice: string) => {
    if (solved) return;
    setSelectedChoice(choice);
    const isCorrect = choice.trim().toLowerCase() === activeDrill.answer.trim().toLowerCase();
    if (isCorrect) {
      setSolved(true);
      const t2Sec = (Date.now() - (mountTimeRef.current || Date.now())) / 1000;
      playPounamuChime(audioMuted);
      playPhraseAudio(activeDrill.completedSentence, meta.bcp47, audioMuted);

      const primaryPromptId = mod.prompts[0]?.id ?? mod.id;
      const credited = onCompleteDrill(activeDrill.id, primaryPromptId, mod.id, t2Sec);
      setCreditedMessage(
        credited
          ? `Progress updated (${t2Sec.toFixed(1)}s)`
          : 'Great refresher! (Already credited recently)',
      );
    }
  };

  const handleNextDrill = () => {
    setDrillIdx((prev) => (prev + 1) % drills.length);
    setSelectedChoice(null);
    setSolved(false);
    setCreditedMessage(null);
  };

  return (
    <div className="stack-md">
      <div className="row-between">
        <div>
          <div className="step-eyebrow">Step 6 · Quick Drills</div>
          <h2 className="step-title">Reinforce the pattern</h2>
        </div>
        <span className="mastery-tag">
          Drill {(drillIdx % drills.length) + 1}/{drills.length} · {KIND_LABELS[activeDrill.kind]}
        </span>
      </div>

      <div className="prompt-box">
        <div className="prompt-situation">{activeDrill.instruction}</div>
        <div className="vocab-meaning">Meaning: “{activeDrill.contextPrompt}”</div>
        <div className="prompt-target">
          {solved ? activeDrill.completedSentence : activeDrill.sentenceTemplate}
        </div>
      </div>

      <div className={activeDrill.kind === 'pattern-match' ? 'stack-sm' : 'choice-grid'}>
        {orderedChoices.map((choice) => {
          const isSelected = selectedChoice === choice;
          const isAnswer = choice.trim().toLowerCase() === activeDrill.answer.trim().toLowerCase();
          let stateClass = '';
          if (solved && isAnswer) stateClass = 'correct';
          else if (isSelected && !isAnswer) stateClass = 'incorrect';

          return (
            <button
              key={choice}
              type="button"
              className={`choice-btn ${stateClass}`}
              onClick={() => handleSelectChoice(choice)}
              disabled={solved}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {selectedChoice && (
        <div
          className={`feedback-banner ${solved ? 'success' : 'warning'}`}
          role="status"
          aria-live="polite"
        >
          {solved ? (
            <div className="stack-sm">
              <div className="row-between">
                <div className="row-wrap">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <strong>{meta.praisePhrase}</strong>
                  <span>{activeDrill.explanation ?? 'Pattern confirmed.'}</span>
                </div>
                {creditedMessage && <span className="mastery-tag">{creditedMessage}</span>}
              </div>
            </div>
          ) : (
            <div>
              <strong>Try another option</strong> — re-check how{' '}
              <span className="mono">{mod.pattern}</span> works.
            </div>
          )}
        </div>
      )}

      <div className="step-footer">
        <button type="button" id="nextDrillBtn" className="btn btn-secondary" onClick={handleNextDrill}>
          <RefreshCw size={15} />
          <span>Next Drill ({((drillIdx + 1) % drills.length) + 1}/{drills.length})</span>
        </button>

        <div className="row-wrap">
          {nextLessonModule ? (
            <button
              type="button"
              id="nextLessonFromDrillsBtn"
              className="btn btn-primary"
              onClick={() => onSwitchModule(nextLessonModule.id)}
            >
              <span>Next Lesson: {nextLessonModule.title.split(':')[0]}</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onGoToReview}>
              <span>Go to Review Hub</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
