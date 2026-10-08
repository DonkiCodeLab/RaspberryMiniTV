import React, { useEffect, useRef, useState } from "react";

export default function BrowserVideo({ url, t, initialProgress, onProgress }) {
  const videoRef = useRef(null);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const [subtitleUrl, setSubtitleUrl] = useState("");
  const [status, setStatus] = useState("loading");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    let initialized = false;
    let lastSave = 0;
    const save = (force = false) => {
      if (!initialized || video.seeking || !Number.isFinite(video.currentTime)) return;
      if (!force && Date.now() - lastSave < 5000) return;
      lastSave = Date.now();
      progressRef.current?.({ kind: "video", seconds: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : 0, completed: video.ended });
    };
    const loaded = () => {
      const seconds = Math.max(0, Number(initialProgress?.seconds) || 0);
      if (seconds) video.currentTime = Math.min(seconds, Number.isFinite(video.duration) ? Math.max(0, video.duration - .1) : seconds);
      initialized = true;
      save(true);
    };
    const tick = () => save();
    const flush = () => save(true);
    video.addEventListener("loadedmetadata", loaded);
    video.addEventListener("timeupdate", tick);
    for (const event of ["pause", "ended", "seeked"]) video.addEventListener(event, flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      flush();
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("timeupdate", tick);
      for (const event of ["pause", "ended", "seeked"]) video.removeEventListener(event, flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [url]);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setSubtitleUrl("");
    setStatus("loading");
    setEnabled(true);
    const source = new URL(url, window.location.href);
    source.searchParams.set("subtitles", "1");
    fetch(source, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (response.status === 404) {
          if (!controller.signal.aborted) setStatus("missing");
          return;
        }
        if (!response.ok) throw new Error("subtitle_load_failed");
        const content = await response.text();
        if (!content.startsWith("WEBVTT")) throw new Error("subtitle_load_failed");
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([content], { type: "text/vtt" }));
        setSubtitleUrl(objectUrl);
      })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  useEffect(() => {
    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    const sync = () => setEnabled(tracks[0]?.mode === "showing");
    tracks.addEventListener("change", sync);
    return () => tracks.removeEventListener("change", sync);
  }, [url]);

  function toggle() {
    const track = videoRef.current?.textTracks[0];
    if (!track) return;
    const showing = track.mode !== "showing";
    track.mode = showing ? "showing" : "disabled";
    setEnabled(showing);
  }

  return <>
    <video ref={videoRef} src={url} controls autoPlay playsInline>
      {subtitleUrl && <track key={subtitleUrl} kind="subtitles" label={t("subtitle_external")} src={subtitleUrl} default
        onLoad={event => {
          event.currentTarget.track.mode = "showing";
          setEnabled(true);
          setStatus("ready");
        }} onError={() => setStatus("error")} />}
    </video>
    <div className="playback-subtitles">
      {status === "ready" ? <button type="button" className="dialog-button dialog-button--ghost"
        aria-label={t("subtitle_toggle")} aria-pressed={enabled} onClick={toggle}>
        {t(enabled ? "subtitle_on" : "subtitle_off")}
      </button> : <p role="status">{t(status === "loading" ? "subtitle_loading" : status === "missing" ? "subtitle_none" : "subtitle_load_failed")}</p>}
    </div>
  </>;
}
