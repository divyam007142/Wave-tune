import { useEffect, useRef } from "react";
import { usePlayer } from "../context/PlayerContext";
import { loadYouTubeIframeApi, type YouTubeIframePlayer } from "../services/youtubeIframe";

export function YouTubeEmbed() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubeIframePlayer | null>(null);
  const { registerYouTubePlayer, reportYouTubeError, reportYouTubeState } = usePlayer();
  const callbacksRef = useRef({ registerYouTubePlayer, reportYouTubeError, reportYouTubeState });
  callbacksRef.current = { registerYouTubePlayer, reportYouTubeError, reportYouTubeState };

  useEffect(() => {
    let disposed = false;
    let player: YouTubeIframePlayer | null = null;
    let registered = false;

    void loadYouTubeIframeApi()
      .then((api) => {
        if (disposed || !containerRef.current) return;
        player = new api.Player(containerRef.current, {
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            controls: 1,
            enablejsapi: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (disposed) return;
              playerRef.current = event.target;
              registered = true;
              callbacksRef.current.registerYouTubePlayer(event.target);
            },
            onStateChange: (event) => {
              if (!disposed) callbacksRef.current.reportYouTubeState(event.data);
            },
            onError: () => {
              if (!disposed) callbacksRef.current.reportYouTubeError();
            },
          },
        });
        playerRef.current = player;
      })
      .catch((error: unknown) => {
        if (!disposed) callbacksRef.current.reportYouTubeError(
          error instanceof Error ? error.message : "YouTube's player could not load.",
        );
      });

    return () => {
      disposed = true;
      if (playerRef.current === player && player) {
        playerRef.current = null;
        if (registered) callbacksRef.current.registerYouTubePlayer(null);
        player.destroy();
      }
    };
  }, []);

  return <div className="youtube-player-shell" aria-label="YouTube video player">
    <div className="youtube-player-target" ref={containerRef} />
  </div>;
}
