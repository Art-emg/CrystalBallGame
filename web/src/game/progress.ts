export type DifficultyId = "easy" | "normal" | "hard";
export type ThemeId = "orbit" | "cartoon" | "cozy" | "deco";

export type ProgressState = {
  version: 2;
  best: Record<string, number>;
  selectedDifficulty: DifficultyId;
  theme: ThemeId;
};

export const DIFFICULTIES: Array<{ id: DifficultyId; rank: 1 | 2 | 3; hints: number }> = [
  { id: "easy", rank: 1, hints: 5 },
  { id: "normal", rank: 2, hints: 3 },
  { id: "hard", rank: 3, hints: 1 },
];

const STORAGE_PROGRESS = "crystal-orbit-progress-v2";
const LEGACY_LEVEL = "crystal-orbit-level";
const THEMES: ThemeId[] = ["orbit", "cartoon", "cozy", "deco"];
const DIFFICULTY_IDS: DifficultyId[] = ["easy", "normal", "hard"];

export function createProgress(): ProgressState {
  return { version: 2, best: {}, selectedDifficulty: "normal", theme: "orbit" };
}

function normalize(raw: unknown): ProgressState {
  const fallback = createProgress();
  if (!raw || typeof raw !== "object") return fallback;
  const source = raw as Partial<ProgressState>;
  const best: Record<string, number> = {};
  if (source.best && typeof source.best === "object") {
    Object.entries(source.best).forEach(([key, value]) => {
      const index = Number(key);
      const rank = Math.max(0, Math.min(3, Math.floor(Number(value))));
      if (Number.isInteger(index) && index >= 0 && index < 100 && rank > 0) best[String(index)] = rank;
    });
  }
  return {
    version: 2,
    best,
    selectedDifficulty: DIFFICULTY_IDS.includes(source.selectedDifficulty as DifficultyId)
      ? source.selectedDifficulty as DifficultyId
      : fallback.selectedDifficulty,
    theme: THEMES.includes(source.theme as ThemeId) ? source.theme as ThemeId : fallback.theme,
  };
}

export function loadLocalProgress(): ProgressState {
  try {
    const saved = localStorage.getItem(STORAGE_PROGRESS);
    if (saved) return normalize(JSON.parse(saved));
    const legacyNextLevel = Math.max(0, Math.min(100, Math.floor(Number(localStorage.getItem(LEGACY_LEVEL)) || 0)));
    const migrated = createProgress();
    for (let index = 0; index < legacyNextLevel; index += 1) migrated.best[String(index)] = 2;
    return migrated;
  } catch {
    return createProgress();
  }
}

export function saveLocalProgress(progress: ProgressState) {
  try { localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(progress)); } catch { /* storage may be disabled */ }
}

export function parseCloudProgress(raw: unknown): ProgressState | null {
  if (!raw) return null;
  try { return normalize(typeof raw === "string" ? JSON.parse(raw) : raw); } catch { return null; }
}

export function mergeProgress(local: ProgressState, cloud: ProgressState | null): ProgressState {
  if (!cloud) return local;
  const best = { ...local.best };
  Object.entries(cloud.best).forEach(([key, rank]) => {
    best[key] = Math.max(best[key] ?? 0, rank);
  });
  return { ...local, best };
}

export function completeLevel(progress: ProgressState, levelIndex: number, rank: number): ProgressState {
  return {
    ...progress,
    best: { ...progress.best, [String(levelIndex)]: Math.max(progress.best[String(levelIndex)] ?? 0, rank) },
  };
}

export function completedInRange(progress: ProgressState, start: number, end: number) {
  let count = 0;
  for (let index = start; index < end; index += 1) if ((progress.best[String(index)] ?? 0) > 0) count += 1;
  return count;
}

export function totalCompleted(progress: ProgressState) {
  return completedInRange(progress, 0, 100);
}

export function totalCrystals(progress: ProgressState) {
  return Object.values(progress.best).reduce((sum, rank) => sum + rank, 0);
}

export function isChapterUnlocked(progress: ProgressState, chapterIndex: number) {
  if (chapterIndex === 0) return true;
  if (chapterIndex >= 1 && chapterIndex <= 9) {
    const previousStart = (chapterIndex - 1) * 10;
    return completedInRange(progress, previousStart, previousStart + 10) >= 5;
  }
  if (chapterIndex === 10) return totalCompleted(progress) === 100;
  return false;
}
