import { useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { createBrowserBack } from "./browserBack.js";

let navigation;

// Higher priorities belong to dialogs above the main page. Keep the latest
// callback without adding entries for rerenders, sibling items or tab changes.
export default function useBrowserBack(onBack, priority = 0) {
  const id = useRef(Symbol("browser-back"));
  useLayoutEffect(() => {
    navigation ??= createBrowserBack(window, callback => flushSync(callback));
    navigation.set(id.current, onBack, priority);
  });
  useLayoutEffect(() => {
    const key = id.current;
    return () => navigation?.remove(key);
  }, []);
}
