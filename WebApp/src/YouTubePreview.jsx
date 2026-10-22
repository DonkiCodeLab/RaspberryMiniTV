import React, { useEffect, useRef, useState } from "react";

let apiPromise;
export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => fail(), 15000);
    function cleanup() {
      window.clearTimeout(timeout);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous;
    }
    function fail() {
      cleanup();
      script.remove();
      apiPromise = null;
      reject(new Error("YouTube preview unavailable"));
    }
    function ready() {
      cleanup();
      resolve(window.YT);
      previous?.();
    }
    window.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return apiPromise;
}

export default function YouTubePreview({ videoId, title }) {
  const host = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let player;
    function hidePreview() {
      if (!cancelled) setVisible(false);
    }
    const container = host.current;
    setVisible(false);
    loadYouTubeApi().then(YT => {
      if (cancelled) return;
      const target = document.createElement("div");
      container.appendChild(target);
      player = new YT.Player(target, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, playsinline: 1,
          rel: 0, iv_load_policy: 3, loop: 1, playlist: videoId, origin: window.location.origin },
        events: {
          onReady: event => {
            if (cancelled) return;
            const iframe = event.target.getIframe();
            iframe.title = title;
            iframe.tabIndex = -1;
            iframe.setAttribute("aria-hidden", "true");
            iframe.setAttribute("allow", "autoplay; encrypted-media");
            event.target.unMute();
            event.target.setVolume(100);
            event.target.playVideo();
          },
          onStateChange: event => {
            if (cancelled) return;
            if (event.data !== YT.PlayerState.PLAYING) {
              hidePreview();
              return;
            }
            setVisible(true);
          },
          onAutoplayBlocked: hidePreview,
          onError: hidePreview,
        },
      });
    }).catch(() => { if (!cancelled) setVisible(false); });
    return () => {
      cancelled = true;
      player?.destroy();
      container.replaceChildren();
    };
  }, [videoId, title]);
  return <div ref={host} aria-hidden="true" inert
    className={`movie-poster-preview__video${visible ? " movie-poster-preview__video--playing" : ""}`} />;
}
