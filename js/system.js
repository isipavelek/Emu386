/* =====================================================================
 *  EMU386 - Generador del "código del sistema"
 *  Según los switches arma: GDT, IDT + manejadores, tablas de páginas,
 *  y el código mínimo para pasar de modo real a modo protegido de 16 o
 *  de 32 bits. El resultado es código assembly común: el alumno puede
 *  leerlo y ejecutarlo paso a paso.
 * ===================================================================== */
'use strict';
(function (EMU) {
  const h2 = (n) => EMU.hex(n, 2);

  EMU.SELECTORS = [
    { name: 'SEL_NULO', sel: 0x00, desc: 'descriptor nulo (obligatorio)' },
    { name: 'SEL_CODIGO', sel: 0x08, desc: 'código de 16 bits: base 010000h, límite FFFFh, ejecutable/legible' },
    { name: 'SEL_DATOS', sel: 0x10, desc: 'datos del programa: base 010000h, límite FFFFh, lectura/escritura' },
    { name: 'SEL_PILA', sel: 0x18, desc: 'pila de 16 bits (SP): base 090000h, límite FFFFh' },
    { name: 'SEL_VIDEO', sel: 0x20, desc: 'memoria de video: base 0B8000h, límite 0F9Fh (4000 bytes)' },
    { name: 'SEL_SOLOLECT', sel: 0x28, desc: 'datos de SOLO LECTURA: base 010000h, límite FFFFh' },
    { name: 'SEL_GDT', sel: 0x30, desc: 'alias de la propia GDT (para leerla/modificarla como datos)' },
    { name: 'SEL_TABLAS', sel: 0x38, desc: 'directorio y tablas de páginas: base 020000h, límite 2FFFh' },
    { name: 'SEL_VIRTUAL', sel: 0x40, desc: 'zona "virtual": base LINEAL 400000h, límite FFFFh (usa paginación)' },
    { name: 'SEL_CODIGO32', sel: 0x48, desc: 'código de 32 bits (D=1): base 010000h, límite 4 GB (G=1)' },
    { name: 'SEL_DATOS32', sel: 0x50, desc: 'datos de 32 bits: base 010000h, límite 4 GB (G=1)' },
    { name: 'SEL_PILA32', sel: 0x58, desc: 'pila de 32 bits (B=1, usa ESP): base 090000h, límite FFFFh' },
    { name: 'SEL_PLANO', sel: 0x60, desc: 'modelo "plano": base 0, límite 4 GB: offset = dirección lineal' },
  ];

  const EXC_SHORT = ['#DE división por cero', '#DB depuración', 'NMI', '#BP breakpoint', '#OF desbordamiento',
    '#BR BOUND', '#UD opcode inválido', '#NM sin coprocesador', '#DF doble falta', 'reservado (seg. coprocesador)',
    '#TS TSS inválido', '#NP segmento no presente', '#SS falla de pila', '#GP protección general', '#PF falla de página',
    'reservado', '#MF coma flotante'];

  EMU.buildSystem = function (opt) {
    if (!opt || !opt.pm) return '';
    const P = !!opt.paging, I = !!opt.idt, B = !!opt.b32;
    const W = B ? 4 : 2;
    const r = (x) => (B ? 'e' : '') + x;           // ax → eax en 32 bits
    const CODE = B ? 'SEL_CODIGO32' : 'SEL_CODIGO', DATA = B ? 'SEL_DATOS32' : 'SEL_DATOS', STACK = B ? 'SEL_PILA32' : 'SEL_PILA';
    const L = [];
    const add = (...lines) => L.push(...lines);

    add(
      '; ======================================================================',
      ';  CÓDIGO DEL SISTEMA — generado automáticamente por los switches',
      `;  Modo protegido: SÍ (${B ? '32' : '16'} bits)   IDT/excepciones: ${I ? 'SÍ' : 'NO'}   Paginación: ${P ? 'SÍ' : 'NO'}`,
      '; ======================================================================',
      '; El CPU arranca en MODO REAL con CS=DS=ES=1000h (dirección lineal 10000h).',
      '; Este código: 1) arma la GDT' + (I ? ', 2) la IDT' : '') + (P ? ', 3) las tablas de páginas' : ''),
      `;             y luego pasa a MODO PROTEGIDO DE ${B ? '32' : '16'} BITS y sigue con el programa del alumno.`,
      '',
      '; ---- Selectores = índice*8 + TI*4 + RPL  (TI=0: GDT, RPL=0: anillo 0) ----',
    );
    EMU.SELECTORS.forEach((s, i) => add(`${s.name.padEnd(12)} equ ${h2(s.sel)}h   ; índice ${i}: ${s.desc}`));
    add(
      'BASE_PROG    equ 10000h  ; dirección lineal donde está cargado este programa',
      '',
      '        jmp sis_arranque          ; saltar por encima de las tablas',
      '',
      '        align 8',
      '; ==== GDT: Tabla Global de Descriptores ===============================',
      '; Formato de un descriptor (8 bytes):',
      ';   +0  dw  límite (bits 15..0)',
      ';   +2  dw  base   (bits 15..0)',
      ';   +4  db  base   (bits 23..16)',
      ';   +5  db  derechos de acceso = P | DPL (2 bits) | S | TIPO (4 bits)',
      ';   +6  db  G | D/B | 0 | AVL | límite (bits 19..16)      (en el 286: 0)',
      ';   +7  db  base   (bits 31..24)                          (en el 286: 0)',
      ';   G=1: el límite se cuenta en páginas de 4 KB · D=1: segmento de 32 bits',
      'gdt:',
      'gdt_nulo:     dw 0000h, 0000h      ; índice 0: el descriptor nulo',
      '              db 00h, 00h, 00h, 00h',
      'gdt_codigo:   dw 0FFFFh, 0000h     ; límite = 64 KB - 1, base = 01_0000h',
      '              db 01h, 9Ah          ; 9Ah = 1001 1010b: P=1 DPL=00 S=1 código ejecutable/legible',
      '              db 00h, 00h          ; formato 286: 16 bits',
      'gdt_datos:    dw 0FFFFh, 0000h     ; misma base que el código: son los datos del programa',
      '              db 01h, 92h          ; 92h = 1001 0010b: P=1 DPL=00 S=1 datos lectura/escritura',
      '              db 00h, 00h',
      'gdt_pila:     dw 0FFFFh, 0000h     ; base = 09_0000h',
      '              db 09h, 92h',
      '              db 00h, 00h',
      'gdt_video:    dw 0F9Fh, 8000h      ; base = 0B_8000h, límite = 80*25*2 - 1 = 3999',
      '              db 0Bh, 92h',
      '              db 00h, 00h',
      'gdt_sololect: dw 0FFFFh, 0000h     ; base = 01_0000h',
      '              db 01h, 90h          ; 90h = 1001 0000b: datos de SOLO LECTURA',
      '              db 00h, 00h',
      'gdt_alias:    dw gdt_fin - gdt - 1, (BASE_PROG + gdt) & 0FFFFh   ; ¡la propia GDT!',
      '              db (BASE_PROG + gdt) >> 16, 92h',
      '              db 00h, 00h',
      'gdt_tablas:   dw 2FFFh, 0000h      ; base = 02_0000h: directorio + 2 tablas de páginas',
      '              db 02h, 92h',
      '              db 00h, 00h',
      'gdt_virtual:  dw 0FFFFh, 0000h     ; base = 40_0000h (4 MB): zona "virtual" paginada',
      '              db 40h, 92h',
      '              db 00h, 00h',
      '; ---- descriptores del 386 (usan los bytes +6 y +7) ----',
      'gdt_codigo32: dw 0FFFFh, 0000h     ; base = 01_0000h, límite 19..0 = F_FFFFh',
      '              db 01h, 9Ah          ; código ejecutable/legible',
      '              db 0CFh, 00h         ; CFh = 1100 1111b: G=1 (×4 KB → 4 GB) D=1 (32 bits), límite 19..16 = Fh',
      'gdt_datos32:  dw 0FFFFh, 0000h     ; base = 01_0000h, límite 4 GB',
      '              db 01h, 92h',
      '              db 0CFh, 00h',
      'gdt_pila32:   dw 0FFFFh, 0000h     ; base = 09_0000h, límite FFFFh',
      '              db 09h, 92h',
      '              db 40h, 00h          ; 40h: B=1 → la pila usa ESP (32 bits)',
      'gdt_plano:    dw 0FFFFh, 0000h     ; base = 0, límite 4 GB: offset = dirección lineal',
      '              db 00h, 92h',
      '              db 0CFh, 00h',
      'gdt_fin:',
      '',
      'gdtr_valor:   dw gdt_fin - gdt - 1  ; límite de la GDT (tamaño en bytes - 1)',
      '              dd BASE_PROG + gdt     ; base LINEAL de la GDT (¡no un offset!)',
      '',
    );

    if (I) {
      add(
        '        align 8',
        '; ==== IDT: Tabla de Descriptores de Interrupción ======================',
        `; Compuerta de interrupción de ${B ? '32 bits (386)' : '16 bits (286)'} (8 bytes):`,
        ';   +0  dw  offset del manejador (bits 15..0)',
        ';   +2  dw  selector del segmento de código del manejador',
        ';   +4  db  0',
        B ? ';   +5  db  8Eh = 1000 1110b: P=1 DPL=00 S=0 TIPO=Eh (compuerta de interrupción 386)'
          : ';   +5  db  86h = 1000 0110b: P=1 DPL=00 S=0 TIPO=6 (compuerta de interrupción 286)',
        B ? ';   +6  dw  offset del manejador (bits 31..16)' : ';   +6  dw  0 (reservado)',
        'idt:',
      );
      const acc = B ? '8Eh' : '86h';
      for (let v = 0; v < 32; v++) {
        add(`idt_${h2(v)}:  dw sis_exc${h2(v)}, ${CODE}   ; vector ${v}: ${EXC_SHORT[v] || 'reservado'}`,
          `        db 0, ${acc}`,
          '        dw 0');
      }
      add(
        '        times 16*8 db 0          ; vectores 20h..2Fh: vacíos (P=0, no presentes)',
        `idt_30:  dw sis_int30, ${CODE}   ; vector 30h: servicio de pantalla del sistema (INT 30h)`,
        `        db 0, ${acc}`,
        '        dw 0',
        'idt_fin:',
        '',
        'idtr_valor:   dw idt_fin - idt - 1  ; límite de la IDT',
        '              dd BASE_PROG + idt     ; base LINEAL de la IDT',
        '',
      );
    }

    add('; ---- variables del sistema ----');
    if (I) {
      add(
        `sis_cursor:      ${B ? 'dd' : 'dw'} 0              ; posición de escritura de INT 30h (offset en la memoria de video)`,
        "sis_txt_exc:     db 'EXCEPCION ', 0",
        "sis_txt_err:     db ' ERROR=', 0",
        "sis_txt_en:      db ' EN ', 0",
      );
    }
    if (P) add('sis_marco_libre: dw 40h            ; próximo marco físico libre (nº de página: 40h → 40000h)');
    add('');

    if (I) {
      if (B) add('        bits 32                  ; los manejadores se ejecutan en el segmento de código de 32 bits');
      add(
        '; ==== Puntos de entrada de las excepciones ============================',
        `; Cada uno deja en la pila:  [${r('sp').toUpperCase()}]=nº de vector  [${r('sp').toUpperCase()}+${W}]=código de error`,
        '; (si el CPU no apila código de error, se apila un 0 para uniformar)',
      );
      for (let v = 0; v < 32; v++) {
        if (v === 14 && P) { add(`sis_exc${h2(v)}: jmp sis_falla_pagina        ; #PF: memoria virtual (ver más abajo)`); continue; }
        if (EMU.hasErrorCode(v) && v !== 17) add(`sis_exc${h2(v)}: push ${h2(v)}h                ; el CPU ya apiló el código de error`, '        jmp sis_excepcion');
        else add(`sis_exc${h2(v)}: push 0`, `        push ${h2(v)}h`, '        jmp sis_excepcion');
      }
      const BP = r('bp').toUpperCase();
      add(
        '',
        '; ---- Manejador genérico: muestra la excepción en la última fila y detiene ----',
        `; Pila:  [${BP}]=vector  [${BP}+${W}]=código de error  [${BP}+${2 * W}]=${B ? 'EIP' : 'IP'}  [${BP}+${3 * W}]=CS  [${BP}+${4 * W}]=${B ? 'EFLAGS' : 'FLAGS'}`,
        'sis_excepcion:',
        `        mov ${r('bp')}, ${r('sp')}`,
        `        mov ax, ${DATA}`,
        '        mov ds, ax',
        '        mov ax, SEL_VIDEO',
        '        mov es, ax',
        `        mov ${r('di')}, 24*160           ; última fila de la pantalla`,
        '        mov bh, 4Fh              ; blanco sobre rojo',
        `        mov ${r('si')}, offset sis_txt_exc`,
        '        call sis_imprimir_txt',
        `        mov ${r('ax')}, [${r('bp')}]             ; nº de vector`,
        '        call sis_imprimir_hex',
        `        mov ${r('si')}, offset sis_txt_err`,
        '        call sis_imprimir_txt',
        `        mov ${r('ax')}, [${r('bp')}+${W}]           ; código de error`,
        '        call sis_imprimir_hex',
        `        mov ${r('si')}, offset sis_txt_en`,
        '        call sis_imprimir_txt',
        `        mov ${r('ax')}, [${r('bp')}+${3 * W}]           ; CS donde ocurrió`,
        '        call sis_imprimir_hex',
        "        mov al, ':'",
        '        call sis_imprimir_car',
        `        mov ${r('ax')}, [${r('bp')}+${2 * W}]           ; ${B ? 'EIP' : 'IP'} donde ocurrió`,
        '        call sis_imprimir_hex',
        'sis_detener:',
        '        hlt                      ; el sistema se detiene',
        '        jmp sis_detener',
        '',
      );
      if (P) {
        add(
          '; ---- #PF: falla de página → "paginación por demanda" -------------------',
          '; Si la dirección (CR2) está en la zona virtual 400000h..7FFFFFh, se toma',
          '; un marco físico libre, se completa la PTE y se REINTENTA la instrucción.',
          `sis_falla_pagina:                ; pila: [${r('sp').toUpperCase()}]=código de error, ${B ? 'EIP' : 'IP'}, CS, ${B ? 'EFLAGS' : 'FLAGS'}`,
          '        push eax',
          `        push ${r('bx')}`,
          '        push ds',
          '        push es',
          '        mov eax, cr2             ; CR2 = dirección LINEAL que provocó la falla',
          '        shr eax, 12              ; nº de página lineal',
          '        cmp eax, 400h            ; ¿por debajo de 400000h?',
          '        jb sis_pf_fatal',
          '        cmp eax, 800h            ; ¿por encima de 7FFFFFh?',
          '        jae sis_pf_fatal',
          `        and ${r('ax')}, 3FFh             ; índice dentro de la tabla de páginas 1`,
          `        shl ${r('ax')}, 2                ; cada entrada (PTE) ocupa 4 bytes`,
          `        mov ${r('bx')}, ${r('ax')}`,
          `        mov ax, ${DATA}`,
          '        mov ds, ax',
          '        mov ax, SEL_TABLAS',
          '        mov es, ax',
          '        xor eax, eax',
          '        mov ax, [sis_marco_libre] ; nº del próximo marco libre',
          '        inc word ptr [sis_marco_libre]',
          '        shl eax, 12              ; → dirección física del marco',
          '        or al, 3                 ; P=1 (presente), R/W=1 (escritura)',
          `        mov es:[${r('bx')}+2000h], eax   ; escribir la PTE (tabla 1 está en física 22000h)`,
          '        pop es',
          '        pop ds',
          `        pop ${r('bx')}`,
          '        pop eax',
          `        add ${r('sp')}, ${W}                ; descartar el código de error`,
          `        iret                     ; ${B ? '(IRETD) ' : ''}volver y REINTENTAR la instrucción que falló`,
          'sis_pf_fatal:',
          '        pop es',
          '        pop ds',
          `        pop ${r('bx')}`,
          '        pop eax',
          '        push 0Eh                 ; nº de vector, para el manejador genérico',
          '        jmp sis_excepcion',
          '',
        );
      }
      add(
        '; ---- INT 30h: servicio de pantalla del sistema (modo protegido) --------',
        `;   AH=0: imprimir el texto DS:${r('si').toUpperCase()} (terminado en 0)   AH=1: imprimir el carácter AL`,
        `;   AH=2: imprimir ${r('dx').toUpperCase()} en hexadecimal                AH=3: cursor en fila DH, columna DL`,
        ';   BL = color (atributo); si BL=0 se usa 07h (gris sobre negro). Carácter 10 = nueva línea',
        'sis_int30:',
        `        ${B ? 'pushad' : 'pusha'}`,
        '        push ds',
        '        push es',
        '        mov bh, bl',
        '        or bh, bh',
        '        jnz sis_i30_color',
        '        mov bh, 07h',
        'sis_i30_color:',
        '        mov cx, SEL_VIDEO',
        '        mov es, cx',
        '        push ds                  ; DS del que llamó (dónde está el texto)',
        `        mov cx, ${DATA}`,
        '        mov ds, cx',
        `        mov ${r('di')}, [sis_cursor]     ; posición actual del cursor`,
        '        pop ds',
        '        cmp ah, 0',
        '        je sis_i30_texto',
        '        cmp ah, 1',
        '        je sis_i30_car',
        '        cmp ah, 2',
        '        je sis_i30_hex',
        '        cmp ah, 3',
        '        je sis_i30_pos',
        '        jmp sis_i30_fin',
        'sis_i30_texto:',
        '        call sis_imprimir_txt',
        '        jmp sis_i30_fin',
        'sis_i30_car:',
        '        call sis_imprimir_car',
        '        jmp sis_i30_fin',
        'sis_i30_hex:',
        `        mov ${r('ax')}, ${r('dx')}`,
        '        call sis_imprimir_hex',
        '        jmp sis_i30_fin',
        'sis_i30_pos:',
        '        mov al, dh',
        '        mov cl, 80',
        '        mul cl                   ; AX = fila * 80',
        '        xor dh, dh',
        '        add ax, dx               ; + columna',
        '        shl ax, 1                ; * 2 bytes por celda',
        B ? '        movzx edi, ax' : '        mov di, ax',
        'sis_i30_fin:',
        `        mov cx, ${DATA}`,
        '        mov ds, cx',
        `        mov [sis_cursor], ${r('di')}`,
        '        pop es',
        '        pop ds',
        `        ${B ? 'popad' : 'popa'}`,
        `        iret${B ? '                     ; en código de 32 bits IRET es IRETD' : ''}`,
        '',
        `; ---- rutinas de impresión: escriben en ES:${r('di').toUpperCase()} con el atributo BH ----`,
        'sis_imprimir_car:                ; AL = carácter (10 = nueva línea)',
        '        cmp al, 10',
        '        je sis_ic_nl',
        '        mov ah, bh',
        '        stosw',
        '        jmp sis_ic_fin',
        'sis_ic_nl:',
        `        push ${r('ax')}`,
        `        push ${r('bx')}`,
        `        push ${r('dx')}`,
        `        mov ${r('ax')}, ${r('di')}`,
        `        xor ${r('dx')}, ${r('dx')}`,
        `        mov ${r('bx')}, 160`,
        `        div ${r('bx')}                   ; = fila actual`,
        `        inc ${r('ax')}`,
        `        mul ${r('bx')}                   ; = comienzo de la fila siguiente`,
        `        mov ${r('di')}, ${r('ax')}`,
        `        pop ${r('dx')}`,
        `        pop ${r('bx')}`,
        `        pop ${r('ax')}`,
        'sis_ic_fin:',
        `        cmp ${r('di')}, 4000             ; ¿pasó el final de la pantalla?`,
        '        jb sis_ic_ok',
        `        xor ${r('di')}, ${r('di')}`,
        'sis_ic_ok:',
        '        ret',
        '',
        `sis_imprimir_txt:                ; DS:${r('si').toUpperCase()} = texto terminado en 0`,
        '        lodsb',
        '        or al, al',
        '        jz sis_it_fin',
        '        call sis_imprimir_car',
        '        jmp sis_imprimir_txt',
        'sis_it_fin:',
        '        ret',
        '',
        `sis_imprimir_hex:                ; ${r('ax').toUpperCase()} = valor (${B ? 8 : 4} dígitos hexadecimales)`,
        `        push ${r('cx')}`,
        `        mov ${r('cx')}, ${B ? 8 : 4}`,
        'sis_ih_bucle:',
        `        rol ${r('ax')}, 4`,
        `        push ${r('ax')}`,
        '        and al, 0Fh',
        "        add al, '0'",
        "        cmp al, '9'",
        '        jbe sis_ih_dig',
        '        add al, 7                ; A..F',
        'sis_ih_dig:',
        '        call sis_imprimir_car',
        `        pop ${r('ax')}`,
        '        loop sis_ih_bucle',
        `        pop ${r('cx')}`,
        '        ret',
        '',
      );
      if (B) add('        bits 16                  ; el arranque se ejecuta en modo real (16 bits)');
    }

    add(
      '; ======================================================================',
      ';  ARRANQUE (en MODO REAL)',
      '; ======================================================================',
      'sis_arranque:',
      '        cli                      ; sin interrupciones durante el cambio de modo',
      '        mov ax, cs',
      '        mov ds, ax               ; DS = 1000h para leer gdtr_valor',
    );
    if (P) {
      add(
        '',
        '        ; ---- Construir las tablas de páginas (todavía en modo real) ----',
        '        ; Directorio de páginas en física 20000h (1024 entradas de 4 bytes)',
        '        ; Tabla de páginas 0 en 21000h: lineal 000000h-0FFFFFh → identidad',
        '        ; Tabla de páginas 1 en 22000h: lineal 400000h-7FFFFFh → zona "virtual"',
        'sis_tablas:',
        '        mov ax, 2000h',
        '        mov es, ax               ; ES:0000 = física 20000h',
        '        xor di, di',
        '        xor ax, ax',
        '        mov cx, 3000h / 2        ; 12 KB = directorio + 2 tablas',
        '        cld',
        '        rep stosw                ; todo en cero = entradas NO presentes',
        '        ; PDE 0 → tabla 0 (física 21000h), P=1 R/W=1  →  00021003h',
        '        mov word ptr es:[0000h], 1003h',
        '        mov word ptr es:[0002h], 0002h',
        '        ; PDE 1 → tabla 1 (física 22000h)             →  00022003h',
        '        mov word ptr es:[0004h], 2003h',
        '        mov word ptr es:[0006h], 0002h',
        '        ; Tabla 0: página i → marco i, para i = 0..255 (primer MB)',
        '        mov di, 1000h',
        '        mov eax, 00000003h       ; PTE: marco 0 | P | R/W',
        '        mov cx, 256',
        'sis_pg_identidad:',
        '        mov es:[di], eax         ; escribir la PTE (4 bytes)',
        '        add di, 4',
        '        add eax, 1000h           ; siguiente marco (4 KB más arriba)',
        '        loop sis_pg_identidad',
        '        ; Tabla 1 (lineal 400000h + i*4K):',
        '        ;   PTE 0 → marco 030000h',
        '        ;   PTE 1 → NO presente (provoca #PF)',
        '        ;   PTE 2 → marco 0B8000h (¡la memoria de video!)',
        '        ;   PTE 3 → marco 030000h (alias: el mismo marco que la PTE 0)',
        '        mov dword ptr es:[2000h], 00030003h',
        '        mov dword ptr es:[2008h], 000B8003h',
        '        mov dword ptr es:[200Ch], 00030003h',
        '',
      );
    }
    add('sis_cargar_gdt:', '        lgdt [gdtr_valor]        ; GDTR ← base y límite de la GDT');
    if (I) add('sis_cargar_idt:', '        lidt [idtr_valor]        ; IDTR ← base y límite de la IDT');
    if (B) {
      add(
        'sis_activar_pe:',
        '        mov eax, cr0             ; forma del 386: leer CR0 completo',
        '        or eax, 1                ; PE = 1 (Protection Enable)',
        'sis_lmsw:',
        '        mov cr0, eax             ; ¡AHORA EL CPU ESTÁ EN MODO PROTEGIDO!',
        'sis_salto_lejano:',
        '        jmp SEL_CODIGO32:sis_modo_protegido  ; salto LEJANO a un segmento de código de 32 bits (D=1)',
        '',
        '        bits 32                  ; desde aquí el ensamblador genera código de 32 bits',
      );
    } else {
      add(
        'sis_activar_pe:',
        '        smsw ax                  ; AX ← MSW (palabra de estado = parte baja de CR0)',
        '        or ax, 1                 ; PE = 1 (Protection Enable)',
        'sis_lmsw:',
        '        lmsw ax                  ; ¡AHORA EL CPU ESTÁ EN MODO PROTEGIDO!',
        'sis_salto_lejano:',
        '        jmp SEL_CODIGO:sis_modo_protegido  ; salto LEJANO: carga CS con un selector',
        '',
      );
    }
    add(
      `sis_modo_protegido:              ; --- desde aquí: modo protegido de ${B ? 32 : 16} bits ---`,
      `        mov ax, ${DATA}`,
      'sis_cargar_ds:',
      '        mov ds, ax               ; cada carga de un registro de segmento lee',
      '        mov es, ax               ; un descriptor de la GDT y llena su caché',
      '        mov ax, SEL_PLANO',
      '        mov fs, ax               ; FS: modelo plano (offset = dirección lineal)',
      '        mov ax, SEL_VIDEO',
      '        mov gs, ax               ; GS: memoria de video',
      'sis_cargar_ss:',
      `        mov ax, ${STACK}`,
      '        mov ss, ax',
      B ? '        mov esp, 0FFFCh          ; la pila de 32 bits usa ESP' : '        mov sp, 0FFFEh',
    );
    if (P) {
      add(
        '',
        '        ; ---- Activar la paginación ----',
        'sis_cargar_cr3:',
        '        mov eax, 20000h',
        '        mov cr3, eax             ; CR3 = dirección FÍSICA del directorio de páginas',
        'sis_activar_pg:',
        '        mov eax, cr0',
        '        or eax, 80000000h        ; PG = 1 (bit 31 de CR0)',
        '        mov cr0, eax             ; desde ahora: lineal → tablas → física',
      );
    }
    add(
      '',
      '; ======================================================================',
      `;  FIN DEL CÓDIGO DEL SISTEMA. Sigue el PROGRAMA DEL ALUMNO (pestaña Programa)${B ? ', en 32 bits' : ''}`,
      '; ======================================================================',
      'sis_fin_sistema:',
    );
    return L.join('\n');
  };
})(window.EMU);
