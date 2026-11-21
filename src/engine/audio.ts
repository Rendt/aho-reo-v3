export interface VoiceAvailability {
  supported: boolean;
  hasExactLangVoice: boolean;
  matchedVoiceName: string | null;
}

let audioCtx: AudioContext | null = null;
let currentHtmlAudio: HTMLAudioElement | null = null;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function playPounamuChime(muted: boolean): void {
  if (muted) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.045 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.045 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.5);
    });
  } catch {
    // Ignore autoplay errors
  }
}

/**
 * Checks whether the user's browser has a native TTS voice for the target BCP-47 language
 * (e.g. mi-NZ for Te Reo Māori) so learners get transparent guidance instead of silent English fallback.
 */
export function checkVoiceAvailability(bcp47: string): VoiceAvailability {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { supported: false, hasExactLangVoice: false, matchedVoiceName: null };
  }
  const voices = window.speechSynthesis.getVoices();
  const baseLang = bcp47.toLowerCase().split('-')[0];
  const exact = voices.find((v) => v.lang.toLowerCase() === bcp47.toLowerCase());
  const prefix = exact ?? voices.find((v) => v.lang.toLowerCase().startsWith(`${baseLang}-`) || v.lang.toLowerCase() === baseLang);
  return {
    supported: true,
    hasExactLangVoice: Boolean(prefix),
    matchedVoiceName: prefix ? prefix.name : null,
  };
}

/**
 * Plays a curated audioUrl if supplied (native-speaker recording), otherwise falls back
 * cleanly to Web Speech Synthesis.
 */
export function playPhraseAudio(
  text: string,
  bcp47: string,
  muted: boolean,
  audioUrl?: string,
): void {
  if (muted) return;

  if (currentHtmlAudio) {
    currentHtmlAudio.pause();
    currentHtmlAudio = null;
  }

  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      currentHtmlAudio = audio;
      void audio.play().catch(() => {
        speakViaWebSpeech(text, bcp47);
      });
      return;
    } catch {
      // Fall through to Web Speech
    }
  }

  speakViaWebSpeech(text, bcp47);
}

function speakViaWebSpeech(text: string, bcp47: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = bcp47;
    utter.rate = 0.9;

    const voices = window.speechSynthesis.getVoices();
    const baseLang = bcp47.toLowerCase().split('-')[0];
    const match =
      voices.find((v) => v.lang.toLowerCase() === bcp47.toLowerCase()) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(baseLang));
    if (match) {
      utter.voice = match;
    }

    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore speech synthesis errors
  }
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startVoiceDictation(
  bcp47: string,
  callbacks: {
    onTranscript: (transcript: string) => void;
    onEnd: () => void;
    onError: (message: string) => void;
  },
): (() => void) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) {
    callbacks.onError('Voice dictation is not supported in this browser.');
    callbacks.onEnd();
    return null;
  }

  try {
    const rec = new Ctor();
    rec.lang = bcp47;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) callbacks.onTranscript(transcript);
    };
    rec.onerror = (event) => {
      const friendly =
        event.error === 'not-allowed'
          ? 'Microphone access was denied.'
          : event.error === 'no-speech'
            ? 'No speech detected. Try speaking again.'
            : `Voice recognition stopped (${event.error}).`;
      callbacks.onError(friendly);
    };
    rec.onend = () => {
      callbacks.onEnd();
    };
    rec.start();
    return () => {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    };
  } catch {
    callbacks.onError('Unable to start microphone input.');
    callbacks.onEnd();
    return null;
  }
}
