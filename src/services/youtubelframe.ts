export type YouTubeIframePlayer = {
  cueVideoById: (videoId: string) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  loadVideoById: (videoId: string) => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  stopVideo: () => void;
};

type YouTubeIframeEvents = {
  onReady: (event: { target: YouTubeIframePlayer }) => void;
  onStateChange: (event: { data: number }) => void;
  onError: (event: { data: number }) => void;
};

export type YouTubeIframeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      height: string;
      width: string;
      playerVars: Record<string, number | string>;
      events: YouTubeIframeEvents;
    },
  ) => YouTubeIframePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeIframeApi> | null = null;

export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      reject(new Error("YouTube's player did not finish loading."));
      apiPromise = null;
    }, 15_000);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      if (error) {
        reject(error);
        apiPromise = null;
        return;
      }
      if (!window.YT?.Player) {
        reject(new Error("YouTube's player API is unavailable."));
        apiPromise = null;
        return;
      }
      resolve(window.YT);
    };

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      finish();
    };

    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => finish(new Error("YouTube's player API could not be loaded."));
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}
