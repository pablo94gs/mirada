# Mirada — escribir con la vista

### → **https://pablo94gs.github.io/mirada/**

**Gratis, sin cuenta, sin instalar nada y sin publicidad.** Todo el procesamiento ocurre
en el propio dispositivo: el video de la cámara **nunca** sale de ahí.

App web que permite a una persona que no puede hablar **escribir mirando la pantalla**
y que el dispositivo **lo diga en voz alta**. Usa la cámara frontal; nada se envía a
ningún servidor: todo el procesamiento ocurre en el propio celular o tablet.

## Usarla

Se abre en el navegador, **sin instalar nada**. Funciona en celular, tablet, iPad y
computadora con cámara.

Opcional: menú del navegador → *Añadir a pantalla de inicio* para tenerla como un
ícono propio. Así además funciona sin internet.

### Probarla en local (desarrollo)

    ./servir.sh

Levanta un servidor y un enlace temporal por HTTPS (la cámara no funciona sin HTTPS).

## Cómo se usa

1. Apoyar el dispositivo firme, a 40–60 cm de la cara, con luz de frente (no a contraluz).
2. Calibrar: mirar los puntos que aparecen (18 o 24), uno por uno, sin mover el cuerpo.
3. Mirar una casilla y **sostener la mirada**: se llena de color y se selecciona.
4. Todo se puede tocar con el dedo, para quien acompaña.

## Ajustes que importan

| Ajuste | Para qué |
|---|---|
| **Cabeza / Cabeza y ojos / Solo ojos** | Si la persona puede girar algo la cabeza, *Cabeza* es mucho más preciso. *Solo ojos* es para quien no puede moverla. |
| **Disposición** | *Dos pasos* (grupo de 5 letras → letra) para celular. *Teclado completo* (27 letras a la vista) para tablet o iPad. |
| **Tiempo para seleccionar** | Cuánto hay que sostener la mirada. Subirlo si hay selecciones sin querer. |
| **Sensibilidad horizontal / vertical** | Por separado: la vertical casi siempre necesita más, porque la mirada recorre menos de arriba abajo. |
| **Imán a la casilla** | Al entrar en una casilla el punto se pega a su centro y deja de temblar. Lo que más ayuda si el puntero se mueve mucho. |
| **Alcance de la mirada** | Si no alcanza a mirar las esquinas: *Medio* o *Reducido* calibran en un área más chica y la estiran a toda la pantalla. |
| **Confirmar parpadeando** | Elegir requiere mirar *y* parpadear. Sólo si la persona controla el parpadeo. |
| **Afinar solo mientras se usa** | Cada selección acertada corrige el ajuste. Compensa que la persona se mueva con el rato. |
| **Borrar el mensaje al decirlo** | Al terminar de sonar, la pantalla se limpia sola. |
| **Detalle de la calibración** | 18 o 24 puntos. Los 18 van en 6 columnas, las mismas del teclado completo. |
| **Calibrar al abrir la app** | *Siempre* (recomendado) o solo la primera vez. También hay un botón **Calibrar** arriba a la derecha. |

La fila de arriba tiene siempre: dos **palabras sugeridas**, **FRASES** y **BORRAR TODO**.
Este último **pide confirmación**: la primera mirada lo pone en rojo con *¿SEGURO?* y hay que
volver a mirarlo dentro de 4,5 s; cualquier otra cosa lo cancela. Así una mirada perdida no
borra la frase entera.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Pantallas, estilos y panel de ajustes |
| `app.js` | Seguimiento de mirada, calibración, selección por permanencia, voz |
| `sw.js`, `manifest.webmanifest` | Instalación y funcionamiento sin internet |
| `servir.sh` | Servidor local + enlace público para probar |

## Cómo apunta (versión 2)

El detector es **MediaPipe Face Landmarker** (Google): 478 puntos de la cara, con iris.
De ahí salen los rasgos que se miden en cada fotograma:

- **cabeza** — giro, cabeceo e inclinación, de la matriz de orientación;
- **posición de la cara** en la imagen, normalizada por su tamaño (capta los
  desplazamientos leves, no sólo el giro);
- **ojos** — posición del centro del iris respecto a las esquinas y los párpados
  de cada ojo, que es mucho más fino que los *blendshapes*.

Esos rasgos entran a una **regresión de cresta** ajustada con los puntos de
calibración: el propio ajuste decide cuánto pesa la cabeza y cuánto los ojos, en vez
de usar pesos inventados. El punto se suaviza con un **filtro "un euro"**, que quita
el temblor cuando la mirada está quieta sin volverse lento al moverse.

La voz usa la síntesis del propio sistema (`speechSynthesis`).


## Mi voz

*Ajustes → Grabar mi voz* abre una lista de frases y palabras. Cada una se graba con el
micrófono (máximo 7 s) y queda guardada **en el dispositivo**, en IndexedDB.

Al hablar, la app decide en este orden:

1. ¿Hay una grabación de **la frase completa**? La reproduce.
2. ¿Están grabadas **todas las palabras** de la frase? Las encadena.
3. Si no, usa la voz sintética del sistema.

Se pueden agregar frases propias desde el mismo panel. Para volver a la voz del sistema,
*Ajustes → Mi voz → Voz del sistema*.

Esto es **banco de mensajes**, la técnica habitual en comunicación aumentativa: no es
clonación, es la voz real. Para decir *cualquier* texto con esa voz haría falta un modelo
de clonación (ver abajo).

## Predicción de palabras

Parte de una lista de español por frecuencia y **aprende**: cada palabra que se escribe o se
acepta como sugerencia suma uso, y las más usadas por esta persona pasan adelante. El
historial vive en `localStorage` (`mirada.uso`).


## Frases rápidas

**FRASES** abre tres categorías con 12 frases cada una:

- **Cotidianas** — Hola · Buen día · Buenas noches · ¿Cómo estás? · Muchas gracias · Por favor · Estoy cansado · Quiero dormir · Te quiero · Hasta luego · Espera un momento · Estoy bien
- **Comida** — Tengo hambre · Tengo sed · Está caliente · Está frío · Falta sal · Más azúcar · Está muy dulce · Quiero más · Ya no quiero · Está rico · Quiero agua · Más despacio
- **Salud** — Me duele · No estoy cómodo · Necesito ayuda · Llama al doctor · Me falta el aire · Tengo frío · Tengo calor · Quiero cambiar de posición · Quiero ir al baño · Necesito mi medicina · Me pica · Estoy mareado

Los dos huecos de la fila de arriba llevan **Sí** y **No** mientras no haya palabra
que sugerir: son las dos respuestas que más falta hacen y quedan a una sola mirada.

## Modo «solo ojos»

Es el más difícil: sin mover la cabeza, todo el recorrido de la mirada cabe en
unos pocos milímetros de iris. Lo que hace la app para exprimirlo:

- mide **cada ojo por separado** en vez de promediarlos — dan información
  parcialmente distinta;
- usa la **apertura del párpado**, porque al mirar arriba o abajo el párpado tapa
  el iris: es lo que más ayuda en el eje vertical, que es el flojo;
- incluye la cabeza como **compensación, no como puntero**: aunque el movimiento
  sea mínimo, cambia cómo se ve el iris, y el ajuste lo descuenta.

Con los ojos conviene calibrar con **24 puntos**, acercar la tablet (35–45 cm),
ponerla a la altura de los ojos y usar luz difusa de frente. Si la persona usa
gafas, el reflejo sobre el cristal es el enemigo número uno.
