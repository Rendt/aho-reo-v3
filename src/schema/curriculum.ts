import { z } from 'zod';

export const VocabItemSchema = z.object({
  word: z.string().min(1),
  meaning: z.string().min(1),
  emoji: z.string().optional(),
  audioUrl: z.string().url().optional(),
});

export const SlotSchema = z.object({
  label: z.string().min(1),
  meaning: z.string().min(1),
  type: z.enum(['fixed', 'variable']),
});

export const DialogueTurnSchema = z.object({
  speaker: z.string().min(1),
  target: z.string().min(1),
  en: z.string().min(1),
  audioUrl: z.string().url().optional(),
});

export const ComprehensionOptionSchema = z.object({
  text: z.string().min(1),
  correct: z.boolean(),
});

export const ComprehensionCheckSchema = z.object({
  question: z.string().min(1),
  options: z.array(ComprehensionOptionSchema).min(2),
});

export const DiscourseModelSchema = z.object({
  context: z.string().optional(),
  en: z.string().min(1),
  target: z.string().min(1),
  literal: z.string().optional(),
  audioUrl: z.string().url().optional(),
  turns: z.array(DialogueTurnSchema).min(1),
  check: ComprehensionCheckSchema,
});

export const PromptItemSchema = z.object({
  id: z.string().min(1),
  situation: z.string().optional(),
  target: z.string().min(1),
  expected: z.array(z.string().min(1)).min(1),
  hint: z.string().optional(),
});

export const DrillItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['cloze', 'context-swap', 'slot-fill', 'pattern-match']),
  instruction: z.string().min(1),
  contextPrompt: z.string().min(1),
  sentenceTemplate: z.string().min(1),
  answer: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  completedSentence: z.string().min(1),
  explanation: z.string().optional(),
});

export const PathwayLinkSchema = z.object({
  label: z.string().min(1),
  target: z.string().min(1),
});

export const PackKeySchema = z.enum(['workplace', 'outside', 'community', 'social']);
export type PackKey = z.infer<typeof PackKeySchema>;

export const PacksSchema = z.object({
  workplace: z.array(VocabItemSchema).default([]),
  outside: z.array(VocabItemSchema).default([]),
  community: z.array(VocabItemSchema).default([]),
  social: z.array(VocabItemSchema).default([]),
});

export const LessonModuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tier: z.number().int().min(1),
  wahanga: z.string().min(1),
  kowae: z.string().min(1),
  canDo: z.string().min(1),
  readerRole: z.string().optional(),
  concept: z.string().min(1),
  pattern: z.string().min(1),
  slots: z.array(SlotSchema).min(1),
  vocab: z.array(VocabItemSchema).min(1),
  packs: PacksSchema,
  model: DiscourseModelSchema,
  prompts: z.array(PromptItemSchema).min(1),
  drills: z.array(DrillItemSchema).min(1),
  pathways: z.array(PathwayLinkSchema).default([]),
});

export const CurriculumMetaSchema = z.object({
  id: z.string().min(1),
  languageName: z.string().min(1),
  bcp47: z.string().min(2).default('mi-NZ'),
  baseLanguage: z.string().min(1).default('English'),
  curriculumLevel: z.string().min(1).default('Level 1 / CEFR A1'),
  author: z.string().default('Community'),
  versionDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  version: z.string().default('3.1'),
  specialChars: z.array(z.string()).default(['ā', 'ē', 'ī', 'ō', 'ū']),
  packLabels: z
    .object({
      workplace: z.string().default('Workplace'),
      outside: z.string().default('Nature & Outdoors'),
      community: z.string().default('Community'),
      social: z.string().default('Social & Family'),
    })
    .default({
      workplace: 'Workplace',
      outside: 'Nature & Outdoors',
      community: 'Community',
      social: 'Social & Family',
    }),
  praisePhrase: z.string().default('Ka rawe!'),
});

export const CurriculumSchema = z.object({
  meta: CurriculumMetaSchema,
  modules: z.array(LessonModuleSchema).min(1),
});

export type VocabItem = z.infer<typeof VocabItemSchema>;
export type SlotItem = z.infer<typeof SlotSchema>;
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;
export type PromptItem = z.infer<typeof PromptItemSchema>;
export type DrillItem = z.infer<typeof DrillItemSchema>;
export type LessonModule = z.infer<typeof LessonModuleSchema>;
export type CurriculumMeta = z.infer<typeof CurriculumMetaSchema>;
export type Curriculum = z.infer<typeof CurriculumSchema>;

export function getCleanToken(word: string): string {
  return String(word || '').split('/')[0].split('(')[0].trim();
}

export function sanitizeAndParseJSON(rawText: string): unknown {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  return JSON.parse(cleaned);
}

interface RawRecord {
  [key: string]: unknown;
}

function asArray<T = RawRecord>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

function asString(val: unknown, fallback = ''): string {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : fallback;
}

/**
 * Generates safe, grammatically coherent fallback drills for legacy v2/v3 JSON
 * imports that did not include an explicit `drills` array.
 */
function synthesizeSafeDrillsForLegacyModule(
  mod: {
    id: string;
    pattern: string;
    slots: SlotItem[];
    prompts: PromptItem[];
    vocab: VocabItem[];
  },
  allModules: Array<{ id: string; pattern: string; slots: SlotItem[] }>,
): DrillItem[] {
  const drills: DrillItem[] = [];
  const firstPrompt = mod.prompts[0];
  const expectedPhrase = firstPrompt?.expected[0] ?? '';
  const fixedSlot = mod.slots.find((s) => s.type === 'fixed');
  const marker = fixedSlot ? getCleanToken(fixedSlot.label.replace(/[[\]]/g, '')) : '';

  // 1. Marker cloze (only if the expected phrase actually begins with the marker)
  if (marker && expectedPhrase.toLowerCase().startsWith(marker.toLowerCase())) {
    const otherMarkers = Array.from(
      new Set(
        allModules
          .filter((m) => m.id !== mod.id)
          .flatMap((m) => m.slots.filter((s) => s.type === 'fixed').map((s) => getCleanToken(s.label.replace(/[[\]]/g, ''))))
          .filter((m) => m && m.toLowerCase() !== marker.toLowerCase()),
      ),
    );
    const distractors = otherMarkers.length >= 2 ? otherMarkers.slice(0, 2) : ['Ko', 'Kei te', 'Kua'].filter((x) => x.toLowerCase() !== marker.toLowerCase()).slice(0, 2);
    const clozeSentence = expectedPhrase.replace(new RegExp(`^${escapeRegExp(marker)}`, 'i'), '_____');
    drills.push({
      id: `${mod.id}_drill_cloze`,
      kind: 'cloze',
      instruction: 'Choose the missing sentence marker',
      contextPrompt: firstPrompt.target,
      sentenceTemplate: clozeSentence,
      answer: marker,
      choices: [marker, ...distractors],
      completedSentence: expectedPhrase,
      explanation: `'${marker}' anchors the pattern ${mod.pattern}.`,
    });
  }

  // 2. Pattern match across modules
  const otherPatterns = Array.from(
    new Set(allModules.filter((m) => m.id !== mod.id).map((m) => m.pattern).filter((p) => p && p !== mod.pattern)),
  );
  const patternChoices = [mod.pattern, ...otherPatterns.slice(0, 2)];
  if (patternChoices.length < 2) {
    patternChoices.push('[Subject] + [Verb]');
  }
  drills.push({
    id: `${mod.id}_drill_pattern`,
    kind: 'pattern-match',
    instruction: 'Match the sentence to its pattern',
    contextPrompt: firstPrompt?.target ?? mod.pattern,
    sentenceTemplate: expectedPhrase || mod.pattern,
    answer: mod.pattern,
    choices: patternChoices,
    completedSentence: expectedPhrase || mod.pattern,
    explanation: `This sentence follows the pattern ${mod.pattern}.`,
  });

  return drills;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes legacy v2/v3 curriculum JSON structures into v3.1 and validates strictly with Zod.
 */
export function normalizeAndValidateCurriculum(rawInput: unknown): {
  success: true;
  data: Curriculum;
} | {
  success: false;
  errors: string[];
} {
  if (!rawInput || typeof rawInput !== 'object') {
    return { success: false, errors: ['Input must be a JSON object.'] };
  }

  const root = rawInput as RawRecord;
  const source =
    root.curriculum && typeof root.curriculum === 'object' && Array.isArray((root.curriculum as RawRecord).modules)
      ? (root.curriculum as RawRecord)
      : root;

  const rawMeta = (source.meta && typeof source.meta === 'object' ? source.meta : {}) as RawRecord;
  const rawModules = asArray<RawRecord>(source.modules);

  if (rawModules.length === 0) {
    return { success: false, errors: ['Curriculum must include a non-empty "modules" array.'] };
  }

  const normalizedPreModules = rawModules.map((mod, idx) => {
    const id = asString(mod.id, `MOD_${String(idx + 1).padStart(2, '0')}`);
    const tier = typeof mod.tier === 'number' ? mod.tier : typeof mod.gate === 'number' ? mod.gate : 1;
    const title = asString(mod.title, `Lesson ${idx + 1}`);
    const pattern = asString(mod.pattern ?? mod.syntacticSlotBlueprint, '[Marker] + [Word]');

    const rawSlots = asArray<RawRecord>(mod.slots);
    const slots: SlotItem[] =
      rawSlots.length > 0
        ? rawSlots.map((s) => ({
            label: asString(s.label, '[Slot]'),
            meaning: asString(s.meaning, 'slot'),
            type: s.type === 'fixed' || (!asString(s.label).includes('[') && s.type !== 'variable') ? 'fixed' : 'variable',
          }))
        : pattern.split('+').map((part, pIdx) => ({
            label: part.trim() || '[Slot]',
            meaning: pIdx === 0 ? 'fixed marker' : 'variable slot',
            type: pIdx === 0 && !part.includes('[') ? 'fixed' : 'variable',
          }));

    const vocab: VocabItem[] = asArray<RawRecord>(mod.vocab)
      .filter((v) => v && typeof v.word === 'string' && v.word.trim().length > 0)
      .map((v) => ({
        word: asString(v.word),
        meaning: asString(v.meaning, 'vocabulary item'),
        emoji: typeof v.emoji === 'string' ? v.emoji : undefined,
        audioUrl: typeof v.audioUrl === 'string' && v.audioUrl.startsWith('http') ? v.audioUrl : undefined,
      }));

    if (vocab.length === 0) {
      vocab.push({ word: slots[0]?.label ?? 'Word', meaning: slots[0]?.meaning ?? 'item' });
    }

    const rawPacks = (mod.packs && typeof mod.packs === 'object' ? mod.packs : {}) as RawRecord;
    const mapPack = (items: unknown): VocabItem[] =>
      asArray<RawRecord>(items)
        .filter((v) => v && typeof v.word === 'string' && v.word.trim().length > 0)
        .map((v) => ({
          word: asString(v.word),
          meaning: asString(v.meaning, 'context term'),
          emoji: typeof v.emoji === 'string' ? v.emoji : undefined,
          audioUrl: typeof v.audioUrl === 'string' && v.audioUrl.startsWith('http') ? v.audioUrl : undefined,
        }));

    const packs = {
      workplace: mapPack(rawPacks.workplace),
      outside: mapPack(rawPacks.outside ?? rawPacks.taiao),
      community: mapPack(rawPacks.community ?? rawPacks.marae),
      social: mapPack(rawPacks.social ?? rawPacks.whanau),
    };

    const rawModel = (mod.model && typeof mod.model === 'object' ? mod.model : {}) as RawRecord;
    const modelTarget = asString(rawModel.target ?? rawModel.mi, vocab.slice(0, 2).map((v) => v.word).join(' '));
    const modelEn = asString(rawModel.en, title);
    const rawTurns = asArray<RawRecord>(rawModel.turns);
    const turns =
      rawTurns.length > 0
        ? rawTurns.map((t, tIdx) => ({
            speaker: asString(t.speaker, `Speaker ${tIdx + 1}`),
            target: asString(t.target ?? t.mi, modelTarget),
            en: asString(t.en, modelEn),
            audioUrl: typeof t.audioUrl === 'string' && t.audioUrl.startsWith('http') ? t.audioUrl : undefined,
          }))
        : [{ speaker: 'Speaker A', target: modelTarget, en: modelEn }];

    const rawCheck = (rawModel.check && typeof rawModel.check === 'object' ? rawModel.check : null) as RawRecord | null;
    const rawOptions = rawCheck ? asArray<RawRecord>(rawCheck.options) : [];
    const check =
      rawCheck && rawOptions.length >= 2
        ? {
            question: asString(rawCheck.question, 'Which pattern matches this dialogue?'),
            options: rawOptions.map((o) => ({ text: asString(o.text, 'Option'), correct: Boolean(o.correct) })),
          }
        : {
            question: 'Which sentence pattern anchors this dialogue?',
            options: [
              { text: pattern, correct: true },
              { text: 'Unmarked word order', correct: false },
            ],
          };

    const rawPrompts = asArray<RawRecord>(mod.prompts);
    const prompts: PromptItem[] =
      rawPrompts.length > 0
        ? rawPrompts.map((p, pIdx) => ({
            id: asString(p.id, `${id}_P${pIdx + 1}`),
            situation: typeof p.situation === 'string' ? p.situation : undefined,
            target: asString(p.target, modelEn),
            expected: asArray<string>(p.expected).filter((e) => typeof e === 'string' && e.trim().length > 0),
            hint: typeof p.hint === 'string' ? p.hint : pattern,
          }))
        : [
            {
              id: `${id}_P1`,
              target: modelEn,
              expected: [modelTarget],
              hint: pattern,
            },
          ];

    for (const p of prompts) {
      if (p.expected.length === 0) {
        p.expected = [modelTarget];
      }
    }

    return {
      rawDrills: asArray<RawRecord>(mod.drills),
      id,
      title,
      tier,
      wahanga: asString(mod.wahanga, `Group ${tier}`),
      kowae: asString(mod.kowae, `Unit ${tier}.${idx + 1}`),
      canDo: asString(mod.canDo, `Practice using ${title}.`).replace(/^🎯\s*(Learning Objective:|Objective:|Can-Do:)?\s*/i, ''),
      readerRole: typeof mod.readerRole === 'string' ? mod.readerRole : undefined,
      concept: asString(mod.concept, `Build sentences using ${pattern}.`),
      pattern,
      slots,
      vocab,
      packs,
      model: {
        context: typeof rawModel.context === 'string' ? rawModel.context : undefined,
        en: modelEn,
        target: modelTarget,
        literal: typeof rawModel.literal === 'string' ? rawModel.literal : undefined,
        audioUrl: typeof rawModel.audioUrl === 'string' && rawModel.audioUrl.startsWith('http') ? rawModel.audioUrl : undefined,
        turns,
        check,
      },
      prompts,
      pathways: asArray<RawRecord>(mod.pathways)
        .filter((pw) => pw && typeof pw.target === 'string')
        .map((pw) => ({ label: asString(pw.label, 'Next Lesson'), target: asString(pw.target) })),
    };
  });

  const modules = normalizedPreModules.map((m) => {
    const validDrills = m.rawDrills
      .map((d, dIdx) => ({
        id: asString(d.id, `${m.id}_D${dIdx + 1}`),
        kind: (['cloze', 'context-swap', 'slot-fill', 'pattern-match'].includes(String(d.kind))
          ? d.kind
          : 'cloze') as DrillItem['kind'],
        instruction: asString(d.instruction, 'Complete the sentence'),
        contextPrompt: asString(d.contextPrompt, m.prompts[0]?.target ?? m.title),
        sentenceTemplate: asString(d.sentenceTemplate, m.pattern),
        answer: asString(d.answer),
        choices: asArray<string>(d.choices).filter((c) => typeof c === 'string' && c.trim().length > 0),
        completedSentence: asString(d.completedSentence, m.prompts[0]?.expected[0] ?? m.model.target),
        explanation: typeof d.explanation === 'string' ? d.explanation : undefined,
      }))
      .filter((d) => d.answer.length > 0 && d.choices.length >= 2);

    const drills = validDrills.length > 0 ? validDrills : synthesizeSafeDrillsForLegacyModule(m, normalizedPreModules);

    const { rawDrills: _unused, ...rest } = m;
    void _unused;
    return { ...rest, drills };
  });

  const rawPackLabels = (rawMeta.packLabels && typeof rawMeta.packLabels === 'object' ? rawMeta.packLabels : {}) as RawRecord;
  const candidate = {
    meta: {
      id: asString(rawMeta.id, `AHO_${asString(rawMeta.languageName, 'CUSTOM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'CUSTOM'}`),
      languageName: asString(rawMeta.languageName ?? rawMeta.targetLanguage, 'Custom Language'),
      bcp47: asString(rawMeta.bcp47, 'mi-NZ'),
      baseLanguage: asString(rawMeta.baseLanguage, 'English'),
      curriculumLevel: asString(rawMeta.curriculumLevel, 'Level 1 / CEFR A1'),
      author: asString(rawMeta.author ?? rawMeta.creator, 'Community'),
      versionDate: asString(rawMeta.versionDate ?? rawMeta.date, new Date().toISOString().slice(0, 10)),
      version: asString(rawMeta.version, '3.1'),
      specialChars: Array.isArray(rawMeta.specialChars)
        ? rawMeta.specialChars.filter((c): c is string => typeof c === 'string' && c.length > 0)
        : ['ā', 'ē', 'ī', 'ō', 'ū'],
      packLabels: {
        workplace: asString(rawPackLabels.workplace, 'Workplace'),
        outside: asString(rawPackLabels.outside, 'Nature & Outdoors'),
        community: asString(rawPackLabels.community, 'Community'),
        social: asString(rawPackLabels.social, 'Social & Family'),
      },
      praisePhrase: asString(rawMeta.praisePhrase, 'Ka rawe!'),
    },
    modules,
  };

  const parsed = CurriculumSchema.safeParse(candidate);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return {
    success: false,
    errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
  };
}
