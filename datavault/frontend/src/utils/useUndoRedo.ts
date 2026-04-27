import { useRef, useCallback, useEffect } from "react";

export interface UndoEntry {
  recordId: string;
  fieldKey: string;
  oldValue: unknown;
  newValue: unknown;
}

export function useUndoRedo(
  onApply: (entry: UndoEntry, direction: "undo" | "redo") => void
) {
  const past = useRef<UndoEntry[]>([]);
  const future = useRef<UndoEntry[]>([]);
  // Keep onApply ref always current so the effect closure never goes stale
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  const push = useCallback((entry: UndoEntry) => {
    past.current = [...past.current.slice(-49), entry];
    future.current = [];
  }, []);

  useEffect(() => {
    const undo = () => {
      if (past.current.length === 0) return;
      const entry = past.current[past.current.length - 1];
      past.current = past.current.slice(0, -1);
      future.current = [entry, ...future.current];
      onApplyRef.current(entry, "undo");
    };

    const redo = () => {
      if (future.current.length === 0) return;
      const entry = future.current[0];
      future.current = future.current.slice(1);
      past.current = [...past.current, entry];
      onApplyRef.current(entry, "redo");
    };

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // refs are stable — no deps needed

  return { push };
}
