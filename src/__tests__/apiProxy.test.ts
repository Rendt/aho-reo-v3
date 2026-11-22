import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../../api/generate-curriculum';

describe('api/generate-curriculum', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns 405 for GET requests', async () => {
    const res = GET();
    expect(res.status).toBe(405);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Method not allowed/i);
  });

  it('returns 503 when GEMINI_API_KEY is missing', async () => {
    const req = new Request('https://example.com/api/generate-curriculum', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.0.1',
      },
      body: JSON.stringify({ targetLanguage: 'Maori' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('GEMINI_API_KEY');
  });

  it('returns 400 when targetLanguage is missing', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const req = new Request('https://example.com/api/generate-curriculum', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.0.2',
      },
      body: JSON.stringify({ baseLanguage: 'English' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('targetLanguage');
  });

  it('returns 502 with clear message on MAX_TOKENS truncation', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'MAX_TOKENS',
              content: { parts: [{ text: '{"meta": {' }] },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const req = new Request('https://example.com/api/generate-curriculum', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.0.3',
      },
      body: JSON.stringify({
        targetLanguage: 'Maori',
        baseLanguage: 'English',
        level: 'Intermediate with 1000+ vocab',
        domain: 'Everyday life & community',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('MAX_TOKENS');
  });

  it('returns 200 with parsed curriculum on successful Gemini response', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const mockCurriculum = {
      meta: { id: 'mi_intermediate', languageName: 'Te Reo Māori' },
      modules: [],
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify(mockCurriculum) }] },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const req = new Request('https://example.com/api/generate-curriculum', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.0.4',
      },
      body: JSON.stringify({
        targetLanguage: 'Maori',
        baseLanguage: 'English',
        level: 'Intermediate',
        domain: 'Everyday life & community',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { curriculum: typeof mockCurriculum };
    expect(body.curriculum).toEqual(mockCurriculum);
  });
});
