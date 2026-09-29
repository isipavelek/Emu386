/* =====================================================================
 *  EMU386 - Ejercicios con autocorrección
 *
 *  Cada ejercicio define:
 *    opts     switches necesarios
 *    starter  código inicial (con las variables que el verificador usa)
 *    tests    casos de prueba (cada uno se ejecuta en una máquina nueva)
 *    setup(t, tc)  prepara registros/memoria antes de ejecutar
 *    check(t, tc)  devuelve [[ok, mensaje], ...]
 * ===================================================================== */
'use strict';
(function (EMU) {
  const hex = EMU.hex;
  const H = (v, n) => hex(v, n || 4) + 'h';

  EMU.EXERCISES = [
    {
      id: 'swap', level: 'Básico', title: 'Intercambiar AX y BX', opts: {},
      statement: 'Al comenzar, <b>AX</b> y <b>BX</b> ya tienen valores (los carga el verificador). Intercambie sus contenidos <b>sin usar XCHG</b>. ' +
        'Al terminar, la pila debe quedar como al principio (SP = FFFEh). Finalice con <code>HLT</code>.',
      starter: `; AX y BX ya tienen valores: intercámbielos sin usar XCHG



        hlt
`,
      tests: [{ ax: 0x1234, bx: 0xABCD }, { ax: 7, bx: 0xFFFF }],
      setup(t, tc) { t.setReg('ax', tc.ax); t.setReg('bx', tc.bx); },
      check(t, tc) {
        return [
          [t.reg('ax') === tc.bx, `AX debe valer ${H(tc.bx)} (vale ${H(t.reg('ax'))})`],
          [t.reg('bx') === tc.ax, `BX debe valer ${H(tc.ax)} (vale ${H(t.reg('bx'))})`],
          [!t.used('xchg'), 'No se debe usar XCHG'],
          [t.reg('sp') === 0xFFFE, `La pila debe quedar equilibrada: SP = FFFEh (vale ${H(t.reg('sp'))})`],
        ];
      },
      hints: ['Puede guardar uno de los valores en un tercer registro (por ejemplo CX).', 'Con la pila: PUSH AX, PUSH BX y luego dos POP… ¿en qué orden?'],
    },
    {
      id: 'suma3', level: 'Básico', title: 'Sumar tres variables', opts: {},
      statement: 'Calcule <code>total = a + b + c</code> (variables de 16 bits). El verificador prueba con distintos valores.',
      starter: `; total = a + b + c



        hlt

a       dw 10
b       dw 20
c       dw 30
total   dw 0
`,
      tests: [{ a: 10, b: 20, c: 30 }, { a: 1000, b: 0x7FFF, c: 1 }, { a: 0, b: 0, c: 0xFFFF }],
      setup(t, tc) { t.setW('a', tc.a); t.setW('b', tc.b); t.setW('c', tc.c); },
      check(t, tc) {
        const exp = (tc.a + tc.b + tc.c) & 0xFFFF;
        return [[t.w('total') === exp, `total debe ser ${H(exp)} (vale ${H(t.w('total'))})`],
          [t.w('a') === tc.a && t.w('b') === tc.b && t.w('c') === tc.c, 'No modifique a, b ni c']];
      },
      hints: ['Cargue a en AX con MOV AX, [a] (o MOV AX, a) y sume las otras dos con ADD.', 'Al final guarde AX con MOV [total], AX.'],
    },
    {
      id: 'maximo', level: 'Básico', title: 'Máximo de un arreglo (con signo)', opts: {},
      statement: 'El arreglo <code>arreglo</code> tiene <b>8 números de 16 bits CON signo</b>. Guarde el mayor en <code>maximo</code>. ' +
        'Use un bucle (LOOP o un salto condicional) y el salto adecuado para números con signo.',
      starter: `; maximo = el mayor elemento de arreglo (números con signo)



        hlt

arreglo dw 3, 9, -2, 7, 0, 1, 5, 4
maximo  dw 0
`,
      tests: [{ v: [3, 9, -2, 7, 0, 1, 5, 4] }, { v: [-5, -3, -9, -1, -7, -8, -2, -6] }, { v: [100, 20, 300, -400, 5, 6, 7, 299] }, { v: [-1, -1, -1, -1, -1, -1, -1, 32767] }],
      setup(t, tc) { tc.v.forEach((x, i) => t.setW('arreglo', x, i)); },
      check(t, tc) {
        const exp = Math.max(...tc.v) & 0xFFFF;
        return [[t.w('maximo') === exp, `Con ${JSON.stringify(tc.v)} el máximo es ${Math.max(...tc.v)} (${H(exp)}); se obtuvo ${H(t.w('maximo'))}`]];
      },
      hints: ['Empiece suponiendo que el máximo es el primer elemento.', 'Recorra con SI (sume 2 en cada paso: cada elemento ocupa 2 bytes).', 'Para números con signo use JG/JL/JLE, no JA/JB (que son sin signo).'],
    },
    {
      id: 'vocales', level: 'Intermedio', title: 'Contar vocales', opts: {},
      statement: '<code>texto</code> es una cadena terminada en <b>0</b>. Cuente las vocales (a, e, i, o, u, en mayúscula o minúscula) y guarde la cantidad en <code>cantidad</code>.',
      starter: `; cantidad = número de vocales de texto (terminado en 0)



        hlt

texto    db 'Arquitectura de Computadoras', 0, 40 dup(0)
cantidad dw 0
`,
      tests: [{ s: 'Arquitectura de Computadoras' }, { s: 'XYZ 123' }, { s: 'AEIOU aeiou' }, { s: '' }],
      setup(t, tc) { t.setStr('texto', tc.s); },
      check(t, tc) {
        const exp = (tc.s.match(/[aeiou]/gi) || []).length;
        return [[t.w('cantidad') === exp, `"${tc.s}" tiene ${exp} vocales; se obtuvo ${t.w('cantidad')}`]];
      },
      hints: ['Recorra con LODSB (AL = [SI], SI++) hasta encontrar el 0.', 'Compare AL con cada vocal (CMP AL, \'a\' / JE es_vocal …).', 'Truco: OR AL, 20h convierte una letra mayúscula a minúscula.'],
    },
    {
      id: 'mayus', level: 'Intermedio', title: 'Pasar a mayúsculas', opts: {},
      statement: 'Convierta a MAYÚSCULAS, <b>en el mismo lugar</b>, las letras minúsculas de <code>texto</code> (terminado en 0). Los demás caracteres no deben cambiar.',
      starter: `; convierte texto a mayúsculas (en el lugar)



        hlt

texto db 'hola mundo 2025!', 0, 40 dup(0)
`,
      tests: [{ s: 'hola mundo 2025!' }, { s: 'YA ESTA' }, { s: 'az AZ {}' }],
      setup(t, tc) { t.setStr('texto', tc.s); },
      check(t, tc) {
        const exp = tc.s.replace(/[a-z]/g, c => c.toUpperCase());
        const got = t.str('texto');
        return [[got === exp, `"${tc.s}" → debe quedar "${exp}"; quedó "${got}"`]];
      },
      hints: ['Una letra minúscula está entre \'a\' y \'z\': use dos comparaciones.', 'En ASCII, minúscula − 32 (20h) = mayúscula.', 'Puede leer con MOV AL, [SI] y escribir con MOV [SI], AL.'],
    },
    {
      id: 'pantalla', level: 'Básico', title: 'Escribir en la memoria de video', opts: {},
      statement: 'Escriba <b>ARQUI</b> en la <b>fila 5, columna 10</b> de la pantalla, con atributo <b>1Eh</b> (amarillo sobre azul), escribiendo directamente en la memoria de video (segmento B800h).<br>' +
        'Recuerde: desplazamiento = (fila × 80 + columna) × 2; cada celda = carácter + atributo.',
      starter: `; "ARQUI" en fila 5, columna 10, atributo 1Eh



        hlt
`,
      tests: [{}],
      check(t) {
        const txt = t.screen(5, 10, 5);
        const at = [0, 1, 2, 3, 4].map(i => t.attr(5, 10 + i));
        return [[txt === 'ARQUI', `En la fila 5, columna 10 debe decir "ARQUI" (dice "${txt}")`],
          [at.every(a => a === 0x1E), `El atributo debe ser 1Eh en las 5 celdas (hay ${at.map(a => hex(a, 2)).join(' ')})`]];
      },
      hints: ['(5 × 80 + 10) × 2 = 820.', 'MOV AX, 0B800h / MOV ES, AX y luego escriba con ES:[DI].', 'Con STOSW: AH = atributo, AL = carácter.'],
    },
    {
      id: 'factorial', level: 'Intermedio', title: 'Factorial con un procedimiento', opts: {},
      statement: 'Complete el procedimiento <code>factorial</code>: recibe <b>N en CX</b> y devuelve <b>N! en AX</b>. El programa principal ya lo llama con CALL. ' +
        'Debe funcionar para N = 0 (0! = 1) y la pila debe quedar equilibrada.',
      starter: `        mov cx, [n]
        call factorial
        mov [resultado], ax
        hlt

; ---- CX = N  →  AX = N! ----
factorial:

        ret

n         dw 5
resultado dw 0
`,
      tests: [{ n: 5 }, { n: 1 }, { n: 0 }, { n: 8 }],
      setup(t, tc) { t.setW('n', tc.n); },
      check(t, tc) {
        let f = 1; for (let i = 2; i <= tc.n; i++) f *= i;
        return [[t.w('resultado') === (f & 0xFFFF), `${tc.n}! = ${f} (${H(f)}); se obtuvo ${t.w('resultado')}`],
          [t.reg('sp') === 0xFFFE, `La pila debe quedar equilibrada (SP = FFFEh, vale ${H(t.reg('sp'))})`],
          [t.used('call') && t.used('ret'), 'Debe usarse el procedimiento (CALL/RET)']];
      },
      hints: ['Empiece con AX = 1.', 'MUL CX hace DX:AX = AX × CX (¡modifica DX!).', 'Use LOOP para multiplicar por CX, CX−1, …, 1. Si CX = 0, no entre al bucle (JCXZ).'],
    },
    {
      id: 'int60', level: 'Intermedio', title: 'Su propia interrupción (IVT)', opts: {},
      statement: 'Instale en la <b>IVT</b> un manejador para <b>INT 60h</b> que devuelva <b>AX = BX + CX</b>. ' +
        'El vector 60h está en la dirección física 60h × 4 = 180h (offset en 180h, segmento en 182h). El programa ya llama a INT 60h y guarda el resultado.',
      starter: `        ; 1) instale el vector 60h (offset y segmento de mi_int60)


        mov bx, [x]
        mov cx, [y]
        int 60h
        mov [resultado], ax
        hlt

mi_int60:
        ; devuelva AX = BX + CX

        iret

x         dw 10
y         dw 20
resultado dw 0
`,
      tests: [{ x: 10, y: 20 }, { x: 0x1234, y: 0x1111 }],
      setup(t, tc) { t.setW('x', tc.x); t.setW('y', tc.y); },
      check(t, tc) {
        const off = t.mem16(0x180), seg = t.mem16(0x182);
        const h = t.offsetOf('mi_int60');
        return [[seg === EMU.PROG_SEG && off === h, `El vector 60h debe ser ${H(EMU.PROG_SEG)}:${H(h)} (es ${H(seg)}:${H(off)})`],
          [t.w('resultado') === ((tc.x + tc.y) & 0xFFFF), `resultado debe ser ${H(tc.x + tc.y)} (vale ${H(t.w('resultado'))})`]];
      },
      hints: ['Use ES = 0: XOR AX, AX / MOV ES, AX.', 'MOV WORD PTR ES:[60h*4], OFFSET mi_int60', 'MOV WORD PTR ES:[60h*4+2], CS'],
    },
    {
      id: 'pm_video', level: 'Modo protegido', title: 'Escribir con un selector', opts: { pm: true },
      statement: 'El sistema ya pasó a modo protegido. Usando el selector <code>SEL_VIDEO</code>, escriba <b>PM</b> en la esquina superior izquierda (fila 0, columnas 0 y 1) con atributo <b>4Fh</b>.<br>' +
        'En modo protegido no puede usar B800h como segmento: ¡sería un selector inválido!',
      starter: `; ya estamos en modo protegido (ver pestaña Sistema)



        hlt
`,
      tests: [{}],
      check(t) {
        return [[t.screen(0, 0, 2) === 'PM', `La pantalla debe decir "PM" en la fila 0 (dice "${t.screen(0, 0, 2)}")`],
          [t.attr(0, 0) === 0x4F && t.attr(0, 1) === 0x4F, 'El atributo debe ser 4Fh'],
          [t.cpu.pe(), 'El CPU debe seguir en modo protegido']];
      },
      hints: ['MOV AX, SEL_VIDEO / MOV ES, AX: carga el descriptor del segmento de video.', 'MOV WORD PTR ES:[0], 4F50h escribe "P" con atributo 4Fh.'],
    },
    {
      id: 'pm_desc', level: 'Modo protegido', title: 'Inspeccionar descriptores (LSL y LAR)', opts: { pm: true, idt: true },
      statement: 'Sin leer la GDT como datos: deje en <b>AX el límite</b> del segmento de <code>SEL_VIDEO</code> (use LSL) y en <b>BX los derechos de acceso</b> de <code>SEL_CODIGO</code> (use LAR: el byte de acceso queda en BH).',
      starter: `; AX = límite de SEL_VIDEO, BX = derechos de SEL_CODIGO



        hlt
`,
      tests: [{}],
      check(t) {
        return [[t.reg('ax') === 0x0F9F, `AX debe ser 0F9Fh (vale ${H(t.reg('ax'))})`],
          [(t.reg('bx') >> 8) === 0x9A || (t.reg('bx') >> 8) === 0x9B, `BH debe ser 9Ah/9Bh: código ejecutable/legible (vale ${hex(t.reg('bx') >> 8, 2)}h)`],
          [t.used('lsl') && t.used('lar'), 'Use las instrucciones LSL y LAR']];
      },
      hints: ['LSL y LAR reciben el selector en un registro: MOV CX, SEL_VIDEO / LSL AX, CX.'],
    },
    {
      id: 'pg_alias', level: 'Paginación', title: 'Dos direcciones lineales, un marco', opts: { pm: true, idt: true, paging: true },
      statement: 'Con <code>SEL_VIRTUAL</code> (base lineal 400000h): escriba <b>0CAFEh</b> en la dirección lineal <b>400010h</b> y luego LÉALA en AX usando <b>otra dirección lineal</b> que esté mapeada al mismo marco físico (vea la pestaña Paginación).',
      starter: `; escribir 0CAFEh en lineal 400010h y leerlo por otra dirección lineal



        hlt
`,
      tests: [{}],
      check(t) {
        return [[t.phys16(0x30010) === 0xCAFE, `La física 030010h debe contener CAFEh (contiene ${H(t.phys16(0x30010))})`],
          [t.reg('ax') === 0xCAFE, `AX debe ser CAFEh (vale ${H(t.reg('ax'))})`],
          [t.readLin(0x403010), 'Debe leerse desde la dirección lineal 403010h (la página alias)']];
      },
      hints: ['La PTE 3 de la tabla 1 (lineal 403000h) apunta al mismo marco que la PTE 0 (lineal 400000h).', 'Con ES = SEL_VIRTUAL, lineal 403010h = ES:3010h.'],
    },
    {
      id: 'pg_fault', level: 'Paginación', title: 'Provocar una falla de página', opts: { pm: true, idt: true, paging: true },
      statement: 'Escriba <b>1234h</b> en la dirección lineal <b>407000h</b> (página no presente: el sistema la asigna en la falla de página). ' +
        'Después guarde en la variable <code>dir_falla</code> (DD) el valor de <b>CR2</b>, que contiene la dirección que falló.',
      starter: `; escribir en lineal 407000h y guardar CR2 en dir_falla



        hlt

dir_falla dd 0
`,
      tests: [{}],
      check(t) {
        const w = t.cpu.walk(0x407000);
        return [[t.events(/#PF/).length > 0, 'Debe producirse una falla de página (#PF)'],
          [w.phys !== undefined && t.cpu.pr16(w.phys) === 0x1234, 'La lineal 407000h debe contener 1234h'],
          [t.d('dir_falla') === 0x407000, `dir_falla debe ser 00407000h (vale ${hex(t.d('dir_falla'), 8)}h)`]];
      },
      hints: ['ES = SEL_VIRTUAL y escriba en ES:7000h.', 'MOV EAX, CR2 y luego MOV [dir_falla], EAX (DS = SEL_DATOS).'],
    },
    {
      id: 'dwords', level: 'Intel 386', title: 'Arreglo de DWORD con índice escalado', opts: {},
      statement: 'Sume los <b>6 números de 32 bits</b> de <code>valores</code> y deje el resultado (32 bits) en <code>suma</code>. ' +
        'Recorra el arreglo con <b>direccionamiento escalado</b> del 386, por ejemplo <code>[valores + ESI*4]</code> o <code>[EBX + ESI*4]</code>. ' +
        'Funciona también en modo real: el ensamblador agrega los prefijos 66h y 67h.',
      starter: `; suma = valores[0] + ... + valores[5]  (números de 32 bits)



        hlt

valores dd 100000, 200000, 300000, 400000, 500000, 600000
suma    dd 0
`,
      tests: [{ v: [100000, 200000, 300000, 400000, 500000, 600000] }, { v: [0x7FFFFFFF, 1, 2, 3, 4, 5] }, { v: [0xFFFFFFFF, 1, 0, 0, 0, 0] }],
      setup(t, tc) { tc.v.forEach((x, i) => t.setD('valores', x, i)); },
      check(t, tc) {
        const exp = tc.v.reduce((a, b) => a + b, 0) % 0x100000000;
        return [[t.d('suma') === exp, `La suma debe ser ${hex(exp, 8)}h (${exp}); se obtuvo ${hex(t.d('suma'), 8)}h`],
          [t.scaled, 'Use una dirección escalada del 386, por ejemplo [valores + ESI*4]']];
      },
      hints: ['Use EAX como acumulador (32 bits) y ESI como índice: 0, 1, 2… 5.', 'ADD EAX, [valores + ESI*4] suma el elemento ESI.', 'Con INC ESI / CMP ESI, 6 / JB … arma el bucle.'],
    },
    {
      id: 'pm32_plano', level: 'Intel 386', title: 'Modo plano de 32 bits', opts: { pm: true, b32: true, idt: true },
      statement: 'El sistema pasó a <b>modo protegido de 32 bits</b>. <code>FS</code> tiene el selector <code>SEL_PLANO</code> (base 0, límite 4 GB): con él, ' +
        'el desplazamiento es directamente la dirección lineal. Escriba <b>OK</b> con atributo <b>2Fh</b> en la esquina superior izquierda de la pantalla usando ' +
        '<b>FS</b> y la dirección lineal de la memoria de video (0B8000h) en un registro de 32 bits.',
      starter: `; código de 32 bits: escriba "OK" usando FS y la dirección 0B8000h



        hlt
`,
      tests: [{}],
      check(t) {
        return [[t.screen(0, 0, 2) === 'OK', `La pantalla debe decir "OK" en la fila 0 (dice "${t.screen(0, 0, 2)}")`],
          [t.attr(0, 0) === 0x2F && t.attr(0, 1) === 0x2F, 'El atributo debe ser 2Fh'],
          [t.writes.some(w => w.si === 4 && w.off >= 0xB8000), 'La escritura debe hacerse con FS y un desplazamiento de 32 bits (0B8000h)']];
      },
      hints: ['MOV EDI, 0B8000h', 'MOV WORD PTR FS:[EDI], 2F4Fh escribe una "O" con atributo 2Fh.', 'Recuerde el orden: primero la celda de la "O", después la de la "K" (EDI+2).'],
    },
  ];

  // ------------------------------------------------------------------
  //  Ejecución y verificación
  // ------------------------------------------------------------------
  class CheckError extends Error { }

  function machine(res, sys) {
    const cpu = new EMU.CPU(), bios = new EMU.Bios(cpu);
    cpu.mem.fill(0);
    bios.install();
    for (const [a, v] of res.image) cpu.mem[EMU.PROG_BASE + a] = v;
    if (!sys && res.minAddr >= 2) { cpu.mem[EMU.PROG_BASE] = 0xCD; cpu.mem[EMU.PROG_BASE + 1] = 0x20; }
    cpu.loadSeg(1, EMU.PROG_SEG); cpu.loadSeg(3, EMU.PROG_SEG); cpu.loadSeg(0, EMU.PROG_SEG); cpu.loadSeg(2, EMU.STACK_SEG);
    cpu.setSP(0xFFFE);
    cpu.ip = sys ? 0 : res.entry;
    cpu.flags = 0x202;
    const sym = (name) => {
      const s = res.symbols.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!s) throw new CheckError(`No se encontró "${name}". No cambie los nombres de las variables y etiquetas del enunciado.`);
      return s;
    };
    const REGN = { ax: 0, cx: 1, dx: 2, bx: 3, sp: 4, bp: 5, si: 6, di: 7 };
    const ops = new Set(), linReads = new Set(), writes = [];
    const t = {
      cpu, bios, ops, linReads, writes, scaled: false,
      setD: (name, v, i) => { const a = t.addr(name) + 4 * (i || 0); for (let k = 0; k < 4; k++) cpu.mem[a + k] = (v >>> (8 * k)) & 0xFF; },
      addr: (name) => EMU.PROG_BASE + sym(name).value,
      offsetOf: (name) => sym(name).value,
      w: (name, i) => cpu.pr16(t.addr(name) + 2 * (i || 0)),
      d: (name) => cpu.pr32(t.addr(name)),
      b: (name, i) => cpu.pr8(t.addr(name) + (i || 0)),
      setW: (name, v, i) => { const a = t.addr(name) + 2 * (i || 0); cpu.mem[a] = v & 0xFF; cpu.mem[a + 1] = (v >> 8) & 0xFF; },
      setStr: (name, s) => { const a = t.addr(name); Array.from(s).forEach((c, i) => { cpu.mem[a + i] = EMU.toCP437(c); }); cpu.mem[a + s.length] = 0; },
      str: (name) => { let a = t.addr(name), s = ''; for (let i = 0; i < 200 && cpu.mem[a + i]; i++) s += EMU.charOf(cpu.mem[a + i]); return s; },
      reg: (n) => n === 'ip' ? cpu.ip : cpu.r[REGN[n]] & 0xFFFF,
      setReg: (n, v) => cpu.setR(16, REGN[n], v),
      mem16: (a) => cpu.pr16(a),
      phys16: (a) => cpu.pr16(a),
      screen: (row, col, n) => { let s = ''; for (let i = 0; i < n; i++) s += EMU.charOf(cpu.mem[EMU.VIDEO_BASE + (row * 80 + col + i) * 2]); return s; },
      attr: (row, col) => cpu.mem[EMU.VIDEO_BASE + (row * 80 + col) * 2 + 1],
      used: (op) => ops.has(op),
      readLin: (lin) => linReads.has(lin >>> 0),
      events: (re) => cpu.log.filter(e => re.test(e.msg)),
    };
    return t;
  }

  EMU.checkExercise = function (ex, code) {
    const sys = EMU.buildSystem(ex.opts);
    const src = sys ? [{ name: 'system', text: sys }, { name: 'user', text: code }] : [{ name: 'user', text: code }];
    const res = EMU.assemble(src);
    if (!res.ok) {
      return { ok: false, cases: [{ name: 'Ensamblado', checks: [[false, 'El programa tiene errores: ' + res.errors.slice(0, 3).map(e => `línea ${e.line}: ${e.msg}`).join(' · ')]] }] };
    }
    const cases = [];
    let allOk = true;
    (ex.tests || [{}]).forEach((tc, i) => {
      const checks = [];
      try {
        const t = machine(res, sys);
        if (ex.setup) ex.setup(t, tc);
        const max = ex.maxSteps || 300000;
        let n = 0;
        while (!t.cpu.halted && n < max) {
          t.cpu.step();
          const tr = t.cpu.trace;
          if (tr && tr.ins) {
            t.ops.add(tr.ins.op);
            if (tr.ins.ops.some(o => o.k === 'm' && o.a32 && o.index >= 0 && o.scale > 1)) t.scaled = true;
            for (const a of tr.acc) {
              if (a.t === 'R') t.linReads.add(a.lin >>> 0);
              if (a.t === 'W') t.writes.push({ si: a.si, off: a.off, lin: a.lin });
            }
          }
          if (t.cpu.waiting) break;
          n++;
        }
        if (t.cpu.shutdown) checks.push([false, 'El programa terminó en TRIPLE FALTA (vea la pestaña Eventos al ejecutarlo)']);
        else if (t.cpu.waiting) checks.push([false, 'El programa se quedó esperando una tecla']);
        else if (!t.cpu.halted) checks.push([false, `El programa no terminó en ${max} instrucciones: ¿falta HLT o hay un bucle infinito?`]);
        else {
          const fatal = t.cpu.log.find(e => e.type === 'bios' && /detuvo el programa/.test(e.msg));
          if (fatal) checks.push([false, 'El programa terminó por una excepción: ' + fatal.msg.replace(/^.*?: /, '')]);
          checks.push(...ex.check(t, tc));
        }
      } catch (e) {
        if (!(e instanceof CheckError)) { console.error(e); checks.push([false, 'Error del verificador: ' + e.message]); }
        else checks.push([false, e.message]);
      }
      const ok = checks.every(c => c[0]);
      if (!ok) allOk = false;
      cases.push({ name: `Prueba ${i + 1}`, checks, ok });
    });
    return { ok: allOk, cases };
  };
})(window.EMU);
