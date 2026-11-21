# Aho Reo v3.1

A production-ready, offline-capable language learning PWA built with **Vite + React + TypeScript + Vanilla CSS**, **Zod** schema validation, **FSRS v5** (`ts-fsrs`) item-level spaced repetition, and **IndexedDB** (`idb`) persistence.

## Data-Driven Course Catalog (Zero Hardcoded Languages)

All courses live as standalone JSON files in [`public/curricula/`](./public/curricula/) and are registered in [`public/curricula/catalog.json`](./public/curricula/catalog.json):

- **Te Reo Māori** (`Taumata 1 · CEFR A1`) — [`public/curricula/te-reo-maori-a1.json`](./public/curricula/te-reo-maori-a1.json)
- **Deutsch (German)** (`CEFR A1`) — [`public/curricula/german-a1.json`](./public/curricula/german-a1.json)
- **Français (French)** (`CEFR A1`) — [`public/curricula/french-a1.json`](./public/curricula/french-a1.json)

To add another language, drop a validated v3.1 JSON file into `public/curricula/` and add an entry to `public/curricula/catalog.json`—no component code changes required. Learners can install and switch languages inside **Studio** while keeping separate FSRS progress per course.

## Key Features

- **6-Step Scaffolded Lesson Loop:** Overview → Sentence Pattern → Key Words (with Topic Packs) → Dialogue & Quick Check → Active Practice → Quick Drills.
- **Unified Grading & Diacritic Coaching:** Unicode NFC normalization, visual character-by-character diacritic/macron/umlaut diffing, Damerau-Levenshtein single-typo retry, and two-stage recall latency tracking.
- **Item-Level FSRS Spaced Repetition:** Schedules every sentence prompt individually, rolls up lesson mastery, auto-fades the word bank at higher mastery, guards drills against repeat-click farming, and separates daily calendar streaks from session flow.
- **Web Speech Pronunciation & Voice Detection:** Uses browser speech synthesis keyed to each course's BCP-47 locale (`mi-NZ`, `de-DE`, `fr-FR`) and displays a transparent notice if a native OS voice isn't installed.
- **Offline PWA:** Bundled icons, `manifest.webmanifest`, and Workbox service worker precaching the app and course JSON library.
- **Secure AI Proxy:** [`api/generate-curriculum.ts`](./api/generate-curriculum.ts) keeps `GEMINI_API_KEY` server-side, enforces rate limiting, and uses Gemini `responseSchema` for valid v3.1 JSON output.

## Commands

```bash
npm install
npm run dev      # Start local dev server
npm test         # Run Vitest unit & UI integration tests
npm run lint     # Run oxlint
npm run build    # Type-check & build production PWA bundle
```

## Deploying (Vercel / Cloudflare Pages)

1. Import this repository into Vercel or Cloudflare Pages (`npm run build`, output directory `dist`).
2. *(Optional, for in-app AI course generation)* Add `GEMINI_API_KEY` as a server-side environment variable. If hosting the API proxy separately, set `VITE_AI_PROXY_URL` at build time.
