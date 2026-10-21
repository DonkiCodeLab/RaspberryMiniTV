const HISTORY_KEY = "miniTvBrowserBack";

// One temporary history entry turns browser Back into the current UI's Back
// action. It is removed when there is no internal destination, so the library
// root still lets the user leave the site normally.
export function createBrowserBack(browser, run = callback => callback()) {
  const handlers = new Map();
  let scheduled = false;
  let returning = false;
  let disposed = false;
  let opened = 0;
  const isGuard = () => browser.history.state?.[HISTORY_KEY] === true;
  const activeHandler = () => [...handlers.values()]
    .filter(entry => entry.onBack)
    .sort((left, right) => right.priority - left.priority || right.opened - left.opened).at(0)?.onBack;

  function reconcile() {
    if (disposed || returning) return;
    if (activeHandler()) {
      if (!isGuard()) {
        browser.history.pushState({ ...browser.history.state, [HISTORY_KEY]: true }, "");
      }
    } else if (isGuard()) {
      returning = true;
      browser.history.back();
    }
  }

  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      reconcile();
    });
  }

  function onPopState() {
    if (returning) {
      returning = false;
      reconcile();
      return;
    }
    // A stale forward entry must not invoke Back a second time.
    if (isGuard()) {
      reconcile();
      return;
    }
    const onBack = activeHandler();
    if (onBack) run(onBack);
    reconcile();
  }

  browser.addEventListener("popstate", onPopState);
  schedule();
  return {
    set(id, onBack, priority = 0) {
      const previous = handlers.get(id);
      handlers.set(id, { onBack, priority, opened: previous?.onBack ? previous.opened : ++opened });
      schedule();
    },
    remove(id) {
      handlers.delete(id);
      schedule();
    },
    dispose() {
      disposed = true;
      browser.removeEventListener("popstate", onPopState);
      handlers.clear();
    },
  };
}
