import React, { useEffect, useRef, useState } from "react";
import { preferredSubtitle, styleSubtitleCues, subtitleLabel, subtitleStrings, subtitleUrl } from "./browserSubtitles.js";
import "./BrowserSubtitles.css";

export function SubtitleSelectors({ tracks, primary, auxiliary, onPrimary, onAuxiliary, language = "es" }) {
  const s = subtitleStrings[language] || subtitleStrings.es;
  if (!tracks.length) return null;
  const options = excluded => tracks.map((track, index) => <option key={track.id} value={track.id}
    disabled={!track.available || track.id === excluded}>{subtitleLabel(track, index, language)}</option>);
  return <div className="browser-subtitles__selectors">
    <label><span>{s.primary}</span><select value={primary} onChange={event => onPrimary(event.target.value)}>
      <option value="">{s.off}</option>{options(auxiliary)}
    </select></label>
    {tracks.filter(track => track.available).length > 1 && <label className="browser-subtitles__auxiliary">
      <span>{s.auxiliary}</span><select value={auxiliary} onChange={event => onAuxiliary(event.target.value)}>
        <option value="">{s.off}</option>{options(primary)}
      </select><small>{s.auxiliaryHint}</small>
    </label>}
  </div>;
}

export function useBrowserSubtitles(source, language) {
  const [inventory, setInventory] = useState(null), [failed, setFailed] = useState(false);
  const [primary, setPrimary] = useState(""), [auxiliary, setAuxiliary] = useState("");
  const [retry, setRetry] = useState(0);
  const initialLanguage = useRef(language);
  initialLanguage.current = language;
  useEffect(() => {
    const controller = new AbortController();
    setInventory(null); setFailed(false); setPrimary(""); setAuxiliary("");
    fetch(subtitleUrl(source, "list", window.location.href), { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("subtitle_inventory_failed");
        const result = await response.json();
        if (!Array.isArray(result.tracks)) throw new Error("subtitle_inventory_failed");
        if (controller.signal.aborted) return;
        setInventory(result);
        setPrimary(preferredSubtitle(result.tracks, initialLanguage.current));
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [source, retry]);
  return { inventory, failed, primary, auxiliary, setPrimary, setAuxiliary, retry: () => setRetry(n => n + 1) };
}

export function BrowserSubtitleTrack({ source, id, auxiliary = false, label, onStatus }) {
  const element = useRef(null), callback = useRef(onStatus);
  callback.current = onStatus;
  const [url, setUrl] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setUrl(""); callback.current?.("loading");
    fetch(subtitleUrl(source, id, window.location.href), { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("subtitle_load_failed");
        const content = await response.text();
        if (!content.startsWith("WEBVTT")) throw new Error("subtitle_load_failed");
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([content], { type: "text/vtt" }));
        setUrl(objectUrl);
      }).catch(() => { if (!controller.signal.aborted) callback.current?.("error"); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, id]);
  useEffect(() => {
    const track = element.current;
    if (!track) return;
    let styled = false;
    const loaded = () => {
      if (!styled) { styleSubtitleCues(track.track, auxiliary); styled = true; }
      callback.current?.("ready");
    };
    const failed = () => callback.current?.("error");
    track.addEventListener("load", loaded); track.addEventListener("error", failed);
    track.track.mode = "hidden"; // Trigger cue loading even for the auxiliary track.
    if (track.readyState === 2) loaded(); else if (track.readyState === 3) failed();
    return () => { track.track.mode = "disabled"; track.removeEventListener("load", loaded); track.removeEventListener("error", failed); };
  }, [url, auxiliary]);
  return url ? <track ref={element} src={url} kind="subtitles" label={label} default={!auxiliary} /> : null;
}
