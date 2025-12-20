// ===============================
// 1) Datos de ejemplo (AHORA con lang: "en" / "es")
// ===============================

const cartas = [
  // TestSet A (EN)
  { id: 1, nombre: "Lightning Bolt",  coleccion: "TestSet A", lang: "en", numero: 101, rareza: "Común" },
  { id: 2, nombre: "Counterspell",    coleccion: "TestSet A", lang: "en", numero: 102, rareza: "Común" },
  { id: 3, nombre: "Llanowar Elves",  coleccion: "TestSet A", lang: "en", numero: 103, rareza: "Común" },
  { id: 4, nombre: "Serra Angel",     coleccion: "TestSet A", lang: "en", numero: 104, rareza: "Rara" },
  { id: 5, nombre: "Shivan Dragon",   coleccion: "TestSet A", lang: "en", numero: 105, rareza: "Rara" },

  // TestSet A (ES) - clon ejemplo
  { id: 101, nombre: "Relámpago",        coleccion: "TestSet A", lang: "es", numero: 101, rareza: "Común" },
  { id: 102, nombre: "Contrahechizo",    coleccion: "TestSet A", lang: "es", numero: 102, rareza: "Común" },

  // TestSet B (EN)
  { id: 6,  nombre: "Lightning Bolt",  coleccion: "TestSet B", lang: "en", numero: 201, rareza: "Común" },
  { id: 7,  nombre: "Duress",          coleccion: "TestSet B", lang: "en", numero: 202, rareza: "Común" },
  { id: 8,  nombre: "Giant Growth",    coleccion: "TestSet B", lang: "en", numero: 203, rareza: "Común" },
  { id: 9,  nombre: "Thoughtseize",    coleccion: "TestSet B", lang: "en", numero: 204, rareza: "Rara" },
  { id: 10, nombre: "Wrath of God",    coleccion: "TestSet B", lang: "en", numero: 205, rareza: "Rara" },

  // TestSet B (ES) - clon ejemplo
  { id: 201, nombre: "Relámpago",       coleccion: "TestSet B", lang: "es", numero: 201, rareza: "Común" }
];

function getLangFromCard(c) {
  return (c.lang || "en").toLowerCase(); // default en
}

function setKeyFromCard(c) {
  const lang = getLangFromCard(c);
  return `${c.coleccion}__${lang}`;
}

function formatLang(lang) {
  return (lang || "en").toUpperCase();
}

function parseCollectorNumber(value) {
  const raw = String(value ?? "").trim();
  const s = raw.toLowerCase();

  // Caso típico: "123", "001", "123a", "123-b", "123★"...
  const m = s.match(/^(\d+)(.*)$/);
  if (m) {
    return {
      hasNum: true,
      num: parseInt(m[1], 10),
      rest: (m[2] || "").trim(),
      raw: s
    };
  }

  // Caso no-numérico: "S1", "U12", "PRM", etc.
  return {
    hasNum: false,
    num: Number.POSITIVE_INFINITY,
    rest: s,
    raw: s
  };
}

function compareCollectorNumbers(a, b) {
  const A = parseCollectorNumber(a);
  const B = parseCollectorNumber(b);

  // Primero: los que tienen número delante, antes que los que no
  if (A.hasNum !== B.hasNum) return A.hasNum ? -1 : 1;

  // Segundo: número principal
  if (A.num !== B.num) return A.num - B.num;

  // Tercero: sufijo/resto (natural: "a" < "b", "" < "a", "10" > "2", etc.)
  return A.rest.localeCompare(B.rest, "es", { numeric: true, sensitivity: "base" });
}

function obtenerColecciones() {
  // Si ya cargamos Scryfall, usamos catálogo real
  if (catalogoColecciones && catalogoColecciones.length > 0) return catalogoColecciones;

  // Fallback (si aún no hay Scryfall): devuelve vacío (o tu demo si quieres mantenerla)
  return [];
}


function cartasDeSetKey(setKey) {
  return cacheCartasPorSetLang[setKey] || [];
}


// ===============================
// 2) Estado de colección en localStorage
// ===============================

const LS_KEY = "mtg_coleccion_estado_v1";

let estado = {};

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? Math.trunc(n) : 0;
  return Math.max(min, Math.min(max, x));
}

function migrarEstadoSiHaceFalta() {
  let cambiado = false;

  Object.keys(estado).forEach(id => {
    const st = estado[id];

    // esquema viejo {tengo, foil}
    if (st && typeof st === "object" && ("tengo" in st)) {
      const qty = st.tengo ? 1 : 0;
      const foil = !!st.foil && qty > 0;

      estado[id] = {
        qty,
        foil,
        playedQty: 0,
        wantMore: false
      };
      cambiado = true;
    }

    // normalizar esquema nuevo
    if (st && typeof st === "object" && ("qty" in st)) {
      const norm = normalizarEstadoCarta(st);
      const before = JSON.stringify(st);
      const after = JSON.stringify(norm);
      if (before !== after) {
        estado[id] = norm;
        cambiado = true;
      }
    }
  });

  if (cambiado) guardarEstado();
}

function cargarEstado() {
  const raw = localStorage.getItem(LS_KEY);
  estado = raw ? JSON.parse(raw) : {};
  migrarEstadoSiHaceFalta();
}

function guardarEstado() {
  localStorage.setItem(LS_KEY, JSON.stringify(estado));
}

function normalizarEstadoCarta(st) {
  const qty = clampInt(Number(st.qty ?? 0), 0, 999);
  const playedQty = clampInt(Number(st.playedQty ?? 0), 0, qty);
  const foil = qty > 0 ? !!st.foil : false;
  const wantMore = !!st.wantMore;

  return { qty, foil, playedQty, wantMore };
}

function getEstadoCarta(id) {
  if (!estado[id]) {
    estado[id] = { qty: 0, foil: false, playedQty: 0, wantMore: false };
    guardarEstado();
  } else {
    estado[id] = normalizarEstadoCarta(estado[id]);
  }
  return estado[id];
}

function setQty(id, value) {
  const st = getEstadoCarta(id);
  const qty = clampInt(Number(value), 0, 999);

  st.qty = qty;

  if (st.playedQty > st.qty) st.playedQty = st.qty;
  if (st.qty === 0) {
    st.foil = false;
    st.playedQty = 0;
  }
  guardarEstado();
}

function setPlayedQty(id, value) {
  const st = getEstadoCarta(id);
  st.playedQty = clampInt(Number(value), 0, st.qty);
  guardarEstado();
}

function setFoil(id, value) {
  const st = getEstadoCarta(id);
  st.foil = st.qty > 0 ? !!value : false;
  guardarEstado();
}

function setWantMore(id, value) {
  const st = getEstadoCarta(id);
  st.wantMore = !!value;
  guardarEstado();
}

// ===============================
// Scryfall (API) - capa de datos
// ===============================

const SCY_BASE = "https://api.scryfall.com";
const SCY_MIN_DELAY_MS = 120; // para respetar ~10 req/seg (y margen)

// Rate-limit muy simple (cola por tiempo)
let _scyLastCallAt = 0;
async function scryDelay() {
  const now = Date.now();
  const wait = Math.max(0, (_scyLastCallAt + SCY_MIN_DELAY_MS) - now);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _scyLastCallAt = Date.now();
}

async function scryFetchJson(url) {
  await scryDelay();
  const res = await fetch(url, { headers: { "Accept": "application/json" } });

  // Intentamos leer JSON incluso en errores
  let data = null;
  try {
    data = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    data = { object: "error", details: text || "Respuesta no-JSON" };
  }

  if (!res.ok) {
    const err = new Error(data?.details || `Scryfall ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}


// Scryfall devuelve listas paginadas con has_more y next_page
async function scryFetchAllPages(firstUrl) {
  const all = [];
  let url = firstUrl;

  while (url) {
    const data = await scryFetchJson(url);
    if (Array.isArray(data.data)) all.push(...data.data);
    url = data.has_more ? data.next_page : null;
  }
  return all;
}

// --- Helpers de mapeo al modelo interno ---
function mapRarity(r) {
  const x = String(r || "").toLowerCase();
  if (x === "common") return "Común";
  if (x === "uncommon") return "Infrecuente";
  if (x === "rare") return "Rara";
  if (x === "mythic") return "Mítica";
  return r || "—";
}

function pickCardName(card, lang) {
  // En no-inglés, Scryfall suele rellenar printed_name
  return (lang !== "en" && card.printed_name) ? card.printed_name : card.name;
}

function pickImage(card) {
  if (card.image_uris && card.image_uris.normal) return card.image_uris.normal;
  if (Array.isArray(card.card_faces) && card.card_faces[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
  return null;
}

// --- API calls ---
async function scryGetSets() {
  const data = await scryFetchJson(`${SCY_BASE}/sets`);
  return data.data || [];
}

async function scryGetCardsBySetAndLang(setCode, lang) {
  const q = encodeURIComponent(`set:${setCode} lang:${lang}`);
  const url = `${SCY_BASE}/cards/search?q=${q}&unique=prints&order=set`;

  try {
    return await scryFetchAllPages(url);
  } catch (err) {
    // Si no hay cartas (por idioma o set), Scryfall suele devolver 404 not_found
    if (err.status === 404 && err.data && err.data.object === "error" && err.data.code === "not_found") {
      return [];
    }
    throw err;
  }
}

// ===============================
// Scryfall - búsqueda por nombre (EN/ES)
// ===============================

const SEARCH_LANGS = ["en", "es"];
const SEARCH_LIMIT = 200; // evita bajar 1000+ prints en cartas hiper reimpresas

async function scryFetchAllPagesLimited(firstUrl, limit = 200) {
  const all = [];
  let url = firstUrl;

  while (url && all.length < limit) {
    const data = await scryFetchJson(url);
    if (Array.isArray(data.data)) all.push(...data.data);
    url = (data.has_more && all.length < limit) ? data.next_page : null;
  }
  return all;
}

async function scrySearchPrintsByName(texto) {
  const qUser = (texto || "").trim();
  if (!qUser) return [];

  // Solo papel, solo EN/ES, y búsqueda flexible por nombre
  // Nota: Scryfall usa sintaxis tipo `name:bolt`, `game:paper`, `(lang:en or lang:es)`
  const query = `game:paper (lang:en or lang:es) name:${qUser}`;
  const q = encodeURIComponent(query);
  const url = `${SCY_BASE}/cards/search?q=${q}&unique=prints&order=released&dir=desc`;

  try {
    return await scryFetchAllPagesLimited(url, SEARCH_LIMIT);
  } catch (err) {
    // Si no encuentra nada, Scryfall suele devolver 404 not_found
    if (err.status === 404 && err.data && err.data.object === "error" && err.data.code === "not_found") {
      return [];
    }
    throw err;
  }
}

function agruparResultadosBusqueda(cards) {
  // Agrupar por oracle_id (misma carta a través de reimpresiones y idiomas)
  const map = new Map();

  for (const card of cards) {
    // Seguridad: quedarnos solo con en/es
    if (!SEARCH_LANGS.includes(card.lang)) continue;

    const key = card.oracle_id || card.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }

  // Convertimos a grupos ordenados por nombre
  const grupos = [];
  for (const [oracleId, versionesRaw] of map.entries()) {
    // Orden dentro del grupo: primero por nombre de set, luego por collector_number
    const versiones = versionesRaw
      .slice()
      .sort((a, b) => {
        const aSet = (a.set_name || "").localeCompare(b.set_name || "", "es", { sensitivity: "base" });
        if (aSet !== 0) return aSet;
        return compareCollectorNumbers(a.collector_number, b.collector_number);
      })
      .map(v => {
        const setKey = `${v.set}__${v.lang}`;
        const st = getEstadoCarta(v.id);

        return {
          id: v.id, // UUID
          oracle_id: v.oracle_id,
          nombre: pickCardName(v, v.lang),     // en ES usa printed_name si existe
          nombreBase: v.name,                  // nombre “base”
          lang: v.lang,
          set: v.set,
          set_name: v.set_name,
          collector_number: v.collector_number,
          rareza: mapRarity(v.rarity),
          setKey,
          st
        };
      });

    // Título del grupo: intenta usar el nombre ES si existe una versión ES
    // Título del grupo: "ES / EN" si tenemos ambos
const esCard = versionesRaw.find(x => x.lang === "es" && x.printed_name);
const enCard = versionesRaw.find(x => x.lang === "en" && x.name);

const nombreES = esCard?.printed_name || null;
const nombreEN = enCard?.name || null;

// Evita "X / X" si son iguales (o si solo existe uno)
let titulo = nombreES || nombreEN || versionesRaw[0]?.name || "Carta";
if (nombreES && nombreEN) {
  const same = nombreES.trim().toLowerCase() === nombreEN.trim().toLowerCase();
  titulo = same ? nombreES : `${nombreES} / ${nombreEN}`;
}


    grupos.push({ oracleId, titulo, versiones });
  }

  grupos.sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" }));
  return grupos;
}


let catalogoSets = [];

let catalogoColecciones = [];     // lista lista para render
const setMetaByKey = new Map();   // key -> { key, code, nombre, lang, released_at }

function reconstruirCatalogoColecciones() {
  catalogoColecciones = [];
  setMetaByKey.clear();

  for (const s of (catalogoSets || [])) {
  for (const lang of ["en", "es"]) {
    const key = `${s.code}__${lang}`;

    const codeLower = String(s.code || "").toLowerCase();
    const nombreES = setNameEsByCode[codeLower];
    const nombreMostrar = (lang === "es" && nombreES) ? `${s.name} / ${nombreES}` : s.name;

    const entry = {
      key,
      code: s.code,
      nombre: nombreMostrar,
      lang,
      released_at: s.released_at || ""
    };

    catalogoColecciones.push(entry);
    setMetaByKey.set(key, entry);
  }
}


  // Orden: más recientes primero; si empatan, por nombre
  catalogoColecciones.sort((a, b) => {
    if (a.released_at !== b.released_at) return (b.released_at || "").localeCompare(a.released_at || "");
    return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
  });
}

const cacheCartasPorSetLang = {}; // key: "khm__es" -> array de cartas internas

async function ensureSetCardsLoaded(setKey) {
  if (cacheCartasPorSetLang[setKey]) return;

  const [code, lang] = setKey.split("__");

  // Descarga todas las cartas del set en ese idioma
  const cards = await scryGetCardsBySetAndLang(code, lang);

  // Mapeo al formato de tu app
  cacheCartasPorSetLang[setKey] = cards.map(card => ({
    id: card.id, // UUID string
    nombre: pickCardName(card, lang),
    numero: card.collector_number, // suele ser string ("123", "123a"...)
    rareza: mapRarity(card.rarity),
    lang,
    // opcional por si luego quieres detalle:
    _img: pickImage(card),
    _prices: card.prices || null,
    _colors: card.colors || null
  }));
}

const LS_HIDDEN_EMPTY_SETS = "mtg_hidden_empty_sets_v1";
let hiddenEmptySetKeys = new Set();

function cargarHiddenEmptySets() {
  const raw = localStorage.getItem(LS_HIDDEN_EMPTY_SETS);
  if (!raw) return;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) hiddenEmptySetKeys = new Set(arr);
  } catch {}
}

function guardarHiddenEmptySets() {
  localStorage.setItem(LS_HIDDEN_EMPTY_SETS, JSON.stringify([...hiddenEmptySetKeys]));
}

// ===============================
// MTGJSON (solo traducciones de sets)
// ===============================

const MTGJSON_SETLIST_URL = "https://mtgjson.com/api/v5/SetList.json";
const LS_SETNAME_ES_BY_CODE = "mtg_setname_es_by_code_v1";

let setNameEsByCode = {}; // { "ons": "Embestida", ... }

function cargarSetNameEsDesdeLocalStorage() {
  const raw = localStorage.getItem(LS_SETNAME_ES_BY_CODE);
  if (!raw) return false;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      setNameEsByCode = obj;
      return true;
    }
  } catch {}
  return false;
}

function guardarSetNameEsEnLocalStorage() {
  localStorage.setItem(LS_SETNAME_ES_BY_CODE, JSON.stringify(setNameEsByCode));
}

async function cargarSetNameEsDesdeMTGJSON() {
  // Si ya tenemos cache, no descargamos
  if (cargarSetNameEsDesdeLocalStorage()) return;

  const data = await fetch(MTGJSON_SETLIST_URL, { headers: { "Accept": "application/json" } })
    .then(r => {
      if (!r.ok) throw new Error(`MTGJSON ${r.status}`);
      return r.json();
    });

  const sets = data?.data || [];
  const map = {};

  for (const s of sets) {
    const code = String(s.code || "").toLowerCase();
    const esName = s?.translations?.Spanish; // <- clave exacta: "Spanish"
    if (code && esName) map[code] = esName;
  }

  setNameEsByCode = map;
  guardarSetNameEsEnLocalStorage();
}

// ===============================
// 3) Navegación de pantallas
// ===============================

const pantallas = {
  inicio: document.getElementById("pantallaInicio"),
  menu: document.getElementById("pantallaMenu"),
  colecciones: document.getElementById("pantallaColecciones"),
  set: document.getElementById("pantallaSet"),
  buscar: document.getElementById("pantallaBuscar"),
  estadisticas: document.getElementById("pantallaEstadisticas")
};

function mostrarPantalla(nombre) {
  Object.values(pantallas).forEach(p => p.classList.remove("active"));
  pantallas[nombre].classList.add("active");
}

// ===============================
// 4) Colecciones: filtro + lista + progreso
// ===============================

let filtroIdiomaColecciones = "all"; // "all" | "en" | "es"

let filtroTextoColecciones = ""; // texto del buscador

const LS_FILTERS_KEY = "mtg_colecciones_filtros_v1";


function setFiltroTextoColecciones(texto) {
  filtroTextoColecciones = (texto || "").trim().toLowerCase();
  guardarFiltrosColecciones();
  renderColecciones();
}


function progresoDeColeccion(setKey) {
  // Si aún no se ha cargado el set desde Scryfall, total desconocido
  if (!cacheCartasPorSetLang[setKey]) {
    return { tengo: 0, total: null };
  }

  const lista = cartasDeSetKey(setKey);
  const total = lista.length;
  const tengo = lista.filter(c => getEstadoCarta(c.id).qty > 0).length;
  return { tengo, total };
}



function setFiltroColecciones(lang) {
  filtroIdiomaColecciones = lang;
  document.querySelectorAll(".btn-filtro").forEach(b => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
  guardarFiltrosColecciones();
  renderColecciones();
}

function aplicarUIFiltrosColecciones() {
  document.querySelectorAll(".btn-filtro").forEach(b => {
    b.classList.toggle("active", b.dataset.lang === filtroIdiomaColecciones);
  });

  const inputBuscarCol = document.getElementById("inputBuscarColecciones");
  if (inputBuscarCol) inputBuscarCol.value = filtroTextoColecciones || "";
}



function renderColecciones() {
  const cont = document.getElementById("listaColecciones");

  let sets = obtenerColecciones();
  sets = sets.filter(s => !hiddenEmptySetKeys.has(s.key));

  if (filtroIdiomaColecciones !== "all") {
    sets = sets.filter(s => s.lang === filtroIdiomaColecciones);
  }

  if (filtroTextoColecciones) {
  sets = sets.filter(s => s.nombre.toLowerCase().includes(filtroTextoColecciones));
}

if (sets.length === 0) {
  cont.innerHTML = `<div class="card"><p>No hay colecciones que coincidan con el filtro.</p></div>`;
  return;
}

  let html = "";
  sets.forEach(s => {
    const { tengo, total } = progresoDeColeccion(s.key);

    html += `
      <div class="coleccion-item" data-setkey="${s.key}">
        <div>
          <strong>${s.nombre}</strong>
          <span class="lang-pill">${formatLang(s.lang)}</span>
        </div>
        <div class="badge">${tengo} / ${total === null ? "?" : total} cartas</div>
      </div>
    `;
  });

  cont.innerHTML = html;

  cont.querySelectorAll("[data-setkey]").forEach(item => {
    item.addEventListener("click", () => {
      abrirSet(item.dataset.setkey);
    });
  });
}

function guardarFiltrosColecciones() {
  const data = {
    lang: filtroIdiomaColecciones,
    texto: filtroTextoColecciones
  };
  localStorage.setItem(LS_FILTERS_KEY, JSON.stringify(data));
}

function cargarFiltrosColecciones() {
  const raw = localStorage.getItem(LS_FILTERS_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      if (data.lang === "all" || data.lang === "en" || data.lang === "es") {
        filtroIdiomaColecciones = data.lang;
      }
      if (typeof data.texto === "string") {
        filtroTextoColecciones = data.texto.trim().toLowerCase();
      }
    }
  } catch {
    // si está corrupto, lo ignoramos
  }
}

// ===============================
// 5) Set: lista de cartas + qty/foil/played/busco
// ===============================

let setActualKey = null;
let filtroTextoSet = "";
let filtroSoloFaltanSet = false;

function aplicarUIFiltrosSet() {
  const inp = document.getElementById("inputBuscarEnSet");
  if (inp) inp.value = filtroTextoSet || "";

  const chk = document.getElementById("chkSoloFaltanSet");
  if (chk) chk.checked = !!filtroSoloFaltanSet;
}

function setFiltroTextoSet(texto) {
  filtroTextoSet = (texto || "").trim().toLowerCase();
  if (setActualKey) renderTablaSet(setActualKey);
}

function setFiltroSoloFaltanSet(val) {
  filtroSoloFaltanSet = !!val;
  if (setActualKey) renderTablaSet(setActualKey);
}

function getListaSetFiltrada(setKey) {
  let lista = cartasDeSetKey(setKey)
    .sort((a, b) => compareCollectorNumbers(a.numero, b.numero));

  if (filtroTextoSet) {
    lista = lista.filter(c => c.nombre.toLowerCase().includes(filtroTextoSet));
  }

  if (filtroSoloFaltanSet) {
    lista = lista.filter(c => getEstadoCarta(c.id).qty === 0);
  }

  return lista;
}

async function abrirSet(setKey) {
  setActualKey = setKey;

  const info = setMetaByKey.get(setKey) || { nombre: "Set", lang: "en" };
  document.getElementById("tituloSet").textContent = `${info.nombre} (${formatLang(info.lang)})`;

  // UI rápida de “cargando”
  document.getElementById("progresoSet").textContent = "Cargando cartas...";
  document.getElementById("listaCartasSet").innerHTML = `<div class="card"><p>Cargando…</p></div>`;
  mostrarPantalla("set");

  try {
    await ensureSetCardsLoaded(setKey);
    if (cartasDeSetKey(setKey).length === 0) {
      hiddenEmptySetKeys.add(setKey);
guardarHiddenEmptySets();
renderColecciones(); // para que al volver ya no salga

  document.getElementById("progresoSet").textContent = "0 / 0";
  document.getElementById("listaCartasSet").innerHTML =
    `<div class="card"><p>No hay cartas para este set en este idioma.</p></div>`;
  return;
}

  } catch (err) {
    document.getElementById("listaCartasSet").innerHTML =
      `<div class="card"><p>Error cargando este set. Mira la consola.</p></div>`;
    console.error(err);
    return;
  }

  // Ya cargado: progreso real + tabla
  const { tengo, total } = progresoDeColeccion(setKey);
  document.getElementById("progresoSet").textContent = `Progreso: ${tengo} / ${total}`;

  aplicarUIFiltrosSet();
  renderTablaSet(setKey);

  mostrarPantalla("set");
}


function renderTablaSet(setKey) {
  const lista = getListaSetFiltrada(setKey);

  let html = `
    <table class="tabla">
      <thead>
        <tr>
          <th>Carta</th>
          <th>#</th>
          <th>Rareza</th>
          <th style="text-align:right;">Estado</th>
        </tr>
      </thead>
      <tbody>
  `;

  lista.forEach(c => {
    const st = getEstadoCarta(c.id);

    html += `
      <tr>
        <td>${c.nombre}</td>
        <td>${c.numero}</td>
        <td>${c.rareza}</td>
        <td>
          <div class="acciones-col">

            <div class="fila-accion">
              <span class="lbl">Cantidad</span>
              <div class="stepper">
                <button class="btn-step btn-qty-minus" data-id="${c.id}" ${st.qty <= 0 ? "disabled" : ""}>−</button>
                <input
                  type="number"
                  class="inp-num inp-qty"
                  data-id="${c.id}"
                  min="0"
                  max="999"
                  value="${st.qty}"
                />
                <button class="btn-step btn-qty-plus" data-id="${c.id}">+</button>
              </div>
            </div>

            <div class="fila-accion">
              <label class="chkline">
                <input type="checkbox" class="chk-foil" data-id="${c.id}" ${st.foil ? "checked" : ""} ${st.qty > 0 ? "" : "disabled"}>
                Foil
              </label>

              <label class="chkline">
                <input type="checkbox" class="chk-want" data-id="${c.id}" ${st.wantMore ? "checked" : ""}>
                Ri
              </label>
            </div>

            <div class="fila-accion">
              <span class="lbl">Played</span>
              <div class="stepper">
                <button class="btn-step btn-played-minus" data-id="${c.id}" ${st.playedQty <= 0 || st.qty === 0 ? "disabled" : ""}>−</button>
                <input
                  type="number"
                  class="inp-num inp-played"
                  data-id="${c.id}"
                  min="0"
                  max="${st.qty}"
                  value="${st.playedQty}"
                  ${st.qty === 0 ? "disabled" : ""}
                />
                <button class="btn-step btn-played-plus" data-id="${c.id}" ${st.qty === 0 || st.playedQty >= st.qty ? "disabled" : ""}>+</button>
              </div>
            </div>

          </div>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;

  const cont = document.getElementById("listaCartasSet");
  cont.innerHTML = html;

  // cantidad
  cont.querySelectorAll(".btn-qty-minus").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setQty(id, st.qty - 1);
      renderTablaSet(setActualKey);
      renderColecciones();
    });
  });

  cont.querySelectorAll(".btn-qty-plus").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setQty(id, st.qty + 1);
      renderTablaSet(setActualKey);
      renderColecciones();
    });
  });

  cont.querySelectorAll(".inp-qty").forEach(inp => {
    inp.addEventListener("change", () => {
      const id = inp.dataset.id;
      setQty(id, inp.value);
      renderTablaSet(setActualKey);
      renderColecciones();
    });
  });

  // played
  cont.querySelectorAll(".btn-played-minus").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setPlayedQty(id, st.playedQty - 1);
      renderTablaSet(setActualKey);
    });
  });

  cont.querySelectorAll(".btn-played-plus").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setPlayedQty(id, st.playedQty + 1);
      renderTablaSet(setActualKey);
    });
  });

  cont.querySelectorAll(".inp-played").forEach(inp => {
    inp.addEventListener("change", () => {
      const id = inp.dataset.id;
      setPlayedQty(id, inp.value);
      renderTablaSet(setActualKey);
    });
  });

  // foil / Ri
  cont.querySelectorAll(".chk-foil").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = chk.dataset.id;
      setFoil(id, chk.checked);
      renderTablaSet(setActualKey);
    });
  });

  cont.querySelectorAll(".chk-want").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = chk.dataset.id;
      setWantMore(id, chk.checked);
      renderTablaSet(setActualKey);
    });
  });
}


// ===============================
// 6) Buscar: por nombre + mostrar sets donde aparece y estado + botón Ir (set+idioma)
// ===============================

function buscarCartasPorNombre(texto) {
  const q = texto.trim().toLowerCase();
  if (!q) return [];

  const coincidencias = cartas.filter(c => c.nombre.toLowerCase().includes(q));

  const porNombre = new Map();
  coincidencias.forEach(c => {
    if (!porNombre.has(c.nombre)) porNombre.set(c.nombre, []);
    porNombre.get(c.nombre).push(c);
  });

  return [...porNombre.entries()].map(([nombre, versiones]) => ({
    nombre,
    versiones: versiones.sort((a, b) => {
      const n = a.coleccion.localeCompare(b.coleccion);
      if (n !== 0) return n;
      return getLangFromCard(a).localeCompare(getLangFromCard(b));
    })
  }));
}

async function renderResultadosBuscar(texto) {
  const cont = document.getElementById("resultadosBuscar");
  const q = (texto || "").trim();

  if (!cont) return;

  if (!q) {
    cont.innerHTML = `<div class="card"><p>Escribe un nombre y pulsa “Buscar”.</p></div>`;
    return;
  }

  cont.innerHTML = `<div class="card"><p>Buscando en Scryfall…</p></div>`;

  let cards = [];
  try {
    cards = await scrySearchPrintsByName(q);
  } catch (err) {
    console.error(err);
    cont.innerHTML = `<div class="card"><p>Error buscando. Mira la consola.</p></div>`;
    return;
  }

  const grupos = agruparResultadosBusqueda(cards);

  if (grupos.length === 0) {
    cont.innerHTML = `<div class="card"><p>No se encontraron cartas para: <strong>${q}</strong></p></div>`;
    return;
  }

  // Aviso si recortamos resultados
  const avisoLimit = (cards.length >= SEARCH_LIMIT)
    ? `<div class="card"><p class="hint">Nota: se muestran solo las primeras ${SEARCH_LIMIT} ediciones (hay más reimpresiones).</p></div>`
    : "";

  let html = avisoLimit;

  for (const g of grupos) {
    html += `<div class="card">
      <h3 style="margin-top:0;">${g.titulo}</h3>
      <div class="hint">Aparece en:</div>
      <ul class="lista-versiones">
    `;

    for (const v of g.versiones) {
      const qty = v.st.qty || 0;
      const tengoTxt = qty > 0 ? `✅ x${qty}` : `❌ 0`;
      const foilTxt = v.st.foil ? " · ✨ Foil" : "";
      const playedTxt = (v.st.playedQty || 0) > 0 ? ` · 🧱 Played x${v.st.playedQty}` : "";
      const riTxt = v.st.wantMore ? " · 🟣 Ri" : "";

      html += `
        <li class="item-version">
          <div class="item-version-main">
            <div>
              <strong>${v.set_name}</strong>
              <span class="lang-pill">${formatLang(v.lang)}</span>
              <span class="hint"> (#${v.collector_number}, ${v.rareza})</span>
              <div class="hint">${tengoTxt}${foilTxt}${playedTxt}${riTxt}</div>
            </div>
            <button class="btn-secundario btn-ir-set" type="button" data-setkey="${v.setKey}">Ir</button>
          </div>
        </li>
      `;
    }

    html += `</ul></div>`;
  }

  cont.innerHTML = html;

  // Botones "Ir"
  cont.querySelectorAll(".btn-ir-set").forEach(btn => {
    btn.addEventListener("click", async () => {
      const setKey = btn.dataset.setkey;

      // Por si lo ocultaste como “vacío” alguna vez, lo reactivamos
      if (typeof hiddenEmptySetKeys !== "undefined" && hiddenEmptySetKeys.has(setKey)) {
        hiddenEmptySetKeys.delete(setKey);
        if (typeof guardarHiddenEmptySets === "function") guardarHiddenEmptySets();
      }

      await abrirSet(setKey);
    });
  });
}


function exportarEstado() {
  const payload = {
    app: "MTG Colecciones",
    version: 1,
    exportedAt: new Date().toISOString(),
    estado
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  a.href = url;
  a.download = `mtg-coleccion-backup-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function validarPayloadImport(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, msg: "JSON inválido." };
  if (!payload.estado || typeof payload.estado !== "object") return { ok: false, msg: "Falta 'estado' en el JSON." };
  return { ok: true, msg: "" };
}

function importarEstadoDesdeTexto(jsonText) {
  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return { ok: false, msg: "No se pudo leer el JSON (formato inválido)." };
  }

  const v = validarPayloadImport(payload);
  if (!v.ok) return v;

  // Reemplazar
  estado = payload.estado;

  // Normalizar/migrar por si viene antiguo o incompleto
  migrarEstadoSiHaceFalta();

  // Guardar
  guardarEstado();

  // Refrescar UI (si estamos dentro de un set, lo reabrimos)
  if (typeof setActualKey !== "undefined" && setActualKey) {
    abrirSet(setActualKey);
  } else {
    renderColecciones();
  }

  return { ok: true, msg: "Importación completada." };
}


// ===============================
// 7) Inicialización (botones + pantallas)
// ===============================

function wireGlobalButtons() {
  // Entrar
  const btnEntrar = document.getElementById("btnEntrar");
  if (btnEntrar) {
    btnEntrar.addEventListener("click", () => mostrarPantalla("menu"));
  }

  // Botones del menú principal
  document.querySelectorAll(".btn-menu").forEach(btn => {
    btn.addEventListener("click", () => {
      const destino = btn.dataset.pantalla;

      if (destino === "colecciones") {
        aplicarUIFiltrosColecciones();
        renderColecciones();
        mostrarPantalla("colecciones");
        return;
      }

      if (destino === "buscar") {
        const inputBuscar = document.getElementById("inputBuscar");
        if (inputBuscar) inputBuscar.value = "";
        renderResultadosBuscar("");
        mostrarPantalla("buscar");
        return;
      }

      if (destino === "estadisticas") {
        mostrarPantalla("estadisticas");
        return;
      }
    });
    // Buscador dentro del SET
const inputBuscarEnSet = document.getElementById("inputBuscarEnSet");
if (inputBuscarEnSet) {
  inputBuscarEnSet.addEventListener("input", () => {
    setFiltroTextoSet(inputBuscarEnSet.value);
  });
}

const btnLimpiarBuscarEnSet = document.getElementById("btnLimpiarBuscarEnSet");
if (btnLimpiarBuscarEnSet && inputBuscarEnSet) {
  btnLimpiarBuscarEnSet.addEventListener("click", () => {
    inputBuscarEnSet.value = "";
    setFiltroTextoSet("");
    inputBuscarEnSet.focus();
  });
}

const chkSoloFaltanSet = document.getElementById("chkSoloFaltanSet");
if (chkSoloFaltanSet) {
  chkSoloFaltanSet.addEventListener("change", () => {
    setFiltroSoloFaltanSet(chkSoloFaltanSet.checked);
  });
}

  });

  // Volver al menú
  document.querySelectorAll("[data-action='volverMenu']").forEach(btn => {
    btn.addEventListener("click", () => mostrarPantalla("menu"));
  });

  // Volver a colecciones
  document.querySelectorAll("[data-action='volverColecciones']").forEach(btn => {
    btn.addEventListener("click", () => {
      aplicarUIFiltrosColecciones();
      renderColecciones();
      mostrarPantalla("colecciones");
    });
  });

  // Buscar cartas (botón)
  const btnBuscar = document.getElementById("btnBuscar");
if (btnBuscar) {
  btnBuscar.addEventListener("click", async () => {
    const inputBuscar = document.getElementById("inputBuscar");
    const texto = inputBuscar ? inputBuscar.value : "";
    await renderResultadosBuscar(texto);
  });
}

  // Buscar cartas (Enter)
  const inputBuscar = document.getElementById("inputBuscar");
if (inputBuscar) {
  inputBuscar.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await renderResultadosBuscar(inputBuscar.value);
    }
  });
}

  // Filtro de idioma en Colecciones
  document.querySelectorAll(".btn-filtro").forEach(btn => {
    btn.addEventListener("click", () => {
      setFiltroColecciones(btn.dataset.lang);
    });
  });

  // Buscador de colecciones (input)
  const inputBuscarCol = document.getElementById("inputBuscarColecciones");
  if (inputBuscarCol) {
    inputBuscarCol.addEventListener("input", () => {
      setFiltroTextoColecciones(inputBuscarCol.value);
    });
  }

  // Botón ✕ limpiar colecciones
  const btnLimpiarCol = document.getElementById("btnLimpiarColecciones");
  if (btnLimpiarCol && inputBuscarCol) {
    btnLimpiarCol.addEventListener("click", () => {
      inputBuscarCol.value = "";
      setFiltroTextoColecciones("");
      inputBuscarCol.focus();
    });
  }
}

function wireBackupButtons() {
  const btnExportar = document.getElementById("btnExportarEstado");
  const btnImportar = document.getElementById("btnImportarEstado");
  const inputImportar = document.getElementById("inputImportarEstado");
  const msgBackup = document.getElementById("msgBackup");

  if (btnExportar) {
    btnExportar.addEventListener("click", () => {
      exportarEstado();
      if (msgBackup) msgBackup.textContent = "Exportación lista (archivo descargado).";
    });
  }

  if (btnImportar && inputImportar) {
    btnImportar.addEventListener("click", () => {
      inputImportar.value = ""; // permite importar el mismo archivo 2 veces
      inputImportar.click();
    });

    inputImportar.addEventListener("change", () => {
      const file = inputImportar.files && inputImportar.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const res = importarEstadoDesdeTexto(String(reader.result || ""));
        if (msgBackup) msgBackup.textContent = res.ok ? res.msg : `Error: ${res.msg}`;
      };
      reader.readAsText(file);
    });
  }
}

async function init() {
  cargarEstado();
  cargarFiltrosColecciones();
  wireGlobalButtons();
  wireBackupButtons();
  cargarHiddenEmptySets();

  try {
    // 1) Sets (Scryfall)
    catalogoSets = await scryGetSets();
    console.log("Sets cargados:", catalogoSets.length);

    // 2) Traducciones ES (MTGJSON) - opcional
    try {
      await cargarSetNameEsDesdeMTGJSON();
      console.log("Traducciones ES cargadas:", Object.keys(setNameEsByCode).length);
    } catch (err) {
      console.warn("No se pudieron cargar traducciones de MTGJSON:", err);
    }

    // 3) Reconstruir catálogo para la UI
    reconstruirCatalogoColecciones();

  } catch (err) {
    console.error("Error cargando sets de Scryfall:", err);
  }

  renderResultadosBuscar("");
}

init();



