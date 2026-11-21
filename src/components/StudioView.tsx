import { useState, type ChangeEvent } from 'react';
import {
  ClipboardCopy,
  Download,
  FileJson,
  FolderOpen,
  Globe,
  NotebookPen,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { CatalogEntry } from '../data/catalog';
import {
  normalizeAndValidateCurriculum,
  sanitizeAndParseJSON,
  type Curriculum,
} from '../schema/curriculum';
import { Dialog } from './Dialog';

interface StudioViewProps {
  catalog: CatalogEntry[];
  curricula: Curriculum[];
  activeCurriculum: Curriculum | null;
  notes: string;
  onInstallFromCatalog: (entry: CatalogEntry) => void;
  onSelectCurriculum: (curriculumId: string) => void;
  onInstallCurriculum: (curriculum: Curriculum) => void;
  onDeleteCurriculum: (curriculumId: string) => void;
  onSaveNotes: (notes: string) => void;
  onFactoryReset: () => void;
  onNotify: (msg: string, tone?: 'success' | 'warning') => void;
}

const AI_PROXY_ENDPOINT =
  (import.meta.env.VITE_AI_PROXY_URL as string | undefined) || '/api/generate-curriculum';

export function StudioView({
  catalog,
  curricula,
  activeCurriculum,
  notes,
  onInstallFromCatalog,
  onSelectCurriculum,
  onInstallCurriculum,
  onDeleteCurriculum,
  onSaveNotes,
  onFactoryReset,
  onNotify,
}: StudioViewProps) {
  const [targetLang, setTargetLang] = useState('Gaeilge (Irish)');
  const [baseLang, setBaseLang] = useState('English');
  const [level, setLevel] = useState('CEFR A1 Beginner');
  const [domain, setDomain] = useState('Everyday life & community');
  const [compiledPrompt, setCompiledPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [jsonDraft, setJsonDraft] = useState(() =>
    activeCurriculum ? JSON.stringify(activeCurriculum, null, 2) : '',
  );
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [resetOpen, setResetOpen] = useState(false);

  const distinctVocabCount = (() => {
    if (!activeCurriculum) return 0;
    const words = new Set<string>();
    for (const m of activeCurriculum.modules) {
      for (const v of m.vocab) words.add(v.word.trim().toLowerCase());
      for (const list of Object.values(m.packs)) {
        for (const v of list) words.add(v.word.trim().toLowerCase());
      }
    }
    return words.size;
  })();

  const totalPrompts = activeCurriculum
    ? activeCurriculum.modules.reduce((acc, m) => acc + m.prompts.length, 0)
    : 0;

  const handleExportJson = () => {
    if (!activeCurriculum) return;
    const safeLang = activeCurriculum.meta.languageName
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const filename = `AhoReo_${safeLang || 'Curriculum'}_${activeCurriculum.meta.versionDate}.json`;
    const blob = new Blob([JSON.stringify(activeCurriculum, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotify(`Exported ${filename}`);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setJsonDraft(text);
      applyJsonText(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyJsonText = (rawText: string) => {
    try {
      const parsed = sanitizeAndParseJSON(rawText);
      const validated = normalizeAndValidateCurriculum(parsed);
      if (!validated.success) {
        setJsonErrors(validated.errors);
        onNotify('Curriculum JSON failed validation. See details below.', 'warning');
        return;
      }
      setJsonErrors([]);
      onInstallCurriculum(validated.data);
      onNotify(
        `Loaded ${validated.data.meta.languageName} (${validated.data.modules.length} lessons).`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid JSON syntax';
      setJsonErrors([message]);
      onNotify(`JSON parse error: ${message}`, 'warning');
    }
  };

  const buildExternalPrompt = (): string => {
    return [
      `Generate a complete, authentic Aho Reo v3.1 JSON curriculum for learning "${targetLang}" (Base language: ${baseLang}, Level: ${level}, Domain: ${domain}).`,
      'Requirements:',
      '1. Return ONLY valid raw JSON (no markdown code fences) with top-level "meta" and "modules" keys.',
      '2. Include 8 to 12 lessons organized across 4 tiers (tier 1 to 4).',
      '3. Every lesson must include: id, title, tier, wahanga, kowae, canDo, concept, pattern, slots (fixed/variable), vocab (at least 6 items), packs (workplace, outside, community, social), model (turns + check), prompts (at least 2 items with id, target, expected array, hint), and drills (4 explicit items: cloze, context-swap, slot-fill, pattern-match).',
      '4. Every sentence, dialogue turn, prompt expected answer, and drill must be natural, grammatically accurate target language with correct diacritics.',
    ].join('\n');
  };

  const handleCopyPrompt = async () => {
    const text = buildExternalPrompt();
    setCompiledPrompt(text);
    try {
      await navigator.clipboard.writeText(text);
      onNotify('Curriculum prompt copied to clipboard!');
    } catch {
      onNotify('Prompt generated below — select and copy manually.', 'warning');
    }
  };

  const handleGenerateViaProxy = async () => {
    setIsGenerating(true);
    setAiError(null);
    try {
      const res = await fetch(AI_PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: targetLang,
          baseLanguage: baseLang,
          level,
          domain,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        curriculum?: unknown;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          payload.error ||
            `AI proxy returned HTTP ${res.status}. Configure GEMINI_API_KEY on your server or use "Copy Prompt" to generate externally.`,
        );
      }
      const validated = normalizeAndValidateCurriculum(payload.curriculum);
      if (!validated.success) {
        throw new Error(`Generated curriculum failed schema validation: ${validated.errors[0]}`);
      }
      onInstallCurriculum(validated.data);
      onNotify(`Generated & switched to ${validated.data.meta.languageName}!`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'AI generation proxy is not reachable in this environment.';
      setAiError(message);
      onNotify('AI proxy unavailable — see Studio for details.', 'warning');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInstallCatalogClick = async (entry: CatalogEntry) => {
    setInstallingId(entry.id);
    try {
      await Promise.resolve(onInstallFromCatalog(entry));
    } finally {
      setInstallingId(null);
    }
  };

  const installedIds = new Set(curricula.map((c) => c.meta.id));

  return (
    <div className="stack-lg">
      {/* External Course Catalog (loaded dynamically from /curricula/catalog.json) */}
      <section className="panel stack-md">
        <div className="row-between">
          <div>
            <h1 className="page-heading">Curriculum Studio</h1>
            <p className="page-lead">
              Install data-driven courses from the external catalog or import your own JSON files.
              Switching languages preserves your progress for each course.
            </p>
          </div>
          {activeCurriculum && (
            <span className="mastery-tag mono">{activeCurriculum.meta.id}</span>
          )}
        </div>

        {catalog.length > 0 && (
          <div className="stack-sm">
            <div className="row-between">
              <span className="field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Globe size={15} />
                <span>Course Library ({catalog.length} external JSON packs)</span>
              </span>
              <span className="vocab-meaning">Loaded from catalog.json</span>
            </div>

            {catalog.map((entry) => {
              const isInstalled = installedIds.has(entry.id);
              const isCurrent = activeCurriculum?.meta.id === entry.id;
              return (
                <div key={entry.id} className="list-item">
                  <div>
                    <strong>{entry.languageName}</strong>
                    <div className="vocab-meaning">
                      {entry.curriculumLevel} · {entry.lessonCount} lessons · {entry.bcp47}
                    </div>
                    <div className="vocab-meaning" style={{ marginTop: 2 }}>
                      {entry.description}
                    </div>
                  </div>
                  <div className="row-wrap" style={{ flexShrink: 0 }}>
                    {isCurrent ? (
                      <span className="mastery-tag" data-level={3}>
                        Active
                      </span>
                    ) : isInstalled ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => onSelectCurriculum(entry.id)}
                      >
                        Switch
                      </button>
                    ) : (
                      <button
                        type="button"
                        id={`installCourse_${entry.id}`}
                        className="btn btn-secondary btn-sm"
                        disabled={installingId === entry.id}
                        onClick={() => void handleInstallCatalogClick(entry)}
                      >
                        <Download size={14} />
                        <span>
                          {installingId === entry.id ? 'Installing...' : 'Install & Switch'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Installed Courses (including any custom/imported ones not in catalog) */}
        {curricula.length > 0 && (
          <div className="stack-sm">
            <span className="field-label">Installed on This Device ({curricula.length})</span>
            {curricula.map((course) => {
              const isCurrent = course.meta.id === activeCurriculum?.meta.id;
              return (
                <div key={course.meta.id} className="list-item">
                  <div>
                    <strong>{course.meta.languageName}</strong>
                    <div className="vocab-meaning">
                      {course.meta.curriculumLevel} · {course.modules.length} lessons ·{' '}
                      {course.meta.bcp47}
                    </div>
                  </div>
                  <div className="row-wrap">
                    {isCurrent ? (
                      <span className="mastery-tag" data-level={3}>
                        Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => onSelectCurriculum(course.meta.id)}
                      >
                        Switch
                      </button>
                    )}
                    {curricula.length > 1 && (
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => onDeleteCurriculum(course.meta.id)}
                        aria-label={`Remove ${course.meta.languageName}`}
                        title="Remove course"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Active Course Summary */}
        {activeCurriculum && (
          <div className="meta-grid">
            <div className="meta-tile">
              <div className="meta-label">Language</div>
              <div className="meta-value">{activeCurriculum.meta.languageName}</div>
            </div>
            <div className="meta-tile">
              <div className="meta-label">Lessons</div>
              <div className="meta-value">{activeCurriculum.modules.length}</div>
            </div>
            <div className="meta-tile">
              <div className="meta-label">Distinct Words</div>
              <div className="meta-value">{distinctVocabCount}</div>
            </div>
            <div className="meta-tile">
              <div className="meta-label">Practice Tasks</div>
              <div className="meta-value">{totalPrompts}</div>
            </div>
          </div>
        )}

        <div className="row-wrap">
          {activeCurriculum && (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleExportJson}>
              <Download size={15} />
              <span>Export JSON</span>
            </button>
          )}

          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            <FolderOpen size={15} />
            <span>Import JSON File</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
        </div>
      </section>

      {/* AI Curriculum Generator (Server-Side Proxy + External Prompt Builder) */}
      <section className="panel stack-md">
        <div>
          <h2
            className="step-title"
            style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Sparkles size={18} />
            <span>Create a New Language Course</span>
          </h2>
          <p className="vocab-meaning">
            Generate via your configured backend proxy (<code>{AI_PROXY_ENDPOINT}</code>) with
            server-side Gemini schema validation, or copy the prompt to use with any AI assistant
            and import the JSON below.
          </p>
        </div>

        <div className="meta-grid">
          <div className="field-group">
            <label htmlFor="studioTargetLang" className="field-label">
              Target Language
            </label>
            <input
              id="studioTargetLang"
              type="text"
              className="text-input"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="studioBaseLang" className="field-label">
              Base Language
            </label>
            <input
              id="studioBaseLang"
              type="text"
              className="text-input"
              value={baseLang}
              onChange={(e) => setBaseLang(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="studioLevel" className="field-label">
              Level
            </label>
            <input
              id="studioLevel"
              type="text"
              className="text-input"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="studioDomain" className="field-label">
              Everyday Context
            </label>
            <input
              id="studioDomain"
              type="text"
              className="text-input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>
        </div>

        <div className="row-wrap">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleGenerateViaProxy}
            disabled={isGenerating}
          >
            <Wand2 size={15} />
            <span>{isGenerating ? 'Generating...' : 'Generate via Server Proxy'}</span>
          </button>

          <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyPrompt}>
            <ClipboardCopy size={15} />
            <span>Copy AI Prompt</span>
          </button>
        </div>

        {aiError && (
          <div className="feedback-banner warning" role="alert">
            <strong>Server generation unavailable:</strong> {aiError}
          </div>
        )}

        {compiledPrompt && (
          <div className="field-group">
            <label htmlFor="compiledPromptBox" className="field-label">
              Compiled Prompt (paste into your AI tool, then import the JSON below)
            </label>
            <textarea
              id="compiledPromptBox"
              className="textarea-input mono"
              rows={5}
              readOnly
              value={compiledPrompt}
            />
          </div>
        )}
      </section>

      {/* Study Notes */}
      <section className="panel stack-sm">
        <div className="row-between">
          <h2
            className="step-title"
            style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <NotebookPen size={17} />
            <span>Study Notes</span>
          </h2>
          <span className="vocab-meaning">Saved automatically to IndexedDB</span>
        </div>
        <label htmlFor="studyNotesTextarea" className="sr-only">
          Personal study notes
        </label>
        <textarea
          id="studyNotesTextarea"
          className="textarea-input"
          rows={5}
          value={notes}
          onChange={(e) => onSaveNotes(e.target.value)}
          placeholder="Jot down vocabulary reminders, pronunciation tips, or draft lesson ideas..."
        />
      </section>

      {/* Advanced JSON Editor & Factory Reset */}
      <details className="details-box">
        <summary className="details-summary">
          <span className="row-wrap">
            <FileJson size={17} />
            <span>Advanced Curriculum JSON Editor & Reset</span>
          </span>
          <span className="vocab-meaning">Zod v3.1 validated</span>
        </summary>

        <div className="stack-md" style={{ marginTop: 14 }}>
          <label htmlFor="jsonEditorTextarea" className="field-label">
            Edit or paste v3.1 (or legacy v3.0) curriculum JSON
          </label>
          <textarea
            id="jsonEditorTextarea"
            className="textarea-input mono"
            rows={12}
            spellCheck={false}
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
          />

          {jsonErrors.length > 0 && (
            <div className="feedback-banner warning" role="alert">
              <strong>Validation issues:</strong>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {jsonErrors.slice(0, 6).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="row-between">
            <button
              type="button"
              id="applyJsonBtn"
              className="btn btn-primary btn-sm"
              onClick={() => applyJsonText(jsonDraft)}
            >
              Validate & Apply JSON
            </button>

            <button
              type="button"
              id="openResetDialogBtn"
              className="btn btn-danger btn-sm"
              onClick={() => setResetOpen(true)}
            >
              Factory Reset App
            </button>
          </div>
        </div>
      </details>

      <Dialog
        id="factoryResetDialog"
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all local data?"
      >
        <p className="page-lead">
          This clears all saved progress, installed courses, and study notes from IndexedDB and
          reloads the default course from the external catalog.
        </p>
        <div className="row-between">
          <button type="button" className="btn btn-secondary" onClick={() => setResetOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            id="confirmFactoryResetBtn"
            className="btn btn-danger"
            onClick={() => {
              setResetOpen(false);
              onFactoryReset();
            }}
          >
            Confirm Reset
          </button>
        </div>
      </Dialog>
    </div>
  );
}
