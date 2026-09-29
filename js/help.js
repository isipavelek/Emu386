/* =====================================================================
 *  EMU386 - Texto de ayuda
 * ===================================================================== */
'use strict';
(function (EMU) {
  EMU.HELP_HTML = `
<h3>¿Qué es EMU386?</h3>
<p>Un emulador didáctico de un procesador <b>80386</b> (compatible con el 8086 y el 80286) para ver cómo trabaja el CPU:
registros, banderas, pila, segmentación en <b>modo real</b> y <b>modo protegido de 16 y de 32 bits</b>, GDT, IDT,
excepciones y <b>paginación</b>. El ensamblador genera <b>código máquina x86 real</b> que el CPU decodifica desde la memoria.</p>
<p class="note box">Lo que el 386 agregó al 286: registros de 32 bits (EAX…, EIP, EFLAGS), direcciones de 32 bits con escala
(<code>[EBX+ESI*4]</code>), FS y GS, descriptores con base de 32 bits, límite de hasta 4 GB (bit G) y segmentos de código de
32 bits (bit D), CR0 completo, CR2, CR3, paginación e instrucciones nuevas (MOVZX, MOVSX, SETcc, BT, BSF, SHLD…).
<code>INVLPG</code> es del 486.</p>

<h3>Para aprender</h3>
<ul>
  <li><b>🎓 Ejercicios</b>: consignas con código inicial. <b>✔ Verificar</b> ejecuta su programa con varios casos de prueba
      y dice qué está bien y qué no; <b>💡 Pista</b> da ayudas de a una. El progreso queda guardado en el navegador.</li>
  <li><b>🧭 Tour guiado</b>: recorre el paso a modo protegido o la paginación, deteniéndose en cada instrucción clave
      con una explicación y resaltando los paneles que conviene mirar. Presione F8 para ejecutar la instrucción marcada.</li>
  <li><b>Qué hizo el último paso</b>: explicación en palabras de la instrucción ejecutada (valores, banderas y por qué
      saltó o no un salto condicional).</li>
  <li><b>Glosario</b>: pase el mouse por las palabras <span class="gterm">subrayadas con puntos</span>.</li>
  <li><b>Traducción → Diagrama animado</b>: la dirección lógica recorre la GDT y las tablas de páginas hasta la física.</li>
  <li><b>Pila → Dibujo</b>: la pila como bloques, con colores por marco de llamada.</li>
  <li><b>Historial</b>: clic en el nombre de un registro para ver cómo cambió en cada instrucción.</li>
  <li><b>Paginación → Simular la TLB</b>: muestra qué traducciones guarda el CPU, aciertos y fallos.</li>
</ul>

<h3>Uso rápido</h3>
<ul>
  <li><b>Ensamblar</b> (Ctrl+B) traduce y carga el programa. Ejecutar/Paso ensamblan solos si hubo cambios.</li>
  <li><b>Paso (F8)</b>: una instrucción. <b>Paso por encima (F10)</b>: ejecuta completos CALL, INT, LOOP y REP.
      <b>Atrás (F7)</b>: deshace la última instrucción (registros y memoria).</li>
  <li><b>Ejecutar (F5)</b> hasta un punto de ruptura (clic en el número de línea), HLT o fin del programa.</li>
  <li>Clic en un <b>registro</b> o en un <b>byte de memoria</b> para modificarlo.</li>
  <li>Para escribir con el teclado, haga clic en la <b>Pantalla</b>.</li>
</ul>

<h3>Switches del proyecto</h3>
<table>
<tr><th>Switch</th><th>Qué agrega (ver pestaña "Sistema")</th></tr>
<tr><td>Modo protegido</td><td>GDT con 13 descriptores (del 286 y del 386), <code>LGDT</code>, <code>LMSW</code> (PE=1), salto lejano y carga de
DS, ES, FS, GS y SS. El programa del alumno comienza ya en modo protegido de <b>16 bits</b>.</td></tr>
<tr><td>32 bits</td><td>Igual, pero activa PE con <code>MOV CR0</code> y salta a <code>SEL_CODIGO32</code> (D=1): el programa del alumno se
ensambla con <code>BITS 32</code> y se ejecuta como <b>código de 32 bits</b>, con pila de 32 bits (ESP) y compuertas de 32 bits en la IDT.</td></tr>
<tr><td>Interrupciones (IDT)</td><td>IDT con compuertas para los vectores 0..31 (manejadores que muestran la excepción en la última
línea) y el servicio <code>INT 30h</code> para imprimir en pantalla.</td></tr>
<tr><td>Paginación</td><td>Directorio en 20000h, tabla 0 (identidad del primer MB) y tabla 1 (zona virtual 400000h),
<code>CR3</code> y <code>PG=1</code>. Con IDT: manejador de <b>#PF</b> que asigna marcos por demanda.</td></tr>
</table>

<h3>Selectores disponibles en modo protegido</h3>
<table>
${EMU.SELECTORS.map((s, i) => `<tr><td><code>${s.name}</code></td><td><code>${EMU.hex(s.sel, 2)}h</code></td><td>índice ${i}</td><td>${s.desc}</td></tr>`).join('')}
</table>

<h3>Mapa de memoria física</h3>
<table>
<tr><td><code>00000h-003FFh</code></td><td>IVT: tabla de vectores de interrupción (modo real)</td></tr>
<tr><td><code>00400h-004FFh</code></td><td>Área de datos de la BIOS (cursor en 450h/451h)</td></tr>
<tr><td><code>10000h-1FFFFh</code></td><td>Programa (segmento 1000h, o selectores SEL_CODIGO / SEL_DATOS)</td></tr>
<tr><td><code>20000h-22FFFh</code></td><td>Directorio y tablas de páginas (si se activa la paginación)</td></tr>
<tr><td><code>30000h, 40000h…</code></td><td>Marcos de la zona virtual</td></tr>
<tr><td><code>90000h-9FFFFh</code></td><td>Pila (SS=9000h, SP=FFFEh al comenzar)</td></tr>
<tr><td><code>B8000h-B8F9Fh</code></td><td>Memoria de video en modo texto 80×25 (carácter + atributo)</td></tr>
<tr><td><code>F0000h-FFFFFh</code></td><td>ROM BIOS simulada (rutinas de INT)</td></tr>
</table>

<h3>Sintaxis del ensamblador</h3>
<div class="cols2">
<ul>
  <li>Etiquetas: <code>bucle:</code> — Variables: <code>msg db 'Hola$'</code>, <code>n dw 5</code>, <code>v dd 0</code>,
      <code>buf db 10 dup(0)</code></li>
  <li>Constantes: <code>N equ 10</code> o <code>N = 10</code></li>
  <li>Números: <code>25</code>, <code>0FFh</code>, <code>0x1F</code>, <code>1010b</code>, <code>'A'</code></li>
  <li>Estilo MASM: una variable sin corchetes es un <b>acceso a memoria</b>: <code>mov ax, n</code> lee n.
      Para la dirección use <code>offset</code>: <code>mov si, offset msg</code> o <code>lea si, msg</code>.</li>
  <li>Memoria de 16 bits: <code>[bx]</code>, <code>[bx+si+4]</code>, <code>tabla[si]</code>, <code>es:[di]</code>, <code>[bp-2]</code></li>
  <li>Memoria de 32 bits (386): cualquier registro de 32 bits como base y como índice con escala 1, 2, 4 u 8:
      <code>[eax]</code>, <code>[ebx+esi*4+8]</code>, <code>[tabla+ecx*2]</code>, <code>fs:[edi]</code></li>
  <li><code>bits 16</code> / <code>bits 32</code> (o <code>use16</code>/<code>use32</code>): tamaño por defecto del código que sigue.
      Si una instrucción usa otro tamaño, el ensamblador agrega el prefijo 66h (operando) o 67h (dirección).</li>
  <li>Tamaño: <code>byte ptr</code>, <code>word ptr</code>, <code>dword ptr</code> (o <code>byte</code>, <code>word</code>, <code>dword</code>)</li>
  <li>Salto lejano: <code>jmp 08h:etiqueta</code>, <code>jmp dword 48h:etiqueta</code> (desplazamiento de 32 bits), <code>call far [ptr]</code></li>
  <li>Directivas: <code>org</code>, <code>align</code>, <code>times</code>, <code>end</code>; se ignoran <code>.model</code>,
      <code>.code</code>, <code>.data</code>, <code>assume</code>…</li>
  <li><code>$</code> = dirección actual: <code>largo equ $ - msg</code></li>
</ul>
</div>

<h3>Instrucciones soportadas</h3>
<p><b>8086:</b> MOV XCHG LEA LDS LES PUSH POP PUSHF POPF LAHF SAHF CBW CWD XLAT IN OUT ·
ADD ADC SUB SBB CMP INC DEC NEG MUL IMUL DIV IDIV DAA DAS AAA AAS AAM AAD ·
AND OR XOR NOT TEST SHL SAL SHR SAR ROL ROR RCL RCR ·
JMP CALL RET RETF Jcc (JE JNE JZ JC JA JB JG JL JGE JLE JS JO JP…) LOOP LOOPE LOOPNE JCXZ INT INTO IRET ·
MOVSB/W CMPSB/W STOSB/W LODSB/W SCASB/W con REP/REPE/REPNE · CLC STC CMC CLD STD CLI STI HLT NOP</p>
<p><b>80186/286:</b> PUSHA POPA ENTER LEAVE, PUSH inmediato, IMUL de 3 operandos, desplazamientos con inmediato ·
LGDT SGDT LIDT SIDT LMSW SMSW LLDT SLDT LTR STR LAR LSL VERR VERW ARPL CLTS</p>
<p><b>80386:</b> todas las anteriores con operandos de 32 bits (EAX…EDI) y direcciones de 32 bits ·
MOVZX MOVSX · SETcc (SETE SETNE SETG SETL SETA SETB…) · BT BTS BTR BTC BSF BSR · SHLD SHRD · LSS LFS LGS ·
PUSH/POP FS y GS · PUSHAD POPAD PUSHFD POPFD IRETD · CWDE CDQ · MOVSD STOSD LODSD CMPSD SCASD · JECXZ ·
saltos condicionales cercanos · IMUL de 2 operandos · MOV CR0/CR2/CR3 · <b>486:</b> INVLPG</p>

<h3>Servicios de la BIOS (modo real)</h3>
<table>
<tr><th>INT 21h</th><td>AH=01h leer tecla con eco → AL · 02h imprimir DL · 06h E/S directa · 07h/08h leer tecla sin eco ·
09h imprimir DS:DX hasta '$' · 0Ah leer línea en DS:DX · 25h instalar vector AL = DS:DX · 35h leer vector AL → ES:BX ·
2Ah fecha · 2Ch hora · 4Ch terminar</td></tr>
<tr><th>INT 10h</th><td>AH=00h borrar pantalla · 02h posicionar cursor (DH fila, DL col) · 03h leer cursor · 06h/07h desplazar ventana ·
09h escribir AL con color BL, CX veces · 0Eh teletipo AL · 13h escribir cadena ES:BP</td></tr>
<tr><th>INT 16h</th><td>AH=00h esperar tecla → AL (ASCII), AH · 01h ¿hay tecla? (ZF=1 si no hay)</td></tr>
<tr><th>INT 3</th><td>punto de ruptura: detiene la ejecución</td></tr>
<tr><th>OUT 0E9h, AL</th><td>escribe AL en la pantalla (puerto de depuración)</td></tr>
</table>
<p>En <b>modo protegido</b> la BIOS no está disponible (la IVT ya no se usa). Con el switch IDT existe
<code>INT 30h</code>: AH=0 texto DS:SI (DS:ESI en 32 bits, terminado en 0) · AH=1 carácter AL · AH=2 DX en hexadecimal (EDX en 32 bits) ·
AH=3 cursor (DH fila, DL columna) · BL = color.</p>

<h3>Qué observar</h3>
<ul>
  <li><b>Traducción</b>: dirección lógica → (segmentación) → lineal → (paginación) → física, paso por paso.</li>
  <li><b>Segmentos</b>: la parte visible (selector: índice, TI, RPL) y la parte oculta (base, límite, derechos) que el CPU
      copia de la GDT cuando se carga el registro.</li>
  <li><b>Pila</b>: cada palabra indica quién la apiló (CALL, INT, PUSH, código de error…).</li>
  <li><b>Eventos</b>: interrupciones, excepciones con su explicación, cambios de modo, cargas de descriptores.</li>
  <li>Sin IDT, una excepción en modo protegido termina en <b>doble</b> y <b>triple falta</b> (en una PC real: reinicio).</li>
</ul>
`;
})(window.EMU);
