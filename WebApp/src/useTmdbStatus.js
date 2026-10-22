import { useCallback, useEffect, useRef, useState } from 'react';

// One request at a time. A failed check stays failed until the user retries it.
export default function useTmdbStatus(read, { enabled = true, interval = () => 5000, onStatus } = {}) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(enabled ? 'refresh' : '');
  const options = useRef();
  options.current = { read, interval, onStatus, enabled };
  const request = useRef({ mounted: false, controller: null, timer: null });

  const run = useCallback(async (action = 'refresh', operation) => {
    const state = request.current;
    if (!state.mounted || state.controller || !options.current.enabled) return;
    clearTimeout(state.timer);
    const controller = new AbortController();
    state.controller = controller;
    setError(null);
    setBusy(action);
    try {
      const next = await (operation || options.current.read)(controller.signal);
      if (!state.mounted || controller.signal.aborted) return;
      options.current.onStatus?.(next);
      setStatus(next);
      state.timer = setTimeout(() => run('poll'), options.current.interval(next));
      return next;
    } catch (error) {
      if (state.mounted && !controller.signal.aborted) setError(error);
    } finally {
      if (state.controller === controller) {
        state.controller = null;
        if (state.mounted) setBusy('');
      }
    }
  }, []);

  useEffect(() => {
    const state = request.current;
    state.mounted = true;
    run();
    return () => {
      state.mounted = false;
      clearTimeout(state.timer);
      state.controller?.abort();
      state.controller = null;
    };
  }, [enabled, run]);

  return { status, error, busy, run };
}
