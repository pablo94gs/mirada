/* mivoz.js — reproduce la voz real de una persona en lugar de la voz sintética.
   Las grabaciones se guardan en el propio dispositivo (IndexedDB); no salen de ahí. */

const BD = "mirada-voz", ALM = "clips";
let bd = null;

function abrirBD(){
  if(bd) return Promise.resolve(bd);
  return new Promise((ok, mal) => {
    let cerrado = false;
    const falla = e => { if(!cerrado){ cerrado = true; mal(e || new Error("IndexedDB no disponible")); } };
    const t = setTimeout(() => falla(new Error("IndexedDB no respondió")), 3000);
    let s;
    try{ s = indexedDB.open(BD, 1); }catch(e){ clearTimeout(t); return falla(e); }
    s.onupgradeneeded = () => s.result.createObjectStore(ALM);
    s.onsuccess = () => { clearTimeout(t); if(!cerrado){ cerrado = true; bd = s.result; ok(bd); } };
    s.onerror   = () => { clearTimeout(t); falla(s.error); };
    s.onblocked = () => { clearTimeout(t); falla(new Error("IndexedDB bloqueada")); };
  });
}
const tx = (modo, fn) => abrirBD().then(d => new Promise((ok, mal) => {
  const t = d.transaction(ALM, modo), p = fn(t.objectStore(ALM));
  p.onsuccess = () => ok(p.result); p.onerror = () => mal(p.error);
}));

export const clave = t => (t || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/[¿?¡!.,;:]/g, "");
const guardarClip = (t, blob) => tx("readwrite", s => s.put(blob, clave(t)));
const leerClip    = t => tx("readonly",  s => s.get(clave(t)));
const borrarClip  = t => tx("readwrite", s => s.delete(clave(t)));
const listarClips = () => tx("readonly",  s => s.getAllKeys());

/* ---------- reproducción ---------- */
let ac = null;
const memoria = new Map();                 // clave -> AudioBuffer ya decodificado
export function audioCtx(){
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  if(ac.state === "suspended") ac.resume();
  return ac;
}
async function buffer(t){
  const k = clave(t);
  if(memoria.has(k)) return memoria.get(k);
  const blob = await leerClip(k);
  if(!blob) return null;
  const buf = await audioCtx().decodeAudioData(await blob.arrayBuffer());
  memoria.set(k, buf);
  return buf;
}
function sonar(buf){
  return new Promise(ok => {
    const c = audioCtx(), f = c.createBufferSource();
    f.buffer = buf; f.connect(c.destination);
    f.onended = ok; f.start();
  });
}

let grabadas = new Set();
export let disponible = true;
export async function refrescarIndice(){
  try{ grabadas = new Set(await listarClips()); disponible = true; }
  catch(e){ grabadas = new Set(); disponible = false; console.warn("Sin almacenamiento de voz:", e); }
  return grabadas;
}
export const tieneClip = t => grabadas.has(clave(t));

/* Dice el texto. Prioridad:
   1) grabación exacta de toda la frase;
   2) si TODAS las palabras están grabadas, las encadena;
   3) voz sintética.                                              */
export async function decir(texto, sintetica, usarMiVoz){
  const t = (texto || "").trim();
  if(!t) return;
  if(usarMiVoz){
    const entera = await buffer(t);
    if(entera){ await sonar(entera); return "clip"; }

    const palabras = t.split(/\s+/).filter(Boolean);
    if(palabras.length > 1 && palabras.every(p => tieneClip(p))){
      for(const p of palabras){
        const b = await buffer(p);
        if(b) await sonar(b);
        await new Promise(r => setTimeout(r, 70));    // respiro entre palabras
      }
      return "clips";
    }
  }
  sintetica(t);
  return "tts";
}

/* ---------- panel para grabar ---------- */
const SUGERIDAS = {
  "Frases": ["Sí","No","Gracias","Tengo sed","Me duele","Necesito ayuda","Quiero descansar",
             "Buenos días","Buenas noches","Te quiero","Espera un momento","Llama al doctor",
             "Tengo frío","Tengo calor","Quiero comer","Quiero ir al baño"],
  "Palabras más usadas": ["sí","no","gracias","agua","comida","baño","dolor","ayuda","por favor",
             "mamá","papá","doctor","enfermera","cama","silla","luz","frío","calor","hambre","sed",
             "bien","mal","más","menos","ahora","después","quiero","necesito","me","duele"],
};

let panel = null, mediaRec = null, trozos = [], grabandoClave = null, temporiz = 0;

let repintar = [];
export function crearPanel(cerrar){
  repintar = [];
  panel = document.getElementById("voz");
  panel.innerHTML = "";
  const caja = document.createElement("div"); caja.className = "caja";
  caja.innerHTML = `<h1 style="margin-top:8px">Mi voz</h1>
    <p style="text-align:left;margin-bottom:14px">Graba estas frases y palabras con tu propia voz.
    Cuando la app tenga que decir algo que esté grabado, <b>usa tu grabación</b> en lugar de la voz
    del sistema. Lo que no esté grabado lo sigue diciendo la voz sintética.<br>
    Las grabaciones se quedan en este dispositivo.</p>`;

  const nueva = document.createElement("div");
  nueva.className = "fila";
  nueva.innerHTML = `<label>Agregar una frase propia</label>
    <div style="display:flex;gap:8px">
      <input id="vozNueva" placeholder="Escribe la frase…" style="flex:1;padding:11px;border-radius:11px;border:2px solid var(--line);font-size:16px">
      <button class="btn" id="vozAgregar" style="margin:0;padding:11px 18px;font-size:16px">Agregar</button>
    </div>`;
  caja.appendChild(nueva);

  const propias = JSON.parse(localStorage.getItem("mirada.frasesPropias") || "[]");
  const grupos = Object.assign({}, SUGERIDAS);
  if(propias.length) grupos["Mis frases"] = propias;

  for(const [titulo, items] of Object.entries(grupos)){
    const f = document.createElement("div"); f.className = "fila";
    f.appendChild(Object.assign(document.createElement("label"), { textContent: titulo }));
    items.forEach(t => f.appendChild(linea(t)));
    caja.appendChild(f);
  }

  const pie = document.createElement("div");
  pie.style.cssText = "text-align:center;padding:6px 0 30px";
  const b = document.createElement("button"); b.className = "btn"; b.textContent = "Listo";
  b.onclick = () => { pararGrabacion(); cerrar(); };
  pie.appendChild(b); caja.appendChild(pie);
  panel.appendChild(caja);
  refrescarIndice().then(() => repintar.forEach(f => f()));   // sin bloquear el dibujo

  caja.querySelector("#vozAgregar").onclick = () => {
    const i = caja.querySelector("#vozNueva"), v = i.value.trim();
    if(!v) return;
    const lista = JSON.parse(localStorage.getItem("mirada.frasesPropias") || "[]");
    if(!lista.includes(v)) lista.push(v);
    localStorage.setItem("mirada.frasesPropias", JSON.stringify(lista));
    i.value = ""; crearPanel(cerrar);
  };
}

function linea(t){
  const fila = document.createElement("div");
  fila.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)";
  const txt = document.createElement("div");
  txt.style.cssText = "flex:1;font-size:16px;font-weight:600";
  txt.textContent = t;
  const marca = document.createElement("span");
  marca.style.cssText = "font-size:12px;font-weight:800;letter-spacing:.08em;padding:3px 9px;border-radius:999px";
  const pinta = () => {
    const hay = tieneClip(t);
    marca.textContent = hay ? "GRABADA" : "sin grabar";
    marca.style.background = hay ? "#e9f7ee" : "#f1f5f8";
    marca.style.color = hay ? "var(--verde)" : "var(--muted)";
    oir.style.display = hay ? "" : "none";
    bor.style.display = hay ? "" : "none";
  };
  const mk = (etq, fn) => { const b = document.createElement("button");
    b.textContent = etq; b.style.cssText =
      "background:#f4f8fb;border:2px solid var(--line);border-radius:10px;padding:9px 13px;font-weight:700;font-size:14px;cursor:pointer";
    b.onclick = fn; return b; };

  const oir = mk("Oír", async () => { const b = await buffer(t); if(b) sonar(b); });
  const bor = mk("Borrar", async () => { await borrarClip(t); memoria.delete(clave(t));
                                         await refrescarIndice(); pinta(); });
  const gra = mk("Grabar", async () => {
    if(grabandoClave === clave(t)){ pararGrabacion(); return; }
    pararGrabacion();
    try{
      const st = await navigator.mediaDevices.getUserMedia({ audio:true });
      trozos = []; grabandoClave = clave(t);
      mediaRec = new MediaRecorder(st);
      mediaRec.ondataavailable = e => e.data.size && trozos.push(e.data);
      mediaRec.onstop = async () => {
        st.getTracks().forEach(x => x.stop());
        if(trozos.length){
          await guardarClip(t, new Blob(trozos, { type: mediaRec.mimeType || "audio/webm" }));
          memoria.delete(clave(t)); await refrescarIndice();
        }
        grabandoClave = null; gra.textContent = "Grabar"; gra.style.background = "#f4f8fb"; pinta();
      };
      mediaRec.start();
      gra.textContent = "Detener"; gra.style.background = "#ffd9dc";
      clearTimeout(temporiz); temporiz = setTimeout(pararGrabacion, 7000);   // tope 7 s
    }catch(e){ alert("No se pudo usar el micrófono: " + (e && e.message ? e.message : e)); }
  });

  fila.append(txt, marca, gra, oir, bor);
  pinta(); repintar.push(pinta);
  return fila;
}

export function pararGrabacion(){
  clearTimeout(temporiz);
  if(mediaRec && mediaRec.state !== "inactive") mediaRec.stop();
}
