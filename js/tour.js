/* =====================================================================
 *  EMU386 - Tours guiados
 *  Cada paso se detiene ANTES de ejecutar la instrucción de una etiqueta
 *  ("at"), o cuando se cumple una condición ("until"). El alumno puede
 *  ejecutarla con F8 y observar, o seguir con "Siguiente".
 *    hl:   paneles a resaltar (ids: regs, segs, sysregs, view, curPanel, lastStep, screen)
 *    view: pestaña de la derecha a mostrar
 * ===================================================================== */
'use strict';
(function (EMU) {
  const g = (k, t) => EMU.gl(k, t);

  EMU.TOURS = [
    {
      id: 'pm', title: 'Del modo real al modo protegido', opts: { pm: true, idt: true, paging: false },
      code: `; Programa del tour "Del modo real al modo protegido"
t_inicio:
        mov ax, SEL_VIDEO
t_carga_es:
        mov es, ax
        xor di, di
t_escribe:
        mov word ptr es:[di], 1F48h     ; 'H'
        mov word ptr es:[di+2], 1F4Fh   ; 'O'
        mov word ptr es:[di+4], 1F4Ch   ; 'L'
        mov word ptr es:[di+6], 1F41h   ; 'A'
        mov di, 4000
t_limite:
        mov word ptr es:[di], 1F21h     ; ¡fuera del límite del segmento!
        hlt
`,
      steps: [
        {
          title: 'El CPU arranca en modo real', hl: ['segs', 'sysregs'], view: 'xlate',
          html: () => `El 80286 siempre arranca en ${g('modoreal', 'modo real')}, igual que un 8086. Mire el panel <b>Registros de segmento</b>: ` +
            `CS = 1000h y su ${g('base', 'base')} es simplemente 1000h × 16 = 10000h. No hay tablas ni protección.<br><br>` +
            `En <b>Registros de sistema</b>, ${g('cr0', 'CR0')} tiene ${g('pe', 'PE')} = 0 y ${g('gdtr', 'GDTR')} está vacío.<br><br>` +
            'El código que va a ejecutarse está en la pestaña <b>Sistema</b>: arma la GDT y pasa a modo protegido. Presione <b>Siguiente</b>.',
        },
        {
          at: 'sis_cargar_gdt', title: 'LGDT: indicarle al CPU dónde está la GDT', hl: ['sysregs', 'view'], view: 'gdt',
          html: () => `La ${g('gdt', 'GDT')} ya está en memoria (son datos definidos con DW/DB en la pestaña Sistema), pero el CPU no sabe dónde está.<br><br>` +
            `<code>LGDT [gdtr_valor]</code> lee 6 bytes: el límite (tamaño − 1) y la base LINEAL de la tabla, y los copia en ${g('gdtr', 'GDTR')}.<br><br>` +
            '👉 Presione <b>F8</b> para ejecutarla y observe cómo cambia GDTR y cómo la pestaña <b>GDT</b> muestra los descriptores. Luego, <b>Siguiente</b>.',
        },
        {
          at: 'sis_cargar_idt', title: 'LIDT: la tabla de interrupciones', hl: ['sysregs', 'view'], view: 'idt',
          html: () => `En modo protegido la ${g('ivt', 'IVT')} del modo real ya no sirve: cada interrupción o excepción usa una ${g('compuerta', 'compuerta')} de 8 bytes de la ${g('idt', 'IDT')}.<br><br>` +
            `<code>LIDT</code> carga ${g('idtr', 'IDTR')} con la base y el límite de la IDT. Presione <b>F8</b> y mire la pestaña <b>IDT / IVT</b>.`,
        },
        {
          at: 'sis_lmsw', title: 'LMSW: se activa PE', hl: ['sysregs', 'regs'], view: 'xlate',
          html: () => `Las dos instrucciones anteriores leyeron la ${g('msw', 'MSW')} en AX (SMSW) y pusieron el bit 0 en 1 (OR AX, 1).<br><br>` +
            `<code>LMSW AX</code> escribe ese valor: ${g('pe', 'PE')} = 1. <b>Desde la próxima instrucción el CPU está en ${g('modoprotegido', 'modo protegido')}</b>.<br><br>` +
            'Presione <b>F8</b> y mire CR0 y el indicador de modo arriba a la derecha.',
        },
        {
          at: 'sis_salto_lejano', title: 'Todavía falta algo: la caché de CS', hl: ['segs'], view: 'gdt',
          html: () => `Ya estamos en modo protegido, pero observe el aviso en <b>CS</b>: su ${g('cache', 'parte oculta')} conserva la base del modo real. ` +
            'Los registros de segmento solo se actualizan cuando se los vuelve a cargar.<br><br>' +
            `<code>JMP SEL_CODIGO:sis_modo_protegido</code> es un salto LEJANO: carga CS con el ${g('selector', 'selector')} 0008h = ${g('indice', 'índice')} 1, ${g('ti', 'TI')} = 0, ${g('rpl', 'RPL')} = 0. ` +
            `El CPU lee el ${g('descriptor', 'descriptor')} 1 de la GDT, verifica que sea de código y copia su base y límite en la caché de CS.<br><br>👉 <b>F8</b> y mire el panel de segmentos.`,
        },
        {
          at: 'sis_cargar_ds', title: 'Cargar DS con un selector', hl: ['segs', 'curPanel'], view: 'gdt',
          html: () => `AX = 0010h = SEL_DATOS: índice 2, TI = 0, RPL = 0.<br><br>` +
            `<code>MOV DS, AX</code> no copia una dirección: el CPU busca el descriptor 2 en la GDT (en GDTR.base + 2 × 8), comprueba que sea de datos, que esté presente y que el privilegio alcance (${g('dpl', 'DPL')} ≥ max(${g('cpl', 'CPL')}, RPL)), y copia base y límite en la caché de DS.<br><br>` +
            '👉 <b>F8</b> y lea "Qué hizo el último paso": verá la lectura del descriptor.',
        },
        {
          at: 'sis_cargar_ss', title: 'La pila también necesita un selector', hl: ['segs'], view: 'stack',
          html: () => 'SS se carga con SEL_PILA (18h), un segmento de datos con base 090000h. Para SS las reglas son más estrictas: debe poder escribirse y su DPL debe ser igual al CPL.<br><br>' +
            'Siga con <b>Siguiente</b> para llegar al programa.',
        },
        {
          at: 't_inicio', title: 'Comienza el programa del alumno', hl: ['segs', 'sysregs'], view: 'gdt',
          html: () => 'El sistema terminó: CS = 0008h, DS = ES = 0010h, SS = 0018h, todos con su caché cargada desde la GDT.<br><br>' +
            'Ahora el programa va a escribir en la pantalla. En modo protegido <b>no</b> puede usarse B800h como segmento: hay que usar un selector cuyo descriptor tenga base 0B8000h (SEL_VIDEO, índice 4).',
        },
        {
          at: 't_escribe', title: 'Traducción de una dirección', hl: ['view'], view: 'xlate',
          html: () => `ES ya tiene SEL_VIDEO. Presione <b>F8</b>: la instrucción escribe en ES:0000.<br><br>` +
            `En la pestaña <b>Traducción</b> (botón "Escritura ES:0000") verá: ${g('logica', 'lógica')} 0020h:0000 → descriptor 4 → base 0B8000h + 0 = ${g('lineal', 'lineal')} 0B8000h → ${g('fisica', 'física')} 0B8000h (sin paginación, lineal = física).<br><br>` +
            'Mire también la <b>Pantalla</b>.',
        },
        {
          at: 't_limite', title: 'La protección en acción', hl: ['regs', 'view'], view: 'gdt',
          html: () => `DI = 4000 (0FA0h). El descriptor de video tiene ${g('limite', 'límite')} 0F9Fh (3999): el último byte válido.<br><br>` +
            'Esta instrucción intenta escribir en ES:0FA0h, <b>fuera del segmento</b>. En modo real no pasaría nada; en modo protegido el CPU lo impide con una excepción <b>#GP</b> (protección general).<br><br>👉 Presione <b>F8</b>.',
        },
        {
          at: 'sis_exc0D', title: 'El CPU atendió la excepción #GP', hl: ['view', 'lastStep'], view: 'stack',
          html: () => `La escritura <b>no se hizo</b>. El CPU leyó la ${g('compuerta', 'compuerta')} 13 de la IDT, apiló FLAGS, CS, IP (de la instrucción que falló: es una ${g('falla', 'falla')}) y un ${g('codigoerror', 'código de error')}, y saltó al manejador.<br><br>` +
            'Mire la pestaña <b>Pila</b>: cada palabra dice quién la apiló. Luego <b>Siguiente</b>.',
        },
        {
          until: (c) => c.halted, title: 'Fin del tour', hl: ['screen'], view: 'stack',
          html: () => 'El manejador del sistema mostró la excepción en la última fila de la <b>Pantalla</b> y detuvo el CPU.<br><br>' +
            'Pruebe ahora: apague el switch <b>Interrupciones (IDT)</b> y vuelva a ejecutar. Sin IDT, el CPU no puede atender el #GP: <b>doble falta</b> y luego <b>triple falta</b> (en una PC real, reinicio). Mire la pestaña Eventos.',
        },
      ],
    },
    {
      id: 'pg', title: 'Paginación y memoria virtual', opts: { pm: true, idt: true, paging: true },
      code: `; Programa del tour "Paginación y memoria virtual"
t_inicio:
        mov ax, SEL_VIRTUAL
        mov es, ax                       ; base LINEAL 400000h
t_escribe:
        mov word ptr es:[0000h], 1234h   ; lineal 400000h
t_alias:
        mov ax, es:[3000h]               ; lineal 403000h: ¡mismo marco!
t_video:
        mov word ptr es:[2000h], 1F50h   ; lineal 402000h → memoria de video
t_falla:
        mov word ptr es:[1000h], 0ABCDh  ; lineal 401000h: página NO presente
        mov bx, es:[1000h]
        hlt
`,
      steps: [
        {
          title: 'Dos traducciones en cadena', hl: ['view'], view: 'paging',
          html: () => `Con ${g('paginacion', 'paginación')} hay dos etapas:<br>` +
            `① ${g('logica', 'lógica')} (selector:desplazamiento) → segmentación → ${g('lineal', 'LINEAL')}<br>② lineal → tablas de páginas → ${g('fisica', 'FÍSICA')}<br><br>` +
            `La dirección lineal se parte en: índice de directorio (10 bits) | índice de tabla (10 bits) | desplazamiento (12 bits). Cada ${g('pagina', 'página')} mide 4 KB.<br><br>Presione <b>Siguiente</b>.`,
        },
        {
          at: 'sis_tablas', title: 'Construcción de las tablas (en modo real)', hl: ['view'], view: 'mem',
          html: () => 'El sistema llena con ceros 12 KB en la física 20000h (directorio + 2 tablas) y luego escribe las entradas: ' +
            `la ${g('pde', 'PDE')} 0 apunta a la tabla 0 (identidad del primer MB) y la PDE 1 a la tabla 1 (zona virtual 400000h).<br><br>` +
            'Son miles de instrucciones: presione <b>Siguiente</b> para ejecutarlas rápido.',
        },
        {
          at: 'sis_cargar_cr3', title: 'CR3: dónde está el directorio', hl: ['sysregs', 'view'], view: 'paging',
          html: () => `Ya en modo protegido, falta indicarle al CPU dónde está el directorio de páginas: ${g('cr3', 'CR3')} = 20000h (dirección <b>física</b>).<br><br>` +
            'Presione <b>F8</b> dos veces (MOV EAX y MOV CR3) y mire la pestaña <b>Paginación</b>: ya se ven las entradas presentes.',
        },
        {
          at: 'sis_activar_pg', title: 'PG = 1: se activa la paginación', hl: ['sysregs'], view: 'paging',
          html: () => `Estas tres instrucciones ponen en 1 el bit ${g('pg', 'PG')} (bit 31) de ${g('cr0', 'CR0')}. Desde ese momento <b>toda</b> dirección lineal pasa por las tablas, incluso las del propio código.<br><br>` +
            'Por eso la tabla 0 mapea el primer MB con identidad (lineal = física): el código que se está ejecutando sigue en su lugar.',
        },
        {
          at: 't_escribe', title: 'Una dirección lineal "virtual"', hl: ['segs', 'view'], view: 'xlate',
          html: () => 'ES = SEL_VIRTUAL: base LINEAL 400000h (4 MB). La máquina tiene memoria ahí, pero lo importante es a dónde lleva la tabla de páginas.<br><br>' +
            '👉 <b>F8</b>, y en <b>Traducción</b> elija "Escritura ES:0000": lineal 00400000h → directorio 1, tabla 0, desplazamiento 000 → PTE → marco <b>030000h</b>.',
        },
        {
          at: 't_alias', title: 'Dos páginas, un mismo marco', hl: ['regs', 'view'], view: 'paging',
          html: () => 'La PTE 3 de la tabla 1 apunta al <b>mismo marco</b> (030000h) que la PTE 0. Leer la lineal 403000h devuelve lo que se escribió en 400000h.<br><br>' +
            '👉 <b>F8</b> y mire AX: vale 1234h. Así comparten memoria dos procesos en un sistema operativo.',
        },
        {
          at: 't_video', title: 'Mapear un dispositivo', hl: ['screen', 'view'], view: 'xlate',
          html: () => 'La PTE 2 apunta al marco 0B8000h: la memoria de video. Escribir en la lineal 402000h hace aparecer un carácter en la pantalla.<br><br>👉 <b>F8</b> y mire la Pantalla.',
        },
        {
          at: 't_falla', title: 'Una página NO presente', hl: ['view'], view: 'paging',
          html: () => `La PTE 1 (lineal 401000h) tiene P = 0. Al acceder, el CPU no puede traducir: produce una <b>falla de página (#PF)</b>, guarda la dirección lineal en ${g('cr2', 'CR2')} y apila un ${g('codigoerror', 'código de error')}.<br><br>👉 Presione <b>F8</b>.`,
        },
        {
          at: 'sis_falla_pagina', title: 'El manejador de #PF', hl: ['sysregs', 'view'], view: 'stack',
          html: () => 'Mire CR2 = 00401000h y, en la Pila, el código de error (bit 1 = 1: fue una escritura).<br><br>' +
            'El manejador del sistema toma un marco libre (40000h), escribe la PTE con P = 1 y vuelve con IRET. Presione <b>Siguiente</b> para ejecutarlo.',
        },
        {
          at: 't_falla', title: '¡La misma instrucción otra vez!', hl: ['view', 'curPanel'], view: 'paging',
          html: () => `Como #PF es una ${g('falla', 'falla')}, la dirección de retorno apuntaba a la instrucción que falló: el CPU la <b>reintenta</b>. Ahora la PTE 1 está presente (vea la tabla de la PDE 1).<br><br>` +
            'Así funciona la <b>memoria virtual</b>: el programa no se enteró de nada. 👉 <b>F8</b>.',
        },
        {
          until: (c) => c.halted, title: 'Fin del tour', hl: ['view'], view: 'paging',
          html: () => `Pruebe ahora en la pestaña <b>Paginación</b> la casilla <b>"Simular ${g('tlb', 'TLB')}"</b> y vuelva a ejecutar: verá qué traducciones guarda el CPU para no recorrer las tablas en cada acceso.`,
        },
      ],
    },
    {
      id: 'b32', title: 'Del 286 al 386: código de 32 bits', opts: { pm: true, b32: true, idt: true, paging: false },
      code: `; Programa del tour "Del 286 al 386: código de 32 bits"
t_inicio:
        mov ebx, offset tabla
        mov esi, 3
t_escala:
        mov eax, [ebx + esi*4]            ; 4º elemento: EBX + ESI × 4
        mov edi, 0B8000h                  ; dirección LINEAL de la memoria de video
t_plano:
        mov dword ptr fs:[edi], 1F381F33h ; '3' y '8'
        mov word ptr fs:[edi+4], 1F36h    ; '6'
        hlt

tabla   dd 10, 20, 30, 40, 50
`,
      steps: [
        {
          title: 'Qué agrega el 80386', hl: ['regs'], view: 'gdt',
          html: () => 'El 80386 extiende el 286: registros de 32 bits (EAX…, EIP, EFLAGS), direcciones de 32 bits con escala ' +
            `(${g('sib', 'byte SIB')}), dos registros de segmento más (FS, GS), descriptores con base de 32 bits y límite de hasta 4 GB, y ${g('paginacion', 'paginación')}.<br><br>` +
            `Lo más importante: el modo protegido puede ser de <b>16 o de 32 bits</b>, según el ${g('bitd', 'bit D')} del segmento de código. Presione <b>Siguiente</b>.`,
        },
        {
          at: 'sis_cargar_gdt', title: 'Descriptores del 286 y del 386 en la misma GDT', hl: ['view'], view: 'gdt', gdtSel: 9,
          html: () => 'Presione <b>F8</b> para cargar la GDT y mire la pestaña <b>GDT</b>. Los descriptores 1 a 8 tienen los bytes +6 y +7 en cero: formato del 286. ' +
            `Los descriptores 9 a 12 usan esos bytes: <b>CFh</b> = ${g('bitg', 'G=1')} (límite en páginas de 4 KB → 4 GB) y ${g('bitd', 'D=1')} (32 bits).<br><br>` +
            'Haga clic en la fila 9 (SEL_CODIGO32) para ver el detalle bit a bit.',
        },
        {
          at: 'sis_lmsw', title: 'MOV CR0: la forma del 386', hl: ['sysregs', 'regs'], view: 'gdt',
          html: () => `El 286 activaba el modo protegido con LMSW. El 386 tiene el registro ${g('cr0', 'CR0')} completo de 32 bits: se lee con MOV EAX, CR0, se pone ${g('pe', 'PE')}=1 y se escribe con <code>MOV CR0, EAX</code>.<br><br>` +
            'A diferencia del 286, el 386 también puede volver a modo real poniendo PE=0. 👉 <b>F8</b>.',
        },
        {
          at: 'sis_salto_lejano', title: 'El salto que cambia el tamaño del código', hl: ['segs', 'regs'], view: 'gdt',
          html: () => `<code>JMP SEL_CODIGO32:…</code> carga CS con el descriptor 9, que tiene ${g('bitd', 'D=1')}.<br><br>` +
            'Hasta ahora el indicador de Registros dice <b>"código de 16 bits"</b>: el byte B8h significa MOV AX, imm16. Después del salto dirá <b>"código de 32 bits"</b> y el mismo B8h será MOV EAX, imm32. ' +
            `El ensamblador lo sabe por la directiva <code>BITS 32</code>, y cuando el tamaño no coincide agrega los ${g('prefijo', 'prefijos 66h/67h')}.<br><br>👉 <b>F8</b> y mire los paneles resaltados.`,
        },
        {
          at: 'sis_cargar_ss', title: 'Una pila de 32 bits', hl: ['segs'], view: 'stack',
          html: () => `DS y ES ya tienen SEL_DATOS32, FS tiene SEL_PLANO y GS el segmento de video. SS va a recibir SEL_PILA32, que tiene el ${g('bitb', 'bit B=1')}: ` +
            'desde entonces PUSH y POP usan <b>ESP</b> y las entradas de la pila (y las que apila una interrupción) son de 4 bytes.',
        },
        {
          at: 't_escala', title: 'Direcciones de 32 bits con escala', hl: ['view', 'curPanel'], view: 'xlate',
          html: () => `EBX tiene la dirección de <code>tabla</code> y ESI = 3. <code>[EBX + ESI*4]</code> calcula EBX + 3 × 4: el 4º elemento de un arreglo de DWORD. En 16 bits esto no existía: había que multiplicar a mano.<br><br>` +
            '👉 <b>F8</b>, mire AX (EAX = 40) y la explicación en "Qué hizo el último paso".',
        },
        {
          at: 't_plano', title: 'El modelo plano', hl: ['view', 'screen'], view: 'xlate',
          html: () => `FS tiene SEL_PLANO: base 0 y límite 4 GB (${g('plano', 'modelo plano')}). Con él la segmentación "desaparece": el desplazamiento EDI = 000B8000h <b>es</b> la dirección lineal de la memoria de video.<br><br>` +
            '👉 <b>F8</b> y mire en <b>Traducción</b> (botón "Escritura FS:…") cómo base 0 + B8000h = B8000h, y la pantalla.',
        },
        {
          until: (c) => c.halted, title: 'Fin del tour', hl: ['screen'], view: 'gdt',
          html: () => 'Así trabajan los sistemas operativos de 32 bits (Windows NT, Linux): segmentos planos de 4 GB y la protección real hecha con la paginación.<br><br>' +
            'Pruebe el ejemplo <b>14 · Modo protegido de 32 bits</b> y el ejercicio <b>Modo plano de 32 bits</b>.',
        },
      ],
    },
  ];
})(window.EMU);
