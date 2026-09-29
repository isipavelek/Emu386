/* =====================================================================
 *  EMU386 - Decodificador / desensamblador x86 (16 y 32 bits)
 *  Lee bytes de memoria (a través de CS:EIP) y produce una instrucción.
 *  d32 = el segmento de código es de 32 bits (bit D del descriptor).
 * ===================================================================== */
'use strict';
(function (EMU) {
  const ALU_NAMES = ['add', 'or', 'adc', 'sbb', 'and', 'sub', 'xor', 'cmp'];
  const SHIFT_NAMES = ['rol', 'ror', 'rcl', 'rcr', 'shl', 'shr', null, 'sar'];
  const RMREGS = [[3, 6], [3, 7], [5, 6], [5, 7], [6], [7], [5], [3]];
  const UD = { ud: true };
  const SEGP = { 0x26: 0, 0x2E: 1, 0x36: 2, 0x3E: 3, 0x64: 4, 0x65: 5 };

  function decode(fetch, ip, d32) {
    let p = 0;
    const nb = () => fetch(p++);
    const ins = { seg: -1, rep: 0, opsz: false, adsz: false, lock: false, op: '', ops: [], len: 0, cc: -1, size: 0 };
    let b;
    for (let k = 0; ; k++) {
      b = nb();
      if (b in SEGP) ins.seg = SEGP[b];
      else if (b === 0x66) ins.opsz = true;
      else if (b === 0x67) ins.adsz = true;
      else if (b === 0xF0) ins.lock = true;
      else if (b === 0xF2) ins.rep = 2;
      else if (b === 0xF3) ins.rep = 3;
      else break;
      if (k > 12) throw UD;
    }
    const vs = (!!d32 !== ins.opsz) ? 32 : 16;     // tamaño de operando
    const as = (!!d32 !== ins.adsz) ? 32 : 16;     // tamaño de dirección
    ins.osize = vs; ins.asize = as;
    const ipMask = vs === 32 ? 0xFFFFFFFF : 0xFFFF;
    let mrm = null;
    const modrm = () => { if (!mrm) { const x = nb(); mrm = { mod: x >> 6, reg: (x >> 3) & 7, rm: x & 7 }; } return mrm; };
    const i8 = () => nb();
    const i16 = () => { const lo = nb(); return lo | (nb() << 8); };
    const i32 = () => { const lo = i16(); return (lo + i16() * 65536) >>> 0; };
    const s8 = () => { const v = nb(); return v >= 128 ? v - 256 : v; };
    const R = (size, n) => ({ k: 'r', size, n });
    const S = (n) => { if (n > 5) throw UD; return { k: 's', size: 16, n }; };
    const seg = (def) => ins.seg >= 0 ? ins.seg : def;
    const M = (m, size) => {
      if (as === 16) {
        let disp = 0, regs, defSeg = 3;
        if (m.mod === 0 && m.rm === 6) { disp = i16(); regs = []; }
        else {
          regs = RMREGS[m.rm];
          if (m.rm === 2 || m.rm === 3 || m.rm === 6) defSeg = 2;
          if (m.mod === 1) disp = s8() & 0xFFFF;
          else if (m.mod === 2) disp = i16();
        }
        return { k: 'm', size, a32: false, regs, disp, seg: seg(defSeg), ovr: ins.seg >= 0 };
      }
      let base = -1, index = -1, scale = 1, disp = 0;
      if (m.rm === 4) {
        const sib = nb();
        scale = 1 << (sib >> 6);
        const ix = (sib >> 3) & 7, bs = sib & 7;
        if (ix !== 4) index = ix;
        if (bs === 5 && m.mod === 0) disp = i32(); else base = bs;
      } else if (m.rm === 5 && m.mod === 0) disp = i32();
      else base = m.rm;
      if (m.mod === 1) disp = s8() >>> 0;
      else if (m.mod === 2) disp = i32();
      const defSeg = (base === 4 || base === 5) ? 2 : 3;
      return { k: 'm', size, a32: true, base, index, scale, disp, regs: [], seg: seg(defSeg), ovr: ins.seg >= 0 };
    };
    const E = (size) => { const m = modrm(); return m.mod === 3 ? R(size, m.rm) : M(m, size); };
    const Mo = (size) => { const m = modrm(); if (m.mod === 3) throw UD; return M(m, size); };
    const G = (size) => R(size, modrm().reg);
    const I = (size) => ({ k: 'i', size, v: size === 8 ? i8() : size === 16 ? i16() : i32() });
    const IS8 = (size) => { const v = s8(); return { k: 'i', size, v: size === 32 ? v >>> 0 : v & 0xFFFF }; };
    const J = (rel) => ({ k: 'j', v: ((ip + p + rel) & ipMask) >>> 0 });
    const Jv = () => { const r = vs === 32 ? (i32() | 0) : ((i16() << 16) >> 16); return J(r); };
    const MOFFS = (size) => ({ k: 'm', size, a32: as === 32, base: -1, index: -1, scale: 1, regs: [], disp: as === 32 ? i32() : i16(), seg: seg(3), ovr: ins.seg >= 0 });
    const FAR = () => { const off = vs === 32 ? i32() : i16(); const sel = i16(); return { k: 'p', sel, off, osize: vs }; };
    const set = (op, ...ops) => { ins.op = op; ins.ops = ops; };

    if (b < 0x40 && (b & 7) < 6) {
      const alu = ALU_NAMES[b >> 3];
      switch (b & 7) {
        case 0: set(alu, E(8), G(8)); break;
        case 1: set(alu, E(vs), G(vs)); break;
        case 2: set(alu, G(8), E(8)); break;
        case 3: set(alu, G(vs), E(vs)); break;
        case 4: set(alu, R(8, 0), I(8)); break;
        case 5: set(alu, R(vs, 0), I(vs)); break;
      }
    } else if (b >= 0x40 && b <= 0x47) set('inc', R(vs, b & 7));
    else if (b >= 0x48 && b <= 0x4F) set('dec', R(vs, b & 7));
    else if (b >= 0x50 && b <= 0x57) set('push', R(vs, b & 7));
    else if (b >= 0x58 && b <= 0x5F) set('pop', R(vs, b & 7));
    else if (b >= 0x70 && b <= 0x7F) { ins.cc = b & 15; const r = s8(); set('jcc', J(r)); }
    else if (b >= 0x91 && b <= 0x97) set('xchg', R(vs, 0), R(vs, b & 7));
    else if (b >= 0xB0 && b <= 0xB7) set('mov', R(8, b & 7), I(8));
    else if (b >= 0xB8 && b <= 0xBF) set('mov', R(vs, b & 7), I(vs));
    else switch (b) {
      case 0x06: set('push', S(0)); break;
      case 0x07: set('pop', S(0)); break;
      case 0x0E: set('push', S(1)); break;
      case 0x16: set('push', S(2)); break;
      case 0x17: set('pop', S(2)); break;
      case 0x1E: set('push', S(3)); break;
      case 0x1F: set('pop', S(3)); break;
      case 0x27: set('daa'); break;
      case 0x2F: set('das'); break;
      case 0x37: set('aaa'); break;
      case 0x3F: set('aas'); break;
      case 0x0F: decode0F(); break;
      case 0x60: set('pusha'); break;
      case 0x61: set('popa'); break;
      case 0x63: set('arpl', E(16), G(16)); break;
      case 0x68: set('push', I(vs)); break;
      case 0x69: set('imul', G(vs), E(vs), I(vs)); break;
      case 0x6A: set('push', IS8(vs)); break;
      case 0x6B: set('imul', G(vs), E(vs), IS8(vs)); break;
      case 0x80: case 0x82: { const m = modrm(); set(ALU_NAMES[m.reg], E(8), I(8)); break; }
      case 0x81: { const m = modrm(); set(ALU_NAMES[m.reg], E(vs), I(vs)); break; }
      case 0x83: { const m = modrm(); set(ALU_NAMES[m.reg], E(vs), IS8(vs)); break; }
      case 0x84: set('test', E(8), G(8)); break;
      case 0x85: set('test', E(vs), G(vs)); break;
      case 0x86: set('xchg', E(8), G(8)); break;
      case 0x87: set('xchg', E(vs), G(vs)); break;
      case 0x88: set('mov', E(8), G(8)); break;
      case 0x89: set('mov', E(vs), G(vs)); break;
      case 0x8A: set('mov', G(8), E(8)); break;
      case 0x8B: set('mov', G(vs), E(vs)); break;
      case 0x8C: { const m = modrm(); set('mov', m.mod === 3 ? R(vs, m.rm) : M(m, 16), S(m.reg)); break; }
      case 0x8D: set('lea', G(vs), Mo(0)); break;
      case 0x8E: { const m = modrm(); if (m.reg === 1) throw UD; set('mov', S(m.reg), E(16)); break; }
      case 0x8F: { const m = modrm(); if (m.reg !== 0) throw UD; set('pop', E(vs)); break; }
      case 0x90: set('nop'); break;
      case 0x98: set(vs === 32 ? 'cwde' : 'cbw'); break;
      case 0x99: set(vs === 32 ? 'cdq' : 'cwd'); break;
      case 0x9A: set('callf', FAR()); break;
      case 0x9B: set('wait'); break;
      case 0x9C: set('pushf'); break;
      case 0x9D: set('popf'); break;
      case 0x9E: set('sahf'); break;
      case 0x9F: set('lahf'); break;
      case 0xA0: set('mov', R(8, 0), MOFFS(8)); break;
      case 0xA1: set('mov', R(vs, 0), MOFFS(vs)); break;
      case 0xA2: set('mov', MOFFS(8), R(8, 0)); break;
      case 0xA3: set('mov', MOFFS(vs), R(vs, 0)); break;
      case 0xA4: ins.size = 8; set('movs'); break;
      case 0xA5: ins.size = vs; set('movs'); break;
      case 0xA6: ins.size = 8; set('cmps'); break;
      case 0xA7: ins.size = vs; set('cmps'); break;
      case 0xA8: set('test', R(8, 0), I(8)); break;
      case 0xA9: set('test', R(vs, 0), I(vs)); break;
      case 0xAA: ins.size = 8; set('stos'); break;
      case 0xAB: ins.size = vs; set('stos'); break;
      case 0xAC: ins.size = 8; set('lods'); break;
      case 0xAD: ins.size = vs; set('lods'); break;
      case 0xAE: ins.size = 8; set('scas'); break;
      case 0xAF: ins.size = vs; set('scas'); break;
      case 0xC0: { const m = modrm(); if (!SHIFT_NAMES[m.reg]) throw UD; set(SHIFT_NAMES[m.reg], E(8), I(8)); break; }
      case 0xC1: { const m = modrm(); if (!SHIFT_NAMES[m.reg]) throw UD; set(SHIFT_NAMES[m.reg], E(vs), I(8)); break; }
      case 0xC2: set('ret', I(16)); break;
      case 0xC3: set('ret'); break;
      case 0xC4: set('les', G(vs), Mo(vs + 16)); break;
      case 0xC5: set('lds', G(vs), Mo(vs + 16)); break;
      case 0xC6: { const m = modrm(); if (m.reg !== 0) throw UD; set('mov', E(8), I(8)); break; }
      case 0xC7: { const m = modrm(); if (m.reg !== 0) throw UD; set('mov', E(vs), I(vs)); break; }
      case 0xC8: set('enter', I(16), I(8)); break;
      case 0xC9: set('leave'); break;
      case 0xCA: set('retf', I(16)); break;
      case 0xCB: set('retf'); break;
      case 0xCC: set('int3'); break;
      case 0xCD: set('int', I(8)); break;
      case 0xCE: set('into'); break;
      case 0xCF: set('iret'); break;
      case 0xD0: { const m = modrm(); if (!SHIFT_NAMES[m.reg]) throw UD; set(SHIFT_NAMES[m.reg], E(8), { k: 'i', size: 8, v: 1 }); break; }
      case 0xD1: { const m = modrm(); if (!SHIFT_NAMES[m.reg]) throw UD; set(SHIFT_NAMES[m.reg], E(vs), { k: 'i', size: 8, v: 1 }); break; }
      case 0xD2: { const m = modrm(); if (!SHIFT_NAMES[m.reg]) throw UD; set(SHIFT_NAMES[m.reg], E(8), R(8, 1)); break; }
      case 0xD3: { const m = modrm(); if (!SHIFT_NAMES[m.reg]) throw UD; set(SHIFT_NAMES[m.reg], E(vs), R(8, 1)); break; }
      case 0xD4: set('aam', I(8)); break;
      case 0xD5: set('aad', I(8)); break;
      case 0xD7: set('xlat'); break;
      case 0xE0: { const r = s8(); set('loopne', J(r)); break; }
      case 0xE1: { const r = s8(); set('loope', J(r)); break; }
      case 0xE2: { const r = s8(); set('loop', J(r)); break; }
      case 0xE3: { const r = s8(); set('jcxz', J(r)); break; }
      case 0xE4: set('in', R(8, 0), I(8)); break;
      case 0xE5: set('in', R(vs, 0), I(8)); break;
      case 0xE6: set('out', I(8), R(8, 0)); break;
      case 0xE7: set('out', I(8), R(vs, 0)); break;
      case 0xE8: set('call', Jv()); break;
      case 0xE9: set('jmp', Jv()); break;
      case 0xEA: set('jmpf', FAR()); break;
      case 0xEB: { const r = s8(); set('jmp', J(r)); break; }
      case 0xEC: set('in', R(8, 0), R(16, 2)); break;
      case 0xED: set('in', R(vs, 0), R(16, 2)); break;
      case 0xEE: set('out', R(16, 2), R(8, 0)); break;
      case 0xEF: set('out', R(16, 2), R(vs, 0)); break;
      case 0xF4: set('hlt'); break;
      case 0xF5: set('cmc'); break;
      case 0xF6: case 0xF7: {
        const s = b === 0xF6 ? 8 : vs;
        const m = modrm();
        if (m.reg === 0 || m.reg === 1) set('test', E(s), I(s));
        else set(['', '', 'not', 'neg', 'mul', 'imul', 'div', 'idiv'][m.reg], E(s));
        break;
      }
      case 0xF8: set('clc'); break;
      case 0xF9: set('stc'); break;
      case 0xFA: set('cli'); break;
      case 0xFB: set('sti'); break;
      case 0xFC: set('cld'); break;
      case 0xFD: set('std'); break;
      case 0xFE: { const m = modrm(); if (m.reg > 1) throw UD; set(m.reg ? 'dec' : 'inc', E(8)); break; }
      case 0xFF: {
        const m = modrm();
        switch (m.reg) {
          case 0: set('inc', E(vs)); break;
          case 1: set('dec', E(vs)); break;
          case 2: set('call', E(vs)); break;
          case 3: set('callf', Mo(vs + 16)); break;
          case 4: set('jmp', E(vs)); break;
          case 5: set('jmpf', Mo(vs + 16)); break;
          case 6: set('push', E(vs)); break;
          default: throw UD;
        }
        break;
      }
      default: throw UD;
    }

    function decode0F() {
      const c = nb();
      if (c >= 0x80 && c <= 0x8F) { ins.cc = c & 15; set('jcc', Jv()); return; }
      if (c >= 0x90 && c <= 0x9F) { ins.cc = c & 15; set('setcc', E(8)); return; }
      switch (c) {
        case 0x00: {
          const m = modrm();
          const n = ['sldt', 'str', 'lldt', 'ltr', 'verr', 'verw'][m.reg];
          if (!n) throw UD;
          set(n, E(16));
          return;
        }
        case 0x01: {
          const m = modrm();
          if (m.reg <= 3) { set(['sgdt', 'sidt', 'lgdt', 'lidt'][m.reg], Mo(48)); return; }
          if (m.reg === 4) { set('smsw', E(16)); return; }
          if (m.reg === 6) { set('lmsw', E(16)); return; }
          if (m.reg === 7) { set('invlpg', Mo(8)); return; }
          throw UD;
        }
        case 0x02: set('lar', G(vs), E(16)); return;
        case 0x03: set('lsl', G(vs), E(16)); return;
        case 0x06: set('clts'); return;
        case 0x20: case 0x22: {
          const m = modrm();
          if (m.mod !== 3 || ![0, 2, 3].includes(m.reg)) throw UD;
          if (c === 0x20) set('mov', R(32, m.rm), { k: 'c', size: 32, n: m.reg });
          else set('mov', { k: 'c', size: 32, n: m.reg }, R(32, m.rm));
          return;
        }
        case 0xA0: set('push', S(4)); return;
        case 0xA1: set('pop', S(4)); return;
        case 0xA8: set('push', S(5)); return;
        case 0xA9: set('pop', S(5)); return;
        case 0xA3: set('bt', E(vs), G(vs)); return;
        case 0xAB: set('bts', E(vs), G(vs)); return;
        case 0xB3: set('btr', E(vs), G(vs)); return;
        case 0xBB: set('btc', E(vs), G(vs)); return;
        case 0xBA: {
          const m = modrm();
          if (m.reg < 4) throw UD;
          set(['bt', 'bts', 'btr', 'btc'][m.reg - 4], E(vs), I(8));
          return;
        }
        case 0xA4: set('shld', E(vs), G(vs), I(8)); return;
        case 0xA5: set('shld', E(vs), G(vs), R(8, 1)); return;
        case 0xAC: set('shrd', E(vs), G(vs), I(8)); return;
        case 0xAD: set('shrd', E(vs), G(vs), R(8, 1)); return;
        case 0xAF: set('imul', G(vs), E(vs)); return;
        case 0xB2: set('lss', G(vs), Mo(vs + 16)); return;
        case 0xB4: set('lfs', G(vs), Mo(vs + 16)); return;
        case 0xB5: set('lgs', G(vs), Mo(vs + 16)); return;
        case 0xB6: set('movzx', G(vs), E(8)); return;
        case 0xB7: set('movzx', G(vs), E(16)); return;
        case 0xBE: set('movsx', G(vs), E(8)); return;
        case 0xBF: set('movsx', G(vs), E(16)); return;
        case 0xBC: set('bsf', G(vs), E(vs)); return;
        case 0xBD: set('bsr', G(vs), E(vs)); return;
        case 0xFF: set('bios', I(8)); return;
        default: throw UD;
      }
    }

    ins.len = p;
    return ins;
  }

  // ---------------- Formato de texto (sintaxis Intel) ----------------
  function regName(size, n) {
    return size === 8 ? EMU.REG8_NAMES[n] : size === 32 ? EMU.REG32_NAMES[n] : EMU.REG16_NAMES[n];
  }
  function hx(v, n) { const s = EMU.hex(v, n); return (/^[A-F]/.test(s) ? '0' : '') + s + 'h'; }
  const PTR = { 8: 'BYTE PTR ', 16: 'WORD PTR ', 32: 'DWORD PTR ', 48: 'FWORD PTR ' };

  function fmtOp(o, needSize) {
    switch (o.k) {
      case 'r': return regName(o.size, o.n);
      case 's': return EMU.SREG_NAMES[o.n];
      case 'c': return 'CR' + o.n;
      case 'i': return hx(o.v, o.size === 8 ? 2 : o.size === 32 ? 8 : 4);
      case 'j': return hx(o.v, o.v > 0xFFFF ? 8 : 4);
      case 'p': return hx(o.sel, 4) + ':' + hx(o.off, o.osize === 32 ? 8 : 4);
      case 'm': {
        let parts;
        if (o.a32) {
          parts = [];
          if (o.base >= 0) parts.push(EMU.REG32_NAMES[o.base]);
          if (o.index >= 0) parts.push(EMU.REG32_NAMES[o.index] + (o.scale > 1 ? '*' + o.scale : ''));
          if (o.disp || !parts.length) {
            const d = o.disp >>> 0;
            if (parts.length && d >= 0xFFFFFF00) parts.push('-' + hx(0x100000000 - d, 2));
            else parts.push(hx(d, parts.length ? 2 : 8));
          }
        } else {
          parts = o.regs.map(r => EMU.REG16_NAMES[r]);
          if (o.disp || parts.length === 0) {
            if (parts.length && o.disp > 0xFF00) parts.push('-' + hx(0x10000 - o.disp, 2));
            else parts.push(hx(o.disp, parts.length ? 2 : 4));
          }
        }
        let t = '[' + parts.join('+').replace(/\+-/g, '-') + ']';
        if (o.ovr) t = EMU.SREG_NAMES[o.seg] + ':' + t;
        if (needSize) t = (PTR[o.size] || '') + t;
        return t;
      }
    }
    return '?';
  }

  function format(ins) {
    let name = ins.op.toUpperCase();
    const big = ins.osize === 32;
    if (ins.op === 'jcc') name = 'J' + EMU.CC_NAMES[ins.cc];
    else if (ins.op === 'setcc') name = 'SET' + EMU.CC_NAMES[ins.cc];
    else if (ins.op === 'jmpf') name = 'JMP FAR';
    else if (ins.op === 'callf') name = 'CALL FAR';
    else if (ins.op === 'int3') name = 'INT 3';
    else if (ins.op === 'jcxz') name = ins.asize === 32 ? 'JECXZ' : 'JCXZ';
    else if (['pusha', 'popa', 'pushf', 'popf', 'iret'].includes(ins.op) && big) name += 'D';
    else if (['movs', 'cmps', 'stos', 'lods', 'scas'].includes(ins.op)) name += ins.size === 8 ? 'B' : ins.size === 32 ? 'D' : 'W';
    let pre = '';
    if (ins.rep) {
      const cmp = ins.op === 'cmps' || ins.op === 'scas';
      pre = ins.rep === 3 ? (cmp ? 'REPE ' : 'REP ') : 'REPNE ';
    }
    if (ins.lock) pre = 'LOCK ' + pre;
    const needSize = !ins.ops.some(o => o.k === 'r' || o.k === 's' || o.k === 'c') ||
      ['movzx', 'movsx', 'rol', 'ror', 'rcl', 'rcr', 'shl', 'shr', 'sar'].includes(ins.op);
    const ops = ins.ops.map((o, i) => fmtOp(o, (needSize && ins.op !== 'lea' && (i === 0 || ['movzx', 'movsx'].includes(ins.op)))));
    let segp = '';
    if (ins.seg >= 0 && !ins.ops.some(o => o.k === 'm')) segp = EMU.SREG_NAMES[ins.seg] + ': ';
    return pre + segp + name + (ops.length ? ' ' + ops.join(', ') : '');
  }

  EMU.decode = decode;
  EMU.formatIns = format;
  EMU.formatOperand = fmtOp;
  EMU.UD = UD;
})(window.EMU);
