/* =====================================================================
 *  EMU386 - Interfaz de usuario
 * ===================================================================== */
'use strict';
(function (EMU) {
  const $ = (id) => document.getElementById(id);
  const hex = EMU.hex, esc = EMU.escapeHtml, SN = EMU.SREG_NAMES;
  const hx = (v) => hex(v, (v >>> 0) > 0xFFFF ? 8 : 4);   // desplazamiento de 16 o 32 bits
  const F = EMU.FLAGS;
  const SPEEDS = [
    { lbl: '1 inst/s', delay: 1000 }, { lbl: '3 inst/s', delay: 333 }, { lbl: '10 inst/s', delay: 100 },
    { lbl: '50 inst/s', delay: 20 }, { lbl: '1000 inst/s', batch: 20, delay: 20 }, { lbl: 'Máxima', max: true },
  ];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  const PAL = ['#000000', '#0000AA', '#00AA00', '#00AAAA', '#AA0000', '#AA00AA', '#AA5500', '#AAAAAA',
    '#555555', '#5555FF', '#55FF55', '#55FFFF', '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF'];
  const SIZE_NAME = { 1: 'BYTE', 2: 'WORD', 4: 'DWORD', 6: '6 bytes', 8: '8 bytes' };

  const REG_DESC = ['Acumulador (MUL, DIV, E/S)', 'Contador (LOOP, REP, desplazamientos)', 'Datos (MUL/DIV, puerto en IN/OUT)',
    'Base (direccionamiento, segmento DS)', 'Puntero de pila (tope de SS)', 'Puntero base (marcos de pila, segmento SS)',
    'Índice fuente (cadenas: DS:SI)', 'Índice destino (cadenas: ES:DI)'];
  const FLAG_INFO = [
    ['OF', F.OF, 'Overflow: desborde en aritmética CON signo'], ['DF', F.DF, 'Direction: 0 = cadenas hacia adelante, 1 = hacia atrás'],
    ['IF', F.IF, 'Interrupt: 1 = acepta interrupciones de hardware'], ['TF', F.TF, 'Trap: 1 = paso a paso (INT 1 tras cada instrucción)'],
    ['SF', F.SF, 'Sign: copia del bit más significativo del resultado'], ['ZF', F.ZF, 'Zero: 1 si el resultado fue cero'],
    ['AF', F.AF, 'Auxiliary carry: acarreo del bit 3 al 4 (BCD)'], ['PF', F.PF, 'Parity: 1 si el byte bajo tiene cantidad PAR de unos'],
    ['CF', F.CF, 'Carry: acarreo/préstamo en aritmética SIN signo'],
  ];
  const DESC = {
    mov: 'Copia el operando fuente en el destino. No modifica las banderas.',
    add: 'Suma fuente + destino y guarda en el destino. Modifica OF, SF, ZF, AF, PF, CF.',
    adc: 'Suma con acarreo: destino = destino + fuente + CF.',
    sub: 'Resta: destino = destino − fuente. Modifica todas las banderas aritméticas.',
    sbb: 'Resta con préstamo: destino = destino − fuente − CF.',
    cmp: 'Compara: calcula destino − fuente SOLO para actualizar las banderas (no guarda el resultado).',
    and: 'Y lógico bit a bit. CF=OF=0.', or: 'O lógico bit a bit. CF=OF=0.', xor: 'O exclusivo bit a bit. CF=OF=0.',
    test: 'Y lógico solo para actualizar banderas (no guarda el resultado).',
    not: 'Complemento a 1 (invierte todos los bits). No modifica banderas.',
    neg: 'Complemento a 2: destino = 0 − destino.',
    inc: 'Incrementa en 1. No modifica CF.', dec: 'Decrementa en 1. No modifica CF.',
    mul: 'Multiplicación sin signo: AX = AL×op (8 bits) o DX:AX = AX×op (16 bits).',
    imul: 'Multiplicación con signo.',
    div: 'División sin signo: AL=AX/op, AH=resto (8 bits) · AX=DX:AX/op, DX=resto (16 bits). Divisor 0 → #DE.',
    idiv: 'División con signo. Divisor 0 o cociente que no entra → #DE (vector 0).',
    shl: 'Desplaza a la izquierda (×2 por cada bit). El último bit que sale va a CF.',
    shr: 'Desplaza a la derecha sin signo (÷2). El último bit que sale va a CF.',
    sar: 'Desplaza a la derecha conservando el signo (÷2 con signo).',
    rol: 'Rota a la izquierda.', ror: 'Rota a la derecha.', rcl: 'Rota a la izquierda a través de CF.', rcr: 'Rota a la derecha a través de CF.',
    push: 'SP = SP − 2 y luego escribe el operando en SS:SP.', pop: 'Lee SS:SP en el destino y luego SP = SP + 2.',
    pusha: 'Apila AX, CX, DX, BX, SP (original), BP, SI, DI.', popa: 'Desapila DI, SI, BP, (SP descartado), BX, DX, CX, AX.',
    pushf: 'Apila el registro FLAGS.', popf: 'Desapila el registro FLAGS.',
    xchg: 'Intercambia los dos operandos.', lea: 'Carga la DIRECCIÓN efectiva (el offset), no el contenido de memoria.',
    lds: 'Carga un puntero lejano: registro ← [mem], DS ← [mem+2].', les: 'Carga un puntero lejano: registro ← [mem], ES ← [mem+2].',
    jmp: 'Salto incondicional: IP ← destino.', jmpf: 'Salto LEJANO: carga CS e IP. En modo protegido, CS recibe un selector y el CPU lee su descriptor.',
    jcc: 'Salto condicional: salta solo si se cumple la condición sobre las banderas.',
    call: 'Llamada: apila IP (dirección de retorno) y salta.', callf: 'Llamada lejana: apila CS e IP y carga CS:IP.',
    ret: 'Retorno: desapila IP.', retf: 'Retorno lejano: desapila IP y CS.',
    loop: 'CX = CX − 1; si CX ≠ 0 salta.', loope: 'CX = CX − 1; salta si CX ≠ 0 y ZF = 1.', loopne: 'CX = CX − 1; salta si CX ≠ 0 y ZF = 0.',
    jcxz: 'Salta si CX = 0.',
    int: 'Interrupción por software: apila FLAGS, CS, IP y salta al manejador (IVT en modo real, IDT en modo protegido).',
    int3: 'Punto de ruptura (vector 3).', into: 'Interrupción 4 si OF = 1.',
    iret: 'Retorno de interrupción: desapila IP, CS y FLAGS.',
    hlt: 'Detiene el procesador.', nop: 'No hace nada (ocupa 1 byte).',
    cli: 'IF = 0: deshabilita interrupciones de hardware.', sti: 'IF = 1: habilita interrupciones de hardware.',
    cld: 'DF = 0: las cadenas avanzan (SI, DI crecen).', std: 'DF = 1: las cadenas retroceden.',
    clc: 'CF = 0.', stc: 'CF = 1.', cmc: 'Invierte CF.',
    cbw: 'Extiende el signo de AL a AX.', cwd: 'Extiende el signo de AX a DX:AX.', cwde: 'Extiende el signo de AX a EAX.', cdq: 'Extiende el signo de EAX a EDX:EAX.',
    lahf: 'AH ← byte bajo de FLAGS.', sahf: 'Byte bajo de FLAGS ← AH.', xlat: 'AL ← [DS:BX+AL] (tabla de traducción).',
    movs: 'Copia de DS:SI a ES:DI y avanza SI y DI.', cmps: 'Compara DS:SI con ES:DI (actualiza banderas) y avanza.',
    stos: 'Guarda AL/AX en ES:DI y avanza DI.', lods: 'Carga AL/AX desde DS:SI y avanza SI.', scas: 'Compara AL/AX con ES:DI y avanza DI.',
    in: 'Lee un puerto de E/S.', out: 'Escribe en un puerto de E/S.',
    enter: 'Crea un marco de pila (PUSH BP; MOV BP,SP; SUB SP,n).', leave: 'Destruye el marco de pila (MOV SP,BP; POP BP).',
    lgdt: 'Carga GDTR (límite de 16 bits + base lineal) desde 6 bytes de memoria.', lidt: 'Carga IDTR (límite + base lineal) desde memoria.',
    sgdt: 'Guarda GDTR en memoria.', sidt: 'Guarda IDTR en memoria.',
    lmsw: 'Carga la MSW (4 bits bajos de CR0). Con PE=1 el 286 entra en modo protegido; LMSW no puede volver a poner PE=0.',
    smsw: 'Lee la MSW (parte baja de CR0).', clts: 'Pone en 0 el bit TS de CR0.',
    lldt: 'Carga LDTR con un selector de la GDT (descriptor de LDT).', sldt: 'Guarda el selector de LDTR.',
    ltr: 'Carga TR con un selector de TSS.', str: 'Guarda el selector de TR.',
    lar: 'Lee los derechos de acceso del descriptor de un selector (ZF=1 si es válido).',
    lsl: 'Lee el límite del segmento de un selector (ZF=1 si es válido).',
    verr: 'ZF=1 si el segmento se puede LEER con el nivel de privilegio actual.', verw: 'ZF=1 si el segmento se puede ESCRIBIR.',
    arpl: 'Ajusta el RPL de un selector al mayor de ambos.',
    bios: 'Instrucción especial del emulador: aquí se ejecuta el servicio de la BIOS simulada.',
    movzx: '386: copia un operando de 8 o 16 bits a un registro más grande completando con ceros.',
    movsx: '386: copia un operando de 8 o 16 bits a un registro más grande extendiendo el signo.',
    setcc: '386: pone un byte en 1 si se cumple la condición (como un Jcc), o en 0 si no.',
    bt: '386: copia en CF el bit indicado.', bts: '386: copia el bit en CF y lo pone en 1.', btr: '386: copia el bit en CF y lo pone en 0.', btc: '386: copia el bit en CF y lo invierte.',
    bsf: '386: busca el primer bit en 1 desde el bit 0 (ZF=1 si el operando es 0).', bsr: '386: busca el primer bit en 1 desde el bit más alto.',
    shld: '386: desplaza a la izquierda metiendo los bits de otro registro (doble precisión).', shrd: '386: desplaza a la derecha metiendo los bits de otro registro.',
    lss: '386: carga un puntero lejano en SS:registro.', lfs: '386: carga un puntero lejano en FS:registro.', lgs: '386: carga un puntero lejano en GS:registro.',
    invlpg: '486: invalida la traducción de una página en la TLB.',
  };
  DESC.loop = 'CX (ECX con direcciones de 32 bits) = CX − 1; si no llegó a 0, salta.';
  DESC.push = 'Resta 2 o 4 a SP/ESP (según el tamaño del operando) y escribe el operando en el tope de la pila.';
  DESC.pop = 'Lee el tope de la pila en el destino y suma 2 o 4 a SP/ESP.';
  DESC.iret = 'Retorno de interrupción: desapila IP, CS y FLAGS (IRETD: EIP, CS y EFLAGS de 32 bits).';

  EMU.DESC = DESC;
  const gl = EMU.gl;

  function selParts(sel) {
    return `<span class="selbits"><span class="ix gterm" data-g="indice">índice ${sel >> 3}</span><span class="ti gterm" data-g="ti">TI=${(sel >> 2) & 1}</span><span class="rpl gterm" data-g="rpl">RPL=${sel & 3}</span></span>`;
  }
  function flagBits(v, names) {
    return names.map(([n, bit, d]) => `<span class="bit ${(v >>> bit) & 1 ? 'on' : ''}" title="${esc(d)}">${n}<b>${(v >>> bit) & 1}</b></span>`).join('');
  }

  class App {
    constructor() {
      this.cpu = new EMU.CPU();
      this.cpu.tlbOn = store.get('emu286.tlb', false);
      this.bios = new EMU.Bios(this.cpu);
      this.opts = store.get('emu286.opts', { pm: false, idt: false, paging: false });
      this.speed = store.get('emu286.speed', 4);
      this.program = null; this.dirty = true; this.running = false;
      this.view = 'xlate'; this.io = 'screen'; this.edTab = 'user';
      this.xlSel = 'ip'; this.xlManual = null;
      this.memMode = 'logical'; this.memSeg = 3; this.memOff = 0; this.memAddr = EMU.PROG_BASE;
      this.gdtSel = null; this.pdeSel = null;
      this.bpPhys = new Set(); this.tempBp = null;
      this.lineByPhys = new Map(); this.physByLine = new Map();
      this.lastLogLen = -1;
      this.edUser = new EMU.Editor($('edUser'), { onChange: () => this.onCodeChange(), onBreakpoints: () => this.syncBreakpoints() });
      this.edSys = new EMU.Editor($('edSystem'), { readOnly: true, onBreakpoints: () => this.syncBreakpoints() });
      this.edUser.value = store.get('emu286.code', EMU.DEFAULT_CODE);
      const theme = store.get('emu286.theme', null);
      if (theme) document.documentElement.dataset.theme = theme;
      this.setupUI();
      this.assemble(true);
    }

    // =============================== preparación ===============================
    setupUI() {
      const ex = $('examples');
      ex.innerHTML = '<option value="">— Ejemplos —</option>' + EMU.EXAMPLES.map(e => `<option value="${e.id}">${esc(e.title)}</option>`).join('');
      ex.onchange = () => { this.loadExample(ex.value); ex.value = ''; };
      $('btnNew').onclick = () => {
        if (!confirm('¿Empezar un programa nuevo? Se reemplazará el código actual.')) return;
        this.setCode('; Programa nuevo\n\n        \n        hlt\n');
      };
      $('btnOpen').onclick = () => $('fileInput').click();
      $('fileInput').onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        f.text().then(t => { this.setCode(t); e.target.value = ''; });
      };
      $('btnSave').onclick = () => {
        const blob = new Blob([this.edUser.value], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'programa.asm';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      $('btnAssemble').onclick = () => this.assemble();
      $('btnRun').onclick = () => this.run();
      $('btnPause').onclick = () => this.pause('Pausado por el usuario');
      $('btnStep').onclick = () => this.step();
      $('btnOver').onclick = () => this.stepOver();
      $('btnBack').onclick = () => this.back();
      $('btnReset').onclick = () => this.resetCPU();
      $('btnToUser').onclick = () => this.toUser();
      const sp = $('speed');
      sp.value = this.speed;
      const updSpeed = () => { this.speed = +sp.value; $('speedLbl').textContent = SPEEDS[this.speed].lbl; store.set('emu286.speed', this.speed); };
      sp.oninput = updSpeed; updSpeed();

      const swPM = $('swPM'), swIDT = $('swIDT'), swPG = $('swPG'), sw32 = $('sw32');
      const updSw = () => { swPM.checked = this.opts.pm; sw32.checked = !!this.opts.b32; swIDT.checked = this.opts.idt; swPG.checked = this.opts.paging; };
      updSw();
      swPM.onchange = () => { this.opts.pm = swPM.checked; if (!this.opts.pm) { this.opts.idt = false; this.opts.paging = false; this.opts.b32 = false; } updSw(); this.optsChanged(); };
      sw32.onchange = () => { this.opts.b32 = sw32.checked; if (this.opts.b32) this.opts.pm = true; updSw(); this.optsChanged(); };
      swIDT.onchange = () => { this.opts.idt = swIDT.checked; if (this.opts.idt) this.opts.pm = true; updSw(); this.optsChanged(); };
      swPG.onchange = () => { this.opts.paging = swPG.checked; if (this.opts.paging) this.opts.pm = true; updSw(); this.optsChanged(); };
      this.updateSwitches = updSw;

      $('edTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) this.showEdTab(b.dataset.tab); };
      $('viewTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { this.view = b.dataset.view; this.markTabs('viewTabs', 'view', this.view); this.renderView(); } };
      $('ioTabs').onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.io = b.dataset.io;
        this.markTabs('ioTabs', 'io', this.io);
        $('ioScreen').classList.toggle('hidden', this.io !== 'screen');
        $('ioEvents').classList.toggle('hidden', this.io !== 'events');
        this.lastLogLen = -1;
        this.renderEvents();
      };
      $('btnHelp').onclick = () => { $('helpBody').innerHTML = EMU.HELP_HTML; $('helpModal').classList.remove('hidden'); };
      $('helpClose').onclick = () => $('helpModal').classList.add('hidden');
      $('helpModal').onclick = (e) => { if (e.target.id === 'helpModal') $('helpModal').classList.add('hidden'); };
      $('btnTheme').onclick = () => {
        const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = cur;
        store.set('emu286.theme', cur);
      };

      // panel de registros: edición
      $('regs').onclick = (e) => {
        const hs = e.target.closest('[data-hist]');
        if (hs) { this.histSel = hs.dataset.hist; this.view = 'hist'; this.markTabs('viewTabs', 'view', 'hist'); this.renderView(); return; }
        const t = e.target.closest('[data-reg]');
        if (t) return this.editReg(t.dataset.reg);
        const f = e.target.closest('[data-flag]');
        if (f && !this.running) { this.cpu.flags ^= +f.dataset.flag; this.cpu.trace = null; this.render(); }
      };
      $('lastStep').onclick = (e) => {
        const t = e.target.closest('[data-acc]');
        if (!t) return;
        this.xlSel = 'acc' + t.dataset.acc;
        this.view = 'xlate';
        this.markTabs('viewTabs', 'view', 'xlate');
        this.renderView();
      };
      $('view').addEventListener('click', (e) => this.onViewClick(e));
      $('view').addEventListener('change', (e) => this.onViewChange(e));
      $('view').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) this.onViewChange(e); });
      $('listing').onclick = (e) => {
        const tr = e.target.closest('tr[data-src]');
        if (!tr) return;
        const ed = tr.dataset.src === 'system' ? this.edSys : this.edUser;
        const line = +tr.dataset.line;
        if (ed.bps.has(line)) ed.bps.delete(line); else ed.bps.add(line);
        ed.renderGutter();
        this.syncBreakpoints();
      };

      // teclado de la pantalla
      const scr = $('screen');
      scr.addEventListener('keydown', (e) => {
        if (/^F\d+$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
        let a = null;
        if (e.key.length === 1) a = EMU.toCP437(e.key);
        else a = { Enter: 13, Backspace: 8, Escape: 27, Tab: 9 }[e.key];
        if (a === undefined || a === null) return;
        e.preventDefault();
        e.stopPropagation();
        this.bios.pushKey(a, e.keyCode || 0);
        if (this.waitingKey) {
          this.waitingKey = false;
          $('kbdHint').classList.add('hidden');
          if (this.resumeOnKey) this.run(true);
          else this.step();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'F5') { e.preventDefault(); this.run(); }
        else if (e.key === 'F8') { e.preventDefault(); this.step(); }
        else if (e.key === 'F10') { e.preventDefault(); this.stepOver(); }
        else if (e.key === 'F7') { e.preventDefault(); this.back(); }
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); this.assemble(); }
        else if (e.key === 'Escape') {
          if (!$('helpModal').classList.contains('hidden')) $('helpModal').classList.add('hidden');
          else if (this.running) this.pause('Pausado por el usuario');
        }
      });
      window.addEventListener('resize', () => this.edUser.syncScroll());
      this.setupLearning();
    }

    // =============================== aprendizaje: ejercicios, tours, glosario ===============================
    setupLearning() {
      this.done = new Set(store.get('emu286.done', []));
      $('btnExercises').onclick = () => this.openPicker('ex');
      $('btnTour').onclick = () => this.openPicker('tour');
      $('pickClose').onclick = () => $('pickModal').classList.add('hidden');
      $('pickModal').onclick = (e) => {
        if (e.target.id === 'pickModal') { $('pickModal').classList.add('hidden'); return; }
        const it = e.target.closest('[data-pick]');
        if (!it) return;
        $('pickModal').classList.add('hidden');
        const [kind, id] = it.dataset.pick.split(':');
        if (kind === 'ex') this.startExercise(id); else this.startTour(id);
      };
      $('exVerify').onclick = () => this.verifyExercise();
      $('exHint').onclick = () => this.showHint();
      $('exClose').onclick = () => this.closeExercise();
      $('exToggle').onclick = () => { $('exBody').classList.toggle('hidden'); $('exToggle').textContent = $('exBody').classList.contains('hidden') ? '▸' : '▾'; };
      $('tourNext').onclick = () => this.tourNext();
      $('tourExit').onclick = () => this.endTour();
      // la tarjeta del tour se puede arrastrar desde su título
      const card = $('tourCard'), head = card.querySelector('.tour-head');
      head.addEventListener('pointerdown', (e) => {
        const r = card.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        head.setPointerCapture(e.pointerId);
        const move = (ev) => {
          card.style.left = Math.max(0, Math.min(window.innerWidth - r.width, ev.clientX - dx)) + 'px';
          card.style.top = Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - dy)) + 'px';
          card.style.bottom = 'auto';
        };
        const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
        head.addEventListener('pointermove', move);
        head.addEventListener('pointerup', up);
      });

      // glosario: tooltip al pasar el mouse
      const tip = $('gloss');
      document.addEventListener('mouseover', (e) => {
        const t = e.target.closest('[data-g]');
        if (!t) { tip.classList.add('hidden'); return; }
        const g = EMU.GLOSSARY[t.dataset.g];
        if (!g) return;
        tip.innerHTML = `<b>${esc(g[0])}</b><div>${esc(g[1])}</div>`;
        tip.classList.remove('hidden');
        const r = t.getBoundingClientRect();
        const w = Math.min(340, window.innerWidth - 16);
        tip.style.width = w + 'px';
        let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
        let top = r.bottom + 6;
        if (top + tip.offsetHeight > window.innerHeight - 8) top = r.top - tip.offsetHeight - 6;
        tip.style.left = left + 'px';
        tip.style.top = Math.max(8, top) + 'px';
      });
      const exId = store.get('emu286.exercise', null);
      if (exId && EMU.EXERCISES.some(x => x.id === exId)) this.startExercise(exId, true);
    }

    openPicker(kind) {
      let h;
      if (kind === 'ex') {
        $('pickTitle').textContent = 'Ejercicios con autocorrección';
        const levels = [...new Set(EMU.EXERCISES.map(x => x.level))];
        h = '<p class="note">Elija un ejercicio: se carga el código inicial y la consigna. Escriba su solución y presione <b>✔ Verificar</b>: ' +
          'el programa se ejecuta con varios casos de prueba y se informa qué está bien y qué no. Su progreso queda guardado en este navegador.</p>';
        for (const lv of levels) {
          h += `<h3>${esc(lv)}</h3><div class="pick-grid">`;
          for (const x of EMU.EXERCISES.filter(e => e.level === lv)) {
            h += `<button class="pick-item ${this.done.has(x.id) ? 'done' : ''}" data-pick="ex:${x.id}"><b>${this.done.has(x.id) ? '✅ ' : ''}${esc(x.title)}</b>` +
              `<span>${x.statement.replace(/<[^>]+>/g, '').slice(0, 110)}…</span></button>`;
          }
          h += '</div>';
        }
        h += `<p class="note">Completados: <b>${this.done.size}</b> de ${EMU.EXERCISES.length}.</p>`;
      } else {
        $('pickTitle').textContent = 'Tours guiados';
        h = '<p class="note">Un tour carga un programa, activa los switches necesarios y se detiene en cada instrucción importante con una explicación. ' +
          'En cada parada puede ejecutar la instrucción con <b>F8</b> y observar los paneles resaltados, o seguir con <b>Siguiente</b>.</p><div class="pick-grid">';
        for (const t of EMU.TOURS) h += `<button class="pick-item" data-pick="tour:${t.id}"><b>🧭 ${esc(t.title)}</b><span>${t.steps.length} paradas</span></button>`;
        h += '</div>';
      }
      $('pickBody').innerHTML = h;
      $('pickModal').classList.remove('hidden');
    }

    confirmReplace(what) {
      const cur = this.edUser.value.trim();
      const known = EMU.EXAMPLES.some(e => e.code.trim() === cur) || EMU.EXERCISES.some(e => e.starter.trim() === cur) || EMU.TOURS.some(e => e.code.trim() === cur);
      return !cur || known || confirm(`¿Cargar ${what}? Se reemplazará el código actual (puede guardarlo antes con "Guardar").`);
    }

    // ---------- ejercicios ----------
    startExercise(id, restoring) {
      const ex = EMU.EXERCISES.find(x => x.id === id);
      if (!ex) return;
      if (this.tour) this.endTour();
      const saved = store.get('emu286.ex.' + id, null);
      if (!restoring) {
        if (!this.confirmReplace(`el ejercicio "${ex.title}"`)) return;
        this.opts = { pm: false, idt: false, paging: false, ...ex.opts };
        store.set('emu286.opts', this.opts);
        this.updateSwitches();
        this.setCode(saved || ex.starter);
      }
      this.exercise = ex;
      this.hintN = 0;
      store.set('emu286.exercise', id);
      $('exPanel').classList.remove('hidden');
      $('exLevel').textContent = ex.level;
      $('exTitle').textContent = (this.done.has(ex.id) ? '✅ ' : '') + ex.title;
      $('exBody').classList.remove('hidden');
      $('exToggle').textContent = '▾';
      $('exBody').innerHTML = `<div class="ex-stmt">${ex.statement}</div>` +
        (Object.keys(ex.opts).some(k => ex.opts[k]) ? `<div class="note">Switches: ${['pm', 'idt', 'paging'].filter(k => ex.opts[k]).map(k => ({ pm: 'Modo protegido', idt: 'IDT', paging: 'Paginación' })[k]).join(' + ')} (ya activados).</div>` : '') +
        '<div id="exHints"></div><div id="exResult"></div>';
      this.showEdTab('user');
    }
    closeExercise() {
      this.exercise = null;
      store.set('emu286.exercise', null);
      $('exPanel').classList.add('hidden');
    }
    showHint() {
      const ex = this.exercise;
      if (!ex) return;
      if (this.hintN >= ex.hints.length) { this.flash('No hay más pistas para este ejercicio.'); return; }
      this.hintN++;
      $('exHints').innerHTML = ex.hints.slice(0, this.hintN).map((h, i) => `<div class="ex-hint">💡 Pista ${i + 1}: ${esc(h)}</div>`).join('');
    }
    verifyExercise() {
      const ex = this.exercise;
      if (!ex) return;
      const optsOk = ['pm', 'idt', 'paging'].every(k => !!ex.opts[k] === !!this.opts[k]);
      if (!optsOk) {
        this.opts = { pm: false, idt: false, paging: false, ...ex.opts };
        this.updateSwitches();
        this.optsChanged();
      }
      const r = EMU.checkExercise(ex, this.edUser.value);
      let h = `<div class="ex-verdict ${r.ok ? 'ok' : 'bad'}">${r.ok ? '🎉 ¡Correcto! Pasó todas las pruebas.' : '✖ Todavía no: revise los puntos marcados.'}</div>`;
      for (const c of r.cases) {
        h += `<div class="ex-case"><b>${esc(c.name)}</b>` + c.checks.map(([ok, msg]) => `<div class="${ok ? 'okc' : 'badc'}">${ok ? '✔' : '✖'} ${esc(msg)}</div>`).join('') + '</div>';
      }
      $('exResult').innerHTML = h;
      if (r.ok) {
        this.done.add(ex.id);
        store.set('emu286.done', [...this.done]);
        $('exTitle').textContent = '✅ ' + ex.title;
      }
    }

    // ---------- tours ----------
    startTour(id) {
      const tour = EMU.TOURS.find(t => t.id === id);
      if (!tour) return;
      if (!this.confirmReplace(`el tour "${tour.title}"`)) return;
      this.closeExercise();
      this.opts = { ...tour.opts };
      store.set('emu286.opts', this.opts);
      this.updateSwitches();
      this.setCode(tour.code);
      this.tour = { def: tour, i: 0 };
      this.showTourStep();
    }
    tourStepDef() { return this.tour && this.tour.def.steps[this.tour.i]; }
    showTourStep() {
      const st = this.tourStepDef();
      if (!st) return;
      document.querySelectorAll('.tour-hl').forEach(e => e.classList.remove('tour-hl'));
      const map = { regs: 'regs', segs: 'segs', sysregs: 'sysregs', view: 'viewTabs', curPanel: 'curPanel', lastStep: 'lastStep', screen: 'screen' };
      for (const k of st.hl || []) { const el = $(map[k]); if (el) (k === 'view' ? el.parentElement : el.closest('.panel') || el).classList.add('tour-hl'); }
      if (st.view) { this.view = st.view; this.markTabs('viewTabs', 'view', st.view); }
      if (st.gdtSel !== undefined) this.gdtSel = st.gdtSel;
      if ((st.hl || []).includes('screen') && this.io !== 'screen') $('ioTabs').querySelector('[data-io=screen]').click();
      const n = this.tour.def.steps.length;
      $('tourStepN').textContent = `${this.tour.i + 1}/${n}`;
      $('tourTitle').textContent = st.title;
      $('tourBody').innerHTML = st.html();
      $('tourNext').textContent = this.tour.i + 1 >= n ? 'Terminar ✔' : 'Siguiente ▶';
      $('tourCard').classList.remove('hidden');
      this.render();
    }
    tourNext() {
      if (!this.tour || this.running) return;
      if (this.tour.i + 1 >= this.tour.def.steps.length) { this.endTour(); return; }
      this.tour.i++;
      const st = this.tourStepDef();
      if (!st.at && !st.until) { this.showTourStep(); return; }
      if (!this.ensureReady()) return;
      if (this.cpu.halted) { this.showTourStep(); return; }
      if (st.at) {
        const sym = this.program.symbols.find(s => s.name.toLowerCase() === st.at.toLowerCase());
        if (!sym) { this.showTourStep(); return; }
        this.tempBp = { phys: EMU.PROG_BASE + sym.value, sp: 0 };
      } else this.stopWhen = st.until;
      this.tourPending = true;
      this.noFaultStop = true;
      $('tourBody').innerHTML = '<span class="dim">Ejecutando hasta la próxima parada…</span>';
      this.run(true, true);
    }
    endTour() {
      this.tour = null;
      this.tourPending = false;
      this.noFaultStop = false;
      this.stopWhen = null;
      $('tourCard').classList.add('hidden');
      document.querySelectorAll('.tour-hl').forEach(e => e.classList.remove('tour-hl'));
    }

    markTabs(id, attr, val) {
      for (const b of $(id).querySelectorAll('button')) b.classList.toggle('active', b.dataset[attr] === val);
    }
    showEdTab(t) {
      this.edTab = t;
      this.markTabs('edTabs', 'tab', t);
      $('edUser').classList.toggle('hidden', t !== 'user');
      $('edSystem').classList.toggle('hidden', t !== 'system');
      $('listing').classList.toggle('hidden', t !== 'listing');
      if (t === 'user') this.edUser.refresh();
      if (t === 'system') this.edSys.refresh();
      if (t === 'listing') this.renderListingCur(true);
    }

    setCode(t) {
      this.pause();
      this.edUser.value = t;
      this.edUser.bps.clear();
      this.onCodeChange();
      this.assemble(true);
    }
    loadExample(id) {
      const ex = EMU.EXAMPLES.find(e => e.id === id);
      if (!ex) return;
      if (!this.confirmReplace(`el ejemplo "${ex.title}"`)) return;
      if (this.tour) this.endTour();
      this.closeExercise();
      this.opts = { ...ex.opts };
      store.set('emu286.opts', this.opts);
      this.updateSwitches();
      this.setCode(ex.code);
      this.showEdTab('user');
    }
    onCodeChange() {
      this.dirty = true;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        store.set('emu286.code', this.edUser.value);
        if (this.exercise) store.set('emu286.ex.' + this.exercise.id, this.edUser.value);
      }, 400);
      this.renderStatus();
    }
    optsChanged() {
      store.set('emu286.opts', this.opts);
      this.dirty = true;
      this.pause();
      this.assemble(true);
    }

    // =============================== ensamblado y carga ===============================
    sources() {
      const sys = EMU.buildSystem(this.opts);
      this.sysText = sys;
      const src = [];
      if (sys) src.push({ name: 'system', text: sys });
      src.push({ name: 'user', text: this.edUser.value });
      return src;
    }

    assemble(quiet) {
      this.pause();
      const src = this.sources();
      if (this.edSys.value !== this.sysText) this.edSys.value = this.sysText || '; Active el switch "Modo protegido" para generar aquí la GDT,\n; el código de cambio de modo y (opcionalmente) la IDT y las tablas de páginas.';
      $('tabSystem').classList.toggle('dim', !this.sysText);
      let res;
      try { res = EMU.assemble(src); }
      catch (e) { res = { ok: false, errors: [{ src: 'user', line: 1, msg: 'Error interno del ensamblador: ' + e.message }], stmts: [] }; console.error(e); }
      const errBox = $('errors');
      const userErr = res.errors.filter(e => e.src === 'user').map(e => e.line);
      const sysErr = res.errors.filter(e => e.src === 'system').map(e => e.line);
      this.edUser.setErrors(userErr);
      this.edSys.setErrors(sysErr);
      if (!res.ok) {
        errBox.classList.remove('hidden');
        errBox.innerHTML = res.errors.map((e, i) => `<div data-i="${i}">${e.src === 'system' ? 'Sistema' : 'Línea'} ${e.line}: ${esc(e.msg)}</div>`).join('');
        errBox.onclick = (ev) => {
          const d = ev.target.closest('[data-i]');
          if (!d) return;
          const er = res.errors[+d.dataset.i];
          this.showEdTab(er.src === 'system' ? 'system' : 'user');
          (er.src === 'system' ? this.edSys : this.edUser).goto(er.line);
        };
        this.program = null;
        this.dirty = true;
        this.cpu.trace = null;
        this.render();
        if (!quiet) this.showEdTab(res.errors[0].src === 'system' ? 'system' : 'user');
        return false;
      }
      const size = res.maxAddr >= res.minAddr ? res.maxAddr - res.minAddr + 1 : 0;
      errBox.classList.remove('hidden');
      errBox.onclick = null;
      errBox.innerHTML = `<div class="ok">✓ Ensamblado correcto: ${size} bytes en ${hex(EMU.PROG_SEG, 4)}:${hex(res.minAddr === Infinity ? 0 : res.minAddr, 4)}` +
        ` (física ${hex(EMU.PROG_BASE + (res.minAddr === Infinity ? 0 : res.minAddr), 5)}h)${this.sysText ? ' · incluye el código del sistema' : ''}.</div>`;
      this.program = res;
      this.dirty = false;
      this.lineByPhys.clear(); this.physByLine.clear();
      for (const st of res.stmts) {
        if (st.kind === 'instr' && st.bytes.length) {
          const p = EMU.PROG_BASE + st.addr;
          if (!this.lineByPhys.has(p)) this.lineByPhys.set(p, { src: st.src, line: st.line, st });
          this.physByLine.set(st.src + ':' + st.line, p);
        }
      }
      const sfin = res.symbols.find(s => s.name.toLowerCase() === 'sis_fin_sistema');
      this.userStart = this.sysText && sfin ? EMU.PROG_BASE + sfin.value : null;
      this.buildListing();
      this.loadProgram();
      return true;
    }

    loadProgram() {
      const c = this.cpu, res = this.program;
      c.reset();
      c.mem.fill(0);
      this.bios.install();
      for (const [a, b] of res.image) c.mem[EMU.PROG_BASE + a] = b;
      // Programa estilo .COM (ORG 100h): como en DOS, 1000:0000 contiene INT 20h,
      // así un RET final (que desapila 0000h) termina el programa.
      if (!this.sysText && res.minAddr >= 2 && res.minAddr !== Infinity) { c.mem[EMU.PROG_BASE] = 0xCD; c.mem[EMU.PROG_BASE + 1] = 0x20; }
      const entry = this.sysText ? 0 : res.entry;
      c.loadSeg(1, EMU.PROG_SEG); c.loadSeg(3, EMU.PROG_SEG); c.loadSeg(0, EMU.PROG_SEG); c.loadSeg(2, EMU.STACK_SEG);
      c.setSP(0xFFFE);
      c.ip = entry;
      c.flags = 0x0202;
      c.log = [];
      c.event('cpu', `Programa cargado en ${hex(EMU.PROG_SEG, 4)}:0000 (física ${hex(EMU.PROG_BASE, 5)}h). CS=DS=ES=${hex(EMU.PROG_SEG, 4)}h, SS=${hex(EMU.STACK_SEG, 4)}h, SP=FFFEh, IP=${hex(entry, 4)}h. El CPU arranca en MODO REAL.`);
      c.trace = null;
      c.videoDirty = true;
      this.waitingKey = false;
      $('kbdHint').classList.add('hidden');
      this.stopReason = '';
      this.syncBreakpoints();
      this.render();
    }

    ensureReady() {
      if (this.dirty || !this.program) return this.assemble();
      return true;
    }

    syncBreakpoints() {
      this.bpPhys.clear();
      if (this.program) {
        for (const [ed, src] of [[this.edUser, 'user'], [this.edSys, 'system']]) {
          for (const line of ed.bps) {
            let p;
            for (let l = line; l < line + 200 && p === undefined; l++) p = this.physByLine.get(src + ':' + l);
            if (p !== undefined) this.bpPhys.add(p);
          }
        }
      }
      this.renderListingCur(false);
    }

    // =============================== ejecución ===============================
    curPhys() {
      const e = this.cpu.explainSeg(1, this.cpu.ip);
      return e.walk && e.walk.phys !== undefined ? e.walk.phys : -1;
    }
    peekIns() {
      const c = this.cpu;
      const bytes = [];
      try {
        const ins = EMU.decode((i) => {
          const e = c.explainSeg(1, ((c.ip + i) & c.ipMask()) >>> 0);
          if (e.error || !e.inLimit || !e.walk || e.walk.phys === undefined) throw new Error('nf');
          const b = c.mem[e.walk.phys];
          bytes.push(b);
          return b;
        }, c.ip, c.code32());
        ins.bytes = bytes;
        return ins;
      } catch (e) { return null; }
    }
    haltedMsg() {
      const c = this.cpu;
      if (c.shutdown) return 'El CPU está en SHUTDOWN (triple falta). Presione Reiniciar.';
      if (c.finished) return 'El programa terminó. Presione Reiniciar para volver a ejecutarlo.';
      return 'El CPU está detenido (HLT). Presione Reiniciar o retroceda con Atrás.';
    }

    step() {
      if (this.running) return;
      if (!this.ensureReady()) return;
      const c = this.cpu;
      if (c.halted) { this.flash(this.haltedMsg()); return; }
      c.step();
      this.afterStep(false);
      this.render();
    }
    afterStep(running) {
      const c = this.cpu;
      if (c.waiting) {
        this.waitingKey = true;
        this.resumeOnKey = running;
        $('kbdHint').classList.remove('hidden');
        if (this.io !== 'screen') $('ioTabs').querySelector('[data-io=screen]').click();
        return false;
      }
      if (c.pauseRequest) { this.stopReason = c.pauseRequest; c.pauseRequest = null; return false; }
      if (c.halted) return false;
      if (running && !this.noFaultStop && c.trace && c.trace.fault) { this.stopReason = `Excepción ${EMU.excName(c.trace.fault.vec)}: vea la pestaña Eventos. F5 para continuar.`; return false; }
      return true;
    }

    stepOver() {
      if (this.running) return;
      if (!this.ensureReady()) return;
      const c = this.cpu;
      if (c.halted) { this.flash(this.haltedMsg()); return; }
      const ins = this.peekIns();
      const over = ins && (['call', 'callf', 'int', 'int3', 'into', 'loop', 'loope', 'loopne'].includes(ins.op) ||
        (ins.rep && ['movs', 'cmps', 'stos', 'lods', 'scas'].includes(ins.op)));
      if (!over) { this.step(); return; }
      const e = c.explainSeg(1, ((c.ip + ins.len) & c.ipMask()) >>> 0);
      this.tempBp = { phys: e.walk.phys, sp: c.sp() };
      this.run(true, true);
    }

    toUser() {
      if (this.running) return;
      if (!this.ensureReady()) return;
      if (this.userStart === null || this.userStart === undefined) { this.flash('No hay código del sistema: active el switch "Modo protegido".'); return; }
      if (this.cpu.halted) { this.flash(this.haltedMsg()); return; }
      this.tempBp = { phys: this.userStart, sp: 0 };
      this.run(true, true);
    }

    run(fromKey, fast) {
      if (this.running) return;
      if (!this.ensureReady()) return;
      if (this.cpu.halted) { this.flash(this.haltedMsg()); return; }
      this.running = true;
      this.fast = !!fast;
      this.skipBpOnce = true;
      this.stopReason = '';
      if (!fast && !fromKey) this.tempBp = null;
      this.renderStatus();
      this.tick();
    }
    tick() {
      if (!this.running) return;
      const sp = this.fast ? SPEEDS[5] : SPEEDS[this.speed];
      if (sp.max || sp.batch) {
        const t0 = performance.now();
        do {
          for (let k = 0; k < (sp.max ? 250 : sp.batch); k++) {
            if (!this.runOne()) { this.stopRun(); return; }
          }
        } while (sp.max && performance.now() - t0 < 30);
        this.render();
        this.timer = setTimeout(() => this.tick(), sp.max ? 0 : sp.delay);
      } else {
        if (!this.runOne()) { this.stopRun(); return; }
        this.render();
        this.timer = setTimeout(() => this.tick(), sp.delay);
      }
    }
    runOne() {
      const c = this.cpu;
      if (c.halted) return false;
      if (!this.skipBpOnce) {
        const phys = this.curPhys();
        if (this.tempBp && phys === this.tempBp.phys && c.sp() >= this.tempBp.sp) { this.tempBp = null; return false; }
        if (this.bpPhys.has(phys)) { this.stopReason = 'Punto de ruptura'; return false; }
      }
      this.skipBpOnce = false;
      c.step();
      const ok = this.afterStep(true);
      if (ok && this.stopWhen && this.stopWhen(c)) { this.stopWhen = null; return false; }
      return ok;
    }
    stopRun() {
      this.running = false;
      this.fast = false;
      clearTimeout(this.timer);
      if (this.tourPending) {
        this.tourPending = false;
        this.noFaultStop = false;
        this.stopWhen = null;
        this.tempBp = null;
        this.showTourStep();
        return;
      }
      if (this.stopReason && this.stopReason !== '') this.flash(this.stopReason);
      this.render();
    }
    pause(reason) {
      if (!this.running) return;
      this.stopReason = reason || '';
      this.tempBp = null;
      this.stopRun();
    }
    back() {
      if (this.running) return;
      if (!this.cpu.stepBack()) { this.flash('No hay más pasos para deshacer.'); return; }
      this.waitingKey = false;
      $('kbdHint').classList.add('hidden');
      this.render();
    }
    resetCPU() {
      this.pause();
      if (this.dirty) { this.assemble(); return; }
      if (this.program) this.loadProgram();
    }

    flash(msg) {
      this.flashMsg = msg;
      this.renderStatus();
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => { this.flashMsg = null; this.renderStatus(); }, 5000);
    }

    editReg(name) {
      if (this.running) return;
      const c = this.cpu;
      const cur = name === 'ip' ? c.ip : c.r[+name];
      const v = prompt(`Nuevo valor para ${name === 'ip' ? 'IP' : EMU.REG32_NAMES[+name]} (hexadecimal):`, hex(cur, name === 'ip' ? 4 : 8));
      if (v === null) return;
      const n = parseInt(v.replace(/h$/i, ''), 16);
      if (isNaN(n)) return;
      if (name === 'ip') c.ip = (n & c.ipMask()) >>> 0; else c.r[+name] = n >>> 0;
      c.trace = null;
      this.render();
    }

    // =============================== render ===============================
    render() {
      this.renderStatus();
      this.renderCurLine();
      this.renderRegs();
      this.renderSegs();
      this.renderSys();
      this.renderCur();
      this.renderLast();
      this.renderView();
      this.renderScreen();
      this.renderEvents();
    }

    renderStatus() {
      const c = this.cpu;
      const mb = $('modeBadge');
      if (!c.pe()) { mb.textContent = 'MODO REAL'; mb.className = 'badge real'; }
      else if (c.pg()) { mb.textContent = 'PROTEGIDO + PAGINACIÓN'; mb.className = 'badge pg'; }
      else { mb.textContent = `MODO PROTEGIDO · CPL ${c.cpl()}`; mb.className = 'badge pm'; }
      const sb = $('stateBadge');
      let st = 'Listo', cls = 'badge';
      if (!this.program) { st = this.dirty ? 'Sin ensamblar' : 'Errores'; cls = 'badge bad'; }
      else if (this.running) { st = this.fast ? 'Ejecutando (rápido)…' : 'Ejecutando…'; cls = 'badge run'; }
      else if (c.shutdown) { st = 'TRIPLE FALTA'; cls = 'badge bad'; }
      else if (c.finished) { st = 'Programa terminado'; }
      else if (c.halted) { st = 'Detenido (HLT)'; }
      else if (this.waitingKey) { st = 'Esperando tecla'; cls = 'badge run'; }
      else if (this.dirty) { st = 'Código modificado'; cls = 'badge run'; }
      if (this.flashMsg) { st = this.flashMsg; cls = 'badge run'; }
      sb.textContent = st; sb.className = cls;
      $('countBadge').textContent = `${c.icount} instr.`;
      const r = this.running;
      $('btnPause').disabled = !r;
      for (const id of ['btnStep', 'btnOver', 'btnAssemble', 'btnRun', 'btnReset']) $(id).disabled = r;
      $('btnBack').disabled = r || !c.history.length;
      $('btnToUser').disabled = r || !this.sysText;
    }

    renderCurLine() {
      const running = this.running && (this.fast || SPEEDS[this.speed].max || SPEEDS[this.speed].batch);
      const info = this.lineByPhys.get(this.curPhys());
      const inSys = info && info.src === 'system';
      this.edUser.setCurrent(info && info.src === 'user' ? info.line : -1, !running);
      this.edSys.setCurrent(inSys ? info.line : -1, !running);
      if (!running && info && !this.cpu.halted) {
        if (inSys && this.edTab === 'user') this.showEdTab('system');
        else if (!inSys && this.edTab === 'system') this.showEdTab('user');
      }
      this.renderListingCur(!running);
    }

    buildListing() {
      const rows = [];
      for (const st of this.program.stmts) {
        if (!st.bytes.length && !st.label) continue;
        const b = st.bytes.slice(0, 8).map(x => hex(x, 2)).join(' ') + (st.bytes.length > 8 ? ' …' : '');
        const p = EMU.PROG_BASE + st.addr;
        rows.push(`<tr data-phys="${p}" data-src="${st.src}" data-line="${st.line}" class="${st.src === 'system' ? 'sys' : ''}">` +
          `<td class="addr">${hex(EMU.PROG_SEG, 4)}:${hex(st.addr, 4)}</td><td class="phys">${hex(p, 5)}</td>` +
          `<td class="bytes">${b}</td><td class="src">${esc(st.text.replace(/\t/g, '        '))}</td></tr>`);
      }
      $('listing').innerHTML = '<table><tbody>' + rows.join('') + '</tbody></table>';
      this.listRows = new Map();
      for (const tr of $('listing').querySelectorAll('tr')) this.listRows.set(+tr.dataset.phys, tr);
    }
    renderListingCur(scroll) {
      if (!this.listRows) return;
      if (this.listCurRow) this.listCurRow.classList.remove('cur');
      const tr = this.listRows.get(this.curPhys());
      this.listCurRow = tr;
      if (tr) {
        tr.classList.add('cur');
        if (scroll && this.edTab === 'listing') tr.scrollIntoView({ block: 'nearest' });
      }
      for (const [p, row] of this.listRows) row.classList.toggle('bp', this.bpPhys.has(p));
    }

    renderRegs() {
      const c = this.cpu, b = c.trace ? c.trace.before : null;
      const order = [0, 3, 1, 2, 4, 5, 6, 7];
      let h = '<table class="regs"><tr><th></th><th>32 bits <span class="hi16">(parte alta)</span> │ 16 bits</th><th>alto</th><th>bajo</th><th>decimal</th></tr>';
      for (const i of order) {
        const v = c.r[i], lo = v & 0xFFFF;
        const ch = b && b.r[i] !== v;
        const hl = i < 4 ? `<td>${EMU.REG8_NAMES[i + 4][0]}H=${hex(lo >> 8, 2)}</td><td>${EMU.REG8_NAMES[i]}=${hex(lo & 0xFF, 2)}</td>` : '<td></td><td></td>';
        const wide = v > 0xFFFF;
        const dec = wide ? v : lo;
        const sg = wide ? (v | 0) : (lo >= 0x8000 ? lo - 0x10000 : lo);
        h += `<tr class="${ch ? 'changed' : ''}" title="${esc(REG_DESC[i])}"><td class="n hist" data-hist="r${i}" title="Ver el historial de ${EMU.REG32_NAMES[i]}">${EMU.REG32_NAMES[i]}<span class="faint"> ${EMU.REG16_NAMES[i]}</span></td>` +
          `<td class="v" data-reg="${i}"><span class="${wide ? '' : 'hi16'}">${hex(v >>> 16, 4)}</span> ${hex(lo, 4)}</td>${hl}` +
          `<td>${dec}${sg < 0 ? ` <span class="faint">(${sg})</span>` : ''}</td></tr>`;
      }
      h += '</table>';
      const ipch = b && b.ip !== c.ip;
      const cse = c.explainSeg(1, c.ip);
      const c32 = c.code32();
      h += `<div class="ipline"><span class="${ipch ? 'chg' : ''}"><b class="hist" data-hist="ip" title="Ver el historial de EIP">EIP</b> <span data-reg="ip" style="cursor:pointer">${hex(c.ip, 8)}</span></span>` +
        `<span><b>CS:${c32 ? 'EIP' : 'IP'}</b> ${hex(c.s[1].sel, 4)}:${hex(c.ip, c32 ? 8 : 4)} → ${gl('fisica', 'física')} ${cse.walk && cse.walk.phys !== undefined ? hex(cse.walk.phys, 6) : '??'}</span>` +
        `<span><b class="hist" data-hist="flags" title="Ver el historial de EFLAGS">${gl('flags', 'EFLAGS')}</b> ${hex(c.flags, 8)}</span>` +
        `<span class="badge ${c32 ? 'pm' : ''}" title="Tamaño por defecto de operandos y direcciones (bit D del segmento de código)">código de ${c32 ? '32' : '16'} bits</span></div>`;
      h += '<div class="flags">';
      for (const [n, bit, d] of FLAG_INFO) {
        const on = (c.flags & bit) !== 0;
        const chg = b && ((b.flags ^ c.flags) & bit);
        h += `<div class="flag ${on ? 'on' : ''} ${chg ? 'changed' : ''}" data-flag="${bit}" title="${esc(d)} — clic para invertir">${n}<b>${on ? 1 : 0}</b></div>`;
      }
      h += `<div class="flag" title="I/O Privilege Level: nivel necesario para IN/OUT/CLI/STI">IOPL<b>${c.iopl()}</b></div>`;
      h += `<div class="flag ${c.flags & F.NT ? 'on' : ''}" title="Nested Task: tarea anidada">NT<b>${(c.flags >> 14) & 1}</b></div>`;
      h += `<div class="flag" title="Resume Flag (386, bit 16): suspende los puntos de ruptura de depuración por una instrucción">RF<b>${(c.flags >>> 16) & 1}</b></div>`;
      h += `<div class="flag" title="Virtual 8086 (386, bit 17): ejecuta programas de 8086 dentro del modo protegido (no implementado)">VM<b>${(c.flags >>> 17) & 1}</b></div></div>`;
      $('regs').innerHTML = h;
    }

    renderSegs() {
      const c = this.cpu, b = c.trace ? c.trace.before : null;
      const pe = c.pe();
      let h = '';
      for (const si of [1, 3, 2, 0, 4, 5]) {
        const s = c.s[si];
        const ch = b && (b.s[si].sel !== s.sel || b.s[si].base !== s.base || b.s[si].limit !== s.limit || b.s[si].acc !== s.acc);
        const role = ['segmento extra (destino de cadenas)', 'segmento de CÓDIGO (con EIP)', 'segmento de PILA (con ESP, EBP)', 'segmento de DATOS (por defecto)',
          'segmento extra FS (386)', 'segmento extra GS (386)'][si];
        h += `<div class="seg ${ch ? 'changed' : ''}"><div class="seg-head"><span class="n">${SN[si]}</span><span class="sel">${hex(s.sel, 4)}h</span>`;
        const fromDesc = s.desc !== undefined;
        if (pe && fromDesc) h += selParts(s.sel);
        h += `<span class="dim" style="font-family:var(--sans);font-size:11px">${role}</span></div>`;
        if (pe && !s.valid) {
          h += '<div class="cache">selector NULO: la caché es inválida (usarlo para acceder a memoria provoca #GP)</div>';
        } else if (!fromDesc) {
          h += `<div class="cache">base = ${hex(s.sel, 4)}h × 16 = <b>${hex(s.base, 5)}h</b> · límite <b>${hx(s.limit)}h</b> <span class="faint">(modo real)</span></div>`;
          if (!pe && s.limit !== 0xFFFF) h += '<div class="warnnote">"Modo irreal": el límite quedó de cuando se cargó en modo protegido (el 386 lo conserva al volver a modo real).</div>';
          if (pe) h += `<div class="warnnote">⚠ La caché conserva los valores de MODO REAL: el registro todavía no se recargó con un selector de la GDT${si === 1 ? ' (falta el salto lejano)' : ''}.</div>`;
        } else {
          const a = EMU.describeAccess(s.acc);
          const sz = (s.acc & 8) ? (s.gd & 0x40 ? ' · <b>D=1: 32 bits</b>' : ' · D=0: 16 bits') : (si === 2 && (s.gd & 0x40) ? ' · <b>B=1: usa ESP</b>' : '');
          h += `<div class="cache">caché: base <b>${hex(s.base, 8)}h</b> · límite <b>${hx(s.limit)}h</b>${s.gd & 0x80 ? ' <span class="faint">(G=1)</span>' : ''} · acceso <b>${hex(s.acc, 2)}h</b>${sz} <span class="faint">(${esc(a.txt)}, DPL ${a.dpl}, P=${a.p})</span></div>`;
          if (!pe) h += '<div class="warnnote">Caché cargada en modo protegido.</div>';
        }
        h += '</div>';
      }
      $('segs').innerHTML = h;
    }

    renderSys() {
      const c = this.cpu, b = c.trace ? c.trace.before : null;
      const cr0bits = [['PG', 31, 'Paging: paginación activada (386)'], ['TS', 3, 'Task Switched'], ['EM', 2, 'Emulate coprocessor'],
        ['MP', 1, 'Monitor coprocessor'], ['PE', 0, 'Protection Enable: 1 = modo protegido']];
      const cls = (x, y) => (b && x !== y) ? 'chg' : '';
      let h = `<div class="kv">`;
      h += `<span class="k ${cls(b && b.cr0, c.cr0)}">${gl('cr0', 'CR0')}</span><span>${hex(c.cr0, 8)}h <span class="faint">(${gl('msw', 'MSW')} = ${hex(c.cr0 & 0xFFFF, 4)}h)</span><div class="bits">${flagBits(c.cr0, cr0bits)}</div></span>`;
      h += `<span class="k ${cls(b && b.cr2, c.cr2)}">${gl('cr2', 'CR2')}</span><span>${hex(c.cr2, 8)}h <span class="d">dirección lineal de la última falla de página</span></span>`;
      h += `<span class="k ${cls(b && b.cr3, c.cr3)}">${gl('cr3', 'CR3')}</span><span>${hex(c.cr3, 8)}h <span class="d">base física del directorio de páginas</span></span>`;
      const g = c.gdtr, i = c.idtr;
      const gch = b && (b.gdtr.base !== g.base || b.gdtr.limit !== g.limit), ich = b && (b.idtr.base !== i.base || b.idtr.limit !== i.limit);
      h += `<span class="k ${gch ? 'chg' : ''}">${gl('gdtr', 'GDTR')}</span><span>base ${hex(g.base, 6)}h · límite ${hex(g.limit, 4)}h <span class="d">→ ${Math.floor((g.limit + 1) / 8)} descriptores${g.limit === 0 ? ' (no cargada)' : ''}</span></span>`;
      h += `<span class="k ${ich ? 'chg' : ''}">${gl('idtr', 'IDTR')}</span><span>base ${hex(i.base, 6)}h · límite ${hex(i.limit, 4)}h <span class="d">→ ${c.pe() ? Math.floor((i.limit + 1) / 8) + ' compuertas' : 'IVT de ' + Math.floor((i.limit + 1) / 4) + ' vectores (modo real)'}</span></span>`;
      h += `<span class="k">${gl('ldt', 'LDTR')}</span><span>${hex(c.ldtr.sel, 4)}h ${c.ldtr.valid ? `· base ${hex(c.ldtr.base, 6)}h límite ${hex(c.ldtr.limit, 4)}h` : '<span class="d">(sin LDT)</span>'}</span>`;
      h += `<span class="k">${gl('tss', 'TR')}</span><span>${hex(c.tr.sel, 4)}h ${c.tr.valid ? `· TSS base ${hex(c.tr.base, 6)}h` : '<span class="d">(sin TSS)</span>'}</span>`;
      h += `<span class="k">${gl('cpl', 'CPL')}</span><span>${c.cpl()} <span class="d">nivel de privilegio actual (${c.pe() ? 'RPL de CS' : 'modo real: siempre 0'})</span></span>`;
      h += '</div>';
      $('sysregs').innerHTML = h;
    }

    renderCur() {
      const c = this.cpu;
      const el = $('curInstr');
      if (!this.program) { el.innerHTML = '<span class="dim">Ensamble el programa para comenzar.</span>'; return; }
      let h = '';
      if (c.halted) h += `<div class="ci-main" style="color:var(--dim)">${esc(this.haltedMsg())}</div>`;
      const ins = this.peekIns();
      const e = c.explainSeg(1, c.ip);
      const info = this.lineByPhys.get(this.curPhys());
      if (ins) {
        if (!c.halted) h += `<div class="ci-main">${esc(EMU.formatIns(ins))}</div>`;
        h += '<div class="ci-grid">';
        h += `<span class="k">Lógica</span><span>CS:${c.code32() ? 'EIP' : 'IP'} = ${hex(c.s[1].sel, 4)}:${hex(c.ip, c.code32() ? 8 : 4)}</span>`;
        h += `<span class="k">Lineal</span><span>${e.lin !== undefined ? hex(e.lin, 8) + 'h' : '—'}</span>`;
        h += `<span class="k">Física</span><span>${e.walk && e.walk.phys !== undefined ? hex(e.walk.phys, 6) + 'h' : '— (página no presente)'}</span>`;
        h += `<span class="k">Código máquina</span><span>${ins.bytes.map(x => hex(x, 2)).join(' ')} <span class="faint">(${ins.len} byte${ins.len > 1 ? 's' : ''})</span></span>`;
        if (info) h += `<span class="k">Fuente</span><span>${info.src === 'system' ? 'Sistema' : 'Programa'}, línea ${info.line}: <span class="dim">${esc(info.st.text.trim())}</span></span>`;
        else if (e.walk && e.walk.phys >= EMU.BIOS_BASE && e.walk.phys < 0x100000) h += `<span class="k">Fuente</span><span class="dim">ROM BIOS simulada (rutina de interrupción)</span>`;
        h += '</div>';
        const d = DESC[ins.op];
        if (d && !c.halted) h += `<div class="ci-desc">${esc(d)}</div>`;
      } else if (!c.halted) {
        h += '<div class="ci-main" style="color:var(--err)">No se puede leer la instrucción en CS:IP</div><div class="ci-desc">La dirección está fuera del límite del segmento o en una página no presente: al ejecutar se producirá una excepción.</div>';
      }
      el.innerHTML = h;
    }

    accText(a, i) {
      const sz = SIZE_NAME[a.size] || a.size + ' bytes';
      if (a.t === 'R' || a.t === 'W') {
        return `<div class="ls-acc ${a.t}" data-acc="${i}" title="Ver la traducción de esta dirección"><span class="t">${a.t === 'R' ? 'L' : 'E'}</span>` +
          `${a.t === 'R' ? 'Lee' : 'Escribe'} ${sz} ${SN[a.si]}:${hx(a.off)} → lin ${hex(a.lin, 8)} → fís ${hex(a.phys, 6)} = <b>${hex(a.v, a.size * 2)}h</b>` +
          `${a.tag ? ` <span class="faint">(${esc(a.tag)})</span>` : ''}</div>`;
      }
      if (a.t === 'D') return `<div class="ls-acc S" data-acc="${i}"><span class="t">S</span>Lee el descriptor ${a.table}[${a.idx}] (selector ${hex(a.sel, 4)}h) en lin ${hex(a.lin, 8)} → fís ${hex(a.phys, 6)}</div>`;
      if (a.t === 'G') return `<div class="ls-acc S" data-acc="${i}"><span class="t">S</span>Lee la compuerta IDT[${a.vec}] en lin ${hex(a.lin, 8)} → fís ${hex(a.phys, 6)}</div>`;
      if (a.t === 'V') return `<div class="ls-acc S" data-acc="${i}"><span class="t">S</span>Lee el vector IVT[${hex(a.vec, 2)}h] en fís ${hex(a.phys, 5)} = ${hex(Math.floor(a.v / 65536), 4)}:${hex(a.v & 0xFFFF, 4)}</div>`;
      return '';
    }

    renderLast() {
      const c = this.cpu, t = c.trace, el = $('lastStep');
      if (!t || !t.before) { el.innerHTML = '<span class="dim">Todavía no se ejecutó ninguna instrucción (use Paso / F8).</span>'; return; }
      const b = t.before;
      let h = '';
      if (t.ins) h += `<div class="ls-row"><b>${esc(EMU.formatIns(t.ins))}</b> <span class="faint">en ${hex(t.cs, 4)}:${hex(t.ip, 4)}</span></div>`;
      let xp = '';
      try { xp = EMU.explainStep(t, c); } catch (e) { console.error(e); }
      if (xp) h += `<div class="xpl">💬 ${xp}</div>`;
      if (t.fault) h += `<div class="ls-row" style="color:var(--err)">✖ ${esc(EMU.excName(t.fault.vec))}: ${esc(t.fault.msg)}</div>`;
      const ch = [];
      for (let i = 0; i < 8; i++) if (b.r[i] !== c.r[i]) {
        const wide = (b.r[i] >>> 16) !== (c.r[i] >>> 16);
        ch.push(`${wide ? EMU.REG32_NAMES[i] : EMU.REG16_NAMES[i]} ${hex(wide ? b.r[i] : b.r[i] & 0xFFFF, wide ? 8 : 4)}→${hex(wide ? c.r[i] : c.r[i] & 0xFFFF, wide ? 8 : 4)}`);
      }
      if (b.ip !== c.ip || (t.ins && b.ip + t.ins.len !== c.ip)) ch.push(`EIP ${hx(b.ip)}→${hx(c.ip)}`);
      const fch = FLAG_INFO.filter(([, bit]) => (b.flags ^ c.flags) & bit).map(([n, bit]) => `${n}=${(c.flags & bit) ? 1 : 0}`);
      if (fch.length) ch.push('banderas: ' + fch.join(' '));
      for (let si = 0; si < 6; si++) if (b.s[si].sel !== c.s[si].sel || b.s[si].base !== c.s[si].base) ch.push(`${SN[si]} ${hex(b.s[si].sel, 4)}→${hex(c.s[si].sel, 4)} (base ${hex(c.s[si].base, 6)})`);
      if (b.cr0 !== c.cr0) ch.push(`CR0 ${hex(b.cr0, 8)}→${hex(c.cr0, 8)}`);
      if (b.cr2 !== c.cr2) ch.push(`CR2 ←${hex(c.cr2, 8)}`);
      if (b.cr3 !== c.cr3) ch.push(`CR3 ←${hex(c.cr3, 8)}`);
      if (b.gdtr.base !== c.gdtr.base || b.gdtr.limit !== c.gdtr.limit) ch.push(`GDTR ← ${hex(c.gdtr.base, 6)}/${hex(c.gdtr.limit, 4)}`);
      if (b.idtr.base !== c.idtr.base || b.idtr.limit !== c.idtr.limit) ch.push(`IDTR ← ${hex(c.idtr.base, 6)}/${hex(c.idtr.limit, 4)}`);
      if (ch.length) h += `<div class="ls-row"><span class="dim">Cambios:</span> <span class="chg">${esc(ch.join(' · '))}</span></div>`;
      const acc = t.acc.map((a, i) => this.accText(a, i)).filter(Boolean);
      if (acc.length) h += `<div class="ls-row dim">Accesos a memoria (clic = ver traducción):</div>` + acc.join('');
      for (const ev of t.ev) h += `<div class="ls-row" style="color:${ev.type === 'exc' ? 'var(--err)' : ev.type === 'mode' ? 'var(--purple)' : 'var(--dim)'};font-family:var(--sans)">• ${esc(ev.msg)}</div>`;
      el.innerHTML = h;
    }

    // =============================== vistas ===============================
    renderView() {
      const el = $('view');
      if (this.view !== this.lastView) { el.scrollTop = 0; this.lastView = this.view; }
      const keep = el.scrollTop;
      let h = '';
      try {
        switch (this.view) {
          case 'xlate': h = this.viewXlate(); break;
          case 'mem': h = this.viewMem(); break;
          case 'stack': h = this.viewStack(); break;
          case 'gdt': h = this.viewGdt(); break;
          case 'idt': h = this.viewIdt(); break;
          case 'paging': h = this.viewPaging(); break;
          case 'map': h = this.viewMap(); break;
          case 'hist': h = this.viewHist(); break;
        }
      } catch (e) { console.error(e); h = `<div class="np">Error al dibujar la vista: ${esc(e.message)}</div>`; }
      const focused = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
      el.innerHTML = h;
      el.scrollTop = keep;
      if (focused && $(focused)) $(focused).focus();
    }

    // ---------- Traducción ----------
    viewXlate() {
      const c = this.cpu, t = c.trace;
      const items = [{ id: 'ip', lbl: 'Próxima instrucción (CS:IP)' }, { id: 'sp', lbl: 'Tope de pila (SS:SP)' }];
      if (t) t.acc.forEach((a, i) => {
        if (a.t === 'R' || a.t === 'W') items.push({ id: 'acc' + i, lbl: `${a.t === 'R' ? 'Lectura' : 'Escritura'} ${SN[a.si]}:${hx(a.off)}` });
        else if (a.t === 'D') items.push({ id: 'acc' + i, lbl: `Descriptor ${a.table}[${a.idx}]` });
        else if (a.t === 'G') items.push({ id: 'acc' + i, lbl: `Compuerta IDT[${a.vec}]` });
      });
      items.push({ id: 'manual', lbl: 'Manual…' });
      if (!items.some(x => x.id === this.xlSel)) this.xlSel = 'ip';
      const mode = this.xlMode || 'diagram';
      let h = `<div class="seg-toggle"><button data-xlmode="diagram" class="${mode === 'diagram' ? 'active' : ''}">Diagrama animado</button>` +
        `<button data-xlmode="detail" class="${mode === 'detail' ? 'active' : ''}">Detalle paso a paso</button>` +
        (mode === 'diagram' ? '<button data-act="replay" title="Volver a reproducir la animación">↻ Repetir animación</button>' : '') + '</div>';
      h += '<div class="xl-sel">' + items.map(x => `<button data-xl="${x.id}" class="${x.id === this.xlSel ? 'active' : ''}">${esc(x.lbl)}</button>`).join('') + '</div>';
      let p;
      if (this.xlSel === 'ip') p = { name: 'CS', si: 1, sel: c.s[1].sel, off: c.ip, cache: c.s[1], pe: c.pe() };
      else if (this.xlSel === 'sp') p = { name: 'SS', si: 2, sel: c.s[2].sel, off: c.sp(), cache: c.s[2], pe: c.pe(), size: c.stk32() ? 4 : 2 };
      else if (this.xlSel === 'manual') {
        const m = this.xlManual || { sel: c.s[3].sel, off: 0, lin: '' };
        this.xlManual = m;
        h += `<div class="xl-manual">${c.pe() ? 'Selector' : 'Segmento'} <input type="text" id="xlSel" value="${hex(m.sel, 4)}"> : desplazamiento <input type="text" id="xlOff" value="${hx(m.off)}">
          <button data-act="xlgo">Traducir</button> <span>o dirección lineal</span> <input type="text" id="xlLin" value="${m.lin}"> <button data-act="xlgolin">Traducir lineal</button></div>`;
        if (m.lin !== '') p = { linOnly: parseInt(m.lin, 16) >>> 0 };
        else {
          const r = c.explainSelector(m.sel, m.off);
          if (r.error) return h + `<div class="stage fault">Selector ${hex(m.sel, 4)}h: ${esc(r.error)} → provocaría #GP</div>`;
          p = { name: c.pe() ? 'sel' : 'seg', sel: m.sel, off: m.off, cache: r, pe: c.pe(), fromTable: !!r.desc };
        }
      } else {
        const a = t.acc[+this.xlSel.slice(3)];
        if (a.t === 'R' || a.t === 'W') p = { name: SN[a.si], si: a.si, sel: a.seg.sel, off: a.off, cache: a.seg, pe: a.pe, acc: a };
        else p = { linOnly: a.lin, sys: a };
      }
      if (mode === 'detail') return h + this.pipeline(p);
      // animar solo cuando cambia lo que se muestra (no en cada cuadro de una ejecución rápida)
      const sig = this.xlSel + ':' + c.icount + ':' + (this.animNonce || 0);
      const anim = !this.running && sig !== this.lastAnimSig;
      this.lastAnimSig = sig;
      return h + this.diagram(p, anim);
    }

    // Diagrama de la traducción lógica → lineal → física, con animación secuencial
    diagram(p, anim) {
      const c = this.cpu;
      let k = 0;
      const row = (inner, cls) => {
        const d = (k++ * 0.45).toFixed(2) + 's';
        return `<div class="dg-row ${cls || ''} ${anim ? 'anim' : ''}"${anim ? ` style="animation-delay:${d};--d:${d}"` : ''}>${inner}</div>`;
      };
      const arrow = (txt) => row(`<div class="dg-arrow"><span class="ar">▼</span> <span>${txt || ''}</span></div>`, 'dg-a');
      let h = '<div class="dg">';
      let lin;
      if (p.linOnly === undefined) {
        const s = p.cache, off = p.off >>> 0, sel = p.sel;
        h += row(`<div class="dg-box logic"><div class="dg-lbl">${gl('logica', 'Dirección LÓGICA')}</div><div class="dg-chips">` +
          `<span class="chip sel">${p.name} = ${hex(sel, 4)}h</span><span class="op">:</span><span class="chip off">${hx(off)}h</span></div></div>`);
        const realCache = s.desc === undefined && !p.fromTable;
        if (p.pe && s.valid === false) return h + row('<div class="dg-box fault">Selector NULO → cualquier acceso produce #GP</div>') + '</div>';
        if (!p.pe || realCache) {
          h += arrow(`${gl('segmento', 'segmentación')} de ${gl('modoreal', 'modo real')}: sin tablas`);
          h += row(`<div class="dg-calc"><span class="chip sel">${hex(sel, 4)}h</span> × 16 = <span class="chip base">${hex(s.base, 5)}h</span> <span class="dim">= ${gl('base', 'base')}</span></div>`);
          lin = (s.base + off) >>> 0;
          h += row(`<div class="dg-calc"><span class="chip base">${hex(s.base, 5)}h</span> + <span class="chip off">${hx(off)}h</span> = <span class="chip lin">${hex(lin, 5)}h</span></div>`);
        } else {
          const idx = sel >> 3, ti = (sel >> 2) & 1, tbl = ti ? c.ldtr : c.gdtr;
          h += arrow(`el ${gl('selector', 'selector')} indica qué ${gl('descriptor', 'descriptor')} usar`);
          h += row(`<div class="dg-calc">${selParts(sel)} → ${ti ? 'LDT' : gl('gdtr', 'GDTR')}.base ${hex(tbl.base, 6)}h + ${idx} × 8 = <b>${hex((tbl.base + idx * 8) >>> 0, 6)}h</b></div>`);
          const rows = [];
          for (let i = Math.max(0, idx - 1); i <= idx + 1; i++) {
            const d = c.peekDescriptor((i * 8) | (sel & 4));
            if (d.error) continue;
            rows.push(`<tr class="${i === idx ? 'hlrow' : ''}"><td>${i}</td><td>${hex(i * 8, 4)}h</td><td>${hex(d.base, 8)}</td><td>${hx(d.limit)}</td><td>${esc(EMU.describeAccess(d.acc).txt)}${(d.acc & 0x18) === 0x18 ? (d.gd & 0x40 ? ', 32 bits' : ', 16 bits') : ''}</td></tr>`);
          }
          h += row(`<div class="dg-table"><div class="dg-lbl">${ti ? 'LDT' : gl('gdt', 'GDT')} en memoria</div><table><tr><th>#</th><th>selector</th><th>base</th><th>límite</th><th>tipo</th></tr>${rows.join('')}</table></div>`);
          const expDown = !(s.acc & 8) && (s.acc & 4);
          const size = p.acc ? p.acc.size : (p.size || 1);
          const okLim = expDown ? off > s.limit : off + size - 1 <= s.limit;
          h += arrow(`${p.fromTable ? 'datos del descriptor' : gl('cache', 'caché oculta de ' + p.name)}: ${gl('base', 'base')} ${hex(s.base, 6)}h · ${gl('limite', 'límite')} ${hx(s.limit)}h`);
          h += row(`<div class="dg-calc">${hx(off)}h${size > 1 ? ` (+${size - 1})` : ''} ${expDown ? '>' : '≤'} ${hx(s.limit)}h ${okLim ? '<span class="ok">✓ dentro del límite</span>' : '<span class="bad">✗ fuera del límite → #GP</span>'}</div>`);
          if (!okLim) return h + '</div>';
          lin = (s.base + off) >>> 0;
          h += row(`<div class="dg-calc"><span class="chip base">${hex(s.base, 6)}h</span> + <span class="chip off">${hx(off)}h</span> = <span class="chip lin">${hex(lin, 8)}h</span></div>`);
        }
      } else lin = p.linOnly >>> 0;
      h += row(`<div class="dg-box lin"><div class="dg-lbl">${gl('lineal', 'Dirección LINEAL')}</div><div class="big">${hex(lin, 8)}h</div></div>`);
      const w = c.walk(lin);
      if (!w.pg) {
        h += arrow(`${gl('paginacion', 'paginación')} desactivada: física = lineal`);
      } else {
        const tlbHit = c.tlbOn && c.tlb.has(lin >>> 12);
        h += arrow('la paginación divide la dirección lineal en 3 campos' + (tlbHit ? ` · <b>${gl('tlb', 'TLB')}: esta página ya está en la TLB</b>` : ''));
        h += row(`<div class="dg-chips"><span class="chip d">directorio ${w.dir}</span><span class="chip t">tabla ${w.tab}</span><span class="chip o">desplaz. ${hex(w.off, 3)}h</span></div>` +
          `<div class="dg-bits"><span class="d">${EMU.bin(w.dir, 10)}</span> <span class="t">${EMU.bin(w.tab, 10)}</span> <span class="o">${EMU.bin(w.off, 12)}</span></div>`);
        const mini = (title, base, idx) => {
          let r = '';
          for (let i = Math.max(0, idx - 1); i <= Math.min(1023, idx + 1); i++) {
            const v = c.pr32(base + i * 4);
            r += `<tr class="${i === idx ? 'hlrow' : ''}"><td>${i}</td><td>${hex(v, 8)}</td><td>${v & 1 ? hex(v & 0xFFFFF000, 6) : '<span class="np">no presente</span>'}</td></tr>`;
          }
          return `<div class="dg-table"><div class="dg-lbl">${title} (física ${hex(base, 6)}h)</div><table><tr><th>#</th><th>entrada</th><th>apunta a</th></tr>${r}</table></div>`;
        };
        const pd = (w.cr3 & 0xFFFFF000) >>> 0;
        h += row(`<div class="dg-pair"><div class="dg-box small"><div class="dg-lbl">${gl('cr3', 'CR3')}</div>${hex(pd, 6)}h</div><span class="op">→</span>${mini(`Directorio · ${gl('pde', 'PDE')}`, pd, w.dir)}</div>`);
        if (w.fault === 'PDE no presente') return h + row(`<div class="dg-box fault">PDE ${w.dir} no presente → ${gl('falla', 'falla')} de página #PF (CR2 ← ${hex(lin, 8)}h)</div>`) + '</div>';
        h += arrow(`la PDE ${w.dir} apunta a la tabla de páginas en ${hex(w.ptBase, 6)}h`);
        h += row(mini(`Tabla de páginas · ${gl('pte', 'PTE')}`, w.ptBase, w.tab));
        if (w.fault) return h + row(`<div class="dg-box fault">PTE ${w.tab} no presente → ${gl('falla', 'falla')} de página #PF (CR2 ← ${hex(lin, 8)}h)</div>`) + '</div>';
        h += arrow(`la PTE ${w.tab} indica el ${gl('marco', 'marco')} físico ${hex(w.frame, 6)}h`);
        h += row(`<div class="dg-calc"><span class="chip base">${hex(w.frame, 6)}h</span> + <span class="chip o">${hex(w.off, 3)}h</span> = <span class="chip phys">${hex(w.phys, 6)}h</span></div>`);
      }
      h += row(`<div class="dg-box phys"><div class="dg-lbl">${gl('fisica', 'Dirección FÍSICA')}</div><div class="big">${hex(w.phys, 6)}h</div>` +
        `<div class="dim">${esc(this.regionName(w.phys))} · contiene ${hex(c.mem[w.phys], 2)}h</div></div>`);
      return h + '</div>';
    }

    pipeline(p) {
      const c = this.cpu;
      let h = '<div class="pipe">';
      let lin;
      if (p.linOnly === undefined) {
        const s = p.cache, off = p.off >>> 0;
        h += `<div class="stage logic"><h4>Dirección LÓGICA (${p.pe ? 'selector:desplazamiento' : 'segmento:desplazamiento'})</h4>` +
          `<div class="big">${p.name}:${hx(off)} = ${hex(p.sel, 4)}h:${hx(off)}h</div>` +
          (p.acc ? `<div class="dim">${p.acc.t === 'R' ? 'lectura' : 'escritura'} de ${SIZE_NAME[p.acc.size]} → valor ${hex(p.acc.v, p.acc.size * 2)}h</div>` : '') + '</div>';
        const realCache = s.desc === undefined && !p.fromTable;
        if (p.pe && s.valid === false) {
          return h + `<div class="stage fault"><h4>Selector NULO</h4>El registro ${p.name} tiene un selector nulo (índice 0 de la GDT). Cualquier acceso produce #GP(0).</div></div>`;
        } else if (!p.pe || realCache) {
          lin = (s.base + off) >>> 0;
          h += `<div class="arrow"><span class="mech">Segmentación (${p.pe ? 'caché con valores de modo real' : 'MODO REAL'})</span><br>` +
            `base = segmento × 16 = ${hex(p.sel, 4)}h × 10h = <span class="mono">${hex(s.base, 5)}h</span><br>` +
            `lineal = base + desplazamiento = ${hex(s.base, 5)}h + ${hx(off)}h = <b class="mono">${hex(lin, 5)}h</b><br>` +
            `<span class="faint">En modo real no hay tablas ni verificaciones de protección (límite fijo FFFFh).</span></div>`;
        } else {
          const sel = p.sel, ti = (sel >> 2) & 1, idx = sel >> 3;
          const tbl = ti ? c.ldtr : c.gdtr;
          const d = (p.fromTable && p.cache.desc) || c.peekDescriptor(sel);
          h += `<div class="arrow"><span class="mech">Segmentación (MODO PROTEGIDO)</span><br>` +
            `Selector ${hex(sel, 4)}h = ${EMU.bin(sel >> 3, 13)} ${ti} ${EMU.bin(sel & 3, 2)}b → ${selParts(sel)}<br>` +
            `Descriptor en la ${ti ? 'LDT' : 'GDT'}: base de la tabla ${hex(tbl.base, 6)}h + ${idx} × 8 = lineal <span class="mono">${hex((tbl.base + idx * 8) >>> 0, 6)}h</span><br>`;
          if (d && !d.error) {
            h += `Bytes del descriptor: ${this.descBytes(d.bytes)}<br>`;
          }
          const a = EMU.describeAccess(s.acc);
          h += `${p.fromTable ? 'Descriptor leído' : `Caché (parte oculta) de ${p.name}`}: base <span class="mono">${hex(s.base, 6)}h</span>, límite <span class="mono">${hx(s.limit)}h</span>, ` +
            `acceso ${hex(s.acc, 2)}h = ${esc(a.txt)}, DPL ${a.dpl}, P=${a.p}<br>`;
          const expDown = !(s.acc & 8) && (s.acc & 4);
          const size = p.acc ? p.acc.size : (p.size || 1);
          const okLim = expDown ? off > s.limit : off + size - 1 <= s.limit;
          h += `Verificación de límite: ${expDown ? `${hx(off)}h > ${hx(s.limit)}h (expand-down)` : `${hx(off)}h${size > 1 ? ` + ${size - 1}` : ''} ≤ ${hx(s.limit)}h`} ` +
            (okLim ? '<span class="ok">✓ dentro del segmento</span>' : '<span class="bad">✗ FUERA DEL LÍMITE → #GP</span>') + '<br>';
          lin = (s.base + off) >>> 0;
          h += `lineal = base + desplazamiento = ${hex(s.base, 6)}h + ${hx(off)}h = <b class="mono">${hex(lin, 8)}h</b></div>`;
        }
      } else {
        lin = p.linOnly >>> 0;
        if (p.sys) h += `<div class="note box">Las tablas del sistema (GDT, IDT) se ubican por su dirección <b>LINEAL</b> (GDTR/IDTR.base + índice × 8): no pasan por la segmentación, pero sí por la paginación.</div>`;
      }
      h += `<div class="stage lin"><h4>Dirección LINEAL</h4><div class="big">${hex(lin, 8)}h</div></div>`;
      const w = c.walk(lin);
      if (!w.pg) {
        h += `<div class="arrow"><span class="mech">Paginación DESACTIVADA</span> (CR0.PG = 0)<br>física = lineal` +
          `${lin > EMU.PHYS_MASK ? ` (el emulador tiene 16 MB de RAM: ${hex(lin, 8)}h & FFFFFFh)` : ''}</div>`;
      } else {
        h += `<div class="arrow"><span class="mech">Paginación (2 niveles, páginas de 4 KB)</span><br>` +
          `<span class="linbits"><span class="d" title="bits 31..22: índice en el directorio">dir ${EMU.bin(w.dir, 10)} = ${w.dir}</span>` +
          `<span class="t" title="bits 21..12: índice en la tabla">tabla ${EMU.bin(w.tab, 10)} = ${w.tab}</span>` +
          `<span class="o" title="bits 11..0: desplazamiento en la página">offset ${EMU.bin(w.off, 12)} = ${hex(w.off, 3)}h</span></span><br>` +
          `① CR3 = ${hex(w.cr3, 8)}h → directorio en física <span class="mono">${hex(w.cr3 & 0xFFFFF000, 6)}h</span><br>` +
          `② PDE[${w.dir}] en ${hex(w.cr3 & 0xFFFFF000, 6)}h + ${w.dir}×4 = <span class="mono">${hex(w.pdeA, 6)}h</span> = <b class="mono">${hex(w.pde, 8)}h</b> ${this.pteFlags(w.pde)}`;
        if (w.fault === 'PDE no presente') h += `<br><span class="bad">✗ P=0: entrada no presente → FALLA DE PÁGINA (#PF), CR2 ← ${hex(lin, 8)}h</span></div>`;
        else {
          h += `<br>③ PTE[${w.tab}] en ${hex(w.ptBase, 6)}h + ${w.tab}×4 = <span class="mono">${hex(w.pteA, 6)}h</span> = <b class="mono">${hex(w.pte, 8)}h</b> ${this.pteFlags(w.pte)}`;
          if (w.fault) h += `<br><span class="bad">✗ P=0: página no presente → FALLA DE PÁGINA (#PF), CR2 ← ${hex(lin, 8)}h</span></div>`;
          else h += `<br>④ física = marco ${hex(w.frame, 6)}h + offset ${hex(w.off, 3)}h = <b class="mono">${hex(w.phys, 6)}h</b></div>`;
        }
      }
      if (w.phys !== undefined) {
        const m = c.mem, ph = w.phys;
        h += `<div class="stage phys"><h4>Dirección FÍSICA (bus de direcciones)</h4><div class="big">${hex(ph, 6)}h</div>` +
          `<div class="dim">contenido: byte ${hex(m[ph], 2)}h · word ${hex(m[ph] | (m[(ph + 1) & EMU.PHYS_MASK] << 8), 4)}h · región: ${esc(this.regionName(ph))}</div></div>`;
      } else h += '<div class="stage fault"><h4>Dirección FÍSICA</h4>No hay traducción: la página no está presente.</div>';
      return h + '</div>';
    }
    descBytes(b) {
      const cls = ['lim', 'lim', 'base', 'base', 'base', 'acc', 'res', 'res'];
      const tip = ['límite 7..0', 'límite 15..8', 'base 7..0', 'base 15..8', 'base 23..16', 'derechos de acceso', '386: G D 0 AVL límite 19..16', '386: base 31..24'];
      return '<span class="desc-bytes">' + b.map((x, i) => `<span class="${cls[i]}" title="+${i}: ${tip[i]}">${hex(x, 2)}</span>`).join('') + '</span>';
    }
    pteFlags(e) {
      const f = [['P', 0], ['R/W', 1], ['U/S', 2], ['A', 5], ['D', 6]];
      return '<span class="faint">[' + f.map(([n, b]) => `${n}=${(e >>> b) & 1}`).join(' ') + ']</span>';
    }
    regionName(p) {
      if (p < 0x400) return `IVT (vector ${hex(p >> 2, 2)}h)`;
      if (p < 0x500) return 'Área de datos de la BIOS';
      if (p >= EMU.PROG_BASE && p < EMU.PROG_BASE + 0x10000) return 'Programa (segmento 1000h)';
      if (p >= 0x20000 && p < 0x23000) return 'Tablas de páginas';
      if (p >= 0x90000 && p < 0xA0000) return 'Pila (segmento 9000h)';
      if (p >= EMU.VIDEO_BASE && p < EMU.VIDEO_BASE + 0x1000) { const cell = (p - EMU.VIDEO_BASE) >> 1; return `Memoria de video (fila ${Math.floor(cell / 80)}, columna ${cell % 80})`; }
      if (p >= 0xA0000 && p < 0xC0000) return 'Memoria de video';
      if (p >= EMU.BIOS_BASE && p < 0x100000) return 'ROM BIOS';
      if (p >= 0x100000) return 'Memoria extendida (> 1 MB)';
      return 'Memoria convencional';
    }

    // ---------- Memoria ----------
    viewMem() {
      const c = this.cpu, t = c.trace;
      let h = '<div class="memctl">';
      h += `<select id="memMode"><option value="logical" ${this.memMode === 'logical' ? 'selected' : ''}>Lógica (seg:desp)</option>` +
        `<option value="linear" ${this.memMode === 'linear' ? 'selected' : ''}>Lineal</option>` +
        `<option value="phys" ${this.memMode === 'phys' ? 'selected' : ''}>Física</option></select>`;
      if (this.memMode === 'logical') {
        h += `<select id="memSeg">${[3, 0, 2, 1, 4, 5].map(si => `<option value="${si}" ${si === this.memSeg ? 'selected' : ''}>${SN[si]} (${hex(c.s[si].sel, 4)})</option>`).join('')}</select> : <input type="text" id="memOff" value="${hx(this.memOff)}">`;
      } else h += `<input type="text" id="memAddr" value="${hex(this.memAddr, this.memMode === 'phys' ? 6 : 8)}">`;
      h += ' <button data-act="memgo">Ir</button><span class="sep"></span>';
      h += '<button data-mem="csip">CS:IP</button><button data-mem="ds0">DS:0</button><button data-mem="sssp">SS:SP</button><button data-mem="video">Video</button><button data-mem="ivt">IVT</button><button data-mem="gdt">GDT</button>';
      if (c.cr3) h += '<button data-mem="pd">Directorio</button>';
      h += '<button data-mem="up">▲</button><button data-mem="down">▼</button></div>';

      const R = new Set(), W = new Set(), X = new Set();
      if (t) for (const a of t.acc) {
        if (a.t === 'X') continue;
        for (let i = 0; i < a.size; i++) (a.t === 'W' ? W : R).add((a.phys + i) & EMU.PHYS_MASK);
      }
      const ins = this.peekIns();
      const cp = this.curPhys();
      if (ins && cp >= 0) for (let i = 0; i < ins.len; i++) X.add(cp + i);
      const spe = c.explainSeg(2, c.sp());
      const spPhys = spe.walk && spe.walk.phys;

      const rows = [];
      for (let r = 0; r < 16; r++) {
        const cells = [];
        let label, label2 = '';
        for (let i = 0; i < 16; i++) {
          let phys, ok = true;
          if (this.memMode === 'logical') {
            const off = (this.memOff + r * 16 + i) >>> 0;
            const e = c.explainSeg(this.memSeg, off);
            if (e.error || !e.inLimit) ok = false;
            phys = e.walk && e.walk.phys;
            if (i === 0) { label = `${SN[this.memSeg]}:${hx(off)}`; label2 = e.lin !== undefined ? `${hex(e.lin, 6)}→${phys !== undefined ? hex(phys, 6) : '--'}` : ''; }
          } else if (this.memMode === 'linear') {
            const lin = (this.memAddr + r * 16 + i) >>> 0;
            const w = c.walk(lin);
            phys = w.phys;
            if (i === 0) { label = hex(lin, 8); label2 = phys !== undefined ? '→' + hex(phys, 6) : '→ no presente'; }
          } else {
            phys = (this.memAddr + r * 16 + i) & EMU.PHYS_MASK;
            if (i === 0) label = hex(phys, 6);
          }
          if (phys === undefined) { cells.push({ txt: '--', cls: 'np', phys: -1 }); continue; }
          const v = c.mem[phys];
          let cls = v === 0 ? 'z' : '';
          if (!ok) cls += ' np';
          if (W.has(phys)) cls += ' W'; else if (R.has(phys)) cls += ' R';
          if (X.has(phys)) cls += ' X';
          if (spPhys !== undefined && (phys === spPhys || phys === spPhys + 1)) cls += ' SP';
          cells.push({ txt: hex(v, 2), cls, phys, v });
        }
        let row = `<tr><td class="a">${label}</td>${this.memMode !== 'phys' ? `<td class="a2">${label2}</td>` : ''}`;
        cells.forEach((cl, i) => {
          if (i === 8) row += '<td class="gap"></td>';
          row += `<td class="b ${cl.cls}" ${cl.phys >= 0 ? `data-phys="${cl.phys}"` : ''} title="${cl.phys >= 0 ? 'física ' + hex(cl.phys, 6) + 'h' : 'sin traducción'}">${cl.txt}</td>`;
        });
        row += `<td class="asc">${esc(cells.map(cl => cl.phys >= 0 ? EMU.asciiOf(cl.v) : ' ').join(''))}</td></tr>`;
        rows.push(row);
      }
      h += `<table class="hex">${rows.join('')}</table>`;
      h += '<div class="note"><span style="background:var(--rd);padding:0 4px">leído</span> <span style="background:var(--wr);padding:0 4px">escrito</span> en el último paso · ' +
        '<span style="box-shadow:inset 0 -2px 0 var(--warn);padding:0 4px">instrucción actual</span> · <span style="outline:1px solid var(--accent2);padding:0 4px">SS:SP</span> · clic en un byte para modificarlo.</div>';
      return h;
    }

    // ---------- Pila ----------
    viewStack() {
      const c = this.cpu, s = c.s[2], sp = c.sp(), s32 = c.stk32();
      const bp = s32 ? c.r[5] : c.r[5] & 0xFFFF, U = s32 ? 4 : 2, SPN = s32 ? 'ESP' : 'SP', BPN = s32 ? 'EBP' : 'BP';
      const mode = this.stackMode || 'draw';
      let h = `<div class="seg-toggle"><button data-stkmode="draw" class="${mode === 'draw' ? 'active' : ''}">Dibujo</button><button data-stkmode="table" class="${mode === 'table' ? 'active' : ''}">Tabla</button></div>`;
      h += `<div class="note">SS = <b>${hex(s.sel, 4)}h</b> (base ${hex(s.base, 6)}h, límite ${hx(s.limit)}h${s32 ? ', <b>B=1: pila de 32 bits</b>' : ''}) · ${SPN} = <b>${hx(sp)}h</b> · ${BPN} = <b>${hx(bp)}h</b><br>` +
        `La ${gl('pila', 'pila')} crece hacia direcciones <b>menores</b>. PUSH: ${SPN} ← ${SPN} − ${U} (o 2 si el operando es de 16 bits) y escribe en SS:${SPN}. POP: lee y luego suma.</div>`;
      if (mode === 'draw') return h + this.stackDrawing();
      h += '<table class="tbl"><tr><th>SS:desp</th><th>lineal</th><th>física</th><th>valor</th><th></th><th>contenido</th></tr>';
      const start = Math.max(0, sp - 2 * U) & (s32 ? 0xFFFFFFFC : 0xFFFE);
      const lim = s32 ? 0xFFFFFFFC : 0xFFFE;
      for (let off = start, n = 0; off <= lim && n < 26; off += U, n++) {
        const e = c.explainSeg(2, off);
        const ph = e.walk && e.walk.phys;
        const v = ph !== undefined ? (U === 4 ? c.pr32(ph) : c.pr16(ph)) : null;
        const marks = [];
        if (off === sp) marks.push('◀ ' + SPN);
        if (off === bp) marks.push('◀ ' + BPN);
        const used = off >= sp;
        const tag = used && ph !== undefined ? (c.stackTags.get(ph) || '') : (used ? '' : 'libre');
        h += `<tr class="${off === sp ? 'top' : ''} ${used ? '' : 'stale'}"><td>${hex(s.sel, 4)}:${hx(off)}</td><td>${e.lin !== undefined ? hex(e.lin, 6) : '--'}</td>` +
          `<td>${ph !== undefined ? hex(ph, 6) : '<span class="np">no presente</span>'}</td><td><b>${v !== null ? hex(v, U * 2) : '----'}</b></td>` +
          `<td class="tag use">${marks.join(' ')}</td><td class="tag">${esc(tag)}${e.inLimit === false ? ' <span class="np">(fuera del límite)</span>' : ''}</td></tr>`;
      }
      return h + '</table>';
    }

    // La pila como bloques: direcciones altas arriba, crece hacia abajo; colores por marco de llamada
    stackDrawing() {
      const c = this.cpu, sp = c.sp(), s = c.s[2], s32 = c.stk32();
      const bp = s32 ? c.r[5] : c.r[5] & 0xFFFF, U = s32 ? 4 : 2, SPN = s32 ? 'ESP' : 'SP', BPN = s32 ? 'EBP' : 'BP';
      const items = [];
      for (let off = s32 ? 0xFFF8 : 0xFFFC; off >= sp && off >= 0 && items.length < 400; off -= U) {
        const e = c.explainSeg(2, off);
        const ph = e.walk && e.walk.phys;
        items.push({ off, ph, v: ph !== undefined ? (U === 4 ? c.pr32(ph) : c.pr16(ph)) : null, tag: ph !== undefined ? (c.stackTags.get(ph) || '') : '' });
      }
      let frame = 0;
      for (const it of items) {
        it.frame = frame;
        it.kind = /^E?IP de retorno/.test(it.tag) ? 'ret' : /^(E?FLAGS|CS de retorno)/.test(it.tag) ? 'intf' : /código de error/.test(it.tag) ? 'err' : /^PUSH/.test(it.tag) ? 'push' : '';
        if (it.kind === 'ret' || it.kind === 'err') frame++;
      }
      let h = `<div class="stk-legend"><span>▲ direcciones altas (base de la pila)</span><span>Entradas de ${U} bytes · los colores separan los <b>marcos</b>: cada CALL o interrupción comienza uno nuevo.</span></div><div class="stk">`;
      if (!items.length) h += `<div class="blk empty">La pila está vacía (${SPN} = ${hx(sp)}h)</div>`;
      const shown = items.length > 40 ? items.slice(items.length - 40) : items;
      if (items.length > 40) h += `<div class="blk empty">… ${items.length - 40} palabras más arriba …</div>`;
      for (const it of shown) {
        const ptr = [it.off === sp ? SPN : '', it.off === bp ? BPN : ''].filter(Boolean).map(x => `<span class="ptr">◀ ${x}</span>`).join('');
        h += `<div class="blk f${it.frame % 6} ${it.kind}"><span class="a">SS:${hx(it.off)}</span><span class="v">${it.v !== null ? hex(it.v, U * 2) : '----'}</span>` +
          `<span class="tg">${esc(it.tag || '(escrito sin PUSH)')}</span>${ptr}</div>`;
      }
      for (let i = 1; i <= 3; i++) {
        const off = ((sp - U * i) & (s32 ? 0xFFFFFFFF : 0xFFFF)) >>> 0;
        h += `<div class="blk free"><span class="a">SS:${hx(off)}</span><span class="v">libre</span><span class="tg">${i === 1 ? 'aquí escribirá el próximo PUSH' : ''}</span>${off === bp ? `<span class="ptr">◀ ${BPN}</span>` : ''}</div>`;
      }
      h += `</div><div class="stk-legend"><span>▼ direcciones bajas: la pila crece hacia aquí</span><span class="faint">base lineal de SS: ${hex(s.base, 6)}h</span></div>`;
      return h;
    }

    // ---------- Historial de valores ----------
    viewHist() {
      const c = this.cpu;
      const sel = this.histSel || 'r0';
      const opts = [['r0', 'EAX'], ['r3', 'EBX'], ['r1', 'ECX'], ['r2', 'EDX'], ['r4', 'ESP'], ['r5', 'EBP'], ['r6', 'ESI'], ['r7', 'EDI'],
        ['ip', 'EIP'], ['flags', 'EFLAGS'], ['s1', 'CS'], ['s3', 'DS'], ['s0', 'ES'], ['s2', 'SS'], ['s4', 'FS'], ['s5', 'GS'], ['cr0', 'CR0'], ['cr2', 'CR2'], ['cr3', 'CR3']];
      const wide = (sel[0] === 'r' && (c.r[+sel.slice(1)] > 0xFFFF || c.history.some(hh => hh.snap.r[+sel.slice(1)] > 0xFFFF))) ||
        sel.startsWith('cr') || (sel === 'ip' && (c.ip > 0xFFFF || c.history.some(hh => hh.snap.ip > 0xFFFF)));
      const get = (sn) => {
        if (sel[0] === 'r') return wide ? sn.r[+sel.slice(1)] >>> 0 : sn.r[+sel.slice(1)] & 0xFFFF;
        if (sel === 'ip') return sn.ip;
        if (sel === 'flags') return sn.flags;
        if (sel[0] === 's') return sn.s[+sel.slice(1)].sel;
        return sn[sel] >>> 0;
      };
      const nm = opts.find(o => o[0] === sel)[1];
      let h = `<div class="memctl">Registro: <select id="histSel">${opts.map(([k, n]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${n}</option>`).join('')}</select>` +
        `<span class="dim">Clic en el nombre de un registro (panel de registros) para verlo aquí.</span></div>`;
      const H = c.history;
      if (!H.length) return h + '<div class="note box">Todavía no hay historial: ejecute algunas instrucciones.</div>';
      const cur = { r: Array.from(c.r), ip: c.ip, flags: c.flags, s: c.s, cr0: c.cr0, cr2: c.cr2, cr3: c.cr3 };
      const N = Math.min(H.length, 160);
      const pts = [];
      for (let j = H.length - N; j < H.length; j++) {
        const after = j + 1 < H.length ? H[j + 1].snap : cur;
        pts.push({ n: H[j].snap.icount + 1, v: get(after), prev: get(H[j].snap), ins: H[j].ins, fault: H[j].fault, cs: H[j].snap.s[1].sel, ip: H[j].snap.ip });
      }
      // gráfico
      const W = 560, HH = 120, vals = pts.map(p => p.v);
      let mn = Math.min(...vals), mx = Math.max(...vals);
      if (mn === mx) { mn -= 1; mx += 1; }
      const x = (i) => 30 + i * (W - 40) / Math.max(1, pts.length - 1);
      const y = (v) => 10 + (HH - 25) * (1 - (v - mn) / (mx - mn));
      let path = '';
      pts.forEach((p, i) => { path += (i ? ' H' + x(i).toFixed(1) + ' V' : 'M' + x(i).toFixed(1) + ' ') + y(p.v).toFixed(1); });
      const dots = pts.map((p, i) => p.v !== p.prev ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.5"><title>#${p.n}: ${hex(p.v, wide ? 8 : 4)}h</title></circle>` : '').join('');
      const dg = wide ? 8 : 4;
      h += `<svg class="hist-chart" viewBox="0 0 ${W} ${HH}" role="img" aria-label="Evolución de ${nm}">` +
        `<text x="2" y="14">${hex(mx >>> 0, dg)}</text><text x="2" y="${HH - 14}">${hex(Math.max(0, mn) >>> 0, dg)}</text>` +
        `<path d="${path}" />${dots}<text x="30" y="${HH - 2}">#${pts[0].n}</text><text x="${W - 10}" y="${HH - 2}" text-anchor="end">#${pts[pts.length - 1].n}</text></svg>`;
      h += `<div class="note">${nm} en los últimos ${pts.length} pasos (los puntos marcan cambios). Abajo, los más recientes primero.</div>`;
      h += `<table class="tbl"><tr><th>#</th><th>CS:IP</th><th>instrucción</th><th>${nm} antes</th><th>${nm} después</th></tr>`;
      for (const p of pts.slice(-60).reverse()) {
        const ch = p.v !== p.prev;
        h += `<tr class="${ch ? 'top' : 'stale'}"><td>${p.n}</td><td>${hex(p.cs, 4)}:${hex(p.ip, 4)}</td><td>${p.ins ? esc(EMU.formatIns(p.ins)) : '<span class="np">excepción</span>'}${p.fault ? ' <span class="np">✖ ' + esc(EMU.EXC_NAMES[p.fault.vec] ? EMU.EXC_NAMES[p.fault.vec][0] : p.fault.vec) + '</span>' : ''}</td>` +
          `<td>${hex(p.prev, dg)}</td><td><b>${hex(p.v, dg)}</b>${ch ? ' <span class="chg">●</span>' : ''}</td></tr>`;
      }
      return h + '</table>';
    }

    // ---------- GDT ----------
    viewGdt() {
      const c = this.cpu, g = c.gdtr;
      if (g.limit < 7) {
        return `<div class="note box">La GDT no está cargada (GDTR.límite = ${hex(g.limit, 4)}h).<br>En <b>modo real</b> no se usan descriptores: la base de cada segmento es simplemente segmento × 16.<br>` +
          'Active el switch <b>Modo protegido</b>: el código del sistema armará la GDT y la cargará con <code>LGDT</code>.</div>';
      }
      const n = Math.min(Math.floor((g.limit + 1) / 8), 64);
      let h = `<div class="note">GDTR: base lineal <b>${hex(g.base, 6)}h</b>, límite <b>${hex(g.limit, 4)}h</b> → ${Math.floor((g.limit + 1) / 8)} descriptores. Selector = índice × 8 (+ TI + RPL). Clic en una fila para ver el detalle.</div>`;
      h += '<table class="tbl"><tr><th>#</th><th>selector</th><th>bytes (+0 … +7)</th><th>base</th><th>límite</th><th>tipo</th><th>DPL</th><th>P</th><th>uso</th></tr>';
      for (let i = 0; i < n; i++) {
        const d = c.peekDescriptor(i * 8);
        if (d.error) { h += `<tr><td>${i}</td><td colspan="8" class="np">${esc(d.error)}</td></tr>`; continue; }
        const a = EMU.describeAccess(d.acc);
        if (d.acc & 0x10) a.txt += (d.acc & 8) ? (d.gd & 0x40 ? ', 32 bits' : ', 16 bits') : (d.gd & 0x40 ? ', B=1' : '');
        const users = [0, 1, 2, 3, 4, 5].filter(si => c.pe() && c.s[si].desc === i && c.s[si].ti === false && c.s[si].valid).map(si => SN[si]);
        if (c.ldtr.valid && (c.ldtr.sel >> 3) === i) users.push('LDTR');
        if (c.tr.valid && (c.tr.sel >> 3) === i) users.push('TR');
        const empty = d.bytes.every(x => x === 0);
        h += `<tr class="click ${this.gdtSel === i ? 'sel' : ''} ${users.length ? 'inuse' : ''}" data-gdt="${i}"><td>${i}</td><td>${hex(i * 8, 4)}h</td><td>${this.descBytes(d.bytes)}</td>` +
          (empty && i === 0 ? '<td colspan="5" class="faint">descriptor NULO (obligatorio)</td>' :
            `<td>${hex(d.base, 8)}</td><td>${hx(d.limit)}${d.gd & 0x80 ? ' <span class="faint">G</span>' : ''}</td><td class="wrap">${esc(a.txt)}</td><td>${a.dpl}</td><td class="${a.p ? '' : 'np'}">${a.p}</td>`) +
          `<td class="tag use">${users.join(' ')}</td></tr>`;
      }
      h += '</table>';
      if (this.gdtSel !== null && this.gdtSel < n) h += this.descDetail(c.peekDescriptor(this.gdtSel * 8), this.gdtSel);
      return h;
    }
    descDetail(d, i) {
      if (d.error) return '';
      const b = d.bytes, a = EMU.describeAccess(d.acc);
      const sym = EMU.SELECTORS[i] ? ` (${EMU.SELECTORS[i].name})` : '';
      let h = `<div class="detail"><h4>Descriptor ${i} · selector ${hex(i * 8, 4)}h${sym}</h4>`;
      h += '<div class="fields">' + ['+0', '+1', '+2', '+3', '+4', '+5', '+6', '+7'].map(x => `<div class="h">${x}</div>`).join('') +
        b.map((x, k) => `<div class="${['lim', 'lim', 'base', 'base', 'base', 'acc', 'res', 'res'][k]}" style="background:${['rgba(255,180,84,.22)', 'rgba(255,180,84,.22)', 'rgba(79,179,255,.22)', 'rgba(79,179,255,.22)', 'rgba(79,179,255,.22)', 'rgba(126,224,195,.25)', 'rgba(140,140,140,.15)', 'rgba(140,140,140,.15)'][k]}">${hex(x, 2)}</div>`).join('') +
        '<div class="h">límite 7..0</div><div class="h">límite 15..8</div><div class="h">base 7..0</div><div class="h">base 15..8</div><div class="h">base 23..16</div><div class="h">acceso</div><div class="h">G D 0 AVL lím.19..16</div><div class="h">base 31..24</div></div>';
      h += `<div class="kv"><span class="k">Base</span><span>${hex(b[7], 2)}h ${hex(b[4], 2)}h ${hex(b[3], 2)}h ${hex(b[2], 2)}h → <b>${hex(d.base, 8)}h</b></span>`;
      h += `<span class="k">Límite</span><span>${hex(b[6] & 15, 1)}h ${hex(b[1], 2)}h ${hex(b[0], 2)}h = ${hex(d.limitRaw, 5)}h` +
        (d.gd & 0x80 ? ` · <b>G=1</b>: se cuenta en páginas de 4 KB → ${hex(d.limitRaw, 5)}h × 1000h + FFFh = <b>${hex(d.limit, 8)}h</b> (${d.limitRaw + 1 >= 0x100000 ? '4 GB' : ((d.limitRaw + 1) * 4) + ' KB'})`
          : ` · G=0: en bytes → <b>${hx(d.limit)}h</b> (${d.limit + 1} bytes)`) + '</span>';
      if (d.acc & 0x10) h += `<span class="k">${d.acc & 8 ? 'D' : 'B'}</span><span>${(d.gd >> 6) & 1} → ${d.acc & 8 ? (d.gd & 0x40 ? 'segmento de código de <b>32 bits</b> (operandos y direcciones de 32 por defecto)' : 'segmento de código de 16 bits') : (d.gd & 0x40 ? 'pila con <b>ESP</b> / límite superior 4 GB si es expand-down' : 'pila con SP (16 bits)')}</span>`;
      h += `<span class="k">Acceso</span><span>${hex(d.acc, 2)}h = ${EMU.bin(d.acc, 8)}b</span></div>`;
      const bits = [['P', 7, 1, 'Presente'], ['DPL', 5, 2, 'Nivel de privilegio del descriptor'], ['S', 4, 1, '1 = código/datos, 0 = sistema'],
        ['E', 3, 1, 'Ejecutable (1 = código)'], [d.acc & 8 ? 'C' : 'ED', 2, 1, d.acc & 8 ? 'Conforme' : 'Expande hacia abajo'],
        [d.acc & 8 ? 'R' : 'W', 1, 1, d.acc & 8 ? 'Legible' : 'Escribible'], ['A', 0, 1, 'Accedido (lo pone el CPU al cargar el selector)']];
      h += '<div class="bits">' + (d.acc & 0x10 ? bits : bits.slice(0, 3).concat([['TIPO', 0, 4, 'Tipo de descriptor de sistema']])).map(([n, pos, w, t]) =>
        `<span class="bit ${(d.acc >> pos) & ((1 << w) - 1) ? 'on' : ''}" title="${esc(t)}">${n}<b>${EMU.bin((d.acc >> pos) & ((1 << w) - 1), w)}</b></span>`).join('') + '</div>';
      h += `<div class="note">${esc(a.txt)} · DPL ${a.dpl} · ${a.p ? 'presente' : '<b class="np">NO presente</b>'}</div>`;
      h += `<div class="note">Bytes +6/+7 (agregados en el 386): G=${(b[6] >> 7) & 1}, D/B=${(b[6] >> 6) & 1}, AVL=${(b[6] >> 4) & 1}, límite 19..16=${hex(b[6] & 15, 1)}h, base 31..24=${hex(b[7], 2)}h` +
        `${!b[6] && !b[7] ? ' → en cero: es un descriptor con formato del 286' : ''}</div>`;
      return h + '</div>';
    }

    // ---------- IDT / IVT ----------
    symAt(sel, off) {
      if (!this.program) return '';
      let base = null;
      if (!this.cpu.pe()) base = sel << 4;
      else { const d = this.cpu.peekDescriptor(sel); if (!d.error) base = d.base; }
      if (base !== EMU.PROG_BASE) return '';
      const s = this.program.symbols.find(x => x.kind === 'label' && x.value === off);
      return s ? s.name : '';
    }
    viewIdt() {
      const c = this.cpu;
      const vecName = (v) => (EMU.EXC_NAMES[v] ? EMU.EXC_NAMES[v].join(' ') : ({ 0x10: 'BIOS video', 0x16: 'BIOS teclado', 0x20: 'DOS: terminar', 0x21: 'DOS: servicios', 0x30: 'servicio de pantalla del sistema' })[v] || '');
      if (!c.pe()) {
        let h = `<div class="note">MODO REAL: la <b>IVT</b> (tabla de vectores) está en la dirección física ${hex(c.idtr.base, 5)}h. ` +
          'Cada vector n ocupa 4 bytes en n × 4: <b>offset</b> (2 bytes) y <b>segmento</b> (2 bytes). INT n apila FLAGS, CS, IP y salta a segmento:offset.</div>';
        h += '<table class="tbl"><tr><th>vector</th><th>dir. física</th><th>bytes</th><th>segmento:offset</th><th>descripción</th><th>rutina</th></tr>';
        for (let v = 0; v < 256; v++) {
          const a = (c.idtr.base + v * 4) & EMU.PHYS_MASK;
          const off = c.pr16(a), seg = c.pr16(a + 2);
          const def = this.bios.isDefaultVector(v, seg, off);
          if (v > 0x21 && def) continue;
          const sym = this.symAt(seg, off);
          h += `<tr class="${def ? '' : 'inuse'}"><td>${hex(v, 2)}h (${v})</td><td>${hex(a, 5)}</td><td class="faint">${[0, 1, 2, 3].map(k => hex(c.pr8(a + k), 2)).join(' ')}</td>` +
            `<td><b>${hex(seg, 4)}:${hx(off)}</b></td><td class="wrap">${esc(vecName(v))}</td>` +
            `<td class="tag ${def ? '' : 'use'}">${def ? 'BIOS (ROM)' : '¡modificado!' + (sym ? ' → ' + esc(sym) : '')}</td></tr>`;
        }
        return h + '</table><div class="note">Se muestran los vectores 0..21h y cualquier otro que el programa haya modificado.</div>';
      }
      const i = c.idtr;
      const n = Math.min(Math.floor((i.limit + 1) / 8), 256);
      let h = `<div class="note">MODO PROTEGIDO: IDTR base lineal <b>${hex(i.base, 6)}h</b>, límite <b>${hex(i.limit, 4)}h</b> → ${n} compuertas de 8 bytes. ` +
        'Cada compuerta tiene: offset, selector del segmento de código, y derechos (P, DPL, tipo).</div>';
      if (i.base === 0 && i.limit === 0x3FF) h += '<div class="note box" style="color:var(--warn)">⚠ El IDTR todavía apunta a la IVT de modo real (base 0, límite 3FFh). Esos bytes NO son compuertas válidas: cualquier interrupción o excepción provocará #GP → doble falta → triple falta. Active el switch <b>Interrupciones (IDT)</b>.</div>';
      h += '<table class="tbl"><tr><th>vector</th><th>bytes</th><th>selector:offset</th><th>tipo</th><th>DPL</th><th>P</th><th>manejador</th></tr>';
      for (let v = 0; v < n; v++) {
        const lin = (i.base + v * 8) >>> 0;
        const b = [];
        let bad = false;
        for (let k = 0; k < 8; k++) { const w = c.walk(lin + k); if (w.phys === undefined) { bad = true; break; } b.push(c.mem[w.phys]); }
        if (bad) { h += `<tr><td>${hex(v, 2)}h</td><td colspan="6" class="np">no mapeado</td></tr>`; continue; }
        if (b.every(x => x === 0)) continue;
        const g32 = !(b[5] & 0x10) && (b[5] & 8);
        const off = ((b[0] | (b[1] << 8)) + (g32 ? (b[6] | (b[7] << 8)) * 65536 : 0)) >>> 0, sel = b[2] | (b[3] << 8), a = EMU.describeAccess(b[5]);
        h += `<tr><td>${hex(v, 2)}h (${v})<div class="tag">${esc(vecName(v))}</div></td><td>${b.map(x => hex(x, 2)).join(' ')}</td><td><b>${hex(sel, 4)}:${hx(off)}</b></td>` +
          `<td class="wrap">${esc(a.txt)}</td><td>${a.dpl}</td><td class="${a.p ? '' : 'np'}">${a.p}</td><td class="tag use">${esc(this.symAt(sel, off))}</td></tr>`;
      }
      return h + '</table><div class="note">Las entradas completamente en cero (no presentes) no se muestran.</div>';
    }

    // ---------- Paginación ----------
    viewPaging() {
      const c = this.cpu;
      let h = `<div class="note">CR0.PG = <b>${c.pg() ? 1 : 0}</b> · CR3 = <b>${hex(c.cr3, 8)}h</b>. ` +
        'Formato de PDE/PTE (4 bytes): bits 31..12 = dirección física del marco/tabla · bit 6 D (sucia) · bit 5 A (accedida) · bit 2 U/S · bit 1 R/W · bit 0 P (presente).</div>';
      h += `<label class="chk"><input type="checkbox" id="tlbOn" ${c.tlbOn ? 'checked' : ''}> Simular la ${gl('tlb', 'TLB')} (${c.tlbMax} entradas, reemplazo FIFO)</label>`;
      if (c.tlbOn) {
        const tot = c.tlbStats.hits + c.tlbStats.misses;
        h += `<div class="note">Aciertos: <b>${c.tlbStats.hits}</b> · fallos: <b>${c.tlbStats.misses}</b>${tot ? ` · tasa de acierto ${Math.round(100 * c.tlbStats.hits / tot)} %` : ''}. ` +
          'En un acierto el CPU NO lee el directorio ni la tabla. Si se modifica una PTE que está en la TLB, el cambio no se nota hasta ejecutar INVLPG o recargar CR3.</div>';
        h += '<table class="tbl"><tr><th>página lineal</th><th>→ marco físico</th><th>D</th><th>aciertos</th><th>cargada en</th></tr>';
        if (!c.tlb.size) h += '<tr><td colspan="5" class="faint">TLB vacía</td></tr>';
        for (const [pg, e] of c.tlb) h += `<tr><td>${hex(pg * 4096, 8)}</td><td><b>${hex(e.frame, 6)}</b></td><td>${e.dirty ? 1 : 0}</td><td>${e.hits}</td><td>#${e.n}</td></tr>`;
        h += '</table>';
      }
      if (!c.pg() && !c.cr3) {
        return h + '<div class="note box">La paginación no está activa: la dirección lineal ES la dirección física.<br>Active el switch <b>Paginación</b>: el sistema construirá el directorio y las tablas y pondrá PG=1 en CR0.</div>';
      }
      if (!c.pg()) h += '<div class="note box" style="color:var(--warn)">CR3 tiene valor pero PG=0: las tablas existen pero todavía no se usan.</div>';
      const pd = c.cr3 & 0xFFFFF000;
      // traducción destacada: último acceso de datos
      let hl = null;
      const t = c.trace;
      if (t) { const a = t.acc.find(x => x.t === 'R' || x.t === 'W'); if (a) hl = a.lin >>> 0; }
      h += `<div class="panel-title sub">Directorio de páginas (física ${hex(pd, 6)}h) — entradas presentes</div>`;
      h += '<table class="tbl"><tr><th>PDE</th><th>física</th><th>valor</th><th>rango lineal</th><th>tabla en</th><th>flags</th></tr>';
      const pdes = [];
      for (let i = 0; i < 1024; i++) { const v = c.pr32(pd + i * 4); if (v & 1) pdes.push([i, v]); }
      if (this.pdeSel === null || !pdes.some(x => x[0] === this.pdeSel)) this.pdeSel = pdes.length ? pdes[0][0] : null;
      for (const [i, v] of pdes) {
        const isHl = hl !== null && (hl >>> 22) === i;
        h += `<tr class="click ${this.pdeSel === i ? 'sel' : ''} ${isHl ? 'inuse' : ''}" data-pde="${i}"><td>${i}</td><td>${hex(pd + i * 4, 6)}</td><td><b>${hex(v, 8)}</b></td>` +
          `<td>${hex(i * 0x400000, 8)} – ${hex(i * 0x400000 + 0x3FFFFF, 8)}</td><td>${hex(v & 0xFFFFF000, 6)}</td><td>${this.pteFlags(v)}</td></tr>`;
      }
      if (!pdes.length) h += '<tr><td colspan="6" class="np">Ninguna entrada presente</td></tr>';
      h += `</table><div class="faint">Las ${1024 - pdes.length} entradas restantes tienen P=0 (no presentes).</div>`;
      if (this.pdeSel !== null) {
        const v = c.pr32(pd + this.pdeSel * 4), pt = v & 0xFFFFF000;
        h += `<div class="panel-title sub">Tabla de páginas de la PDE ${this.pdeSel} (física ${hex(pt, 6)}h)</div>`;
        h += '<table class="tbl"><tr><th>PTE</th><th>páginas lineales</th><th>→ marcos físicos</th><th>flags</th><th>estado</th></tr>';
        let i = 0;
        while (i < 1024) {
          const e = c.pr32(pt + i * 4);
          let j = i + 1;
          if (e & 1) { while (j < 1024) { const e2 = c.pr32(pt + j * 4); if (!(e2 & 1) || (e2 & 0xFFFFF000) !== ((e & 0xFFFFF000) + (j - i) * 0x1000)) break; j++; } }
          else { while (j < 1024 && !(c.pr32(pt + j * 4) & 1)) j++; }
          const lin0 = (this.pdeSel * 0x400000 + i * 0x1000) >>> 0, lin1 = (this.pdeSel * 0x400000 + j * 0x1000 - 1) >>> 0;
          const isHl = hl !== null && (hl >>> 22) === this.pdeSel && ((hl >>> 12) & 0x3FF) >= i && ((hl >>> 12) & 0x3FF) < j;
          if (e & 1) {
            let acc = 0, dirty = 0;
            for (let k = i; k < j; k++) { const x = c.pr32(pt + k * 4); if (x & 0x20) acc++; if (x & 0x40) dirty++; }
            const f0 = e & 0xFFFFF000;
            h += `<tr class="${isHl ? 'inuse' : ''}"><td>${i}${j - i > 1 ? '–' + (j - 1) : ''}</td><td>${hex(lin0, 8)} – ${hex(lin1, 8)}</td>` +
              `<td><b>${hex(f0, 6)} – ${hex(f0 + (j - i) * 0x1000 - 1, 6)}</b>${f0 === (lin0 & EMU.PHYS_MASK) ? ' <span class="faint">(identidad)</span>' : ''}</td>` +
              `<td>${j - i === 1 ? this.pteFlags(e) : `<span class="faint">${hex(e & 0xFFF, 3)}h…</span>`}</td><td class="tag">${j - i > 1 ? `${acc} accedidas, ${dirty} sucias` : (e & 0x40 ? 'sucia' : e & 0x20 ? 'accedida' : '')}</td></tr>`;
          } else {
            h += `<tr class="stale ${isHl ? 'inuse' : ''}"><td>${i}${j - i > 1 ? '–' + (j - 1) : ''}</td><td>${hex(lin0, 8)} – ${hex(lin1, 8)}</td><td class="np">no presente</td><td></td><td class="tag">${j - i > 1 ? (j - i) + ' páginas: #PF si se accede' : '#PF si se accede'}</td></tr>`;
          }
          i = j;
        }
        h += '</table>';
      }
      if (hl !== null) h += `<div class="note">▌ Resaltado: la dirección lineal ${hex(hl, 8)}h del último acceso a datos.</div>`;
      return h;
    }

    // ---------- Mapa ----------
    viewMap() {
      const c = this.cpu;
      const regs = [
        [0x00000, 0x003FF, 'IVT', 'Vectores de interrupción (modo real)', '#ffb454'],
        [0x00400, 0x004FF, 'BDA', 'Datos de la BIOS', '#8392a3'],
        [0x00500, 0x0FFFF, 'Libre', 'Memoria convencional', '#3a4654'],
        [EMU.PROG_BASE, EMU.PROG_BASE + 0xFFFF, 'Programa', 'Código y datos (segmento 1000h)', '#4fb3ff'],
        [0x20000, 0x22FFF, 'Paginación', 'Directorio (20000h) y tablas (21000h, 22000h)', '#c49bff'],
        [0x23000, 0x8FFFF, 'Libre', 'Marcos para la zona virtual desde 30000h', '#3a4654'],
        [0x90000, 0x9FFFF, 'Pila', 'Segmento 9000h', '#7ee0c3'],
        [0xA0000, 0xB7FFF, 'Video', 'Memoria de video (modos gráficos)', '#5d6b7a'],
        [0xB8000, 0xBFFFF, 'Video texto', '80×25 caracteres: B8000h', '#ff8fab'],
        [0xC0000, 0xEFFFF, 'ROM/Adaptadores', 'Sin uso', '#3a4654'],
        [0xF0000, 0xFFFFF, 'ROM BIOS', 'Rutinas de interrupción simuladas', '#ff6b6b'],
        [0x100000, 0xFFFFFF, 'Extendida', 'Por encima de 1 MB: solo accesible en modo protegido', '#2c3743'],
      ];
      const tags = regs.map(() => []);
      const place = (lin, name) => {
        const w = c.walk(lin);
        if (w.phys === undefined) return;
        const k = regs.findIndex(r => w.phys >= r[0] && w.phys <= r[1]);
        if (k >= 0) tags[k].push(name);
      };
      for (let si = 0; si < 6; si++) if (c.s[si].valid) place(c.s[si].base, `${SN[si]} base`);
      place((c.s[1].base + c.ip) >>> 0, 'CS:EIP');
      place((c.s[2].base + c.sp()) >>> 0, 'SS:ESP');
      if (c.gdtr.limit) place(c.gdtr.base, 'GDT');
      if (c.pe() && c.idtr.limit) place(c.idtr.base, 'IDT');
      if (c.cr3) { const k = regs.findIndex(r => (c.cr3 & 0xFFFFF000) >= r[0] && (c.cr3 & 0xFFFFF000) <= r[1]); if (k >= 0) tags[k].push('CR3'); }
      let h = '<div class="note">Mapa de la memoria <b>física</b> (primer MB + memoria extendida). Las etiquetas muestran dónde caen (en física) las bases de los segmentos, CS:IP, SS:SP y las tablas del sistema.</div><div class="memmap">';
      regs.forEach((r, k) => {
        h += `<div class="region" style="border-left-color:${r[4]}"><div><b>${esc(r[2])}</b><div class="r">${hex(r[0], 6)} – ${hex(r[1], 6)}</div></div>` +
          `<div><span class="dim">${esc(r[3])}</span><div class="segs">${tags[k].map(t => `<span>${esc(t)}</span>`).join('')}</div></div></div>`;
      });
      return h + '</div>';
    }

    // ---------- eventos de las vistas ----------
    onViewClick(e) {
      const c = this.cpu;
      const b = e.target.closest('button, [data-gdt], [data-pde], td[data-phys]');
      if (!b) return;
      if (b.dataset.xl) { this.xlSel = b.dataset.xl; this.renderView(); return; }
      if (b.dataset.xlmode) { this.xlMode = b.dataset.xlmode; this.animNonce = (this.animNonce || 0) + 1; this.renderView(); return; }
      if (b.dataset.stkmode) { this.stackMode = b.dataset.stkmode; this.renderView(); return; }
      if (b.dataset.act === 'replay') { this.animNonce = (this.animNonce || 0) + 1; this.renderView(); return; }
      if (b.dataset.gdt !== undefined) { this.gdtSel = +b.dataset.gdt; this.renderView(); return; }
      if (b.dataset.pde !== undefined) { this.pdeSel = +b.dataset.pde; this.renderView(); return; }
      if (b.dataset.phys !== undefined && b.tagName === 'TD') {
        if (this.running) return;
        const p = +b.dataset.phys;
        const v = prompt(`Nuevo valor del byte en física ${hex(p, 6)}h (hexadecimal):`, hex(c.mem[p], 2));
        if (v === null) return;
        const n = parseInt(v.replace(/h$/i, ''), 16);
        if (isNaN(n)) return;
        c.mem[p] = n & 0xFF;
        if (p >= EMU.VIDEO_BASE && p < EMU.VIDEO_BASE + 0x1000) c.videoDirty = true;
        this.render();
        return;
      }
      const act = b.dataset.act, mem = b.dataset.mem;
      if (act === 'xlgo' || act === 'xlgolin') { this.readXlManual(act === 'xlgolin'); this.renderView(); return; }
      if (act === 'memgo') { this.readMemInputs(); this.renderView(); return; }
      if (mem) {
        const setLog = (si, off) => { this.memMode = 'logical'; this.memSeg = si; this.memOff = (off & 0xFFFFFFF0) >>> 0; };
        const setPhys = (a) => { this.memMode = 'phys'; this.memAddr = a; };
        switch (mem) {
          case 'csip': setLog(1, c.ip); break;
          case 'ds0': setLog(3, 0); break;
          case 'sssp': setLog(2, c.sp()); break;
          case 'video': setPhys(EMU.VIDEO_BASE); break;
          case 'ivt': setPhys(0); break;
          case 'gdt': this.memMode = 'linear'; this.memAddr = c.gdtr.base; break;
          case 'pd': setPhys(c.cr3 & 0xFFFFF000); break;
          case 'up': if (this.memMode === 'logical') this.memOff = Math.max(0, this.memOff - 256); else this.memAddr = Math.max(0, this.memAddr - 256); break;
          case 'down': if (this.memMode === 'logical') this.memOff = (this.memOff + 256) >>> 0; else this.memAddr += 256; break;
        }
        this.renderView();
      }
    }
    onViewChange(e) {
      if (e.target.id === 'histSel') { this.histSel = e.target.value; this.renderView(); return; }
      if (e.target.id === 'tlbOn') {
        const c = this.cpu;
        c.tlbOn = e.target.checked;
        c.tlb.clear();
        c.tlbStats = { hits: 0, misses: 0 };
        store.set('emu286.tlb', c.tlbOn);
        this.renderView();
        return;
      }
      if (e.target.id === 'memMode') {
        const c = this.cpu;
        const old = this.memMode, nw = e.target.value;
        if (old === 'logical') {
          const ex = c.explainSeg(this.memSeg, this.memOff);
          if (nw === 'linear') this.memAddr = ex.lin || 0;
          if (nw === 'phys') this.memAddr = (ex.walk && ex.walk.phys) || 0;
        } else if (old === 'linear' && nw === 'phys') { const w = c.walk(this.memAddr); this.memAddr = w.phys || 0; }
        this.memMode = nw;
        this.renderView();
      } else if (e.target.id === 'memSeg') { this.memSeg = +e.target.value; this.renderView(); }
      else if (e.type === 'keydown' && ['memOff', 'memAddr'].includes(e.target.id)) { this.readMemInputs(); this.renderView(); }
      else if (e.type === 'keydown' && ['xlSel', 'xlOff'].includes(e.target.id)) { this.readXlManual(false); this.renderView(); }
      else if (e.type === 'keydown' && e.target.id === 'xlLin') { this.readXlManual(true); this.renderView(); }
    }
    readMemInputs() {
      const o = $('memOff'), a = $('memAddr');
      if (o) { const n = parseInt(o.value.replace(/h$/i, ''), 16); if (!isNaN(n)) this.memOff = n >>> 0; }
      if (a) { const n = parseInt(a.value.replace(/h$/i, ''), 16); if (!isNaN(n)) this.memAddr = n >>> 0; }
    }
    readXlManual(lin) {
      const p = (id) => parseInt(($(id).value || '').replace(/h$/i, ''), 16);
      const m = this.xlManual;
      if (lin) { const n = p('xlLin'); m.lin = isNaN(n) ? '' : hex(n, 8); }
      else {
        const s = p('xlSel'), o = p('xlOff');
        if (!isNaN(s)) m.sel = s & 0xFFFF;
        if (!isNaN(o)) m.off = o & 0xFFFF;
        m.lin = '';
      }
    }

    // =============================== pantalla y eventos ===============================
    renderScreen() {
      const c = this.cpu;
      if (!c.videoDirty && !this.cursorDirty) return;
      c.videoDirty = false;
      const cv = $('screen'), ctx = cv.getContext('2d');
      ctx.font = '15px "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const m = c.mem;
      for (let r = 0; r < 25; r++) {
        for (let col = 0; col < 80; col++) {
          const a = EMU.VIDEO_BASE + (r * 80 + col) * 2;
          const ch = m[a], at = m[a + 1];
          ctx.fillStyle = PAL[(at >> 4) & 7];
          ctx.fillRect(col * 8, r * 16, 8, 16);
          if (ch !== 0 && ch !== 32 && ch !== 255) {
            ctx.fillStyle = PAL[at & 15];
            const g = EMU.charOf(ch);
            if (ch === 0xDB) ctx.fillRect(col * 8, r * 16, 8, 16);
            else if (ch === 0xDC) ctx.fillRect(col * 8, r * 16 + 8, 8, 8);
            else if (ch === 0xDF) ctx.fillRect(col * 8, r * 16, 8, 8);
            else ctx.fillText(g, col * 8 + 4, r * 16 + 9, 8);
          }
        }
      }
      if (!c.pe()) {
        const row = m[0x451], col = m[0x450];
        if (row < 25 && col < 80) { ctx.fillStyle = '#dddddd'; ctx.fillRect(col * 8, row * 16 + 13, 8, 2); }
      }
    }

    renderEvents() {
      const c = this.cpu;
      $('evCount').textContent = c.log.length || '';
      if (this.io !== 'events') return;
      if (c.log.length === this.lastLogLen && this.lastLogIc === c.icount) return;
      this.lastLogLen = c.log.length; this.lastLogIc = c.icount;
      const el = $('ioEvents');
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
      const names = { exc: 'EXCEPCIÓN', int: 'INTERRUP.', mode: 'MODO', seg: 'SEGMENTO', sys: 'SISTEMA', cr: 'CONTROL', bios: 'BIOS', io: 'E/S', cpu: 'CPU' };
      el.innerHTML = c.log.slice(-400).map(e => `<div class="ev ${e.type}"><span class="n">#${e.n}<br>${hex(e.cs, 4)}:${hex(e.ip, 4)}</span><span class="ty">${names[e.type] || e.type}</span><span class="m">${esc(e.msg)}</span></div>`).join('') ||
        '<div class="dim">Sin eventos todavía.</div>';
      if (atBottom) el.scrollTop = el.scrollHeight;
    }
  }

  window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
})(window.EMU);
