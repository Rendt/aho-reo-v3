import { getModuleMastery, type CurriculumProgress } from '../engine/srs';
import type { Curriculum, LessonModule } from '../schema/curriculum';

interface PathwayViewProps {
  curriculum: Curriculum;
  progress: CurriculumProgress;
  activeModuleId: string;
  onSelectModule: (moduleId: string) => void;
}

export function PathwayView({
  curriculum,
  progress,
  activeModuleId,
  onSelectModule,
}: PathwayViewProps) {
  const grouped = new Map<number, { title: string; modules: LessonModule[] }>();
  for (const mod of curriculum.modules) {
    const existing = grouped.get(mod.tier);
    if (existing) {
      existing.modules.push(mod);
    } else {
      grouped.set(mod.tier, { title: mod.wahanga, modules: [mod] });
    }
  }

  const tiers = Array.from(grouped.entries()).sort(([a], [b]) => a - b);

  const totalPrompts = curriculum.modules.reduce((acc, m) => acc + m.prompts.length, 0);
  const reviewedPrompts = curriculum.modules.reduce(
    (acc, m) => acc + getModuleMastery(m, progress).reviewedPrompts,
    0,
  );
  const pct = totalPrompts > 0 ? Math.round((reviewedPrompts / totalPrompts) * 100) : 0;

  return (
    <div className="stack-lg">
      <section className="panel stack-sm">
        <div className="row-between">
          <div>
            <h1 className="page-heading">{curriculum.meta.languageName} Pathway</h1>
            <p className="page-lead">
              {curriculum.meta.curriculumLevel} · {curriculum.modules.length} lessons across{' '}
              {tiers.length} progressive groups
            </p>
          </div>
          <span className="mastery-tag" data-level={pct >= 75 ? 3 : pct > 0 ? 1 : 0}>
            {pct}% practiced
          </span>
        </div>
        <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {tiers.map(([tierNum, group]) => (
        <section key={tierNum} className="panel stack-md">
          <div className="row-between">
            <h2 className="step-title" style={{ fontSize: '1.05rem' }}>
              {group.title}
            </h2>
            <span className="vocab-meaning mono">Group {tierNum}</span>
          </div>

          <div className="pathway-grid">
            {group.modules.map((mod) => {
              const mastery = getModuleMastery(mod, progress);
              const isActive = mod.id === activeModuleId;
              return (
                <button
                  key={mod.id}
                  type="button"
                  className={`pathway-card ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectModule(mod.id)}
                >
                  <div className="row-between" style={{ width: '100%' }}>
                    <span className="vocab-meaning mono">{mod.kowae}</span>
                    <span className="mastery-tag" data-level={mastery.level}>
                      {mastery.label}
                    </span>
                  </div>
                  <strong>{mod.title}</strong>
                  <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--warm-text)' }}>
                    {mod.pattern}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
