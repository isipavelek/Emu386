/* =====================================================================
 *  EMU386 - BIOS / DOS mínimos simulados
 *  La ROM (F000:0000) contiene para cada vector n un "stub":
 *      F000:n*4   BIOS n     (0F FF n: instrucción especial del emulador)
 *                 IRET
 *  y la IVT (0000:0000) apunta cada vector a su stub. Así el alumno ve
 *  el mecanismo real: INT → IVT → CS:IP de la rutina → IRET.
 * ===================================================================== */
'use strict';
(function (EMU) {
  const hex = EMU.hex;
  const BDA_COL = 0x450, BDA_ROW = 0x451;

  class Bios {
    constructor(cpu) {
      this.cpu = cpu;
      cpu.bios = this;
      this.keys = [];
      this.line = null;
      this.rom = null;
    }

    romSource() {
      const L = ['; ROM BIOS simulada: un stub de 4 bytes por vector', 'org 0'];
      for (let n = 0; n < 256; n++) L.push(`bios_${hex(n, 2)}: bios ${n}`, '        iret');
      return L.join('\n');
    }

    install() {
      const c = this.cpu;
      if (!this.rom) this.rom = EMU.assemble([{ name: 'bios', text: this.romSource() }], { allowBios: true });
      c.romWritable = true;
      for (const [a, b] of this.rom.image) c.mem[EMU.BIOS_BASE + a] = b;
      c.romWritable = false;
      for (let n = 0; n < 256; n++) {
        c.mem[n * 4] = (n * 4) & 0xFF;
        c.mem[n * 4 + 1] = (n * 4) >> 8;
        c.mem[n * 4 + 2] = EMU.BIOS_SEG & 0xFF;
        c.mem[n * 4 + 3] = EMU.BIOS_SEG >> 8;
      }
      for (let i = 0; i < 2000; i++) { c.mem[EMU.VIDEO_BASE + i * 2] = 0x20; c.mem[EMU.VIDEO_BASE + i * 2 + 1] = 0x07; }
      c.mem[BDA_COL] = 0; c.mem[BDA_ROW] = 0;
      this.keys = [];
      this.line = null;
      c.videoDirty = true;
    }

    isDefaultVector(n, seg, off) { return seg === EMU.BIOS_SEG && off === n * 4; }

    // ---------------- video --------------------------------------------
    cursor() { return { row: this.cpu.mem[BDA_ROW], col: this.cpu.mem[BDA_COL] }; }
    setCursor(row, col) { this.cpu.pw8(BDA_ROW, row); this.cpu.pw8(BDA_COL, col); }
    cell(row, col, ch, attr) {
      const a = EMU.VIDEO_BASE + (row * 80 + col) * 2;
      this.cpu.pw8(a, ch);
      if (attr !== undefined && attr !== null) this.cpu.pw8(a + 1, attr);
    }
    scroll(lines, attr, top, left, bottom, right, down) {
      top = top || 0; left = left || 0; bottom = bottom === undefined ? 24 : bottom; right = right === undefined ? 79 : right;
      const h = bottom - top + 1;
      if (!lines || lines >= h) lines = h;
      const m = this.cpu.mem;
      const rows = [];
      for (let r = top; r <= bottom; r++) rows.push(r);
      if (down) rows.reverse();
      for (const r of rows) {
        const src = down ? r - lines : r + lines;
        for (let col = left; col <= right; col++) {
          if ((down && src >= top) || (!down && src <= bottom)) {
            const s = EMU.VIDEO_BASE + (src * 80 + col) * 2;
            this.cell(r, col, m[s], m[s + 1]);
          } else this.cell(r, col, 0x20, attr);
        }
      }
    }
    tty(ch, attr) {
      let { row, col } = this.cursor();
      if (ch === 13) col = 0;
      else if (ch === 10) row++;
      else if (ch === 8) { if (col > 0) col--; }
      else if (ch === 7) { /* campana */ }
      else {
        this.cell(row, col, ch, attr === undefined ? 0x07 : attr);
        col++;
        if (col >= 80) { col = 0; row++; }
      }
      if (row >= 25) { this.scroll(1, 0x07); row = 24; }
      this.setCursor(row, col);
    }
    print(str, attr) { for (const ch of Array.from(str)) this.tty(EMU.toCP437(ch), attr); }

    // Modifica un bit de FLAGS en la pila (el IRET del stub lo restaurará)
    setRetFlag(mask, on) {
      const c = this.cpu;
      const off = (c.sp() + 4) & 0xFFFF;
      let f = c.rd(2, off, 2);
      f = on ? (f | mask) : (f & ~mask);
      c.wr(2, off, 2, f);
    }

    fatal(msg) {
      const c = this.cpu;
      let where = '';
      try {
        const ip = c.rd(2, c.sp(), 2), cs = c.rd(2, (c.sp() + 2) & 0xFFFF, 2);
        where = ` en ${hex(cs, 4)}:${hex(ip, 4)}`;
      } catch (e) { /* pila inválida */ }
      this.print(`\r\n*** ${msg}${where} ***\r\n`, 0x4F);
      c.halted = true;
      c.event('bios', `La rutina de la BIOS para esta excepción mostró un mensaje y detuvo el programa: ${msg}${where}. (Puede instalar su propio manejador escribiendo en la IVT.)`);
    }

    // ---------------- servicios -----------------------------------------
    service(n) {
      const c = this.cpu;
      switch (n) {
        case 0x00: return this.fatal('Division por cero (INT 0 / #DE)');
        case 0x01: return;
        case 0x03:
          c.pauseRequest = 'INT 3: punto de ruptura por software';
          c.event('bios', 'INT 3: punto de ruptura. El depurador detiene la ejecución.');
          return;
        case 0x04: return this.fatal('Desbordamiento (INTO / #OF)');
        case 0x05: return this.fatal('Rango excedido (#BR)');
        case 0x06: return this.fatal('Codigo de operacion invalido (#UD)');
        case 0x07: return this.fatal('Coprocesador no disponible (#NM)');
        case 0x08: return this.fatal('Doble falta (#DF)');
        case 0x0C: return this.fatal('Falla de pila (#SS)');
        case 0x0D: return this.fatal('Proteccion general (#GP): acceso que cruza el final del segmento');
        case 0x10: return this.int10();
        case 0x16: return this.int16();
        case 0x20: return this.terminate(0);
        case 0x21: return this.int21();
        default:
          c.event('bios', `INT ${hex(n, 2)}h: la BIOS de este emulador no tiene servicio para este vector (su rutina solo hace IRET).`);
      }
    }

    terminate(code) {
      const c = this.cpu;
      c.halted = true;
      c.finished = true;
      c.event('cpu', `Programa terminado (código de salida ${code}).`);
    }

    readKey() { return this.keys.length ? this.keys.shift() : null; }

    int10() {
      const c = this.cpu, ah = c.getR(8, 4), al = c.getR(8, 0);
      switch (ah) {
        case 0x00: this.scroll(0, 0x07); this.setCursor(0, 0); return;
        case 0x02: this.setCursor(Math.min(24, c.getR(8, 6)), Math.min(79, c.getR(8, 2))); return;
        case 0x03: { const k = this.cursor(); c.setR(8, 6, k.row); c.setR(8, 2, k.col); c.setR(16, 1, 0x0607); return; }
        case 0x06: case 0x07:
          this.scroll(al, c.getR(8, 7), c.getR(8, 5), c.getR(8, 1), Math.min(24, c.getR(8, 6)), Math.min(79, c.getR(8, 2)), ah === 7);
          return;
        case 0x08: { const k = this.cursor(); const a = EMU.VIDEO_BASE + (k.row * 80 + k.col) * 2; c.setR(8, 0, c.mem[a]); c.setR(8, 4, c.mem[a + 1]); return; }
        case 0x09: case 0x0A: {
          const k = this.cursor();
          let pos = k.row * 80 + k.col;
          for (let i = 0; i < c.getR(16, 1) && pos < 2000; i++, pos++) this.cell(Math.floor(pos / 80), pos % 80, al, ah === 9 ? c.getR(8, 3) : null);
          return;
        }
        case 0x0E: this.tty(al); return;
        case 0x0F: c.setR(8, 0, 3); c.setR(8, 4, 80); c.setR(8, 7, 0); return;
        case 0x13: {
          const len = c.getR(16, 1), bp = c.getR(16, 5);
          const save = this.cursor();
          this.setCursor(c.getR(8, 6), c.getR(8, 2));
          for (let i = 0; i < len; i++) this.tty(c.rd(0, bp + i, 1), c.getR(8, 3));
          if (!(al & 1)) this.setCursor(save.row, save.col);
          return;
        }
        default: c.event('bios', `INT 10h: función AH=${hex(ah, 2)}h no implementada`);
      }
    }

    int16() {
      const c = this.cpu, ah = c.getR(8, 4);
      if (ah === 0x00 || ah === 0x10) {
        const k = this.readKey();
        if (!k) return 'wait';
        c.setR(8, 0, k.ascii); c.setR(8, 4, k.scan);
        return;
      }
      if (ah === 0x01 || ah === 0x11) {
        if (this.keys.length) { c.setR(8, 0, this.keys[0].ascii); c.setR(8, 4, this.keys[0].scan); this.setRetFlag(EMU.FLAGS.ZF, false); }
        else this.setRetFlag(EMU.FLAGS.ZF, true);
        return;
      }
      c.event('bios', `INT 16h: función AH=${hex(ah, 2)}h no implementada`);
    }

    int21() {
      const c = this.cpu, ah = c.getR(8, 4), al = c.getR(8, 0);
      switch (ah) {
        case 0x00: return this.terminate(0);
        case 0x01: { const k = this.readKey(); if (!k) return 'wait'; this.tty(k.ascii); if (k.ascii === 13) this.tty(10); c.setR(8, 0, k.ascii); return; }
        case 0x02: this.tty(c.getR(8, 2)); c.setR(8, 0, c.getR(8, 2)); return;
        case 0x06: {
          const dl = c.getR(8, 2);
          if (dl !== 0xFF) { this.tty(dl); return; }
          const k = this.readKey();
          if (k) { c.setR(8, 0, k.ascii); this.setRetFlag(EMU.FLAGS.ZF, false); } else { c.setR(8, 0, 0); this.setRetFlag(EMU.FLAGS.ZF, true); }
          return;
        }
        case 0x07: case 0x08: { const k = this.readKey(); if (!k) return 'wait'; c.setR(8, 0, k.ascii); return; }
        case 0x09: {
          let off = c.getR(16, 2);
          for (let i = 0; i < 4000; i++) {
            const ch = c.rd(3, off, 1);
            if (ch === 0x24) return; // '$'
            this.tty(ch);
            off = (off + 1) & 0xFFFF;
          }
          c.event('bios', 'INT 21h/09h: no se encontró el terminador \'$\' en 4000 caracteres');
          return;
        }
        case 0x0A: {
          const buf = c.getR(16, 2);
          const max = c.rd(3, buf, 1);
          if (!this.line) this.line = [];
          let k;
          while ((k = this.readKey())) {
            if (k.ascii === 13) {
              for (let i = 0; i < this.line.length; i++) c.wr(3, buf + 2 + i, 1, this.line[i]);
              c.wr(3, buf + 2 + this.line.length, 1, 13);
              c.wr(3, buf + 1, 1, this.line.length);
              this.tty(13); this.tty(10);
              this.line = null;
              return;
            }
            if (k.ascii === 8) { if (this.line.length) { this.line.pop(); this.tty(8); this.tty(32); this.tty(8); } continue; }
            if (this.line.length < max - 1 && k.ascii >= 32) { this.line.push(k.ascii); this.tty(k.ascii); }
          }
          return 'wait';
        }
        case 0x25: {
          const v = al * 4;
          c.pw16(v, c.getR(16, 2)); c.pw16(v + 2, c.s[3].sel);
          c.event('bios', `INT 21h/25h: vector ${hex(al, 2)}h ← ${hex(c.s[3].sel, 4)}:${hex(c.getR(16, 2), 4)} (se escribió la IVT en 0000:${hex(v, 4)})`);
          return;
        }
        case 0x2A: { const d = new Date(); c.setR(16, 1, d.getFullYear()); c.setR(8, 6, d.getMonth() + 1); c.setR(8, 2, d.getDate()); c.setR(8, 0, d.getDay()); return; }
        case 0x2C: { const d = new Date(); c.setR(8, 5, d.getHours()); c.setR(8, 1, d.getMinutes()); c.setR(8, 6, d.getSeconds()); c.setR(8, 2, Math.floor(d.getMilliseconds() / 10)); return; }
        case 0x30: c.setR(16, 0, 0x0005); return;
        case 0x35: { const v = al * 4; c.setR(16, 3, c.pr16(v)); c.loadSeg(0, c.pr16(v + 2)); return; }
        case 0x4C: return this.terminate(al);
        default: c.event('bios', `INT 21h: función AH=${hex(ah, 2)}h no implementada en este emulador`);
      }
    }

    portIn(port, size) {
      if (port === 0x60) { const k = this.keys[0]; return k ? k.scan : 0; }
      if (port === 0x64) return this.keys.length ? 1 : 0;
      this.cpu.event('io', `IN desde el puerto ${hex(port, 4)}h: no hay dispositivo conectado (se lee ${size === 8 ? 'FFh' : 'FFFFh'})`);
      return size === 8 ? 0xFF : 0xFFFF;
    }
    portOut(port, v, size) {
      if (port === 0xE9) { this.tty(v & 0xFF); return; }
      this.cpu.event('io', `OUT al puerto ${hex(port, 4)}h ← ${hex(v, size / 4)}h (sin dispositivo conectado)`);
    }

    pushKey(ascii, scan) { this.keys.push({ ascii: ascii & 0xFF, scan: scan & 0xFF }); if (this.keys.length > 64) this.keys.shift(); }
  }

  EMU.Bios = Bios;
})(window.EMU);
