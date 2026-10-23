import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getPictureContentUrl } from './api/raspberryApi.js';
import { PHOTO_PLACEHOLDER, requestThumbnail } from './photoThumbnails.js';
import { attachPhotoMapZoom } from './photoMapZoom.js';
import { photoCountryView } from './photoCountryView.js';
import { intlLocale } from './i18n/languages.js';

export default function PhotoLocationMap({ photo, s, language, previewUrl }) {
  const element = useRef(null), reset = useRef(null);
  const [offline, setOffline] = useState(false);
  const framing = useMemo(() => photoCountryView(photo), [photo.latitude, photo.longitude]);
  let country = framing?.name;
  if (framing?.code && /^[A-Z]{2}$/.test(framing.code)) {
    try { country = new Intl.DisplayNames([intlLocale(language)], { type: 'region' }).of(framing.code); } catch { /* Use the dataset name. */ }
  }
  useEffect(() => {
    if (!framing) return;
    const view = L.map(element.current, { minZoom: 1, maxZoom: 18, zoomSnap: 0, worldCopyJump: true, scrollWheelZoom: false, zoomControl: false });
    L.control.zoom({ zoomInTitle: s.zoomIn, zoomOutTitle: s.zoomOut }).addTo(view);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).on('tileerror', () => setOffline(true)).addTo(view);
    reset.current = () => {
      view.invalidateSize({ pan: false });
      const zoom = framing.bounds ? Math.min(framing.maxZoom,
        view.getBoundsZoom(L.latLngBounds(framing.bounds), false, L.point(90, 90))) : framing.zoom;
      // Keep the photo at the center, using the country's extent to choose scale.
      // The +/− controls then zoom toward the photograph instead of losing its pin.
      view.setView(framing.center, zoom, { animate: false });
    };
    reset.current();
    const content = document.createElement('div'); content.className = 'photo-location-pin';
    const image = document.createElement('img'); image.src = previewUrl || PHOTO_PLACEHOLDER; image.alt = ''; content.append(image);
    const controller = new AbortController();
    if (!previewUrl && photo.relativePath) requestThumbnail(getPictureContentUrl(photo.relativePath, 'thumb'), controller.signal)
      .then(url => { if (!controller.signal.aborted) image.src = url; }).catch(() => {});
    const marker = L.marker(framing.center, { icon: L.divIcon({ html: content, className: 'photo-location-marker', iconSize: [58, 66], iconAnchor: [29, 64] }),
      title: photo.title || photo.name, alt: photo.title || photo.name }).addTo(view);
    const label = document.createElement('span'); label.textContent = photo.title || photo.name;
    marker.bindTooltip(label, { direction: 'top', offset: [0, -65] });
    const detachZoom = attachPhotoMapZoom(view);
    const observer = new ResizeObserver(() => view.invalidateSize({ pan: false })); observer.observe(element.current);
    return () => { controller.abort(); observer.disconnect(); detachZoom(); tiles.off(); view.remove(); reset.current = null; };
  }, [photo.id, photo.latitude, photo.longitude, photo.relativePath, previewUrl, s]);
  return <div className="photo-location-map">
    <div className="photo-location-map__toolbar"><div><strong>{country || s.photoLocation}</strong><span>{s.countryMapHint}</span></div>
      <button type="button" onClick={() => reset.current?.()}>{s.resetCountryView}</button></div>
    <div ref={element} className="photo-location-map__canvas" role="region" aria-label={`${s.photoLocation}: ${photo.title || photo.name}`} />
    {offline && <p className="photo-location-map__offline" role="status">{s.mapOffline}</p>}
  </div>;
}
