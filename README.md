# EMU386: emulador didáctico 8086 / 80386

Emulador web para aprender assembly x86 y la arquitectura de la familia 8086 → 80286 → 80386. Está pensado para
primer año de Arquitectura de Computadoras: se escribe assembly, se ejecuta paso a paso y se ve lo que hace el CPU.

- Registros de 32 bits (EAX…EDI con sus partes AX/AH/AL), EIP, EFLAGS y la pila, con los cambios resaltados
  después de cada paso.
- Direcciones **lógica → lineal → física**, explicadas paso a paso para cada acceso a memoria.
- **Modo real**: segmento × 16 + desplazamiento, la IVT y las rutinas de la BIOS (INT 21h, 10h, 16h). Como en un
  386 real, ya se pueden usar EAX, `[EBX+ESI*4]` y las instrucciones nuevas.
- **Modo protegido** (switch): la GDT ya está armada y el salto a modo protegido ya está resuelto. Se ven los
  selectores (índice, TI, RPL) y la parte oculta de cada registro de segmento (base, límite, derechos, bits G y D/B).
- **32 bits** (switch): el sistema salta a un segmento de código con D=1 y el programa del alumno corre como
  código de 32 bits, con pila de 32 bits (ESP) y un segmento "plano" de 4 GB en FS.
- **IDT y excepciones** (switch): manejadores para los vectores 0..31 (#DE, #GP, #NP, #PF…) y un servicio
  `INT 30h` para imprimir en pantalla. Sin IDT, una excepción termina en doble falta y luego en triple falta.
- **Paginación** (switch): directorio y tablas de páginas, CR3 y CR2, y paginación por demanda en la falla
  de página.
- Pantalla de texto 80×25 (memoria de video en B8000h) y teclado.
- **Paso atrás** (F7): deshace instrucciones, incluidos los cambios en memoria.

Para aprender:

- **🎓 Ejercicios con autocorrección** (14, de básicos a paginación y 386). Cada uno se verifica con varios casos
  de prueba, tiene pistas progresivas y el progreso se guarda en el navegador.
- **🧭 Tours guiados**: "Del modo real al modo protegido", "Paginación y memoria virtual" y "Del 286 al 386:
  código de 32 bits". Se detienen en cada instrucción clave, la explican y resaltan los paneles que conviene mirar.
- **Explicación en palabras** de cada instrucción ejecutada, en el panel "Qué hizo el último paso".
- **Glosario**: al pasar el mouse por los términos subrayados.
- **Diagrama animado** de la traducción lógica → lineal → física, **pila dibujada** por marcos de llamada,
  **historial** de valores de cada registro y **TLB simulada** (opcional).

El ensamblador genera **código máquina x86 real** de 16 y 32 bits (con los prefijos 66h/67h cuando hacen falta).
El CPU lo lee de la memoria y lo decodifica según el bit D del segmento de código, así que el listado, los bytes
en memoria y la ejecución coinciden.

## Cómo usarlo

No necesita instalación, compilación ni servidor. Se abre `index.html` con un navegador moderno (Chrome, Edge o
Firefox) y funciona también sin conexión a Internet.

### Publicarlo para los alumnos

Es un sitio 100 % estático, así que sirve cualquier hosting de archivos:

- **GitHub Pages**: se sube la carpeta a un repositorio y se activa *Settings → Pages → Deploy from branch*.
  La dirección queda `https://usuario.github.io/repositorio/`.
- **Servidor de la facultad**: se copia la carpeta completa (`index.html`, `css/` y `js/`) a cualquier directorio web.
- **Aula virtual**: se puede distribuir la carpeta en un .zip para que cada alumno abra `index.html` en su computadora.

El código de cada alumno se guarda automáticamente en su propio navegador (localStorage). Con **Guardar** y
**Abrir** se descargan y cargan archivos `.asm`.

## Recorrido sugerido con los ejemplos

| # | Ejemplo | Tema |
|---|---------|------|
| 01–02 | Hola mundo, Registros y banderas | MOV, aritmética, CF/ZF/SF/OF, INT 21h |
| 03 | Direcciones lógicas y físicas | segmento × 16 + desplazamiento, modos de direccionamiento |
| 04 | La pila | PUSH/POP, CALL/RET, marco de pila con BP |
| 05–06 | Bucles, cadenas, video | LOOP, saltos condicionales, LODSB/STOSW/REP, B800h |
| 07 | Teclado | entrada con INT 21h |
| 08 | Interrupciones en modo real | la IVT, un manejador propio, #DE como falla |
| 09 | Modo protegido | selectores, descriptores, #GP → triple falta sin IDT |
| 10–11 | Excepciones con IDT | violación de límite, LAR/LSL/VERR/VERW, #NP |
| 12 | Paginación | lineal → física, alias de páginas, #PF y CR2, marcos por demanda |
| 13 | Instrucciones del 386 | EAX, `[x+ESI*4]`, MOVZX/MOVSX, BSF, BT, SETcc, FS, SHLD |
| 14 | Modo protegido de 32 bits | bit D, código de 32 bits, modelo plano con FS, compuertas de 32 bits |

Cada ejemplo activa los switches que necesita. El botón **Ir al programa** ejecuta el código del sistema (GDT,
tablas y salto a modo protegido) y se detiene en la primera instrucción del alumno. Ese código del sistema se
puede ver y ejecutar paso a paso en la pestaña **Sistema**.

## Estructura

```
index.html          interfaz
css/style.css       estilos (tema oscuro y claro)
js/util.js          constantes, mapa de memoria, CP437, descriptores
js/assembler.js     ensamblador de dos pasadas (sintaxis Intel, MASM/NASM, BITS 16/32)
js/decoder.js       decodificador y desensamblador x86 de 16 y 32 bits
js/cpu.js           CPU 80386: segmentación real/protegida, paginación, interrupciones, excepciones
js/bios.js          BIOS/DOS simulados (ROM en F000h, IVT, INT 10h/16h/21h)
js/system.js        generador del "código del sistema" según los switches
js/examples.js      programas de ejemplo (para agregar ejemplos, sumarlos a esta lista)
js/exercises.js     ejercicios con autocorrección (consigna, código inicial, casos de prueba, pistas)
js/tour.js          tours guiados (paradas por etiqueta y explicación de cada una)
js/explain.js       explicación en palabras de cada paso y glosario
js/help.js          texto de la ayuda
js/editor.js        editor con resaltado y puntos de ruptura
js/ui.js            controlador de la interfaz
tests/test.html        ensambla y ejecuta todos los ejemplos; compara codificaciones con NASM
tests/asm_errors.html  pruebas de mensajes de error y compatibilidad MASM/.COM
tests/exercises.html   verifica cada ejercicio con una solución de referencia y con su código inicial
```

Para correr las pruebas, abra los archivos de `tests/` en el navegador.

### Agregar un ejercicio

En `js/exercises.js` cada ejercicio tiene `statement` (consigna en HTML), `starter` (código inicial con las
variables que se van a revisar), `tests` (casos), `setup(t, caso)` para cargar datos antes de ejecutar,
`check(t, caso)` que devuelve una lista de `[ok, mensaje]`, y `hints`. Dentro de `setup` y `check`, `t` ofrece
`t.w('variable')`, `t.d(...)`, `t.setW(...)`, `t.setD(...)`, `t.reg('ax')`, `t.screen(fila, col, n)`,
`t.used('xchg')`, `t.str(...)`, `t.scaled`, etc. Conviene agregar una solución de referencia en
`tests/exercises.html` y comprobar que aprueba.

### Agregar un ejemplo

En `js/examples.js`, agregue un objeto a la lista (`b32: true` activa el switch de 32 bits):

```js
{ id: 'mio', title: '15 · Mi ejemplo', opts: { pm: true, b32: true, idt: true, paging: false }, code: `
        mov eax, [ebx+esi*4]
        ...
        hlt
` },
```

## Límites de la simulación (simplificaciones deliberadas)

- Todo el código corre en el anillo 0. No hay cambio de anillo con cambio de pila, compuertas de llamada ni
  conmutación de tareas por TSS: si se intentan, se informa con un #GP explicado.
- No hay modo virtual 8086 (bit VM) ni registros de depuración (DR0–DR7).
- No hay interrupciones de hardware (reloj, IRQ). HLT detiene la ejecución.
- La TLB es opcional (casilla en la pestaña Paginación). Sin ella, cada acceso recorre las tablas de páginas.
- A20 siempre habilitada. La memoria física simulada es de 16 MB (las direcciones físicas se recortan a 24 bits).
- No hay coprocesador matemático.
