import React, { useEffect, useRef, useState } from 'react';
import { Map as LibreMap, Marker, NavigationControl, GeolocateControl, ScaleControl, setWorkerUrl, addProtocol } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { hasLocation } from './photoLibrary.js';
import { getPictureContentUrl } from './api/raspberryApi.js';
import { PHOTO_PLACEHOLDER, requestThumbnail } from './photoThumbnails.js';
import { IMMICH_MAP_STYLE, PHOTO_MAP_SOURCE, PHOTO_MAP_LAYER, photoMapStyle, photoMapFeatures, photoMapBounds, photoMapCoordinates, photoClusterIds } from './photoMapData.js';
import { attachPhotoMarkerActions } from './photoMapActions.js';
import { attachMapLibrePhotoZoom } from './photoMapZoom.js';

const protocol = new Protocol();
addProtocol('pmtiles', protocol.tile);

export default function PhotoMap({ photos, onPhoto, onCluster, s, viewState }) {
  const element = useRef(null), map = useRef(null), update = useRef(null), latest = useRef(null);
  latest.current = { photos, onPhoto, onCluster, s };
  const [offline, setOffline] = useState(false), [failed, setFailed] = useState(false), [message, setMessage] = useState('');
  const [projection, setProjection] = useState(viewState?.current?.projection || 'mercator');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController(), markers = new Map();
    let view, observer, detachZoom, active = true, action, revision = 0, framed = !!viewState?.current;
    let photosById = new Map(latest.current.photos.map(photo => [photo.id, photo]));
    setOffline(false); setFailed(false); setReady(false); setMessage('');
    const saveView = () => {
      if (viewState && view) viewState.current = { center: view.getCenter().toArray(), zoom: view.getZoom(),
        bearing: view.getBearing(), pitch: view.getPitch(), projection: view.getProjection()?.type || 'mercator' };
    };
    const clearMarkers = () => {
      for (const entry of markers.values()) { entry.abort.abort(); entry.detach(); entry.marker.remove(); }
      markers.clear();
    };
    const framePhotos = () => {
      if (framed) return;
      const bounds = photoMapBounds(latest.current.photos);
      if (bounds) { view.fitBounds(bounds, { padding: 75, maxZoom: 10, duration: 0 }); framed = true; }
    };
    const interact = async (entry, openGroup = false) => {
      action?.abort(); action = new AbortController();
      const signal = action.signal, version = revision, properties = entry.feature.properties;
      setMessage('');
      try {
        if (!properties.cluster) {
          const photo = photosById.get(properties.id);
          if (photo) latest.current.onPhoto(photo);
          return;
        }
        const source = view.getSource(PHOTO_MAP_SOURCE);
        if (!openGroup) {
          const zoom = await source.getClusterExpansionZoom(properties.cluster_id);
          if (!signal.aborted && active && revision === version) view.easeTo({
            center: entry.marker.getLngLat(), zoom: Math.min(view.getMaxZoom(), zoom), duration: 450,
          });
        } else {
          const ids = await photoClusterIds(source, properties.cluster_id, properties.point_count, signal);
          if (!signal.aborted && active && revision === version) latest.current.onCluster(ids.map(id => photosById.get(id)).filter(Boolean));
        }
      } catch { if (!signal.aborted && active && revision === version) setMessage(latest.current.s.mapGroupError); }
    };
    const draw = () => {
      if (!view.getLayer(PHOTO_MAP_LAYER) || !view.isSourceLoaded(PHOTO_MAP_SOURCE)) return;
      const visible = new Set();
      const canvas = view.getContainer(), center = view.getCenter().lng, projection = view.getProjection()?.type;
      // Source queries also work when the viewport corners lie outside the globe.
      // A full-viewport rendered-feature query can be empty in that projection.
      for (const feature of view.querySourceFeatures(PHOTO_MAP_SOURCE)) {
        const coordinates = photoMapCoordinates(feature.geometry.coordinates, center, projection);
        const point = view.project(coordinates);
        if (point.x < -60 || point.x > canvas.clientWidth + 60 || point.y < -60 || point.y > canvas.clientHeight + 60) continue;
        const properties = feature.properties, grouped = !!properties.cluster;
        const key = grouped ? `cluster:${properties.cluster_id}` : `photo:${properties.id}`;
        if (visible.has(key)) continue;
        visible.add(key);
        let entry = markers.get(key);
        if (!entry) {
          const wrapper = document.createElement('div'); wrapper.className = 'photo-map-marker';
          const button = document.createElement('button'); button.type = 'button'; wrapper.append(button);
          button.className = grouped ? 'photo-map-cluster' : 'photo-map-pin';
          const abort = new AbortController();
          entry = { feature, abort, marker: new Marker({ element: wrapper }).setLngLat(coordinates).addTo(view) };
          if (grouped) {
            button.textContent = properties.point_count.toLocaleString();
            button.title = `${properties.point_count} ${s.photos}. ${s.mapClusterHint}`;
            button.setAttribute('aria-keyshortcuts', 'Shift+Enter');
          } else {
            const photo = photosById.get(properties.id);
            button.title = `${s.mapOpenPhoto}: ${photo?.title || photo?.name || s.photos}`;
            const img = document.createElement('img'); img.decoding = 'async'; img.src = PHOTO_PLACEHOLDER; img.alt = ''; img.draggable = false; button.append(img);
            if (photo?.relativePath) requestThumbnail(getPictureContentUrl(photo.relativePath, 'thumb'), abort.signal)
              .then(url => { if (!abort.signal.aborted) img.src = url; }).catch(() => {});
          }
          button.setAttribute('aria-label', button.title);
          entry.detach = attachPhotoMarkerActions(button, { activate: () => interact(entry), openGroup: grouped ? () => interact(entry, true) : undefined });
          markers.set(key, entry);
        }
        entry.feature = feature;
      }
      for (const [key, entry] of markers) if (!visible.has(key)) {
        entry.abort.abort(); entry.detach(); entry.marker.remove(); markers.delete(key);
      }
    };
    const start = async () => {
      // Vite packages the module worker and its imports locally for production.
      const { default: workerUrl } = await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url');
      if (!active) return;
      setWorkerUrl(workerUrl);
      photosById = new Map(latest.current.photos.map(photo => [photo.id, photo]));
      const saved = viewState?.current;
      view = new LibreMap({ container: element.current, minZoom: 0, maxZoom: 18, center: saved?.center || [0, 22],
        zoom: saved?.zoom ?? 1.5, bearing: saved?.bearing || 0, pitch: saved?.pitch || 0,
        style: photoMapStyle({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#fff' } }] }, latest.current.photos, saved?.projection),
        locale: { 'NavigationControl.ZoomIn': s.zoomIn, 'NavigationControl.ZoomOut': s.zoomOut,
          'NavigationControl.ResetBearing': s.mapNorth, 'GeolocateControl.FindMyLocation': s.mapLocate,
          'GeolocateControl.LocationNotAvailable': s.mapLocationUnavailable, 'AttributionControl.ToggleAttribution': s.mapAttribution },
      });
      map.current = view;
      detachZoom = attachMapLibrePhotoZoom(view);
      view.addControl(new NavigationControl(), 'top-left');
      const geolocate = new GeolocateControl({ positionOptions: { enableHighAccuracy: true, timeout: 10000 }, fitBoundsOptions: { maxZoom: 14 } });
      geolocate.on('error', event => setMessage(event.code === 1 ? s.mapLocationDenied : s.mapLocationUnavailable));
      geolocate.on('geolocate', () => setMessage(''));
      view.addControl(geolocate, 'top-left');
      view.addControl(new ScaleControl({ unit: 'metric' }));
      view.on('error', () => { if (active) setOffline(true); });
      view.on('moveend', saveView);
      view.on('render', draw);
      view.on('style.load', () => { framePhotos(); setReady(true); });
      update.current = () => {
        revision++; action?.abort(); clearMarkers();
        photosById = new Map(latest.current.photos.map(photo => [photo.id, photo]));
        view.getSource(PHOTO_MAP_SOURCE)?.setData(photoMapFeatures(latest.current.photos));
        framePhotos();
      };
      observer = new ResizeObserver(() => view.resize()); observer.observe(element.current);
      try {
        const response = await fetch(import.meta.env.VITE_PHOTO_MAP_STYLE_URL || IMMICH_MAP_STYLE, { signal: controller.signal });
        if (!response.ok) throw new Error('Map style unavailable');
        const style = await response.json();
        if (!active) return;
        revision++; action?.abort(); clearMarkers();
        view.setStyle(photoMapStyle(style, latest.current.photos, view.getProjection()?.type), { diff: false });
      } catch { if (active) setOffline(true); }
    };
    start().catch(() => { if (active) setFailed(true); });
    return () => {
      active = false; controller.abort(); action?.abort(); observer?.disconnect(); detachZoom?.(); clearMarkers();
      saveView(); view?.remove(); map.current = null; update.current = null;
    };
  }, [s, viewState]);
  useEffect(() => { update.current?.(); }, [photos]);
  const changeProjection = type => {
    const view = map.current;
    if (!view) return;
    view.setProjection({ type });
    if (type === 'mercator') view.easeTo({ pitch: 0, bearing: 0, duration: 300 });
    setProjection(type);
    if (viewState?.current) viewState.current.projection = type;
  };
  return <div className="photo-map">
    <div className="photo-map__stage">
      <div ref={element} className="photo-map__canvas" role="region" aria-label={s.map} />
      {!failed && <div className="photo-map__projection" role="group" aria-label={s.mapProjection}>
        <button type="button" disabled={!ready} aria-pressed={projection === 'mercator'} onClick={() => changeProjection('mercator')}>{s.map2d}</button>
        <button type="button" disabled={!ready} aria-pressed={projection === 'globe'} onClick={() => changeProjection('globe')}>{s.map3d}</button>
      </div>}
      {failed && <p className="photo-map__error" role="alert">{s.mapUnavailable}</p>}
    </div>
    <p>{s.mapHint}</p>
    {offline && !failed && <p role="status">{s.mapOffline}</p>}
    {message && <p role="status">{message}</p>}
    {!photos.some(hasLocation) && <p>{s.noMap}</p>}
    <small>{photos.filter(photo => !hasLocation(photo)).length} {s.missingGps}</small>
  </div>;
}
