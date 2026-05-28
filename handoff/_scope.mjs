// _scope.mjs — prefija selectores de un CSS bajo .og para coexistir con el index.css legacy.
// Reglas:
//  - html/body  → .dv-app  (el contenedor del shell hace de body)
//  - @keyframes/@font-face → se copian verbatim (sus selectores internos no se tocan)
//  - @media/@supports/@container → se procesa su contenido recursivamente
//  - resto de selectores → se prefijan con ".og "
import fs from 'node:fs';

function splitTopLevel(str, ch) {
  const out = [];
  let depth = 0, buf = '';
  for (const c of str) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ch && depth === 0) { out.push(buf); buf = ''; }
    else buf += c;
  }
  out.push(buf);
  return out;
}

function mapSelector(sel) {
  let s = sel.trim();
  if (!s) return s;
  const m = s.match(/^(html|body)\b/);
  if (m) return '.dv-app' + s.slice(m[0].length);
  return '.og ' + s;
}

function transformSelectorList(list) {
  return splitTopLevel(list, ',').map(mapSelector).join(', ');
}

// Procesa un cuerpo CSS (lista de reglas) y devuelve el texto transformado.
function processBlock(css) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    // saltar espacios
    const ws = css.slice(i).match(/^\s+/);
    if (ws) { out += ws[0]; i += ws[0].length; continue; }
    // comentario
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    // leer hasta '{' o ';' (para at-rules sin bloque) al depth 0 de parens
    let j = i, depth = 0, foundBrace = false;
    while (j < n) {
      const c = css[j];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === '{' && depth === 0) { foundBrace = true; break; }
      else if (c === ';' && depth === 0) { break; }
      j++;
    }
    const prelude = css.slice(i, j).trim();
    if (!foundBrace) {
      // at-rule sin bloque (@import, @charset, etc.) — copiar tal cual con ;
      out += prelude + (css[j] === ';' ? ';' : '');
      i = j + 1;
      continue;
    }
    // encontrar el cierre del bloque que abre en j
    let k = j + 1, bdepth = 1;
    while (k < n && bdepth > 0) {
      const c = css[k];
      if (c === '/' && css[k + 1] === '*') { const e = css.indexOf('*/', k + 2); k = (e === -1 ? n : e + 2); continue; }
      if (c === '{') bdepth++;
      else if (c === '}') bdepth--;
      if (bdepth === 0) break;
      k++;
    }
    const body = css.slice(j + 1, k);
    if (prelude.startsWith('@')) {
      const kind = prelude.slice(1).split(/\s|\(/)[0].toLowerCase();
      if (kind === 'keyframes' || kind === '-webkit-keyframes' || kind === 'font-face' || kind === 'page') {
        out += prelude + ' {' + body + '}';
      } else {
        // @media / @supports / @container → recursar en el cuerpo
        out += prelude + ' {' + processBlock(body) + '}';
      }
    } else {
      // regla de estilo normal
      out += transformSelectorList(prelude) + ' {' + body + '}';
    }
    i = k + 1;
  }
  return out;
}

const files = process.argv.slice(3);
const banner = `/* === OpsGrid design system — SCOPEADO bajo .og (auto-generado por _scope.mjs) ===\n   No editar a mano. Fuente: handoff/{styles,dataset,phase4,phase5}.css */\n`;
let result = banner;
for (const f of files) {
  const css = fs.readFileSync(f, 'utf8');
  result += `\n/* ---------- ${f.split(/[\\/]/).pop()} ---------- */\n` + processBlock(css) + '\n';
}
fs.writeFileSync(process.argv[2], result);
console.log('WROTE ' + process.argv[2] + ' (' + result.length + ' bytes)');
