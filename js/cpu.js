/* =====================================================================
 *  EMU386 - CPU 80386 didáctico
 *  Modo real, modo protegido de 16 y 32 bits (bit D del descriptor de
 *  código), direcciones de 32 bits (SIB), FS/GS, paginación de 2 niveles,
 *  compuertas de 16 y 32 bits y TLB opcional.
 * ===================================================================== */
'use strict';
(function (EMU) {
  const Fault = EMU.Fault;
  const hex = EMU.hex;
  const CF = 0x1, PF = 0x4, AF = 0x10, ZF = 0x40, SF = 0x80, TF = 0x100, IF = 0x200, DF = 0x400, OF = 0x800, NT = 0x4000, RF = 0x10000, VM = 0x20000;
  const MASK = { 8: 0xFF, 16: 0xFFFF, 32: 0xFFFFFFFF };
  const SIGN = { 8: 0x80, 16: 0x8000, 32: 0x80000000 };
  const PARITY = new Uint8Array(256);
  for (let i = 0; i < 256; i++) { let c = 0; for (let b = i; b; b >>= 1) c += b & 1; PARITY[i] = (c & 1) ? 0 : 1; }
  const HIST_MAX = 10000;
  const SN = EMU.SREG_NAMES;

  const norm = (v, s) => s === 32 ? (v >>> 0) : (v & MASK[s]);
  const sx = (v, s) => s === 8 ? ((v & 0xFF) ^ 0x80) - 0x80 : s === 16 ? ((v & 0xFFFF) ^ 0x8000) - 0x8000 : (v | 0);
  const hx = (v, s) => hex(v, (v >>> 0) > 0xFFFF || s === 32 ? 8 : 4);

  function segCache(sel, base, limit, acc, gd, valid) { return { sel, base, limit, acc, gd: gd || 0, valid: valid !== false }; }

  class CPU {
    constructor() {
      this.mem = new Uint8Array(EMU.MEM_SIZE);
      this.r = new Uint32Array(8);
      this.bios = null;
      this.stackTags = new Map();
      this.log = [];
      this.reset();
    }

    // ------------------------------------------------------------------
    reset() {
      this.r.fill(0);
      this.ip = 0;
      this.flags = 0x0002;
      this.s = [0, 1, 2, 3, 4, 5].map(() => segCache(0, 0, 0xFFFF, 0x93, 0, true));
      this.s[1].acc = 0x9B;
      this.cr0 = 0; this.cr2 = 0; this.cr3 = 0;
      this.tlb = new Map();
      this.tlbOn = !!this.tlbOn;
      this.tlbMax = 8;
      this.tlbStats = { hits: 0, misses: 0 };
      this.gdtr = { base: 0, limit: 0 };
      this.idtr = { base: 0, limit: 0x3FF };
      this.ldtr = { sel: 0, base: 0, limit: 0, acc: 0, valid: false };
      this.tr = { sel: 0, base: 0, limit: 0, acc: 0, valid: false };
      this.halted = false; this.shutdown = false; this.waiting = false; this.finished = false;
      this.icount = 0;
      this.history = [];
      this.journal = null;
      this.trace = null;
      this.log = [];
      this.stackTags.clear();
      this.videoDirty = true;
      this.pauseRequest = null;
    }

    // ---------------- estado / registros ------------------------------
    pe() { return (this.cr0 & 1) !== 0; }
    pg() { return (this.cr0 & 0x80000000) !== 0 && this.pe(); }
    cpl() { return this.pe() ? (this.s[1].sel & 3) : 0; }
    iopl() { return (this.flags >> 12) & 3; }
    code32() { return this.pe() && (this.s[1].gd & 0x40) !== 0; }   // bit D del segmento de código
    stk32() { return this.pe() && (this.s[2].gd & 0x40) !== 0; }    // bit B del segmento de pila
    ipMask() { return this.code32() ? 0xFFFFFFFF : 0xFFFF; }
    getR(size, n) {
      if (size === 8) return n < 4 ? this.r[n] & 0xFF : (this.r[n - 4] >>> 8) & 0xFF;
      if (size === 16) return this.r[n] & 0xFFFF;
      return this.r[n];
    }
    setR(size, n, v) {
      if (size === 8) {
        if (n < 4) this.r[n] = (this.r[n] & 0xFFFFFF00) | (v & 0xFF);
        else this.r[n - 4] = (this.r[n - 4] & 0xFFFF00FF) | ((v & 0xFF) << 8);
      } else if (size === 16) this.r[n] = (this.r[n] & 0xFFFF0000) | (v & 0xFFFF);
      else this.r[n] = v >>> 0;
    }
    getF(f) { return (this.flags & f) !== 0; }
    setF(f, on) { if (on) this.flags |= f; else this.flags &= ~f; this.flags >>>= 0; }
    // SP o ESP según el bit B del segmento de pila
    sp() { return this.stk32() ? this.r[4] : this.r[4] & 0xFFFF; }
    setSP(v) { if (this.stk32()) this.r[4] = v >>> 0; else this.r[4] = (this.r[4] & 0xFFFF0000) | (v & 0xFFFF); }

    event(type, msg) {
      const e = { type, msg, n: this.icount, cs: this.s[1].sel, ip: this.curIP !== undefined ? this.curIP : this.ip };
      this.log.push(e);
      if (this.log.length > 800) this.log.splice(0, this.log.length - 800);
      if (this.trace) this.trace.ev.push(e);
    }

    // ---------------- memoria física ---------------------------------
    pr8(a) { return this.mem[a & EMU.PHYS_MASK]; }
    pw8(a, v) {
      a &= EMU.PHYS_MASK;
      if (a >= EMU.BIOS_BASE && a < 0x100000 && !this.romWritable) return; // ROM: se ignoran escrituras
      if (this.journal) this.journal.push(a, this.mem[a]);
      this.mem[a] = v & 0xFF;
      if (a >= EMU.VIDEO_BASE && a < EMU.VIDEO_BASE + 0x1000) this.videoDirty = true;
    }
    pr16(a) { return this.pr8(a) | (this.pr8(a + 1) << 8); }
    pr32(a) { return (this.pr16(a) + this.pr16(a + 2) * 65536) >>> 0; }
    pw16(a, v) { this.pw8(a, v); this.pw8(a + 1, v >> 8); }
    pw32(a, v) { this.pw16(a, v & 0xFFFF); this.pw16(a + 2, (v >>> 16) & 0xFFFF); }

    // ---------------- paginación --------------------------------------
    // quiet = true: traducción auxiliar (para mostrar o bytes siguientes de un
    // mismo acceso): no cuenta en las estadísticas de la TLB
    translate(lin, write, quiet) {
      lin >>>= 0;
      if (!this.pg()) return lin & EMU.PHYS_MASK;
      const dir = lin >>> 22, tab = (lin >>> 12) & 0x3FF;
      const user = this.cpl() === 3;
      const page = lin >>> 12;
      let te = null;
      if (this.tlbOn) {
        te = this.tlb.get(page);
        if (te && (!write || te.dirty) && !user) {
          if (!quiet) { te.hits++; this.tlbStats.hits++; if (this.trace) this.trace.tlb = 'hit'; }
          return (te.frame | (lin & 0xFFF)) & EMU.PHYS_MASK;
        }
      }
      const code = (write ? 2 : 0) | (user ? 4 : 0);
      const pdeA = (((this.cr3 & 0xFFFFF000) >>> 0) + dir * 4) & EMU.PHYS_MASK;
      const pde = this.pr32(pdeA);
      if (!(pde & 1)) {
        const f = new Fault(14, code, `Dirección lineal ${hex(lin, 8)}: la entrada ${dir} del DIRECTORIO de páginas (física ${hex(pdeA, 6)}) no está presente (P=0)`);
        f.cr2 = lin; throw f;
      }
      const pteA = (((pde & 0xFFFFF000) >>> 0) + tab * 4) & EMU.PHYS_MASK;
      const pte = this.pr32(pteA);
      if (!(pte & 1)) {
        const f = new Fault(14, code, `Dirección lineal ${hex(lin, 8)}: la entrada ${tab} de la TABLA de páginas (física ${hex(pteA, 6)}) no está presente (P=0)`);
        f.cr2 = lin; throw f;
      }
      if (user && (!(pde & 4) || !(pte & 4) || (write && (!(pde & 2) || !(pte & 2))))) {
        const f = new Fault(14, code | 1, `Dirección lineal ${hex(lin, 8)}: violación de protección de página (U/S o R/W)`);
        f.cr2 = lin; throw f;
      }
      if (!(pde & 0x20)) this.pw32(pdeA, pde | 0x20);
      const npte = (pte | 0x20 | (write ? 0x40 : 0)) >>> 0;
      if (npte !== pte) this.pw32(pteA, npte);
      const frame = (pte & 0xFFFFF000) >>> 0;
      if (this.tlbOn && !quiet) {
        this.tlbStats.misses++;
        if (this.trace && this.trace.tlb !== 'hit') this.trace.tlb = 'miss';
        if (te) { te.frame = frame; te.dirty = (npte & 0x40) !== 0; }
        else {
          if (this.tlb.size >= this.tlbMax) this.tlb.delete(this.tlb.keys().next().value); // FIFO: sale la más antigua
          this.tlb.set(page, { frame, dirty: (npte & 0x40) !== 0, hits: 0, n: this.icount });
        }
      }
      return (frame | (lin & 0xFFF)) & EMU.PHYS_MASK;
    }
    flushTLB(why) {
      if (this.tlbOn && this.tlb.size) this.event('cr', `TLB vaciada (${why}): se descartan ${this.tlb.size} traducciones guardadas`);
      this.tlb.clear();
    }

    // Recorrido de las tablas SIN efectos (para la interfaz)
    walk(lin) {
      lin >>>= 0;
      const r = { lin, pg: this.pg(), dir: lin >>> 22, tab: (lin >>> 12) & 0x3FF, off: lin & 0xFFF };
      if (!r.pg) { r.phys = lin & EMU.PHYS_MASK; return r; }
      r.cr3 = this.cr3;
      r.pdeA = (((this.cr3 & 0xFFFFF000) >>> 0) + r.dir * 4) & EMU.PHYS_MASK;
      r.pde = this.pr32(r.pdeA);
      if (!(r.pde & 1)) { r.fault = 'PDE no presente'; return r; }
      r.ptBase = (r.pde & 0xFFFFF000) >>> 0;
      r.pteA = (r.ptBase + r.tab * 4) & EMU.PHYS_MASK;
      r.pte = this.pr32(r.pteA);
      if (!(r.pte & 1)) { r.fault = 'PTE no presente'; return r; }
      r.frame = (r.pte & 0xFFFFF000) >>> 0;
      r.phys = (r.frame | r.off) & EMU.PHYS_MASK;
      return r;
    }

    // ---------------- segmentación ------------------------------------
    linearAddr(si, off, size, type) {
      const s = this.s[si];
      off >>>= 0;
      const last = off + size - 1;
      if (!this.pe()) {
        // en modo real el límite es normalmente FFFFh (salvo "modo irreal")
        if (last > s.limit) throw new Fault(si === 2 ? 12 : 13, 0, `El acceso de ${size} bytes en ${SN[si]}:${hx(off)} excede el límite ${hex(s.limit, 4)}h del segmento (modo real)`);
        return (s.base + off) >>> 0;
      }
      if (!s.valid) throw new Fault(13, 0, `El registro ${SN[si]} contiene un selector NULO (${hex(s.sel, 4)}h): no puede usarse para acceder a memoria`);
      const code = (s.acc & 8) !== 0;
      const vec = si === 2 ? 12 : 13;
      if (type === 'w') {
        if (code) throw new Fault(13, 0, `No se puede escribir en un segmento de CÓDIGO (${SN[si]}=${hex(s.sel, 4)}h)`);
        if (!(s.acc & 2)) throw new Fault(vec, 0, `El segmento ${SN[si]} (selector ${hex(s.sel, 4)}h) es de SOLO LECTURA`);
      } else if (type === 'r') {
        if (code && !(s.acc & 2)) throw new Fault(13, 0, `El segmento de código ${SN[si]} es solo ejecutable: no se puede leer`);
      }
      if (!code && (s.acc & 4)) {
        const upper = (s.gd & 0x40) ? 0xFFFFFFFF : 0xFFFF;
        if (off <= s.limit || last > upper) throw new Fault(vec, 0, `Offset ${hx(off)}h fuera del rango válido (${hx(s.limit + 1)}h..${hx(upper)}h) del segmento expand-down ${SN[si]}`);
      } else if (last > s.limit) {
        throw new Fault(vec, 0, `Offset ${hx(off)}h${size > 1 ? ' (+' + (size - 1) + ')' : ''} excede el LÍMITE ${hx(s.limit)}h del segmento ${SN[si]} (selector ${hex(s.sel, 4)}h)`);
      }
      return (s.base + off) >>> 0;
    }

    rd(si, off, size) {
      off >>>= 0;
      const lin = this.linearAddr(si, off, size, 'r');
      let v = 0, p0 = 0;
      for (let i = 0; i < size; i++) {
        const p = this.translate(lin + i, false, i > 0);
        if (i === 0) p0 = p;
        v += this.mem[p] * Math.pow(256, i);
      }
      if (this.trace) this.trace.acc.push({ t: 'R', si, seg: { ...this.s[si] }, off, lin, phys: p0, size, v, pe: this.pe() });
      return v;
    }
    wr(si, off, size, v, tag) {
      off >>>= 0;
      const lin = this.linearAddr(si, off, size, 'w');
      const ps = [];
      for (let i = 0; i < size; i++) ps.push(this.translate(lin + i, true, i > 0));
      for (let i = 0; i < size; i++) this.pw8(ps[i], (v >>> (8 * i)) & 0xFF);
      if (this.trace) this.trace.acc.push({ t: 'W', si, seg: { ...this.s[si] }, off, lin, phys: ps[0], size, v: v >>> 0, tag, pe: this.pe() });
      return ps[0];
    }
    // lectura de estructuras del sistema (GDT, IDT) por dirección LINEAL
    rdLin(lin, size) {
      let v = 0;
      for (let i = 0; i < size; i++) v += this.mem[this.translate(lin + i, false, i > 0)] * Math.pow(256, i);
      return v;
    }
    wrLin8(lin, v) { this.pw8(this.translate(lin, true), v); }

    // ---------------- pila --------------------------------------------
    push(v, size, tag) {
      const n = size >> 3;
      const sp = ((this.sp() - n) & (this.stk32() ? 0xFFFFFFFF : 0xFFFF)) >>> 0;
      const p = this.wr(2, sp, n, v, tag);
      this.setSP(sp);
      this.stackTags.set(p, tag || '');
    }
    pop(size) {
      const n = size >> 3;
      const sp = this.sp();
      const v = this.rd(2, sp, n);
      this.setSP(sp + n);
      return v;
    }

    // ---------------- descriptores ------------------------------------
    fetchDescriptor(sel, vec, ext) {
      vec = vec || 13;
      const ti = (sel & 4) !== 0;
      const idx = sel >> 3;
      const tbl = ti ? this.ldtr : this.gdtr;
      const ec = (sel & 0xFFFC) | (ext || 0);
      if (ti && !this.ldtr.valid) throw new Fault(vec, ec, `El selector ${hex(sel, 4)}h tiene TI=1 (LDT) pero no hay una LDT cargada`);
      if (idx * 8 + 7 > tbl.limit) throw new Fault(vec, ec, `El selector ${hex(sel, 4)}h (índice ${idx}) está fuera del límite de la ${ti ? 'LDT' : 'GDT'} (límite ${hex(tbl.limit, 4)}h → ${Math.floor((tbl.limit + 1) / 8)} descriptores)`);
      const addr = (tbl.base + idx * 8) >>> 0;
      const b = [];
      for (let i = 0; i < 8; i++) b.push(this.mem[this.translate(addr + i, false, i > 0)]);
      const d = EMU.parseDescriptor(b);
      d.addr = addr; d.idx = idx; d.ti = ti; d.sel = sel;
      if (this.trace) this.trace.acc.push({ t: 'D', lin: addr, phys: this.translate(addr, false, true), size: 8, sel, idx, table: ti ? 'LDT' : 'GDT', v: 0 });
      return d;
    }
    setAccessed(d) {
      if (!(d.acc & 1)) { this.wrLin8(d.addr + 5, d.acc | 1); d.acc |= 1; }
    }
    // Lee un descriptor sin efectos ni excepciones (interfaz / LAR / LSL / VERR)
    peekDescriptor(sel) {
      const ti = (sel & 4) !== 0, idx = sel >> 3;
      const tbl = ti ? this.ldtr : this.gdtr;
      if (ti && !this.ldtr.valid) return { error: 'TI=1 pero no hay LDT' };
      if (idx * 8 + 7 > tbl.limit) return { error: `Índice ${idx} fuera del límite de la ${ti ? 'LDT' : 'GDT'}` };
      const addr = (tbl.base + idx * 8) >>> 0;
      const b = [];
      for (let i = 0; i < 8; i++) {
        const w = this.walk(addr + i);
        if (w.phys === undefined) return { error: 'La tabla no está mapeada (falla de página)' };
        b.push(this.mem[w.phys]);
      }
      const d = EMU.parseDescriptor(b);
      d.addr = addr; d.idx = idx; d.ti = ti; d.sel = sel;
      return d;
    }
    sizeTxt(d) {
      if (!(d.acc & 0x10)) return '';
      return (d.acc & 8) ? (d.gd & 0x40 ? ', código de 32 bits (D=1)' : ', código de 16 bits (D=0)') : (d.gd & 0x40 ? ', B=1 (pila de 32 bits: ESP)' : '');
    }

    loadSeg(si, sel) {
      sel &= 0xFFFF;
      if (!this.pe()) {
        // 386 en modo real: solo cambia la base; límite y atributos se conservan
        const old = this.s[si];
        this.s[si] = segCache(sel, (sel << 4) >>> 0, old.limit, si === 1 ? 0x9B : old.acc || 0x93, old.gd & ~0x40, true);
        return;
      }
      if (si === 1) throw new Fault(13, 0, 'CS no puede cargarse así');
      const name = SN[si];
      if ((sel & 0xFFFC) === 0) {
        if (si === 2) throw new Fault(13, 0, 'No se puede cargar un selector NULO en SS');
        this.s[si] = segCache(sel, 0, 0, 0, 0, false);
        this.event('seg', `${name} ← ${hex(sel, 4)}h: selector NULO (se puede cargar en DS/ES/FS/GS, pero cualquier acceso a memoria con él provocará #GP)`);
        return;
      }
      const d = this.fetchDescriptor(sel);
      const rpl = sel & 3, cpl = this.cpl(), dpl = (d.acc >> 5) & 3;
      const ec = sel & 0xFFFC;
      if (!(d.acc & 0x10)) throw new Fault(13, ec, `El descriptor ${d.idx} es de SISTEMA (${EMU.describeAccess(d.acc).txt}); no puede cargarse en ${name}`);
      if (si === 2) {
        if ((d.acc & 8) || !(d.acc & 2)) throw new Fault(13, ec, `SS requiere un segmento de DATOS con escritura (el descriptor ${d.idx} es: ${EMU.describeAccess(d.acc).txt})`);
        if (rpl !== cpl || dpl !== cpl) throw new Fault(13, ec, `Para SS: RPL (${rpl}) y DPL (${dpl}) deben ser iguales al CPL (${cpl})`);
        if (!(d.acc & 0x80)) throw new Fault(12, ec, `El segmento de pila ${hex(sel, 4)}h no está presente (P=0)`);
      } else {
        if ((d.acc & 8) && !(d.acc & 2)) throw new Fault(13, ec, `Un segmento de código solo ejecutable no puede cargarse en ${name}`);
        if (!((d.acc & 8) && (d.acc & 4)) && dpl < Math.max(cpl, rpl)) throw new Fault(13, ec, `Privilegio insuficiente: DPL=${dpl} < max(CPL=${cpl}, RPL=${rpl})`);
        if (!(d.acc & 0x80)) throw new Fault(11, ec, `El segmento ${hex(sel, 4)}h no está presente (P=0) → #NP`);
      }
      this.setAccessed(d);
      this.s[si] = segCache(sel, d.base, d.limit, d.acc, d.gd, true);
      this.s[si].desc = d.idx; this.s[si].ti = d.ti;
      this.event('seg', `${name} ← ${hex(sel, 4)}h: índice ${d.idx} de la ${d.ti ? 'LDT' : 'GDT'} (lineal ${hex(d.addr, 6)}) → caché: base=${hex(d.base, 8)}h límite=${hx(d.limit)}h${d.gd & 0x80 ? ' (G=1: en páginas de 4 KB)' : ''}, ${EMU.describeAccess(d.acc).txt}, DPL=${dpl}${this.sizeTxt(d)}`);
    }

    // carga de CS por salto/llamada/retorno lejano
    loadCS(sel, off, how) {
      sel &= 0xFFFF; off >>>= 0;
      if (!this.pe()) {
        const old = this.s[1];
        this.s[1] = segCache(sel, (sel << 4) >>> 0, old.limit, 0x9B, 0, true);
        this.ip = off & 0xFFFF;
        return;
      }
      if ((sel & 0xFFFC) === 0) throw new Fault(13, 0, 'Salto lejano a un selector NULO');
      const d = this.fetchDescriptor(sel);
      const ec = sel & 0xFFFC, rpl = sel & 3, cpl = this.cpl(), dpl = (d.acc >> 5) & 3;
      if (!(d.acc & 0x10)) {
        const t = d.acc & 15;
        const what = (t === 4 || t === 12) ? 'compuertas de llamada' : (t === 1 || t === 9 || t === 5) ? 'la conmutación de tareas (TSS / compuerta de tarea)' : 'este tipo de descriptor';
        throw new Fault(13, ec, `El selector ${hex(sel, 4)}h apunta a un descriptor de sistema: ${what} no está implementado en este emulador`);
      }
      if (!(d.acc & 8)) throw new Fault(13, ec, `El selector ${hex(sel, 4)}h no apunta a un segmento de CÓDIGO (${EMU.describeAccess(d.acc).txt})`);
      if (how === 'ret') {
        if (rpl < cpl) throw new Fault(13, ec, `Retorno a un nivel más privilegiado (RPL ${rpl} < CPL ${cpl})`);
        if (rpl > cpl) throw new Fault(13, ec, 'Retorno a un anillo menos privilegiado: no implementado en este emulador');
      } else if (d.acc & 4) {
        if (dpl > cpl) throw new Fault(13, ec, `Segmento conforme con DPL ${dpl} > CPL ${cpl}`);
      } else if (rpl > cpl || dpl !== cpl) {
        throw new Fault(13, ec, `Salto a segmento de código no conforme: requiere DPL (${dpl}) = CPL (${cpl}) y RPL (${rpl}) ≤ CPL`);
      }
      if (!(d.acc & 0x80)) throw new Fault(11, ec, `El segmento de código ${hex(sel, 4)}h no está presente (P=0)`);
      if (off > d.limit) throw new Fault(13, 0, `EIP=${hx(off)}h excede el límite ${hx(d.limit)}h del segmento de código`);
      this.setAccessed(d);
      const wasReal = this.s[1].desc === undefined;
      const was32 = this.code32();
      this.s[1] = segCache((sel & 0xFFFC) | cpl, d.base, d.limit, d.acc, d.gd, true);
      this.s[1].desc = d.idx; this.s[1].ti = d.ti;
      this.ip = off;
      const now32 = this.code32();
      this.event('seg', `CS ← ${hex(sel, 4)}h, EIP ← ${hx(off)}h: descriptor ${d.idx} de la GDT → base=${hex(d.base, 8)}h límite=${hx(d.limit)}h, ${EMU.describeAccess(d.acc).txt}${this.sizeTxt(d)}` +
        (wasReal ? '. La caché de CS ya no tiene valores de modo real: ahora sí se ejecuta código de modo protegido.' : ''));
      if (now32 !== was32) this.event('mode', now32 ? 'CÓDIGO DE 32 BITS: el segmento de código tiene D=1. Desde ahora los operandos y las direcciones son de 32 bits por defecto (EAX, [EBX+ESI*4], EIP); el prefijo 66h/67h pide 16 bits.'
        : 'CÓDIGO DE 16 BITS: el segmento de código tiene D=0 (operandos y direcciones de 16 bits por defecto).');
    }

    // ---------------- interrupciones ----------------------------------
    interrupt(vec, err, kind) {
      const vh = hex(vec, 2);
      if (!this.pe()) {
        if (vec * 4 + 3 > this.idtr.limit) throw new Fault(13, 0, `El vector ${vec} está fuera del límite de la tabla de vectores (IDTR.límite=${hex(this.idtr.limit, 4)}h)`);
        const a = (this.idtr.base + vec * 4) >>> 0;
        const off = this.rdLin(a, 2), seg = this.rdLin(a + 2, 2);
        if (this.trace) this.trace.acc.push({ t: 'V', lin: a, phys: this.translate(a, false, true), size: 4, v: seg * 65536 + off, vec });
        const oldCS = this.s[1].sel, oldIP = this.ip & 0xFFFF;
        this.push(this.flags & 0xFFFF, 16, `FLAGS (INT ${vh}h)`);
        this.push(oldCS, 16, `CS de retorno (INT ${vh}h)`);
        this.push(oldIP, 16, `IP de retorno (INT ${vh}h)`);
        this.flags &= ~(IF | TF);
        const old = this.s[1];
        this.s[1] = segCache(seg, seg << 4, old.limit, 0x9B, 0, true);
        this.ip = off;
        this.event('int', `INT ${vh}h en modo real: se lee el vector ${vec} de la IVT en ${hex(a, 5)}h (4 bytes = offset:segmento) → salta a ${hex(seg, 4)}:${hex(off, 4)}. Se apilaron FLAGS, CS=${hex(oldCS, 4)} e IP=${hex(oldIP, 4)}; IF=0`);
        return;
      }
      const ext = kind === 'soft' ? 0 : 1;
      const gsel = vec * 8 + 2 + ext;
      if (vec * 8 + 7 > this.idtr.limit) throw new Fault(13, gsel, `El vector ${vec} excede el límite de la IDT (IDTR.límite=${hex(this.idtr.limit, 4)}h)`);
      const ga = (this.idtr.base + vec * 8) >>> 0;
      const g = [];
      for (let i = 0; i < 8; i++) g.push(this.mem[this.translate(ga + i, false, i > 0)]);
      if (this.trace) this.trace.acc.push({ t: 'G', lin: ga, phys: this.translate(ga, false, true), size: 8, v: 0, vec });
      const acc = g[5], type = acc & 15;
      const sel = g[2] | (g[3] << 8);
      const valid = !(acc & 0x10) && [6, 7, 14, 15].includes(type);
      if (!valid) {
        let why = `el descriptor en la IDT no es una compuerta válida (${EMU.describeAccess(acc).txt})`;
        if (type === 5 && !(acc & 0x10)) why = 'las compuertas de tarea no están implementadas en este emulador';
        throw new Fault(13, gsel, `Vector ${vec}: ${why}`);
      }
      const g32 = (type & 8) !== 0;
      const off = g32 ? ((g[0] | (g[1] << 8)) + (g[6] | (g[7] << 8)) * 65536) >>> 0 : (g[0] | (g[1] << 8));
      const gdpl = (acc >> 5) & 3, cpl = this.cpl();
      if (kind === 'soft' && gdpl < cpl) throw new Fault(13, gsel, `INT ${vh}h: DPL de la compuerta (${gdpl}) < CPL (${cpl})`);
      if (!(acc & 0x80)) throw new Fault(11, gsel, `La compuerta del vector ${vec} (${vh}h) no está presente (P=0)`);
      if ((sel & 0xFFFC) === 0) throw new Fault(13, ext, `La compuerta del vector ${vec} tiene un selector nulo`);
      const d = this.fetchDescriptor(sel, 13, ext);
      if (!(d.acc & 0x10) || !(d.acc & 8)) throw new Fault(13, (sel & 0xFFFC) | ext, `El selector ${hex(sel, 4)}h de la compuerta ${vec} no es un segmento de código`);
      const ddpl = (d.acc >> 5) & 3;
      if (ddpl > cpl) throw new Fault(13, (sel & 0xFFFC) | ext, 'DPL del segmento del manejador > CPL');
      if (ddpl < cpl && !(d.acc & 4)) throw new Fault(13, (sel & 0xFFFC) | ext, 'El cambio de anillo (y de pila vía TSS) en una interrupción no está implementado en este emulador');
      if (!(d.acc & 0x80)) throw new Fault(11, (sel & 0xFFFC) | ext, 'El segmento de código del manejador no está presente');
      if (off > d.limit) throw new Fault(13, 0, 'El offset del manejador excede el límite de su segmento');
      const w = g32 ? 32 : 16;
      const oldCS = this.s[1].sel, oldIP = this.ip, oldFL = this.flags;
      this.push(g32 ? (oldFL & ~RF) >>> 0 : oldFL & 0xFFFF, w, `${g32 ? 'EFLAGS' : 'FLAGS'} (vector ${vh}h)`);
      this.push(oldCS, w, `CS de retorno (vector ${vh}h)`);
      this.push(g32 ? oldIP : oldIP & 0xFFFF, w, `${g32 ? 'EIP' : 'IP'} de retorno (vector ${vh}h)`);
      if (err !== null && err !== undefined) this.push(err, w, `código de error = ${hex(err, 4)}h`);
      this.setAccessed(d);
      this.s[1] = segCache((sel & 0xFFFC) | cpl, d.base, d.limit, d.acc, d.gd, true);
      this.s[1].desc = d.idx; this.s[1].ti = d.ti;
      this.ip = off;
      this.flags &= ~(TF | NT | RF | VM);
      if ((type & 7) === 6) this.flags &= ~IF;
      this.flags >>>= 0;
      this.event('int', `Vector ${vec} (${vh}h): compuerta de ${(type & 7) === 6 ? 'INTERRUPCIÓN' : 'TRAMPA'} de ${g32 ? '32 bits (386)' : '16 bits (286)'} en IDT[${vec}] (lineal ${hex(ga, 6)}h) → ${hex(sel, 4)}:${hx(off)}. ` +
        `Se apilaron ${g32 ? 'EFLAGS, CS y EIP (4 bytes c/u)' : 'FLAGS, CS e IP (2 bytes c/u)'}` +
        (err !== null && err !== undefined ? ` y el código de error ${hex(err, 4)}h` : '') + ((type & 7) === 6 ? '; IF=0' : ''));
    }

    exception(f) {
      const pm = this.pe();
      this.event('exc', `EXCEPCIÓN ${EMU.excName(f.vec)}` + (pm && EMU.hasErrorCode(f.vec) ? ` — código de error ${hex(f.code, 4)}h` : '') + `: ${f.msg}`);
      if (f.vec === 14) { this.cr2 = f.cr2 >>> 0; this.event('exc', `CR2 ← ${hex(this.cr2, 8)}h (dirección lineal que provocó la falla de página)`); }
      const saved = this.snapRegs();
      try {
        this.interrupt(f.vec, pm && EMU.hasErrorCode(f.vec) ? f.code : null, 'fault');
      } catch (e2) {
        if (!(e2 instanceof Fault)) throw e2;
        this.restoreRegs(saved);
        if (f.vec === 8) { this.triple(e2); return; }
        this.event('exc', `Falló la entrega de la excepción ${f.vec}: ${e2.msg} → DOBLE FALTA (#DF)`);
        try { this.interrupt(8, pm ? 0 : null, 'fault'); }
        catch (e3) {
          if (!(e3 instanceof Fault)) throw e3;
          this.restoreRegs(saved);
          this.triple(e3);
        }
      }
    }
    triple(e) {
      this.shutdown = true;
      this.halted = true;
      this.event('exc', `TRIPLE FALTA: tampoco pudo atenderse la doble falta (${e.msg}). El procesador entra en SHUTDOWN (en una PC real la placa madre reinicia la máquina). Presione Reiniciar.`);
    }

    // ---------------- ciclo de instrucción ----------------------------
    snapRegs() {
      return {
        r: Array.from(this.r), ip: this.ip, flags: this.flags, s: this.s.map(x => ({ ...x })),
        cr0: this.cr0, cr2: this.cr2, cr3: this.cr3, gdtr: { ...this.gdtr }, idtr: { ...this.idtr },
        ldtr: { ...this.ldtr }, tr: { ...this.tr }, halted: this.halted, shutdown: this.shutdown,
        finished: this.finished, icount: this.icount,
      };
    }
    restoreRegs(sn) {
      this.r.set(sn.r); this.ip = sn.ip; this.flags = sn.flags; this.s = sn.s.map(x => ({ ...x }));
      this.cr0 = sn.cr0; this.cr2 = sn.cr2; this.cr3 = sn.cr3;
      this.gdtr = { ...sn.gdtr }; this.idtr = { ...sn.idtr }; this.ldtr = { ...sn.ldtr }; this.tr = { ...sn.tr };
    }

    step() {
      if (this.halted) return false;
      const snap = this.snapRegs();
      this.journal = [];
      this.trace = { acc: [], ev: [], before: snap, ins: null, ip: this.ip, cs: this.s[1].sel, fault: null };
      this.curIP = this.ip;
      this.waiting = false;
      const tf = this.getF(TF);
      try {
        const ins = this.fetchDecode();
        this.trace.ins = ins;
        this.ip = ((this.curIP + ins.len) & this.ipMask()) >>> 0;
        this.exec(ins);
        this.icount++;
        if (tf && !this.waiting && !this.halted) {
          try { this.interrupt(1, null, 'trap'); } catch (e) { if (!(e instanceof Fault)) throw e; this.exception(e); }
        }
      } catch (e) {
        if (!(e instanceof Fault)) throw e;
        this.restoreRegs(snap);
        this.ip = this.curIP;
        this.icount++;
        this.trace.fault = e;
        this.exception(e);
      }
      this.history.push({ snap, journal: this.journal, ins: this.trace.ins, fault: this.trace.fault });
      if (this.history.length > HIST_MAX) this.history.splice(0, 1000);
      this.journal = null;
      return true;
    }

    stepBack() {
      const h = this.history.pop();
      if (!h) return false;
      for (let i = h.journal.length - 2; i >= 0; i -= 2) this.mem[h.journal[i]] = h.journal[i + 1];
      this.restoreRegs(h.snap);
      this.halted = h.snap.halted; this.shutdown = h.snap.shutdown; this.finished = h.snap.finished;
      this.icount = h.snap.icount;
      this.waiting = false;
      this.trace = null;
      this.videoDirty = true;
      this.tlb.clear();
      return true;
    }

    fetchDecode() {
      const bytes = [];
      const base = this.curIP;
      const mask = this.ipMask();
      let ins;
      const saveTrace = this.trace;
      this.trace = null; // no registrar cada byte leído
      try {
        ins = EMU.decode((i) => {
          if (i > 15) throw EMU.UD;
          const off = ((base + i) & mask) >>> 0;
          const lin = this.linearAddr(1, off, 1, 'x');
          const b = this.mem[this.translate(lin, false, i > 0)];
          bytes.push(b);
          return b;
        }, base, this.code32());
      } catch (e) {
        this.trace = saveTrace;
        if (e === EMU.UD) throw new Fault(6, null, `Código de operación inválido en ${hex(this.s[1].sel, 4)}:${hx(base)} (bytes: ${bytes.map(b => hex(b, 2)).join(' ')})`);
        throw e;
      }
      this.trace = saveTrace;
      ins.bytes = bytes;
      if (this.trace) {
        const lin = (this.s[1].base + base) >>> 0;
        this.trace.acc.push({ t: 'X', si: 1, seg: { ...this.s[1] }, off: base, lin, phys: this.translate(lin, false, true), size: ins.len, v: 0, pe: this.pe() });
      }
      return ins;
    }

    // ---------------- ALU ---------------------------------------------
    szp(res, s) {
      this.setF(ZF, res === 0);
      this.setF(SF, (res & SIGN[s]) !== 0);
      this.setF(PF, PARITY[res & 0xFF] === 1);
    }
    alu(op, a, b, s) {
      const m = MASK[s], hb = SIGN[s];
      let r, res;
      switch (op) {
        case 'add': case 'adc': {
          const c = op === 'adc' && this.getF(CF) ? 1 : 0;
          r = a + b + c; res = norm(r, s);
          this.setF(CF, r > m);
          this.setF(OF, ((a ^ res) & (b ^ res) & hb) !== 0);
          this.setF(AF, ((a ^ b ^ res) & 0x10) !== 0);
          this.szp(res, s);
          return res;
        }
        case 'sub': case 'sbb': case 'cmp': {
          const c = op === 'sbb' && this.getF(CF) ? 1 : 0;
          r = a - b - c; res = norm(r, s);
          this.setF(CF, r < 0);
          this.setF(OF, ((a ^ b) & (a ^ res) & hb) !== 0);
          this.setF(AF, ((a ^ b ^ res) & 0x10) !== 0);
          this.szp(res, s);
          return res;
        }
        case 'and': res = norm(a & b, s); break;
        case 'or': res = norm(a | b, s); break;
        case 'xor': res = norm(a ^ b, s); break;
        case 'test': res = norm(a & b, s); break;
      }
      this.setF(CF, false); this.setF(OF, false); this.setF(AF, false);
      this.szp(res, s);
      return res;
    }
    shift(op, v, cnt, s) {
      cnt &= 0x1F;
      if (cnt === 0) return v;
      const hb = SIGN[s];
      let cf = this.getF(CF);
      const orig = v;
      for (let i = 0; i < cnt; i++) {
        switch (op) {
          case 'shl': cf = (v & hb) !== 0; v = norm(v * 2, s); break;
          case 'shr': cf = (v & 1) !== 0; v = v >>> 1; break;
          case 'sar': cf = (v & 1) !== 0; v = norm((v >>> 1) | (v & hb), s); break;
          case 'rol': cf = (v & hb) !== 0; v = norm(v * 2 + (cf ? 1 : 0), s); break;
          case 'ror': cf = (v & 1) !== 0; v = norm((v >>> 1) | (cf ? hb : 0), s); break;
          case 'rcl': { const n = (v & hb) !== 0; v = norm(v * 2 + (cf ? 1 : 0), s); cf = n; break; }
          case 'rcr': { const n = (v & 1) !== 0; v = norm((v >>> 1) | (cf ? hb : 0), s); cf = n; break; }
        }
      }
      this.setF(CF, cf);
      const msb = (v & hb) !== 0;
      if (op === 'shl' || op === 'rol' || op === 'rcl') this.setF(OF, msb !== cf);
      else if (op === 'shr') this.setF(OF, (orig & hb) !== 0);
      else if (op === 'sar') this.setF(OF, false);
      else this.setF(OF, msb !== ((v & (hb >>> 1)) !== 0));
      if (op === 'shl' || op === 'shr' || op === 'sar') { this.szp(v, s); this.setF(AF, false); }
      return v;
    }
    cond(cc) {
      const f = this.flags;
      const c = !!(f & CF), z = !!(f & ZF), sgn = !!(f & SF), o = !!(f & OF), p = !!(f & PF);
      let r;
      switch (cc >> 1) {
        case 0: r = o; break;
        case 1: r = c; break;
        case 2: r = z; break;
        case 3: r = c || z; break;
        case 4: r = sgn; break;
        case 5: r = p; break;
        case 6: r = sgn !== o; break;
        case 7: r = z || (sgn !== o); break;
      }
      return (cc & 1) ? !r : r;
    }

    // ---------------- operandos ----------------------------------------
    ea(o) {
      if (o.a32) {
        let v = o.disp;
        if (o.base >= 0) v += this.r[o.base];
        if (o.index >= 0) v += this.r[o.index] * o.scale;
        return v >>> 0;
      }
      let v = o.disp;
      for (const n of o.regs) v += this.r[n] & 0xFFFF;
      return v & 0xFFFF;
    }
    get(o) {
      switch (o.k) {
        case 'r': return this.getR(o.size, o.n);
        case 'm': return this.rd(o.seg, this.ea(o), o.size >> 3);
        case 'i': return o.v;
        case 's': return this.s[o.n].sel;
        case 'c': return this.getCR(o.n);
        case 'j': return o.v;
      }
      throw new Fault(6, null, 'Operando inválido');
    }
    put(o, v) {
      if (o.k === 'r') this.setR(o.size, o.n, v);
      else if (o.k === 'm') this.wr(o.seg, this.ea(o), o.size >> 3, v);
      else throw new Fault(6, null, 'Destino inválido');
    }
    getCR(n) { return n === 0 ? this.cr0 : n === 2 ? this.cr2 : this.cr3; }
    needPriv(what) { if (this.pe() && this.cpl() !== 0) throw new Fault(13, 0, `${what} requiere CPL=0 (anillo 0); CPL actual=${this.cpl()}`); }
    needPM(what) { if (!this.pe()) throw new Fault(6, null, `${what} solo existe en modo protegido: en modo real produce #UD`); }
    // registros contador/índice según el tamaño de dirección
    cReg(as) { return as === 32 ? this.r[1] : this.r[1] & 0xFFFF; }
    setCReg(as, v) { this.setR(as, 1, v); }

    setCR(n, v) {
      this.needPriv('MOV CRn');
      v >>>= 0;
      if (n === 0) {
        if ((v & 0x80000000) && !(v & 1)) throw new Fault(13, 0, 'No se puede activar la paginación (PG=1) sin modo protegido (PE=1)');
        const old = this.cr0;
        this.cr0 = (v & 0x8000001F) >>> 0;
        this.modeEvents(old, this.cr0);
      } else if (n === 2) { this.cr2 = v; }
      else {
        this.cr3 = (v & 0xFFFFF018) >>> 0;
        this.flushTLB('se escribió CR3');
        this.event('cr', `CR3 ← ${hex(this.cr3, 8)}h: el directorio de páginas está en la dirección FÍSICA ${hex(this.cr3 & 0xFFFFF000, 8)}h`);
      }
    }
    modeEvents(old, now) {
      if (!(old & 1) && (now & 1)) this.event('mode', 'PE=1: el procesador entra en MODO PROTEGIDO. Atención: CS todavía guarda en su caché la base del modo real; hay que ejecutar un salto LEJANO (JMP selector:offset) para cargar CS con un selector de la GDT y vaciar la cola de instrucciones.');
      if ((old & 1) && !(now & 1)) this.event('mode', 'PE=0: el procesador vuelve a MODO REAL (el 386 lo permite con MOV CR0; el 286 necesitaba un reset). Los registros de segmento conservan su límite hasta recargarlos.');
      if (!(old & 0x80000000) && (now & 0x80000000)) this.event('mode', `PG=1: PAGINACIÓN ACTIVADA. Desde ahora toda dirección LINEAL se traduce a FÍSICA con el directorio apuntado por CR3 (${hex(this.cr3, 8)}h).`);
      if ((old & 0x80000000) && !(now & 0x80000000)) this.event('mode', 'PG=0: paginación desactivada (lineal = física).');
      if ((old ^ now) & 8) this.event('cr', `TS=${(now >> 3) & 1}`);
      if ((old ^ now) & 0x80000001) this.flushTLB('cambió PG o PE');
    }
    setFlagsW(v, size) {
      let mask;
      if (!this.pe()) mask = 0x7FD5;
      else {
        mask = 0x4FD5;
        if (this.cpl() === 0) mask |= 0x3000;
        if (this.cpl() > this.iopl()) mask &= ~IF;
      }
      if (size === 32) mask |= RF; // VM no se puede cambiar con POPF
      this.flags = ((this.flags & ~mask) | (v & mask) | 2) >>> 0;
      this.flags &= ~RF; this.flags >>>= 0;
    }

    farJump(sel, off) { this.loadCS(sel, off, 'jmp'); }
    farPtr(a, osize) {
      const o = this.ea(a), n = osize >> 3;
      const off = this.rd(a.seg, o, n);
      const sel = this.rd(a.seg, (o + n) >>> 0, 2);
      return { off, sel };
    }

    // ---------------- ejecución ----------------------------------------
    exec(ins) {
      const [a, b, c] = ins.ops;
      const op = ins.op;
      const os = ins.osize, as = ins.asize;
      switch (op) {
        case 'nop': case 'wait': return;
        case 'mov':
          if (a.k === 's') {
            const v = this.get(b) & 0xFFFF;
            this.loadSeg(a.n, v);
            if (!this.pe()) this.event('seg', `${SN[a.n]} ← ${hex(v, 4)}h (modo real: base = ${hex(v, 4)}h × 16 = ${hex(this.s[a.n].base, 5)}h, sin tablas ni protección)`);
            return;
          }
          if (a.k === 'c') { this.setCR(a.n, this.get(b)); return; }
          if (b.k === 'c') this.needPriv('MOV desde CRn');
          this.put(a, this.get(b));
          return;
        case 'add': case 'or': case 'adc': case 'sbb': case 'and': case 'sub': case 'xor': {
          const r = this.alu(op, this.get(a), this.get(b), a.size);
          this.put(a, r);
          return;
        }
        case 'cmp': this.alu('cmp', this.get(a), this.get(b), a.size); return;
        case 'test': this.alu('test', this.get(a), this.get(b), a.size); return;
        case 'xchg': { const x = this.get(a), y = this.get(b); this.put(a, y); this.put(b, x); return; }
        case 'inc': case 'dec': {
          const cf = this.getF(CF);
          this.put(a, this.alu(op === 'inc' ? 'add' : 'sub', this.get(a), 1, a.size));
          this.setF(CF, cf);
          return;
        }
        case 'not': this.put(a, norm(~this.get(a), a.size)); return;
        case 'neg': { const x = this.get(a); const r = this.alu('sub', 0, x, a.size); this.setF(CF, x !== 0); this.put(a, r); return; }
        case 'mul': case 'imul': case 'div': case 'idiv':
          if (ins.ops.length === 1) return this.muldiv(op, a);
          return this.imulN(a, b, c);
        case 'rol': case 'ror': case 'rcl': case 'rcr': case 'shl': case 'shr': case 'sar':
          this.put(a, this.shift(op, this.get(a), this.get(b), a.size));
          return;
        case 'shld': case 'shrd': return this.shxd(op, a, b, c);
        case 'bt': case 'bts': case 'btr': case 'btc': return this.bitTest(op, a, b);
        case 'bsf': case 'bsr': {
          const v = this.get(b);
          if (v === 0) { this.setF(ZF, true); return; }
          this.setF(ZF, false);
          let i;
          if (op === 'bsf') { i = 0; while (!((v >>> i) & 1)) i++; }
          else { i = b.size - 1; while (!((v >>> i) & 1)) i--; }
          this.put(a, i);
          return;
        }
        case 'movzx': this.put(a, this.get(b)); return;
        case 'movsx': this.put(a, norm(sx(this.get(b), b.size), a.size)); return;
        case 'setcc': this.put(a, this.cond(ins.cc) ? 1 : 0); return;
        case 'push': {
          const size = a.k === 's' ? os : a.k === 'i' ? os : a.size;
          const v = this.get(a);
          const nm = a.k === 'r' ? (a.size === 32 ? EMU.REG32_NAMES[a.n] : EMU.REG16_NAMES[a.n]) : a.k === 's' ? SN[a.n] : a.k === 'i' ? 'inmediato' : 'memoria';
          this.push(v, size, `PUSH ${nm}`);
          return;
        }
        case 'pop': {
          if (a.k === 's') {
            const sp = this.sp();
            const v = this.rd(2, sp, os >> 3) & 0xFFFF;
            this.loadSeg(a.n, v);
            this.setSP(sp + (os >> 3));
            return;
          }
          const v = this.pop(a.size);
          this.put(a, v);
          return;
        }
        case 'pusha': {
          const t = os === 32 ? this.r[4] : this.r[4] & 0xFFFF;
          const names = os === 32 ? EMU.REG32_NAMES : EMU.REG16_NAMES;
          for (let i = 0; i < 8; i++) this.push(i === 4 ? t : this.getR(os, i), os, `PUSHA${os === 32 ? 'D' : ''}: ${names[i]}`);
          return;
        }
        case 'popa': {
          for (let i = 7; i >= 0; i--) { const v = this.pop(os); if (i !== 4) this.setR(os, i, v); }
          return;
        }
        case 'pushf':
          if (os === 32) this.push((this.flags & ~(RF | VM)) >>> 0, 32, 'PUSHFD: EFLAGS');
          else this.push(this.flags & 0x7FFF, 16, 'PUSHF: FLAGS');
          return;
        case 'popf': this.setFlagsW(this.pop(os), os); return;
        case 'lea': this.put(a, a.size === 32 ? this.ea(b) : this.ea(b) & 0xFFFF); return;
        case 'lds': case 'les': case 'lss': case 'lfs': case 'lgs': {
          const { off, sel } = this.farPtr(b, os);
          this.loadSeg({ les: 0, lss: 2, lds: 3, lfs: 4, lgs: 5 }[op], sel);
          this.put(a, off);
          return;
        }
        case 'jmp': this.ip = (this.get(a) & MASK[os]) >>> 0; return;
        case 'jcc': if (this.cond(ins.cc)) this.ip = a.v; return;
        case 'jmpf': {
          if (a.k === 'p') { this.farJump(a.sel, a.off); return; }
          const { off, sel } = this.farPtr(a, os);
          this.farJump(sel, off);
          return;
        }
        case 'call': {
          const t = (this.get(a) & MASK[os]) >>> 0;
          this.push(this.ip, os, `${os === 32 ? 'EIP' : 'IP'} de retorno (CALL)`);
          this.ip = t;
          return;
        }
        case 'callf': {
          let sel, off;
          if (a.k === 'p') { sel = a.sel; off = a.off; }
          else ({ off, sel } = this.farPtr(a, os));
          const oldCS = this.s[1].sel, oldIP = this.ip;
          this.push(oldCS, os, 'CS de retorno (CALL FAR)');
          this.push(oldIP, os, `${os === 32 ? 'EIP' : 'IP'} de retorno (CALL FAR)`);
          this.loadCS(sel, off, 'call');
          return;
        }
        case 'ret': {
          this.ip = this.pop(os);
          if (a) this.setSP(this.sp() + a.v);
          return;
        }
        case 'retf': {
          const ip = this.pop(os), cs = this.pop(os) & 0xFFFF;
          this.loadCS(cs, ip, 'ret');
          if (a) this.setSP(this.sp() + a.v);
          return;
        }
        case 'loop': case 'loope': case 'loopne': {
          const cx = ((this.cReg(as) - 1) & MASK[as]) >>> 0;
          this.setCReg(as, cx);
          let go = cx !== 0;
          if (op === 'loope') go = go && this.getF(ZF);
          if (op === 'loopne') go = go && !this.getF(ZF);
          if (go) this.ip = a.v;
          return;
        }
        case 'jcxz': if (this.cReg(as) === 0) this.ip = a.v; return;
        case 'int': this.interrupt(a.v, null, 'soft'); return;
        case 'int3': this.interrupt(3, null, 'soft'); return;
        case 'into': if (this.getF(OF)) this.interrupt(4, null, 'soft'); return;
        case 'iret': {
          const ip = this.pop(os), cs = this.pop(os) & 0xFFFF, fl = this.pop(os);
          if (this.pe()) {
            if (this.flags & NT) throw new Fault(13, 0, 'IRET con NT=1 (retorno de tarea) no implementado');
            this.loadCS(cs, ip, 'ret');
          } else {
            const old = this.s[1];
            this.s[1] = segCache(cs, cs << 4, old.limit, 0x9B, 0, true);
            this.ip = ip & 0xFFFF;
          }
          this.setFlagsW(fl, os);
          return;
        }
        case 'hlt':
          this.needPriv('HLT');
          this.halted = true;
          this.event('cpu', 'HLT: el procesador se detiene hasta la próxima interrupción (en este emulador: fin de la ejecución).');
          return;
        case 'clc': this.setF(CF, false); return;
        case 'stc': this.setF(CF, true); return;
        case 'cmc': this.setF(CF, !this.getF(CF)); return;
        case 'cld': this.setF(DF, false); return;
        case 'std': this.setF(DF, true); return;
        case 'cli': case 'sti':
          if (this.pe() && this.cpl() > this.iopl()) throw new Fault(13, 0, `${op.toUpperCase()} requiere CPL ≤ IOPL`);
          this.setF(IF, op === 'sti');
          return;
        case 'cbw': this.setR(16, 0, sx(this.getR(8, 0), 8)); return;
        case 'cwde': this.setR(32, 0, sx(this.getR(16, 0), 16)); return;
        case 'cwd': this.setR(16, 2, (this.getR(16, 0) & 0x8000) ? 0xFFFF : 0); return;
        case 'cdq': this.setR(32, 2, (this.r[0] & 0x80000000) ? 0xFFFFFFFF : 0); return;
        case 'lahf': this.setR(8, 4, (this.flags & 0xD5) | 2); return;
        case 'sahf': this.flags = ((this.flags & ~0xD5) | (this.getR(8, 4) & 0xD5) | 2) >>> 0; return;
        case 'xlat': {
          const base = as === 32 ? this.r[3] : this.r[3] & 0xFFFF;
          this.setR(8, 0, this.rd(ins.seg >= 0 ? ins.seg : 3, ((base + this.getR(8, 0)) & MASK[as]) >>> 0, 1));
          return;
        }
        case 'movs': case 'cmps': case 'stos': case 'lods': case 'scas': return this.strOp(ins);
        case 'in': {
          if (this.pe() && this.cpl() > this.iopl()) throw new Fault(13, 0, 'IN requiere CPL ≤ IOPL');
          const port = b.k === 'i' ? b.v : this.getR(16, 2);
          const v = this.bios ? this.bios.portIn(port, a.size) : MASK[a.size];
          this.put(a, v);
          return;
        }
        case 'out': {
          if (this.pe() && this.cpl() > this.iopl()) throw new Fault(13, 0, 'OUT requiere CPL ≤ IOPL');
          const port = a.k === 'i' ? a.v : this.getR(16, 2);
          if (this.bios) this.bios.portOut(port, this.get(b), b.size);
          return;
        }
        case 'enter': {
          const size = a.v, level = b.v & 31;
          const bpSize = this.stk32() ? 32 : 16;
          this.push(this.getR(os, 5), os, 'ENTER: EBP/BP anterior');
          const frame = this.sp();
          for (let i = 1; i < level; i++) {
            const bp = ((this.getR(bpSize, 5) - (os >> 3)) & MASK[bpSize]) >>> 0;
            this.setR(bpSize, 5, bp);
            this.push(this.rd(2, bp, os >> 3), os, 'ENTER: puntero de marco');
          }
          if (level > 0) this.push(frame, os, 'ENTER: marco');
          this.setR(os, 5, frame);
          this.setSP(this.sp() - size);
          return;
        }
        case 'leave':
          this.setSP(this.stk32() ? this.r[5] : this.r[5] & 0xFFFF);
          this.setR(os, 5, this.pop(os));
          return;
        case 'daa': case 'das': case 'aaa': case 'aas': case 'aam': case 'aad': return this.bcd(op, a);
        // ---------- sistema ----------
        case 'lgdt': case 'lidt': {
          this.needPriv(op.toUpperCase());
          const o = this.ea(a);
          const limit = this.rd(a.seg, o, 2);
          let base = this.rd(a.seg, (o + 2) >>> 0, 4);
          base = os === 32 ? base >>> 0 : base & 0xFFFFFF;
          if (op === 'lgdt') {
            this.gdtr = { base, limit };
            this.event('sys', `LGDT: GDTR ← base=${hex(base, 8)}h, límite=${hex(limit, 4)}h → la GDT tiene ${Math.floor((limit + 1) / 8)} descriptores de 8 bytes`);
          } else {
            this.idtr = { base, limit };
            this.event('sys', `LIDT: IDTR ← base=${hex(base, 8)}h, límite=${hex(limit, 4)}h → ` + (this.pe() ? `${Math.floor((limit + 1) / 8)} compuertas` : `(en modo protegido: ${Math.floor((limit + 1) / 8)} compuertas de 8 bytes; en modo real la IVT se buscaría aquí)`));
          }
          return;
        }
        case 'sgdt': case 'sidt': {
          const t = op === 'sgdt' ? this.gdtr : this.idtr;
          const o = this.ea(a);
          this.wr(a.seg, o, 2, t.limit);
          this.wr(a.seg, (o + 2) >>> 0, 4, os === 32 ? t.base : (t.base & 0xFFFFFF));
          return;
        }
        case 'smsw': this.put(a, this.cr0 & 0xFFFF); return;
        case 'lmsw': {
          this.needPriv('LMSW');
          const v = this.get(a) & 0xF;
          const old = this.cr0;
          this.cr0 = ((this.cr0 & ~0xE) | v | (this.cr0 & 1)) >>> 0;
          if ((old & 1) && !(v & 1)) this.event('sys', 'LMSW no puede apagar PE (como en el 286). En el 386 se vuelve a modo real con MOV CR0.');
          this.modeEvents(old, this.cr0);
          return;
        }
        case 'invlpg': {
          this.needPriv('INVLPG');
          const lin = (this.s[a.seg].base + this.ea(a)) >>> 0;
          const had = this.tlb.delete(lin >>> 12);
          this.event('cr', `INVLPG: se invalida la entrada de la TLB de la página lineal ${hex(lin & 0xFFFFF000, 8)}h` + (this.tlbOn ? (had ? ' (estaba en la TLB)' : ' (no estaba en la TLB)') : ' (la TLB no está simulada)'));
          return;
        }
        case 'clts': this.needPriv('CLTS'); this.cr0 &= ~8; this.cr0 >>>= 0; return;
        case 'sldt': this.needPM('SLDT'); this.put(a, this.ldtr.sel); return;
        case 'str': this.needPM('STR'); this.put(a, this.tr.sel); return;
        case 'lldt': {
          this.needPM('LLDT'); this.needPriv('LLDT');
          const sel = this.get(a);
          if ((sel & 0xFFFC) === 0) { this.ldtr = { sel, base: 0, limit: 0, acc: 0, valid: false }; this.event('sys', 'LDTR ← selector nulo (sin LDT)'); return; }
          if (sel & 4) throw new Fault(13, sel & 0xFFFC, 'El selector de la LDT debe estar en la GDT (TI=0)');
          const d = this.fetchDescriptor(sel);
          if ((d.acc & 0x1F) !== 2) throw new Fault(13, sel & 0xFFFC, `El descriptor ${d.idx} no es de tipo LDT`);
          if (!(d.acc & 0x80)) throw new Fault(11, sel & 0xFFFC, 'La LDT no está presente');
          this.ldtr = { sel, base: d.base, limit: d.limit, acc: d.acc, valid: true };
          this.event('sys', `LLDT: LDTR ← ${hex(sel, 4)}h → LDT en base=${hex(d.base, 8)}h, límite=${hex(d.limit, 4)}h`);
          return;
        }
        case 'ltr': {
          this.needPM('LTR'); this.needPriv('LTR');
          const sel = this.get(a);
          if ((sel & 0xFFFC) === 0 || (sel & 4)) throw new Fault(13, sel & 0xFFFC, 'LTR requiere un selector de la GDT no nulo');
          const d = this.fetchDescriptor(sel);
          const t = d.acc & 0x1F;
          if (t !== 1 && t !== 9) throw new Fault(13, sel & 0xFFFC, `El descriptor ${d.idx} no es un TSS disponible (${EMU.describeAccess(d.acc).txt})`);
          if (!(d.acc & 0x80)) throw new Fault(11, sel & 0xFFFC, 'El TSS no está presente');
          this.wrLin8(d.addr + 5, d.acc | 2);
          this.tr = { sel, base: d.base, limit: d.limit, acc: d.acc | 2, valid: true };
          this.event('sys', `LTR: TR ← ${hex(sel, 4)}h → TSS ${t === 9 ? 'de 386' : 'de 286'} en base=${hex(d.base, 8)}h (el descriptor se marca OCUPADO)`);
          return;
        }
        case 'lar': case 'lsl': case 'verr': case 'verw': {
          this.needPM(op.toUpperCase());
          const sel = op === 'lar' || op === 'lsl' ? this.get(b) : this.get(a);
          const d = (sel & 0xFFFC) ? this.peekDescriptor(sel) : { error: 'nulo' };
          let ok = !d.error;
          if (ok) {
            const dpl = (d.acc >> 5) & 3, conf = (d.acc & 0x1C) === 0x1C;
            if (!conf && dpl < Math.max(this.cpl(), sel & 3)) ok = false;
            const sys = !(d.acc & 0x10), t = d.acc & 15;
            if (op === 'lar' && sys && ![1, 2, 3, 4, 5, 6, 7, 9, 11, 12, 14, 15].includes(t)) ok = false;
            if (op === 'lsl' && sys && ![1, 2, 3, 9, 11].includes(t)) ok = false;
            if (op === 'verr' && (sys || ((d.acc & 8) && !(d.acc & 2)))) ok = false;
            if (op === 'verw' && (sys || (d.acc & 8) || !(d.acc & 2))) ok = false;
          }
          this.setF(ZF, ok);
          if (ok && op === 'lar') this.put(a, a.size === 32 ? ((d.acc << 8) | ((d.gd & 0xF0) << 16)) >>> 0 : (d.acc << 8));
          if (ok && op === 'lsl') this.put(a, d.limit);
          return;
        }
        case 'arpl': {
          this.needPM('ARPL');
          const d = this.get(a), s = this.get(b);
          if ((d & 3) < (s & 3)) { this.put(a, (d & ~3) | (s & 3)); this.setF(ZF, true); }
          else this.setF(ZF, false);
          return;
        }
        case 'bios': {
          if (!this.bios) return;
          const r = this.bios.service(a.v);
          if (r === 'wait') { this.ip = this.curIP; this.waiting = true; }
          return;
        }
      }
      throw new Fault(6, null, `Instrucción no implementada: ${op}`);
    }

    muldiv(op, a) {
      const s = a.size;
      const v = this.get(a);
      if (op === 'mul' || op === 'imul') {
        let lo, hi, over;
        if (s === 32) {
          const A = op === 'mul' ? BigInt(this.r[0]) : BigInt(this.r[0] | 0);
          const B = op === 'mul' ? BigInt(v >>> 0) : BigInt(v | 0);
          const P = BigInt.asUintN(64, A * B);
          lo = Number(P & 0xFFFFFFFFn); hi = Number(P >> 32n);
          over = op === 'mul' ? hi !== 0 : BigInt.asIntN(64, P) !== BigInt(lo | 0);
          this.setR(32, 0, lo); this.setR(32, 2, hi);
        } else {
          const acc = this.getR(s, 0);
          const p = op === 'mul' ? acc * v : sx(acc, s) * sx(v, s);
          const m = MASK[s];
          lo = p & m;
          hi = Math.floor(p / (m + 1)) & m;
          over = op === 'mul' ? hi !== 0 : sx(lo, s) !== p;
          if (s === 8) this.setR(16, 0, (hi << 8) | lo);
          else { this.setR(16, 0, lo); this.setR(16, 2, hi); }
        }
        this.setF(CF, over); this.setF(OF, over);
        return;
      }
      if (v === 0) throw new Fault(0, null, `División por cero: el divisor (${EMU.formatOperand(a, false)}) vale 0`);
      if (s === 32) {
        const N = (BigInt(this.r[2]) << 32n) | BigInt(this.r[0]);
        let q, r;
        if (op === 'div') { q = N / BigInt(v >>> 0); r = N % BigInt(v >>> 0); if (q > 0xFFFFFFFFn) throw new Fault(0, null, 'Desbordamiento de división: el cociente no entra en EAX'); }
        else {
          const Ns = BigInt.asIntN(64, N), D = BigInt(v | 0);
          q = Ns / D; r = Ns % D;
          if (q > 0x7FFFFFFFn || q < -0x80000000n) throw new Fault(0, null, 'Desbordamiento de división: el cociente no entra en EAX');
        }
        this.setR(32, 0, Number(BigInt.asUintN(32, q))); this.setR(32, 2, Number(BigInt.asUintN(32, r)));
        return;
      }
      const m = MASK[s];
      let n = s === 8 ? this.getR(16, 0) : (this.getR(16, 2) * 65536 + this.getR(16, 0));
      let q, r;
      if (op === 'div') {
        q = Math.floor(n / v); r = n % v;
        if (q > m) throw new Fault(0, null, `Desbordamiento de división: el cociente ${hex(q)}h no entra en ${s === 8 ? 'AL' : 'AX'}`);
      } else {
        n = s === 8 ? sx(n, 16) : (n | 0);
        const d = sx(v, s);
        q = Math.trunc(n / d); r = n - q * d;
        const lim = SIGN[s];
        if (q >= lim || q < -lim) throw new Fault(0, null, `Desbordamiento de división: el cociente ${q} no entra en ${s === 8 ? 'AL' : 'AX'}`);
      }
      if (s === 8) this.setR(16, 0, ((r & 0xFF) << 8) | (q & 0xFF));
      else { this.setR(16, 0, q & 0xFFFF); this.setR(16, 2, r & 0xFFFF); }
    }

    imulN(a, b, c) {
      const s = a.size;
      const x = sx(this.get(b), s);
      const y = c ? sx(this.get(c), s) : sx(this.get(a), s);
      let res, over;
      if (s === 32) {
        const P = BigInt(x) * BigInt(y);
        res = Number(BigInt.asUintN(32, P));
        over = BigInt.asIntN(32, P) !== P;
      } else {
        const p = x * y;
        res = p & 0xFFFF;
        over = sx(res, 16) !== p;
      }
      this.put(a, res);
      this.setF(CF, over); this.setF(OF, over);
    }

    shxd(op, a, b, c) {
      const s = a.size, cnt = this.get(c) & 31;
      if (!cnt) return;
      const d = BigInt(this.get(a) >>> 0), src = BigInt(this.get(b) >>> 0), S = BigInt(s), n = BigInt(cnt);
      const m = (1n << S) - 1n;
      let r, cf;
      if (op === 'shld') { const w = (d << S) | src; r = (w << n) >> S & m; cf = (d >> (S - n)) & 1n; }
      else { const w = (src << S) | d; r = (w >> n) & m; cf = (d >> (n - 1n)) & 1n; }
      const res = Number(r);
      this.put(a, res);
      this.setF(CF, cf === 1n);
      this.setF(OF, ((res ^ Number(d)) & SIGN[s]) !== 0);
      this.szp(res, s);
    }

    bitTest(op, a, b) {
      const s = a.size;
      let bit, v, loc = a;
      if (b.k === 'i') bit = b.v & (s - 1);
      else if (a.k === 'r') bit = this.get(b) & (s - 1);
      else {
        // con un operando de memoria, el desplazamiento de bit puede salirse del operando
        const off = sx(this.get(b), b.size);
        const unit = Math.floor(off / s);
        bit = off - unit * s;
        loc = { ...a, disp: ((a.disp + unit * (s >> 3)) & (a.a32 ? 0xFFFFFFFF : 0xFFFF)) >>> 0 };
      }
      v = this.get(loc);
      const was = (v >>> bit) & 1;
      this.setF(CF, was === 1);
      if (op === 'bt') return;
      const mask = (1 << bit) >>> 0;
      const nv = op === 'bts' ? (v | mask) : op === 'btr' ? (v & ~mask) : (v ^ mask);
      this.put(loc, nv >>> 0);
    }

    strOp(ins) {
      const s = ins.size, n = s >> 3;
      const rep = ins.rep, as = ins.asize, am = MASK[as];
      if (rep && this.cReg(as) === 0) return;
      const d = this.getF(DF) ? -n : n;
      const srcSeg = ins.seg >= 0 ? ins.seg : 3;
      const si = as === 32 ? this.r[6] : this.r[6] & 0xFFFF, di = as === 32 ? this.r[7] : this.r[7] & 0xFFFF;
      const setSI = (v) => this.setR(as, 6, (v & am) >>> 0), setDI = (v) => this.setR(as, 7, (v & am) >>> 0);
      switch (ins.op) {
        case 'movs': this.wr(0, di, n, this.rd(srcSeg, si, n)); setSI(si + d); setDI(di + d); break;
        case 'stos': this.wr(0, di, n, this.getR(s, 0)); setDI(di + d); break;
        case 'lods': this.setR(s, 0, this.rd(srcSeg, si, n)); setSI(si + d); break;
        case 'cmps': this.alu('cmp', this.rd(srcSeg, si, n), this.rd(0, di, n), s); setSI(si + d); setDI(di + d); break;
        case 'scas': this.alu('cmp', this.getR(s, 0), this.rd(0, di, n), s); setDI(di + d); break;
      }
      if (rep) {
        const cx = ((this.cReg(as) - 1) & am) >>> 0;
        this.setCReg(as, cx);
        let again = cx !== 0;
        if (ins.op === 'cmps' || ins.op === 'scas') again = again && (rep === 3 ? this.getF(ZF) : !this.getF(ZF));
        if (again) this.ip = this.curIP; // se repite la misma instrucción (una iteración por paso)
      }
    }

    bcd(op, a) {
      let al = this.getR(8, 0), ah = this.getR(8, 4);
      switch (op) {
        case 'daa': case 'das': {
          const oldAl = al, oldCf = this.getF(CF);
          let cf = false;
          if ((al & 0xF) > 9 || this.getF(AF)) { al = op === 'daa' ? al + 6 : al - 6; cf = oldCf || al > 0xFF || al < 0; this.setF(AF, true); } else this.setF(AF, false);
          if (oldAl > 0x99 || oldCf) { al = op === 'daa' ? al + 0x60 : al - 0x60; cf = true; }
          al &= 0xFF;
          this.setF(CF, cf); this.setR(8, 0, al); this.szp(al, 8);
          return;
        }
        case 'aaa': case 'aas':
          if ((al & 0xF) > 9 || this.getF(AF)) {
            if (op === 'aaa') { this.setR(16, 0, this.getR(16, 0) + 0x106); }
            else { this.setR(16, 0, this.getR(16, 0) - 6); this.setR(8, 4, this.getR(8, 4) - 1); }
            this.setF(AF, true); this.setF(CF, true);
          } else { this.setF(AF, false); this.setF(CF, false); }
          this.setR(8, 0, this.getR(8, 0) & 0xF);
          return;
        case 'aam': {
          const base = a.v;
          if (base === 0) throw new Fault(0, null, 'AAM con base 0');
          this.setR(8, 4, Math.floor(al / base)); this.setR(8, 0, al % base); this.szp(al % base, 8);
          return;
        }
        case 'aad': {
          const r = (al + ah * a.v) & 0xFF;
          this.setR(16, 0, r); this.szp(r, 8);
          return;
        }
      }
    }

    // ---------------- ayudas para la interfaz --------------------------
    explainSeg(si, off) {
      const s = this.s[si];
      return this.explainWithCache(s, off, SN[si]);
    }
    explainWithCache(s, off, name) {
      off >>>= 0;
      const r = { name, sel: s.sel, off, base: s.base, limit: s.limit, acc: s.acc, pe: this.pe(), valid: s.valid };
      if (this.pe() && !s.valid) { r.error = 'Selector nulo'; return r; }
      r.lin = (s.base + off) >>> 0;
      if (this.pe() && s.valid) {
        const expDown = !(s.acc & 8) && (s.acc & 4);
        r.inLimit = expDown ? off > s.limit : off <= s.limit;
      } else r.inLimit = off <= s.limit;
      r.walk = this.walk(r.lin);
      return r;
    }
    // traduce un selector:offset leyendo el descriptor de la GDT/LDT (sin usar la caché)
    explainSelector(sel, off) {
      if (!this.pe()) {
        return this.explainWithCache({ sel, base: (sel << 4) >>> 0, limit: 0xFFFF, acc: 0x93, valid: true }, off, 'seg');
      }
      if ((sel & 0xFFFC) === 0) return { error: 'Selector nulo', sel, off };
      const d = this.peekDescriptor(sel);
      if (d.error) return { error: d.error, sel, off };
      const r = this.explainWithCache({ sel, base: d.base, limit: d.limit, acc: d.acc, gd: d.gd, valid: true }, off, 'sel');
      r.desc = d;
      return r;
    }
  }

  EMU.CPU = CPU;
  EMU.FLAGS = { CF, PF, AF, ZF, SF, TF, IF, DF, OF, NT, RF, VM };
})(window.EMU);
