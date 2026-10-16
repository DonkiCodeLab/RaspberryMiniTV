const locks = new WeakMap();

// Modals can overlap and their effects can restart in any order. Only the first
// lock saves the original overflow; only the last release restores it.
export function lockBodyScroll(body = document.body) {
  let state = locks.get(body);
  if (!state) {
    state = { count: 0, overflow: body.style.overflow };
    locks.set(body, state);
    body.style.overflow = "hidden";
  }
  state.count += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count -= 1;
    if (state.count === 0) {
      body.style.overflow = state.overflow;
      locks.delete(body);
    }
  };
}
