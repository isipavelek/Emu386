/* =====================================================================
 *  EMU386 - utilidades y constantes compartidas
 * ===================================================================== */
'use strict';
window.EMU = window.EMU || {};

(function (EMU) {
  // ---- Mapa de memoria de la máquina virtual -------------------------
  EMU.MEM_SIZE   = 0x1000000;   // 16 MB de RAM simulada (el 386 direcciona 4 GB con 32 bits; aquí la física se recorta a 24 bits)
  EMU.PHYS_MASK  = 0xFFFFFF;
  EMU.PROG_SEG   = 0x1000;      // segmento donde se carga el programa
  EMU.PROG_BASE  = 0x10000;     // dirección física/lineal de carga
  EMU.STACK_SEG  = 0x9000;      // segmento de pila inicial (modo real)
  EMU.BIOS_SEG   = 0xF000;      // ROM BIOS simulada
  EMU.BIOS_BASE  = 0xF0000;
  EMU.VIDEO_BASE = 0xB8000;     // memoria de video de texto 80x25
  EMU.VIDEO_SIZE = 80 * 25 * 2;

  EMU.hex = function (v, n) {
    v = Number(v);
    if (!isFinite(v)) return '?';
    return (v >>> 0).toString(16).toUpperCase().padStart(n || 1, '0');
  };
  EMU.hexs = function (v, n) { return EMU.hex(v, n) + 'h'; };
  EMU.bin = function (v, n) { return (v >>> 0).toString(2).padStart(n, '0'); };

  EMU.escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  // ---- Excepciones del procesador -----------------------------------
  EMU.Fault = class Fault {
    constructor(vec, code, msg) {
      this.vec = vec;
      this.code = (code === undefined || code === null) ? 0 : code & 0xFFFF;
      this.msg = msg || '';
    }
  };

  EMU.EXC_NAMES = {
    0: ['#DE', 'División por cero / desbordamiento de división'],
    1: ['#DB', 'Depuración (paso a paso)'],
    2: ['NMI', 'Interrupción no enmascarable'],
    3: ['#BP', 'Punto de ruptura (INT 3)'],
    4: ['#OF', 'Desbordamiento (INTO)'],
    5: ['#BR', 'Rango excedido (BOUND)'],
    6: ['#UD', 'Código de operación inválido'],
    7: ['#NM', 'Coprocesador no disponible'],
    8: ['#DF', 'Doble falta'],
    9: ['--', 'Desborde de segmento del coprocesador'],
    10: ['#TS', 'TSS inválido'],
    11: ['#NP', 'Segmento no presente'],
    12: ['#SS', 'Falla de pila'],
    13: ['#GP', 'Protección general'],
    14: ['#PF', 'Falla de página'],
    16: ['#MF', 'Error de coma flotante'],
    17: ['#AC', 'Alineación'],
  };
  EMU.excName = function (v) {
    const e = EMU.EXC_NAMES[v];
    return e ? `${e[0]} (${v}) ${e[1]}` : `Vector ${v}`;
  };
  EMU.hasErrorCode = function (v) { return v === 8 || (v >= 10 && v <= 14) || v === 17; };

  // ---- Juego de caracteres CP437 (el de la PC original) ---------------
  const CP437_LOW = ' ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼';
  const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
  EMU.CP437 = [];
  for (let i = 0; i < 256; i++) {
    if (i < 32) EMU.CP437.push(Array.from(CP437_LOW)[i] || ' ');
    else if (i < 127) EMU.CP437.push(String.fromCharCode(i));
    else if (i === 127) EMU.CP437.push('⌂');
    else EMU.CP437.push(Array.from(CP437_HIGH)[i - 128] || '?');
  }
  EMU.CP437[0] = ' ';
  const REV = new Map();
  for (let i = 32; i < 256; i++) if (!REV.has(EMU.CP437[i])) REV.set(EMU.CP437[i], i);
  // Convierte un carácter Unicode al código CP437 (para DB 'año', etc.)
  EMU.toCP437 = function (ch) {
    const c = ch.codePointAt(0);
    if (c < 128) return c;
    if (REV.has(ch)) return REV.get(ch);
    return 0x3F; // '?'
  };
  EMU.charOf = function (b) { return EMU.CP437[b & 0xFF]; };
  EMU.asciiOf = function (b) { return (b >= 32 && b < 127) ? String.fromCharCode(b) : (b >= 128 ? EMU.CP437[b] : '·'); };

  EMU.REG8_NAMES = ['AL', 'CL', 'DL', 'BL', 'AH', 'CH', 'DH', 'BH'];
  EMU.REG16_NAMES = ['AX', 'CX', 'DX', 'BX', 'SP', 'BP', 'SI', 'DI'];
  EMU.REG32_NAMES = ['EAX', 'ECX', 'EDX', 'EBX', 'ESP', 'EBP', 'ESI', 'EDI'];
  EMU.SREG_NAMES = ['ES', 'CS', 'SS', 'DS', 'FS', 'GS'];
  EMU.CC_NAMES = ['O', 'NO', 'B', 'AE', 'E', 'NE', 'BE', 'A', 'S', 'NS', 'P', 'NP', 'L', 'GE', 'LE', 'G'];

  // Descripción de un byte de derechos de acceso de un descriptor
  EMU.describeAccess = function (acc) {
    const p = (acc >> 7) & 1, dpl = (acc >> 5) & 3, s = (acc >> 4) & 1, type = acc & 15;
    let txt;
    if (s) {
      if (type & 8) {
        txt = 'Código ' + ((type & 2) ? 'ejecutable/legible' : 'solo ejecutable') + ((type & 4) ? ', conforme' : '');
      } else {
        txt = 'Datos ' + ((type & 2) ? 'lectura/escritura' : 'solo lectura') + ((type & 4) ? ', expande hacia abajo' : '');
      }
      txt += (type & 1) ? ' (accedido)' : '';
    } else {
      txt = ({
        0: 'Reservado', 1: 'TSS 286 disponible', 2: 'LDT', 3: 'TSS 286 ocupado', 4: 'Compuerta de llamada 286',
        5: 'Compuerta de tarea', 6: 'Compuerta de interrupción 286', 7: 'Compuerta de trampa 286',
        8: 'Reservado', 9: 'TSS 386 disponible', 10: 'Reservado', 11: 'TSS 386 ocupado',
        12: 'Compuerta de llamada 386', 13: 'Reservado', 14: 'Compuerta de interrupción 386', 15: 'Compuerta de trampa 386',
      })[type];
    }
    return { p, dpl, s, type, txt };
  };

  EMU.parseDescriptor = function (b) {
    const limitRaw = b[0] | (b[1] << 8) | ((b[6] & 0x0F) << 16);
    const base = (b[2] | (b[3] << 8) | (b[4] << 16) | (b[7] << 24)) >>> 0;
    const acc = b[5];
    const gd = b[6] & 0xF0;
    const limit = (gd & 0x80) ? ((limitRaw * 4096) + 0xFFF) >>> 0 : limitRaw;
    return { base, limit, limitRaw, acc, gd, bytes: Array.from(b) };
  };
})(window.EMU);
