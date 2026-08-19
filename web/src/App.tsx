import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrystalScene, { type CrystalSceneHandle } from "./game/CrystalScene";
import { CHAPTER_SIZE, DISPLAY_LEVELS, LEVELS, TOTAL_LEVELS } from "./game/levels";
import {
  DIFFICULTIES,
  completeLevel,
  completedInRange,
  isChapterUnlocked,
  loadLocalProgress,
  saveLocalProgress,
  totalCompleted,
  totalCrystals,
  type DifficultyId,
  type ProgressState,
  type ThemeId,
} from "./game/progress";
import {
  initPlatform,
  loadCloudProgress,
  saveCloudProgress,
  setGameplay,
  showInterstitial,
  subscribePlatformPause,
} from "./game/yandex";

const STORAGE_SOUND = "crystal-orbit-sound";

const DIFFICULTY_COPY: Record<DifficultyId, { name: string; description: string }> = {
  easy: { name: "Спокойная", description: "Яркий контур, 5 подсказок и мягкое совпадение." },
  normal: { name: "Классическая", description: "Сбалансированная глубина и 3 подсказки." },
  hard: { name: "Мастерская", description: "Точный поворот, слабый контур и 1 подсказка." },
};

const THEMES: Array<{ id: ThemeId; name: string; caption: string }> = [
  { id: "orbit", name: "Орбита", caption: "Исходный холодный космос" },
  { id: "cartoon", name: "Мультяшный", caption: "Яркая конфетная галактика" },
  { id: "cozy", name: "Уютный", caption: "Тёплая комната исследователя" },
  { id: "deco", name: "Ар-деко", caption: "Золото, геометрия и ночь" },
];

function playTone(enabled: boolean, kind: "tap" | "hint" | "success") {
  if (!enabled) return;
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioContextClass();
    const now = context.currentTime;
    const notes = kind === "success" ? [392, 523, 659, 784] : kind === "hint" ? [330, 494] : [280];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "success" ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(kind === "success" ? 0.055 : 0.025, now + index * 0.08 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * 0.08);
      oscillator.stop(now + index * 0.08 + 0.24);
    });
    window.setTimeout(() => void context.close(), 900);
  } catch {
    // Sound is optional and never blocks the puzzle.
  }
}

function rankFor(difficulty: DifficultyId) {
  return DIFFICULTIES.find((item) => item.id === difficulty)?.rank ?? 2;
}

function hintsFor(difficulty: DifficultyId) {
  return DIFFICULTIES.find((item) => item.id === difficulty)?.hints ?? 3;
}

export default function App() {
  const sceneRef = useRef<CrystalSceneHandle>(null);
  const stageRef = useRef<HTMLElement>(null);
  const progressRef = useRef<ProgressState>(loadLocalProgress());
  const nextTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);

  const [screen, setScreen] = useState<"map" | "game">("map");
  const [progress, setProgress] = useState(progressRef.current);
  const [levelIndex, setLevelIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<DifficultyId>(progress.selectedDifficulty);
  const [dialogDifficulty, setDialogDifficulty] = useState<DifficultyId>(progress.selectedDifficulty);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [futureNotice, setFutureNotice] = useState(false);
  const [score, setScore] = useState(0);
  const [hints, setHints] = useState(hintsFor(progress.selectedDifficulty));
  const [solved, setSolved] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(() => {
    try { return localStorage.getItem(STORAGE_SOUND) !== "0"; } catch { return true; }
  });
  const [desktopControls, setDesktopControls] = useState(() => window.matchMedia("(pointer: fine)").matches && window.innerWidth > 720);

  const theme = progress.theme;
  const level = LEVELS[levelIndex];
  const completed = totalCompleted(progress);
  const crystals = totalCrystals(progress);

  const clearTimers = useCallback(() => {
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    nextTimerRef.current = null;
    revealTimerRef.current = null;
  }, []);

  const storeProgress = useCallback((next: ProgressState) => {
    progressRef.current = next;
    setProgress(next);
    saveLocalProgress(next);
  }, []);

  useEffect(() => {
    void initPlatform();
    void loadCloudProgress().then((cloudLevel) => {
      if (cloudLevel === null) return;
      const safeLevel = Math.max(0, Math.min(TOTAL_LEVELS, Math.floor(cloudLevel)));
      const current = progressRef.current;
      const best = { ...current.best };
      for (let index = 0; index < safeLevel; index += 1) best[String(index)] = Math.max(best[String(index)] ?? 0, 2);
      storeProgress({ ...current, best });
    });

    let unsubscribe: () => void = () => undefined;
    void subscribePlatformPause(
      () => setPaused(true),
      () => setPaused(false),
    ).then((cleanup) => { unsubscribe = cleanup; });
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [storeProgress]);

  useEffect(() => {
    const query = window.matchMedia("(pointer: fine)");
    const update = () => setDesktopControls(query.matches && window.innerWidth > 720);
    query.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      query.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    void setGameplay(screen === "game" && !paused && !solved);
  }, [paused, screen, solved, levelIndex]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const startLevel = useCallback((index: number, selectedDifficultyId: DifficultyId) => {
    clearTimers();
    const nextProgress = { ...progressRef.current, selectedDifficulty: selectedDifficultyId };
    storeProgress(nextProgress);
    setLevelIndex(index);
    setDifficulty(selectedDifficultyId);
    setHints(hintsFor(selectedDifficultyId));
    setScore(0);
    setSolved(false);
    setShowSuccess(false);
    setPaused(false);
    setSelectedLevel(null);
    setScreen("game");
    playTone(sound, "tap");
  }, [clearTimers, sound, storeProgress]);

  const returnToMap = useCallback(() => {
    clearTimers();
    setScreen("map");
    setSolved(false);
    setShowSuccess(false);
    setPaused(false);
  }, [clearTimers]);

  const goNext = useCallback(async () => {
    clearTimers();
    setPaused(true);
    if ((levelIndex + 1) % 5 === 0) await showInterstitial();
    const next = levelIndex + 1;
    const nextChapter = Math.floor(next / CHAPTER_SIZE);
    if (next < TOTAL_LEVELS && isChapterUnlocked(progressRef.current, nextChapter)) {
      startLevel(next, difficulty);
    } else {
      returnToMap();
    }
  }, [clearTimers, difficulty, levelIndex, returnToMap, startLevel]);

  const onSolved = useCallback(() => {
    const rank = rankFor(difficulty);
    const nextProgress = completeLevel(progressRef.current, levelIndex, rank);
    storeProgress(nextProgress);
    void saveCloudProgress(Math.max(levelIndex + 1, totalCompleted(nextProgress)));
    setSolved(true);
    playTone(sound, "success");
    revealTimerRef.current = window.setTimeout(() => setShowSuccess(true), 1250);
    nextTimerRef.current = window.setTimeout(() => void goNext(), 5200);
  }, [difficulty, goNext, levelIndex, sound, storeProgress]);

  const useHint = () => {
    if (hints <= 0 || solved || paused) return;
    setHints((value) => value - 1);
    sceneRef.current?.hint();
    playTone(sound, "hint");
  };

  const toggleSound = () => {
    setSound((value) => {
      const next = !value;
      try { localStorage.setItem(STORAGE_SOUND, next ? "1" : "0"); } catch { /* noop */ }
      if (next) playTone(true, "tap");
      return next;
    });
  };

  const chooseTheme = (id: ThemeId) => {
    storeProgress({ ...progressRef.current, theme: id });
    playTone(sound, "tap");
  };

  const openLevel = (index: number) => {
    const chapterIndex = Math.floor(index / CHAPTER_SIZE);
    if (!isChapterUnlocked(progressRef.current, chapterIndex)) return;
    if (index >= TOTAL_LEVELS) {
      if (index < 110) setFutureNotice(true);
      return;
    }
    setDialogDifficulty(progressRef.current.selectedDifficulty);
    setSelectedLevel(index);
    playTone(sound, "tap");
  };

  const chapters = useMemo(() => Array.from({ length: DISPLAY_LEVELS / CHAPTER_SIZE }, (_, index) => index), []);

  if (screen === "map") {
    return (
      <main className={`game-shell map-shell theme-${theme}`} data-theme={theme} onContextMenu={(event) => event.preventDefault()}>
        <div className="ambient ambient-a" /><div className="ambient ambient-b" />
        <header className="topbar map-topbar">
          <div className="brand"><span className="brand-mark" />CRYSTAL ORBIT</div>
          <div className="map-stats">
            <span><b>{completed}</b>/100 <i>созвездий</i></span>
            <span><b>{crystals}</b>/300 <i>кристаллов</i></span>
          </div>
          <button className="icon-button" onClick={toggleSound} aria-label={sound ? "Выключить звук" : "Включить звук"}>{sound ? "♪" : "×"}</button>
        </header>

        <div className="map-scroll">
          <section className="map-hero">
            <div>
              <div className="eyebrow">КАРТА СОЗВЕЗДИЙ</div>
              <h1>Выберите свой маршрут</h1>
              <p>Первый сектор открыт целиком. Соберите любые 5 из 10 силуэтов, чтобы разблокировать следующий.</p>
            </div>
            <div className="map-orb" aria-hidden="true"><i /><i /><i /></div>
          </section>

          <section className="theme-picker" aria-labelledby="theme-title">
            <div className="section-heading">
              <span>ВИЗУАЛЬНЫЙ СТИЛЬ</span>
              <h2 id="theme-title">Четыре атмосферы</h2>
            </div>
            <div className="theme-grid">
              {THEMES.map((item) => (
                <button key={item.id} className={`theme-card theme-preview-${item.id} ${theme === item.id ? "is-active" : ""}`} onClick={() => chooseTheme(item.id)} aria-pressed={theme === item.id}>
                  <span className="theme-swatch"><i /><i /><i /></span>
                  <strong>{item.name}</strong><small>{item.caption}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="onboarding-card">
            <span className="onboarding-number">01</span>
            <div><strong>Вращайте</strong><small>мышью, пальцем или стрелками</small></div>
            <span className="onboarding-number">02</span>
            <div><strong>Совмещайте</strong><small>частицы с контуром</small></div>
            <span className="onboarding-number">03</span>
            <div><strong>Усложняйте</strong><small>получайте до 3 кристаллов</small></div>
          </section>

          <section className="chapters" aria-label="300 уровней">
            {chapters.map((chapterIndex) => {
              const start = chapterIndex * CHAPTER_SIZE;
              const isPlayableChapter = chapterIndex < 10;
              const unlocked = isChapterUnlocked(progress, chapterIndex);
              const chapterCompleted = isPlayableChapter ? completedInRange(progress, start, start + CHAPTER_SIZE) : 0;
              return (
                <article key={chapterIndex} className={`chapter ${unlocked ? "is-unlocked" : "is-locked"} ${!isPlayableChapter ? "is-distant" : ""}`}>
                  <header className="chapter-heading">
                    <div><span>СЕКТОР {String(chapterIndex + 1).padStart(2, "0")}</span><h2>{isPlayableChapter ? `Уровни ${start + 1}—${start + 10}` : "За границей карты"}</h2></div>
                    <div className="chapter-state">
                      {isPlayableChapter ? <><b>{chapterCompleted}/10</b><small>{unlocked ? "ДОСТУПНО" : "НУЖНО 5 ПОБЕД"}</small></> : <><b>{unlocked ? "∞" : "◆"}</b><small>{unlocked ? "НОВЫЙ ГОРИЗОНТ" : "ЗАКРЫТО"}</small></>}
                    </div>
                  </header>
                  <div className="chapter-progress"><i style={{ width: `${isPlayableChapter ? chapterCompleted * 10 : 0}%` }} /></div>
                  <div className="level-grid">
                    {Array.from({ length: CHAPTER_SIZE }, (_, offset) => {
                      const index = start + offset;
                      const playable = index < TOTAL_LEVELS;
                      const levelData = playable ? LEVELS[index] : null;
                      const best = playable ? progress.best[String(index)] ?? 0 : 0;
                      const futureOpen = !playable && unlocked && chapterIndex === 10;
                      const disabled = !unlocked || (!playable && !futureOpen);
                      return (
                        <button key={index} className={`level-card ${best ? "is-complete" : ""} ${disabled ? "is-disabled" : ""} ${futureOpen ? "is-future" : ""}`} disabled={disabled} onClick={() => openLevel(index)} aria-label={playable ? `Уровень ${index + 1}: ${levelData!.name}` : `Уровень ${index + 1}`}>
                          <span className="level-number">{String(index + 1).padStart(3, "0")}</span>
                          <span className="level-icon" aria-hidden="true">
                            {levelData ? <svg viewBox="0 0 24 24"><path d={levelData.path} /></svg> : <i>{futureOpen ? "⋯" : "◆"}</i>}
                          </span>
                          <strong>{levelData ? levelData.name : "Неизвестно"}</strong>
                          <span className="rank-dots" aria-label={best ? `Лучший результат: ${best} из 3` : "Не пройден"}>
                            {[1, 2, 3].map((rank) => <i key={rank} className={rank <= best ? "is-earned" : ""} />)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </section>
        </div>

        {selectedLevel !== null && (
          <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="difficulty-title">
            <div className="difficulty-dialog">
              <button className="dialog-close" onClick={() => setSelectedLevel(null)} aria-label="Закрыть">×</button>
              <div className="level-dialog-icon"><svg viewBox="0 0 24 24"><path d={LEVELS[selectedLevel].path} /></svg></div>
              <div className="eyebrow">УРОВЕНЬ {String(selectedLevel + 1).padStart(2, "0")}</div>
              <h2 id="difficulty-title">{LEVELS[selectedLevel].name}</h2>
              <p>Выберите сложность. Лучшая победа сохранится на карте.</p>
              <div className="difficulty-list">
                {DIFFICULTIES.map((item) => (
                  <button key={item.id} className={dialogDifficulty === item.id ? "is-active" : ""} onClick={() => setDialogDifficulty(item.id)}>
                    <span className="difficulty-rank">{"◆".repeat(item.rank)}</span>
                    <strong>{DIFFICULTY_COPY[item.id].name}</strong>
                    <small>{DIFFICULTY_COPY[item.id].description}</small>
                  </button>
                ))}
              </div>
              <button className="primary-button" onClick={() => startLevel(selectedLevel, dialogDifficulty)}>НАЧАТЬ <span>→</span></button>
            </div>
          </div>
        )}

        {futureNotice && (
          <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="future-title">
            <div className="difficulty-dialog future-dialog">
              <div className="future-mark">✦</div>
              <div className="eyebrow">ЭКСПЕДИЦИЯ ЗАВЕРШЕНА</div>
              <h2 id="future-title">Все 100 созвездий собраны</h2>
              <p>Вы достигли границы доступной карты. Следующий сектор откроется в новой экспедиции.</p>
              <button className="primary-button" onClick={() => setFutureNotice(false)}>ВЕРНУТЬСЯ К КАРТЕ</button>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className={`game-shell theme-${theme} ${solved ? "is-solved" : ""}`} data-theme={theme} onContextMenu={(event) => event.preventDefault()}>
      <div className="ambient ambient-a" /><div className="ambient ambient-b" />
      <header className="topbar">
        <div className="top-actions left-actions">
          <button className="icon-button map-button" onClick={returnToMap} aria-label="Вернуться к карте">←</button>
          <div className="brand"><span className="brand-mark" />CRYSTAL ORBIT</div>
        </div>
        <div className="level-chip"><span>УРОВЕНЬ</span><b>{String(levelIndex + 1).padStart(2, "0")}</b><i>/{TOTAL_LEVELS}</i><em>{DIFFICULTY_COPY[difficulty].name}</em></div>
        <div className="top-actions">
          <button className="icon-button" onClick={() => sceneRef.current?.reset()} aria-label="Перемешать сферу" title="Перемешать">↻</button>
          <button className="icon-button" onClick={toggleSound} aria-label={sound ? "Выключить звук" : "Включить звук"} title="Звук">{sound ? "♪" : "×"}</button>
        </div>
      </header>

      <section ref={stageRef} className="game-stage" aria-label="Игровое поле">
        <div className="stage-copy">
          <div className="eyebrow">СОБЕРИТЕ СОЗВЕЗДИЕ</div>
          <h1>{solved ? level.name : "Найдите силуэт"}</h1>
          <p className="hint-copy">{solved ? "Созвездие найдено" : "Проведите по экрану, чтобы повернуть сферу"}</p>
        </div>
        <div className="crystal-wrap">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
          <div className="scene-frame">
            <CrystalScene ref={sceneRef} interactionTargetRef={stageRef} level={level} levelName={level.name} levelIndex={levelIndex} difficulty={difficulty} theme={theme} paused={paused} onScore={setScore} onSolved={onSolved} onInteract={() => playTone(sound, "tap")} />
            <div className="glass-highlight" />
          </div>
          <div className="sphere-shadow" />
          <div className="alignment" aria-live="polite"><span>СОВПАДЕНИЕ</span><b>{score}%</b></div>
        </div>
      </section>

      <footer className="bottombar">
        <div className="level-progress" aria-label={`Прогресс: уровень ${levelIndex + 1} из ${TOTAL_LEVELS}`}><span style={{ width: `${((levelIndex + 1) / TOTAL_LEVELS) * 100}%` }} /></div>
        <p className={desktopControls ? "desktop-gesture" : "touch-gesture"}>
          {desktopControls ? <><span className="mouse-icon" aria-hidden="true"><i /></span><span>Мышь или стрелки — вращение</span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></> : <><span className="gesture-icon">↔</span><span>Проведите пальцем в любом направлении</span></>}
        </p>
        <button className="ghost-button" onClick={useHint} disabled={hints === 0 || solved}>ПОДСКАЗКА <span>{hints}/{hintsFor(difficulty)}</span></button>
      </footer>

      {showSuccess && (
        <div className="success-panel" role="status" aria-live="assertive">
          <div className="success-ray" /><span>СОЗВЕЗДИЕ НАЙДЕНО</span><strong>{level.name}</strong>
          <div className="success-rank">{"◆".repeat(rankFor(difficulty))}</div>
          <div className="success-actions"><button onClick={returnToMap}>К КАРТЕ</button><button onClick={() => void goNext()}>СЛЕДУЮЩИЙ <i>→</i></button></div>
          <div className="auto-progress"><i /></div>
        </div>
      )}
    </main>
  );
}
