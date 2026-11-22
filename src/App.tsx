import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, RotateCw, Sparkles } from 'lucide-react';
import {
  fetchCourseCatalog,
  fetchCurriculumByPath,
  type CatalogEntry,
} from './data/catalog';
import { playPounamuChime } from './engine/audio';
import type { VelocityTier } from './engine/grading';
import {
  computeDailyStreak,
  createInitialProgress,
  getDuePromptItems,
  getModuleMastery,
  recordDrillCompletion,
  recordItemReview,
  type CurriculumProgress,
} from './engine/srs';
import type { Curriculum } from './schema/curriculum';
import {
  clearAllAppData,
  deleteCurriculum,
  loadAllCurricula,
  loadPreferences,
  loadProgress,
  saveCurriculum,
  savePreferences,
  saveProgress,
  type UserPreferences,
} from './storage/db';
import { Dialog } from './components/Dialog';
import { DrillModal } from './components/DrillModal';
import { Header, type MainTab } from './components/Header';
import { LearnView, type LessonStep } from './components/LearnView';
import { OnboardingModal } from './components/OnboardingModal';
import { PathwayView } from './components/PathwayView';
import { ReviewView } from './components/ReviewView';
import { StudioView } from './components/StudioView';
import { Toast, type ToastMessage } from './components/Toast';

const DEFAULT_PREFS: UserPreferences = {
  theme: 'light',
  audioMuted: false,
  activeCurriculumId: '',
  onboardingSeen: false,
};

export function App() {
  const [hydrated, setHydrated] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [progress, setProgress] = useState<CurriculumProgress | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>('learn');
  const [lessonStep, setLessonStep] = useState<LessonStep>(1);
  const [promptIdx, setPromptIdx] = useState(0);

  const [statusOpen, setStatusOpen] = useState(false);
  const [drillOpen, setDrillOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const notify = useCallback((text: string, tone: 'success' | 'warning' = 'success') => {
    setToast({ id: Date.now(), text, tone });
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3400);
  }, []);

  const loadDefaultCourseFromCatalog = useCallback(
    async (entries: CatalogEntry[]): Promise<Curriculum | null> => {
      const preferred = entries.find((c) => c.default) ?? entries[0];
      if (!preferred) return null;
      const loaded = await fetchCurriculumByPath(preferred.path);
      await saveCurriculum(loaded).catch(() => {});
      return loaded;
    },
    [],
  );

  // Hydrate from IndexedDB + external catalog JSON on boot (no hardcoded languages)
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [catalogEntries, storedCurricula, storedPrefs] = await Promise.all([
          fetchCourseCatalog(),
          loadAllCurricula(),
          loadPreferences(),
        ]);

        let nextCurricula = storedCurricula;
        if (nextCurricula.length === 0) {
          const initial = await loadDefaultCourseFromCatalog(catalogEntries);
          if (initial) {
            nextCurricula = [initial];
          }
        }

        if (cancelled) return;
        setCatalog(catalogEntries);

        if (nextCurricula.length === 0) {
          setBootError(
            'No courses are installed yet and the course catalog could not be reached. Open Studio to import a curriculum JSON file.',
          );
          setActiveTab('studio');
          setHydrated(true);
          return;
        }

        const nextPrefs: UserPreferences = {
          ...DEFAULT_PREFS,
          ...(storedPrefs ?? {}),
        };
        const activeCurr =
          nextCurricula.find((c) => c.meta.id === nextPrefs.activeCurriculumId) ?? nextCurricula[0];
        nextPrefs.activeCurriculumId = activeCurr.meta.id;

        const storedProg = await loadProgress(activeCurr.meta.id);
        const nextProgress =
          storedProg && activeCurr.modules.some((m) => m.id === storedProg.activeModId)
            ? storedProg
            : createInitialProgress(activeCurr.meta.id, activeCurr.modules[0].id);

        if (cancelled) return;
        setCurricula(nextCurricula);
        setPrefs(nextPrefs);
        setProgress(nextProgress);
        setOnboardingOpen(!nextPrefs.onboardingSeen);
        setHydrated(true);
      } catch (err) {
        if (cancelled) return;
        setBootError(err instanceof Error ? err.message : 'Failed to load curriculum catalog.');
        setHydrated(true);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [loadDefaultCourseFromCatalog]);

  // Apply light/dark theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);

  const activeCurriculum = useMemo(
    () => curricula.find((c) => c.meta.id === prefs.activeCurriculumId) ?? curricula[0] ?? null,
    [curricula, prefs.activeCurriculumId],
  );

  const activeModule = useMemo(() => {
    if (!activeCurriculum) return null;
    return (
      activeCurriculum.modules.find((m) => m.id === progress?.activeModId) ??
      activeCurriculum.modules[0] ??
      null
    );
  }, [activeCurriculum, progress?.activeModId]);

  const activeMastery = useMemo(
    () => (activeModule && progress ? getModuleMastery(activeModule, progress) : null),
    [activeModule, progress],
  );

  const dueItems = useMemo(
    () => (activeCurriculum && progress ? getDuePromptItems(activeCurriculum.modules, progress) : []),
    [activeCurriculum, progress],
  );

  const dailyStreak = useMemo(
    () => (progress ? computeDailyStreak(progress.practiceDates) : 0),
    [progress],
  );

  const updatePrefs = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void savePreferences(next).catch(() => {});
      return next;
    });
  }, []);

  const persistProgress = useCallback((next: CurriculumProgress) => {
    setProgress(next);
    void saveProgress(next).catch(() => {});
  }, []);

  const handleSelectModule = useCallback(
    (moduleId: string) => {
      if (!activeCurriculum || !progress) return;
      if (!activeCurriculum.modules.some((m) => m.id === moduleId)) return;
      persistProgress({ ...progress, activeModId: moduleId });
      setPromptIdx(0);
      setLessonStep(1);
      setActiveTab('learn');
    },
    [activeCurriculum, persistProgress, progress],
  );

  const handleReviewPrompt = useCallback(
    (moduleId: string, idx: number) => {
      if (!progress) return;
      persistProgress({ ...progress, activeModId: moduleId });
      setPromptIdx(idx);
      setLessonStep(5);
      setActiveTab('learn');
    },
    [persistProgress, progress],
  );

  const handleRecordPracticeResult = useCallback(
    (
      promptId: string,
      moduleId: string,
      isCorrect: boolean,
      velocity: VelocityTier,
      t1Sec: number,
      t2Sec: number,
    ) => {
      setProgress((prev) => {
        if (!prev) return prev;
        const { progress: next } = recordItemReview(
          prev,
          promptId,
          moduleId,
          isCorrect,
          velocity,
          t1Sec,
          t2Sec,
        );
        void saveProgress(next).catch(() => {});
        return next;
      });
    },
    [],
  );

  const handleCompleteDrill = useCallback(
    (drillId: string, primaryPromptId: string, moduleId: string, t2Sec: number): boolean => {
      let wasCredited = false;
      setProgress((prev) => {
        if (!prev) return prev;
        const res = recordDrillCompletion(prev, drillId, primaryPromptId, moduleId, t2Sec);
        wasCredited = res.credited;
        if (res.credited) {
          void saveProgress(res.progress).catch(() => {});
        }
        return res.progress;
      });
      return wasCredited;
    },
    [],
  );

  const handleSelectCurriculum = useCallback(
    async (curriculumId: string) => {
      const target = curricula.find((c) => c.meta.id === curriculumId);
      if (!target) return;
      updatePrefs({ activeCurriculumId: target.meta.id });
      const savedProg = await loadProgress(target.meta.id);
      const nextProg =
        savedProg && target.modules.some((m) => m.id === savedProg.activeModId)
          ? savedProg
          : createInitialProgress(target.meta.id, target.modules[0].id);
      setProgress(nextProg);
      setPromptIdx(0);
      setLessonStep(1);
      notify(`Switched to ${target.meta.languageName} (progress preserved).`);
    },
    [curricula, notify, updatePrefs],
  );

  const handleInstallCurriculum = useCallback(
    async (newCurr: Curriculum) => {
      await saveCurriculum(newCurr).catch(() => {});
      setCurricula((prev) => {
        const exists = prev.some((c) => c.meta.id === newCurr.meta.id);
        return exists
          ? prev.map((c) => (c.meta.id === newCurr.meta.id ? newCurr : c))
          : [...prev, newCurr];
      });
      updatePrefs({ activeCurriculumId: newCurr.meta.id });
      const existingProg = await loadProgress(newCurr.meta.id);
      const nextProg =
        existingProg && newCurr.modules.some((m) => m.id === existingProg.activeModId)
          ? existingProg
          : createInitialProgress(newCurr.meta.id, newCurr.modules[0].id);
      persistProgress(nextProg);
      setBootError(null);
      setPromptIdx(0);
      setLessonStep(1);
    },
    [persistProgress, updatePrefs],
  );

  const handleInstallFromCatalog = useCallback(
    async (entry: CatalogEntry) => {
      try {
        const loaded = await fetchCurriculumByPath(entry.path);
        await handleInstallCurriculum(loaded);
        notify(`Installed & switched to ${loaded.meta.languageName}!`);
      } catch (err) {
        notify(
          err instanceof Error ? err.message : `Failed to load ${entry.languageName}.`,
          'warning',
        );
      }
    },
    [handleInstallCurriculum, notify],
  );

  const handleDeleteCurriculum = useCallback(
    async (curriculumId: string) => {
      if (curricula.length <= 1) return;
      await deleteCurriculum(curriculumId).catch(() => {});
      const remaining = curricula.filter((c) => c.meta.id !== curriculumId);
      setCurricula(remaining);
      if (prefs.activeCurriculumId === curriculumId) {
        const fallback = remaining[0];
        updatePrefs({ activeCurriculumId: fallback.meta.id });
        const fallbackProg =
          (await loadProgress(fallback.meta.id)) ??
          createInitialProgress(fallback.meta.id, fallback.modules[0].id);
        setProgress(fallbackProg);
      }
      notify('Course removed.', 'warning');
    },
    [curricula, notify, prefs.activeCurriculumId, updatePrefs],
  );

  const handleFactoryReset = useCallback(async () => {
    await clearAllAppData();
    const freshCatalog = catalog.length > 0 ? catalog : await fetchCourseCatalog();
    const initial = await loadDefaultCourseFromCatalog(freshCatalog);
    if (!initial) {
      notify('Cleared local data, but could not reload default course from catalog.', 'warning');
      return;
    }
    const freshPrefs: UserPreferences = {
      ...DEFAULT_PREFS,
      activeCurriculumId: initial.meta.id,
      onboardingSeen: true,
    };
    await savePreferences(freshPrefs).catch(() => {});
    const freshProg = createInitialProgress(initial.meta.id, initial.modules[0].id);
    await saveProgress(freshProg).catch(() => {});
    setCatalog(freshCatalog);
    setCurricula([initial]);
    setPrefs(freshPrefs);
    setProgress(freshProg);
    setPromptIdx(0);
    setLessonStep(1);
    setActiveTab('learn');
    notify(`App reset to ${initial.meta.languageName}.`);
  }, [catalog, loadDefaultCourseFromCatalog, notify]);

  const handleCloseOnboarding = () => {
    setOnboardingOpen(false);
    if (!prefs.onboardingSeen) {
      updatePrefs({ onboardingSeen: true });
    }
  };

  const handleToggleAudio = () => {
    const nextMuted = !prefs.audioMuted;
    updatePrefs({ audioMuted: nextMuted });
    if (!nextMuted) playPounamuChime(false);
  };

  if (!hydrated) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="panel">Loading Aho Reo...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        languageName={activeCurriculum?.meta.languageName ?? 'No Course Loaded'}
        curriculumLevel={activeCurriculum?.meta.curriculumLevel ?? 'Studio'}
        dailyStreak={dailyStreak}
        dueCount={dueItems.length}
        audioMuted={prefs.audioMuted}
        theme={prefs.theme}
        onToggleAudio={handleToggleAudio}
        onToggleTheme={() => updatePrefs({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}
        onOpenStatus={() => setStatusOpen(true)}
        onOpenHelp={() => setOnboardingOpen(true)}
      />

      <main className="app-main">
        {bootError && (
          <div className="feedback-banner warning" style={{ marginBottom: 16 }} role="alert">
            <strong>Notice:</strong> {bootError}
          </div>
        )}

        {activeTab === 'learn' && activeCurriculum && activeModule && activeMastery && (
          <LearnView
            key={`${activeCurriculum.meta.id}:${activeModule.id}`}
            curriculum={activeCurriculum}
            activeModule={activeModule}
            mastery={activeMastery}
            step={lessonStep}
            promptIdx={promptIdx}
            audioMuted={prefs.audioMuted}
            onSelectStep={setLessonStep}
            onSelectModule={handleSelectModule}
            onSelectPromptIdx={setPromptIdx}
            onRecordPracticeResult={handleRecordPracticeResult}
            onCompleteDrill={handleCompleteDrill}
            onGoToReview={() => setActiveTab('review')}
            onNotify={notify}
          />
        )}

        {activeTab === 'review' && activeCurriculum && progress && (
          <ReviewView
            curriculum={activeCurriculum}
            progress={progress}
            onReviewPrompt={handleReviewPrompt}
            onOpenModule={handleSelectModule}
            onLaunchMixedDrill={() => setDrillOpen(true)}
          />
        )}

        {activeTab === 'pathway' && activeCurriculum && progress && activeModule && (
          <PathwayView
            curriculum={activeCurriculum}
            progress={progress}
            activeModuleId={activeModule.id}
            onSelectModule={handleSelectModule}
          />
        )}

        {activeTab === 'studio' && (
          <StudioView
            key={activeCurriculum ? `${activeCurriculum.meta.id}:${activeCurriculum.modules.length}` : 'empty'}
            catalog={catalog}
            curricula={curricula}
            activeCurriculum={activeCurriculum}
            onInstallFromCatalog={(entry) => void handleInstallFromCatalog(entry)}
            onSelectCurriculum={(id) => void handleSelectCurriculum(id)}
            onInstallCurriculum={(c) => void handleInstallCurriculum(c)}
            onDeleteCurriculum={(id) => void handleDeleteCurriculum(id)}
            onFactoryReset={() => void handleFactoryReset()}
            onNotify={notify}
          />
        )}
      </main>

      {/* Progress & Streak Dialog */}
      <Dialog
        id="statusDialog"
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Study Momentum"
        icon={<Flame size={18} />}
      >
        <div className="meta-grid">
          <div className="meta-tile">
            <div className="meta-label">Daily Streak</div>
            <div className="meta-value">
              {dailyStreak} {dailyStreak === 1 ? 'day' : 'days'}
            </div>
          </div>
          <div className="meta-tile">
            <div className="meta-label">Session Completions</div>
            <div className="meta-value">{progress?.sessionFlow ?? 0}</div>
          </div>
          <div className="meta-tile">
            <div className="meta-label">Due for Review</div>
            <div className="meta-value">{dueItems.length}</div>
          </div>
          <div className="meta-tile">
            <div className="meta-label">Items Tracked</div>
            <div className="meta-value">{progress ? Object.keys(progress.items).length : 0}</div>
          </div>
        </div>
        <div className="row-between">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!activeCurriculum}
            onClick={() => {
              setStatusOpen(false);
              setDrillOpen(true);
            }}
          >
            <Sparkles size={15} />
            <span>Quick Mixed Drill</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setStatusOpen(false);
              setActiveTab('review');
            }}
          >
            <RotateCw size={15} />
            <span>Open Review Hub</span>
          </button>
        </div>
      </Dialog>

      {activeCurriculum && (
        <DrillModal
          open={drillOpen}
          onClose={() => setDrillOpen(false)}
          curriculum={activeCurriculum}
          audioMuted={prefs.audioMuted}
          onRecordResult={handleRecordPracticeResult}
        />
      )}

      <OnboardingModal
        open={onboardingOpen}
        onClose={handleCloseOnboarding}
        languageName={activeCurriculum?.meta.languageName ?? 'Aho Reo'}
      />

      <Toast toast={toast} />
    </div>
  );
}

export default App;
