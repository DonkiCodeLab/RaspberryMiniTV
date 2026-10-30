import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getApiBaseUrl, isMockMode, photoRequest } from './api/raspberryApi.js';
import { mobilePairingURL, suggestedMobileAddress } from './photoMobilePairing.js';
import PhotoMobileAppDialog from './PhotoMobileAppDialog.jsx';
import './PhotoMobilePairing.css';

const words = {
  es: { title: 'Del móvil a tu MiniTV', eyebrow: 'TUS FOTOS, SIN CABLES', appQR: 'Ver QR de la última actualización', hint: 'Escanea con {app} para Android o iPhone. También puedes abrir el enlace con una cámara compatible si ya tienes la app instalada. Ambos dispositivos deben estar en la misma red.', address: 'Dirección de la MiniTV · IP y puerto', invalid: 'Introduce la dirección de red de la MiniTV, por ejemplo http://192.168.1.50:5050. localhost no sirve desde el móvil.', waiting: 'Esperando al móvil', connected: 'Conectado', expired: 'El QR ha caducado', generate: 'Generar nuevo QR', disconnect: 'Desconectar móvil', preparing: 'Preparando enlace…', expires: 'El QR caduca en', open: 'Abrir MiniTV Fotos', privacy: 'El enlace permite importar fotos durante 24 horas. No incluye tu PIN.', demo: 'Conecta la web a tu MiniTV para enlazar un móvil. El modo demo no recibe fotos.', retry: 'Reintentar' },
  ca: { title: 'Del mòbil a la MiniTV', eyebrow: 'LES TEVES FOTOS, SENSE CABLES', appQR: 'Veure el QR de l’última actualització', hint: 'Escaneja amb {app} per a Android o iPhone. També pots obrir l’enllaç amb una càmera compatible si ja tens l’app instal·lada. Els dos dispositius han de ser a la mateixa xarxa.', address: 'Adreça de la MiniTV · IP i port', invalid: 'Introdueix l’adreça de xarxa de la MiniTV, per exemple http://192.168.1.50:5050. localhost no funciona des del mòbil.', waiting: 'Esperant el mòbil', connected: 'Connectat', expired: 'El QR ha caducat', generate: 'Generar un QR nou', disconnect: 'Desconnectar el mòbil', preparing: 'Preparant l’enllaç…', expires: 'El QR caduca en', open: 'Obrir MiniTV Fotos', privacy: 'L’enllaç permet importar fotos durant 24 hores. No inclou el teu PIN.', demo: 'Connecta la web a la MiniTV per enllaçar un mòbil. El mode demo no rep fotos.', retry: 'Tornar-ho a provar' },
  en: { title: 'From your phone to MiniTV', eyebrow: 'YOUR PHOTOS, WIRELESSLY', appQR: 'View the latest update QR code', hint: 'Scan with {app} for Android or iPhone. A compatible camera can also open the link when the app is installed. Both devices must be on the same network.', address: 'MiniTV address · IP and port', invalid: 'Enter the MiniTV network address, for example http://192.168.1.50:5050. localhost cannot be reached from your phone.', waiting: 'Waiting for your phone', connected: 'Connected', expired: 'This QR code has expired', generate: 'Generate a new QR code', disconnect: 'Disconnect phone', preparing: 'Preparing connection…', expires: 'QR code expires in', open: 'Open MiniTV Fotos', privacy: 'The connection allows photo imports for 24 hours. It does not contain your PIN.', demo: 'Connect this website to your MiniTV to pair a phone. Demo mode cannot receive photos.', retry: 'Retry' },
};

export default function PhotoMobilePairing({ language }) {
  const s = words[language] || words.en;
  const [showApp, setShowApp] = useState(false);
  const [hintBefore, hintAfter] = s.hint.split('{app}');
  const [pair, setPair] = useState(null), [address, setAddress] = useState('');
  const [status, setStatus] = useState({ state: 'waiting' }), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [qr, setQR] = useState(''), [now, setNow] = useState(Date.now());
  const demo = isMockMode();
  async function generate(signal) {
    setBusy(true); setError(''); setQR('');
    try {
      if (pair) await photoRequest('mobile/revoke', { id: pair.id }, signal);
      setPair(null);
      const next = await photoRequest('mobile/pairing', {}, signal);
      if (signal?.aborted) return;
      setPair(next); setStatus({ state: 'waiting' }); setNow(Date.now());
      setAddress(previous => previous || suggestedMobileAddress(getApiBaseUrl(), next.localAddress));
    } catch (e) { if (!signal?.aborted) setError(e.message); }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    generate(controller.signal);
    return () => controller.abort();
  }, [demo]);
  useEffect(() => {
    if (!pair) return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const next = await photoRequest(`mobile/pairing/${pair.id}`, undefined, controller.signal);
        if (!controller.signal.aborted) { setStatus(next); setError(''); }
      } catch (e) { if (!controller.signal.aborted) setError(e.message); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    }
    poll();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); clearTimeout(timer); clearInterval(clock); };
  }, [pair]);
  const remaining = Math.max(0, Math.ceil((pair?.expiresAt || 0) - now / 1000));
  const connected = status.state === 'connected';
  let link = '', invalid = false;
  if (pair && remaining && !connected && status.state !== 'expired') {
    try { link = mobilePairingURL(address, pair.code); } catch { invalid = true; }
  }
  useEffect(() => {
    let active = true; setQR('');
    if (link) QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 4, width: 320 })
      .then(data => { if (active) setQR(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [link]);
  return <section className="photo-mobile" aria-labelledby="photo-mobile-title">
    <span className="photo-mobile__eyebrow">{s.eyebrow}</span>
    <h3 id="photo-mobile-title">{s.title}</h3>
    <p>{hintBefore}<button className="photo-mobile__app-link" type="button" aria-haspopup="dialog"
      title={s.appQR} aria-label={`MiniTV Fotos · ${s.appQR}`} onClick={() => setShowApp(true)}>MiniTV Fotos</button>{hintAfter}</p>
    {demo && <p>{s.demo}</p>}
    {!demo && <>
      <div className="photo-mobile__code">
        {qr && link ? <img src={qr} width="240" height="240" alt="QR · MiniTV Fotos" /> : <span aria-live="polite">{busy ? s.preparing : connected ? `✓ ${s.connected}: ${status.deviceName}` : pair && !remaining ? s.expired : '▦'}</span>}
      </div>
      <label className="photo-mobile__address">{s.address}<input type="url" value={address} onChange={e => setAddress(e.target.value)} spellCheck={false} disabled={busy || connected} placeholder="http://192.168.1.50:5050" aria-invalid={invalid} /></label>
      {invalid && <p className="photo-mobile__error" role="alert">{s.invalid}</p>}
      {error && <p className="photo-mobile__error" role="alert">{error}</p>}
      {link && <p className="photo-mobile__status">{s.waiting} · {s.expires} {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>}
      <div className="photo-mobile__actions">
        {link && <a className="dialog-button dialog-button--accent" href={link}>{s.open}</a>}
        <button className="dialog-button dialog-button--ghost" type="button" disabled={busy} onClick={() => generate()}>{connected ? s.disconnect : error ? s.retry : s.generate}</button>
      </div>
      <small>{s.privacy}</small>
    </>}
    {showApp && <PhotoMobileAppDialog language={language} onClose={() => setShowApp(false)} />}
  </section>;
}
