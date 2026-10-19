import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { visibleMapClusters, hasLocation } from './photoLibrary.js';
import { getPictureContentUrl } from './api/raspberryApi.js';
import { PHOTO_PLACEHOLDER, requestThumbnail } from './photoThumbnails.js';

export default function PhotoMap({ photos, onCluster, s }) {
  const element = useRef(null), map = useRef(null), layer = useRef(null), latest = useRef({ photos, onCluster, s });
  latest.current = { photos, onCluster, s };
  const [offline, setOffline] = useState(false);
  const draw = useRef(null);
  useEffect(() => {
    const view = L.map(element.current, { minZoom: 2, maxZoom: 18, worldCopyJump: true, scrollWheelZoom: false }).setView([22, 0], 2);
    map.current = view;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      maxZoom: 19,
    }).on('tileerror', () => setOffline(true)).addTo(view);
    layer.current = L.layerGroup().addTo(view);
    let thumbnails;
    draw.current = () => {
      thumbnails?.abort(); thumbnails = new AbortController();
      const signal = thumbnails.signal;
      layer.current.clearLayers();
      const bounds = view.getBounds();
      for (const cluster of visibleMapClusters(latest.current.photos, view.getZoom(), {
        south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast(),
      })) {
        const content = document.createElement('div'); content.className = 'photo-map-pin';
        const img = document.createElement('img'); img.decoding = 'async'; img.src = PHOTO_PLACEHOLDER; img.alt = ''; content.append(img);
        requestThumbnail(getPictureContentUrl(cluster.photos[0].relativePath, 'thumb'), signal).then(url => { if (!signal.aborted) img.src = url; }).catch(() => {});
        const count = document.createElement('span'); count.textContent = cluster.photos.length; content.append(count);
        const label = `${cluster.photos.length} ${latest.current.s.photos}`;
        L.marker([cluster.latitude, cluster.longitude], { icon: L.divIcon({ html: content, className: 'photo-map-marker', iconSize: [58, 66], iconAnchor: [29, 64] }),
          keyboard: true, title: label, alt: label }).addTo(layer.current).on('click', () => latest.current.onCluster(cluster.photos));
      }
    };
    view.on('moveend', () => draw.current?.()); draw.current();
    const located = latest.current.photos.filter(hasLocation);
    if (located.length) view.fitBounds(located.map(p => [p.latitude, p.longitude]), { padding: [50, 50], maxZoom: 10 });
    const observer = new ResizeObserver(() => view.invalidateSize()); observer.observe(element.current);
    return () => { thumbnails?.abort(); observer.disconnect(); view.remove(); map.current = null; draw.current = null; };
  }, []);
  useEffect(() => { draw.current?.(); }, [photos]);
  return <div className="photo-map"><p>{s.mapHint}</p><div ref={element} className="photo-map__canvas" role="region" aria-label={s.map} />
    {offline && <p role="status">{s.mapOffline}</p>}
    {!photos.some(hasLocation) && <p>{s.noMap}</p>}
    <small>{photos.filter(p => !hasLocation(p)).length} {s.missingGps}</small>
  </div>;
}
