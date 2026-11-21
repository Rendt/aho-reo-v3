import { z } from 'zod';
import { normalizeAndValidateCurriculum, type Curriculum } from '../schema/curriculum';

export const CatalogEntrySchema = z.object({
  id: z.string().min(1),
  languageName: z.string().min(1),
  bcp47: z.string().min(2),
  curriculumLevel: z.string().min(1),
  description: z.string().min(1),
  lessonCount: z.number().int().min(1),
  path: z.string().min(1),
  default: z.boolean().optional(),
});

export const CourseCatalogSchema = z.object({
  version: z.string().min(1),
  courses: z.array(CatalogEntrySchema).min(1),
});

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type CourseCatalog = z.infer<typeof CourseCatalogSchema>;

const CATALOG_URL =
  (import.meta.env.VITE_CATALOG_URL as string | undefined) || '/curricula/catalog.json';

/**
 * Dynamically fetches the external course catalog JSON at runtime (no hardcoded languages).
 */
export async function fetchCourseCatalog(): Promise<CatalogEntry[]> {
  try {
    const res = await fetch(CATALOG_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const raw: unknown = await res.json();
    const parsed = CourseCatalogSchema.safeParse(raw);
    return parsed.success ? parsed.data.courses : [];
  } catch {
    return [];
  }
}

/**
 * Fetches and strictly validates a curriculum JSON file from the given catalog path or URL.
 */
export async function fetchCurriculumByPath(path: string): Promise<Curriculum> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Could not load curriculum from ${path} (HTTP ${res.status}).`);
  }
  const raw: unknown = await res.json();
  const validated = normalizeAndValidateCurriculum(raw);
  if (!validated.success) {
    throw new Error(`Curriculum failed validation: ${validated.errors[0]}`);
  }
  return validated.data;
}
