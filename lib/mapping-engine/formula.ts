/**
 * Mapping Engine v2 — Safe Formula Parser & Evaluator
 *
 * Supports a restricted expression language — NO eval(), NO Function().
 * Everything is interpreted via a hand-written recursive-descent parser.
 *
 * Supported syntax:
 *   Literals       3.14  -2  "text"  'text'
 *   Column refs    {COLUMN_NAME}  — replaced from the source row
 *   Arithmetic     + - * / %  with standard precedence, unary -
 *   Functions      CONCAT  COALESCE  IF  ABS  ROUND  FLOOR  CEIL
 *                  LEFT  RIGHT  MID  LEN  TRIM  UPPER  LOWER
 *   Comparisons    = <> < > <= >=  (inside IF condition only)
 *   Boolean        AND  OR  NOT  EMPTY(x)  NOTEMPTY(x)
 */

// ── Tokenizer ────────────────────────────────────────────────────────────────

type TT =
  | 'NUM' | 'STR' | 'COL' | 'IDENT'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT'
  | 'EQ' | 'NEQ' | 'LT' | 'GT' | 'LTE' | 'GTE'
  | 'LPAREN' | 'RPAREN' | 'COMMA'
  | 'EOF';

interface Token { type: TT; value: string; pos: number }

const WHITELIST_FUNS = new Set([
  'CONCAT', 'COALESCE', 'IF',
  'ABS', 'ROUND', 'FLOOR', 'CEIL',
  'LEFT', 'RIGHT', 'MID', 'LEN',
  'TRIM', 'UPPER', 'LOWER',
  'EMPTY', 'NOTEMPTY',
]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    // whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // numbers
    if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
      tokens.push({ type: 'NUM', value: num, pos: i });
      continue;
    }

    // strings
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      let s = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { i++; s += src[i++]; }
        else s += src[i++];
      }
      i++; // closing quote
      tokens.push({ type: 'STR', value: s, pos: i });
      continue;
    }

    // column references {NAME}
    if (src[i] === '{') {
      i++;
      let name = '';
      while (i < src.length && src[i] !== '}') name += src[i++];
      i++; // closing }
      tokens.push({ type: 'COL', value: name.trim(), pos: i });
      continue;
    }

    // identifiers / keywords
    if (/[A-Za-z_]/.test(src[i])) {
      let id = '';
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) id += src[i++];
      const upper = id.toUpperCase();
      tokens.push({ type: 'IDENT', value: upper, pos: i });
      continue;
    }

    // operators
    if (src[i] === '<' && src[i + 1] === '>') { tokens.push({ type: 'NEQ',   value: '<>', pos: i }); i += 2; continue; }
    if (src[i] === '<' && src[i + 1] === '=') { tokens.push({ type: 'LTE',   value: '<=', pos: i }); i += 2; continue; }
    if (src[i] === '>' && src[i + 1] === '=') { tokens.push({ type: 'GTE',   value: '>=', pos: i }); i += 2; continue; }
    if (src[i] === '<') { tokens.push({ type: 'LT',    value: '<',  pos: i }); i++; continue; }
    if (src[i] === '>') { tokens.push({ type: 'GT',    value: '>',  pos: i }); i++; continue; }
    if (src[i] === '=') { tokens.push({ type: 'EQ',    value: '=',  pos: i }); i++; continue; }
    if (src[i] === '+') { tokens.push({ type: 'PLUS',  value: '+',  pos: i }); i++; continue; }
    if (src[i] === '-') { tokens.push({ type: 'MINUS', value: '-',  pos: i }); i++; continue; }
    if (src[i] === '*') { tokens.push({ type: 'STAR',  value: '*',  pos: i }); i++; continue; }
    if (src[i] === '/') { tokens.push({ type: 'SLASH', value: '/',  pos: i }); i++; continue; }
    if (src[i] === '%') { tokens.push({ type: 'PERCENT',value:'%',  pos: i }); i++; continue; }
    if (src[i] === '(') { tokens.push({ type: 'LPAREN',value:'(',  pos: i }); i++; continue; }
    if (src[i] === ')') { tokens.push({ type: 'RPAREN',value:')',  pos: i }); i++; continue; }
    if (src[i] === ',') { tokens.push({ type: 'COMMA', value: ',',  pos: i }); i++; continue; }

    throw new Error(`Formula: unexpected character '${src[i]}' at position ${i}`);
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}

// ── Parser ────────────────────────────────────────────────────────────────────

type ExprNode =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'col'; name: string }
  | { kind: 'binop'; op: string; left: ExprNode; right: ExprNode }
  | { kind: 'unary'; op: string; operand: ExprNode }
  | { kind: 'call'; fn: string; args: ExprNode[] }
  | { kind: 'bool'; value: boolean }
  | { kind: 'cmp'; op: string; left: ExprNode; right: ExprNode }
  | { kind: 'logic'; op: 'AND' | 'OR'; left: ExprNode; right: ExprNode }
  | { kind: 'not'; operand: ExprNode };

class Parser {
  private tokens: Token[];
  private pos = 0;
  private depth = 0;
  private static MAX_DEPTH = 32;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }

  private expect(type: TT): Token {
    const t = this.advance();
    if (t.type !== type) throw new Error(`Formula: expected ${type} but got ${t.type} ('${t.value}')`);
    return t;
  }

  private checkDepth() {
    if (++this.depth > Parser.MAX_DEPTH) throw new Error('Formula: expression too deeply nested');
  }

  // ── Entry point ─────────────────────────────────────────────────────────────

  parseExpr(): ExprNode {
    this.checkDepth();
    try { return this.parseBoolOr(); }
    finally { this.depth--; }
  }

  // ── Boolean layer (only reached inside IF) ──────────────────────────────────

  private parseBoolOr(): ExprNode {
    let left = this.parseBoolAnd();
    while (this.peek().type === 'IDENT' && this.peek().value === 'OR') {
      this.advance();
      const right = this.parseBoolAnd();
      left = { kind: 'logic', op: 'OR', left, right };
    }
    return left;
  }

  private parseBoolAnd(): ExprNode {
    let left = this.parseBoolNot();
    while (this.peek().type === 'IDENT' && this.peek().value === 'AND') {
      this.advance();
      const right = this.parseBoolNot();
      left = { kind: 'logic', op: 'AND', left, right };
    }
    return left;
  }

  private parseBoolNot(): ExprNode {
    if (this.peek().type === 'IDENT' && this.peek().value === 'NOT') {
      this.advance();
      return { kind: 'not', operand: this.parseBoolNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): ExprNode {
    const left = this.parseAdd();
    const cmpOps: TT[] = ['EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE'];
    if (cmpOps.includes(this.peek().type)) {
      const op = this.advance().value;
      const right = this.parseAdd();
      return { kind: 'cmp', op, left, right };
    }
    return left;
  }

  // ── Arithmetic layer ────────────────────────────────────────────────────────

  private parseAdd(): ExprNode {
    let left = this.parseMul();
    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      const op = this.advance().value;
      const right = this.parseMul();
      left = { kind: 'binop', op, left, right };
    }
    return left;
  }

  private parseMul(): ExprNode {
    let left = this.parseUnary();
    while (this.peek().type === 'STAR' || this.peek().type === 'SLASH' || this.peek().type === 'PERCENT') {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { kind: 'binop', op, left, right };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    if (this.peek().type === 'MINUS') {
      this.advance();
      return { kind: 'unary', op: '-', operand: this.parsePrimary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExprNode {
    const t = this.peek();

    if (t.type === 'NUM') {
      this.advance();
      return { kind: 'num', value: parseFloat(t.value) };
    }

    if (t.type === 'STR') {
      this.advance();
      return { kind: 'str', value: t.value };
    }

    if (t.type === 'COL') {
      this.advance();
      return { kind: 'col', name: t.value };
    }

    if (t.type === 'IDENT') {
      const name = t.value;
      if (!WHITELIST_FUNS.has(name)) {
        throw new Error(`Formula: unknown function or identifier '${name}'. Only whitelisted functions are allowed.`);
      }
      this.advance();
      this.expect('LPAREN');
      const args: ExprNode[] = [];
      if (this.peek().type !== 'RPAREN') {
        args.push(this.parseExpr());
        while (this.peek().type === 'COMMA') {
          this.advance();
          args.push(this.parseExpr());
        }
      }
      this.expect('RPAREN');
      return { kind: 'call', fn: name, args };
    }

    if (t.type === 'LPAREN') {
      this.advance();
      const inner = this.parseExpr();
      this.expect('RPAREN');
      return inner;
    }

    throw new Error(`Formula: unexpected token '${t.value}' (${t.type})`);
  }
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

function evalNode(node: ExprNode, row: Record<string, string>, current: string): string | number | boolean {
  switch (node.kind) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'bool': return node.value;
    case 'col': return row[node.name] ?? '';

    case 'unary': {
      const v = toNum(evalNode(node.operand, row, current));
      return node.op === '-' ? -v : v;
    }

    case 'binop': {
      const l = evalNode(node.left,  row, current);
      const r = evalNode(node.right, row, current);
      if (node.op === '+') {
        // Allow string concat with +
        if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r);
        return toNum(l) + toNum(r);
      }
      const ln = toNum(l); const rn = toNum(r);
      if (node.op === '-') return ln - rn;
      if (node.op === '*') return ln * rn;
      if (node.op === '/') { if (rn === 0) throw new Error('Formula: division by zero'); return ln / rn; }
      if (node.op === '%') return ln % rn;
      return ln;
    }

    case 'cmp': {
      const l = evalNode(node.left,  row, current);
      const r = evalNode(node.right, row, current);
      const ls = String(l); const rs = String(r);
      const ln = parseFloat(ls);  const rn = parseFloat(rs);
      switch (node.op) {
        case '=':  return ls === rs;
        case '<>': return ls !== rs;
        case '<':  return isNaN(ln) || isNaN(rn) ? ls < rs : ln < rn;
        case '>':  return isNaN(ln) || isNaN(rn) ? ls > rs : ln > rn;
        case '<=': return isNaN(ln) || isNaN(rn) ? ls <= rs : ln <= rn;
        case '>=': return isNaN(ln) || isNaN(rn) ? ls >= rs : ln >= rn;
        default:   return false;
      }
    }

    case 'logic': {
      const l = toBool(evalNode(node.left,  row, current));
      const r = toBool(evalNode(node.right, row, current));
      return node.op === 'AND' ? l && r : l || r;
    }

    case 'not':
      return !toBool(evalNode(node.operand, row, current));

    case 'call':
      return evalCall(node.fn, node.args, row, current);
  }
}

function evalCall(fn: string, args: ExprNode[], row: Record<string, string>, current: string): string | number | boolean {
  const ev = (n: ExprNode) => evalNode(n, row, current);
  const evStr = (n: ExprNode) => String(ev(n));
  const evNum = (n: ExprNode) => toNum(ev(n));

  switch (fn) {
    case 'CONCAT':  return args.map(evStr).join('');
    case 'COALESCE': {
      for (const a of args) { const v = evStr(a); if (v) return v; }
      return '';
    }
    case 'IF': {
      if (args.length < 2 || args.length > 3) throw new Error('IF requires 2 or 3 arguments');
      const cond = toBool(ev(args[0]));
      return cond ? ev(args[1]) : args[2] ? ev(args[2]) : '';
    }
    case 'ABS':   return Math.abs(evNum(args[0]));
    case 'ROUND': { const n = evNum(args[0]); const d = args[1] ? evNum(args[1]) : 0; return parseFloat(n.toFixed(Math.round(d))); }
    case 'FLOOR': return Math.floor(evNum(args[0]));
    case 'CEIL':  return Math.ceil(evNum(args[0]));
    case 'LEFT':  { const s = evStr(args[0]); const n = Math.round(evNum(args[1])); return s.slice(0, n); }
    case 'RIGHT': { const s = evStr(args[0]); const n = Math.round(evNum(args[1])); return s.slice(-n); }
    case 'MID':   { const s = evStr(args[0]); const start = Math.round(evNum(args[1])) - 1; const len = Math.round(evNum(args[2])); return s.slice(start, start + len); }
    case 'LEN':   return evStr(args[0]).length;
    case 'TRIM':  return evStr(args[0]).trim();
    case 'UPPER': return evStr(args[0]).toUpperCase();
    case 'LOWER': return evStr(args[0]).toLowerCase();
    case 'EMPTY':    return !evStr(args[0]).trim();
    case 'NOTEMPTY': return Boolean(evStr(args[0]).trim());
    default: throw new Error(`Formula: unknown function '${fn}'`);
  }
}

function toNum(v: string | number | boolean): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseFloat(String(v).replace(/[,£$€¥]/g, ''));
  return isNaN(n) ? 0 : n;
}

function toBool(v: string | number | boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).toLowerCase().trim();
  return s !== '' && s !== '0' && s !== 'false' && s !== 'no';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a formula expression against a source row.
 * `current` is the value flowing through the pipeline at the formula step.
 * Returns the result as a string.
 *
 * Throws on syntax errors or unknown identifiers.
 */
export function evaluateFormula(
  expression: string,
  row: Record<string, string>,
  current: string,
): string {
  if (!expression.trim()) return current;
  const tokens = tokenize(expression);
  const parser = new Parser(tokens);
  const ast = parser.parseExpr();

  // Ensure whole expression was consumed
  const remaining = parser['peek']();
  if (remaining.type !== 'EOF') {
    throw new Error(`Formula: unexpected token after expression: '${remaining.value}'`);
  }

  const result = evalNode(ast, row, current);
  // Round floats to avoid 0.1+0.2 = 0.30000000000000004
  if (typeof result === 'number') {
    return parseFloat(result.toPrecision(12)).toString();
  }
  return String(result);
}

/**
 * Validate a formula without evaluating it.
 * Returns null if valid, or an error message string.
 */
export function validateFormula(expression: string): string | null {
  if (!expression.trim()) return null;
  try {
    const tokens = tokenize(expression);
    const parser = new Parser(tokens);
    parser.parseExpr();
    const remaining = parser['peek']();
    if (remaining.type !== 'EOF') {
      return `Unexpected token after expression: '${remaining.value}'`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
