import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { progressLabel } from "./profileState.js";
import "./UserProfiles.css";

const copy = {
  es: { users: "Users", choose: "Cambiar de usuario", create: "Crear usuario", edit: "Editar usuario", name: "Nombre", avatar: "Elige tu avatar", upload: "Subir foto", save: "Guardar usuario", saving: "Guardando…", cancel: "Cancelar", remove: "Borrar usuario", removeCopy: "Se borrarán este usuario, sus favoritos, vistos y posiciones de lectura o reproducción.", confirm: "Sí, borrar usuario", intro: "Cada uno tiene sus favoritos y su propia historia.", default: "La app siempre empieza con default. Puedes cambiar su nombre y avatar; este perfil no se elimina.", empty: "Los nuevos perfiles empiezan sin favoritos, vistos ni lecturas.", photo: "JPG, PNG o WebP · hasta 10 MB", resume: "¿Continuar donde lo dejaste?", continue: "Continuar", restart: "Empezar desde el principio", close: "Cerrar", active: "En uso", retry: "Reintentar" },
  ca: { users: "Users", choose: "Canviar d’usuari", create: "Crear usuari", edit: "Editar usuari", name: "Nom", avatar: "Tria el teu avatar", upload: "Pujar foto", save: "Desar usuari", saving: "Desant…", cancel: "Cancel·lar", remove: "Esborrar usuari", removeCopy: "S’esborraran aquest usuari, els seus favorits, vistos i posicions de lectura o reproducció.", confirm: "Sí, esborrar usuari", intro: "Cadascú té els seus favorits i la seva pròpia història.", default: "L’app sempre comença amb default. Pots canviar-ne el nom i l’avatar; aquest perfil no s’elimina.", empty: "Els perfils nous comencen sense favorits, vistos ni lectures.", photo: "JPG, PNG o WebP · fins a 10 MB", resume: "Continuar on ho vas deixar?", continue: "Continuar", restart: "Començar des del principi", close: "Tancar", active: "En ús", retry: "Reintentar" },
  en: { users: "Users", choose: "Switch user", create: "Create user", edit: "Edit user", name: "Name", avatar: "Choose your avatar", upload: "Upload photo", save: "Save user", saving: "Saving…", cancel: "Cancel", remove: "Delete user", removeCopy: "This will delete this user, their favorites, watched items and reading or playback positions.", confirm: "Yes, delete user", intro: "Everyone has their own favorites and their own story.", default: "The app always starts with default. You can change its name and avatar; this profile cannot be deleted.", empty: "New profiles start with no favorites, watched items or reading history.", photo: "JPG, PNG or WebP · up to 10 MB", resume: "Pick up where you left off?", continue: "Continue", restart: "Start from the beginning", close: "Close", active: "Active", retry: "Retry" },
};
export const userStrings = language => copy[language] || copy.es;
export function avatarUrl(avatar) { return avatar?.startsWith("data:image/") ? avatar : `/avatars/${/^avatar-\d{2}$/.test(avatar) ? avatar : "avatar-01"}.jpg`; }
export function UserAvatar({ user, className = "" }) {
  return <img className={`user-avatar ${className}`} src={avatarUrl(user?.avatar)} alt="" />;
}

export function ProfileMenu({ profiles, onManage, language }) {
  const s = userStrings(language);
  const [open, setOpen] = useState(false);
  const host = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!host.current?.contains(event.target)) setOpen(false); };
    const keyboard = event => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", keyboard); };
  }, [open]);
  function manage(id) { setOpen(false); onManage(id); }
  return <div className="profile-menu" ref={host}>
    <button className={`profile-menu__trigger${open ? " is-open" : ""}`} type="button" ref={trigger}
      aria-expanded={open} aria-controls="profile-options" aria-label={`${s.choose}: ${profiles.activeUser.name}`}
      title={profiles.activeUser.name} disabled={!profiles.ready} onClick={() => setOpen(value => !value)}>
      <UserAvatar user={profiles.activeUser} />
    </button>
    {open && <div className="profile-menu__options" id="profile-options" aria-label={s.choose}>
      <p>{profiles.activeUser.name}<small>{s.active}</small></p>
      <div className="profile-menu__list">
        {profiles.users.filter(user => user.id !== profiles.activeId).map((user, index) => <button key={user.id} type="button" style={{ "--user-order": index }}
          onClick={() => { setOpen(false); profiles.select(user.id); }}><UserAvatar user={user} /><span>{user.name}</span></button>)}
      </div>
      <button type="button" onClick={() => manage("new")}><span className="profile-menu__symbol">＋</span>{s.create}</button>
      <button type="button" onClick={() => manage(profiles.activeId)}><span className="profile-menu__symbol">✎</span>{s.edit}</button>
    </div>}
  </div>;
}

async function readAvatar(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Elige una foto JPG, PNG o WebP de hasta 10 MB.");
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
    const side = Math.min(image.width, image.height);
    canvas.getContext("2d").drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL("image/jpeg", .88);
  } finally { image.close(); }
}

export function UsersPanel({ profiles, editorId, onEditorChange, language }) {
  const s = userStrings(language);
  const id = editorId || profiles.activeId;
  const selected = profiles.users.find(user => user.id === id);
  const [catalog, setCatalog] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/avatars/catalog.json", { signal: controller.signal }).then(response => response.json()).then(setCatalog).catch(() => {});
    return () => controller.abort();
  }, []);
  return <section className="users-panel" aria-labelledby="users-title">
    <header className="users-panel__heading"><div><span>MINITV · {s.users}</span><h2 id="users-title">{s.users}</h2><p>{s.intro}</p></div>
      <button className="dialog-button dialog-button--accent" type="button" disabled={!profiles.ready} onClick={() => onEditorChange("new")}>＋ {s.create}</button>
    </header>
    <div className="users-panel__layout">
      <aside className="users-panel__list" aria-label={s.users}>
        {profiles.users.map(user => <button type="button" key={user.id} className={id === user.id ? "is-selected" : ""} disabled={!profiles.ready}
          onClick={() => onEditorChange(user.id)}><UserAvatar user={user} /><span>{user.name}{profiles.activeId === user.id && <small>{s.active}</small>}</span><span aria-hidden="true">›</span></button>)}
        <p>{s.empty}</p>
      </aside>
      <UserEditor key={id} user={selected} profiles={profiles} catalog={catalog} s={s} onDone={onEditorChange} />
    </div>
  </section>;
}

function UserEditor({ user, profiles, catalog, s, onDone }) {
  const [name, setName] = useState(user?.name || "");
  const [avatar, setAvatar] = useState(user?.avatar || "avatar-01");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef(null);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await profiles.saveUser({ name: name.trim(), avatar }, user?.id); setSaved(true); onDone(result.id); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await profiles.removeUser(user.id); onDone("default"); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <form className="user-editor" onSubmit={save}>
    <fieldset disabled={busy || !profiles.ready}>
      <legend>{user ? s.edit : s.create}</legend>
      <div className="user-editor__identity"><UserAvatar user={{ avatar }} /><label>{s.name}<input type="text" autoComplete="off" name="profile-name" value={name} maxLength={40} required
        onChange={event => { setName(event.target.value); setSaved(false); }} placeholder={s.name} /></label></div>
      <div className="user-editor__avatar-heading"><h3>{s.avatar}</h3><button className="dialog-button dialog-button--ghost" type="button" onClick={() => fileInput.current.click()}>{s.upload}</button></div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        setBusy(true); setError(""); setSaved(false);
        try { setAvatar(await readAvatar(file)); } catch (failure) { setError(failure.message || "No se pudo leer la foto."); }
        finally { setBusy(false); event.target.value = ""; }
      }} />
      <p className="user-editor__hint">{s.photo}</p>
      <div className="user-avatar-grid" role="group" aria-label={s.avatar}>
        {Array.from({ length: 25 }, (_, index) => {
          const item = catalog[index] || { id: `avatar-${String(index + 1).padStart(2, "0")}`, name: `Avatar ${index + 1}`, title: "" };
          return <button type="button" key={item.id} aria-label={`${item.name} · ${item.title}`} title={`${item.name} · ${item.title}`}
            aria-pressed={avatar === item.id} className={avatar === item.id ? "is-selected" : ""} onClick={() => { setAvatar(item.id); setSaved(false); }}>
            <UserAvatar user={{ avatar: item.id }} />{avatar === item.id && <span aria-hidden="true">✓</span>}
          </button>;
        })}
      </div>
      {user?.id === "default" && <p className="user-editor__hint">{s.default}</p>}
      <div className="user-editor__actions"><button className="dialog-button dialog-button--accent" disabled={!name.trim()} type="submit">{busy ? s.saving : s.save}</button>
        {user && user.id !== "default" && <button className="user-editor__delete" type="button" onClick={() => setConfirmDelete(true)}>{s.remove}</button>}
      </div>
    </fieldset>
    {saved && <p className="user-editor__saved" role="status">✓ {name}</p>}
    {error && <p className="user-editor__error" role="alert">{error}</p>}
    {confirmDelete && <div className="user-editor__confirm" role="alertdialog" aria-modal="false" aria-label={s.remove}>
      <strong>{s.remove}: {user.name}</strong><p>{s.removeCopy}</p><div><button className="dialog-button dialog-button--ghost" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>{s.cancel}</button>
        <button className="dialog-button dialog-button--danger" type="button" disabled={busy} onClick={remove}>{s.confirm}</button></div>
    </div>}
  </form>;
}

export function ResumeDialog({ request, onChoose, language }) {
  const s = userStrings(language);
  const card = useRef(null);
  useEffect(() => {
    if (!request) return;
    const previous = document.activeElement;
    card.current?.querySelector("button")?.focus();
    const keyboard = event => {
      if (event.key === "Escape") onChoose(null);
      if (event.key === "Tab") {
        const buttons = [...card.current.querySelectorAll("button")];
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [request]);
  if (!request) return null;
  return createPortal(<div className="modal-backdrop profile-resume-backdrop"><div className="dialog-card profile-resume" ref={card} role="dialog" aria-modal="true" aria-labelledby="profile-resume-title">
    <UserAvatar user={request.user} /><p>{request.user.name}</p><h2 id="profile-resume-title">{s.resume}</h2><strong>{request.title}</strong>
    <p className="profile-resume__position">{progressLabel(request.progress, language)}</p>
    <button type="button" className="dialog-button dialog-button--accent" onClick={() => onChoose(true)}>{s.continue}</button>
    <button type="button" className="dialog-button dialog-button--ghost" onClick={() => onChoose(false)}>{s.restart}</button>
    <button type="button" className="profile-resume__cancel" onClick={() => onChoose(null)}>{s.cancel}</button>
  </div></div>, document.body);
}
