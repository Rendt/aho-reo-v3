import {
  BookOpen,
  Compass,
  Feather,
  Flame,
  HelpCircle,
  Moon,
  RotateCw,
  SlidersHorizontal,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';

export type MainTab = 'learn' | 'review' | 'pathway' | 'studio';

interface HeaderProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  languageName: string;
  curriculumLevel: string;
  dailyStreak: number;
  dueCount: number;
  audioMuted: boolean;
  theme: 'light' | 'dark';
  onToggleAudio: () => void;
  onToggleTheme: () => void;
  onOpenStatus: () => void;
  onOpenHelp: () => void;
}

export function Header({
  activeTab,
  onSelectTab,
  languageName,
  curriculumLevel,
  dailyStreak,
  dueCount,
  audioMuted,
  theme,
  onToggleAudio,
  onToggleTheme,
  onOpenStatus,
  onOpenHelp,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <button
          type="button"
          id="brandHomeBtn"
          className="brand-btn"
          onClick={() => onSelectTab('learn')}
          aria-label="Aho Reo Home"
        >
          <span className="brand-mark" aria-hidden="true">
            <Feather size={18} />
          </span>
          <span className="brand-text">
            <span className="brand-name">Aho Reo</span>
            <span className="brand-sub">
              {languageName} · {curriculumLevel}
            </span>
          </span>
        </button>

        <nav className="main-nav" aria-label="Main navigation">
          <button
            type="button"
            id="navLearn"
            className="nav-tab"
            aria-current={activeTab === 'learn' ? 'page' : undefined}
            onClick={() => onSelectTab('learn')}
          >
            <BookOpen size={16} aria-hidden="true" />
            <span className="nav-label">Learn</span>
          </button>

          <button
            type="button"
            id="navReview"
            className="nav-tab"
            aria-current={activeTab === 'review' ? 'page' : undefined}
            onClick={() => onSelectTab('review')}
          >
            <RotateCw size={16} aria-hidden="true" />
            <span className="nav-label">Review</span>
            {dueCount > 0 && <span className="nav-badge">{dueCount}</span>}
          </button>

          <button
            type="button"
            id="navPathway"
            className="nav-tab"
            aria-current={activeTab === 'pathway' ? 'page' : undefined}
            onClick={() => onSelectTab('pathway')}
          >
            <Compass size={16} aria-hidden="true" />
            <span className="nav-label">Pathway</span>
          </button>

          <button
            type="button"
            id="navStudio"
            className="nav-tab"
            aria-current={activeTab === 'studio' ? 'page' : undefined}
            onClick={() => onSelectTab('studio')}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span className="nav-label">Studio</span>
          </button>
        </nav>

        <div className="header-actions">
          <button
            type="button"
            id="openStatusBtn"
            className="stat-chip"
            onClick={onOpenStatus}
            aria-label={`Daily streak ${dailyStreak} days, ${dueCount} items due for review`}
          >
            <span className="stat-item warm">
              <Flame size={15} aria-hidden="true" />
              <span>{dailyStreak}d</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="stat-item accent">
              <span>{dueCount} due</span>
            </span>
          </button>

          <button
            type="button"
            id="toggleAudioBtn"
            className="icon-btn"
            onClick={onToggleAudio}
            aria-pressed={audioMuted}
            aria-label={audioMuted ? 'Unmute audio' : 'Mute audio'}
            title={audioMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {audioMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>

          <button
            type="button"
            id="toggleThemeBtn"
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            type="button"
            id="openHelpBtn"
            className="icon-btn"
            onClick={onOpenHelp}
            aria-label="How Aho Reo works"
            title="How Aho Reo works"
          >
            <HelpCircle size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
