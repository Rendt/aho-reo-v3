import { describe, expect, it } from 'vitest';
import { normalizeAndValidateCurriculum, sanitizeAndParseJSON } from '../schema/curriculum';

describe('curriculum schema & legacy migrator', () => {
  it('strips markdown fences and trailing commas cleanly', () => {
    const raw = '```json\n{"meta":{"id":"TEST",},"modules":[],}\n```';
    const parsed = sanitizeAndParseJSON(raw) as { meta: { id: string } };
    expect(parsed.meta.id).toBe('TEST');
  });

  it('migrates legacy v3.0 JSON without explicit drills into valid v3.1', () => {
    const legacyV3 = {
      meta: {
        id: 'LEGACY_ES',
        languageName: 'Spanish',
        bcp47: 'es-ES',
        specialChars: ['á', 'é', 'í', 'ó', 'ú', 'ñ'],
      },
      modules: [
        {
          id: 'ES_01',
          title: 'Identity',
          gate: 1,
          pattern: 'Soy + [Nombre]',
          vocab: [{ word: 'Soy', meaning: 'I am' }, { word: 'Ana', meaning: 'Ana' }],
          model: {
            en: 'I am Ana.',
            target: 'Soy Ana.',
            turns: [{ speaker: 'A', target: 'Soy Ana.', en: 'I am Ana.' }],
          },
          prompts: [{ target: 'I am Ana.', expected: ['Soy Ana'] }],
        },
      ],
    };

    const res = normalizeAndValidateCurriculum(legacyV3);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.modules[0].drills.length).toBeGreaterThanOrEqual(1);
      expect(res.data.modules[0].prompts[0].id).toBe('ES_01_P1');
      // Ensure synthesized cloze does NOT inject hardcoded Māori 'ahau'
      for (const drill of res.data.modules[0].drills) {
        expect(drill.sentenceTemplate).not.toContain('ahau');
      }
    }
  });

  it('rejects empty or malformed payloads with descriptive errors', () => {
    const bad = normalizeAndValidateCurriculum({ meta: {}, modules: [] });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.errors[0]).toMatch(/non-empty "modules"/i);
    }
  });
});
