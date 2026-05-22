// Safe formula evaluator — supports arithmetic, comparisons, and Spanish/English functions.
// No eval() used; recursive descent parser over a token list.

type Val = string | number | null;
type Ctx = Record<string, unknown>;

interface Token { type: string; value: string | number }

function tokenize(expr: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (' \t\r\n'.includes(ch)) { i++; continue; }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let s = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) s += expr[i++];
      toks.push({ type: 'NUM', value: parseFloat(s) });
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      let s = '';
      while (i < expr.length && expr[i] !== q) {
        if (expr[i] === '\\' && expr[i + 1] === q) { s += q; i += 2; }
        else s += expr[i++];
      }
      i++;
      toks.push({ type: 'STR', value: s });
      continue;
    }
    if (/[a-zA-Z_À-ɏ]/.test(ch)) {
      let s = '';
      while (i < expr.length && /[a-zA-Z0-9_À-ɏ]/.test(expr[i])) s += expr[i++];
      toks.push({ type: 'ID', value: s });
      continue;
    }
    switch (ch) {
      case '+': toks.push({ type: '+', value: '+' }); i++; break;
      case '-': toks.push({ type: '-', value: '-' }); i++; break;
      case '*': toks.push({ type: '*', value: '*' }); i++; break;
      case '/': toks.push({ type: '/', value: '/' }); i++; break;
      case '^': toks.push({ type: '^', value: '^' }); i++; break;
      case '%': toks.push({ type: '%', value: '%' }); i++; break;
      case '(': toks.push({ type: '(', value: '(' }); i++; break;
      case ')': toks.push({ type: ')', value: ')' }); i++; break;
      case ',': toks.push({ type: ',', value: ',' }); i++; break;
      case '&': toks.push({ type: '&', value: '&' }); i++; break;
      case '=':
        i++;
        if (expr[i] === '=') i++;
        toks.push({ type: '==', value: '==' });
        break;
      case '!':
        if (expr[i + 1] === '=') { toks.push({ type: '!=', value: '!=' }); i += 2; }
        else i++;
        break;
      case '<':
        if (expr[i + 1] === '>') { toks.push({ type: '!=', value: '!=' }); i += 2; }
        else if (expr[i + 1] === '=') { toks.push({ type: '<=', value: '<=' }); i += 2; }
        else { toks.push({ type: '<', value: '<' }); i++; }
        break;
      case '>':
        if (expr[i + 1] === '=') { toks.push({ type: '>=', value: '>=' }); i += 2; }
        else { toks.push({ type: '>', value: '>' }); i++; }
        break;
      default: i++;
    }
  }
  toks.push({ type: 'EOF', value: '' });
  return toks;
}

class Parser {
  private pos = 0;
  private toks: Token[];
  private ctx: Ctx;
  constructor(toks: Token[], ctx: Ctx) { this.toks = toks; this.ctx = ctx; }
  private cur() { return this.toks[this.pos]; }
  private peek(t: string) { return this.cur().type === t; }
  private eat(t: string) {
    if (!this.peek(t)) throw new Error(`Expected ${t}, got ${this.cur().type} at pos ${this.pos}`);
    return this.toks[this.pos++];
  }

  parse(): Val { const v = this.expr(); this.eat('EOF'); return v; }
  expr(): Val { return this.comparison(); }

  comparison(): Val {
    let left = this.additive();
    while (['==', '!=', '<', '>', '<=', '>='].includes(this.cur().type)) {
      const op = this.toks[this.pos++].type;
      const right = this.additive();
      const ls = String(left ?? ''), rs = String(right ?? '');
      switch (op) {
        case '==': left = ls === rs ? 1 : 0; break;
        case '!=': left = ls !== rs ? 1 : 0; break;
        case '<':  left = +(left ?? 0) < +(right ?? 0) ? 1 : 0; break;
        case '>':  left = +(left ?? 0) > +(right ?? 0) ? 1 : 0; break;
        case '<=': left = +(left ?? 0) <= +(right ?? 0) ? 1 : 0; break;
        case '>=': left = +(left ?? 0) >= +(right ?? 0) ? 1 : 0; break;
      }
    }
    return left;
  }

  additive(): Val {
    let left = this.multiplicative();
    while (this.peek('+') || this.peek('-') || this.peek('&')) {
      const op = this.toks[this.pos++].type;
      const right = this.multiplicative();
      if (op === '&') {
        left = String(left ?? '') + String(right ?? '');
      } else if (op === '+') {
        if (typeof left === 'string' || typeof right === 'string')
          left = String(left ?? '') + String(right ?? '');
        else left = (left ?? 0) + (right ?? 0);
      } else {
        left = (left as number ?? 0) - (right as number ?? 0);
      }
    }
    return left;
  }

  multiplicative(): Val {
    let left = this.power();
    while (this.peek('*') || this.peek('/') || this.peek('%')) {
      const op = this.toks[this.pos++].type;
      const right = this.power();
      if (op === '*') left = +(left ?? 0) * +(right ?? 0);
      else if (op === '/') left = +(right ?? 0) === 0 ? null : +(left ?? 0) / +(right ?? 0);
      else left = +(left ?? 0) % +(right ?? 0);
    }
    return left;
  }

  power(): Val {
    let base = this.unary();
    if (this.peek('^')) { this.pos++; base = Math.pow(+base!, +this.unary()!); }
    return base;
  }

  unary(): Val {
    if (this.peek('-')) { this.pos++; return -this.primary()!; }
    if (this.peek('+')) { this.pos++; return +this.primary()!; }
    return this.primary();
  }

  primary(): Val {
    const tok = this.cur();
    if (tok.type === 'NUM') { this.pos++; return tok.value as number; }
    if (tok.type === 'STR') { this.pos++; return tok.value as string; }
    if (tok.type === '(') {
      this.pos++;
      const v = this.expr();
      this.eat(')');
      return v;
    }
    if (tok.type === 'ID') {
      this.pos++;
      const rawName = tok.value as string;
      const name = rawName.toLowerCase();

      if (!this.peek('(')) {
        // Variable lookup — try exact then case-insensitive
        if (rawName in this.ctx) return coerce(this.ctx[rawName]);
        const lc = rawName.toLowerCase();
        for (const k of Object.keys(this.ctx)) {
          if (k.toLowerCase() === lc) return coerce(this.ctx[k]);
        }
        return null;
      }

      this.pos++; // eat '('

      // SI / IF — evaluate both branches (pure, no side effects)
      if (name === 'si' || name === 'if') {
        const cond = this.expr();
        let t: Val = null, f: Val = null;
        if (this.peek(',')) { this.pos++; t = this.expr(); }
        if (this.peek(',')) { this.pos++; f = this.expr(); }
        this.eat(')');
        return cond ? t : f;
      }

      const args: Val[] = [];
      if (!this.peek(')')) {
        args.push(this.expr());
        while (this.peek(',')) { this.pos++; args.push(this.expr()); }
      }
      this.eat(')');
      return this.callFn(name, args);
    }
    return null;
  }

  callFn(name: string, a: Val[]): Val {
    const n0 = a[0], n1 = a[1], n2 = a[2];
    const s0 = String(n0 ?? ''), s1 = String(n1 ?? '');
    switch (name) {
      // ── Math ─────────────────────────────────────────────────────────────────
      case 'abs':                        return Math.abs(+n0!);
      case 'redondear': case 'round':    return +parseFloat(s0).toFixed(n1 !== null ? +n1 : 0);
      case 'entero':    case 'int':      return Math.trunc(+n0!);
      case 'techo':     case 'ceiling':  return Math.ceil(+n0!);
      case 'piso':      case 'floor':    return Math.floor(+n0!);
      case 'raiz':      case 'sqrt':     return Math.sqrt(+n0!);
      case 'potencia':  case 'pow':      return Math.pow(+n0!, +n1!);
      case 'log':                        return Math.log10(+n0!);
      case 'ln':                         return Math.log(+n0!);
      case 'max':       return Math.max(...a.map(Number));
      case 'min':       return Math.min(...a.map(Number));
      case 'suma':      case 'sum':      return a.reduce<number>((acc, v) => acc + +(v ?? 0), 0);
      case 'promedio':  case 'avg': case 'average':
        return a.length ? a.reduce<number>((acc, v) => acc + +(v ?? 0), 0) / a.length : null;
      // ── String ───────────────────────────────────────────────────────────────
      case 'texto':     case 'text':     return String(n0 ?? '');
      case 'numero':    case 'num': case 'value': return parseFloat(s0) || 0;
      case 'mayus':     case 'upper':    return s0.toUpperCase();
      case 'minus':     case 'lower':    return s0.toLowerCase();
      case 'largo':     case 'len':      return s0.length;
      case 'recortar':  case 'trim':     return s0.trim();
      case 'concat': case 'concatenar':  return a.map(v => String(v ?? '')).join('');
      case 'izquierda': case 'left':     return s0.slice(0, +n1!);
      case 'derecha':   case 'right':    return s0.slice(-+n1!);
      case 'medio':     case 'mid':      return s0.slice(+n1! - 1, +n1! - 1 + +n2!);
      case 'reemplazar': case 'replace': return s0.replaceAll(s1, String(n2 ?? ''));
      case 'repetir':   case 'rept':     return s0.repeat(Math.max(0, +n1!));
      case 'encontrar': case 'find':     return s0.indexOf(s1) + 1 || null;
      // ── Logic ────────────────────────────────────────────────────────────────
      case 'y':    case 'and':     return a.every(v => !!v) ? 1 : 0;
      case 'o':    case 'or':      return a.some(v => !!v)  ? 1 : 0;
      case 'no':   case 'not':     return n0 ? 0 : 1;
      case 'esblanco': case 'isblank': return (n0 == null || n0 === '') ? 1 : 0;
      case 'esnum': case 'isnumber':   return (!isNaN(+n0!) && n0 !== '') ? 1 : 0;
      case 'estexto': case 'istext':   return isNaN(+n0!) || n0 === '' ? 1 : 0;
      case 'sierror': case 'iferror': {
        // SI.ERROR(expr, fallback) — devuelve n0 si no es error/null/empty; sino n1
        const isErr = n0 == null || n0 === '' || (typeof n0 === 'string' && n0.startsWith('#'));
        return isErr ? n1 : n0;
      }
      case 'coalesce': case 'sino': {
        // Devuelve el primer argumento no-nulo / no-vacío
        for (const v of a) if (v != null && v !== '') return v;
        return null;
      }
      // ── Fechas ───────────────────────────────────────────────────────────────
      case 'hoy': case 'today': {
        const d = new Date(); d.setHours(0,0,0,0);
        return d.toISOString().slice(0, 10);
      }
      case 'ahora': case 'now': return new Date().toISOString();
      case 'anio': case 'año': case 'year': {
        const d = new Date(s0); return isNaN(d.getTime()) ? null : d.getFullYear();
      }
      case 'mes': case 'month': {
        const d = new Date(s0); return isNaN(d.getTime()) ? null : d.getMonth() + 1;
      }
      case 'dia': case 'día': case 'day': {
        const d = new Date(s0); return isNaN(d.getTime()) ? null : d.getDate();
      }
      case 'dias': case 'días': case 'days': {
        // DIAS(fecha_fin, fecha_inicio) — diferencia en días
        const d1 = new Date(s0).getTime(), d2 = new Date(s1).getTime();
        if (isNaN(d1) || isNaN(d2)) return null;
        return Math.round((d1 - d2) / 86400000);
      }
      // ── Texto extra ──────────────────────────────────────────────────────────
      case 'sustituir': case 'substitute': {
        // SUSTITUIR(texto, viejo, nuevo[, ocurrencia])
        const old = s1, neu = String(n2 ?? '');
        if (!old) return s0;
        if (a[3] != null) {
          // Solo reemplazar la N-ésima ocurrencia
          const occ = +(a[3] as number);
          let idx = -1, count = 0, out = s0;
          while ((idx = out.indexOf(old, idx + 1)) !== -1) {
            count++;
            if (count === occ) return out.slice(0, idx) + neu + out.slice(idx + old.length);
          }
          return out;
        }
        return s0.split(old).join(neu);
      }
      case 'limpiar': case 'clean': return s0.replace(/[\x00-\x1F\x7F]/g, '');
      case 'extrae': case 'extract': return s0.slice(+n1! - 1, +n1! - 1 + +n2!); // alias de MEDIO
      case 'nompropio': case 'proper': {
        return s0.toLowerCase().replace(/(?:^|\s)\p{L}/gu, (c) => c.toUpperCase());
      }
      // ── Matemática extra ─────────────────────────────────────────────────────
      case 'modulo': case 'mod': return +n0! % +n1!;
      case 'signo':  case 'sign': return Math.sign(+n0!);
      case 'sumaproducto': case 'sumproduct': {
        // SUMAPRODUCTO(a, b) — suma de pares a[i]*b[i] (usado con multi-args como par único de listas)
        // Pero como no tenemos rangos, asumimos pares planos: SUMAPRODUCTO(2,3,4,5) = 2*3 + 4*5
        if (a.length % 2 !== 0) return null;
        let s = 0;
        for (let i = 0; i < a.length; i += 2) s += +(a[i] ?? 0) * +(a[i + 1] ?? 0);
        return s;
      }
      // ── Fallback ─────────────────────────────────────────────────────────────
      default: return `#${name.toUpperCase()}?`;
    }
  }
}

function coerce(v: unknown): Val {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? String(v) : n;
}

export function evalFormula(expr: string, ctx: Record<string, unknown>): Val {
  if (!expr.trim()) return null;
  try {
    return new Parser(tokenize(expr.trim()), ctx).parse();
  } catch {
    return '#ERROR';
  }
}

// Human-readable description of supported functions shown in the UI
export const FORMULA_HELP = [
  { cat: 'Lógica',    fns: ['SI(cond, sí, no)', 'Y(a,b)', 'O(a,b)', 'NO(a)', 'ESBLANCO(v)', 'SI.ERROR(expr, fallback)', 'COALESCE(a,b,…)'] },
  { cat: 'Matemática', fns: ['ABS(n)', 'REDONDEAR(n, dec)', 'ENTERO(n)', 'TECHO(n)', 'PISO(n)', 'MAX(a,b,…)', 'MIN(a,b,…)', 'SUMA(a,b,…)', 'PROMEDIO(a,b,…)', 'RAIZ(n)', 'POTENCIA(base,exp)', 'MODULO(a,b)', 'SIGNO(n)', 'SUMAPRODUCTO(a,b,…)'] },
  { cat: 'Texto',     fns: ['CONCAT(a,b,…)', 'LARGO(txt)', 'MAYUS(txt)', 'MINUS(txt)', 'NOMPROPIO(txt)', 'IZQUIERDA(txt,n)', 'DERECHA(txt,n)', 'MEDIO(txt,inicio,n)', 'RECORTAR(txt)', 'REEMPLAZAR(txt,buscar,reemplazar)', 'SUSTITUIR(txt,viejo,nuevo[,n])', 'LIMPIAR(txt)', 'ENCONTRAR(buscar, en)'] },
  { cat: 'Fechas',    fns: ['HOY()', 'AHORA()', 'AÑO(fecha)', 'MES(fecha)', 'DIA(fecha)', 'DIAS(fin, inicio)'] },
  { cat: 'Conversión', fns: ['TEXTO(n)', 'NUMERO(txt)'] },
];
