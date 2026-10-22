import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LANGUAGES, languageInfo, languageName } from './i18n/languages.js';
import { message } from './i18n/index.js';
import languagesIcon from './assets/icon_languages.png';
import './LanguageSelector.css';
import flag_bd from "../../DeviceApp/menu/flags/bd.png";
import flag_cn from "../../DeviceApp/menu/flags/cn.png";
import flag_de from "../../DeviceApp/menu/flags/de.png";
import flag_eg from "../../DeviceApp/menu/flags/eg.png";
import flag_es from "../../DeviceApp/menu/flags/es.png";
import flag_fr from "../../DeviceApp/menu/flags/fr.png";
import flag_gb from "../../DeviceApp/menu/flags/gb.png";
import flag_id from "../../DeviceApp/menu/flags/id.png";
import flag_in from "../../DeviceApp/menu/flags/in.png";
import flag_jp from "../../DeviceApp/menu/flags/jp.png";
import flag_ng from "../../DeviceApp/menu/flags/ng.png";
import flag_pk from "../../DeviceApp/menu/flags/pk.png";
import flag_pt from "../../DeviceApp/menu/flags/pt.png";
import flag_ru from "../../DeviceApp/menu/flags/ru.png";
import flag_sa from "../../DeviceApp/menu/flags/sa.png";
import flag_tz from "../../DeviceApp/menu/flags/tz.png";
import flag_vn from "../../DeviceApp/menu/flags/vn.png";
const flags = {bd: flag_bd, cn: flag_cn, de: flag_de, eg: flag_eg, es: flag_es, fr: flag_fr, gb: flag_gb, id: flag_id, in: flag_in, jp: flag_jp, ng: flag_ng, pk: flag_pk, pt: flag_pt, ru: flag_ru, sa: flag_sa, tz: flag_tz, vn: flag_vn};

export function LanguageFlag({ flag }) {
  if (flag === 'ca') return <svg className="language-flag" viewBox="0 0 36 24" aria-hidden="true"><rect width="36" height="24" fill="#f9cc18" />{[1, 3, 5, 7].map(row => <rect key={row} y={row * 24 / 9} width="36" height={24 / 9} fill="#d82029" />)}</svg>;
  return <img className="language-flag" src={flags[flag]} alt="" aria-hidden="true" />;
}

export default function LanguageSelector({ value, onChange, disabled = false, compact = false, error = '', displayLanguage = value, ariaLabel }) {
  const selected = languageInfo(value);
  const display = languageInfo(displayLanguage);
  const options = LANGUAGES.map(language => ({ ...language, label: languageName(language.id, display.id) }));
  const selectedName = languageName(selected.id, display.id);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef(null);
  const list = useRef(null);
  const search = useRef({ text: '', time: 0 });
  const id = useId();
  const label = ariaLabel || message('Language', display.id);
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus(); };
  const choose = index => { close(true); if (!disabled && LANGUAGES[index].id !== value) onChange(LANGUAGES[index].id); };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 20;
      const above = rect.top - 20;
      const upwards = below < 180 && above > below;
      const height = Math.min(420, Math.max(60, upwards ? above : below));
      setPosition({ width, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        top: upwards ? undefined : rect.bottom + 8, bottom: upwards ? window.innerHeight - rect.top + 8 : undefined, maxHeight: height });
    };
    place();
    list.current?.focus();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !list.current) return;
    const option = list.current.querySelector(`[data-index="${active}"]`);
    if (!option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.current.scrollTop) list.current.scrollTop = top;
    else if (bottom > list.current.scrollTop + list.current.clientHeight) list.current.scrollTop = bottom - list.current.clientHeight;
  }, [active, open, position.maxHeight]);
  useEffect(() => {
    if (!open) return;
    const outside = event => {
      if (!trigger.current?.contains(event.target) && !list.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  function show() { setActive(LANGUAGES.findIndex(language => language.id === selected.id)); setOpen(true); }
  function navigate(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'Tab') close();
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? LANGUAGES.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + LANGUAGES.length) % LANGUAGES.length);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      search.current.text = (Date.now() - search.current.time < 700 ? search.current.text : '') + event.key.toLowerCase();
      search.current.time = Date.now();
      const index = options.findIndex(language => [language.label, language.nativeName, language.name, language.id].some(name => name.toLowerCase().startsWith(search.current.text)));
      if (index >= 0) setActive(index);
    }
  }
  return <div className={`language-selector${compact ? ' language-selector--compact' : ''}`}>
    <button ref={trigger} type="button" className="language-selector__trigger" disabled={disabled}
      aria-label={`${label}: ${selectedName}`} title={`${label}: ${selectedName}`} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? id : undefined} aria-describedby={error ? `${id}-error` : undefined}
      onClick={() => open ? close() : show()} onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); show(); }
      }}>
      <img className="language-selector__icon" src={languagesIcon} alt="" aria-hidden="true" />
      {!compact && <LanguageFlag flag={selected.flag} />}
      <bdi className="language-selector__name" lang={display.id} dir={display.direction}>{compact ? selected.id.toUpperCase() : selectedName}</bdi>
      <span className="language-selector__chevron" aria-hidden="true">⌄</span>
    </button>
    {error && <span id={`${id}-error`} className="language-selector__error" role="alert">{error}</span>}
    {open && createPortal(<div ref={list} id={id} role="listbox" tabIndex={-1} aria-label={label}
      aria-activedescendant={`${id}-${active}`} className="language-selector__list" style={position} onKeyDown={navigate}>
      {options.map((language, index) => <div key={language.id} id={`${id}-${index}`} data-index={index}
        role="option" aria-selected={language.id === selected.id} className={`language-selector__option${index === active ? ' is-focused' : ''}`}
        onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
        <LanguageFlag flag={language.flag} /><bdi lang={display.id} dir={display.direction}>{language.label}</bdi>
        <span className="language-selector__check" aria-hidden="true">{language.id === selected.id ? '✓' : ''}</span>
      </div>)}
    </div>, document.body)}
  </div>;
}
