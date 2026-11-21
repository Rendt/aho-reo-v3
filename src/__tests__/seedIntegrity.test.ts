import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CourseCatalogSchema } from '../data/catalog';
import { CurriculumSchema, type Curriculum } from '../schema/curriculum';

const PUBLIC_DIR = resolve(process.cwd(), 'public');

function loadPublicJson<T>(relativePath: string): T {
  const fullPath = resolve(PUBLIC_DIR, relativePath.replace(/^\//, ''));
  return JSON.parse(readFileSync(fullPath, 'utf-8')) as T;
}

describe('external course catalog & curriculum JSON integrity', () => {
  const rawCatalog = loadPublicJson<unknown>('/curricula/catalog.json');
  const catalogResult = CourseCatalogSchema.safeParse(rawCatalog);

  it('validates public/curricula/catalog.json and includes Māori, German, and French', () => {
    expect(catalogResult.success).toBe(true);
    if (!catalogResult.success) return;

    const ids = catalogResult.data.courses.map((c) => c.id);
    expect(ids).toContain('AHO_MRA_TAUMATA_1');
    expect(ids).toContain('AHO_DEU_A1');
    expect(ids).toContain('AHO_FRA_A1');
  });

  if (catalogResult.success) {
    for (const entry of catalogResult.data.courses) {
      describe(`${entry.languageName} (${entry.path})`, () => {
        const rawCourse = loadPublicJson<unknown>(entry.path);
        const parsed = CurriculumSchema.safeParse(rawCourse);

        it('passes strict Zod v3.1 schema validation and matches catalog metadata', () => {
          expect(parsed.success).toBe(true);
          if (!parsed.success) return;
          expect(parsed.data.meta.id).toBe(entry.id);
          expect(parsed.data.meta.bcp47).toBe(entry.bcp47);
          expect(parsed.data.modules).toHaveLength(entry.lessonCount);
        });

        it('spans 4 progressive tiers with >100 distinct vocabulary items', () => {
          expect(parsed.success).toBe(true);
          if (!parsed.success) return;
          const course: Curriculum = parsed.data;

          const tiers = new Set(course.modules.map((m) => m.tier));
          expect(Array.from(tiers).sort()).toEqual([1, 2, 3, 4]);

          const vocab = new Set<string>();
          for (const m of course.modules) {
            for (const v of m.vocab) vocab.add(v.word.trim().toLowerCase());
            for (const list of Object.values(m.packs)) {
              for (const v of list) vocab.add(v.word.trim().toLowerCase());
            }
          }
          expect(vocab.size).toBeGreaterThanOrEqual(100);
        });

        it('has 4 valid drills per lesson and pathways resolving to real lessons', () => {
          expect(parsed.success).toBe(true);
          if (!parsed.success) return;
          const course: Curriculum = parsed.data;

          const ids = new Set(course.modules.map((m) => m.id));
          const seenPromptIds = new Set<string>();
          const seenDrillIds = new Set<string>();

          for (const m of course.modules) {
            expect(m.drills.length).toBe(4);
            for (const d of m.drills) {
              expect(seenDrillIds.has(d.id)).toBe(false);
              seenDrillIds.add(d.id);
              expect(d.choices).toContain(d.answer);
              expect(d.completedSentence.length).toBeGreaterThan(2);
            }
            for (const p of m.prompts) {
              expect(seenPromptIds.has(p.id)).toBe(false);
              seenPromptIds.add(p.id);
              expect(p.expected.length).toBeGreaterThanOrEqual(1);
            }
            for (const pw of m.pathways) {
              expect(ids.has(pw.target)).toBe(true);
            }
          }
        });
      });
    }
  }
});
