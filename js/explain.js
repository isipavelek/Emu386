/* =====================================================================
 *  EMU386 - Explicación en lenguaje natural de cada paso + glosario
 * ===================================================================== */
'use strict';
(function (EMU) {
  const hex = EMU.hex, esc = EMU.escapeHtml;
  const F = EMU.FLAGS;
  const MASK = { 8: 0xFF, 16: 0xFFFF, 32: 0xFFFFFFFF };

  // ------------------------------------------------------------------
  //  Glosario (se muestra al pasar el mouse por los términos subrayados)
  // ------------------------------------------------------------------
  EMU.GLOSSARY = {
    logica: ['Dirección lógica', 'La que usa el programa: segmento (o selector) + desplazamiento, por ejemplo DS:0010h. El CPU la convierte en lineal con la segmentación.'],
    lineal: ['Dirección lineal', 'Resultado de la segmentación: base del segmento + desplazamiento. Sin paginación, es la dirección física. Con paginación, se traduce con las tablas de páginas.'],
    fisica: ['Dirección física', 'La que sale por el bus de direcciones hacia la memoria RAM. El 80386 tiene 32 líneas de dirección (4 GB; el 286 tenía 24: 16 MB). Este emulador simula 16 MB de RAM.'],
    bitd: ['Bit D (Default size)', 'Bit del descriptor de un segmento de CÓDIGO: D=0 → operandos y direcciones de 16 bits por defecto (como el 286); D=1 → de 32 bits (EAX, [EBX+ESI*4], EIP). Los prefijos 66h y 67h invierten el tamaño en una instrucción.'],
    bitb: ['Bit B (Big)', 'En un segmento de PILA: B=1 → PUSH/POP usan ESP (32 bits); B=0 → usan SP.'],
    bitg: ['Bit G (Granularity)', 'G=0: el límite de 20 bits se cuenta en bytes (hasta 1 MB). G=1: se cuenta en páginas de 4 KB (hasta 4 GB).'],
    sib: ['Byte SIB (Scale-Index-Base)', 'Byte extra del 386 para direcciones de 32 bits: permite [base + índice × escala + desplazamiento], con escala 1, 2, 4 u 8. Ideal para recorrer arreglos: [EBX+ESI*4].'],
    prefijo: ['Prefijos 66h y 67h', '66h cambia el tamaño del OPERANDO (16 ↔ 32 bits) y 67h el tamaño de la DIRECCIÓN, solo para esa instrucción. Así el código de 16 bits puede usar EAX y el de 32 bits puede usar AX.'],
    plano: ['Modelo plano (flat)', 'Segmentos con base 0 y límite 4 GB: el desplazamiento coincide con la dirección lineal y la segmentación "desaparece". Es el modelo que usan Windows y Linux en 32 bits.'],
    segmento: ['Segmento', 'Región de memoria de hasta 64 KB definida por una base. En modo real la base es el valor del registro × 16; en modo protegido la base, el límite y los permisos salen de un descriptor.'],
    desplazamiento: ['Desplazamiento (offset)', 'Distancia en bytes desde el comienzo del segmento. En 16 bits va de 0000h a FFFFh.'],
    selector: ['Selector', 'Valor que se carga en un registro de segmento en modo protegido. Tiene 3 partes: índice (13 bits: número de descriptor), TI (0 = GDT, 1 = LDT) y RPL (2 bits: nivel de privilegio pedido).'],
    indice: ['Índice', 'Bits 15..3 del selector: número de descriptor dentro de la GDT o la LDT. La dirección del descriptor es base de la tabla + índice × 8.'],
    ti: ['TI (Table Indicator)', 'Bit 2 del selector: 0 = buscar el descriptor en la GDT, 1 = en la LDT.'],
    rpl: ['RPL (Requested Privilege Level)', 'Bits 1..0 del selector: nivel de privilegio con que se pide el acceso (0 = máximo, 3 = mínimo).'],
    descriptor: ['Descriptor de segmento', 'Estructura de 8 bytes en la GDT/LDT que describe un segmento: base (32 bits en el 386, 24 en el 286), límite (20 bits + G en el 386, 16 en el 286), derechos de acceso (presente, DPL, tipo) y los bits D/B y G.'],
    cache: ['Caché del descriptor (parte oculta)', 'Cada registro de segmento tiene una parte invisible donde el CPU copia base, límite y derechos al cargar el selector. Así no vuelve a leer la GDT en cada acceso.'],
    gdt: ['GDT (Global Descriptor Table)', 'Tabla global de descriptores: vector de descriptores de 8 bytes en memoria. El descriptor 0 debe ser nulo. GDTR indica dónde está.'],
    gdtr: ['GDTR', 'Registro que guarda la base LINEAL y el límite (tamaño − 1) de la GDT. Se carga con LGDT.'],
    idt: ['IDT (Interrupt Descriptor Table)', 'En modo protegido reemplaza a la IVT: por cada vector hay una compuerta de 8 bytes con el selector y el offset del manejador.'],
    idtr: ['IDTR', 'Registro con la base lineal y el límite de la IDT (o de la IVT en modo real). Se carga con LIDT.'],
    ivt: ['IVT (tabla de vectores de interrupción)', 'En modo real, en la dirección física 0: 256 vectores de 4 bytes (offset y segmento del manejador). Vector n → dirección n × 4.'],
    compuerta: ['Compuerta (gate)', 'Descriptor de sistema que indica a qué código saltar. Las compuertas de interrupción (tipo 6) ponen IF=0; las de trampa (tipo 7) no.'],
    ldt: ['LDT (Local Descriptor Table)', 'Tabla de descriptores propia de cada tarea. Se usa con selectores con TI=1. LDTR contiene un selector de la GDT que la describe.'],
    tss: ['TSS (Task State Segment)', 'Segmento donde el CPU guarda el estado de una tarea y las pilas de cada nivel de privilegio. TR apunta al TSS actual.'],
    cpl: ['CPL (Current Privilege Level)', 'Nivel de privilegio del código que se está ejecutando: los 2 bits bajos de CS. 0 = sistema operativo, 3 = aplicaciones.'],
    dpl: ['DPL (Descriptor Privilege Level)', 'Nivel de privilegio que exige un descriptor. Para acceder a datos se requiere max(CPL, RPL) ≤ DPL.'],
    limite: ['Límite', 'Último desplazamiento válido del segmento. Acceder más allá provoca #GP (o #SS en la pila).'],
    base: ['Base', 'Dirección lineal donde comienza el segmento.'],
    cr0: ['CR0', 'Registro de control. Bit 0 PE = modo protegido; bit 31 PG = paginación (386). Su parte baja (16 bits) es la MSW del 80286.'],
    msw: ['MSW (Machine Status Word)', 'Registro de estado del 80286 (PE, MP, EM, TS). En el 386 es la parte baja de CR0. Se lee con SMSW y se escribe con LMSW.'],
    cr2: ['CR2', 'Guarda la dirección LINEAL que provocó la última falla de página (#PF).'],
    cr3: ['CR3', 'Guarda la dirección FÍSICA del directorio de páginas. Escribirlo vacía la TLB.'],
    pde: ['PDE (entrada del directorio)', 'Entrada de 4 bytes del directorio de páginas: dirección física de una tabla de páginas + bits P, R/W, U/S, A.'],
    pte: ['PTE (entrada de tabla de páginas)', 'Entrada de 4 bytes: dirección física del marco + bits P (presente), R/W, U/S, A (accedida), D (sucia).'],
    pagina: ['Página', 'Bloque de 4 KB de direcciones LINEALES. La paginación asigna cada página a un marco físico.'],
    marco: ['Marco (frame)', 'Bloque de 4 KB de memoria FÍSICA donde se ubica una página.'],
    tlb: ['TLB (Translation Lookaside Buffer)', 'Caché del procesador que guarda traducciones página → marco recientes para no recorrer las tablas en cada acceso. Se vacía al escribir CR3; INVLPG invalida una entrada.'],
    excepcion: ['Excepción', 'Interrupción generada por el propio CPU al detectar un error (división por cero, violación de protección, página ausente…). Usa los vectores 0..31.'],
    falla: ['Falla (fault)', 'Excepción que se informa ANTES de completar la instrucción: la dirección de retorno apunta a la instrucción que falló, para poder reintentarla.'],
    codigoerror: ['Código de error', 'Palabra que el CPU apila para algunas excepciones (#DF, #TS, #NP, #SS, #GP, #PF). Suele contener el selector involucrado o, en #PF, los bits P/W/U.'],
    doblefalta: ['Doble falta (#DF)', 'Ocurre cuando falla la entrega de una excepción (por ejemplo, la compuerta de la IDT es inválida).'],
    triplefalta: ['Triple falta', 'Falla al atender una doble falta. El procesador entra en SHUTDOWN y la PC se reinicia.'],
    pila: ['Pila', 'Zona de memoria LIFO apuntada por SS:SP. Crece hacia direcciones menores: PUSH resta 2 a SP y escribe; POP lee y suma 2.'],
    flags: ['FLAGS', 'Registro de banderas: indican el resultado de la última operación (CF, ZF, SF, OF, PF, AF) y controlan el CPU (IF, DF, TF).'],
    modoreal: ['Modo real', 'Modo del 8086: dirección = segmento × 16 + desplazamiento, sin protección, 1 MB de memoria. El 386 arranca en este modo (pero ya puede usar EAX y las instrucciones nuevas).'],
    modoprotegido: ['Modo protegido', 'Introducido por el 286 y ampliado por el 386: los registros de segmento contienen selectores, los segmentos se describen en tablas, hay límites, permisos y niveles de privilegio. En el 386 puede ser de 16 o de 32 bits (bit D) y agrega paginación.'],
    paginacion: ['Paginación', 'Traducción de direcciones lineales a físicas por páginas de 4 KB mediante un directorio y tablas de páginas (386 en adelante).'],
    pe: ['PE (Protection Enable)', 'Bit 0 de CR0/MSW: 1 = modo protegido.'],
    pg: ['PG (Paging)', 'Bit 31 de CR0: 1 = paginación activada (requiere PE = 1).'],
  };

  // envuelve un texto como término del glosario
  EMU.gl = function (key, text) {
    return `<span class="gterm" data-g="${key}">${text}</span>`;
  };

  // ------------------------------------------------------------------
  //  Explicación del último paso
  // ------------------------------------------------------------------
  const sx = (v, s) => s === 8 ? ((v & 0xFF) ^ 0x80) - 0x80 : s === 16 ? ((v & 0xFFFF) ^ 0x8000) - 0x8000 : (v | 0);
  const hx = (v, s) => hex(v, s === 8 ? 2 : s === 32 ? 8 : 4) + 'h';
  function num(v, s) {
    const u = (v >>> 0) & MASK[s];
    const sg = sx(u, s);
    return `<b>${hx(u, s)}</b> <span class="faint">(${u}${sg < 0 ? ' / con signo ' + sg : ''})</span>`;
  }
  const bin = (v, s) => EMU.bin((v >>> 0) & MASK[s], s).replace(/(\d{4})(?=\d)/g, '$1 ');
  const CC_TXT = [
    ['JO', 'OF = 1 (hubo desborde con signo)'], ['JNO', 'OF = 0'], ['JB / JC', 'CF = 1 (menor, sin signo)'], ['JAE / JNC', 'CF = 0 (mayor o igual, sin signo)'],
    ['JE / JZ', 'ZF = 1 (iguales / resultado cero)'], ['JNE / JNZ', 'ZF = 0 (distintos)'], ['JBE', 'CF = 1 o ZF = 1 (menor o igual, sin signo)'], ['JA', 'CF = 0 y ZF = 0 (mayor, sin signo)'],
    ['JS', 'SF = 1 (negativo)'], ['JNS', 'SF = 0'], ['JP', 'PF = 1'], ['JNP', 'PF = 0'],
    ['JL', 'SF ≠ OF (menor, con signo)'], ['JGE', 'SF = OF (mayor o igual, con signo)'], ['JLE', 'ZF = 1 o SF ≠ OF (menor o igual, con signo)'], ['JG', 'ZF = 0 y SF = OF (mayor, con signo)'],
  ];
  const BIOS_TXT = {
    '21:01': 'leer una tecla con eco (resultado en AL)', '21:02': 'imprimir el carácter de DL', '21:06': 'entrada/salida directa por consola',
    '21:07': 'leer una tecla sin eco', '21:08': 'leer una tecla sin eco', '21:09': 'imprimir el texto de DS:DX hasta el carácter \'$\'',
    '21:0A': 'leer una línea de texto', '21:25': 'instalar un vector de interrupción', '21:35': 'leer un vector de interrupción',
    '21:4C': 'terminar el programa (código de salida en AL)', '21:00': 'terminar el programa',
    '10:00': 'borrar la pantalla', '10:02': 'mover el cursor', '10:0E': 'escribir el carácter de AL (teletipo)', '10:09': 'escribir un carácter con color',
    '16:00': 'esperar una tecla', '16:01': 'consultar si hay una tecla',
  };

  EMU.explainStep = function (t, cpu) {
    if (!t || !t.ins) return '';
    const ins = t.ins, b = t.before, op = ins.op;
    const [A, B] = ins.ops;
    const reads = t.acc.filter(a => a.t === 'R');
    const writes = t.acc.filter(a => a.t === 'W');
    const nm = (o) => o ? esc(EMU.formatOperand(o, false)) : '';
    const regB = (o) => o.size === 8 ? (o.n < 4 ? b.r[o.n] & 0xFF : (b.r[o.n - 4] >>> 8) & 0xFF) : o.size === 16 ? b.r[o.n] & 0xFFFF : b.r[o.n];
    const before = (o) => {
      if (!o) return 0;
      if (o.k === 'r') return regB(o);
      if (o.k === 'i') return o.v;
      if (o.k === 's') return b.s[o.n].sel;
      if (o.k === 'c') return o.n === 0 ? b.cr0 : o.n === 2 ? b.cr2 : b.cr3;
      if (o.k === 'm') { const r = reads.find(a => a.size === o.size >> 3) || reads[0]; return r ? r.v : 0; }
      return o.v || 0;
    };
    const after = (o) => {
      if (o.k === 'r') return cpu.getR(o.size, o.n);
      if (o.k === 's') return cpu.s[o.n].sel;
      if (o.k === 'm') { const w = writes[writes.length - 1]; return w ? w.v : before(o); }
      return before(o);
    };
    const s = (A && A.size) || 16;
    const hxs = (v) => hex(v, (v >>> 0) > 0xFFFF ? 8 : 4);
    const stk32 = cpu.stk32();
    const SPN = stk32 ? 'ESP' : 'SP', IPN = cpu.code32() ? 'EIP' : 'IP';
    const spB = stk32 ? b.r[4] : b.r[4] & 0xFFFF;
    const out = [];
    if (t.fault) {
      out.push(`<span class="np">✖ La instrucción <b>no se completó</b>: provocó la excepción ${esc(EMU.excName(t.fault.vec))}.</span> ` +
        `Los registros quedaron como antes de ejecutarla y el CPU saltó al manejador de la excepción (${cpu.pe() ? 'buscado en la IDT' : 'buscado en la IVT'}). ` +
        `Motivo: ${esc(t.fault.msg)}.`);
      return out.join(' ');
    }
    const flagsLine = (kind, x, y, r) => {
      const f = cpu.flags, z = (f & F.ZF) ? 1 : 0, sgn = (f & F.SF) ? 1 : 0, c = (f & F.CF) ? 1 : 0, o = (f & F.OF) ? 1 : 0;
      const parts = [`ZF=${z} ${z ? '(el resultado es cero)' : '(resultado distinto de cero)'}`, `SF=${sgn} (bit más alto del resultado)`];
      if (kind === 'add') parts.push(`CF=${c} ${c ? '(acarreo: la suma sin signo no entra en ' + s + ' bits)' : '(sin acarreo)'}`);
      else if (kind === 'sub') parts.push(`CF=${c} ${c ? '(préstamo: sin signo, ' + hx(x, s) + ' < ' + hx(y, s) + ')' : '(sin préstamo)'}`);
      else if (kind === 'inc') parts.push('CF sin cambios (INC/DEC no lo modifican)');
      else parts.push(`CF=${c}`);
      if (kind !== 'logic') parts.push(`OF=${o} ${o ? '(desborde: con signo, el resultado verdadero no entra en ' + s + ' bits)' : '(sin desborde con signo)'}`);
      else parts.push('CF=OF=0 (las operaciones lógicas los ponen en 0)');
      return `<div class="xflags">Banderas: ${parts.join(' · ')}</div>`;
    };

    switch (op) {
      case 'mov': {
        if (A.k === 's') {
          const sel = after(A), sc = cpu.s[A.n];
          if (!cpu.pe()) out.push(`Carga ${nm(A)} con ${num(sel, 16)}. En ${EMU.gl('modoreal', 'modo real')} la ${EMU.gl('base', 'base')} del segmento es simplemente ${hx(sel, 16)} × 16 = <b>${hex(sc.base, 5)}h</b>.`);
          else if (!sc.valid) out.push(`Carga ${nm(A)} con el ${EMU.gl('selector', 'selector')} NULO. Está permitido en DS/ES, pero cualquier acceso a memoria con ${nm(A)} provocará #GP.`);
          else out.push(`Carga el ${EMU.gl('selector', 'selector')} ${hx(sel, 16)} en ${nm(A)}: ${EMU.gl('indice', 'índice')} ${sel >> 3}, ${EMU.gl('ti', 'TI')}=${(sel >> 2) & 1}, ${EMU.gl('rpl', 'RPL')}=${sel & 3}. ` +
            `El CPU leyó el ${EMU.gl('descriptor', 'descriptor')} ${sel >> 3} de la ${EMU.gl('gdt', 'GDT')}, verificó sus permisos y copió en la ${EMU.gl('cache', 'parte oculta')} base = <b>${hex(sc.base, 6)}h</b> y límite = <b>${hex(sc.limit, 4)}h</b>.`);
          break;
        }
        if (A.k === 'c') {
          const v = after(A);
          if (A.n === 0) out.push(`Escribe ${hx(v, 32)} en ${EMU.gl('cr0', 'CR0')}: ${EMU.gl('pe', 'PE')}=${v & 1}, ${EMU.gl('pg', 'PG')}=${(v >>> 31) & 1}.` + ((v >>> 31) & 1 && !((b.cr0 >>> 31) & 1) ? ' <b>Se activa la paginación.</b>' : ''));
          else if (A.n === 3) out.push(`Escribe ${hx(v, 32)} en ${EMU.gl('cr3', 'CR3')}: el directorio de páginas está en la dirección FÍSICA ${hex(v & 0xFFFFF000, 8)}h.`);
          else out.push(`Escribe ${hx(v, 32)} en CR2.`);
          break;
        }
        if (B.k === 'c') { out.push(`Copia ${nm(B)} = ${num(before(B), 32)} en ${nm(A)}.`); break; }
        const v = before(B);
        let src = nm(B);
        if (B.k === 'm') src = `la memoria ${nm(B)} (${EMU.SREG_NAMES[B.seg]}:${hxs(reads[0] ? reads[0].off : 0)})`;
        out.push(`Copia ${B.k === 'i' ? 'el valor inmediato' : src} = ${num(v, s)} en ${A.k === 'm' ? 'la memoria ' + nm(A) : nm(A)}. No modifica las banderas.`);
        const mo = A.k === 'm' ? A : B.k === 'm' ? B : null;
        if (mo && mo.a32 && (mo.index >= 0 || mo.base >= 0)) {
          const d = (A.k === 'm' ? writes[0] : reads[0]);
          const parts = [];
          if (mo.base >= 0) parts.push(`${EMU.REG32_NAMES[mo.base]} (${hex(b.r[mo.base], 8)}h)`);
          if (mo.index >= 0) parts.push(`${EMU.REG32_NAMES[mo.index]} × ${mo.scale} (${hex(b.r[mo.index], 8)}h × ${mo.scale})`);
          if (mo.disp) parts.push(`${hex(mo.disp, 8)}h`);
          out.push(`<div class="dim">Dirección de 32 bits (${EMU.gl('sib', 'SIB')}): ${parts.join(' + ')} = <b>${d ? hxs(d.off) : '?'}h</b>.</div>`);
        }
        break;
      }
      case 'add': case 'adc': case 'sub': case 'sbb': case 'cmp': {
        const x = before(A), y = before(B);
        const sym = op === 'add' || op === 'adc' ? '+' : '−';
        const carry = (op === 'adc' || op === 'sbb') ? ((b.flags & F.CF) ? 1 : 0) : null;
        const r = op === 'cmp' ? (x - y) & MASK[s] : after(A);
        if (op === 'cmp') {
          out.push(`Compara ${nm(A)} = ${num(x, s)} con ${nm(B)} = ${num(y, s)}: calcula ${hx(x, s)} − ${hx(y, s)} = ${num(r, s)} pero <b>no guarda</b> el resultado; solo actualiza las banderas para un salto condicional posterior.`);
          const rel = x === y ? `${nm(A)} y ${nm(B)} son <b>iguales</b>` :
            `${nm(A)} es <b>${(x >>> 0) < (y >>> 0) ? 'menor' : 'mayor'}</b> sin signo y <b>${sx(x, s) < sx(y, s) ? 'menor' : 'mayor'}</b> con signo que ${nm(B)}`;
          out.push(`<div class="dim">→ ${rel}.</div>`);
        } else {
          out.push(`${nm(A)} = ${hx(x, s)} ${sym} ${hx(y, s)}${carry !== null ? ` ${sym} CF(${carry})` : ''} = ${num(r, s)}.`);
        }
        out.push(flagsLine(op === 'add' || op === 'adc' ? 'add' : 'sub', x, y, r));
        break;
      }
      case 'inc': case 'dec': {
        const x = before(A), r = after(A);
        out.push(`${nm(A)} = ${hx(x, s)} ${op === 'inc' ? '+' : '−'} 1 = ${num(r, s)}.`);
        out.push(flagsLine('inc', x, 1, r));
        break;
      }
      case 'neg': out.push(`${nm(A)} = 0 − ${hx(before(A), s)} = ${num(after(A), s)} (complemento a 2: cambia el signo).`); out.push(flagsLine('sub', 0, before(A))); break;
      case 'and': case 'or': case 'xor': case 'test': {
        const x = before(A), y = before(B), r = op === 'test' ? (x & y) & MASK[s] : after(A);
        const OPN = { and: 'AND (1 solo si ambos bits son 1)', or: 'OR (1 si alguno es 1)', xor: 'XOR (1 si los bits son distintos)', test: 'AND sin guardar el resultado (solo banderas)' }[op];
        if (op === 'xor' && A.k === 'r' && B.k === 'r' && A.n === B.n) out.push(`${nm(A)} XOR ${nm(A)} siempre da 0: es la forma clásica (y corta) de poner un registro en cero.`);
        else out.push(`Operación ${OPN} bit a bit:<pre class="xbin">  ${bin(x, s)}  (${hx(x, s)})\n${op === 'or' ? '| ' : op === 'xor' ? '^ ' : '& '}${bin(y, s)}  (${hx(y, s)})\n= ${bin(r, s)}  (${hx(r, s)})</pre>`);
        out.push(flagsLine('logic', x, y, r));
        break;
      }
      case 'not': out.push(`Invierte todos los bits: ${bin(before(A), s)} → ${bin(after(A), s)}. No modifica banderas.`); break;
      case 'shl': case 'shr': case 'sar': case 'rol': case 'ror': case 'rcl': case 'rcr': {
        const n = (B.k === 'i' ? B.v : (b.r[1] & 0xFF)) & 31, x = before(A), r = after(A);
        const kind = { shl: 'desplaza a la IZQUIERDA', shr: 'desplaza a la DERECHA (entran ceros)', sar: 'desplaza a la DERECHA conservando el signo', rol: 'rota a la izquierda', ror: 'rota a la derecha', rcl: 'rota a la izquierda a través de CF', rcr: 'rota a la derecha a través de CF' }[op];
        out.push(`${nm(A)} se ${kind} ${n} bit${n === 1 ? '' : 's'}:<pre class="xbin">  ${bin(x, s)}\n→ ${bin(r, s)}</pre>CF = ${(cpu.flags & F.CF) ? 1 : 0} (último bit que salió).`);
        if (op === 'shl' && n) out.push(`<div class="dim">Desplazar ${n} a la izquierda equivale a multiplicar por ${Math.pow(2, n)}.</div>`);
        if (op === 'shr' && n) out.push(`<div class="dim">Desplazar ${n} a la derecha equivale a dividir (sin signo) por ${Math.pow(2, n)}.</div>`);
        break;
      }
      case 'mul': case 'imul': case 'div': case 'idiv': {
        if (ins.ops.length > 1) { out.push(`${nm(A)} = ${num(after(A), s)} (multiplicación con signo, se descarta la parte alta).`); break; }
        const v = before(A);
        const sg = op === 'imul' || op === 'idiv' ? ' con signo' : ' sin signo';
        if (op === 'mul' || op === 'imul') {
          if (s === 8) out.push(`Multiplicación${sg}: AX = AL × ${nm(A)} = ${hx(b.r[0] & 0xFF, 8)} × ${hx(v, 8)} = ${num(cpu.r[0] & 0xFFFF, 16)}.`);
          else if (s === 16) out.push(`Multiplicación${sg}: DX:AX = AX × ${nm(A)} = ${hx(b.r[0] & 0xFFFF, 16)} × ${hx(v, 16)} = <b>${hex(cpu.r[2] & 0xFFFF, 4)}:${hex(cpu.r[0] & 0xFFFF, 4)}h</b>.`);
          else out.push(`Multiplicación${sg} de 32 bits: EDX:EAX = EAX × ${nm(A)} = ${hx(b.r[0], 32)} × ${hx(v, 32)} = <b>${hex(cpu.r[2], 8)}:${hex(cpu.r[0], 8)}h</b> (resultado de 64 bits).`);
          out.push(`<div class="dim">CF=OF=${(cpu.flags & F.CF) ? '1: el resultado no entra en la mitad baja' : '0: la mitad alta no hace falta'}.</div>`);
        } else if (s === 8) out.push(`División${sg}: AX (${hx(b.r[0] & 0xFFFF, 16)}) ÷ ${nm(A)} (${hx(v, 8)}) → cociente AL = ${num(cpu.r[0] & 0xFF, 8)}, resto AH = ${num((cpu.r[0] >> 8) & 0xFF, 8)}.`);
        else if (s === 16) out.push(`División${sg}: DX:AX (${hex(b.r[2] & 0xFFFF, 4)}:${hex(b.r[0] & 0xFFFF, 4)}h) ÷ ${nm(A)} (${hx(v, 16)}) → cociente AX = ${num(cpu.r[0] & 0xFFFF, 16)}, resto DX = ${num(cpu.r[2] & 0xFFFF, 16)}.`);
        else out.push(`División${sg} de 64 por 32 bits: EDX:EAX (${hex(b.r[2], 8)}:${hex(b.r[0], 8)}h) ÷ ${nm(A)} (${hx(v, 32)}) → cociente EAX = ${num(cpu.r[0], 32)}, resto EDX = ${num(cpu.r[2], 32)}.`);
        break;
      }
      case 'push': {
        const w = writes[0];
        const n = w ? w.size : 2;
        out.push(`${SPN} baja ${n} bytes, de ${hxs(spB)}h a ${hxs(cpu.sp())}h, y se escribe ${num(w ? w.v : 0, n * 8)} en ${EMU.gl('pila', 'la pila')} (SS:${hxs(cpu.sp())}, física ${w ? hex(w.phys, 6) : '?'}h).`);
        break;
      }
      case 'pop': {
        const r = reads[0];
        out.push(`Se lee ${num(r ? r.v : 0, r ? r.size * 8 : 16)} del tope de ${EMU.gl('pila', 'la pila')} (SS:${hxs(spB)}) y se guarda en ${nm(A)}; ${SPN} sube a ${hxs(cpu.sp())}h.`);
        break;
      }
      case 'pusha': out.push(ins.osize === 32 ? `PUSHAD apila los 8 registros de 32 bits (EAX, ECX, EDX, EBX, ESP original, EBP, ESI, EDI): ${SPN} baja 32 bytes.`
        : `Apila los 8 registros generales (AX, CX, DX, BX, SP original, BP, SI, DI): ${SPN} baja 16 bytes.`); break;
      case 'popa': out.push(`Desapila los 8 registros generales ${ins.osize === 32 ? 'de 32 bits ' : ''}en orden inverso (el valor de SP/ESP guardado se descarta).`); break;
      case 'pushf': out.push(ins.osize === 32 ? `PUSHFD apila EFLAGS (${hx(b.flags, 32)}).` : `Apila FLAGS (${hx(b.flags & 0xFFFF, 16)}).`); break;
      case 'popf': out.push(`Desapila ${ins.osize === 32 ? 'EFLAGS' : 'FLAGS'}: ahora vale ${hx(cpu.flags, 32)}.`); break;
      case 'xchg': out.push(`Intercambia: ${nm(A)} pasa de ${hx(before(A), s)} a ${hx(after(A), s)} y ${nm(B)} de ${hx(before(B), s)} a ${hx(after(B), s)}.`); break;
      case 'lea': out.push(`Calcula la DIRECCIÓN (desplazamiento) ${nm(B)} = <b>${hx(cpu.getR(A.size, A.n), A.size)}</b> y la guarda en ${nm(A)}. <b>No lee la memoria</b>: equivale a MOV ${nm(A)}, OFFSET …` +
        (B.a32 && B.index >= 0 ? ` <span class="dim">Con el ${EMU.gl('sib', 'byte SIB')} también sirve para hacer cuentas: LEA EAX, [EBX+EBX*4] calcula EBX × 5.</span>` : '')); break;
      case 'lds': case 'les': case 'lss': case 'lfs': case 'lgs': {
        const sr = { lds: 3, les: 0, lss: 2, lfs: 4, lgs: 5 }[op];
        out.push(`Carga un puntero lejano de memoria: ${nm(A)} = ${hx(cpu.getR(A.size, A.n), A.size)} y ${EMU.SREG_NAMES[sr]} = ${hx(cpu.s[sr].sel, 16)}.`);
        break;
      }
      case 'movzx': out.push(`Copia ${nm(B)} = ${num(before(B), B.size)} en ${nm(A)} completando con <b>ceros</b> (extensión sin signo) → ${num(after(A), A.size)}.`); break;
      case 'movsx': out.push(`Copia ${nm(B)} = ${num(before(B), B.size)} en ${nm(A)} <b>extendiendo el signo</b> (el bit más alto se repite hacia la izquierda) → ${num(after(A), A.size)}.`); break;
      case 'setcc': {
        const [n, cond] = CC_TXT[ins.cc];
        out.push(`SET${n.slice(1).split(' ')[0]} pone ${nm(A)} = 1 si ${cond}, y 0 si no. Resultado: <b>${after(A) & 0xFF}</b>. Sirve para guardar el resultado de una comparación sin saltar.`);
        break;
      }
      case 'bt': case 'bts': case 'btr': case 'btc': {
        const txt = { bt: 'solo lo copia en CF', bts: 'lo copia en CF y lo pone en 1', btr: 'lo copia en CF y lo pone en 0', btc: 'lo copia en CF y lo invierte' }[op];
        out.push(`Prueba el bit ${B.k === 'i' ? B.v : before(B)} de ${nm(A)}: ${txt}. CF = <b>${(cpu.flags & F.CF) ? 1 : 0}</b>.`);
        break;
      }
      case 'bsf': case 'bsr':
        out.push((cpu.flags & F.ZF) ? `${nm(B)} vale 0: no hay bits en 1 (ZF=1).`
          : `Busca el primer bit en 1 ${op === 'bsf' ? 'desde abajo (bit 0)' : 'desde arriba (bit más alto)'}: está en la posición <b>${after(A)}</b> → ${nm(A)}.`);
        break;
      case 'shld': case 'shrd':
        out.push(`Desplazamiento de doble precisión: ${nm(A)} se desplaza a la ${op === 'shld' ? 'izquierda' : 'derecha'} y los bits que entran vienen de ${nm(B)} → ${num(after(A), s)}.`);
        break;
      case 'cwde': out.push(`Extiende el signo de AX (${hx(b.r[0] & 0xFFFF, 16)}) a EAX = ${num(cpu.r[0], 32)}.`); break;
      case 'cdq': out.push(`Extiende el signo de EAX a EDX:EAX: EDX = ${hx(cpu.r[2], 32)}. Se usa antes de IDIV de 32 bits.`); break;
      case 'jmp': out.push(`Salto incondicional: ${IPN} ← ${hxs(cpu.ip)}h. La próxima instrucción se busca allí.`); break;
      case 'jcc': {
        const [n, cond] = CC_TXT[ins.cc];
        const f = b.flags;
        const C = !!(f & F.CF), Z = !!(f & F.ZF), S = !!(f & F.SF), O = !!(f & F.OF), P = !!(f & F.PF);
        const base = [O, C, Z, C || Z, S, P, S !== O, Z || S !== O][ins.cc >> 1];
        const taken = (ins.cc & 1) ? !base : base;
        out.push(`${n} salta si ${cond}. Banderas: ZF=${(f & F.ZF) ? 1 : 0} CF=${(f & F.CF) ? 1 : 0} SF=${(f & F.SF) ? 1 : 0} OF=${(f & F.OF) ? 1 : 0} → ` +
          (taken ? `<b>se cumple: SALTA</b> a ${hex(A.v, 4)}h.` : '<b>no se cumple</b>: continúa con la instrucción siguiente.'));
        break;
      }
      case 'loop': case 'loope': case 'loopne': {
        const CXN = ins.asize === 32 ? 'ECX' : 'CX', m = ins.asize === 32 ? 0xFFFFFFFF : 0xFFFF;
        const cx = (cpu.r[1] & m) >>> 0;
        const zf = !!(b.flags & F.ZF);
        const back = cx !== 0 && (op === 'loop' || (op === 'loope' ? zf : !zf));
        out.push(`${CXN} = ${hxs((b.r[1] & m) >>> 0)}h − 1 = <b>${hxs(cx)}h</b>. ${back ? `Como la condición se cumple, vuelve a ${hxs(A.v)}h (otra vuelta del bucle).` : cx === 0 ? `${CXN} llegó a 0: <b>termina el bucle</b>.` : 'La condición de ZF no se cumple: termina el bucle.'}`);
        break;
      }
      case 'jcxz': {
        const CXN = ins.asize === 32 ? 'ECX' : 'CX', cx = ins.asize === 32 ? b.r[1] : b.r[1] & 0xFFFF;
        out.push(`Salta solo si ${CXN} = 0. ${CXN} = ${hxs(cx)}h → ${cx === 0 ? 'salta' : 'no salta'}.`);
        break;
      }
      case 'call': out.push(`Apila la dirección de retorno <b>${hxs((t.ip + ins.len) & (ins.osize === 32 ? 0xFFFFFFFF : 0xFFFF))}h</b> (${ins.osize === 32 ? '4' : '2'} bytes: la instrucción que sigue al CALL) y salta al procedimiento en ${hxs(cpu.ip)}h. RET la usará para volver.`); break;
      case 'ret': out.push(`Desapila la dirección de retorno ${hxs(cpu.ip)}h en ${IPN}: vuelve a la instrucción que sigue al CALL.` + (A ? ` Además descarta ${A.v} bytes de parámetros (${SPN} += ${A.v}).` : '')); break;
      case 'callf': out.push(`Llamada LEJANA: apila CS e ${IPN} y carga CS:${IPN} = ${hex(cpu.s[1].sel, 4)}:${hxs(cpu.ip)}.`); break;
      case 'retf': out.push(`Retorno LEJANO: desapila ${IPN} y CS → ${hex(cpu.s[1].sel, 4)}:${hxs(cpu.ip)}.`); break;
      case 'jmpf':
        if (cpu.pe()) {
          out.push(`Salto LEJANO: carga CS con el ${EMU.gl('selector', 'selector')} ${hx(cpu.s[1].sel, 16)} (descriptor ${cpu.s[1].sel >> 3} de la ${EMU.gl('gdt', 'GDT')}) y ${cpu.code32() ? 'EIP' : 'IP'} con ${hxs(cpu.ip)}h. ` +
            `El CPU verificó el descriptor y copió su base (${hex(cpu.s[1].base, 8)}h) y límite en la ${EMU.gl('cache', 'caché')} de CS. Además vacía la cola de instrucciones precargadas.`);
          if (cpu.code32() !== !!(b.s[1].gd & 0x40 && b.cr0 & 1)) out.push(cpu.code32()
            ? `<div><b>El nuevo segmento de código tiene ${EMU.gl('bitd', 'D=1')}: desde ahora el CPU decodifica las instrucciones como código de 32 bits.</b> El mismo byte B8h ahora es MOV EAX, imm32.</div>`
            : `<div>El nuevo segmento tiene ${EMU.gl('bitd', 'D=0')}: código de 16 bits.</div>`);
        } else out.push(`Salto LEJANO: CS:IP ← ${hex(cpu.s[1].sel, 4)}:${hex(cpu.ip, 4)}.`);
        break;
      case 'int': case 'int3': case 'into': {
        const v = op === 'int' ? A.v : op === 'int3' ? 3 : 4;
        if (cpu.ip === ((t.ip + ins.len) & 0xFFFF) && cpu.s[1].sel === t.cs) { out.push('INTO: OF = 0, no se produce la interrupción.'); break; }
        if (!b.cr0 || !(b.cr0 & 1)) out.push(`Interrupción por software ${hex(v, 2)}h: apila FLAGS, CS e IP, pone IF=0, lee el vector ${v} de la ${EMU.gl('ivt', 'IVT')} (física ${hex(v * 4, 4)}h) y salta a <b>${hex(cpu.s[1].sel, 4)}:${hex(cpu.ip, 4)}</b>.`);
        else out.push(`Interrupción por software ${hex(v, 2)}h en modo protegido: lee la ${EMU.gl('compuerta', 'compuerta')} ${v} de la ${EMU.gl('idt', 'IDT')}, apila ${cpu.code32() ? 'EFLAGS, CS y EIP (compuerta de 32 bits)' : 'FLAGS, CS e IP'} y salta al manejador <b>${hex(cpu.s[1].sel, 4)}:${hxs(cpu.ip)}</b>.`);
        if (op === 'int' && !(b.cr0 & 1)) {
          const k = hex(v, 2) + ':' + hex((b.r[0] >> 8) & 0xFF, 2);
          if (BIOS_TXT[k]) out.push(`<div class="dim">Servicio pedido (AH=${hex((b.r[0] >> 8) & 0xFF, 2)}h): ${esc(BIOS_TXT[k])}.</div>`);
        }
        break;
      }
      case 'iret': out.push(ins.osize === 32 ? `IRETD: desapila EIP, CS y EFLAGS (4 bytes cada uno) → vuelve a ${hex(cpu.s[1].sel, 4)}:${hxs(cpu.ip)}.`
        : `Retorno de interrupción: desapila IP, CS y FLAGS → vuelve a ${hex(cpu.s[1].sel, 4)}:${hxs(cpu.ip)} con FLAGS = ${hx(cpu.flags & 0xFFFF, 16)}.`); break;
      case 'bios': {
        const k = hex(A.v, 2) + ':' + hex((b.r[0] >> 8) & 0xFF, 2);
        out.push(`Aquí se ejecuta la rutina de la BIOS/DOS simulada para INT ${hex(A.v, 2)}h` + (BIOS_TXT[k] ? `: ${esc(BIOS_TXT[k])}` : '') + '. La siguiente instrucción (IRET) vuelve al programa.');
        break;
      }
      case 'hlt': out.push('HLT detiene el procesador.'); break;
      case 'cli': out.push('IF = 0: el CPU ignora las interrupciones de hardware (las INT por software siguen funcionando).'); break;
      case 'sti': out.push('IF = 1: el CPU acepta interrupciones de hardware.'); break;
      case 'cld': out.push('DF = 0: las instrucciones de cadena avanzan (SI y DI se incrementan).'); break;
      case 'std': out.push('DF = 1: las instrucciones de cadena retroceden.'); break;
      case 'clc': case 'stc': case 'cmc': out.push(`CF = ${(cpu.flags & F.CF) ? 1 : 0}.`); break;
      case 'cbw': out.push(`Extiende el signo de AL (${hx(b.r[0] & 0xFF, 8)}) a AX = ${num(cpu.r[0] & 0xFFFF, 16)}.`); break;
      case 'cwd': out.push(`Extiende el signo de AX a DX:AX: DX = ${hx(cpu.r[2] & 0xFFFF, 16)} (${(b.r[0] & 0x8000) ? 'AX era negativo → FFFFh' : 'AX era positivo → 0'}). Se usa antes de IDIV.`); break;
      case 'movs': case 'stos': case 'lods': case 'cmps': case 'scas': {
        const n = ins.size >> 3, dir = (b.flags & F.DF) ? 'retroceden' : 'avanzan';
        const e = ins.asize === 32 ? 'E' : '', acc = ins.size === 8 ? 'AL' : ins.size === 32 ? 'EAX' : 'AX';
        const what = { movs: `copia ${n} byte(s) de DS:${e}SI a ES:${e}DI`, stos: `guarda ${acc} en ES:${e}DI`, lods: `carga ${acc} desde DS:${e}SI`, cmps: `compara DS:${e}SI con ES:${e}DI`, scas: `compara ${acc} con ES:${e}DI` }[op];
        out.push(`Instrucción de cadena: ${what}; los punteros ${dir} ${n}.`);
        if (ins.rep) {
          const cx = ins.asize === 32 ? cpu.r[1] : cpu.r[1] & 0xFFFF;
          out.push(cpu.ip === t.ip ? `Prefijo REP: ${e}CX = ${cx}: quedan ${cx} repeticiones (el CPU vuelve a ejecutar la misma instrucción).` : `Prefijo REP: ${e}CX = ${cx}. <b>Terminaron las repeticiones.</b>`);
        }
        break;
      }
      case 'lgdt': case 'lidt': {
        const tb = op === 'lgdt' ? cpu.gdtr : cpu.idtr;
        out.push(`Lee 6 bytes de memoria y carga ${EMU.gl(op === 'lgdt' ? 'gdtr' : 'idtr', op === 'lgdt' ? 'GDTR' : 'IDTR')}: base LINEAL <b>${hex(tb.base, 6)}h</b> y límite <b>${hex(tb.limit, 4)}h</b> (${Math.floor((tb.limit + 1) / 8)} entradas de 8 bytes). ` +
          (op === 'lgdt' ? 'Desde ahora los selectores se buscan en esa tabla (todavía no cambió ningún registro de segmento).' : 'Las interrupciones y excepciones de modo protegido usarán esa tabla.'));
        break;
      }
      case 'smsw': out.push(`Lee la ${EMU.gl('msw', 'MSW')} (parte baja de CR0) en ${nm(A)} = ${hx(after(A), 16)}: PE = ${after(A) & 1}.`); break;
      case 'lmsw': out.push(`Escribe la ${EMU.gl('msw', 'MSW')}: ${EMU.gl('pe', 'PE')} = ${cpu.cr0 & 1}.` + ((cpu.cr0 & 1) && !(b.cr0 & 1) ? ` <b>¡El CPU entra en ${EMU.gl('modoprotegido', 'modo protegido')}!</b> Pero CS todavía tiene en su caché los valores de modo real: hace falta un salto lejano.` : '')); break;
      case 'lar': case 'lsl': case 'verr': case 'verw': {
        const ok = (cpu.flags & F.ZF) !== 0;
        const what = { lar: `lee los derechos de acceso → ${nm(A)} = ${hx(after(A), 16)} (byte alto = byte de acceso)`, lsl: `lee el límite del segmento → ${nm(A)} = ${hx(after(A), 16)}`, verr: '¿se puede leer?', verw: '¿se puede escribir?' }[op];
        out.push(`Consulta el descriptor del selector ${hx(before(op === 'lar' || op === 'lsl' ? B : A), 16)} sin cargarlo: ${what}. ZF = ${ok ? '1 (sí / válido)' : '0 (no / inválido)'}.`);
        break;
      }
      case 'invlpg': out.push(`Invalida la entrada de la ${EMU.gl('tlb', 'TLB')} de esa página: el próximo acceso volverá a recorrer las tablas.`); break;
      case 'nop': out.push('No hace nada: solo avanza IP 1 byte.'); break;
      default: out.push(esc((EMU.DESC && EMU.DESC[op]) || ''));
    }
    if (t.tlb && cpu.tlbOn) out.push(`<div class="dim">${EMU.gl('tlb', 'TLB')}: ${t.tlb === 'hit' ? 'acierto: la traducción ya estaba guardada (no se leyeron las tablas de páginas)' : 'fallo: se recorrieron las tablas de páginas y se guardó la traducción'}.</div>`);
    return out.join(' ');
  };
})(window.EMU);
