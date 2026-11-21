import { BookOpen, CheckCircle2, Sparkles } from 'lucide-react';
import { Dialog } from './Dialog';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  languageName: string;
}

export function OnboardingModal({ open, onClose, languageName }: OnboardingModalProps) {
  return (
    <Dialog
      id="onboardingDialog"
      open={open}
      onClose={onClose}
      title={`Welcome to Aho Reo (${languageName})`}
      icon={<Sparkles size={18} />}
    >
      <p className="page-lead">
        Build natural sentences step by step using reusable patterns, macron coaching, and adaptive
        spaced repetition.
      </p>

      <div className="stack-sm">
        <div className="list-item">
          <div>
            <strong>1. Learn each pattern in 6 short steps</strong>
            <div className="vocab-meaning">
              Start with the pattern and key words, listen to a real dialogue, then build and type
              sentences yourself.
            </div>
          </div>
          <BookOpen size={18} aria-hidden="true" />
        </div>

        <div className="list-item">
          <div>
            <strong>2. Tap the macron bar anytime</strong>
            <div className="vocab-meaning">
              Use the clickable ā ē ī ō ū buttons while typing. If you miss a macron, Aho Reo
              highlights the exact vowel so you can fix it immediately.
            </div>
          </div>
          <CheckCircle2 size={18} aria-hidden="true" />
        </div>

        <div className="list-item">
          <div>
            <strong>3. Adaptive Review (FSRS)</strong>
            <div className="vocab-meaning">
              Each sentence you practice is scheduled individually so tricky patterns return sooner
              and mastered ones fade into long-term memory.
            </div>
          </div>
        </div>
      </div>

      <div className="row-between">
        <span className="vocab-meaning">All progress saves automatically offline on this device.</span>
        <button type="button" id="onboardingStartBtn" className="btn btn-primary" onClick={onClose}>
          Start Learning
        </button>
      </div>
    </Dialog>
  );
}
