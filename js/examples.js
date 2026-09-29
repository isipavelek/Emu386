/* =====================================================================
 *  EMU386 - Programas de ejemplo (progresivos)
 * ===================================================================== */
'use strict';
(function (EMU) {
  EMU.EXAMPLES = [
    {
      id: 'hola', title: '01 · Hola mundo (INT 21h)', opts: { pm: false, idt: false, paging: false },
      code: `; ============================================================
; Primer programa: imprime un mensaje con el servicio 09h de INT 21h
; ------------------------------------------------------------
; El programa se carga en el segmento 1000h: CS = DS = ES = 1000h
; Ejecute paso a paso (F8) y observe cómo cambian los registros.
; ============================================================

        mov dx, offset mensaje  ; DS:DX = dirección del texto
        mov ah, 09h             ; función 09h: imprimir texto hasta '$'
        int 21h                 ; llamada al "sistema operativo"

        mov ah, 4Ch             ; función 4Ch: terminar el programa
        int 21h

mensaje db '¡Hola, mundo! Bienvenidos a Arquitectura de Computadoras.', 13, 10, '$'
`,
    },
    {
      id: 'registros', title: '02 · Registros y banderas', opts: { pm: false, idt: false, paging: false },
      code: `; ============================================================
; Registros de propósito general y banderas (FLAGS)
; Observe el panel "Registros": lo que cambia se resalta.
; ============================================================

        mov ax, 1234h      ; AX = 1234h  →  AH = 12h, AL = 34h
        mov bx, ax         ; copia de registro a registro
        mov bl, 0FFh       ; solo cambia la parte baja de BX

        mov cl, 0FFh
        add cl, 1          ; CL = 00h  →  ZF=1 (cero) y CF=1 (acarreo)

        mov al, 7Fh        ; +127
        add al, 1          ; AL = 80h (-128) → OF=1 (desborde con signo), SF=1

        mov dx, 5
        sub dx, 8          ; DX = FFFDh (-3) → SF=1, CF=1 (préstamo)

        mov ax, 300
        mov bl, 7
        div bl             ; AX / BL → AL = cociente (42), AH = resto (6)

        mov ax, 0FFFFh
        inc ax             ; AX = 0 → ZF=1, pero INC no modifica CF

        mov si, 0A5A5h
        not si             ; complemento a 1
        xor di, di         ; forma clásica de poner un registro en 0

        mov eax, 12345678h ; registro extendido de 32 bits (extensión 386)
        hlt
`,
    },
    {
      id: 'direcciones', title: '03 · Direcciones lógicas y físicas', opts: { pm: false, idt: false, paging: false },
      code: `; ============================================================
; MODO REAL:  dirección FÍSICA = SEGMENTO × 16 + DESPLAZAMIENTO
; Mire la pestaña "Traducción" después de cada acceso a memoria.
; ============================================================

        mov al, [letra]           ; DS:letra → física = 1000h*16 + offset letra
        mov byte ptr [letra], 'B' ; escritura en memoria

        ; Otra dirección lógica para la MISMA dirección física:
        ; si el segmento aumenta en 1, la base sube 16 bytes; entonces
        ; restando 16 al desplazamiento se llega al mismo byte.
        mov ax, ds
        inc ax
        mov es, ax                ; ES = 1001h
        mov bx, offset letra
        sub bx, 16                ; ES:BX = 1001h:(letra-16)
        mov cl, es:[bx]           ; ¡lee la misma 'B'!

        ; Modos de direccionamiento
        mov bx, offset tabla
        mov si, 2
        mov al, [bx]              ; indirecto por registro
        mov al, [bx+si]           ; base + índice
        mov al, [bx+si+1]         ; base + índice + desplazamiento
        mov al, tabla[si]         ; estilo MASM: variable[índice]

        ; La memoria de video está en el segmento B800h (física B8000h)
        mov ax, 0B800h
        mov es, ax
        mov byte ptr es:[0], 'H'  ; carácter en fila 0, columna 0
        mov byte ptr es:[1], 1Eh  ; atributo: amarillo sobre azul
        hlt

letra   db 'A'
tabla   db 10h, 20h, 30h, 40h, 50h
`,
    },
    {
      id: 'pila', title: '04 · La pila: PUSH, POP, CALL, RET', opts: { pm: false, idt: false, paging: false },
      code: `; ============================================================
; La pila crece hacia direcciones MENORES. SS:SP apunta al tope.
; Observe la pestaña "Pila": cada entrada dice quién la apiló.
; ============================================================

        mov ax, 1111h
        mov bx, 2222h
        push ax            ; SP = SP - 2 ; [SS:SP] = AX
        push bx
        call sumar         ; apila la dirección de retorno (IP) y salta
        ; al volver, AX = 3333h
        add sp, 4          ; descartar los 2 parámetros apilados
        mov [resultado], ax
        hlt

; ---- procedimiento: suma los dos parámetros de la pila ----
sumar:  push bp            ; guardar BP del llamador
        mov bp, sp         ; BP = marco de pila
        ; [BP] = BP viejo, [BP+2] = IP de retorno,
        ; [BP+4] = BX apilado, [BP+6] = AX apilado
        mov ax, [bp+4]     ; con BP el segmento por defecto es SS
        add ax, [bp+6]
        pop bp
        ret                ; desapila IP y vuelve

resultado dw 0
`,
    },
    {
      id: 'arreglo', title: '05 · Bucles: suma de un arreglo', opts: { pm: false, idt: false, paging: false },
      code: `; ============================================================
; LOOP decrementa CX y salta mientras CX ≠ 0
; ============================================================

        mov si, offset numeros ; SI apunta al primer elemento
        mov cx, 6              ; cantidad de elementos
        xor ax, ax             ; acumulador = 0
sumar:  add ax, [si]           ; sumar el elemento actual
        add si, 2              ; cada elemento ocupa 2 bytes (DW)
        loop sumar
        mov [total], ax        ; total = 210 = 00D2h

        ; buscar el máximo
        mov si, offset numeros
        mov cx, 6
        mov bx, [si]
buscar: cmp [si], bx
        jle seguir             ; salto condicional (con signo)
        mov bx, [si]
seguir: add si, 2
        loop buscar
        mov [maximo], bx
        hlt

numeros dw 10, 60, 20, 50, 30, 40
total   dw 0
maximo  dw 0
`,
    },
    {
      id: 'video', title: '06 · Cadenas y memoria de video', opts: { pm: false, idt: false, paging: false },
      code: `; ============================================================
; Escritura DIRECTA en la memoria de video (B800h:0000h)
; Cada celda = 2 bytes: carácter + atributo (color)
;   atributo = fondo (4 bits) | frente (4 bits)
; ============================================================

        mov ax, 0B800h
        mov es, ax
        mov di, 2*160          ; fila 2 (cada fila = 80 celdas × 2 bytes)
        mov si, offset texto
        mov ah, 1Fh            ; blanco sobre azul
        cld                    ; DF=0: SI y DI se incrementan
copiar: lodsb                  ; AL = [DS:SI] ; SI = SI + 1
        or al, al              ; ¿fin del texto (0)?
        jz fin
        stosw                  ; [ES:DI] = AX ; DI = DI + 2
        jmp copiar

fin:    mov di, 4*160          ; fila 4: una línea de colores con REP STOSW
        mov ax, 2EB1h          ; carácter B1h (▒), amarillo sobre verde
        mov cx, 80
        rep stosw              ; repite CX veces (un paso por repetición)

        mov di, 6*160
        mov si, offset texto   ; copiar memoria a memoria con MOVSB
        mov cx, 20
        rep movsb              ; ¡copia caracteres Y atributos mezclados!
        hlt

texto db 'Memoria de video B800:0000 - cada celda = caracter + atributo', 0
`,
    },
    {
      id: 'teclado', title: '07 · Entrada por teclado', opts: { pm: false, idt: false, paging: false },
      code: `; ============================================================
; Lee teclas y las muestra en MAYÚSCULAS hasta presionar Enter.
; Haga clic en la PANTALLA para escribir.
; ============================================================

        mov ah, 09h
        mov dx, offset pedir
        int 21h
leer:   mov ah, 08h            ; leer una tecla sin eco → AL
        int 21h                ; (si no hay tecla, el CPU espera)
        cmp al, 13             ; ¿Enter?
        je fin
        cmp al, 'a'
        jb mostrar
        cmp al, 'z'
        ja mostrar
        sub al, 32             ; 'a'..'z' → 'A'..'Z'
mostrar:
        mov dl, al
        mov ah, 02h            ; imprimir el carácter DL
        int 21h
        jmp leer
fin:    mov ah, 4Ch
        int 21h

pedir db 'Escriba algo (Enter termina): $'
`,
    },
    {
      id: 'ivt', title: '08 · Interrupciones en modo real (IVT)', opts: { pm: false, idt: false, paging: false },
      code: `; ============================================================
; La IVT (tabla de vectores de interrupción) está en 0000:0000.
; Cada vector ocupa 4 bytes: OFFSET (2) y SEGMENTO (2).
;     vector n  →  dirección física n × 4
; Vea la pestaña "IDT / IVT".
; ============================================================

        xor ax, ax
        mov es, ax                          ; ES = 0000h (la IVT)
        cli                                 ; no interrumpir mientras se cambia
        mov word ptr es:[60h*4], offset mi_int60
        mov word ptr es:[60h*4+2], cs
        mov word ptr es:[0*4], offset mi_div0   ; reemplazar el vector 0 (#DE)
        mov word ptr es:[0*4+2], cs
        sti

        mov ax, 21
        int 60h                ; interrupción por SOFTWARE: apila FLAGS, CS, IP
        ; ahora AX = 42

        mov bl, 0
        div bl                 ; ¡división por cero! → EXCEPCIÓN → vector 0

        mov ah, 09h
        mov dx, offset msg_fin
        int 21h
        hlt

; ---- manejador de la INT 60h: duplica AX ----
mi_int60:
        shl ax, 1
        iret                   ; desapila IP, CS y FLAGS

; ---- manejador de la división por cero ----
mi_div0:
        push ax
        push dx
        mov ah, 09h
        mov dx, offset msg_div
        int 21h
        pop dx
        pop ax
        ; El IP apilado apunta a la instrucción DIV que falló (es una FALLA).
        ; Para no repetirla, se suma su tamaño (2 bytes) al IP apilado.
        push bp
        mov bp, sp
        add word ptr [bp+2], 2
        pop bp
        iret

msg_div db 'Division por cero atendida por mi_div0', 13, 10, '$'
msg_fin db 'El programa continuo despues de la excepcion.', 13, 10, '$'
`,
    },
    {
      id: 'pm1', title: '09 · Modo protegido: selectores y descriptores', opts: { pm: true, idt: false, paging: false },
      code: `; ============================================================
; ▶ Switch "Modo protegido" ACTIVADO.
; El código del sistema (pestaña "Sistema") armó la GDT y saltó a
; modo protegido. Al llegar aquí: CS=SEL_CODIGO, DS=ES=SEL_DATOS,
; SS=SEL_PILA. Use "Ir al programa" para saltear el código del sistema.
;
; Observe el panel "Segmentos": parte VISIBLE (selector) y parte
; OCULTA (caché del descriptor: base, límite, derechos de acceso).
; ============================================================

        mov ax, SEL_VIDEO      ; selector 20h = índice 4, TI=0 (GDT), RPL=0
        mov es, ax             ; el CPU lee el descriptor 4 de la GDT
        mov si, offset mensaje
        xor di, di
        mov ah, 2Fh            ; blanco sobre verde
escribir:
        lodsb
        or al, al
        jz listo
        stosw                  ; ES:DI → base 0B8000h + DI
        jmp escribir

listo:  ; El mismo byte, con otro selector (misma base 010000h, solo lectura):
        mov ax, SEL_SOLOLECT
        mov ds, ax
        mov al, [mensaje]      ; leer está permitido

        ; ...pero ESCRIBIR con este selector viola la protección → #GP.
        ; Sin IDT, el CPU no puede atender la excepción: doble falta
        ; y luego TRIPLE FALTA (vea la pestaña "Eventos").
        ; Active el switch "Interrupciones (IDT)" y vuelva a probar.
        mov [mensaje], al
        hlt

mensaje db 'Hola desde MODO PROTEGIDO', 0
`,
    },
    {
      id: 'pm2', title: '10 · Modo protegido: excepciones con IDT', opts: { pm: true, idt: true, paging: false },
      code: `; ============================================================
; ▶ Switches "Modo protegido" + "Interrupciones (IDT)".
; La IDT tiene manejadores para los vectores 0..31 (excepciones)
; y un servicio de pantalla del sistema en INT 30h:
;   AH=0 texto DS:SI   AH=1 carácter AL   AH=2 DX en hexa
;   AH=3 cursor (DH=fila, DL=columna)     BL = color
; ============================================================

        mov ah, 0
        mov bl, 1Eh            ; amarillo sobre azul
        mov si, offset hola
        int 30h                ; → compuerta 30h de la IDT
        mov ah, 2
        mov dx, cs
        int 30h                ; imprime el selector de CS
        mov ah, 1
        mov al, 10             ; nueva línea
        int 30h

        ; ---- Violación del LÍMITE de un segmento ----
        mov ax, SEL_VIDEO
        mov es, ax
        mov di, 3998           ; última celda válida (límite = 0F9Fh = 3999)
        mov word ptr es:[di], 4E21h   ; OK: '!' amarillo sobre rojo
        add di, 2              ; DI = 4000 > límite
        mov word ptr es:[di], 4E21h   ; → #GP(0): protección general
        hlt

hola db 'Modo protegido con IDT. CS = ', 0
`,
    },
    {
      id: 'pm3', title: '11 · LAR, LSL, VERR, VERW y la GDT como datos', opts: { pm: true, idt: true, paging: false },
      code: `; ============================================================
; Instrucciones del 80286 para inspeccionar descriptores
; ============================================================

        mov bx, SEL_VIDEO
        lsl ax, bx             ; AX = límite del segmento (0F9Fh)
        lar cx, bx             ; CH = derechos de acceso (92h, o 93h si fue accedido)
        verw bx                ; ZF=1: se puede escribir
        mov bx, SEL_SOLOLECT
        verw bx                ; ZF=0: es de solo lectura
        verr bx                ; ZF=1: se puede leer
        mov bx, 48h            ; índice 9: no existe en la GDT
        verr bx                ; ZF=0

        ; ---- Leer y modificar la GDT a través del alias SEL_GDT ----
        mov ax, SEL_GDT
        mov ds, ax
        mov ax, [4*8]          ; descriptor 4 (video), palabra 0: límite
        mov dx, [4*8+2]        ; base 15..0
        mov cl, [4*8+5]        ; byte de derechos de acceso
        ; Marcar el descriptor 8 (SEL_VIRTUAL) como NO PRESENTE: P = 0
        and byte ptr [8*8+5], 7Fh

        mov ax, SEL_VIRTUAL
        mov es, ax             ; → #NP (11): segmento no presente
                               ;   (código de error = selector 0040h)
        hlt
`,
    },
    {
      id: 'pg1', title: '12 · Paginación: memoria virtual', opts: { pm: true, idt: true, paging: true },
      code: `; ============================================================
; ▶ Switches "Modo protegido" + "IDT" + "Paginación".
; LÓGICA (selector:offset) → segmentación → LINEAL
; LINEAL → paginación (directorio | tabla | offset) → FÍSICA
;
; El sistema mapeó (ver pestaña "Paginación"):
;   lineal 000000h..0FFFFFh → física igual (identidad, 1er MB)
;   lineal 400000h → física 030000h
;   lineal 401000h → NO PRESENTE (se asigna en la falla de página)
;   lineal 402000h → física 0B8000h (¡memoria de video!)
;   lineal 403000h → física 030000h (alias de la página 400000h)
; SEL_VIRTUAL tiene base LINEAL 400000h.
; ============================================================

        mov ax, SEL_VIRTUAL
        mov es, ax
        mov word ptr es:[0000h], 1234h   ; lineal 400000h → física 030000h
        mov ax, es:[3000h]               ; lineal 403000h → física 030000h: ¡AX = 1234h!

        mov word ptr es:[2000h], 1F50h   ; lineal 402000h → video: 'P'
        mov word ptr es:[2002h], 1F47h   ; 'G'

        ; Página NO presente → falla de página (#PF, vector 14).
        ; CR2 recibe la dirección lineal; el manejador del sistema asigna
        ; un marco libre, completa la PTE y la instrucción SE REINTENTA.
        mov word ptr es:[1000h], 0ABCDh  ; lineal 401000h → #PF → se mapea
        mov bx, es:[1000h]               ; ahora ya está presente

        mov word ptr es:[5000h], 0BEEFh  ; lineal 405000h → otro marco nuevo
        hlt
`,
    },
    {
      id: 'i386', title: '13 · Instrucciones del 386 (en modo real)', opts: { pm: false, idt: false, paging: false },
      code: `; ============================================================
; El 386 arranca en modo real, pero ya puede usar registros de 32 bits,
; direcciones de 32 bits y sus instrucciones nuevas. El ensamblador
; agrega los prefijos 66h (operando de 32 bits) y 67h (dirección de
; 32 bits): mírelos en la columna de bytes de la pestaña "Listado".
; ============================================================

        mov eax, 12345678h         ; registro de 32 bits (prefijo 66h)
        mov ebx, 10
        mul ebx                    ; EDX:EAX = EAX × EBX (resultado de 64 bits)

        ; Dirección escalada (byte SIB): elemento i = base + i × 4
        mov esi, 2
        mov ecx, [numeros + esi*4] ; 3er elemento (30) → prefijos 66h y 67h

        ; Extender un byte a 32 bits: con ceros o con el signo
        movzx edx, byte ptr [bytes+1]   ; F0h → 000000F0h
        movsx edi, byte ptr [bytes+1]   ; F0h → FFFFFFF0h (-16)

        ; Buscar y probar bits
        bsf ax, [mascara]          ; posición del primer 1 desde abajo (3)
        bsr bx, [mascara]          ; posición del primer 1 desde arriba (6)
        bt word ptr [mascara], 5   ; CF = bit 5
        bts word ptr [mascara], 0  ; pone en 1 el bit 0

        ; Guardar el resultado de una comparación sin saltar
        cmp ecx, 30
        sete al                    ; AL = 1 si ECX = 30
        setg ah                    ; AH = 1 si ECX > 30 (con signo)

        ; Los nuevos registros de segmento FS y GS
        mov bp, cs
        mov fs, bp
        mov ebp, fs:[numeros+12]   ; 4º elemento, usando FS

        ; Desplazamiento de doble precisión
        shld edx, eax, 8           ; EDX recibe los 8 bits altos de EAX
        hlt

numeros dd 10, 20, 30, 40
bytes   db 7Fh, 0F0h
mascara dw 0000000001101000b
`,
    },
    {
      id: 'pm32', title: '14 · Modo protegido de 32 bits', opts: { pm: true, b32: true, idt: true, paging: false },
      code: `; ============================================================
; ▶ Switches "Modo protegido" + "32 bits" + "IDT".
; El sistema saltó a SEL_CODIGO32, un segmento de código con D=1:
; el CPU decodifica este programa como CÓDIGO DE 32 BITS. En la
; pestaña "Listado" verá que EAX y [ESI+ECX*4] ya no llevan prefijos.
; ============================================================

        mov esi, offset tabla
        xor eax, eax
        mov ecx, 5
sumar:  add eax, [esi + ecx*4 - 4]   ; recorre la tabla de atrás hacia adelante
        loop sumar                   ; en 32 bits LOOP usa ECX
        mov [total], eax

        ; FS tiene SEL_PLANO: base 0 y límite 4 GB ("modelo plano").
        ; El desplazamiento ES la dirección lineal: la memoria de video
        ; está en el desplazamiento 000B8000h, ¡mucho más que 64 KB!
        mov edi, 0B8000h + 2*160     ; fila 2 de la pantalla
        mov esi, offset texto
        mov ah, 1Eh
copiar: lodsb                        ; en 32 bits usa ESI
        or al, al
        jz listo
        mov fs:[edi], ax
        add edi, 2
        jmp copiar

listo:  mov ah, 0                    ; INT 30h: compuerta de 32 bits de la IDT
        mov bl, 2Fh
        mov esi, offset hola
        int 30h
        mov ah, 2                    ; AH=2: imprime EDX en hexadecimal
        mov edx, [total]
        int 30h
        hlt

tabla   dd 100000, 200000, 300000, 400000, 500000
total   dd 0
texto   db 'Escrito con FS = SEL_PLANO y EDI = 000B8140h', 0
hola    db 'Suma de 32 bits = ', 0
`,
    },
  ];

  EMU.DEFAULT_CODE = EMU.EXAMPLES[0].code;
})(window.EMU);
