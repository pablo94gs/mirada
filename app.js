// Mirada — escribir con la vista. Todo el procesamiento ocurre en el dispositivo.
import { FilesetResolver, FaceLandmarker }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import * as MiVoz from "./mivoz.js";

const WASM  = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/* ============================ configuración ============================ */
const DEF = { modo:"ambos", dwell:1200, ganancia:1.0, suavizado:5, blink:0, eco:0,
              camara:0, voz:"", disposicion:"auto", adaptar:1, puntos:18, miVoz:1, calInicio:"siempre", autoborrar:1,
              gananciaV:1.0, iman:70, areaCal:"amplia" };
const cfg = Object.assign({}, DEF, JSON.parse(localStorage.getItem("mirada.cfg") || "{}"));
const guardarCfg = () => localStorage.setItem("mirada.cfg", JSON.stringify(cfg));

/* ============================ estado ============================ */
const S = {
  listo:false, pausa:true, vista:"frases", grupo:null, categoria:null, subfrases:null,
  texto:"", cara:false, ultimaCara:0,
  rasgos:null, punto:{x:innerWidth/2,y:innerHeight/2},
  celda:null, desde:0, fuera:0, enfriando:0, parpadeoPrev:0, parpadeo:false,
  calibrando:false, rasgoDwell:null, nAdapt:0, confirmar:false, caraDesde:0,
};

/* ============================ contenido ============================ */
const GRUPOS = [
  ["A","B","C","D","E"], ["F","G","H","I","J"], ["K","L","M","N","Ñ"],
  ["O","P","Q","R","S"], ["T","U","V","W","X"], ["Y","Z",",",".","?"],
];
const TECLADO = ("A B C D E F G H I J K L M N Ñ O P Q R S T U V W X Y Z").split(" ");
const FRASES = {
  "Cotidianas": ["Hola", "Buen día", "Buenas noches", "¿Cómo estás?", "Muchas gracias",
                 "Por favor", "Estoy cansado", "Quiero dormir", "Te quiero", "Hasta luego",
                 "Espera un momento", "Estoy bien"],

  // «Es involuntario, estoy bien» es para la labilidad emocional de la ELA: la
  // risa o el llanto que aparecen sin corresponder a lo que la persona siente.
  // Poder aclararlo evita que todos a su alrededor se alarmen sin motivo.
  "Ánimo": ["Estoy contento", "Estoy triste", "Estoy preocupado", "Tengo miedo",
            "Estoy frustrado", "Estoy nervioso", "Estoy tranquilo", "Estoy aburrido",
            "Necesito un abrazo", "Quiero compañía", "Quiero estar solo",
            "Gracias por cuidarme", "Es involuntario, estoy bien"],

  "Mi cuerpo": ["Quiero cambiar de posición", "Súbeme la cabecera", "Bájame la cabecera",
                "Acomódame la cabeza", "Acomódame la almohada", "Muéveme el brazo",
                "Muéveme la pierna", "Tengo un calambre", "Me estoy resbalando",
                "Tápame", "Destápame", "Quiero sentarme"],

  // Lo urgente en ELA. Va en categoría propia para llegar en dos miradas.
  "Respirar": ["Me falta el aire", "Me falta aire acostado", "Ponme la máscara",
               "Quítame la máscara", "La máscara me aprieta", "Necesito aspiración",
               "Tengo mucha saliva", "Ayúdame a toser", "Me atoré", "No puedo tragar",
               "Límpiame la boca", "Siéntame más derecho"],

  "Comida": ["Tengo hambre", "Tengo sed", "Está caliente", "Está frío", "Falta sal",
             "Más azúcar", "Está muy dulce", "Quiero más", "Ya no quiero", "Está rico",
             "Quiero agua", "Más despacio"],

  "Salud": ["Me duele", "Me duele mucho", "Me duele la espalda", "Me duele el cuello",
            "Me duele la cabeza", "Necesito mi medicina", "Llama al doctor",
            "Estoy mareado", "Tengo fiebre", "Límpiame los ojos",
            "Tengo algo en el ojo",
            // Una frase puede abrir un submenú en vez de decirse directamente.
            { txt: "Me pica…", sub: [
                "Me pica el brazo derecho", "Me pica el brazo izquierdo",
                "Me pica la pierna derecha", "Me pica la pierna izquierda",
                "Me pica la nariz", "Me pica la boca",
                "Me pica el ojo derecho", "Me pica el ojo izquierdo",
                "Me pica la oreja derecha", "Me pica la oreja izquierda",
                "Me pica la cabeza", "Me pica la espalda"] }],

  "Entorno": ["Prende la luz", "Apaga la luz", "Prende la tele", "Apaga la tele",
              "Sube el volumen", "Baja el volumen", "Pon música", "Abre la ventana",
              "Cierra la ventana", "Llama a mi familia", "Acércate", "Dame mi teléfono"],

  // Órdenes para el Alexa del cuarto. La app las dice en voz alta y Alexa las
  // obedece: hay que subir el volumen del dispositivo y que el altavoz apunte
  // hacia ella. «Anuncia» suena en todos los Echo de la casa a la vez, así que
  // es la más segura para pedir ayuda.
  "Alexa": ["Alexa, envía un mensaje a cocina que diga necesito ayuda",
            "Alexa, anuncia necesito ayuda",
            "Alexa, reproduce un audiolibro", "Alexa, pausa el audiolibro",
            "Alexa, reanuda el audiolibro", "Alexa, sube el volumen",
            "Alexa, baja el volumen", "Alexa, silencio",
            "Alexa, prende la luz", "Alexa, apaga la luz",
            "Alexa, pon música relajante", "Alexa, qué hora es"],

  // Sin esto, el interlocutor habla encima o adivina el final de la frase.
  // Las dos últimas son para quien escribe con la mirada: los ojos se cansan.
  "Conversación": ["Espera, estoy escribiendo", "Déjame terminar", "No entendiste",
                   "Repite por favor", "Más despacio", "Ya terminé", "No sé", "Quizá",
                   "Ahora no", "Después", "Me cansan los ojos", "Necesito una pausa"],
};
const PALABRAS = ("que de no la el en y a los se del las un por con una para es al lo como más pero sus le ya " +
 "este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante " +
 "todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él " +
 "tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti " +
 "tu tus ellas nosotras vosotros vosotras os mío mía míos mías tuyo tuya suyo suya nuestro nuestra vuestro " +
 "esos esas agua casa comer beber dormir baño doctor enfermera medicina dolor cabeza estómago pierna brazo " +
 "mano pie frío calor hambre sed cansado bien mal ayuda gracias favor por hola adiós buenos días tardes " +
 "noches mamá papá hijo hija hermano hermana familia amigo amiga quiero necesito puedo siento tengo estoy " +
 "vamos ven llama espera despacio rápido ahora luego hoy mañana ayer sí no tal vez apaga prende luz " +
 "televisión música teléfono silla cama ventana puerta ropa frazada almohada cambiar mover sentar levantar").split(/\s+/);

/* ============================ util ============================ */
const $  = s => document.querySelector(s);
const el = (t,c,x) => { const n=document.createElement(t); if(c) n.className=c;
                        if(x!==undefined) n.textContent=x; return n; };
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const mediana = a => { const v=[...a].sort((x,y)=>x-y); return v[Math.floor(v.length/2)]; };

/* ==================================================================== */
/*  1. RASGOS: qué mide la cámara en cada fotograma                      */
/* ==================================================================== */
/* Puntos de MediaPipe usados para la mirada por iris (mucho más fino
   que los "blendshapes"): esquinas y párpados de cada ojo, y el centro
   del iris, que el modelo entrega en los índices 468 y 473.            */
const OJO_IZQ = { fuera:33,  dentro:133, arriba:159, abajo:145, iris:468 };
const OJO_DER = { fuera:263, dentro:362, arriba:386, abajo:374, iris:473 };

function razonOjo(L, o){
  const P = i => L[i];
  const proy = (p, a, b) => {            // posición de p sobre el segmento a→b, en 0..1
    const vx = b.x-a.x, vy = b.y-a.y, d = vx*vx + vy*vy;
    if(d < 1e-9) return .5;
    return ((p.x-a.x)*vx + (p.y-a.y)*vy) / d;
  };
  const ancho = Math.hypot(P(o.dentro).x - P(o.fuera).x, P(o.dentro).y - P(o.fuera).y) || 1e-6;
  const alto  = Math.hypot(P(o.abajo).x  - P(o.arriba).x, P(o.abajo).y  - P(o.arriba).y);
  return {
    h: proy(P(o.iris), P(o.fuera),  P(o.dentro)),
    v: proy(P(o.iris), P(o.arriba), P(o.abajo)),
    // Cuánto está abierto el ojo. El párpado tapa el iris al mirar arriba o
    // abajo, así que esto ayuda justo en el eje vertical, que es el más flojo.
    ap: alto / ancho,
  };
}

function medir(res){
  const L = res.faceLandmarks && res.faceLandmarks[0];
  if(!L) return null;

  // --- cabeza: giro (yaw), cabeceo (pitch) e inclinación (roll) ---
  let hx = 0, hy = 0, hz = 0;
  const M = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
  if(M){ const m = M.data;
    hx = Math.atan2(m[8], m[10]);
    hy = Math.asin(clamp(-m[9], -1, 1));
    hz = Math.atan2(m[1], m[5]);
  }

  // --- desplazamiento de la cara en la imagen, normalizado por su tamaño ---
  // (capta los movimientos pequeños de acercarse o correrse, no solo el giro)
  const ancho = Math.hypot(L[454].x - L[234].x, L[454].y - L[234].y) || .2;
  const cx = (L[454].x + L[234].x)/2, cy = (L[10].y + L[152].y)/2;
  const nx = (L[1].x - cx) / ancho;          // nariz respecto al centro de la cara
  const ny = (L[1].y - cy) / ancho;

  // --- ojos: iris respecto a las esquinas del ojo ---
  let ix = 0, iy = 0, ixL = 0, iyL = 0, ixR = 0, iyR = 0, apL = 0, apR = 0;
  const hayIris = L.length >= 478;
  if(hayIris){
    const a = razonOjo(L, OJO_IZQ), b = razonOjo(L, OJO_DER);
    ixL = a.h; iyL = a.v; apL = a.ap;
    ixR = b.h; iyR = b.v; apR = b.ap;
    ix = (a.h + b.h)/2; iy = (a.v + b.v)/2;
  } else {                                    // respaldo: blendshapes
    const B = res.faceBlendshapes && res.faceBlendshapes[0];
    if(B){ const g={}; B.categories.forEach(c=>g[c.categoryName]=c.score);
      ix = .5 + (((g.eyeLookOutRight||0)+(g.eyeLookInLeft||0))/2
               - ((g.eyeLookOutLeft ||0)+(g.eyeLookInRight||0))/2);
      iy = .5 + (((g.eyeLookDownLeft||0)+(g.eyeLookDownRight||0))/2
               - ((g.eyeLookUpLeft  ||0)+(g.eyeLookUpRight  ||0))/2);
    }
  }

  // --- parpadeo ---
  const B = res.faceBlendshapes && res.faceBlendshapes[0];
  if(B){ const g={}; B.categories.forEach(c=>g[c.categoryName]=c.score);
    const p = ((g.eyeBlinkLeft||0)+(g.eyeBlinkRight||0))/2;
    S.parpadeo = p > .5 && S.parpadeoPrev <= .5; S.parpadeoPrev = p;
  }
  return { hx, hy, hz, nx, ny, ix, iy, ixL, iyL, ixR, iyR, apL, apR, hayIris };
}

/* El vector de rasgos que entra al ajuste. Según el modo se usan unos u otros;
   el ajuste decide solo cuánto pesa cada uno — ya no hay pesos inventados.
   Con 13 o 16 puntos de calibración hay datos de sobra para un ajuste más
   rico, que además capta la interacción entre girar la cabeza y mover el ojo. */
const rico = () => cfg.puntos >= 13;
const muyRico = () => cfg.puntos >= 24;

function vector(r){
  if(!r) return null;
  const { hx, hy, hz, nx, ny, ix, iy } = r;
  if(cfg.modo === "cabeza")
    return rico() ? [1, hx, hy, nx, ny, hz, hx*hy, hx*hx, hy*hy]
                  : [1, hx, hy, nx, ny, hz];
  if(cfg.modo === "ojos"){
    // Tres cosas que faltaban y son las que más pesan cuando no se mueve la cabeza:
    //  · cada ojo por separado — dan información parcialmente distinta;
    //  · la apertura del párpado — el iris se tapa al mirar arriba/abajo;
    //  · la cabeza como COMPENSACIÓN, no como puntero: aunque el movimiento sea
    //    mínimo, cambia cómo se ve el iris, y el ajuste puede descontarlo.
    const { ixL, iyL, ixR, iyR, apL, apR } = r;
    if(!rico()) return [1, ix, iy, ix*iy];
    return [1, ixL, iyL, ixR, iyR, apL, apR, hx, hy, nx, ny,
            ix*iy, ix*ix, iy*iy];
  }
  return rico() ? [1, hx, hy, ix, iy, nx, ny, hx*ix, hy*iy, ix*ix, iy*iy, hx*hy]
                : [1, hx, hy, ix, iy, nx, ny];
}
const claveModelo = () => "mirada." + cfg.modo + "." + (rico() ? "rico" : "simple");

/* ==================================================================== */
/*  2. AJUSTE: regresión de cresta (ridge) rasgos -> punto de pantalla   */
/* ==================================================================== */
function nuevoAcum(k){
  return { k, A: Array.from({length:k}, () => new Float64Array(k)),
           bx: new Float64Array(k), by: new Float64Array(k), n:0 };
}
function acumular(ac, f, tx, ty, peso){
  peso = peso === undefined ? 1 : peso;
  for(let i=0;i<ac.k;i++){
    const fi = f[i]*peso;
    for(let j=0;j<ac.k;j++) ac.A[i][j] += fi*f[j];
    ac.bx[i] += fi*tx; ac.by[i] += fi*ty;
  }
  ac.n += peso;
}
function resolverAcum(ac){                 // devuelve {wx, wy}
  const k = ac.k;
  let traza = 0; for(let i=0;i<k;i++) traza += ac.A[i][i];
  const lam = Math.max(1e-9, traza/k * 1e-3);          // cresta suave
  const sol = b => {
    const A = Array.from({length:k}, (_,i) => {
      const r = new Float64Array(k+1);
      for(let j=0;j<k;j++) r[j] = ac.A[i][j] + (i===j ? lam : 0);
      r[k] = b[i]; return r;
    });
    for(let c=0;c<k;c++){                               // Gauss con pivoteo
      let p = c; for(let i=c+1;i<k;i++) if(Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
      if(Math.abs(A[p][c]) < 1e-12) continue;
      [A[c], A[p]] = [A[p], A[c]];
      for(let i=0;i<k;i++){
        if(i===c) continue;
        const f = A[i][c]/A[c][c];
        if(!f) continue;
        for(let j=c;j<=k;j++) A[i][j] -= f*A[c][j];
      }
    }
    const w = new Float64Array(k);
    for(let i=0;i<k;i++) w[i] = Math.abs(A[i][i]) < 1e-12 ? 0 : A[i][k]/A[i][i];
    return w;
  };
  return { wx: sol(ac.bx), wy: sol(ac.by) };
}
const aplicar = (w, f) => { let s=0; for(let i=0;i<w.length;i++) s += w[i]*f[i]; return s; };

let modelo = null, acumBase = null;
function cargarModelo(){
  const g = localStorage.getItem("modelo." + claveModelo());
  modelo = g ? JSON.parse(g) : null;
  if(modelo){ modelo.wx = Float64Array.from(modelo.wx); modelo.wy = Float64Array.from(modelo.wy); }
  const a = localStorage.getItem("acum." + claveModelo());
  if(a){
    const o = JSON.parse(a);
    acumBase = nuevoAcum(o.k);
    o.A.forEach((f,i) => acumBase.A[i] = Float64Array.from(f));
    acumBase.bx = Float64Array.from(o.bx); acumBase.by = Float64Array.from(o.by); acumBase.n = o.n;
  } else acumBase = null;
}
function guardarModelo(err){
  modelo.error = err;
  localStorage.setItem("modelo." + claveModelo(),
    JSON.stringify({ wx:[...modelo.wx], wy:[...modelo.wy], error:err }));
  if(acumBase) localStorage.setItem("acum." + claveModelo(),
    JSON.stringify({ k:acumBase.k, A:acumBase.A.map(f=>[...f]), bx:[...acumBase.bx], by:[...acumBase.by], n:acumBase.n }));
}

/* ==================================================================== */
/*  3. SUAVIZADO: filtro "un euro" — quieto no tiembla, rápido responde  */
/* ==================================================================== */
class UnEuro{
  constructor(){ this.x=null; this.dx=0; this.t=0; }
  alfa(dt, corte){ const tau = 1/(2*Math.PI*corte); return 1/(1 + tau/dt); }
  filtrar(v, dt, mincorte, beta){
    if(this.x === null){ this.x = v; return v; }
    const dv = (v - this.x)/dt;
    this.dx += this.alfa(dt, 1.0)*(dv - this.dx);
    const corte = mincorte + beta*Math.abs(this.dx);
    this.x += this.alfa(dt, corte)*(v - this.x);
    return this.x;
  }
}
const filtX = new UnEuro(), filtY = new UnEuro();

/* ============================ voz ============================ */
let voces = [];
function cargarVoces(){
  voces = speechSynthesis.getVoices();
  const sel = $("#selVoz"); if(!sel) return;
  sel.innerHTML = "";
  const es = voces.filter(v => /^es/i.test(v.lang));
  (es.length ? es : voces).forEach(v => {
    const o = el("option", null, `${v.name} (${v.lang})`); o.value = v.name; sel.appendChild(o);
  });
  if(cfg.voz) sel.value = cfg.voz;
}
speechSynthesis.onvoiceschanged = cargarVoces;
function sintetica(t, alTerminar){
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    const v = voces.find(v => v.name === cfg.voz) || voces.find(v => /^es/i.test(v.lang));
    if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "es-ES";
    u.rate = .95;
    u.onend = () => alTerminar && alTerminar();
    u.onerror = () => alTerminar && alTerminar();
    speechSynthesis.speak(u);
  }catch(e){ if(alTerminar) alTerminar(); }
}

/* 'completo' = se dijo el mensaje entero (botón HABLAR o una frase). Al terminar
   de sonar, la pantalla se limpia sola: así no hay que borrar letra por letra
   antes del siguiente mensaje. */
function hablar(t, completo){
  if(!t || !t.trim()) return;
  const alTerminar = () => {
    if(!completo || !cfg.autoborrar) return;
    S.texto = "";                       // se limpia el texto, no la pantalla
    verTexto(); pintar();
  };
  MiVoz.decir(t, x => sintetica(x, alTerminar), !!cfg.miVoz)
       .then(r => { if(r !== "tts") alTerminar(); })
       .catch(() => sintetica(t, alTerminar));
}
let actx = null;
function clic(){
  try{
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 660; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(.001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.18, actx.currentTime + .01);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .12);
    o.start(); o.stop(actx.currentTime + .13);
  }catch(e){}
}

/* ============================ predicción ============================ */
/* Predicción: parte de una lista por frecuencia, pero aprende de lo que
   esta persona escribe de verdad y lo va poniendo adelante.            */
const uso = JSON.parse(localStorage.getItem("mirada.uso") || "{}");
function anotarUso(w){
  w = w.toLowerCase(); if(w.length < 2) return;
  uso[w] = (uso[w] || 0) + 1;
  localStorage.setItem("mirada.uso", JSON.stringify(uso));
}
function sugerencias(){
  const m = S.texto.match(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)$/);
  if(!m) return [];
  const p = m[1].toLowerCase(); if(p.length < 2) return [];
  const vistos = new Set(), cand = [];
  const meter = (w, rango) => {
    if(w.length <= p.length || !w.startsWith(p) || vistos.has(w)) return;
    vistos.add(w); cand.push({ w, rango, n: uso[w] || 0 });
  };
  Object.keys(uso).forEach(w => meter(w, 1e6));          // lo que ya se ha escrito
  PALABRAS.forEach((w, i) => meter(w, i));               // la lista base
  cand.sort((a,b) => (b.n - a.n) || (a.rango - b.rango) || (a.w.length - b.w.length));
  return cand.slice(0, 2).map(c => c.w);
}

/* ============================ rejilla ============================ */
const rejilla = $("#rejilla"), tira = $("#tira");
let celdas = [];

function disposicionActiva(){
  if(cfg.disposicion === "teclado") return "teclado";
  if(cfg.disposicion === "pasos")   return "pasos";
  return Math.min(innerWidth, innerHeight) >= 700 ? "teclado" : "pasos";
}
function celda(txt, accion, clases, sub){
  const n = el("div", "celda " + (clases || ""));
  n.appendChild(el("div", "fill"));
  n.appendChild(el("div", "txt", txt));
  if(sub) n.appendChild(el("div", "sub", sub));
  n.addEventListener("click", () => ejecutar(accion));
  return { nodo:n, accion };
}
function pintar(){
  rejilla.innerHTML = ""; tira.innerHTML = ""; celdas = [];
  const sug = sugerencias();
  const add = c => { celdas.push(c); rejilla.appendChild(c.nodo); };
  const addT = c => { celdas.push(c); tira.appendChild(c.nodo); };

  // Fila de arriba. En las frases lleva SÍ y NO bien grandes, para poder
  // responder sin salir del menú; en el teclado, las palabras sugeridas.
  const enFrases = ["frases", "catfrases", "subfrases"].includes(S.vista);
  tira.classList.remove("oculta");
  if(enFrases){
    addT(celda("SÍ", {t:"frase", v:"Sí"}, "grande accion verde"));
    addT(celda("NO", {t:"frase", v:"No"}, "grande accion rojo"));
    addT(celda("TECLADO", {t:"teclado"}, "grande accion"));
  } else {
    const RESP = ["Sí", "No"];
    for(let i=0;i<2;i++){
      const w = sug[i];
      if(w) addT(celda(w, {t:"palabra", v:w}, "chica accion"));
      else  addT(celda(RESP[i] === "Sí" ? "SÍ" : "NO", {t:"frase", v:RESP[i]},
                       "grande accion " + (i === 0 ? "verde" : "rojo")));
    }
    addT(celda("FRASES", {t:"frases"}, "grande accion"));
  }
  addT(celda(S.confirmar ? "¿SEGURO?" : "BORRAR TODO", {t:"limpiar"},
             "chica accion rojo" + (S.confirmar ? " alerta" : "")));

  if(S.vista === "frases"){                       // menú de categorías
    // 9 categorías en 3x3: entran justas y el nombre largo cabe entero.
    // TECLADO no va aquí: está arriba, junto a SÍ y NO.
    const cats = Object.keys(FRASES);
    const cols = 3;
    rejilla.style.gridTemplateColumns = "repeat(" + cols + ",1fr)";
    rejilla.style.gridTemplateRows = "repeat(" + Math.ceil(cats.length / cols) + ",1fr)";
    cats.forEach(c => add(celda(c, {t:"catfrase", v:c}, "")));
    marcar(); return;
  }
  if(S.vista === "catfrases"){                    // frases de una categoría
    const lista = FRASES[S.categoria] || [];
    rejilla.style.gridTemplateColumns = "repeat(4,1fr)";
    rejilla.style.gridTemplateRows = "repeat(" + Math.ceil((lista.length + 1) / 4) + ",1fr)";
    lista.forEach((f, i) => {
      if(typeof f === "string") add(celda(f, {t:"frase", v:f}, "chica accion"));
      else add(celda(f.txt, {t:"subfrase", v:i}, "chica accion"));   // abre submenú
    });
    add(celda("VOLVER", {t:"frases"}, "chica accion rojo"));
    marcar(); return;
  }
  if(S.vista === "subfrases"){                    // opciones de una frase
    const lista = S.subfrases || [];
    rejilla.style.gridTemplateColumns = "repeat(4,1fr)";
    rejilla.style.gridTemplateRows = "repeat(" + Math.ceil((lista.length + 1) / 4) + ",1fr)";
    lista.forEach(f => add(celda(f, {t:"frase", v:f}, "chica accion")));
    add(celda("VOLVER", {t:"catfrase", v:S.categoria}, "chica accion rojo"));
    marcar(); return;
  }
  const modo = disposicionActiva();

  if(S.vista === "grupos" && modo === "pasos"){
    rejilla.style.gridTemplateColumns = "repeat(3,1fr)";
    rejilla.style.gridTemplateRows = "repeat(3,1fr)";
    GRUPOS.forEach((g,i) => add(celda(g.join(" "), {t:"grupo", v:i}, "")));
    add(celda("ESPACIO", {t:"espacio"}, "chica accion", "␣"));
    add(celda("BORRAR",  {t:"borrar"},  "chica accion rojo", "⌫"));
    add(celda("HABLAR",  {t:"hablar"},  "chica accion verde", "🔊"));
  }
  else if(S.vista === "letras"){
    rejilla.style.gridTemplateColumns = "repeat(3,1fr)";
    rejilla.style.gridTemplateRows = "repeat(2,1fr)";
    GRUPOS[S.grupo].forEach(l => add(celda(l, {t:"letra", v:l}, "")));
    add(celda("VOLVER", {t:"volver"}, "chica accion rojo"));
  }
  else {
    rejilla.style.gridTemplateColumns = "repeat(6,1fr)";
    rejilla.style.gridTemplateRows = "repeat(5,1fr)";
    TECLADO.forEach(l => add(celda(l, {t:"letra", v:l}, "")));
    add(celda("␣",  {t:"espacio"}, "accion", "espacio"));
    add(celda("⌫",  {t:"borrar"},  "accion rojo", "borrar"));
    add(celda("🔊", {t:"hablar"},  "accion verde", "hablar"));
  }
  marcar();
}
function marcar(){ requestAnimationFrame(() => celdas.forEach(c => c.rect = c.nodo.getBoundingClientRect())); }
addEventListener("resize", () => pintar());

/* ============================ acciones ============================ */
let confTimer = 0;
function ejecutar(a){
  if(!a || a.t === "nada") return;
  clic();
  // cualquier otra seleccion cancela el "¿seguro?" pendiente
  if(S.confirmar && a.t !== "limpiar"){ S.confirmar = false; clearTimeout(confTimer); }
  switch(a.t){
    case "limpiar":
      if(!S.texto){ break; }
      if(!S.confirmar){                       // primer paso: pide confirmar
        S.confirmar = true;
        clearTimeout(confTimer);
        confTimer = setTimeout(() => { S.confirmar = false; pintar(); }, 4500);
        break;
      }
      S.confirmar = false; clearTimeout(confTimer);
      S.texto = ""; S.vista = "grupos"; S.grupo = null;
      break;
    case "grupo":   S.grupo = a.v; S.vista = "letras"; break;
    case "volver":  S.vista = "grupos"; S.grupo = null; break;
    case "frases":   S.vista = "frases"; break;
    case "catfrase": S.categoria = a.v; S.vista = "catfrases"; break;
    case "subfrase": { const f = (FRASES[S.categoria] || [])[a.v];
                       S.subfrases = (f && f.sub) || [];
                       S.vista = "subfrases"; break; }
    // Al decir una frase NO se sale del menú: así se puede encadenar otra, o
    // responder sí/no a lo que pregunten, sin volver a navegar.
    case "frase":    S.texto = a.v; verTexto(); hablar(a.v, true); break;
    case "teclado":  S.vista = "grupos"; S.grupo = null; break;
    case "letra":   S.texto += a.v; if(cfg.eco) hablar(a.v);
                    if(disposicionActiva() === "pasos") S.vista = "grupos"; break;
    case "palabra": S.texto = S.texto.replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)$/, a.v) + " ";
                    anotarUso(a.v); if(cfg.eco) hablar(a.v); break;
    case "espacio": { const u = S.texto.match(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)$/);
                      if(u) anotarUso(u[1]); S.texto += " "; break; }
    case "borrar":  S.texto = S.texto.slice(0, -1); break;
    case "hablar":  hablar(S.texto, true); break;
  }
  verTexto(); pintar();
}
function verTexto(){
  const t = $("#texto");
  if(!S.texto){ t.className = "vacio"; t.innerHTML = 'Mira una casilla para empezar<span class="cursor"></span>'; }
  else { t.className = ""; t.innerHTML = ""; t.append(S.texto); t.appendChild(el("span","cursor")); }
}

/* ============================ cámara ============================ */
const video = $("#video");
let malla = null;

async function iniciar(){
  aviso("Preparando la cámara…");
  const stream = await navigator.mediaDevices.getUserMedia({
    video:{ facingMode:"user", width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30} }, audio:false });
  video.srcObject = stream; await video.play();

  aviso("Cargando el detector de rostro…");
  const fs = await FilesetResolver.forVisionTasks(WASM);
  const opciones = d => ({
    baseOptions:{ modelAssetPath: MODEL, delegate:d },
    runningMode:"VIDEO", numFaces:1,
    outputFaceBlendshapes:true, outputFacialTransformationMatrixes:true,
  });
  try{ malla = await FaceLandmarker.createFromOptions(fs, opciones("GPU")); }
  catch(e){ console.warn("GPU no disponible, uso CPU:", e);
            malla = await FaceLandmarker.createFromOptions(fs, opciones("CPU")); }
  aviso(""); S.listo = true;
  requestAnimationFrame(bucle);
}

/* ============================ calibración ============================ */
/* 9 puntos: con más puntos el ajuste distingue mejor el aporte de la
   cabeza del de los ojos, que es justo lo que faltaba.                 */
const _MARGEN_CAL = { amplia: 1.0, media: .72, reducida: .5 };

function _encoge(p){
  // Acerca los puntos al centro. Sirve cuando la persona no alcanza a mirar a
  // las esquinas: se calibra dentro de lo que sí alcanza y el ajuste estira ese
  // recorrido corto hasta cubrir la pantalla entera.
  const k = _MARGEN_CAL[cfg.areaCal] || 1;
  return p.map(([x, y]) => [.5 + (x - .5) * k, .5 + (y - .5) * k]);
}

function rejillaCal(n){
  if(n >= 24){                                   // 6 x 4
    const xs = [.07,.25,.42,.58,.75,.93], ys = [.09,.36,.64,.91], p = [];
    ys.forEach(y => xs.forEach(x => p.push([x,y])));
    return p;
  }
  if(n >= 18){                                   // 6 x 3: las mismas columnas del teclado
    const xs = [.07,.25,.42,.58,.75,.93], ys = [.11,.5,.89], p = [];
    ys.forEach(y => xs.forEach(x => p.push([x,y])));
    return p;
  }
  if(n >= 16){                                   // 4 x 4
    const v = [.08,.36,.64,.92], p = [];
    v.forEach(y => v.forEach(x => p.push([x,y])));
    return p;
  }
  const v = [.10,.5,.90], p = [];
  v.forEach(y => v.forEach(x => p.push([x,y])));  // 3 x 3
  if(n >= 13) p.push([.30,.30],[.70,.30],[.30,.70],[.70,.70]);   // + diagonales
  return p;
}
let PUNTOS = rejillaCal(18);
let calIdx = 0, calFin = 0, calMuestras = [], calTodo = [];

function calibrar(){
  PUNTOS = _encoge(rejillaCal(cfg.puntos));
  calIdx = -1; calMuestras = []; calTodo = []; S.calibrando = true;   // -1 = esperando la cara
  S.caraDesde = 0;
  $("#dianaCapa").classList.add("on");
  $("#diana").style.opacity = "0";
  $("#dianaTxt").textContent = "Acomódate frente a la cámara…";
  $("#dianaPaso").textContent = "";
}
function sigPunto(){
  if(calIdx >= PUNTOS.length){ terminarCal(); return; }
  const [px,py] = PUNTOS[calIdx], d = $("#diana");
  d.style.opacity = "1";
  d.style.left = (px*100) + "%"; d.style.top = (py*100) + "%";
  $("#dianaPaso").textContent = (calIdx+1) + " de " + PUNTOS.length;
  $("#dianaTxt").textContent = "Mira el punto rojo";
  d.style.transform = "scale(1)";
  setTimeout(() => { d.style.transform = "scale(.62)"; }, PUNTOS.length >= 16 ? 750 : 800);
  calMuestras[calIdx] = [];
  calFin = performance.now() + (PUNTOS.length >= 16 ? 1900 : 2100);   // llegar + medir
}
function terminarCal(){
  S.calibrando = false;
  $("#dianaCapa").classList.remove("on");

  const k = (vector(calTodo[0] && calTodo[0].r) || [1]).length;
  acumBase = nuevoAcum(k);
  let usadas = 0;
  calMuestras.forEach((ms, i) => {
    if(ms.length < 5) return;
    // descarta valores sueltos: se queda con el 60% central de cada rasgo
    const med = new Float64Array(k), mad = new Float64Array(k);
    for(let j=0;j<k;j++){
      const col = ms.map(f => f[j]);
      med[j] = mediana(col);
      mad[j] = mediana(col.map(v => Math.abs(v - med[j]))) || 1e-6;
    }
    ms.forEach(f => {
      for(let j=1;j<k;j++) if(Math.abs(f[j]-med[j]) > 3*mad[j]) return;
      acumular(acumBase, f, PUNTOS[i][0], PUNTOS[i][1]); usadas++;
    });
  });
  if(usadas < 20){ aviso("Calibración incompleta, inténtalo otra vez", 3500); return; }

  modelo = resolverAcum(acumBase);

  // error medio sobre los propios puntos, en % de pantalla
  let err = 0, n = 0;
  calMuestras.forEach((ms, i) => ms.forEach(f => {
    err += Math.hypot(aplicar(modelo.wx,f) - PUNTOS[i][0], aplicar(modelo.wy,f) - PUNTOS[i][1]); n++;
  }));
  err = n ? err/n : 1;
  guardarModelo(err);

  filtX.x = filtY.x = null;
  S.pausa = false; $("#btnPausa").textContent = "Pausar";
  const cal = err < .06 ? "muy buena" : err < .10 ? "buena" : err < .16 ? "regular" : "baja";
  aviso("Precisión " + cal + " (±" + Math.round(err*100) + "% de pantalla)", 4500);
}

/* ============================ bucle ============================ */
let ultimo = -1, tPrev = 0;
function bucle(){
  requestAnimationFrame(bucle);
  if(!S.listo || video.readyState < 2) return;
  if(video.currentTime === ultimo) return;
  ultimo = video.currentTime;

  const ahora = performance.now();
  const res = malla.detectForVideo(video, ahora);
  const r = medir(res);
  if(r){ S.cara = true; S.ultimaCara = ahora; S.rasgos = r; }
  else if(ahora - S.ultimaCara > 500) S.cara = false;

  if(S.calibrando){
    if(calIdx < 0){                       // aún no empieza: espera media cara estable
      if(S.cara){
        if(!S.caraDesde) S.caraDesde = ahora;
        if(ahora - S.caraDesde > 700){ calIdx = 0; sigPunto(); }
      } else { S.caraDesde = 0; $("#dianaTxt").textContent = "No te veo — acomoda la cámara"; }
      return;
    }
    if(r && ahora > calFin - (PUNTOS.length >= 16 ? 1150 : 1300)){
      const f = vector(r);
      calMuestras[calIdx].push(f);
      calTodo.push({ r, i:calIdx });
    }
    if(ahora > calFin){ calIdx++; sigPunto(); }
    return;
  }

  if(!S.cara){ aviso("No te veo — acomoda la cámara"); $("#punto").classList.remove("on"); soltar(); return; }
  if(S.pausa){ aviso("En pausa"); $("#punto").classList.remove("on"); soltar(); return; }
  if(!modelo){ aviso("Falta calibrar"); return; }
  aviso("");

  const f = vector(S.rasgos);
  // Ganancia separada por eje: el recorrido vertical de la mirada es bastante
  // más corto que el horizontal, así que casi siempre necesita más empuje.
  let nx = (aplicar(modelo.wx, f) - .5) * cfg.ganancia  + .5;
  let ny = (aplicar(modelo.wy, f) - .5) * cfg.gananciaV + .5;
  nx = clamp(nx, 0, 1); ny = clamp(ny, 0, 1);

  const dt = clamp((ahora - tPrev)/1000, .008, .1); tPrev = ahora;
  const q = cfg.suavizado;                       // 1..9
  const mincorte = 2.2 - q*.20;                  // más suavizado = corte más bajo
  const beta     = .030 + q*.012;                // pero sigue respondiendo al movimiento rápido
  S.punto.x = filtX.filtrar(nx, dt, mincorte, beta) * innerWidth;
  S.punto.y = filtY.filtrar(ny, dt, mincorte, beta) * innerHeight;

  dwell(ahora, f);

  // Imán: mientras se sostiene la mirada, el punto se va pegando al centro de
  // la casilla. El temblor deja de importar y se ve con claridad qué está
  // seleccionado. La detección sigue usando la posición real, así que salirse
  // funciona igual de bien.
  let px = S.punto.x, py = S.punto.y;
  if(S.celda && S.celda.rect && cfg.iman > 0){
    const r = S.celda.rect;
    const prog = clamp((ahora - S.desde) / cfg.dwell, 0, 1);
    const k = (cfg.iman / 100) * (.35 + .65 * prog);
    px += ((r.left + r.width / 2) - px) * k;
    py += ((r.top + r.height / 2) - py) * k;
  }
  const p = $("#punto");
  p.classList.add("on");
  p.style.left = px + "px"; p.style.top = py + "px";
}

function soltar(){
  if(S.celda){ S.celda.nodo.classList.remove("mirando"); S.celda.nodo.querySelector(".fill").style.width = "0"; }
  S.celda = null; S.rasgoDwell = null;
}

function dwell(ahora, f){
  if(ahora < S.enfriando) return;
  // Histéresis proporcional: en casillas grandes hay que alejarse más para
  // soltarlas. Antes era fijo en 14 px y en una tablet eso es nada.
  const _r0 = S.celda && S.celda.rect;
  const H = _r0 ? Math.max(14, Math.min(_r0.width, _r0.height) * 0.22) : 14;
  const dentro = (c, m) => { const r = c.rect; return r &&
    S.punto.x >= r.left-m && S.punto.x <= r.right+m && S.punto.y >= r.top-m && S.punto.y <= r.bottom+m; };

  let sobre = null;
  if(S.celda && dentro(S.celda, H)) sobre = S.celda;          // se queda pegado a la actual
  else for(const c of celdas) if(dentro(c, 0)){ sobre = c; break; }

  if(sobre !== S.celda){
    if(sobre === null){
      if(!S.fuera) S.fuera = ahora;
      if(ahora - S.fuera < 200) return;
    }
    S.fuera = 0; soltar();
    S.celda = sobre; S.desde = ahora;
    if(sobre) sobre.nodo.classList.add("mirando");
    return;
  }
  S.fuera = 0;
  if(!sobre) return;

  const t = ahora - S.desde, prog = clamp(t/cfg.dwell, 0, 1);
  sobre.nodo.querySelector(".fill").style.width = (prog*100) + "%";
  if(prog > .55 && !S.rasgoDwell) S.rasgoDwell = f;           // muestra para ir aprendiendo

  const listo = cfg.blink ? (t > 300 && S.parpadeo) : prog >= 1;
  if(listo){
    if(cfg.adaptar && S.rasgoDwell && acumBase) aprender(S.rasgoDwell, sobre);
    sobre.nodo.classList.add("disparo");
    const nodo = sobre.nodo;
    setTimeout(() => nodo.classList.remove("disparo"), 160);
    S.enfriando = ahora + 550;
    const acc = sobre.accion; soltar(); ejecutar(acc);
  }
}

/* Corrección sobre la marcha: cada selección acertada dice dónde estaba
   mirando de verdad, así el ajuste se va afinando y compensa la deriva.  */
function aprender(f, c){
  const r = c.rect; if(!r) return;
  acumular(acumBase, f, (r.left + r.width/2)/innerWidth, (r.top + r.height/2)/innerHeight, .30);
  if(++S.nAdapt % 4 === 0){
    modelo = resolverAcum(acumBase);
    guardarModelo(modelo.error || 0);
  }
}

/* ============================ avisos ============================ */
let avisoT = 0;
function aviso(txt, ms){
  const a = $("#aviso");
  if(!txt){ a.classList.remove("on"); return; }
  a.textContent = txt; a.classList.add("on");
  clearTimeout(avisoT);
  if(ms) avisoT = setTimeout(() => a.classList.remove("on"), ms);
}

/* ============================ ajustes ============================ */
function grupoBotones(sel, clave, alCambiar){
  const cont = $(sel); if(!cont) return;
  const pinta = () => [...cont.children].forEach(b =>
    b.classList.toggle("act", String(cfg[clave]) === b.dataset.v));
  cont.addEventListener("click", e => {
    const b = e.target.closest("button"); if(!b) return;
    cfg[clave] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
    guardarCfg(); pinta(); if(alCambiar) alCambiar();
  });
  pinta();
}
function rango(sel, clave, muestra){
  const r = $(sel); if(!r) return;
  r.value = cfg[clave];
  const pinta = () => $(muestra).textContent =
    clave === "dwell"    ? (cfg.dwell/1000).toFixed(1).replace(".", ",") + " s" :
    clave === "ganancia"  ? cfg.ganancia.toFixed(1).replace(".", ",") :
    clave === "gananciaV" ? cfg.gananciaV.toFixed(1).replace(".", ",") :
    clave === "iman"      ? (cfg.iman === 0 ? "sin imán" : cfg.iman + "%") :
    ["mínimo","muy bajo","bajo","medio-bajo","medio","medio-alto","alto","muy alto","máximo"][cfg.suavizado-1];
  r.addEventListener("input", () => { cfg[clave] = +r.value; guardarCfg(); pinta(); });
  pinta();
}
grupoBotones("#optModo","modo", () => { cargarModelo();
  aviso(modelo ? "Modo cambiado — ya tenías calibración guardada" : "Modo nuevo: hay que calibrar", 3500); });
grupoBotones("#optDisp","disposicion", () => pintar());
grupoBotones("#optBlink","blink");
grupoBotones("#optEco","eco");
grupoBotones("#optAdapt","adaptar");
grupoBotones("#optMiVoz","miVoz");
grupoBotones("#optAutoborrar","autoborrar");
grupoBotones("#optCalIni","calInicio");
$("#btnMiVoz").onclick = () => {
  MiVoz.crearPanel(() => { $("#voz").classList.remove("on"); $("#ajustes").classList.add("on"); });
  $("#ajustes").classList.remove("on"); $("#voz").classList.add("on");
};
grupoBotones("#optPuntos","puntos", () => { cargarModelo();
  aviso(modelo ? "Ya hay calibración guardada para este detalle" : "Hay que calibrar de nuevo", 3500); });
grupoBotones("#optCam","camara", () => video.classList.toggle("on", !!cfg.camara));
rango("#rgDwell","dwell","#vDwell");
rango("#rgGan","ganancia","#vGan");
rango("#rgGanV","gananciaV","#vGanV");
rango("#rgIman","iman","#vIman");
grupoBotones("#optAreaCal","areaCal", () => aviso("Hay que calibrar de nuevo", 3000));
rango("#rgSua","suavizado","#vSua");
$("#selVoz").addEventListener("change", e => { cfg.voz = e.target.value; guardarCfg(); });

$("#btnAjustes").onclick       = () => { $("#ajustes").classList.add("on"); S.pausa = true; };
$("#btnCerrarAjustes").onclick = () => { $("#ajustes").classList.remove("on"); S.pausa = false;
                                         $("#btnPausa").textContent = "Pausar"; pintar(); };
$("#btnRecal").onclick         = () => { $("#ajustes").classList.remove("on"); calibrar(); };
$("#btnAyuda").onclick         = () => $("#ayuda").classList.add("on");
$("#btnCerrarAyuda").onclick   = () => $("#ayuda").classList.remove("on");
$("#btnCal").onclick           = () => calibrar();
$("#btnCancelarCal").onclick   = () => {
  S.calibrando = false; calIdx = -1;
  $("#dianaCapa").classList.remove("on");
  if(modelo){ S.pausa = false; $("#btnPausa").textContent = "Pausar"; aviso("Calibración cancelada", 2500); }
  else { S.pausa = true; $("#btnPausa").textContent = "Seguir";
         aviso("Sin calibrar: toca Calibrar cuando quieras", 4000); }
};
$("#btnPausa").onclick         = () => { S.pausa = !S.pausa;
                                         $("#btnPausa").textContent = S.pausa ? "Seguir" : "Pausar"; };
$("#btnEmpezar").onclick = async () => {
  MiVoz.audioCtx();                     // desbloquea el audio con este toque
  $("#inicio").classList.remove("on");
  video.classList.toggle("on", !!cfg.camara);
  try{
    await iniciar(); cargarVoces();
    if(!modelo || cfg.calInicio === "siempre") calibrar();
    else { S.pausa = false; aviso("Listo", 1500); }
  }catch(e){ aviso("No se pudo abrir la cámara: " + (e && e.message ? e.message : e)); console.error(e); }
};

/* arranque */
cargarModelo(); verTexto(); pintar(); cargarVoces(); MiVoz.refrescarIndice().catch(()=>{});
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
