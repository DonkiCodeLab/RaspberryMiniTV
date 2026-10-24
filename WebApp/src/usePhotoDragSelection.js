import { useEffect, useRef } from 'react';
import { attachPhotoDragSelection } from './photoDragSelection.js';

export default function usePhotoDragSelection(grid, { enabled, selected, setSelected, pageKey }) {
  const selection = useRef(selected);
  selection.current = selected;
  useEffect(() => {
    if (!enabled || !grid.current) return;
    return attachPhotoDragSelection(grid.current, id => selection.current.has(id), (ids, select) => {
      setSelected(previous => {
        const next = new Set(previous);
        for (const id of ids) { if (select) next.add(id); else next.delete(id); }
        return next;
      });
    });
  }, [grid, enabled, setSelected, pageKey]);
}
