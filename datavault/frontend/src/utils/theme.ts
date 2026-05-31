// Tema / paleta / densidad de OpsGrid.
// Se aplican como atributos en <html> (data-theme | data-palette | data-density),
// se persisten en localStorage y al cambiar hacen un cross-fade (~420ms).
// Los valores los consume tokens.css. Bootstrap se llama una vez en main.tsx
// ANTES del render para evitar flash de tema incorrecto.

export type Theme = "light" | "dark";
export type Palette = "citrus" | "electric" | "mint" | "dusk" | "tropic" | "y2k";
export type Density = "compact" | "regular" | "comfy";

export const PALETTES: Palette[] = ["citrus", "electric", "mint", "dusk", "tropic", "y2k"];
export const DENSITIES: Density[] = ["compact", "regular", "comfy"];

const THEME_KEY = "opsgrid-theme";
const PALETTE_KEY = "opsgrid-palette";
const DENSITY_KEY = "opsgrid-density";

const DEFAULTS = { theme: "light" as Theme, palette: "citrus" as Palette, density: "regular" as Density };

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* almacenamiento no disponible */ }
}

export function getTheme(): Theme {
  return (safeGet(THEME_KEY) as Theme) || DEFAULTS.theme;
}
export function getPalette(): Palette {
  const p = safeGet(PALETTE_KEY) as Palette | null;
  return p && PALETTES.includes(p) ? p : DEFAULTS.palette;
}
export function getDensity(): Density {
  const d = safeGet(DENSITY_KEY) as Density | null;
  return d && DENSITIES.includes(d) ? d : DEFAULTS.density;
}

/** Aplica los atributos persistidos a <html>. Llamar 1 vez antes del render. */
export function bootstrapTheme() {
  const el = document.documentElement;
  el.setAttribute("data-theme", getTheme());
  el.setAttribute("data-palette", getPalette());
  el.setAttribute("data-density", getDensity());
}

let animTimer: ReturnType<typeof setTimeout> | undefined;
function withCrossFade(apply: () => void) {
  const el = document.documentElement;
  el.classList.add("theme-anim");
  apply();
  if (animTimer) clearTimeout(animTimer);
  animTimer = setTimeout(() => el.classList.remove("theme-anim"), 420);
}

export function setTheme(theme: Theme) {
  safeSet(THEME_KEY, theme);
  withCrossFade(() => document.documentElement.setAttribute("data-theme", theme));
}
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
export function setPalette(palette: Palette) {
  safeSet(PALETTE_KEY, palette);
  withCrossFade(() => document.documentElement.setAttribute("data-palette", palette));
}
export function setDensity(density: Density) {
  safeSet(DENSITY_KEY, density);
  document.documentElement.setAttribute("data-density", density);
}
