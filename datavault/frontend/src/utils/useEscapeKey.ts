import { useEffect } from "react";

/**
 * Llama a `onEscape` cuando el usuario presiona Escape.
 * Útil para cerrar modales y paneles flotantes sin que el usuario tenga que clickear afuera.
 *
 * @param onEscape callback a ejecutar
 * @param enabled  si es false el listener se desactiva (default: true)
 */
export function useEscapeKey(onEscape: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onEscape, enabled]);
}
