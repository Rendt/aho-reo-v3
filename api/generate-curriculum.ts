/**
 * Serverless AI Curriculum Proxy (Vercel / Cloudflare Pages / Edge Runtime compatible).
 *
 * Keeps GEMINI_API_KEY strictly server-side, applies basic per-IP rate limiting,
 * and enforces Gemini's structured JSON output via responseMimeType + responseSchema.
 */

interface GenerateRequestBody {
  targetLanguage?: string;
  baseLanguage?: string;
  level?: string;
  domain?: string;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 6;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

const CURRICULUM_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: ['meta', 'modules'],
  properties: {
    meta: {
      type: 'OBJECT',
      required: ['id', 'languageName', 'bcp47', 'baseLanguage', 'curriculumLevel', 'specialChars', 'praisePhrase'],
      properties: {
        id: { type: 'STRING' },
        languageName: { type: 'STRING' },
        bcp47: { type: 'STRING' },
        baseLanguage: { type: 'STRING' },
        curriculumLevel: { type: 'STRING' },
        author: { type: 'STRING' },
        version: { type: 'STRING' },
        specialChars: { type: 'ARRAY', items: { type: 'STRING' } },
        praisePhrase: { type: 'STRING' },
      },
    },
    modules: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: [
          'id',
          'title',
          'tier',
          'wahanga',
          'kowae',
          'canDo',
          'concept',
          'pattern',
          'slots',
          'vocab',
          'packs',
          'model',
          'prompts',
          'drills',
        ],
        properties: {
          id: { type: 'STRING' },
          title: { type: 'STRING' },
          tier: { type: 'INTEGER' },
          wahanga: { type: 'STRING' },
          kowae: { type: 'STRING' },
          canDo: { type: 'STRING' },
          concept: { type: 'STRING' },
          pattern: { type: 'STRING' },
          slots: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['label', 'meaning', 'type'],
              properties: {
                label: { type: 'STRING' },
                meaning: { type: 'STRING' },
                type: { type: 'STRING', enum: ['fixed', 'variable'] },
              },
            },
          },
          vocab: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['word', 'meaning'],
              properties: {
                word: { type: 'STRING' },
                meaning: { type: 'STRING' },
                emoji: { type: 'STRING' },
              },
            },
          },
          packs: {
            type: 'OBJECT',
            properties: {
              workplace: { type: 'ARRAY', items: { type: 'OBJECT', properties: { word: { type: 'STRING' }, meaning: { type: 'STRING' }, emoji: { type: 'STRING' } } } },
              outside: { type: 'ARRAY', items: { type: 'OBJECT', properties: { word: { type: 'STRING' }, meaning: { type: 'STRING' }, emoji: { type: 'STRING' } } } },
              community: { type: 'ARRAY', items: { type: 'OBJECT', properties: { word: { type: 'STRING' }, meaning: { type: 'STRING' }, emoji: { type: 'STRING' } } } },
              social: { type: 'ARRAY', items: { type: 'OBJECT', properties: { word: { type: 'STRING' }, meaning: { type: 'STRING' }, emoji: { type: 'STRING' } } } },
            },
          },
          model: {
            type: 'OBJECT',
            required: ['en', 'target', 'turns', 'check'],
            properties: {
              context: { type: 'STRING' },
              en: { type: 'STRING' },
              target: { type: 'STRING' },
              literal: { type: 'STRING' },
              turns: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  required: ['speaker', 'target', 'en'],
                  properties: {
                    speaker: { type: 'STRING' },
                    target: { type: 'STRING' },
                    en: { type: 'STRING' },
                  },
                },
              },
              check: {
                type: 'OBJECT',
                required: ['question', 'options'],
                properties: {
                  question: { type: 'STRING' },
                  options: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      required: ['text', 'correct'],
                      properties: {
                        text: { type: 'STRING' },
                        correct: { type: 'BOOLEAN' },
                      },
                    },
                  },
                },
              },
            },
          },
          prompts: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['id', 'target', 'expected'],
              properties: {
                id: { type: 'STRING' },
                situation: { type: 'STRING' },
                target: { type: 'STRING' },
                expected: { type: 'ARRAY', items: { type: 'STRING' } },
                hint: { type: 'STRING' },
              },
            },
          },
          drills: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['id', 'kind', 'instruction', 'contextPrompt', 'sentenceTemplate', 'answer', 'choices', 'completedSentence'],
              properties: {
                id: { type: 'STRING' },
                kind: { type: 'STRING', enum: ['cloze', 'context-swap', 'slot-fill', 'pattern-match'] },
                instruction: { type: 'STRING' },
                contextPrompt: { type: 'STRING' },
                sentenceTemplate: { type: 'STRING' },
                answer: { type: 'STRING' },
                choices: { type: 'ARRAY', items: { type: 'STRING' } },
                completedSentence: { type: 'STRING' },
                explanation: { type: 'STRING' },
              },
            },
          },
        },
      },
    },
  },
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return Response.json(
      { error: 'Rate limit exceeded. Please wait a minute before generating another curriculum.' },
      { status: 429 },
    );
  }

  const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || '';
  if (!apiKey) {
    return Response.json(
      { error: 'Server GEMINI_API_KEY is not configured.' },
      { status: 503 },
    );
  }

  let body: GenerateRequestBody;
  try {
    body = (await req.json()) as GenerateRequestBody;
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const targetLanguage = String(body.targetLanguage || '').trim().slice(0, 80);
  const baseLanguage = String(body.baseLanguage || 'English').trim().slice(0, 80);
  const level = String(body.level || 'CEFR A1 Beginner').trim().slice(0, 80);
  const domain = String(body.domain || 'Everyday life & workplace').trim().slice(0, 140);

  if (!targetLanguage) {
    return Response.json({ error: 'targetLanguage is required.' }, { status: 400 });
  }

  const prompt = [
    `Create an authentic, linguistically accurate Aho Reo v3.1 JSON curriculum for learning "${targetLanguage}" (base language: ${baseLanguage}, level: ${level}, domain: ${domain}).`,
    'Include 4 progressive groups (tier 1 to 4) with 2 to 3 lessons each (8 to 12 lessons total).',
    'Every sentence, dialogue turn, prompt expected answer, and drill must be natural, grammatically accurate target language with proper diacritics/orthography.',
    'Each lesson must include at least 6 vocab items, 4 topic packs (workplace, outside, community, social), a 2-turn dialogue with comprehension check, 2 practice prompts, and 4 explicit drills (cloze, context-swap, slot-fill, pattern-match) where answer is always one of choices.',
  ].join('\n');

  try {
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: CURRICULUM_RESPONSE_SCHEMA,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      return Response.json(
        { error: `Upstream Gemini API error (${geminiRes.status})`, detail: detail.slice(0, 300) },
        { status: 502 },
      );
    }

    const payload = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawJson = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return Response.json({ error: 'Gemini returned an empty response.' }, { status: 502 });
    }

    const curriculum = JSON.parse(rawJson);
    return Response.json({ curriculum }, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    );
  }
}
