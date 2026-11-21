import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FastForward,
  Volume2,
} from 'lucide-react';
import { checkVoiceAvailability, playPhraseAudio, playPounamuChime } from '../engine/audio';
import type { ModuleMasterySummary } from '../engine/srs';
import type { VelocityTier } from '../engine/grading';
import type { Curriculum, LessonModule, PackKey } from '../schema/curriculum';
import { Step5Practice } from './Step5Practice';
import { Step6Drills } from './Step6Drills';

export type LessonStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_DEFINITIONS: Array<{ num: LessonStep; label: string }> = [
  { num: 1, label: 'Overview' },
  { num: 2, label: 'Pattern' },
  { num: 3, label: 'Words' },
  { num: 4, label: 'Dialogue' },
  { num: 5, label: 'Practice' },
  { num: 6, label: 'Drills' },
];

const PACK_KEYS: PackKey[] = ['workplace', 'outside', 'community', 'social'];

interface LearnViewProps {
  curriculum: Curriculum;
  activeModule: LessonModule;
  mastery: ModuleMasterySummary;
  step: LessonStep;
  promptIdx: number;
  audioMuted: boolean;
  onSelectStep: (step: LessonStep) => void;
  onSelectModule: (moduleId: string) => void;
  onSelectPromptIdx: (idx: number) => void;
  onRecordPracticeResult: (
    promptId: string,
    moduleId: string,
    isCorrect: boolean,
    velocity: VelocityTier,
    t1Sec: number,
    t2Sec: number,
  ) => void;
  onCompleteDrill: (drillId: string, primaryPromptId: string, moduleId: string, t2Sec: number) => boolean;
  onGoToReview: () => void;
  onNotify: (msg: string, tone?: 'success' | 'warning') => void;
}

export function LearnView({
  curriculum,
  activeModule,
  mastery,
  step,
  promptIdx,
  audioMuted,
  onSelectStep,
  onSelectModule,
  onSelectPromptIdx,
  onRecordPracticeResult,
  onCompleteDrill,
  onGoToReview,
  onNotify,
}: LearnViewProps) {
  const [activePacks, setActivePacks] = useState<PackKey[]>([]);
  const [selectedCheckIdx, setSelectedCheckIdx] = useState<number | null>(null);
  const [voiceMissing, setVoiceMissing] = useState(false);

  // Detect whether browser has a native voice for the curriculum's BCP-47 language
  useEffect(() => {
    const inspectVoices = () => {
      const info = checkVoiceAvailability(curriculum.meta.bcp47);
      setVoiceMissing(info.supported && !info.hasExactLangVoice);
    };
    inspectVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', inspectVoices);
      return () => {
        window.speechSynthesis.removeEventListener?.('voiceschanged', inspectVoices);
      };
    }
  }, [curriculum.meta.bcp47]);

  const activeVocab = useMemo(() => {
    const combined = [...activeModule.vocab];
    for (const key of activePacks) {
      for (const item of activeModule.packs[key] ?? []) {
        if (!combined.some((existing) => existing.word === item.word)) {
          combined.push(item);
        }
      }
    }
    return combined;
  }, [activeModule, activePacks]);

  const currentIndex = curriculum.modules.findIndex((m) => m.id === activeModule.id);
  const nextLessonModule =
    currentIndex >= 0 && currentIndex < curriculum.modules.length - 1
      ? curriculum.modules[currentIndex + 1]
      : undefined;

  const togglePack = (key: PackKey) => {
    setActivePacks((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handlePlayDialogue = () => {
    const fullText = activeModule.model.turns.map((t) => t.target).join('. ');
    playPhraseAudio(fullText, curriculum.meta.bcp47, audioMuted, activeModule.model.audioUrl);
  };

  const handleCheckSelect = (idx: number, isCorrect: boolean) => {
    setSelectedCheckIdx(idx);
    if (isCorrect) {
      playPounamuChime(audioMuted);
    }
  };

  const selectedOption =
    selectedCheckIdx !== null ? activeModule.model.check.options[selectedCheckIdx] : null;

  return (
    <div className="stack-md">
      {/* Lesson Selector + 6-Step Navigator (replaces scroll-snap) */}
      <section className="lesson-bar" aria-label="Lesson navigation">
        <div className="lesson-select-row">
          <label htmlFor="lessonSelect" className="sr-only">
            Choose a lesson
          </label>
          <select
            id="lessonSelect"
            className="lesson-select"
            value={activeModule.id}
            onChange={(e) => onSelectModule(e.target.value)}
          >
            {curriculum.modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>

          <span className="mastery-tag" data-level={mastery.level}>
            {mastery.label} ({mastery.reviewedPrompts}/{mastery.totalPrompts})
          </span>
        </div>

        <div className="stepper" role="navigation" aria-label="Lesson steps">
          {STEP_DEFINITIONS.map((s) => (
            <button
              key={s.num}
              type="button"
              id={`stepPill${s.num}`}
              className="step-pill"
              aria-current={step === s.num ? 'step' : undefined}
              onClick={() => onSelectStep(s.num)}
            >
              <span className="step-pill-num">{s.num}</span>
              <span className="step-pill-label">{s.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Active Step Card */}
      <article className="step-card" aria-live="polite">
        {step === 1 && (
          <div className="stack-md">
            <div className="row-between">
              <span className="step-eyebrow">Step 1 · Overview</span>
              <span className="vocab-meaning mono">
                {activeModule.wahanga} · {activeModule.kowae}
              </span>
            </div>

            <h1 className="step-title">{activeModule.title}</h1>

            <div className="objective-callout">Goal: {activeModule.canDo}</div>

            <div className="concept-box">
              <strong>How it works:</strong> {activeModule.concept}
            </div>

            <div className="step-footer">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onSelectStep(4)}
              >
                <FastForward size={15} />
                <span>Skip to Dialogue</span>
              </button>
              <button
                type="button"
                id="step1NextBtn"
                className="btn btn-primary"
                onClick={() => onSelectStep(2)}
              >
                <span>See Sentence Pattern</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack-md">
            <div className="row-between">
              <span className="step-eyebrow">Step 2 · Sentence Pattern</span>
              <span className="vocab-meaning">Solid = fixed word · Dashed = swap in your word</span>
            </div>

            <h2 className="step-title">Reusable Structure</h2>

            <div className="pattern-banner">{activeModule.pattern}</div>

            <div className="slots-row">
              {activeModule.slots.map((slot, idx) => (
                <div key={`${slot.label}-${idx}`} className="row-wrap">
                  <div className={`slot-tile ${slot.type}`}>
                    <span className="slot-label">{slot.label}</span>
                    <span className="slot-meta">
                      {slot.meaning} ({slot.type === 'fixed' ? 'fixed' : 'changeable'})
                    </span>
                  </div>
                  {idx < activeModule.slots.length - 1 && (
                    <span className="slot-plus" aria-hidden="true">
                      +
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="step-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onSelectStep(1)}
              >
                <ArrowLeft size={16} />
                <span>Overview</span>
              </button>
              <button
                type="button"
                id="step2NextBtn"
                className="btn btn-primary"
                onClick={() => onSelectStep(3)}
              >
                <span>Explore Key Words</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack-md">
            <div className="row-between">
              <span className="step-eyebrow">Step 3 · Key Words</span>
              <span className="vocab-meaning">Tap any word to hear pronunciation</span>
            </div>

            <h2 className="step-title">Essential Vocabulary</h2>

            {voiceMissing && !audioMuted && (
              <div className="voice-notice" role="note">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Your browser does not include a native <strong>{curriculum.meta.bcp47}</strong>{' '}
                  speech voice, so fallback pronunciation may sound accented unless native audio
                  tracks are attached.
                </span>
              </div>
            )}

            <div className="vocab-grid">
              {activeVocab.map((item) => (
                <button
                  key={item.word}
                  type="button"
                  className="vocab-card"
                  onClick={() =>
                    playPhraseAudio(item.word, curriculum.meta.bcp47, audioMuted, item.audioUrl)
                  }
                  aria-label={`Listen to ${item.word}, meaning ${item.meaning}`}
                >
                  <span className="vocab-main">
                    {item.emoji && (
                      <span className="vocab-emoji" aria-hidden="true">
                        {item.emoji}
                      </span>
                    )}
                    <span>
                      <span className="vocab-word" style={{ display: 'block' }}>
                        {item.word}
                      </span>
                      <span className="vocab-meaning" style={{ display: 'block' }}>
                        {item.meaning}
                      </span>
                    </span>
                  </span>
                  <Volume2 size={16} aria-hidden="true" />
                </button>
              ))}
            </div>

            <div className="stack-sm">
              <div className="row-between">
                <span className="field-label">Optional Topic Packs</span>
                <span className="vocab-meaning">
                  {activePacks.length === 0
                    ? 'Base words shown'
                    : `${activePacks.length} topic pack(s) added`}
                </span>
              </div>
              <div className="row-wrap">
                {PACK_KEYS.filter((k) => (activeModule.packs[k]?.length ?? 0) > 0).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="pack-btn"
                    aria-pressed={activePacks.includes(key)}
                    onClick={() => togglePack(key)}
                  >
                    <span>+ {curriculum.meta.packLabels[key]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="step-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onSelectStep(2)}
              >
                <ArrowLeft size={16} />
                <span>Pattern</span>
              </button>
              <button
                type="button"
                id="step3NextBtn"
                className="btn btn-primary"
                onClick={() => onSelectStep(4)}
              >
                <span>Listen to Dialogue</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="stack-md">
            <div className="row-between">
              <div>
                <span className="step-eyebrow">Step 4 · Dialogue</span>
                <h2 className="step-title">See it in conversation</h2>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handlePlayDialogue}
              >
                <Volume2 size={15} />
                <span>Listen to all</span>
              </button>
            </div>

            {activeModule.model.context && (
              <div className="prompt-situation">{activeModule.model.context}</div>
            )}

            <div className="stack-sm">
              {activeModule.model.turns.map((turn, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`dialogue-turn ${idx % 2 === 1 ? 'alt' : ''}`}
                  onClick={() =>
                    playPhraseAudio(turn.target, curriculum.meta.bcp47, audioMuted, turn.audioUrl)
                  }
                  aria-label={`Play ${turn.speaker}: ${turn.target}`}
                >
                  <div className="row-between" style={{ width: '100%' }}>
                    <span className="dialogue-speaker">{turn.speaker}</span>
                    <Volume2 size={15} aria-hidden="true" />
                  </div>
                  <span className="dialogue-target">{turn.target}</span>
                  <span className="dialogue-en">“{turn.en}”</span>
                </button>
              ))}
            </div>

            {activeModule.model.literal && (
              <div className="concept-box mono">Breakdown: {activeModule.model.literal}</div>
            )}

            <div className="prompt-box">
              <div className="row-between">
                <span className="field-label">Quick Check</span>
                {selectedOption && (
                  <span className="mastery-tag" data-level={selectedOption.correct ? 3 : 1}>
                    {selectedOption.correct ? 'Got it!' : 'Try again'}
                  </span>
                )}
              </div>
              <strong>{activeModule.model.check.question}</strong>
              <div className="choice-grid">
                {activeModule.model.check.options.map((opt, idx) => {
                  const isChosen = selectedCheckIdx === idx;
                  const statusClass = isChosen ? (opt.correct ? 'correct' : 'incorrect') : '';
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`choice-btn ${statusClass}`}
                      onClick={() => handleCheckSelect(idx, opt.correct)}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>
              {selectedOption?.correct && (
                <div className="row-wrap" style={{ color: 'var(--accent-text)', fontSize: '0.84rem', fontWeight: 700 }}>
                  <CheckCircle2 size={16} />
                  <span>Nice work — you are ready to build sentences yourself!</span>
                </div>
              )}
            </div>

            <div className="step-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onSelectStep(3)}
              >
                <ArrowLeft size={16} />
                <span>Words</span>
              </button>
              <button
                type="button"
                id="step4NextBtn"
                className="btn btn-warm"
                onClick={() => onSelectStep(5)}
              >
                <span>Practice Building</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <>
            <Step5Practice
              key={`${activeModule.id}:${promptIdx}`}
              mod={activeModule}
              meta={curriculum.meta}
              activeVocab={activeVocab}
              promptIdx={promptIdx}
              shouldFadeChips={mastery.shouldFadeChips}
              audioMuted={audioMuted}
              onSelectPromptIdx={onSelectPromptIdx}
              onRecordResult={onRecordPracticeResult}
              onGoToDrills={() => onSelectStep(6)}
              onSwitchModule={onSelectModule}
              onNotify={onNotify}
              nextLessonModule={nextLessonModule}
            />
            <div className="step-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onSelectStep(4)}
              >
                <ArrowLeft size={16} />
                <span>Dialogue</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onSelectStep(6)}
              >
                <span>Quick Drills</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {step === 6 && (
          <Step6Drills
            mod={activeModule}
            meta={curriculum.meta}
            audioMuted={audioMuted}
            onCompleteDrill={onCompleteDrill}
            onGoToReview={onGoToReview}
            onSwitchModule={onSelectModule}
            nextLessonModule={nextLessonModule}
          />
        )}
      </article>
    </div>
  );
}
