/* =====================================================================
 *  EMU386 - Ensamblador 8086/80386 (sintaxis Intel, estilo MASM/NASM)
 *  Genera código máquina x86 real de 16 y 32 bits (directiva BITS 16/32)
 *  que luego ejecuta el CPU.
 * ===================================================================== */
'use strict';
(function (EMU) {

  const REG8 = { al: 0, cl: 1, dl: 2, bl: 3, ah: 4, ch: 5, dh: 6, bh: 7 };
  const REG16 = { ax: 0, cx: 1, dx: 2, bx: 3, sp: 4, bp: 5, si: 6, di: 7 };
  const REG32 = { eax: 0, ecx: 1, edx: 2, ebx: 3, esp: 4, ebp: 5, esi: 6, edi: 7 };
  const SREG = { es: 0, cs: 1, ss: 2, ds: 3, fs: 4, gs: 5 };
  const CREG = { cr0: 0, cr2: 2, cr3: 3 };
  const SEG_PREFIX = [0x26, 0x2E, 0x36, 0x3E, 0x64, 0x65];
  const PREFIXES = { rep: 0xF3, repe: 0xF3, repz: 0xF3, repne: 0xF2, repnz: 0xF2, lock: 0xF0 };
  const isReg = (l) => l in REG8 || l in REG16 || l in REG32 || l in SREG || l in CREG;

  const JCC = {
    jo: 0, jno: 1, jb: 2, jc: 2, jnae: 2, jnb: 3, jae: 3, jnc: 3, je: 4, jz: 4, jne: 5, jnz: 5,
    jbe: 6, jna: 6, ja: 7, jnbe: 7, js: 8, jns: 9, jp: 10, jpe: 10, jnp: 11, jpo: 11,
    jl: 12, jnge: 12, jge: 13, jnl: 13, jle: 14, jng: 14, jg: 15, jnle: 15,
  };
  const SETCC = {};
  for (const k of Object.keys(JCC)) SETCC['set' + k.slice(1)] = JCC[k];
  const ALU = { add: 0, or: 1, adc: 2, sbb: 3, and: 4, sub: 5, xor: 6, cmp: 7 };
  const SHIFT = { rol: 0, ror: 1, rcl: 2, rcr: 3, shl: 4, sal: 4, shr: 5, sar: 7 };
  const GRP3 = { not: 2, neg: 3, mul: 4, div: 6, idiv: 7 };
  const LOOPS = { loopne: [0xE0], loopnz: [0xE0], loope: [0xE1], loopz: [0xE1], loop: [0xE2], jcxz: [0xE3, 16], jecxz: [0xE3, 32] };
  // [bytes, tamaño de operando]: null = no depende del tamaño, 'd' = el del modo actual, 16/32 = fijo
  const SIMPLE = {
    nop: [[0x90], null], hlt: [[0xF4], null], clc: [[0xF8], null], stc: [[0xF9], null], cmc: [[0xF5], null],
    cli: [[0xFA], null], sti: [[0xFB], null], cld: [[0xFC], null], std: [[0xFD], null],
    pushf: [[0x9C], 'd'], pushfw: [[0x9C], 16], pushfd: [[0x9C], 32], popf: [[0x9D], 'd'], popfw: [[0x9D], 16], popfd: [[0x9D], 32],
    pusha: [[0x60], 'd'], pushaw: [[0x60], 16], pushad: [[0x60], 32], popa: [[0x61], 'd'], popaw: [[0x61], 16], popad: [[0x61], 32],
    lahf: [[0x9F], null], sahf: [[0x9E], null], cbw: [[0x98], 16], cwde: [[0x98], 32], cwd: [[0x99], 16], cdq: [[0x99], 32],
    xlat: [[0xD7], null], xlatb: [[0xD7], null], iret: [[0xCF], 'd'], iretw: [[0xCF], 16], iretd: [[0xCF], 32],
    into: [[0xCE], null], int3: [[0xCC], null], leave: [[0xC9], 'd'],
    wait: [[0x9B], null], clts: [[0x0F, 0x06], null], daa: [[0x27], null], das: [[0x2F], null], aaa: [[0x37], null], aas: [[0x3F], null],
    movsb: [[0xA4], null], movsw: [[0xA5], 16], movsd: [[0xA5], 32], cmpsb: [[0xA6], null], cmpsw: [[0xA7], 16], cmpsd: [[0xA7], 32],
    stosb: [[0xAA], null], stosw: [[0xAB], 16], stosd: [[0xAB], 32], lodsb: [[0xAC], null], lodsw: [[0xAD], 16], lodsd: [[0xAD], 32],
    scasb: [[0xAE], null], scasw: [[0xAF], 16], scasd: [[0xAF], 32],
  };
  const SYS_M = { sgdt: 0, sidt: 1, lgdt: 2, lidt: 3, invlpg: 7 };        // 0F 01 /n (memoria)
  const SYS_W01 = { smsw: 4, lmsw: 6 };                         // 0F 01 /n (r/m16)
  const SYS_W00 = { sldt: 0, str: 1, lldt: 2, ltr: 3, verr: 4, verw: 5 }; // 0F 00 /n
  const BT = { bt: 4, bts: 5, btr: 6, btc: 7 };
  const BT_R = { bt: 0xA3, bts: 0xAB, btr: 0xB3, btc: 0xBB };

  const OTHER = ['mov', 'lea', 'lds', 'les', 'lss', 'lfs', 'lgs', 'push', 'pop', 'inc', 'dec', 'imul', 'test', 'xchg', 'jmp', 'call',
    'ret', 'retn', 'retf', 'int', 'in', 'out', 'enter', 'aam', 'aad', 'lar', 'lsl', 'arpl', 'bios',
    'movzx', 'movsx', 'bsf', 'bsr', 'shld', 'shrd'];
  const MNEMONICS = new Set([].concat(Object.keys(JCC), Object.keys(SETCC), Object.keys(ALU), Object.keys(SHIFT), Object.keys(GRP3),
    Object.keys(LOOPS), Object.keys(SIMPLE), Object.keys(SYS_M), Object.keys(SYS_W01), Object.keys(SYS_W00), Object.keys(BT), OTHER));
  EMU.MNEMONICS = MNEMONICS;

  const IGNORED = new Set(['.model', '.stack', '.data', '.code', '.286', '.286p', '.386', '.386p', '.8086', '.186',
    'assume', 'title', 'name', 'page', '.startup', 'segment', 'ends', 'endp', 'cpu', 'section']);
  const NAME_DIRS = new Set(['db', 'dw', 'dd', 'equ', '=', 'proc', 'endp', 'segment', 'ends']);

  class AsmError extends Error { }
  const err = (m) => new AsmError(m);

  // ------------------------------------------------------------------
  //  Expresiones
  // ------------------------------------------------------------------
  function parseNumber(s) {
    const l = s.toLowerCase().replace(/_/g, '');
    let m;
    if ((m = /^0x([0-9a-f]+)$/.exec(l))) return parseInt(m[1], 16);
    if ((m = /^0b([01]+)$/.exec(l))) return parseInt(m[1], 2);
    if ((m = /^([0-9][0-9a-f]*)h$/.exec(l))) return parseInt(m[1], 16);
    if ((m = /^([01]+)[by]$/.exec(l))) return parseInt(m[1], 2);
    if ((m = /^([0-7]+)[oq]$/.exec(l))) return parseInt(m[1], 8);
    if ((m = /^([0-9]+)d?$/.exec(l))) return parseInt(m[1], 10);
    throw err(`Número inválido: '${s}' (use 1234, 0FFh, 0x1F o 1010b)`);
  }

  function tokenize(s) {
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "'" || c === '"') {
        const j = s.indexOf(c, i + 1);
        if (j < 0) throw err('Falta cerrar la comilla');
        toks.push({ t: 'str', v: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(c)) {
        const m = /^[0-9][0-9a-zA-Z_]*/.exec(s.slice(i));
        toks.push({ t: 'num', v: parseNumber(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_.@?$]/.test(c)) {
        const m = /^[A-Za-z_.@?$][\w.@?$]*/.exec(s.slice(i));
        toks.push({ t: 'id', v: m[0] });
        i += m[0].length;
        continue;
      }
      const two = s.substr(i, 2);
      if (two === '<<' || two === '>>') { toks.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/%&|^~()'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw err(`Carácter inesperado '${c}' en la expresión`);
    }
    return toks;
  }

  function strValue(str) {
    let v = 0;
    const ch = Array.from(str);
    if (ch.length === 0) throw err('Cadena vacía en una expresión');
    if (ch.length > 4) throw err(`Constante de caracteres demasiado larga: '${str}'`);
    ch.forEach((c, i) => { v += EMU.toCP437(c) * Math.pow(256, i); });
    return v;
  }

  function parseExpr(str) {
    const toks = tokenize(str);
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
    function primary() {
      const t = toks[p++];
      if (!t) throw err('Expresión incompleta');
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'str') return { k: 'num', v: strValue(t.v) };
      if (t.t === 'id') {
        const l = t.v.toLowerCase();
        if (l === 'offset') return { k: 'offset', a: unary() };
        if (l === '$') return { k: 'here' };
        if (l === '$$') return { k: 'num', v: 0 };
        if (l === '@data' || l === '@code') return { k: 'num', v: EMU.PROG_SEG };
        if (isReg(l)) throw err(`No se puede usar el registro ${t.v.toUpperCase()} dentro de esta expresión`);
        return { k: 'sym', name: l, orig: t.v };
      }
      if (t.t === 'op' && t.v === '(') {
        const e = orExpr();
        if (!isOp(')')) throw err('Falta cerrar paréntesis');
        p++;
        return e;
      }
      throw err(`Símbolo inesperado '${t.v}'`);
    }
    function unary() {
      const t = peek();
      if (t && t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '~')) { p++; return { k: 'un', op: t.v, a: unary() }; }
      return primary();
    }
    function level(ops, next) {
      return function () {
        let a = next();
        while (toks[p] && toks[p].t === 'op' && ops.includes(toks[p].v)) {
          const op = toks[p++].v;
          a = { k: 'bin', op, a, b: next() };
        }
        return a;
      };
    }
    const mulExpr = level(['*', '/', '%'], unary);
    const addExpr = level(['+', '-'], mulExpr);
    const shExpr = level(['<<', '>>'], addExpr);
    const andExpr = level(['&'], shExpr);
    const xorExpr = level(['^'], andExpr);
    const orExpr = level(['|'], xorExpr);
    if (toks.length === 0) throw err('Falta un valor');
    const e = orExpr();
    if (p < toks.length) throw err(`Texto sobrante en la expresión: '${toks.slice(p).map(t => t.v).join(' ')}'`);
    return e;
  }

  // ------------------------------------------------------------------
  //  Análisis de línea
  // ------------------------------------------------------------------
  function stripComment(s) {
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === q) q = null; }
      else if (c === "'" || c === '"') q = c;
      else if (c === ';') return s.slice(0, i);
    }
    return s;
  }

  function splitTop(s, sep) {
    const out = [];
    let depth = 0, q = null, cur = '';
    for (const c of s) {
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; cur += c; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  function topLevelIndexOf(s, ch) {
    let depth = 0, q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (c === ch && depth === 0) return i;
    }
    return -1;
  }

  function parseMemBody(s, seg, size) {
    s = s.replace(/\[\s*(es|cs|ss|ds|fs|gs)\s*:/i, (all, g) => { seg = SREG[g.toLowerCase()]; return '['; });
    const flat = s.replace(/\[/g, '+').replace(/\]/g, ' ');
    // separar términos por + y - de nivel superior
    const terms = [];
    let depth = 0, q = null, cur = '', sign = '+';
    const pushTerm = () => { if (cur.trim()) terms.push({ sign, text: cur.trim() }); cur = ''; };
    for (let i = 0; i < flat.length; i++) {
      const c = flat[i];
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; cur += c; continue; }
      if (c === '(') depth++;
      if (c === ')') depth--;
      if ((c === '+' || c === '-') && depth === 0) {
        if (cur.trim()) { pushTerm(); sign = c; }
        else sign = (sign === '-') !== (c === '-') ? '-' : '+';
        continue;
      }
      cur += c;
    }
    pushTerm();
    let base = null, index = null, scale = 1, a32 = null;
    const disp = [];
    const setMode = (m) => {
      if (a32 !== null && a32 !== m) throw err('No se pueden mezclar registros de 16 y de 32 bits en una misma dirección');
      a32 = m;
    };
    for (const t of terms) {
      const l = t.text.toLowerCase().replace(/\s+/g, '');
      const sc = /^([a-z]{2,3})\*(\d+)$/.exec(l) || (/^(\d+)\*([a-z]{2,3})$/.exec(l) && [null, /^(\d+)\*([a-z]{2,3})$/.exec(l)[2], /^(\d+)\*([a-z]{2,3})$/.exec(l)[1]]);
      if (sc && sc[1] in REG32) {
        if (t.sign === '-') throw err('Un registro no puede restarse en una dirección');
        setMode(true);
        if (index) throw err('Solo puede haber un registro índice escalado');
        const f = +sc[2];
        if (![1, 2, 4, 8].includes(f)) throw err('El factor de escala debe ser 1, 2, 4 u 8');
        if (sc[1] === 'esp') throw err('ESP no puede usarse como índice');
        index = sc[1]; scale = f;
        continue;
      }
      if (sc && isReg(sc[1])) throw err('Solo los registros de 32 bits pueden escalarse (por ejemplo [EBX+ESI*4])');
      if (l in REG32) {
        if (t.sign === '-') throw err('Un registro no puede restarse en una dirección');
        setMode(true);
        if (!base) base = l;
        else if (!index) {
          if (l === 'esp') { if (base === 'esp') throw err('ESP no puede usarse como índice'); index = base; base = 'esp'; }
          else index = l;
        } else throw err('Demasiados registros en la dirección (máximo: base + índice)');
        continue;
      }
      if (l === 'bx' || l === 'bp') {
        if (t.sign === '-') throw err('Un registro no puede restarse en una dirección');
        setMode(false);
        if (base) throw err('Solo se permite un registro base (BX o BP)');
        base = l;
      } else if (l === 'si' || l === 'di') {
        if (t.sign === '-') throw err('Un registro no puede restarse en una dirección');
        setMode(false);
        if (index) throw err('Solo se permite un registro índice (SI o DI)');
        index = l;
      } else if (isReg(l)) {
        throw err(`Con direcciones de 16 bits solo BX, BP, SI y DI sirven para direccionar (no ${l.toUpperCase()}). Con 32 bits puede usar cualquier registro de 32 bits: [EAX], [EBX+ECX*4]…`);
      } else {
        disp.push(t.sign + '(' + t.text + ')');
      }
    }
    return { t: 'mem', size, seg, base, index, scale, a32, dispAst: parseExpr(disp.length ? disp.join('') : '0'), far: false };
  }

  function parseOperand(str) {
    let s = str.trim();
    if (!s) throw err('Operando vacío');
    let size = 0, dist = null, far = false;
    for (;;) {
      const m = /^(byte|word|dword|fword|far|near|short)\b\s*(ptr\b)?\s*/i.exec(s);
      if (!m) break;
      const k = m[1].toLowerCase();
      if (k === 'byte') size = 8; else if (k === 'word') size = 16; else if (k === 'dword') size = 32;
      else if (k === 'far' || k === 'fword') far = true; else dist = k;
      s = s.slice(m[0].length);
    }
    const l = s.toLowerCase();
    if (l in REG8) return { t: 'reg', rt: 'r', size: 8, n: REG8[l], name: l };
    if (l in REG16) return { t: 'reg', rt: 'r', size: 16, n: REG16[l], name: l };
    if (l in REG32) return { t: 'reg', rt: 'r', size: 32, n: REG32[l], name: l };
    if (l in SREG) return { t: 'reg', rt: 's', size: 16, n: SREG[l], name: l };
    if (l in CREG) return { t: 'reg', rt: 'c', size: 32, n: CREG[l], name: l };
    const m = /^(es|cs|ss|ds|fs|gs)\s*:\s*(.+)$/i.exec(s);
    if (m) {
      const r = parseMemBody(m[2].trim(), SREG[m[1].toLowerCase()], size);
      r.far = far;
      return r;
    }
    if (s.includes('[')) { const r = parseMemBody(s, null, size); r.far = far; return r; }
    const ci = topLevelIndexOf(s, ':');
    if (ci >= 0) return { t: 'far', selAst: parseExpr(s.slice(0, ci)), offAst: parseExpr(s.slice(ci + 1)), size };
    return { t: 'expr', ast: parseExpr(s), size, dist, far };
  }

  function parseDataItems(s) {
    const items = [];
    for (const raw of splitTop(s, ',')) {
      const it = raw.trim();
      if (!it) throw err('Elemento de datos vacío');
      const m = /^(.+?)\s+dup\s*\((.*)\)\s*$/i.exec(it);
      if (m) { items.push({ k: 'dup', count: parseExpr(m[1]), items: parseDataItems(m[2]) }); continue; }
      if (it === '?') { items.push({ k: 'undef' }); continue; }
      if ((it[0] === "'" || it[0] === '"') && it.length >= 2 && it[it.length - 1] === it[0] && it.indexOf(it[0], 1) === it.length - 1) {
        items.push({ k: 'str', v: it.slice(1, -1) });
        continue;
      }
      items.push({ k: 'expr', ast: parseExpr(it) });
    }
    return items;
  }

  function parseLine(raw, src, lineNo, opts, state) {
    let s = stripComment(raw).trim();
    const st = { src, line: lineNo, text: raw, label: null, kind: 'none', bytes: [], addr: 0, bits: state.bits };
    if (!s || s[0] === '#') return st;
    let m = /^([A-Za-z_.@?$][\w.@?$]*)\s*:(?!:)/.exec(s);
    if (m && !(m[1].toLowerCase() in SREG)) { st.label = m[1]; s = s.slice(m[0].length).trim(); }
    if (!s) return st;
    m = /^([A-Za-z_.@?$][\w.@?$]*)\s*(.*)$/.exec(s);
    if (!m) throw err(`Sintaxis inválida: '${s}'`);
    let w1 = m[1], rest = m[2];
    let lw = w1.toLowerCase();
    const m2 = /^([A-Za-z_.@?$][\w.@?$]*|=)(?:\s+|$)(.*)$/.exec(rest) || /^(=)\s*(.*)$/.exec(rest);
    if (m2 && NAME_DIRS.has(m2[1].toLowerCase())) {
      const w2 = m2[1].toLowerCase();
      if (w2 === 'equ' || w2 === '=') { st.kind = 'equ'; st.name = w1; st.ast = parseExpr(m2[2]); return st; }
      if (w2 === 'proc') { st.label = w1; return st; }
      if (w2 === 'endp' || w2 === 'segment' || w2 === 'ends') return st;
      if (st.label) throw err('Doble etiqueta en la misma línea');
      st.label = w1; lw = w2; rest = m2[2];
    }
    if (lw === 'bits' || lw === 'use16' || lw === 'use32') {
      const b = lw === 'use16' ? 16 : lw === 'use32' ? 32 : parseInt(rest, 10);
      if (b !== 16 && b !== 32) throw err('BITS debe ser 16 o 32');
      state.bits = b;
      st.bits = b;
      st.kind = 'bits';
      return st;
    }
    if (lw === 'db' || lw === 'dw' || lw === 'dd') {
      st.kind = 'data';
      st.size = { db: 1, dw: 2, dd: 4 }[lw];
      if (!rest.trim()) throw err(`${lw.toUpperCase()} requiere al menos un valor`);
      st.items = parseDataItems(rest);
      return st;
    }
    if (lw === 'org') { st.kind = 'org'; st.ast = parseExpr(rest); return st; }
    if (lw === 'align') { st.kind = 'align'; st.ast = parseExpr(rest); return st; }
    if (lw === 'end') { st.kind = 'end'; if (rest.trim()) st.ast = parseExpr(rest); return st; }
    if (lw === 'times') {
      const words = rest.split(/\s+/);
      let k = 0;
      while (k < words.length && !(MNEMONICS.has(words[k].toLowerCase()) || ['db', 'dw', 'dd'].includes(words[k].toLowerCase()))) k++;
      if (k === 0 || k >= words.length) throw err('TIMES: use "TIMES cantidad instrucción"');
      st.kind = 'times';
      st.count = parseExpr(words.slice(0, k).join(' '));
      st.inner = parseLine(words.slice(k).join(' '), src, lineNo, opts, state);
      return st;
    }
    if (IGNORED.has(lw)) return st;
    if (lw in PREFIXES) {
      st.prefix = lw;
      const m3 = /^([A-Za-z]+)\s*(.*)$/.exec(rest);
      if (!m3) { st.kind = 'instr'; st.mnem = null; st.ops = []; return st; }
      lw = m3[1].toLowerCase(); rest = m3[2];
    }
    if (!MNEMONICS.has(lw) || (lw === 'bios' && !opts.allowBios)) {
      throw err(`Instrucción o directiva desconocida: '${w1}'`);
    }
    st.kind = 'instr';
    st.mnem = lw;
    st.ops = rest.trim() ? splitTop(rest, ',').map(parseOperand) : [];
    return st;
  }

  // ------------------------------------------------------------------
  //  Codificación
  // ------------------------------------------------------------------
  const toS16 = (v) => (((v & 0xFFFF) ^ 0x8000) - 0x8000);
  const fitsS8 = (v, size) => {
    const x = size === 8 ? (((v & 0xFF) ^ 0x80) - 0x80) : size === 32 ? (v | 0) : toS16(v);
    return x >= -128 && x <= 127;
  };
  const le = (v, n) => { const o = []; v = Math.trunc(v); for (let i = 0; i < n; i++) o.push(Number((BigInt.asUintN(32, BigInt(v)) >> BigInt(8 * i)) & 0xFFn)); return o; };
  const isR = (o) => o && o.t === 'reg' && o.rt === 'r';
  const isS = (o) => o && o.t === 'reg' && o.rt === 's';
  const isC = (o) => o && o.t === 'reg' && o.rt === 'c';
  const isM = (o) => o && o.t === 'mem';
  const isRM = (o) => isR(o) || isM(o);
  const isI = (o) => o && o.t === 'imm';

  class Assembler {
    constructor() { this.syms = new Map(); this.B32 = false; }

    // prefijo de tamaño de operando (66h) si difiere del modo actual
    osz(size) { return (size === 16 || size === 32) && ((size === 32) !== this.B32) ? [0x66] : []; }

    evalAst(a, ctx) {
      switch (a.k) {
        case 'num': return a.v;
        case 'here': ctx.usesSym = true; return ctx.addr;
        case 'offset': ctx.hasOffset = true; return this.evalAst(a.a, ctx);
        case 'sym': {
          const s = this.syms.get(a.name);
          if (!s) { ctx.unres = true; ctx.undef = ctx.undef || a.orig; return 0; }
          if (s.kind !== 'const' || s.usesSym) ctx.usesSym = true;
          if (s.kind === 'data' && !ctx.dataSym) ctx.dataSym = s;
          if (!s.defined || s.unres) { ctx.unres = true; return 0; }
          return s.value;
        }
        case 'un': {
          const v = this.evalAst(a.a, ctx);
          return a.op === '-' ? -v : a.op === '~' ? ~v : v;
        }
        case 'bin': {
          const x = this.evalAst(a.a, ctx), y = this.evalAst(a.b, ctx);
          switch (a.op) {
            case '+': return x + y;
            case '-': return x - y;
            case '*': return x * y;
            case '/': if (y === 0) { if (ctx.unres) return 0; throw err('División por cero en la expresión'); } return Math.trunc(x / y);
            case '%': if (y === 0) { if (ctx.unres) return 0; throw err('División por cero en la expresión'); } return x % y;
            case '<<': return x * Math.pow(2, y);
            case '>>': return Math.floor(x / Math.pow(2, y));
            case '&': return x & y;
            case '|': return x | y;
            case '^': return x ^ y;
          }
        }
      }
      throw err('Expresión inválida');
    }

    // ¿La expresión es "variable", "variable+k" o "variable-k"? (estilo MASM: acceso a memoria)
    dataRef(a) {
      const has = (x) => x.k === 'sym' ? !!(this.syms.get(x.name) && this.syms.get(x.name).kind === 'data')
        : x.k === 'un' ? has(x.a) : x.k === 'bin' ? (has(x.a) || has(x.b)) : false;
      if (a.k === 'sym') { const s = this.syms.get(a.name); return s && s.kind === 'data' ? s : null; }
      if (a.k === 'bin' && a.op === '+') return (!has(a.b) && this.dataRef(a.a)) || (!has(a.a) && this.dataRef(a.b)) || null;
      if (a.k === 'bin' && a.op === '-') return (!has(a.b) && this.dataRef(a.a)) || null;
      return null;
    }

    ev(ast, pc) {
      const ctx = { addr: pc.addr, unres: false, usesSym: false, dataSym: null, hasOffset: false, undef: null };
      const v = this.evalAst(ast, ctx);
      if (ctx.unres && pc.final) {
        throw err(ctx.undef ? `Símbolo no definido: '${ctx.undef}'` : 'No se pudo resolver la expresión');
      }
      ctx.v = v;
      return ctx;
    }

    resolveOp(o, pc) {
      if (o.t === 'reg') return o;
      if (o.t === 'mem') {
        const e = this.ev(o.dispAst, pc);
        return {
          t: 'mem', size: o.size || (e.dataSym && !e.hasOffset ? e.dataSym.size : 0), seg: o.seg,
          base: o.base, index: o.index, scale: o.scale || 1, a32: o.a32 === null ? this.B32 : o.a32,
          disp: e.v, sym: e.usesSym || e.unres, far: o.far,
        };
      }
      if (o.t === 'far') {
        return { t: 'far', sel: this.ev(o.selAst, pc).v, off: this.ev(o.offAst, pc).v, size: o.size };
      }
      const e = this.ev(o.ast, pc);
      const dref = this.dataRef(o.ast);
      if (dref) {
        return { t: 'mem', size: o.size || dref.size, seg: null, base: null, index: null, scale: 1, a32: this.B32, disp: e.v, sym: true, far: o.far, direct: true };
      }
      return { t: 'imm', v: e.v, unres: e.unres, sym: e.usesSym || e.unres, size: o.size, dist: o.dist, far: o.far };
    }

    immBytes(v, size, pc) {
      if (pc.final) {
        const lim = { 8: [-128, 255], 16: [-32768, 65535], 32: [-2147483648, 4294967295] }[size];
        if (v < lim[0] || v > lim[1]) throw err(`Valor ${v} fuera de rango para ${size} bits`);
      }
      return le(v, size / 8);
    }

    memBytes(m, reg) { return m.a32 ? this.mem32(m, reg) : this.mem16(m, reg); }

    mem16(m, reg) {
      const RM = { 'bx+si': 0, 'bx+di': 1, 'bp+si': 2, 'bp+di': 3, 'si': 4, 'di': 5, 'bp': 6, 'bx': 7 };
      const d = m.disp;
      if (!m.base && !m.index) return [(reg << 3) | 6, d & 0xFF, (d >> 8) & 0xFF];
      const rm = RM[[m.base, m.index].filter(Boolean).join('+')];
      let mod;
      if (m.sym) mod = 2;
      else if ((d & 0xFFFF) === 0 && rm !== 6) mod = 0;
      else if (fitsS8(d, 16)) mod = 1;
      else mod = 2;
      const b = [(mod << 6) | (reg << 3) | rm];
      if (mod === 1) b.push(d & 0xFF);
      if (mod === 2) b.push(d & 0xFF, (d >> 8) & 0xFF);
      return b;
    }

    mem32(m, reg) {
      const base = m.base ? REG32[m.base] : -1, index = m.index ? REG32[m.index] : -1;
      const d = m.disp;
      const ss = { 1: 0, 2: 1, 4: 2, 8: 3 }[m.scale || 1];
      if (base < 0 && index < 0) return [(reg << 3) | 5, ...le(d, 4)];
      if (base < 0) return [(reg << 3) | 4, (ss << 6) | (index << 3) | 5, ...le(d, 4)];
      let mod;
      if (m.sym) mod = 2;
      else if ((d | 0) === 0 && base !== 5) mod = 0;
      else if (fitsS8(d, 32)) mod = 1;
      else mod = 2;
      const out = [];
      if (index >= 0 || base === 4) out.push((mod << 6) | (reg << 3) | 4, (ss << 6) | ((index >= 0 ? index : 4) << 3) | base);
      else out.push((mod << 6) | (reg << 3) | base);
      if (mod === 1) out.push(d & 0xFF);
      if (mod === 2) out.push(...le(d, 4));
      return out;
    }

    rmBytes(o, reg) { return isR(o) ? [0xC0 | (reg << 3) | o.n] : this.memBytes(o, reg); }
    // prefijos de un operando de memoria: tamaño de dirección (67h) y segmento
    segp(o) {
      if (!isM(o)) return [];
      const p = [];
      if (o.a32 !== this.B32) p.push(0x67);
      if (o.seg !== null && o.seg !== undefined) p.push(SEG_PREFIX[o.seg]);
      return p;
    }

    sizeOf(a, b, what) {
      const sa = a ? (a.t === 'reg' ? a.size : a.size || 0) : 0;
      const sb = b ? (b.t === 'reg' ? b.size : b.size || 0) : 0;
      if (sa && sb && sa !== sb) throw err(`Los operandos tienen tamaños distintos (${sa} y ${sb} bits)`);
      const s = sa || sb;
      if (!s) throw err(`No se sabe el tamaño del operando${what ? ' de ' + what : ''}: use BYTE PTR, WORD PTR o DWORD PTR`);
      return s;
    }

    encodeJump(st, mn, A, addr, pc) {
      const W = this.B32 ? 4 : 2;
      if (mn in LOOPS) {
        if (!isI(A)) throw err(`${mn.toUpperCase()} requiere una etiqueta`);
        const [opc, as] = LOOPS[mn];
        const pre = as && ((as === 32) !== this.B32) ? [0x67] : [];
        const rel = A.v - (addr + pre.length + 2);
        if (pc.final && !A.unres && (rel < -128 || rel > 127)) throw err(`Salto fuera de rango (${rel} bytes). ${mn.toUpperCase()} solo admite saltos cortos (-128..127)`);
        return [...pre, opc, rel & 0xFF];
      }
      const isJcc = mn in JCC;
      if (A.dist === 'near' || mn === 'call') st.long = true;
      if (!st.long && !A.unres) {
        const rel = A.v - (addr + 2);
        if (rel < -128 || rel > 127) {
          if (A.dist === 'short') { if (pc.final) throw err(`Salto corto fuera de rango (${rel} bytes)`); }
          else { st.long = true; pc.grew = true; }
        }
      }
      if (mn === 'call') return [0xE8, ...le(A.v - (addr + 1 + W), W)];
      if (isJcc) {
        if (st.long) return [0x0F, 0x80 + JCC[mn], ...le(A.v - (addr + 2 + W), W)];
        return [0x70 + JCC[mn], (A.v - (addr + 2)) & 0xFF];
      }
      if (st.long) return [0xE9, ...le(A.v - (addr + 1 + W), W)];
      return [0xEB, (A.v - (addr + 2)) & 0xFF];
    }

    encodeInstr(st, pc) {
      const mn = st.mnem;
      this.B32 = st.bits === 32;
      const pre = st.prefix ? [PREFIXES[st.prefix]] : [];
      if (!mn) return pre;
      const ops = st.ops.map(o => this.resolveOp(o, pc));
      const n = ops.length;
      const [A, B, C] = ops;
      const need = (k) => { if (n !== k) throw err(`${mn.toUpperCase()} requiere ${k} operando${k === 1 ? '' : 's'}`); };
      const bad = () => err(`${mn.toUpperCase()}: combinación de operandos no válida`);
      const I = (o, size) => this.immBytes(o.v, size, pc);
      const out = (...parts) => pre.concat(...parts);
      const osz = (s) => this.osz(s);
      const dsz = this.B32 ? 32 : 16;

      if (mn in SIMPLE) {
        need(0);
        const [bytes, sz] = SIMPLE[mn];
        return out(sz === null || sz === 'd' ? [] : osz(sz), bytes);
      }

      if (mn in ALU) {
        need(2);
        const c = ALU[mn];
        if (isRM(A) && isR(B)) { const s = this.sizeOf(A, B); return out(osz(s), this.segp(A), [c * 8 + (s === 8 ? 0 : 1)], this.rmBytes(A, B.n)); }
        if (isR(A) && isM(B)) { const s = this.sizeOf(A, B); return out(osz(s), this.segp(B), [c * 8 + (s === 8 ? 2 : 3)], this.rmBytes(B, A.n)); }
        if (isRM(A) && isI(B)) {
          const s = this.sizeOf(A, null, mn.toUpperCase());
          if (s === 8) {
            if (isR(A) && A.n === 0) return out([c * 8 + 4], I(B, 8));
            return out(this.segp(A), [0x80], this.rmBytes(A, c), I(B, 8));
          }
          if (!B.sym && fitsS8(B.v, s)) return out(osz(s), this.segp(A), [0x83], this.rmBytes(A, c), [B.v & 0xFF]);
          if (isR(A) && A.n === 0) return out(osz(s), [c * 8 + 5], I(B, s));
          return out(osz(s), this.segp(A), [0x81], this.rmBytes(A, c), I(B, s));
        }
        if (isM(A) && isM(B)) throw err(`${mn.toUpperCase()}: no se permiten dos operandos de memoria`);
        throw bad();
      }

      if (mn === 'mov') {
        need(2);
        if (isS(A)) {
          if (A.n === 1) throw err('No se puede cargar CS con MOV: use un salto lejano (JMP selector:offset)');
          if (isI(B)) throw err('No se puede mover un inmediato a un registro de segmento: use un registro general (MOV AX, valor / MOV DS, AX)');
          if (!(isR(B) && B.size !== 8) && !(isM(B) && (B.size === 16 || !B.size))) throw bad();
          return out(this.segp(B), [0x8E], this.rmBytes(B, A.n));
        }
        if (isS(B)) {
          if (!(isR(A) && A.size !== 8) && !(isM(A) && (A.size === 16 || !A.size))) throw bad();
          return out(isR(A) ? osz(A.size) : [], this.segp(A), [0x8C], this.rmBytes(A, B.n));
        }
        if (isC(A)) { if (!(isR(B) && B.size === 32)) throw err('MOV CRn requiere un registro de 32 bits (EAX, EBX, ...)'); return out([0x0F, 0x22, 0xC0 | (A.n << 3) | B.n]); }
        if (isC(B)) { if (!(isR(A) && A.size === 32)) throw err('MOV desde CRn requiere un registro de 32 bits (EAX, EBX, ...)'); return out([0x0F, 0x20, 0xC0 | (B.n << 3) | A.n]); }
        if (isRM(A) && isR(B)) { const s = this.sizeOf(A, B); return out(osz(s), this.segp(A), [s === 8 ? 0x88 : 0x89], this.rmBytes(A, B.n)); }
        if (isR(A) && isM(B)) { const s = this.sizeOf(A, B); return out(osz(s), this.segp(B), [s === 8 ? 0x8A : 0x8B], this.rmBytes(B, A.n)); }
        if (isR(A) && isI(B)) {
          if (A.size === 8) return out([0xB0 + A.n], I(B, 8));
          return out(osz(A.size), [0xB8 + A.n], I(B, A.size));
        }
        if (isM(A) && isI(B)) {
          const s = this.sizeOf(A, B, 'MOV');
          return out(osz(s), this.segp(A), [s === 8 ? 0xC6 : 0xC7], this.rmBytes(A, 0), I(B, s));
        }
        if (isM(A) && isM(B)) throw err('MOV: no se puede mover de memoria a memoria; use un registro intermedio');
        throw bad();
      }

      if (mn === 'movzx' || mn === 'movsx') {
        need(2);
        if (!isR(A) || A.size === 8 || !isRM(B)) throw err(`${mn.toUpperCase()} requiere un registro de 16/32 bits como destino y un operando de 8 o 16 bits`);
        const s = B.size || 0;
        if (s !== 8 && s !== 16) throw err(`${mn.toUpperCase()}: indique el tamaño del origen con BYTE PTR o WORD PTR`);
        if (s >= A.size) throw err(`${mn.toUpperCase()}: el origen debe ser más chico que el destino`);
        return out(osz(A.size), this.segp(B), [0x0F, (mn === 'movzx' ? 0xB6 : 0xBE) + (s === 16 ? 1 : 0)], this.rmBytes(B, A.n));
      }

      if (mn in SETCC) {
        need(1);
        if (!isRM(A) || (A.size && A.size !== 8)) throw err(`${mn.toUpperCase()} requiere un operando de 8 bits (por ejemplo AL o BYTE PTR [x])`);
        return out(this.segp(A), [0x0F, 0x90 + SETCC[mn]], this.rmBytes(A, 0));
      }

      if (mn in BT) {
        need(2);
        if (!isRM(A)) throw bad();
        if (isR(B)) { const s = this.sizeOf(A, B); if (s === 8) throw bad(); return out(osz(s), this.segp(A), [0x0F, BT_R[mn]], this.rmBytes(A, B.n)); }
        if (isI(B)) { const s = this.sizeOf(A, null, mn.toUpperCase()); if (s === 8) throw bad(); return out(osz(s), this.segp(A), [0x0F, 0xBA], this.rmBytes(A, BT[mn]), I(B, 8)); }
        throw bad();
      }

      if (mn === 'bsf' || mn === 'bsr') {
        need(2);
        if (!isR(A) || A.size === 8 || !isRM(B)) throw bad();
        const s = this.sizeOf(A, B);
        return out(osz(s), this.segp(B), [0x0F, mn === 'bsf' ? 0xBC : 0xBD], this.rmBytes(B, A.n));
      }

      if (mn === 'shld' || mn === 'shrd') {
        need(3);
        if (!isRM(A) || !isR(B) || B.size === 8) throw bad();
        const s = this.sizeOf(A, B);
        const base = mn === 'shld' ? 0xA4 : 0xAC;
        if (isR(C) && C.size === 8 && C.n === 1) return out(osz(s), this.segp(A), [0x0F, base + 1], this.rmBytes(A, B.n));
        if (isI(C)) return out(osz(s), this.segp(A), [0x0F, base], this.rmBytes(A, B.n), I(C, 8));
        throw err(`${mn.toUpperCase()}: la cantidad debe ser un número o CL`);
      }

      if (mn === 'test') {
        need(2);
        let a = A, b = B;
        if (isM(b) && isR(a)) { a = B; b = A; }
        if (isRM(a) && isR(b)) { const s = this.sizeOf(a, b); return out(osz(s), this.segp(a), [s === 8 ? 0x84 : 0x85], this.rmBytes(a, b.n)); }
        if (isRM(A) && isI(B)) {
          const s = this.sizeOf(A, null, 'TEST');
          if (isR(A) && A.n === 0) return out(osz(s), [s === 8 ? 0xA8 : 0xA9], I(B, s));
          return out(osz(s), this.segp(A), [s === 8 ? 0xF6 : 0xF7], this.rmBytes(A, 0), I(B, s));
        }
        throw bad();
      }

      if (mn === 'xchg') {
        need(2);
        if (isR(A) && isR(B) && A.size === B.size && A.size !== 8 && (A.n === 0 || B.n === 0)) {
          return out(osz(A.size), [0x90 + (A.n === 0 ? B.n : A.n)]);
        }
        let a = A, b = B;
        if (isR(a) && isM(b)) { a = B; b = A; }
        if (isRM(a) && isR(b)) { const s = this.sizeOf(a, b); return out(osz(s), this.segp(a), [s === 8 ? 0x86 : 0x87], this.rmBytes(a, b.n)); }
        throw bad();
      }

      if (mn === 'inc' || mn === 'dec') {
        need(1);
        const r = mn === 'inc' ? 0 : 1;
        if (isR(A) && A.size !== 8) return out(osz(A.size), [(mn === 'inc' ? 0x40 : 0x48) + A.n]);
        if (isRM(A)) { const s = this.sizeOf(A, null, mn.toUpperCase()); return out(osz(s), this.segp(A), [s === 8 ? 0xFE : 0xFF], this.rmBytes(A, r)); }
        throw bad();
      }

      if (mn in GRP3) {
        need(1);
        if (!isRM(A)) throw bad();
        const s = this.sizeOf(A, null, mn.toUpperCase());
        return out(osz(s), this.segp(A), [s === 8 ? 0xF6 : 0xF7], this.rmBytes(A, GRP3[mn]));
      }

      if (mn === 'imul') {
        if (n === 1) {
          if (!isRM(A)) throw bad();
          const s = this.sizeOf(A, null, 'IMUL');
          return out(osz(s), this.segp(A), [s === 8 ? 0xF6 : 0xF7], this.rmBytes(A, 5));
        }
        if (n === 2 && isR(A) && isI(B)) {
          if (A.size === 8) throw bad();
          if (!B.sym && fitsS8(B.v, A.size)) return out(osz(A.size), [0x6B], this.rmBytes(A, A.n), [B.v & 0xFF]);
          return out(osz(A.size), [0x69], this.rmBytes(A, A.n), I(B, A.size));
        }
        if (n === 2 && isR(A) && isRM(B)) { const s = this.sizeOf(A, B); if (s === 8) throw bad(); return out(osz(s), this.segp(B), [0x0F, 0xAF], this.rmBytes(B, A.n)); }
        if (n === 3 && isR(A) && isRM(B) && isI(C)) {
          const s = this.sizeOf(A, B); if (s === 8) throw bad();
          if (!C.sym && fitsS8(C.v, s)) return out(osz(s), this.segp(B), [0x6B], this.rmBytes(B, A.n), [C.v & 0xFF]);
          return out(osz(s), this.segp(B), [0x69], this.rmBytes(B, A.n), I(C, s));
        }
        throw bad();
      }

      if (mn in SHIFT) {
        need(2);
        if (!isRM(A)) throw bad();
        const s = this.sizeOf(A, null, mn.toUpperCase());
        const r = SHIFT[mn];
        const base = this.segp(A);
        if (isR(B) && B.size === 8 && B.n === 1) return out(osz(s), base, [s === 8 ? 0xD2 : 0xD3], this.rmBytes(A, r));
        if (isI(B)) {
          if (!B.sym && B.v === 1) return out(osz(s), base, [s === 8 ? 0xD0 : 0xD1], this.rmBytes(A, r));
          return out(osz(s), base, [s === 8 ? 0xC0 : 0xC1], this.rmBytes(A, r), I(B, 8));
        }
        throw err(`${mn.toUpperCase()}: la cantidad de desplazamiento debe ser un número o CL`);
      }

      if (mn === 'push') {
        need(1);
        if (isR(A)) { if (A.size === 8) throw err('PUSH no admite registros de 8 bits'); return out(osz(A.size), [0x50 + A.n]); }
        if (isS(A)) return out(A.n < 4 ? [[0x06, 0x0E, 0x16, 0x1E][A.n]] : [0x0F, A.n === 4 ? 0xA0 : 0xA8]);
        if (isM(A)) { const s = A.size || dsz; if (s === 8) throw bad(); return out(osz(s), this.segp(A), [0xFF], this.rmBytes(A, 6)); }
        if (isI(A)) {
          const s = A.size === 16 || A.size === 32 ? A.size : dsz;
          if (!A.sym && fitsS8(A.v, s)) return out(osz(s), [0x6A, A.v & 0xFF]);
          return out(osz(s), [0x68], I(A, s));
        }
        throw bad();
      }
      if (mn === 'pop') {
        need(1);
        if (isR(A)) { if (A.size === 8) throw err('POP no admite registros de 8 bits'); return out(osz(A.size), [0x58 + A.n]); }
        if (isS(A)) {
          if (A.n === 1) throw err('POP CS no existe: CS solo cambia con saltos, llamadas y retornos');
          return out(A.n < 4 ? [[0x07, 0, 0x17, 0x1F][A.n]] : [0x0F, A.n === 4 ? 0xA1 : 0xA9]);
        }
        if (isM(A)) { const s = A.size || dsz; if (s === 8) throw bad(); return out(osz(s), this.segp(A), [0x8F], this.rmBytes(A, 0)); }
        throw bad();
      }

      if (['lea', 'lds', 'les', 'lss', 'lfs', 'lgs'].includes(mn)) {
        need(2);
        let b = B;
        if (isI(b) && mn === 'lea') b = { t: 'mem', seg: null, base: null, index: null, scale: 1, a32: this.B32, disp: B.v, sym: true };
        if (!isR(A) || A.size === 8 || !isM(b)) throw err(`${mn.toUpperCase()} requiere un registro de 16/32 bits y un operando de memoria`);
        const opc = { lea: [0x8D], lds: [0xC5], les: [0xC4], lss: [0x0F, 0xB2], lfs: [0x0F, 0xB4], lgs: [0x0F, 0xB5] }[mn];
        return out(osz(A.size), this.segp(b), opc, this.rmBytes(b, A.n));
      }

      if (mn === 'jmp' || mn === 'call' || mn in JCC || mn in LOOPS) {
        need(1);
        const isJmp = mn === 'jmp', isCall = mn === 'call';
        if (A.t === 'far') {
          if (!(isJmp || isCall)) throw bad();
          const s = A.size === 32 ? 32 : A.size === 16 ? 16 : dsz;
          return out(osz(s), [isJmp ? 0xEA : 0x9A], I({ v: A.off }, s), I({ v: A.sel }, 16));
        }
        if (isRM(A)) {
          if (!(isJmp || isCall)) throw err('Los saltos condicionales requieren una etiqueta');
          const far = isM(A) && (A.far || (!this.B32 && A.size === 32));
          if (far) return out(this.segp(A), [0xFF], this.rmBytes(A, isJmp ? 5 : 3));
          const s = isR(A) ? A.size : (A.size || dsz);
          if (s === 8) throw bad();
          return out(osz(s), this.segp(A), [0xFF], this.rmBytes(A, isJmp ? 4 : 2));
        }
        if (!isI(A)) throw bad();
        return out(this.encodeJump(st, mn, A, pc.addr + pre.length, pc));
      }

      if (mn === 'ret' || mn === 'retn' || mn === 'retf') {
        const far = mn === 'retf';
        if (n === 0) return out([far ? 0xCB : 0xC3]);
        need(1);
        if (!isI(A)) throw bad();
        return out([far ? 0xCA : 0xC2], I(A, 16));
      }

      if (mn === 'int') {
        need(1);
        if (!isI(A)) throw err('INT requiere un número de interrupción (0..255)');
        if (pc.final && (A.v < 0 || A.v > 255)) throw err('El número de interrupción debe estar entre 0 y 255');
        return out([0xCD, A.v & 0xFF]);
      }

      if (mn === 'in') {
        need(2);
        if (!isR(A) || A.n !== 0) throw err('IN: el destino debe ser AL, AX o EAX');
        if (isI(B)) return out(osz(A.size), [A.size === 8 ? 0xE4 : 0xE5], I(B, 8));
        if (isR(B) && B.size === 16 && B.n === 2) return out(osz(A.size), [A.size === 8 ? 0xEC : 0xED]);
        throw err('IN: el puerto debe ser un número (0..255) o DX');
      }
      if (mn === 'out') {
        need(2);
        if (!isR(B) || B.n !== 0) throw err('OUT: el origen debe ser AL, AX o EAX');
        if (isI(A)) return out(osz(B.size), [B.size === 8 ? 0xE6 : 0xE7], I(A, 8));
        if (isR(A) && A.size === 16 && A.n === 2) return out(osz(B.size), [B.size === 8 ? 0xEE : 0xEF]);
        throw err('OUT: el puerto debe ser un número (0..255) o DX');
      }

      if (mn === 'enter') { need(2); if (!isI(A) || !isI(B)) throw bad(); return out([0xC8], I(A, 16), I(B, 8)); }
      if (mn === 'aam' || mn === 'aad') {
        const v = n ? A.v : 10;
        return out([mn === 'aam' ? 0xD4 : 0xD5], [v & 0xFF]);
      }

      if (mn in SYS_M) {
        need(1);
        if (!isM(A)) throw err(`${mn.toUpperCase()} requiere un operando de memoria${mn === 'invlpg' ? '' : ' (6 bytes: límite + base)'}`);
        return out(this.segp(A), [0x0F, 0x01], this.memBytes(A, SYS_M[mn]));
      }
      if (mn in SYS_W01 || mn in SYS_W00) {
        need(1);
        if (!isRM(A) || (isR(A) && A.size === 8) || (isM(A) && A.size && A.size !== 16)) throw err(`${mn.toUpperCase()} requiere un operando de 16 bits`);
        const two = mn in SYS_W01 ? 0x01 : 0x00;
        const r = mn in SYS_W01 ? SYS_W01[mn] : SYS_W00[mn];
        return out(isR(A) && ['smsw', 'sldt', 'str'].includes(mn) ? osz(A.size) : [], this.segp(A), [0x0F, two], this.rmBytes(A, r));
      }
      if (mn === 'lar' || mn === 'lsl') {
        need(2);
        if (!isR(A) || A.size === 8 || !isRM(B)) throw bad();
        return out(osz(A.size), this.segp(B), [0x0F, mn === 'lar' ? 0x02 : 0x03], this.rmBytes(B, A.n));
      }
      if (mn === 'arpl') {
        need(2);
        if (!isRM(A) || !isR(B) || B.size !== 16) throw bad();
        return out(this.segp(A), [0x63], this.rmBytes(A, B.n));
      }
      if (mn === 'bios') { need(1); return out([0x0F, 0xFF], I(A, 8)); }
      throw err(`Instrucción no soportada: ${mn}`);
    }

    encodeData(st, pc) {
      const out = [];
      const size = st.size;
      const emit = (items, depth) => {
        for (const it of items) {
          if (it.k === 'str') {
            const b = Array.from(it.v).map(EMU.toCP437);
            if (size === 1) out.push(...b);
            else {
              while (b.length % size) b.push(0);
              out.push(...b);
            }
          } else if (it.k === 'undef') {
            for (let i = 0; i < size; i++) out.push(0);
          } else if (it.k === 'expr') {
            out.push(...this.immBytes(this.ev(it.ast, pc).v, size * 8, pc));
          } else if (it.k === 'dup') {
            const e = this.ev(it.count, pc);
            if (e.unres) throw err('La cantidad de DUP debe conocerse antes de usarse');
            if (e.v < 0 || e.v > 65536) throw err('Cantidad de DUP fuera de rango');
            for (let i = 0; i < e.v; i++) emit(it.items, depth + 1);
          }
          if (out.length > 70000) throw err('Demasiados datos');
        }
      };
      emit(st.items, 0);
      return out;
    }

    encodeStmt(st, pc) {
      if (st.kind === 'instr') return this.encodeInstr(st, pc);
      if (st.kind === 'data') return this.encodeData(st, pc);
      if (st.kind === 'align') {
        const a = this.ev(st.ast, pc).v;
        if (a <= 0) throw err('ALIGN requiere un valor positivo');
        const pad = (a - (pc.addr % a)) % a;
        return new Array(pad).fill(0x90);
      }
      if (st.kind === 'times') {
        const e = this.ev(st.count, pc);
        if (e.unres) throw err('La cantidad de TIMES debe conocerse de antemano');
        if (e.v < 0 || e.v > 65536) throw err('Cantidad de TIMES fuera de rango');
        const outb = [];
        const saved = pc.addr;
        for (let i = 0; i < e.v; i++) {
          st.inner.long = st.long;
          const b = this.encodeStmt(st.inner, pc);
          outb.push(...b);
          pc.addr += b.length;
        }
        pc.addr = saved;
        return outb;
      }
      return [];
    }

    /**
     * sources: [{name, text}] se ensamblan como un único programa (en orden).
     * opts.bits: modo inicial (16 por defecto).
     * Devuelve { ok, errors, stmts, image(Map addr->byte), entry, minAddr, maxAddr, symbols }
     */
    assemble(sources, opts) {
      opts = opts || {};
      const errors = [];
      const stmts = [];
      this.syms = new Map();
      const state = { bits: opts.bits || 16 };
      for (const src of sources) {
        const lines = src.text.split(/\r?\n/);
        lines.forEach((raw, i) => {
          try {
            const st = parseLine(raw, src.name, i + 1, opts, state);
            if (st.label || st.kind !== 'none') stmts.push(st);
          } catch (e) {
            if (!(e instanceof AsmError)) throw e;
            errors.push({ src: src.name, line: i + 1, msg: e.message });
          }
        });
      }
      // símbolos
      for (const st of stmts) {
        const def = (name, kind, size) => {
          const k = name.toLowerCase();
          if (this.syms.has(k)) { errors.push({ src: st.src, line: st.line, msg: `Símbolo definido dos veces: '${name}'` }); return; }
          if (MNEMONICS.has(k) || isReg(k)) {
            errors.push({ src: st.src, line: st.line, msg: `'${name}' es una palabra reservada y no puede usarse como nombre` }); return;
          }
          this.syms.set(k, { name, kind, size, value: 0, defined: false, unres: false, st });
        };
        if (st.label) {
          const inner = st.kind === 'times' ? st.inner : st;
          if (inner.kind === 'data') def(st.label, 'data', inner.size * 8);
          else def(st.label, 'label', 0);
        }
        if (st.kind === 'equ') def(st.name, 'const', 0);
      }
      if (errors.length) return { ok: false, errors, stmts };

      let entryAst = null, entrySt = null;
      const runPass = (final) => {
        const pc = { addr: 0, final, grew: false };
        let changed = false;
        for (const st of stmts) {
          try {
            if (st.kind === 'org') {
              const e = this.ev(st.ast, pc);
              if (final && e.v < pc.addr) throw err('ORG no puede retroceder la dirección actual');
              pc.addr = e.v;
            }
            if (st.kind === 'equ') {
              const e = this.ev(st.ast, pc);
              const s = this.syms.get(st.name.toLowerCase());
              if (s.value !== e.v || !s.defined || s.unres !== e.unres) changed = true;
              s.value = e.v; s.defined = true; s.unres = e.unres; s.usesSym = e.usesSym;
            }
            if (st.label) {
              const s = this.syms.get(st.label.toLowerCase());
              if (s.value !== pc.addr || !s.defined) changed = true;
              s.value = pc.addr; s.defined = true;
            }
            if (st.kind === 'end' && st.ast) { entryAst = st.ast; entrySt = st; }
            st.addr = pc.addr;
            const b = this.encodeStmt(st, pc);
            st.bytes = b;
            pc.addr += b.length;
            if (final && pc.addr > 0x10000) throw err('El programa excede los 64 KB del área de carga');
          } catch (e) {
            if (!(e instanceof AsmError)) throw e;
            if (final) errors.push({ src: st.src, line: st.line, msg: e.message });
            pc.addr += st.bytes.length;
          }
        }
        return changed || pc.grew;
      };
      let pass = 0;
      while (runPass(false)) {
        if (++pass > 40) { errors.push({ src: sources[0].name, line: 1, msg: 'El ensamblado no converge (etiquetas inestables)' }); break; }
      }
      runPass(true);

      const image = new Map();
      let minAddr = Infinity, maxAddr = -1;
      for (const st of stmts) {
        st.bytes.forEach((b, i) => {
          const a = st.addr + i;
          if (a > 0xFFFF) return;
          image.set(a, b);
          if (a < minAddr) minAddr = a;
          if (a > maxAddr) maxAddr = a;
        });
      }
      let entry = null;
      if (entryAst) {
        try { entry = this.ev(entryAst, { addr: 0, final: true }).v; }
        catch (e) { errors.push({ src: entrySt.src, line: entrySt.line, msg: e.message }); }
      }
      if (entry === null) {
        const first = stmts.find(s => s.kind === 'instr' && s.bytes.length);
        entry = first ? first.addr : (minAddr === Infinity ? 0 : minAddr);
      }
      const symbols = [];
      for (const s of this.syms.values()) symbols.push({ name: s.name, kind: s.kind, value: s.value, size: s.size });
      return { ok: errors.length === 0, errors, stmts, image, entry, minAddr, maxAddr, symbols };
    }
  }

  EMU.Assembler = Assembler;
  EMU.assemble = function (sources, opts) { return new Assembler().assemble(sources, opts); };
})(window.EMU);
