import { useCallback, useEffect, useRef, useState } from "react";
import CrystalScene, { type CrystalSceneHandle } from "./game/CrystalScene";
import { LEVELS, TOTAL_LEVELS } from "./game/levels";
import {
  initPlatform,
  loadCloudProgress,
  saveCloudProgress,
  setGameplay,
  showInterstitial,
  subscribePlatformPause,
} from "./game/yandex";

const STORAGE_LEVEL = "crystal-orbit-level";
const STORAGE_INTRO = "crystal-orbit-intro-seen";
const STORAGE_SOUND = "crystal-orbit-sound";

function readNumber(key: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

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
    // Audio is an enhancement; gameplay never depends on it.
  }
}

export default function App() {
  const sceneRef = useRef<CrystalSceneHandle>(null);
  const nextTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const [levelIndex, setLevelIndex] = useState(() => Math.min(TOTAL_LEVELS - 1, Math.max(0, readNumber(STORAGE_LEVEL, 0))));
  const [score, setScore] = useState(0);
  const [hints, setHints] = useState(3);
  const [solved, setSolved] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [paused, setPaused] = useState(false);
  const [introOpen, setIntroOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_INTRO) !== "1"; } catch { return true; }
  });
  const [sound, setSound] = useState(() => {
    try { return localStorage.getItem(STORAGE_SOUND) !== "0"; } catch { return true; }
  });
  const level = LEVELS[levelIndex];

  useEffect(() => {
    void initPlatform();
    void loadCloudProgress().then((cloudLevel) => {
      if (cloudLevel === null) return;
      const safeLevel = Math.min(TOTAL_LEVELS - 1, Math.max(0, Math.floor(cloudLevel)));
      setLevelIndex((current) => Math.max(current, safeLevel));
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
  }, []);

  useEffect(() => {
    const active = !introOpen && !paused && !solved;
    void setGameplay(active);
  }, [introOpen, paused, solved, levelIndex]);

  const goNext = useCallback(async () => {
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    setPaused(true);
    const next = (levelIndex + 1) % TOTAL_LEVELS;
    if ((levelIndex + 1) % 5 === 0) await showInterstitial();
    setLevelIndex(next);
    setScore(0);
    setHints(3);
    setSolved(false);
    setShowSuccess(false);
    setPaused(false);
    try { localStorage.setItem(STORAGE_LEVEL, String(next)); } catch { /* noop */ }
    void saveCloudProgress(next);
  }, [levelIndex]);

  const onSolved = useCallback(() => {
    setSolved(true);
    playTone(sound, "success");
    const unlocked = Math.min(TOTAL_LEVELS - 1, levelIndex + 1);
    try { localStorage.setItem(STORAGE_LEVEL, String(unlocked)); } catch { /* noop */ }
    void saveCloudProgress(unlocked);
    revealTimerRef.current = window.setTimeout(() => setShowSuccess(true), 1250);
    nextTimerRef.current = window.setTimeout(() => void goNext(), 4600);
  }, [goNext, levelIndex, sound]);

  useEffect(() => () => {
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
  }, []);

  const useHint = () => {
    if (hints <= 0 || solved || paused || introOpen) return;
    setHints((value) => value - 1);
    sceneRef.current?.hint();
    playTone(sound, "hint");
  };

  const startGame = () => {
    setIntroOpen(false);
    try { localStorage.setItem(STORAGE_INTRO, "1"); } catch { /* noop */ }
    playTone(sound, "tap");
  };

  const toggleSound = () => {
    setSound((value) => {
      const next = !value;
      try { localStorage.setItem(STORAGE_SOUND, next ? "1" : "0"); } catch { /* noop */ }
      if (next) playTone(true, "tap");
      return next;
    });
  };

  return (
    <main className={`game-shell ${solved ? "is-solved" : ""}`}>
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <div className="brand"><span className="brand-mark" />CRYSTAL ORBIT</div>
        <div className="level-chip"><span>УРОВЕНЬ</span><b>{String(levelIndex + 1).padStart(2, "0")}</b><i>/{TOTAL_LEVELS}</i></div>
        <div className="top-actions">
          <button className="icon-button" onClick={() => sceneRef.current?.reset()} aria-label="Перемешать сферу" title="Перемешать">↻</button>
          <button className="icon-button" onClick={toggleSound} aria-label={sound ? "Выключить звук" : "Включить звук"} title="Звук">
            {sound ? "♪" : "×"}
          </button>
        </div>
      </header>

      <section className="game-stage" aria-label="Игровое поле">
        <div className="stage-copy">
          <div className="eyebrow">СОБЕРИТЕ СОЗВЕЗДИЕ</div>
          <h1>{solved ? level.name : "Найдите силуэт"}</h1>
          <p className="hint-copy">{solved ? "Созвездие найдено" : "Проведите по сфере, чтобы повернуть её"}</p>
        </div>

        <div className="crystal-wrap">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="scene-frame">
            <CrystalScene
              ref={sceneRef}
              level={level}
              levelIndex={levelIndex}
              paused={paused || introOpen}
              onScore={setScore}
              onSolved={onSolved}
              onInteract={() => playTone(sound, "tap")}
            />
            <div className="glass-highlight" />
          </div>
          <div className="sphere-shadow" />
          <div className="alignment" aria-live="polite">
            <span>СОВПАДЕНИЕ</span><b>{score}%</b>
          </div>
        </div>
      </section>

      <footer className="bottombar">
        <div className="level-progress" aria-label={`Прогресс: уровень ${levelIndex + 1} из ${TOTAL_LEVELS}`}>
          <span style={{ width: `${((levelIndex + 1) / TOTAL_LEVELS) * 100}%` }} />
        </div>
        <p><span className="gesture-icon">↔</span> Вращайте в любом направлении <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></p>
        <button className="ghost-button" onClick={useHint} disabled={hints === 0 || solved}>ПОДСКАЗКА <span>{hints}/3</span></button>
      </footer>

      {introOpen && (
        <div className="overlay intro-overlay" role="dialog" aria-modal="true" aria-labelledby="intro-title">
          <div className="modal-card">
            <div className="modal-gem"><i /><i /><i /></div>
            <div className="eyebrow">CRYSTAL ORBIT</div>
            <h2 id="intro-title">Соберите свет воедино</h2>
            <p>Внутри сферы скрыт силуэт. Вращайте её пальцем или мышью, пока частицы не совпадут с едва заметным контуром.</p>
            <div className="intro-steps">
              <span><b>01</b> Вращайте</span><span><b>02</b> Сопоставьте</span><span><b>03</b> Найдите</span>
            </div>
            <button className="primary-button" onClick={startGame}>НАЧАТЬ ИГРУ <span>→</span></button>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="success-panel" role="status" aria-live="assertive">
          <div className="success-ray" />
          <span>СОЗВЕЗДИЕ НАЙДЕНО</span>
          <strong>{level.name}</strong>
          <button onClick={() => void goNext()}>СЛЕДУЮЩИЙ УРОВЕНЬ <i>→</i></button>
          <div className="auto-progress"><i /></div>
        </div>
      )}
    </main>
  );
}
