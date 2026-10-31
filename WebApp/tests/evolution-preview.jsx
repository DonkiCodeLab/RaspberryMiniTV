// Manual QA page: bundled illustrations and invented dates, no library writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PersonPhotoEvolution from '../src/PersonPhotoEvolution.jsx';
import { Modal } from '../src/PhotosLibrary.jsx';
import { photoStrings } from '../src/photoStrings.js';
import '../src/styles.css';

const photos = ['2000-05-10', '2000-06-10', '2000-06-25', '2003-06-10', '2008-08-12', '2015-01-10', null].map((takenAt, i) => ({
  id: `sample-${i}`, name: `Ilustración de prueba ${i + 1}`, relativePath: '/avatars/avatar-08.jpg', takenAt,
}));
const sample = { id: 'sample', name: 'Ejemplo · fechas ficticias', birthDate: '2000-05-10',
  faceBoxes: Object.fromEntries(photos.map((photo, i) => [photo.id, [{ id: `face-${i}`, box: { x: .45, y: .22, width: .18, height: .15 } }]])) };
function Preview() {
  const [mode, setMode] = useState('sample'), [open, setOpen] = useState(true);
  const person = mode === 'birthday' ? { ...sample, birthDate: '' } : mode === 'empty' ? { ...sample, faceBoxes: {} } : sample;
  return <main style={{ padding: '2rem', color: '#e8ce93' }}><h1>Evolución · prueba local</h1>
    <p>Ilustraciones y fechas ficticias para probar los controles. No se modifica la biblioteca.</p>
    {['sample', 'birthday', 'empty'].map((value, i) => <button key={value} className="dialog-button" onClick={() => { setMode(value); setOpen(true); }}>{['Abrir ejemplo', 'Sin nacimiento', 'Sin caras'][i]}</button>)}
    {open && <PersonPhotoEvolution key={mode} Modal={Modal} person={person} photos={photos} localAlignment={false} language="es" s={photoStrings('es')}
      imageUrl={photo => photo.relativePath} onClose={() => setOpen(false)} onOpen={photo => { setOpen(false); document.getElementById('source').src = photo.relativePath; }} />}
    <img id="source" alt="Ilustración original de prueba" style={{ display: 'block', maxWidth: 300, marginTop: 20 }} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
