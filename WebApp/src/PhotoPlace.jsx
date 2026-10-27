import React, { useEffect, useState } from 'react';
import { photoRequest } from './api/raspberryApi.js';
import { createPlaceResolver, placeKey, placeLabel } from './photoPlaces.js';

const resolver = createPlaceResolver(data => photoRequest('places/resolve', data));

export function usePhotoPlace(position, enabled = true) {
  const key = placeKey(position);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false, timer, attempts = 0;
    const [latitude, longitude] = key.split(',').map(Number);
    async function load() {
      const result = await resolver.resolve({ latitude, longitude });
      if (cancelled) return;
      // Brief throttling is retried only while this position is still visible.
      if (result.status === 'busy' && result.retryAfter <= 5 && ++attempts < 4) {
        setSaved({ key, result });
        timer = setTimeout(load, (result.retryAfter || 1.1) * 1000 + 50);
      } else setSaved({ key, result: result.status === 'busy' ? { status: 'unavailable' } : result });
    }
    // Skip transient positions while dragging, typing or quickly changing photos.
    timer = setTimeout(load, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, enabled]);
  return key ? (saved?.key === key ? saved.result : resolver.peek(position)) : null;
}

export function PlaceLabel({ place, language }) {
  const label = placeLabel(place, language);
  if (!label) return null;
  return <span className="photo-place"><span className="photo-place__name" title={label}>{label}</span>
    <a className="photo-place__credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"
      title="Photon · © OpenStreetMap contributors" onClick={event => event.stopPropagation()}>© OpenStreetMap</a></span>;
}

export default function PhotoPlace({ position, language, enabled = true }) {
  const place = usePhotoPlace(position, enabled);
  return <PlaceLabel place={place} language={language} />;
}
