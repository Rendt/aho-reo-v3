import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Shuffle } from 'lucide-react';
import { playPhraseAudio, playPounamuChime } from '../engine/audio';
import { gradeResponse, type GradeOutcome, type VelocityTier } from '../engine/grading';
import type { Curriculum, LessonModule, PromptItem } from '../schema/curriculum';
import { Dialog } from './Dialog';

interface DrillModalProps {
  open: boolean;
  onClose: () => void;
  curriculum: Curriculum;
  audioMuted: boolean;
  onRecordResult: (
    promptId: string,
    moduleId: string,
    isCorrect: boolean,
    velocity: VelocityTier,
    t1Sec: number,
    t2Sec: number,
  ) => void;
}

interface ActiveDrillEntry {
  mod: LessonModule;
  prompt: PromptItem;
}

function pickContrastingPrompt(
  modules: LessonModule[],
  previousModId?: string,
): ActiveDrillEntry | null {
  if (modules.length === 0) return null;
  const candidates = modules.filter((m) => m.id !== previousModId);
  const pool = candidates.length > 0 ? candidates : modules;
  const mod = pool[Math.floor(Math.random() * pool.length)];
  const prompt = mod.prompts[Math.floor(Math.random() * mod.prompts.length)] ?? mod.prompts[0];
  return prompt ? { mod, prompt } : null;
}

export function DrillModal({
  open,
  onClose,
  curriculum,
  audioMuted,
  onRecordResult,
}: DrillModalProps) {
  const [entry, setEntry] = useState<ActiveDrillEntry | null>(null);
  const [input, setInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [outcome, setOutcome] = useState<GradeOutcome | null>(null);
  const [solved, setSolved] = useState(false);
  const [lastTypoAttempt, setLastTypoAttempt] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const mountTimeRef = useRef<number>(0);
  const firstTouchRef = useRef<number | null>(null);

  const loadNext = (prevId?: string) => {
    const next = pickContrastingPrompt(curriculum.modules, prevId);
    setEntry(next);
    setInput('');
    setShowHint(false);
    setOutcome(null);
    setSolved(false);
    setLastTypoAttempt('');
    mountTimeRef.current = Date.now();
    firstTouchRef.current = null;
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (open) {
      loadNext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, curriculum.meta.id]);

  const markTouch = () => {
    if (firstTouchRef.current === null) {
      firstTouchRef.current = Date.now();
    }
  };

  const insertChar = (ch: string) => {
    markTouch();
    const el = inputRef.current;
    if (!el) {
      setInput((prev) => prev + ch);
      return;
    }
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? start;
    const next = input.slice(0, start) + ch + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    const now = Date.now();
    const t2Sec = (now - mountTimeRef.current) / 1000;
    const t1Sec = firstTouchRef.current ? (firstTouchRef.current - mountTimeRef.current) / 1000 : t2Sec;

    const allowTypoRetry = lastTypoAttempt !== trimmed;
    const result = gradeResponse(trimmed, entry.prompt.expected, t1Sec, t2Sec, allowTypoRetry);
    setOutcome(result);

    if (result.kind === 'exact') {
      if (!solved) {
        onRecordResult(entry.prompt.id, entry.mod.id, true, result.velocity.tier, t1Sec, t2Sec);
      }
      setSolved(true);
      playPounamuChime(audioMuted);
      playPhraseAudio(result.matchedExpected, curriculum.meta.bcp47, audioMuted);
    } else if (result.kind === 'single-typo') {
      setLastTypoAttempt(trimmed);
    } else if (result.kind === 'mismatch') {
      onRecordResult(entry.prompt.id, entry.mod.id, false, result.velocity.tier, t1Sec, t2Sec);
    }
  };

  return (
    <Dialog
      id="mixedDrillDialog"
      open={open}
      onClose={onClose}
      title="Mixed Pattern Drill"
      icon={<Shuffle size={18} />}
    >
      {entry ? (
        <div className="stack-md">
          <div className="row-between">
            <span className="vocab-meaning mono">{entry.mod.wahanga}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowHint((h) => !h)}
            >
              {showHint ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{showHint ? 'Hide pattern hint' : 'Show pattern hint'}</span>
            </button>
          </div>

          <div className="prompt-box">
            <span className="prompt-situation">
              {entry.prompt.situation ?? 'Choose the right sentence pattern:'}
            </span>
            <div className="prompt-target">“{entry.prompt.target}”</div>
            {showHint && (
              <div className="prompt-hint">Pattern hint: {entry.mod.pattern}</div>
            )}
          </div>

          <div className="row-wrap" role="group" aria-label="Special character buttons">
            {curriculum.meta.specialChars.map((ch) => (
              <button
                key={ch}
                type="button"
                className="macron-btn"
                onClick={() => insertChar(ch)}
                aria-label={`Insert ${ch}`}
              >
                {ch}
              </button>
            ))}
          </div>

          <form className="answer-form" onSubmit={handleSubmit}>
            <label htmlFor="drillAnswerInput" className="sr-only">
              Type your answer
            </label>
            <input
              ref={inputRef}
              id="drillAnswerInput"
              type="text"
              className="text-input"
              value={input}
              onChange={(e) => {
                markTouch();
                setInput(e.target.value);
              }}
              placeholder={`Type full ${curriculum.meta.languageName} sentence...`}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-primary">
              Check
            </button>
          </form>

          {outcome && (
            <div
              className={`feedback-banner ${outcome.kind === 'exact' ? 'success' : 'warning'}`}
              role="status"
              aria-live="polite"
            >
              {outcome.kind === 'exact' && (
                <div className="row-between">
                  <div className="row-wrap">
                    <CheckCircle2 size={16} />
                    <strong>{curriculum.meta.praisePhrase}</strong>
                    <span className="mono">{entry.mod.pattern}</span>
                  </div>
                  <span className="mastery-tag">{outcome.velocity.label}</span>
                </div>
              )}

              {outcome.kind === 'diacritic-error' && (
                <div className="stack-sm">
                  <strong>{outcome.message}</strong>
                  <div className="diff-strip">
                    {outcome.segments.map((seg, i) =>
                      seg.status === 'diacritic-mismatch' ? (
                        <span key={i} className="diff-char-fix">
                          {seg.expectedChar ?? seg.char}
                        </span>
                      ) : (
                        <span key={i}>{seg.char}</span>
                      ),
                    )}
                  </div>
                </div>
              )}

              {outcome.kind === 'single-typo' && <strong>{outcome.message}</strong>}

              {outcome.kind === 'mismatch' && (
                <div>
                  <strong>{outcome.message}</strong> Expected pattern:{' '}
                  <span className="mono">{entry.mod.pattern}</span>
                </div>
              )}
            </div>
          )}

          <div className="row-between">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Done
            </button>
            <button
              type="button"
              id="nextMixedDrillBtn"
              className="btn btn-primary btn-sm"
              onClick={() => loadNext(entry.mod.id)}
            >
              <span>Next Contrasting Item</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      ) : (
        <p className="page-lead">No practice prompts available in this curriculum.</p>
      )}
    </Dialog>
  );
}
