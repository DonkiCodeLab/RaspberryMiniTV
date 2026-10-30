import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import publication from '../../ExpoGoApp/publication.json';
import PhotoDetailDialog from './PhotoDetailDialog.jsx';
import { intlLocale } from './i18n/languages.js';

const words = {
  es: { latest: 'Última actualización', hint: 'Abre MiniTV Fotos en Expo Go. En iPhone, escanea este QR con Cámara; en Android, con Expo Go.', next: 'Cuando se abra la app, vuelve a esta pantalla y escanea el QR de conexión desde MiniTV Fotos.', open: 'Abrir en Expo Go', publication: 'Ver publicación en Expo', published: 'Publicada', loading: 'Preparando QR…', error: 'No se ha podido mostrar el QR. Puedes abrir la publicación en Expo.', close: 'Cerrar' },
  ca: { latest: 'Última actualització', hint: 'Obre MiniTV Fotos a Expo Go. A l’iPhone, escaneja aquest QR amb Càmera; a Android, amb Expo Go.', next: 'Quan s’obri l’app, torna a aquesta pantalla i escaneja el QR de connexió des de MiniTV Fotos.', open: 'Obrir a Expo Go', publication: 'Veure publicació a Expo', published: 'Publicada', loading: 'Preparant QR…', error: 'No s’ha pogut mostrar el QR. Pots obrir la publicació a Expo.', close: 'Tancar' },
  en: { latest: 'Latest update', hint: 'Open MiniTV Fotos in Expo Go. On iPhone, scan this QR code with Camera; on Android, use Expo Go.', next: 'Once the app opens, return to this screen and scan the connection QR code from MiniTV Fotos.', open: 'Open in Expo Go', publication: 'View update on Expo', published: 'Published', loading: 'Preparing QR code…', error: 'The QR code could not be displayed. You can open the update on Expo.', close: 'Close' },
};

export default function PhotoMobileAppDialog({ language, onClose }) {
  const s = words[language] || words.en;
  const [qr, setQR] = useState(''), [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(publication.expoGoUrl, { errorCorrectionLevel: 'M', margin: 4, width: 320 })
      .then(value => { if (active) setQR(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return <PhotoDetailDialog title="MiniTV Fotos" subtitle={s.latest} s={s} onClose={onClose} className="photo-mobile-app-dialog">
    <p>{s.hint}</p>
    <div className="photo-mobile__code photo-mobile-app-dialog__code">
      {qr ? <img src={qr} width="320" height="320" alt="QR · MiniTV Fotos · Expo Go" /> :
        <span role={error ? 'alert' : 'status'}>{error ? s.error : s.loading}</span>}
    </div>
    <p className="photo-mobile-app-dialog__date">{s.published} · <time dateTime={publication.publishedAt}>
      {new Intl.DateTimeFormat(intlLocale(language), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(publication.publishedAt))}
    </time></p>
    <div className="photo-mobile__actions">
      <a className="dialog-button dialog-button--accent" href={publication.expoGoUrl}>{s.open}</a>
      <a className="dialog-button dialog-button--ghost" href={publication.pageUrl} target="_blank" rel="noopener noreferrer">{s.publication} ↗</a>
    </div>
    <p>{s.next}</p>
  </PhotoDetailDialog>;
}
