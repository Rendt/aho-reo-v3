import { useEffect, useRef, useState, type FormEvent } from 'react';
import confetti from 'canvas-confetti';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lightbulb,
  Mic,
  MicOff,
  RotateCcw,
  SkipForward,
} from 'lucide-react';
import {
  isSpeechRecognitionSupported,
  playPhraseAudio,
  playPounamuChime,
  startVoiceDictation,
} from '../engine/audio';
import { gradeResponse, type GradeOutcome, type VelocityTier } from '../engine/grading';
import { getCleanToken, type CurriculumMeta, type LessonModule, type VocabItem } from '../schema/curriculum';

interface Step5PracticeProps {
  mod: LessonModule;
  meta: CurriculumMeta;
  activeVocab: VocabItem[];
  promptIdx: number;
  shouldFadeChips: boolean;
  audioMuted: boolean;
  onSelectPromptIdx: (idx: number) => void;
  onRecordResult: (
    promptId: string,
    moduleId: string,
    isCorrect: boolean,
    velocity: VelocityTier,
    t1Sec: number,
    t2Sec: number,
  ) => void;
  onGoToDrills: () => void;
  onSwitchModule: (moduleId: string) => void;
  onNotify: (msg: string, tone?: 'success' | 'warning') => void;
  nextLessonModule?: LessonModule;
}

export function Step5Practice({
  mod,
  meta,
  activeVocab,
  promptIdx,
  shouldFadeChips,
  audioMuted,
  onSelectPromptIdx,
  onRecordResult,
  onGoToDrills,
  onSwitchModule,
  onNotify,
  nextLessonModule,
}: Step5PracticeProps) {
  const prompt = mod.prompts[promptIdx] ?? mod.prompts[0];
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [manualChipOverride, setManualChipOverride] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<GradeOutcome | null>(null);
  const [completedTask, setCompletedTask] = useState(false);
  const [lastTypoAttempt, setLastTypoAttempt] = useState('');
  const [isListening, setIsListening] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const mountTimeRef = useRef<number>(0);
  const firstTouchRef = useRef<number | null>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);

  const speechSupported = isSpeechRecognitionSupported();
  const chipsHidden = manualChipOverride !== null ? manualChipOverride : shouldFadeChips;

  useEffect(() => {
    mountTimeRef.current = Date.now();
    return () => {
      stopListeningRef.current?.();
    };
  }, []);

  const markFirstTouch = () => {
    if (firstTouchRef.current === null) {
      firstTouchRef.current = Date.now();
    }
  };

  const handleInsertWord = (word: string) => {
    markFirstTouch();
    const clean = getCleanToken(word);
    setAnswer((prev) => (prev.trim() ? `${prev.trim()} ${clean}` : clean));
    inputRef.current?.focus();
  };

  const handleInsertChar = (ch: string) => {
    markFirstTouch();
    const input = inputRef.current;
    if (!input) {
      setAnswer((prev) => prev + ch);
      return;
    }
    const start = input.selectionStart ?? answer.length;
    const end = input.selectionEnd ?? start;
    const next = answer.slice(0, start) + ch + answer.slice(end);
    setAnswer(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  const handleResetInput = () => {
    setAnswer('');
    setOutcome(null);
    setLastTypoAttempt('');
    mountTimeRef.current = Date.now();
    firstTouchRef.current = null;
    inputRef.current?.focus();
  };

  const handleToggleDictation = () => {
    if (isListening) {
      stopListeningRef.current?.();
      stopListeningRef.current = null;
      setIsListening(false);
      return;
    }
    setIsListening(true);
    stopListeningRef.current = startVoiceDictation(meta.bcp47, {
      onTranscript: (text) => {
        markFirstTouch();
        setAnswer(text);
      },
      onError: (msg) => {
        onNotify(msg, 'warning');
      },
      onEnd: () => {
        setIsListening(false);
        stopListeningRef.current = null;
      },
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed) return;

    const now = Date.now();
    const t2Sec = (now - mountTimeRef.current) / 1000;
    const t1Sec = firstTouchRef.current ? (firstTouchRef.current - mountTimeRef.current) / 1000 : t2Sec;

    const allowTypoRetry = lastTypoAttempt !== trimmed;
    const result = gradeResponse(trimmed, prompt.expected, t1Sec, t2Sec, allowTypoRetry);
    setOutcome(result);

    if (result.kind === 'exact') {
      if (!completedTask) {
        onRecordResult(prompt.id, mod.id, true, result.velocity.tier, t1Sec, t2Sec);
      }
      setCompletedTask(true);
      playPounamuChime(audioMuted);
      playPhraseAudio(result.matchedExpected, meta.bcp47, audioMuted);
      try {
        const prefersReduced =
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const canDraw =
          typeof document !== 'undefined' &&
          Boolean(document.createElement('canvas').getContext?.('2d'));
        if (!prefersReduced && canDraw) {
          void confetti({ particleCount: 24, spread: 48, origin: { y: 0.8 } });
        }
      } catch {
        // Ignore confetti failures in restricted environments
      }
    } else if (result.kind === 'single-typo') {
      setLastTypoAttempt(trimmed);
    } else if (result.kind === 'mismatch') {
      onRecordResult(prompt.id, mod.id, false, result.velocity.tier, t1Sec, t2Sec);
    }
  };

  const handleSkipTask = () => {
    setAnswer(prompt.expected[0] ?? '');
    setShowAnswer(true);
    setCompletedTask(true);
    setOutcome(null);
    onNotify('Answer shown — ready when you want to continue.', 'warning');
  };

  const hasMoreTasks = promptIdx < mod.prompts.length - 1;

  return (
    <div className="stack-md">
      <div className="row-between">
        <div>
          <div className="step-eyebrow">Step 5 · Practice Building</div>
          <h2 className="step-title">Write the sentence in {meta.languageName}</h2>
        </div>
        <span className="mastery-tag">
          Task {promptIdx + 1} of {mod.prompts.length}
        </span>
      </div>

      <div className="prompt-box">
        <div className="row-between">
          <span className="prompt-situation">{prompt.situation ?? 'Translate this sentence:'}</span>
          <div className="row-wrap">
            <button
              type="button"
              id="toggleHintBtn"
              className="btn btn-secondary btn-sm"
              aria-pressed={showHint}
              onClick={() => setShowHint((v) => !v)}
            >
              <Lightbulb size={14} />
              <span>{showHint ? 'Hide hint' : 'Show hint'}</span>
            </button>
            <button
              type="button"
              id="revealAnswerBtn"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAnswer((v) => !v)}
            >
              {showAnswer ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{showAnswer ? 'Hide answer' : 'Show answer'}</span>
            </button>
            <button
              type="button"
              id="skipTaskBtn"
              className="btn btn-ghost btn-sm"
              onClick={handleSkipTask}
            >
              <SkipForward size={14} />
              <span>Skip</span>
            </button>
          </div>
        </div>

        <div className="prompt-target">“{prompt.target}”</div>

        {showHint && (
          <div id="step5PatternHint" className="prompt-hint">
            Pattern hint: {mod.pattern}
          </div>
        )}

        {showAnswer && (
          <div className="concept-box">
            <strong>Expected:</strong> <span className="mono">{prompt.expected[0]}</span>
            {prompt.expected.length > 1 && (
              <span className="vocab-meaning"> (also accepted: {prompt.expected.slice(1).join(', ')})</span>
            )}
          </div>
        )}
      </div>

      {/* Word Bank (with auto-fading at Familiar/Mastered level) */}
      <div className="stack-sm">
        <div className="row-between">
          <span className="field-label">
            {chipsHidden ? 'Independent Recall Mode' : 'Word Bank (tap words to build)'}
          </span>
          <button
            type="button"
            id="toggleWordBankBtn"
            className="btn btn-ghost btn-sm"
            onClick={() => setManualChipOverride(!chipsHidden)}
          >
            {chipsHidden ? 'Show word bank' : 'Hide word bank'}
          </button>
        </div>

        {chipsHidden ? (
          <div className="concept-box">
            Word chips are hidden because you are familiar with this lesson — typing from memory
            builds lasting recall. Tap <strong>Show word bank</strong> anytime if you want hints.
          </div>
        ) : (
          <div className="row-wrap">
            {activeVocab.map((v) => (
              <button
                key={v.word}
                type="button"
                className="word-chip"
                onClick={() => handleInsertWord(v.word)}
              >
                {v.word}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Macron / Special Characters Toolbar */}
      <div className="row-between">
        <div className="row-wrap" role="group" aria-label="Special character buttons">
          {meta.specialChars.map((ch) => (
            <button
              key={ch}
              type="button"
              className="macron-btn"
              onClick={() => handleInsertChar(ch)}
              aria-label={`Insert ${ch}`}
            >
              {ch}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleResetInput}
          disabled={!answer}
        >
          <RotateCcw size={14} />
          <span>Clear</span>
        </button>
      </div>

      {/* Answer Form */}
      <form className="answer-form" onSubmit={handleSubmit}>
        <label htmlFor="practiceAnswerInput" className="sr-only">
          Your answer in {meta.languageName}
        </label>
        <input
          ref={inputRef}
          id="practiceAnswerInput"
          type="text"
          className="text-input"
          value={answer}
          onChange={(e) => {
            markFirstTouch();
            setAnswer(e.target.value);
          }}
          placeholder={`Type your sentence in ${meta.languageName}...`}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={false}
        />

        {speechSupported && (
          <button
            type="button"
            id="voiceInputBtn"
            className={`icon-btn ${isListening ? 'btn-primary' : ''}`}
            onClick={handleToggleDictation}
            aria-pressed={isListening}
            aria-label={isListening ? 'Stop voice input' : 'Speak your answer'}
            title={isListening ? 'Stop listening' : 'Speak your answer'}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}

        <button type="submit" id="checkAnswerBtn" className="btn btn-primary">
          Check Answer
        </button>
      </form>

      {/* Rich Grading Feedback */}
      {outcome && (
        <div
          id="practiceFeedback"
          className={`feedback-banner ${outcome.kind === 'exact' ? 'success' : 'warning'}`}
          role="status"
          aria-live="polite"
        >
          {outcome.kind === 'exact' && (
            <div className="row-between">
              <div className="row-wrap">
                <CheckCircle2 size={18} aria-hidden="true" />
                <strong>{meta.praisePhrase}</strong>
                <span>Sentence verified and scheduled in your review queue.</span>
              </div>
              <span className="mastery-tag">{outcome.velocity.label}</span>
            </div>
          )}

          {outcome.kind === 'diacritic-error' && (
            <div className="stack-sm">
              <strong>{outcome.message}</strong>
              <div className="diff-strip" aria-label={`Check macrons against ${outcome.closestExpected}`}>
                {outcome.segments.map((seg, i) =>
                  seg.status === 'diacritic-mismatch' ? (
                    <span key={i} className="diff-char-fix" title={`Expected ${seg.expectedChar}`}>
                      {seg.expectedChar ?? seg.char}
                    </span>
                  ) : (
                    <span key={i}>{seg.char}</span>
                  ),
                )}
              </div>
              <div className="vocab-meaning">
                Tip: Tap the macron buttons ({meta.specialChars.join(' ')}) above to update the vowel
                and check again.
              </div>
            </div>
          )}

          {outcome.kind === 'single-typo' && (
            <div>
              <strong>{outcome.message}</strong>
            </div>
          )}

          {outcome.kind === 'mismatch' && (
            <div className="stack-sm">
              <strong>{outcome.message}</strong>
              <div>
                Pattern hint: <span className="mono">{mod.pattern}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Next Actions after Completion */}
      {completedTask && (
        <div className="panel stack-sm">
          <div className="field-label">Next Step</div>
          <div className="row-wrap">
            {hasMoreTasks ? (
              <button
                type="button"
                id="nextTaskBtn"
                className="btn btn-primary"
                onClick={() => onSelectPromptIdx(promptIdx + 1)}
              >
                <span>
                  Next Task ({promptIdx + 2} of {mod.prompts.length})
                </span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  id="proceedToDrillsBtn"
                  className="btn btn-primary"
                  onClick={onGoToDrills}
                >
                  <span>Continue to Quick Drills</span>
                  <ArrowRight size={16} />
                </button>
                {nextLessonModule && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onSwitchModule(nextLessonModule.id)}
                  >
                    <span>Jump to {nextLessonModule.title}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
