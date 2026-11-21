import { CheckCircle2, Info } from 'lucide-react';

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'warning';
}

interface ToastProps {
  toast: ToastMessage | null;
}

export function Toast({ toast }: ToastProps) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {toast && (
        <div className={`toast-pill ${toast.tone === 'warning' ? 'warning' : ''}`} role="status">
          {toast.tone === 'success' ? <CheckCircle2 size={16} /> : <Info size={16} />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
