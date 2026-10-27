import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getPictureContentUrl } from './api/raspberryApi.js';
import { PHOTO_PLACEHOLDER, requestThumbnail } from './photoThumbnails.js';
import { attachPhotoMapZoom } from './photoMapZoom.js';
import { photoCountryView } from './photoCountryView.js';
import { intlLocale } from './i18n/languages.js';
import { hasLocation } from './photoLibrary.js';

export default function PhotoLocationMap({ photo, s, language, previewUrl, editing = false, position = photo, onPositionChange, placeLabel }) {
  const element = useRef(null), reset = useRef(null), map = useRef(null), pin = useRef(null);
  const callbacks = useRef(null);
  callbacks.current = { editing, onPositionChange };
  const [offline, setOffline] = useState(false);
  const framing = useMemo(() => photoCountryView(photo), [photo.latitude, photo.longitude]);
  let country = framing?.name;
  if (framing?.code && /^[A-Z]{2}$/.test(framing.code)) {
    try { country = new Intl.DisplayNames([intlLocale(language)], { type: 'region' }).of(framing.code); } catch { /* Use the dataset name. */ }
  }
  useEffect(() => {
    const view = L.map(element.current, { minZoom: 1, maxZoom: 18, zoomSnap: 0, worldCopyJump: true, scrollWheelZoom: false, zoomControl: false });
    map.current = view;
    L.control.zoom({ zoomInTitle: s.zoomIn, zoomOutTitle: s.zoomOut }).addTo(view);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).on('tileerror', () => setOffline(true)).addTo(view);
    reset.current = () => {
      view.invalidateSize({ pan: false });
      const zoom = framing?.bounds ? Math.min(framing.maxZoom,
        view.getBoundsZoom(L.latLngBounds(framing.bounds), false, L.point(90, 90))) : framing?.zoom ?? 2;
      // Keep the photo at the center, using the country's extent to choose scale.
      // The +/− controls then zoom toward the photograph instead of losing its pin.
      view.setView(framing?.center || [20, 0], zoom, { animate: false });
    };
    reset.current();
    const content = document.createElement('div'); content.className = 'photo-location-pin';
    const image = document.createElement('img'); image.src = previewUrl || PHOTO_PLACEHOLDER; image.alt = ''; content.append(image);
    const controller = new AbortController();
    if (!previewUrl && photo.relativePath) requestThumbnail(getPictureContentUrl(photo.relativePath, 'thumb'), controller.signal)
      .then(url => { if (!controller.signal.aborted) image.src = url; }).catch(() => {});
    const marker = L.marker(framing?.center || [0, 0], { icon: L.divIcon({ html: content, className: 'photo-location-marker', iconSize: [58, 66], iconAnchor: [29, 64] }),
      draggable: false, autoPan: true, title: photo.title || photo.name, alt: photo.title || photo.name });
    pin.current = marker;
    const choose = latlng => {
      if (!callbacks.current.editing) return;
      const wrapped = latlng.wrap();
      callbacks.current.onPositionChange?.({ latitude: Math.max(-90, Math.min(90, wrapped.lat)), longitude: wrapped.lng });
    };
    view.on('click', event => choose(event.latlng));
    marker.on('dragend', () => choose(marker.getLatLng()));
    const label = document.createElement('span'); label.textContent = photo.title || photo.name;
    marker.bindTooltip(label, { direction: 'top', offset: [0, -65] });
    const detachZoom = attachPhotoMapZoom(view);
    const observer = new ResizeObserver(() => view.invalidateSize({ pan: false })); observer.observe(element.current);
    return () => { controller.abort(); observer.disconnect(); detachZoom(); tiles.off(); view.remove(); reset.current = null; map.current = null; pin.current = null; };
  }, [photo.id, photo.latitude, photo.longitude, photo.relativePath, previewUrl, s]);
  useEffect(() => {
    const view = map.current, marker = pin.current;
    if (!view || !marker) return;
    if (position && hasLocation(position)) {
      marker.setLatLng([position.latitude, position.longitude]);
      if (!view.hasLayer(marker)) marker.addTo(view);
    } else if (view.hasLayer(marker)) view.removeLayer(marker);
    if (editing) marker.dragging?.enable(); else marker.dragging?.disable();
  }, [position?.latitude, position?.longitude, editing, photo.id, photo.latitude, photo.longitude, photo.relativePath, previewUrl, s]);
  return <div className={`photo-location-map${editing ? ' is-editing' : ''}`}>
    <div className="photo-location-map__toolbar"><div><strong>{placeLabel || (editing ? s.photoLocation : country) || s.photoLocation}</strong><span>{editing ? s.choosePhotoLocation : s.countryMapHint}</span></div>
      <button type="button" onClick={() => reset.current?.()}>{s.resetCountryView}</button></div>
    <div ref={element} className="photo-location-map__canvas" role="region" aria-label={`${s.photoLocation}: ${photo.title || photo.name}`} />
    {offline && <p className="photo-location-map__offline" role="status">{s.mapOffline}</p>}
  </div>;
}
