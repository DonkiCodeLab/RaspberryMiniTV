import React from 'react';

export default function PhotoIcon({ type }) {
  const shapes = {
    gallery: <><rect x="9" y="12" width="46" height="40" rx="5" /><circle cx="23" cy="25" r="5" /><path d="m10 44 13-12 10 9 9-15 13 18" /></>,
    map: <><circle cx="32" cy="32" r="22" /><ellipse cx="32" cy="32" rx="10" ry="22" /><path d="M10 32h44M14 20h36M14 44h36" /></>,
    ai: <><path d="m29 10 6 16 16 6-16 6-6 16-6-16-16-6 16-6zM49 7v12M43 13h12" /></>,
    people: <><circle cx="25" cy="23" r="9" /><path d="M8 51v-6c0-14 34-14 34 0v6M43 15a9 9 0 0 1 0 18m4 5c7 1 9 5 9 13" /></>,
    unknownPerson: <><circle cx="24" cy="21" r="10" /><path d="M7 53v-7c0-15 34-15 34 0v7M43 19a7 7 0 1 1 10 6c-4 2-5 4-5 8" /><circle cx="48" cy="41" r="1" /></>,
    withoutFaces: <><circle cx="25" cy="21" r="10" /><path d="M8 53v-7c0-15 28-15 32-5M44 38l13 13m0-13L44 51" /></>,
    pendingValidation: <><circle cx="25" cy="21" r="10" /><path d="M8 53v-7c0-15 28-15 32-5M42 44l6 6 11-14" /></>,
    folder: <><path d="M9 22V14h17l7 8h22v29H9z" /><path d="M9 26h46" /></>,
  };
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[type] || shapes.folder}</svg>;
}
