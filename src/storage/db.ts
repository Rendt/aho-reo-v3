import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Curriculum } from '../schema/curriculum';
import type { CurriculumProgress } from '../engine/srs';

export interface UserPreferences {
  theme: 'light' | 'dark';
  audioMuted: boolean;
  activeCurriculumId: string;
  onboardingSeen: boolean;
  notes: string;
}

interface AhoReoDBSchema extends DBSchema {
  curricula: {
    key: string;
    value: Curriculum;
  };
  progress: {
    key: string;
    value: CurriculumProgress;
  };
  preferences: {
    key: string;
    value: UserPreferences;
  };
}

const DB_NAME = 'aho_reo_v31_db';
const DB_VERSION = 1;
const PREFS_KEY = 'user_preferences';
const LEGACY_STORAGE_KEYS = [
  'aho_state_v300',
  'aho_state_v220',
  'aho_state_v210',
  'aho_state_v200',
  'aho_portable_notes',
];

let dbPromise: Promise<IDBPDatabase<AhoReoDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<AhoReoDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<AhoReoDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('curricula')) {
          db.createObjectStore('curricula', { keyPath: 'meta.id' });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'curriculumId' });
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences');
        }
      },
    });
  }
  return dbPromise;
}

export async function loadAllCurricula(): Promise<Curriculum[]> {
  try {
    const db = await getDb();
    return await db.getAll('curricula');
  } catch {
    return [];
  }
}

export async function saveCurriculum(curriculum: Curriculum): Promise<void> {
  const db = await getDb();
  await db.put('curricula', curriculum);
}

export async function deleteCurriculum(curriculumId: string): Promise<void> {
  const db = await getDb();
  await db.delete('curricula', curriculumId);
  await db.delete('progress', curriculumId);
}

export async function loadProgress(curriculumId: string): Promise<CurriculumProgress | undefined> {
  try {
    const db = await getDb();
    return await db.get('progress', curriculumId);
  } catch {
    return undefined;
  }
}

export async function saveProgress(progress: CurriculumProgress): Promise<void> {
  const db = await getDb();
  await db.put('progress', progress);
}

export async function loadPreferences(): Promise<UserPreferences | undefined> {
  try {
    const db = await getDb();
    return await db.get('preferences', PREFS_KEY);
  } catch {
    return undefined;
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  const db = await getDb();
  await db.put('preferences', prefs, PREFS_KEY);
}

/**
 * Completely clears IndexedDB stores AND legacy v2/v3 localStorage keys.
 */
export async function clearAllAppData(): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(['curricula', 'progress', 'preferences'], 'readwrite');
    await Promise.all([
      tx.objectStore('curricula').clear(),
      tx.objectStore('progress').clear(),
      tx.objectStore('preferences').clear(),
      tx.done,
    ]);
  } catch {
    // Ignore IDB clear failure in restricted environments
  }

  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore localStorage failure
  }
}
