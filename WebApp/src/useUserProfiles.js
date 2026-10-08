import { useCallback, useEffect, useRef, useState } from "react";
import { getUsers, createUser, editUser, deleteUser, getUserState, patchUserState } from "./api/raspberryApi";
import { DEFAULT_USER, EMPTY_STATE, mergeProfileState, marksPatch, completionMarks } from "./profileState.js";

export default function useUserProfiles(enabled, initialId = "default") {
  const [users, setUsers] = useState([DEFAULT_USER]);
  const [activeId, setActiveId] = useState(initialId);
  const [states, setStates] = useState({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const cache = useRef({});
  const pending = useRef([]);
  const inflight = useRef(null);
  const selected = useRef(activeId);
  const epoch = useRef(0);
  const revisions = useRef({});
  selected.current = activeId;

  const publish = useCallback((id, state) => {
    cache.current[id] = state;
    setStates(current => ({ ...current, [id]: state }));
  }, []);

  const flush = useCallback(() => {
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      while (pending.current.length) {
        const job = pending.current[0];
        try { await patchUserState(job.id, job.patch); }
        catch (failure) {
          if (failure.status === 404) { pending.current.shift(); continue; }
          setError("No se han guardado los últimos cambios. Revisa la conexión y pulsa Reintentar antes de cerrar.");
          throw failure;
        }
        pending.current.shift();
      }
      setError("");
    })().finally(() => { inflight.current = null; });
    return inflight.current;
  }, []);

  const refreshState = useCallback(async (id = selected.current) => {
    await flush();
    const revision = revisions.current[id] || 0;
    const result = await getUserState(id);
    if ((revisions.current[id] || 0) !== revision) return cache.current[id];
    // A reader may have produced a new update while this request was in flight.
    const current = pending.current.filter(job => job.id === id).reduce((state, job) => mergeProfileState(state, job.patch), result);
    publish(id, current);
    return current;
  }, [flush, publish]);

  const reload = useCallback(async () => {
    const generation = ++epoch.current;
    setReady(false);
    try {
      const { users: next } = await getUsers();
      if (generation !== epoch.current) return;
      setUsers(next);
      const id = next.some(user => user.id === selected.current) ? selected.current : "default";
      if (id !== selected.current) setActiveId(id);
      await refreshState(id);
      if (generation === epoch.current) { setReady(true); setError(""); }
    } catch (failure) {
      if (generation === epoch.current) setError(failure.message || "No se pudieron cargar los usuarios.");
    }
  }, [refreshState]);

  useEffect(() => {
    if (enabled) reload();
    return () => { epoch.current++; };
  }, [enabled, reload]);

  useEffect(() => {
    const leave = event => { if (pending.current.length) { event.preventDefault(); event.returnValue = ""; } };
    const retry = () => { if (enabled) flush().catch(() => {}); };
    window.addEventListener("beforeunload", leave);
    window.addEventListener("online", retry);
    return () => { window.removeEventListener("beforeunload", leave); window.removeEventListener("online", retry); };
  }, [enabled, flush]);

  useEffect(() => {
    if (!enabled || !ready) return;
    let disposed = false;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      refreshState().catch(failure => {
        if (disposed) return;
        if (failure.status === 404) reload();
      });
    };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [enabled, ready, refreshState, reload]);

  function update(id, patch) {
    if (!cache.current[id]) return false;
    revisions.current[id] = (revisions.current[id] || 0) + 1;
    publish(id, mergeProfileState(cache.current[id], patch));
    pending.current.push({ id, patch });
    flush().catch(() => {});
    return true;
  }

  async function select(id) {
    if (id === selected.current || !ready) return;
    setReady(false);
    try {
      await refreshState(id);
      setActiveId(id);
      selected.current = id;
      setError("");
    } catch (failure) { setError(failure.message); }
    finally { setReady(true); }
  }

  return {
    users, activeId, activeUser: users.find(user => user.id === activeId) || DEFAULT_USER,
    state: states[activeId] || EMPTY_STATE, ready, error, select, reload, refreshState, flush,
    saveMarks(next) { return ready && update(activeId, { marks: marksPatch(cache.current[activeId].marks, next) }); },
    saveProgress(id, descriptor, progress) {
      return update(id, { progress: { [descriptor.key]: { ...progress, opened: true, updatedAt: Date.now() } }, marks: completionMarks(descriptor, progress) });
    },
    async saveUser(data, id) {
      const response = id ? await editUser(id, data) : await createUser(data);
      setUsers(current => id ? current.map(user => user.id === id ? response.user : user) : [...current, response.user]);
      return response.user;
    },
    async removeUser(id) {
      await flush();
      const fallback = selected.current === id ? await getUserState("default") : null;
      await deleteUser(id);
      setUsers(current => current.filter(user => user.id !== id));
      delete cache.current[id];
      if (selected.current === id) { publish("default", fallback); setActiveId("default"); selected.current = "default"; }
    },
  };
}
