import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { focusPersonField, nextPersonField, searchPersonOptions } from './photoPeopleKeyboard.js';

// Typing and vertical arrows always belong to the picker, even while closed.
export default function PersonReviewPicker({ choices, value, label, s, disabled, onChange }) {
  const options = [{ id: '', name: s.choosePerson }, ...choices];
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [position, setPosition] = useState({});
  const trigger = useRef(null), list = useRef(null), search = useRef({ text: '', time: 0 }), id = useId();
  const tabDirection = useRef(null);
  const selected = options.find(option => option.id === value);
  const close = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }); };
  const show = () => { search.current = { text: '', time: 0 }; setActive(Math.max(0, options.findIndex(option => option.id === value))); setOpen(true); };
  const choose = index => { if (disabled || !options[index]) return; close(true); onChange(options[index].id); };
  useLayoutEffect(() => {
    if (tabDirection.current === null) return;
    const backwards = tabDirection.current;
    tabDirection.current = null;
    // Confirming may add/remove the undo button before we wrap inside the card.
    focusPersonField(nextPersonField(trigger.current, backwards));
  });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 20, above = rect.top - 20, upwards = below < 180 && above > below;
      setPosition({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: upwards ? undefined : rect.bottom + 6, bottom: upwards ? window.innerHeight - rect.top + 6 : undefined,
        maxHeight: Math.min(360, Math.max(60, upwards ? above : below)) });
    };
    place(); list.current?.focus({ preventScroll: true });
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const option = list.current?.children[active];
    if (!option) return;
    if (option.offsetTop < list.current.scrollTop) list.current.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.current.scrollTop + list.current.clientHeight)
      list.current.scrollTop = option.offsetTop + option.offsetHeight - list.current.clientHeight;
  }, [open, active, position.maxHeight]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!trigger.current?.contains(event.target) && !list.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  function navigate(event) {
    event.stopPropagation();
    if (event.isComposing || event.nativeEvent?.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      event.preventDefault(); tabDirection.current = event.shiftKey;
      close(true);
      if (!disabled && options[active] && options[active].id !== value) onChange(options[active].id);
    } else if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Enter' || event.key === ' ' && (!search.current.text || Date.now() - search.current.time >= 1000)) { event.preventDefault(); if (!event.repeat) choose(active); }
    else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      search.current = { text: '', time: 0 };
      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : event.key === 'PageDown' ? 10 : event.key === 'PageUp' ? -10 : 0;
      setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + step)));
    } else if (event.key.length === 1 || event.key === 'Backspace') {
      event.preventDefault();
      const result = searchPersonOptions(options, active, search.current, event.key);
      search.current = result.search; setActive(result.index);
    }
  }
  function triggerKey(event) {
    if (disabled || event.isComposing || event.nativeEvent?.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const vertical = ['ArrowUp', 'ArrowDown'].includes(event.key);
    if (!vertical && (event.key.length !== 1 || event.key === ' ')) return;
    event.preventDefault(); event.stopPropagation();
    const current = Math.max(0, options.findIndex(option => option.id === value));
    search.current = { text: '', time: 0 };
    if (vertical) setActive(Math.max(0, Math.min(options.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
    else {
      const result = searchPersonOptions(options, current, search.current, event.key);
      search.current = result.search; setActive(result.index);
    }
    setOpen(true);
  }
  return <>
    <button ref={trigger} type="button" role="combobox" data-person-field="merge" className="photo-person-picker" disabled={disabled}
      aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onKeyDown={triggerKey} onClick={() => open ? close() : show()}>
      <span>{selected?.name || s.batchTargetChanged}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && createPortal(<div ref={list} id={id} role="listbox" tabIndex={-1} aria-label={label}
      aria-activedescendant={`${id}-${active}`} className="photo-person-picker__list" style={position} onKeyDown={navigate}>
      {options.map((option, index) => <div id={`${id}-${index}`} key={option.id} role="option" aria-selected={option.id === value}
        className={`photo-person-picker__option${index === active ? ' is-focused' : ''}`} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
        <span>{option.name}</span><span aria-hidden="true">{option.id === value ? '✓' : ''}</span>
      </div>)}
    </div>, document.body)}
  </>;
}
