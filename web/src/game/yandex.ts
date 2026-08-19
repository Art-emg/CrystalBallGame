type YandexPlayer = {
  getData: (keys?: string[]) => Promise<Record<string, unknown>>;
  setData: (data: Record<string, unknown>, flush?: boolean) => Promise<void>;
};

type YandexSDK = {
  features?: {
    LoadingAPI?: { ready: () => void };
    GameplayAPI?: { start: () => void; stop: () => void };
  };
  adv?: {
    showFullscreenAdv: (callbacks: {
      onOpen?: () => void;
      onClose?: (wasShown: boolean) => void;
      onError?: () => void;
    }) => void;
  };
  getPlayer?: () => Promise<YandexPlayer>;
  on?: (event: string, callback: () => void) => void;
  off?: (event: string, callback: () => void) => void;
};

declare global {
  interface Window {
    YaGames?: { init: () => Promise<YandexSDK> };
  }
}

let sdkPromise: Promise<YandexSDK | null> | null = null;
let playerPromise: Promise<YandexPlayer | null> | null = null;

function loadScript() {
  if (window.YaGames) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-yandex-games-sdk]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("SDK unavailable")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.games.s3.yandex.net/sdk.js";
    script.async = true;
    script.dataset.yandexGamesSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("SDK unavailable"));
    document.head.appendChild(script);
  });
}

export function initPlatform() {
  if (!sdkPromise) {
    sdkPromise = loadScript()
      .then(() => window.YaGames?.init() ?? null)
      .then((sdk) => {
        sdk?.features?.LoadingAPI?.ready();
        return sdk;
      })
      .catch(() => null);
  }
  return sdkPromise;
}

async function getPlayer() {
  if (!playerPromise) {
    playerPromise = initPlatform()
      .then((sdk) => sdk?.getPlayer?.() ?? null)
      .catch(() => null);
  }
  return playerPromise;
}

export async function loadCloudProgress() {
  const player = await getPlayer();
  if (!player) return null;
  try {
    const data = await player.getData(["crystalOrbitLevel"]);
    const value = Number(data.crystalOrbitLevel);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function saveCloudProgress(level: number) {
  const player = await getPlayer();
  if (!player) return;
  try {
    await player.setData({ crystalOrbitLevel: level }, true);
  } catch {
    // Local progress remains the fallback outside Yandex Games.
  }
}

export async function setGameplay(active: boolean) {
  const sdk = await initPlatform();
  if (active) sdk?.features?.GameplayAPI?.start();
  else sdk?.features?.GameplayAPI?.stop();
}

export async function showInterstitial() {
  const sdk = await initPlatform();
  if (!sdk?.adv?.showFullscreenAdv) return false;
  setGameplay(false);
  return new Promise<boolean>((resolve) => {
    sdk.adv!.showFullscreenAdv({
      onClose: (wasShown) => resolve(wasShown),
      onError: () => resolve(false),
    });
  });
}

export async function subscribePlatformPause(onPause: () => void, onResume: () => void) {
  const sdk = await initPlatform();
  if (!sdk?.on) return () => undefined;
  sdk.on("game_api_pause", onPause);
  sdk.on("game_api_resume", onResume);
  return () => {
    sdk.off?.("game_api_pause", onPause);
    sdk.off?.("game_api_resume", onResume);
  };
}
