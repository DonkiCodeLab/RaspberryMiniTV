// No timer for an idle library. Background work uses a small revision probe.
export function watchPhotoLibrary({ current, readStatus, refresh, canCheck, onError,
  schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null, checking = false, stopped = false;
  function clear() {
    if (timer !== null) cancel(timer);
    timer = null;
  }
  function sync() {
    clear();
    if (!stopped && current().working && canCheck()) {
      timer = schedule(() => { timer = null; void check(); }, current().faces?.running ? 2000 : 15000);
    }
  }
  async function check() {
    if (stopped || checking || !canCheck()) return;
    clear(); checking = true;
    try {
      const status = await readStatus();
      if (!stopped && canCheck() && status.revision !== current().revision) await refresh();
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      checking = false;
      if (!stopped) sync();
    }
  }
  return { check, sync, stop() { stopped = true; clear(); } };
}
