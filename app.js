// ===============================
// 1) Datos de ejemplo (AHORA con lang: "en" / "es")
// ===============================

const cartas = [];

// === SUPABASE (Auth + Sync) ===
const SUPABASE_URL = "https://slvpktkrfbsxwagibfjx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdnBrdGtyZmJzeHdhZ2liZmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE3MTQsImV4cCI6MjA4MTk4NzcxNH0.-U3ijfDUuSFNKG2001QBzSH3pGlgYXLT2Z8TCRvV6rM";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


function getEmailRedirectTo() {
  // En GH Pages forzamos la URL final “limpia”
  if (location.hostname.endsWith("github.io")) {
    return "https://uralsky87.github.io/mtg-colecciones/";
  }
  // En local (Live Server) usamos la actual
  return location.origin + location.pathname;
}


const SB_TABLE = "mtg_user_data";

let sbUser = null;
let sbDirty = false;
let sbAutoSaveTimer = null;
let sbKnownCloudUpdatedAt = null;
let sbLoginInFlight = false;
let sbPullInFlight = false;
let sbExchangeInFlight = false;
let sbJustExchanged = false;

function uiSetSyncStatus(msg) {
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = msg || "";
}

function sbUpdateAuthUI() {
  const inputEmail = document.getElementById("inputEmail");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const btnSyncNow = document.getElementById("btnSyncNow");   // Actualizar
  const btnPushNow = document.getElementById("btnPushNow");   // Guardar

  if (sbUser) {
    if (inputEmail) inputEmail.value = sbUser.email || "";
    if (btnLogin) btnLogin.disabled = true;
    if (btnLogout) btnLogout.style.display = "inline-block";
    if (btnSyncNow) btnSyncNow.disabled = false;
    if (btnPushNow) btnPushNow.disabled = false;
    uiSetSyncStatus(`Conectado como ${sbUser.email || "usuario"} ✅`);
  } else {
    if (btnLogin) btnLogin.disabled = false;
    if (btnLogout) btnLogout.style.display = "none";
    if (btnSyncNow) btnSyncNow.disabled = true;
    if (btnPushNow) btnPushNow.disabled = true;
    uiSetSyncStatus("No has iniciado sesión.");
  }
}

function sbBuildCloudPayload() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    estado: estado || {},
    progresoPorSet: progresoPorSet || {},
    hiddenEmptySetKeys: [...(hiddenEmptySetKeys || new Set())],
    filtros: {
      filtroIdiomaColecciones: filtroIdiomaColecciones ?? "all",
      filtroTextoColecciones: filtroTextoColecciones ?? "",
      filtroTipoSet: filtroTipoSet ?? "all",
      ocultarTokens: !!ocultarTokens,
      ocultarArte: !!ocultarArte
    }
  };
}

function sbApplyCloudPayload(payload) {
  if (!payload || typeof payload !== "object") return;

  if (payload.estado && typeof payload.estado === "object") {
    estado = payload.estado;
    migrarEstadoSiHaceFalta();
    guardarEstado();
  }

  if (payload.progresoPorSet && typeof payload.progresoPorSet === "object") {
    progresoPorSet = payload.progresoPorSet;
    guardarProgresoPorSet();
  }

  if (Array.isArray(payload.hiddenEmptySetKeys)) {
    hiddenEmptySetKeys = new Set(payload.hiddenEmptySetKeys);
    guardarHiddenEmptySets();
  }

  const f = payload.filtros || {};
  if (typeof f.filtroIdiomaColecciones === "string") filtroIdiomaColecciones = f.filtroIdiomaColecciones;
  if (typeof f.filtroTextoColecciones === "string") filtroTextoColecciones = f.filtroTextoColecciones;
  if (typeof f.filtroTipoSet === "string") filtroTipoSet = f.filtroTipoSet;
  if (typeof f.ocultarTokens === "boolean") ocultarTokens = f.ocultarTokens;
  if (typeof f.ocultarArte === "boolean") ocultarArte = f.ocultarArte;

  renderColecciones();
  if (setActualKey) renderTablaSet(setActualKey);
}

async function sbLoginWithEmail(email) {
  if (sbLoginInFlight) return;
  sbLoginInFlight = true;

  const btnLogin = document.getElementById("btnLogin");
  if (btnLogin) btnLogin.disabled = true;

  try {
    const clean = String(email || "").trim();
    if (!clean) { uiSetSyncStatus("Escribe un email."); return; }

    uiSetSyncStatus("Enviando enlace al email…");

    const { error } = await supabaseClient.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: getEmailRedirectTo() }
    });

    if (error) {
      console.error(error);
      uiSetSyncStatus("Error enviando enlace (mira consola).");
      return;
    }

    uiSetSyncStatus("Mira tu email y pulsa el enlace para entrar ✅");
  } finally {
    sbLoginInFlight = false;
    if (btnLogin) btnLogin.disabled = false;
  }
}

async function sbGetCloudMeta() {
  const { data, error } = await supabaseClient
    .from(SB_TABLE)
    .select("updated_at")
    .eq("user_id", sbUser.id)
    .maybeSingle();

  if (error) throw error;
  return data?.updated_at || null;
}

async function sbPullNow() {
  // ✅ Evita 2 descargas a la vez (muy importante con 2 pestañas o clicks dobles)
  if (sbPullInFlight) return;
  sbPullInFlight = true;

  try {
    if (!sbUser?.id) { uiSetSyncStatus("Inicia sesión primero."); return; }

    uiSetSyncStatus("Descargando desde la nube…");

    const { data, error } = await supabaseClient
      .from(SB_TABLE)
      .select("data, updated_at")
      .eq("user_id", sbUser.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      uiSetSyncStatus("Error descargando (mira consola).");
      return;
    }

    // Primera vez: nube vacía
    if (!data) {
      sbKnownCloudUpdatedAt = null;
      uiSetSyncStatus("Nube vacía. Pulsa “Guardar cambios” para subir tu colección por primera vez.");
      return;
    }

    sbKnownCloudUpdatedAt = data.updated_at || null;
    sbApplyCloudPayload(data.data || {});
    sbDirty = false;

    uiSetSyncStatus("Descargado ✅");
  } finally {
    sbPullInFlight = false;
  }
}

async function sbPushNow() {
  if (!sbUser?.id) { uiSetSyncStatus("Inicia sesión primero."); return; }
  if (!sbDirty) { uiSetSyncStatus("No hay cambios que guardar."); return; }

  // Anti-pisado
  let cloudUpdatedAt = null;
  try { cloudUpdatedAt = await sbGetCloudMeta(); } catch {}

  if (sbKnownCloudUpdatedAt && cloudUpdatedAt && cloudUpdatedAt > sbKnownCloudUpdatedAt) {
    uiSetSyncStatus("⚠️ La nube tiene cambios de otro dispositivo. Pulsa “Actualizar” antes de guardar.");
    return;
  }

  uiSetSyncStatus("Subiendo a la nube…");

  const payload = sbBuildCloudPayload();
  const { error } = await supabaseClient
    .from(SB_TABLE)
    .upsert({ user_id: sbUser.id, data: payload }, { onConflict: "user_id" });

  if (error) {
    console.error(error);
    uiSetSyncStatus("Error subiendo (mira consola).");
    return;
  }

  sbDirty = false;

  // refrescar meta
  try { sbKnownCloudUpdatedAt = await sbGetCloudMeta(); } catch {}

  uiSetSyncStatus("Guardado ✅");
}

function sbStartAutoSave() {
  sbStopAutoSave();
  sbAutoSaveTimer = setInterval(async () => {
    if (!sbUser?.id) return;
    if (!sbDirty) return;
    await sbPushNow();
  }, 30000);
}

function sbStopAutoSave() {
  if (sbAutoSaveTimer) {
    clearInterval(sbAutoSaveTimer);
    sbAutoSaveTimer = null;
  }
}

async function sbLogout() {
  await supabaseClient.auth.signOut();
  // onAuthStateChange se encargará de UI
}

let sbInitDone = false;

async function sbCompleteMagicLinkIfPresent() {
  if (sbExchangeInFlight) return;
  sbExchangeInFlight = true;

  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;

    uiSetSyncStatus("Completando inicio de sesión…");

    const { error } = await supabaseClient.auth.exchangeCodeForSession(code);

    if (error) {
      // Si se abrió 2 veces, el code puede estar "used/invalid" en la segunda pestaña.
      console.error("exchangeCodeForSession:", error);

      // En vez de quedarnos "colgados", lo tratamos como "ya se completó en otra pestaña"
      uiSetSyncStatus("Login ya completado en otra pestaña. Actualizando sesión…");
    } else {
      sbJustExchanged = true;
      setTimeout(() => { sbJustExchanged = false; }, 1500);
    }

    // Limpia ?code=... para que al refrescar no lo reintente
    url.searchParams.delete("code");
    window.history.replaceState({}, document.title, url.toString());
  } finally {
    sbExchangeInFlight = false;
  }
}

function onClickOnce(el, handler) {
  if (!el) return;
  if (el.dataset.wired === "1") return;
  el.dataset.wired = "1";
  el.addEventListener("click", handler);
}

function sbMarkDirty() {
  sbDirty = true;
  uiSetSyncStatus("Cambios sin guardar…");
}

async function sbInit() {
  await sbCompleteMagicLinkIfPresent();
  // Evita doble init (y doble wiring) si por lo que sea se llama 2 veces
  if (sbInitDone) return;
  sbInitDone = true;
  
  // 1) sesión actual al cargar
  const { data } = await supabaseClient.auth.getSession();
  sbUser = data?.session?.user || null;
  sbUpdateAuthUI();

  // 2) wire botones (una sola vez)
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const btnSyncNow = document.getElementById("btnSyncNow");   // "Actualizar"
  const btnPushNow = document.getElementById("btnPushNow");   // "Guardar cambios"
  const inputEmail = document.getElementById("inputEmail");

  onClickOnce(btnLogin, async () => {
    await sbLoginWithEmail(inputEmail ? inputEmail.value : "");
  });

  onClickOnce(btnLogout, sbLogout);

  // ✅ Actualizar desde nube
  onClickOnce(btnSyncNow, sbPullNow);

  // ✅ Guardar a nube
  onClickOnce(btnPushNow, sbPushNow);

  // 3) Si ya estaba logueado, hacemos pull y arrancamos autosave
  if (sbUser) {
    await sbPullNow();        // PULL
    sbStartAutoSave();        // autosave cada 30s si hay cambios
  } else {
    sbStopAutoSave();
  }

  // 4) escuchar cambios de sesión (login/logout) (solo una vez)
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    sbUser = session?.user || null;
    sbUpdateAuthUI();

    if (sbUser) {
      await sbPullNow();      // PULL automático al loguear
      sbStartAutoSave();      // empieza autosave
    } else {
      sbStopAutoSave();       // parar autosave al desloguear
      sbDirty = false;        // opcional
    }
  });

  // 5) Cuando una pestaña termina el login, otras pestañas reciben un "storage event"
  // Aseguramos que este listener no se registra 2 veces.
  if (!window.__sbStorageWired) {
    window.__sbStorageWired = true;

    window.addEventListener("storage", async (e) => {
      const k = String(e.key || "");
      if (!k) return;

      if (k.includes("supabase") || k.includes("auth-token")) {
        const { data } = await supabaseClient.auth.getSession();
        sbUser = data?.session?.user || null;
        sbUpdateAuthUI();

        if (sbUser) await sbPullNow();
      }
    });
  }
}

function sbStartAutoSave() {
  sbStopAutoSave();
  sbAutoSaveTimer = setInterval(async () => {
    if (!sbUser?.id) return;
    if (!sbDirty) return;
    await sbPushNow(); // usa la protección anti-pisado
  }, 30000);
}

function sbStopAutoSave() {
  if (sbAutoSaveTimer) {
    clearInterval(sbAutoSaveTimer);
    sbAutoSaveTimer = null;
  }
}

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

function formatMesAnyo(released_at) {
  if (!released_at) return "";
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  // released_at viene como "YYYY-MM-DD"
  const [y, m] = String(released_at).split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return y ? y : "";
  return `${months[mi]} ${y}`;
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

let catalogoListo = false;      // <- cuando termine init, pasa a true
let catalogoError = "";         // <- opcional, para mostrar error bonito

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
  if (Array.isArray(catalogoColecciones) && catalogoColecciones.length > 0) {
    return catalogoColecciones;
  }
  return [];
}

function cartasDeSetKey(setKey) {
  return cacheCartasPorSetLang[setKey] || [];
}

const LS_SET_PROGRESS = "mtg_set_progress_v1";
let progresoPorSet = {}; // { "khm__en": { total: 286, tengo: 12 }, ... }

function cargarProgresoPorSet() {
  const raw = localStorage.getItem(LS_SET_PROGRESS);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") progresoPorSet = obj;
  } catch {}
}

function guardarProgresoPorSet() {
  localStorage.setItem(LS_SET_PROGRESS, JSON.stringify(progresoPorSet));
  sbMarkDirty(); 
}

function actualizarProgresoGuardado(setKey) {
  const lista = cacheCartasPorSetLang[setKey];
  if (!lista) return; // si no hay cartas cargadas, no podemos calcular total

  const total = lista.length;
  const tengo = lista.filter(c => getEstadoCarta(c.id).qty > 0).length;

  progresoPorSet[setKey] = { total, tengo, updatedAt: Date.now() };
  guardarProgresoPorSet();
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
  if (!raw) {
    estado = {};
    return;
  }

  try {
    estado = JSON.parse(raw) || {};
  } catch (e) {
    console.warn("Estado corrupto en localStorage, se reinicia:", e);
    estado = {};
  }

  migrarEstadoSiHaceFalta();
}

function guardarEstado() {
  localStorage.setItem(LS_KEY, JSON.stringify(estado));
  if (typeof sbMarkDirty === "function") sbMarkDirty();
}

function normalizarEstadoCarta(st) {
  const qty = clampInt(Number(st.qty ?? 0), 0, 999);
  const playedQty = clampInt(Number(st.playedQty ?? 0), 0, qty);
  const foil = qty > 0 ? !!st.foil : false;
  const wantMore = !!st.wantMore;

  return { qty, foil, playedQty, wantMore };
}

function ensureEstadoCarta(id) {
  const key = String(id);
  if (!estado[key]) {
    estado[key] = { qty: 0, foil: false, playedQty: 0, wantMore: false };
  }
  return estado[key];
}

function getEstadoCarta(id) {
  const key = String(id);
  const st = estado[key];

  // OJO: si no existe, devolvemos un default EN MEMORIA, sin guardarlo
  if (!st) return { qty: 0, foil: false, playedQty: 0, wantMore: false };

  // Si existe, lo normalizamos (sin guardar automáticamente)
  const norm = normalizarEstadoCarta(st);
  estado[key] = norm;
  return norm;
}


function setQty(id, value) {
  const st = ensureEstadoCarta(id);
  const qty = clampInt(Number(value), 0, 999);

  st.qty = qty;

  if (st.playedQty > st.qty) st.playedQty = st.qty;
  if (st.qty === 0) {
    st.foil = false;
    st.playedQty = 0;
  }
  guardarEstado();
  sbMarkDirty(); 
}

function setPlayedQty(id, value) {
  const st = ensureEstadoCarta(id);
  st.playedQty = clampInt(Number(value), 0, st.qty);
  guardarEstado();
  sbMarkDirty(); 
}

function setFoil(id, value) {
  const st = ensureEstadoCarta(id);
  st.foil = st.qty > 0 ? !!value : false;
  guardarEstado();
  sbMarkDirty(); 
}

function setWantMore(id, value) {
  const st = ensureEstadoCarta(id);
  st.wantMore = !!value;
  guardarEstado();
  sbMarkDirty(); 
}


// ===============================
// Scryfall (API) - capa de datos
// ===============================

const SCY_BASE = "https://api.scryfall.com";
const SCY_MIN_DELAY_MS = 120; // ~8-10 req/seg con margen

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

  // Leemos UNA vez el body para evitar "body already used"
  const text = await res.text().catch(() => "");
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
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
  const l = (lang || "en").toLowerCase();
  // En no-inglés, Scryfall suele rellenar printed_name
  return (l !== "en" && card.printed_name) ? card.printed_name : card.name;
}

function pickImage(card) {
  if (card?.image_uris?.normal) return card.image_uris.normal;
  if (Array.isArray(card?.card_faces) && card.card_faces[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
  return null;
}

// --- API calls ---
async function scryGetSets() {
  const data = await scryFetchJson(`${SCY_BASE}/sets`);
  return data.data || [];
}

async function scryGetCardsBySetAndLang(setCode, lang) {
  const code = String(setCode || "").toLowerCase();
  const l = String(lang || "en").toLowerCase();

  // Solo papel
  const q = encodeURIComponent(`game:paper set:${code} lang:${l}`);
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

function buildNameQuery(qUser) {
  // Si hay espacios, comillas. También quitamos comillas del usuario.
  const safe = String(qUser || "").replace(/"/g, "").trim();
  if (!safe) return "";
  return /\s/.test(safe) ? `name:"${safe}"` : `name:${safe}`;
}

async function scrySearchPrintsByName(texto) {
  const qUser = (texto || "").trim();
  if (!qUser) return [];

  const nameClause = buildNameQuery(qUser);
  if (!nameClause) return [];

  // Solo papel, solo EN/ES, y búsqueda flexible por nombre
  const query = `game:paper (lang:en or lang:es) ${nameClause}`;
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

  for (const card of (cards || [])) {
    const lang = String(card.lang || "").toLowerCase();
    if (!SEARCH_LANGS.includes(lang)) continue;

    const key = card.oracle_id || card.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }

  const grupos = [];

  for (const [oracleId, versionesRaw] of map.entries()) {
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
          _img: pickImage(v),
          _prices: v.prices || null,
          nombre: pickCardName(v, v.lang),
          nombreBase: v.name,
          lang: v.lang,
          set: v.set,
          set_name: v.set_name,
          collector_number: v.collector_number,
          rareza: mapRarity(v.rarity),
          setKey,
          st
        };
      });

    // Título del grupo: "ES / EN" si tenemos ambos
    const esCard = versionesRaw.find(x => x.lang === "es" && x.printed_name);
    const enCard = versionesRaw.find(x => x.lang === "en" && x.name);

    const nombreES = esCard?.printed_name || null;
    const nombreEN = enCard?.name || null;

    let titulo = nombreES || nombreEN || versionesRaw[0]?.name || "Carta";
    if (nombreES && nombreEN) {
      const same = nombreES.trim().toLowerCase() === nombreEN.trim().toLowerCase();
      titulo = same ? nombreES : `${nombreES} / ${nombreEN}`;
    }

    // Imagen para el título (la primera que tenga imagen)
    const cardForImg =
      versionesRaw.find(x => x.image_uris || x.card_faces) ||
      versionesRaw[0] ||
      null;

    const img = cardForImg ? pickImage(cardForImg) : null;

    grupos.push({ oracleId, titulo, versiones, img });
  }

  grupos.sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" }));
  return grupos;
}

// ===============================
// Catálogo sets (Scryfall) + caché cartas por set/idioma
// ===============================

let catalogoSets = [];
let catalogoColecciones = [];     // lista lista para render
const setMetaByKey = new Map();   // key -> entry (base)

function reconstruirCatalogoColecciones() {
  catalogoColecciones = [];
  setMetaByKey.clear();

  for (const s of (catalogoSets || [])) {
    const code = String(s.code || "").toLowerCase();
    const codeLower = code;

    const nombreES = setNameEsByCode[codeLower] || null;
    const nombreMostrar = nombreES ? `${s.name} / ${nombreES}` : s.name;

    const entry = {
      key: code,               // base key = code
      code: code,
      nombre: nombreMostrar,
      name_en: s.name,
      name_es: nombreES,
      released_at: s.released_at || "",
      set_type: s.set_type || ""
    };

    catalogoColecciones.push(entry);

    // Meta para los 2 idiomas (abrirSet usa `${code}__en/es`)
    setMetaByKey.set(`${code}__en`, entry);
    setMetaByKey.set(`${code}__es`, entry);
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

  const [codeRaw, langRaw] = String(setKey).split("__");
  const code = String(codeRaw || "").toLowerCase();
  const lang = String(langRaw || "en").toLowerCase();

  const cards = await scryGetCardsBySetAndLang(code, lang);

  cacheCartasPorSetLang[setKey] = cards.map(card => ({
    id: card.id, // UUID string
    nombre: pickCardName(card, lang),
    numero: card.collector_number,
    rareza: mapRarity(card.rarity),
    lang,
    _img: pickImage(card),
    _prices: card.prices || null,
    _colors: card.colors || null
  }));

  // Guardar resumen (total/tengo) para que no vuelva a 0/? al reiniciar
  actualizarProgresoGuardado(setKey);
}

async function refrescarPreciosSetActual() {
  if (!setActualKey) return;

  const btn = document.getElementById("btnActualizarPrecios");
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Actualizando…";
    }

    // Si lo marcaste como vacío en el pasado, lo “des-ocultamos” antes de reintentar
    if (typeof hiddenEmptySetKeys !== "undefined" && hiddenEmptySetKeys.has(setActualKey)) {
      hiddenEmptySetKeys.delete(setActualKey);
      if (typeof guardarHiddenEmptySets === "function") guardarHiddenEmptySets();
    }

    // 1) invalidar caché SOLO de este set/idioma (fuerza re-descarga desde Scryfall)
    if (cacheCartasPorSetLang && cacheCartasPorSetLang[setActualKey]) {
      delete cacheCartasPorSetLang[setActualKey];
    }

    // 2) volver a abrir el set (esto vuelve a llamar a ensureSetCardsLoaded y trae precios nuevos)
    await abrirSet(setActualKey);

  } catch (err) {
    console.error("Error actualizando precios:", err);
    alert("No se pudieron actualizar los precios. Mira la consola.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "⟳ Precios";
    }
  }
}

// ===============================
// Ocultar sets vacíos (persistente)
// ===============================

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
  if (typeof sbMarkDirty === "function") sbMarkDirty();
}

// ===============================
// Modal carta + precio
// ===============================

function abrirModalCarta({ titulo, imageUrl, numero, rareza, precio }) {
  const modal = document.getElementById("modalCarta");
  const tit = document.getElementById("modalCartaTitulo");
  const body = document.getElementById("modalCartaBody");

  if (!modal || !tit || !body) return;

  tit.textContent = titulo || "Carta";

  const infoBits = [];
  if (numero) infoBits.push(`#${numero}`);
  if (rareza) infoBits.push(rareza);
  const infoLinea = infoBits.length ? infoBits.join(" · ") : "";

  const precioTxt = precio || "—";

  body.innerHTML = `
    <div class="card" style="margin-bottom:12px;">
      ${infoLinea ? `<div><strong>${infoLinea}</strong></div>` : ""}
      <div class="hint" style="margin-top:6px;">Precio orientativo: ${precioTxt}</div>
    </div>
    ${imageUrl ? `<img src="${imageUrl}" alt="${titulo || "Carta"}" loading="lazy" />`
              : `<div class="card"><p>No hay imagen disponible.</p></div>`}
  `;

  modal.classList.remove("hidden");
}

function cerrarModalCarta() {
  const modal = document.getElementById("modalCarta");
  if (modal) modal.classList.add("hidden");
}

function formatPrecioEUR(prices) {
  if (!prices) return "—";

  const eur = prices.eur || null;
  const eurFoil = prices.eur_foil || null;

  if (eur && eurFoil) return `€${eur} · Foil €${eurFoil}`;
  if (eur) return `€${eur}`;
  if (eurFoil) return `Foil €${eurFoil}`;

  const usd = prices.usd || null;
  const usdFoil = prices.usd_foil || null;
  if (usd && usdFoil) return `$${usd} · Foil $${usdFoil}`;
  if (usd) return `$${usd}`;
  if (usdFoil) return `Foil $${usdFoil}`;

  return "—";
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
    const esName = s?.translations?.Spanish; // clave: "Spanish"
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
  estadisticas: document.getElementById("pantallaEstadisticas"),
  cuenta: document.getElementById("pantallaCuenta") // <- AÑADE ESTA
};

function mostrarPantalla(nombre) {
  Object.values(pantallas).forEach(p => {
    if (p) p.classList.remove("active");
  });
  if (pantallas[nombre]) pantallas[nombre].classList.add("active");
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
  // Si está cargado en memoria esta sesión
  if (cacheCartasPorSetLang[setKey]) {
    const lista = cartasDeSetKey(setKey);
    const total = lista.length;
    const tengo = lista.filter(c => getEstadoCarta(c.id).qty > 0).length;
    return { tengo, total };
  }

  // Si no está cargado, intenta usar el resumen guardado
  const saved = progresoPorSet[setKey];
  if (saved && typeof saved.total === "number") {
    return { tengo: saved.tengo || 0, total: saved.total };
  }

  // Si no sabemos nada todavía
  return { tengo: 0, total: null };
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

// ===============================
// Filtros de tipo (UI Colecciones)
// ===============================
let ocultarTokens = false;
let ocultarArte = false;
let filtroTipoSet = "all"; // "all" | "expansion" | ... | "other"

function aplicarUIFiltrosTipo() {
  const bTok = document.getElementById("btnToggleTokens");
  const bArt = document.getElementById("btnToggleArte");
  const sel = document.getElementById("selTipoSet");

  if (bTok) bTok.classList.toggle("active", ocultarTokens);
  if (bArt) bArt.classList.toggle("active", ocultarArte);
  if (sel) sel.value = filtroTipoSet;
}

function renderColecciones() {
  const cont = document.getElementById("listaColecciones");
  if (!cont) return;

  if (!catalogoListo) {
    cont.innerHTML = `<div class="card"><p>Cargando colecciones…</p></div>`;
    return;
  }

  if (catalogoError) {
    cont.innerHTML = `<div class="card"><p>Error cargando colecciones: ${catalogoError}</p></div>`;
    return;
  }

  let sets = obtenerColecciones();

  // filtro tipo set
  if (filtroTipoSet && filtroTipoSet !== "all") {
    if (filtroTipoSet === "other") {
      const allowed = new Set(["expansion","core","commander","masters","promo","token","memorabilia"]);
      sets = sets.filter(s => !allowed.has((s.set_type || "").toLowerCase()));
    } else {
      sets = sets.filter(s => (s.set_type || "").toLowerCase() === filtroTipoSet);
    }
  }

  // ocultar tokens/arte
  if (ocultarTokens) sets = sets.filter(s => (s.set_type || "").toLowerCase() !== "token");

  if (ocultarArte) {
    sets = sets.filter(s => {
      const t = (s.set_type || "");
      const n = (s.nombre || "").toLowerCase();
      const porTipo = (t === "art_series");
      const porNombre = n.includes("art series") || n.includes("art card") || n.includes("art cards");
      return !(porTipo || porNombre);
    });
  }

  // ocultar sets vacíos (si ambos idiomas están marcados vacíos)
  sets = sets.filter(s => {
    const enKey = `${s.code}__en`;
    const esKey = `${s.code}__es`;
    return !(hiddenEmptySetKeys.has(enKey) && hiddenEmptySetKeys.has(esKey));
  });

  // filtro texto
  if (filtroTextoColecciones) {
    sets = sets.filter(s => (s.nombre || "").toLowerCase().includes(filtroTextoColecciones));
  }

  if (sets.length === 0) {
    cont.innerHTML = `<div class="card"><p>No hay colecciones que coincidan con el filtro.</p></div>`;
    return;
  }

  let html = "";
  for (const s of sets) {
    const pEn = progresoDeColeccion(`${s.code}__en`);
    const pEs = progresoDeColeccion(`${s.code}__es`);

    const totalEnTxt = (pEn.total === null ? "?" : pEn.total);
    const totalEsTxt = (pEs.total === null ? "?" : pEs.total);

    const fechaTxt = formatMesAnyo(s.released_at);

    html += `
      <div class="coleccion-item" data-code="${s.code}">
        <div class="coleccion-titulo">
          <strong>${s.nombre}</strong>
          ${fechaTxt ? `<span class="set-date">${fechaTxt}</span>` : ""}
        </div>
        <div class="badge">EN ${pEn.tengo}/${totalEnTxt} · ES ${pEs.tengo}/${totalEsTxt}</div>
      </div>
    `;
  }

  cont.innerHTML = html;

  cont.querySelectorAll("[data-code]").forEach(item => {
    item.addEventListener("click", () => {
      const code = item.dataset.code;
      abrirSet(`${code}__en`);
    });
  });
}

function guardarFiltrosColecciones() {
  const data = {
    lang: filtroIdiomaColecciones,
    texto: filtroTextoColecciones
  };
  localStorage.setItem(LS_FILTERS_KEY, JSON.stringify(data));
  sbMarkDirty(); // <-- AÑADIR
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

let setActualCode = null;
let setActualLang = "en";

function aplicarUILangSet() {
  const btnEn = document.getElementById("btnSetLangEn");
  const btnEs = document.getElementById("btnSetLangEs");

  if (btnEn) btnEn.classList.toggle("active", setActualLang === "en");
  if (btnEs) btnEs.classList.toggle("active", setActualLang === "es");

  // Si existe tu mapa de “no existe ES”, puedes desactivar aquí (opcional, lo dejamos simple por ahora)
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

  const [code, lang] = setKey.split("__");
setActualCode = code;
setActualLang = lang || "en";
aplicarUILangSet();

  const info = setMetaByKey.get(setKey) || { nombre: "Set", lang: "en" };
  document.getElementById("tituloSet").textContent = `${info.nombre} (${formatLang(setActualLang)})`;

  // UI rápida de “cargando”
  document.getElementById("progresoSet").textContent = "Cargando cartas...";
  document.getElementById("listaCartasSet").innerHTML = `<div class="card"><p>Cargando…</p></div>`;
  mostrarPantalla("set");

  try {
    await ensureSetCardsLoaded(setKey);
    actualizarProgresoGuardado(setKey);
    renderColecciones();
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
    <th>Precio</th>
    <th style="text-align:right;">Estado</th>
  </tr>
</thead>
      <tbody>
  `;

  lista.forEach(c => {
    const st = getEstadoCarta(c.id);

    html += `
      <tr>
        <td>
  <button
    class="btn-link-carta"
    type="button"
    data-accion="ver-carta-set"
    data-id="${c.id}"
  >
    ${c.nombre}
  </button>
</td>
        <td>${c.numero}</td>
<td>${c.rareza}</td>
<td class="precio-cell">${formatPrecioEUR(c._prices)}</td>
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
  cont.querySelectorAll("[data-accion='ver-carta-set']").forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.id;
    const carta = (cacheCartasPorSetLang[setKey] || []).find(x => x.id === id);

    abrirModalCarta({
      titulo: carta?.nombre || "Carta",
      imageUrl: carta?._img || null,
      numero: carta?.numero || "",
      rareza: carta?.rareza || "",
      precio: formatPrecioEUR(carta?._prices)
    });
  });
});


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

  const avisoLimit = (cards.length >= SEARCH_LIMIT)
    ? `<div class="card"><p class="hint">Nota: se muestran solo las primeras ${SEARCH_LIMIT} ediciones (hay más reimpresiones).</p></div>`
    : "";

  let html = avisoLimit;

  for (const g of grupos) {
    html += `
      <div class="card">
        <h3 style="margin-top:0;">
          <button class="btn-link-carta" type="button" data-accion="ver-carta" data-oracle="${g.oracleId}">
            ${g.titulo}
          </button>
        </h3>

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
              <button class="btn-link-carta" type="button" data-accion="ver-print" data-id="${v.id}">
                <strong>${v.set_name}</strong>
                <span class="lang-pill">${formatLang(v.lang)}</span>
                <span class="hint"> (#${v.collector_number}, ${v.rareza})</span>
              </button>

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

  // Map por id para abrir modal de un print concreto
  const verById = new Map();
  for (const g of grupos) for (const v of g.versiones) verById.set(v.id, v);

  cont.querySelectorAll("[data-accion='ver-print']").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = verById.get(btn.dataset.id);
      if (!v) return;

      abrirModalCarta({
        titulo: v.nombre,
        imageUrl: v._img || null,
        numero: v.collector_number || "",
        rareza: v.rareza || "",
        precio: formatPrecioEUR(v._prices)
      });
    });
  });

  // Título del grupo -> modal con imagen “general” del oracle (la que guardas en g.img)
  const mapaOracleAImg = new Map();
  for (const g of grupos) mapaOracleAImg.set(g.oracleId, { titulo: g.titulo, img: g.img });

  cont.querySelectorAll("[data-accion='ver-carta']").forEach(btn => {
    btn.addEventListener("click", () => {
      const oracle = btn.dataset.oracle;
      const info = mapaOracleAImg.get(oracle);
      abrirModalCarta({ titulo: info?.titulo, imageUrl: info?.img });
    });
  });

  // Botones "Ir"
  cont.querySelectorAll(".btn-ir-set").forEach(btn => {
    btn.addEventListener("click", async () => {
      const setKey = btn.dataset.setkey;

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
  if (btnEntrar) btnEntrar.addEventListener("click", () => mostrarPantalla("menu"));

  // Menú principal
  document.querySelectorAll(".btn-menu").forEach(btn => {
    btn.addEventListener("click", () => {
      const destino = btn.dataset.pantalla;

      if (destino === "colecciones") {
        aplicarUIFiltrosColecciones();
        aplicarUIFiltrosTipo();
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

      if (destino === "cuenta") {
  mostrarPantalla("cuenta");
  return;
}
    });
  });

  // Volver al menú
  document.querySelectorAll("[data-action='volverMenu']").forEach(btn => {
    btn.addEventListener("click", () => mostrarPantalla("menu"));
  });

  // Volver a colecciones
  document.querySelectorAll("[data-action='volverColecciones']").forEach(btn => {
    btn.addEventListener("click", () => {
      aplicarUIFiltrosColecciones();
      aplicarUIFiltrosTipo();
      renderColecciones();
      mostrarPantalla("colecciones");
    });
  });

  // Buscar cartas
  const btnBuscar = document.getElementById("btnBuscar");
  if (btnBuscar) {
    btnBuscar.addEventListener("click", async () => {
      const inputBuscar = document.getElementById("inputBuscar");
      await renderResultadosBuscar(inputBuscar ? inputBuscar.value : "");
    });
  }

  const inputBuscar = document.getElementById("inputBuscar");
  if (inputBuscar) {
    inputBuscar.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") await renderResultadosBuscar(inputBuscar.value);
    });
  }

  // Buscador de colecciones
  const inputBuscarCol = document.getElementById("inputBuscarColecciones");
  if (inputBuscarCol) {
    inputBuscarCol.addEventListener("input", () => setFiltroTextoColecciones(inputBuscarCol.value));
  }

  const btnLimpiarCol = document.getElementById("btnLimpiarColecciones");
  if (btnLimpiarCol && inputBuscarCol) {
    btnLimpiarCol.addEventListener("click", () => {
      inputBuscarCol.value = "";
      setFiltroTextoColecciones("");
      inputBuscarCol.focus();
    });
  }

  // Buscador dentro del SET
  const inputBuscarEnSet = document.getElementById("inputBuscarEnSet");
  if (inputBuscarEnSet) {
    inputBuscarEnSet.addEventListener("input", () => setFiltroTextoSet(inputBuscarEnSet.value));
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
    chkSoloFaltanSet.addEventListener("change", () => setFiltroSoloFaltanSet(chkSoloFaltanSet.checked));
  }

  // Cambiar idioma dentro del set
  const btnSetLangEn = document.getElementById("btnSetLangEn");
  if (btnSetLangEn) {
    btnSetLangEn.addEventListener("click", async () => {
      if (!setActualCode) return;
      await abrirSet(`${setActualCode}__en`);
    });
  }

  const btnSetLangEs = document.getElementById("btnSetLangEs");
  if (btnSetLangEs) {
    btnSetLangEs.addEventListener("click", async () => {
      if (!setActualCode) return;
      await abrirSet(`${setActualCode}__es`);
    });
  }

  // Filtros de tipo (tokens/arte) y selector
  const btnTok = document.getElementById("btnToggleTokens");
  if (btnTok) {
    btnTok.addEventListener("click", () => {
      ocultarTokens = !ocultarTokens;
      aplicarUIFiltrosTipo();
      renderColecciones();
    });
  }

  const btnArt = document.getElementById("btnToggleArte");
  if (btnArt) {
    btnArt.addEventListener("click", () => {
      ocultarArte = !ocultarArte;
      aplicarUIFiltrosTipo();
      renderColecciones();
    });
  }

  const selTipoSet = document.getElementById("selTipoSet");
  if (selTipoSet) {
    selTipoSet.addEventListener("change", () => {
      filtroTipoSet = selTipoSet.value;
      renderColecciones();
    });
  }

  // Modal
  const btnCerrarModal = document.getElementById("btnCerrarModal");
  if (btnCerrarModal) btnCerrarModal.addEventListener("click", cerrarModalCarta);

  const modal = document.getElementById("modalCarta");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target && e.target.dataset && e.target.dataset.action === "cerrarModal") cerrarModalCarta();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarModalCarta();
  });

  const btnActualizarPrecios = document.getElementById("btnActualizarPrecios");
if (btnActualizarPrecios) {
  btnActualizarPrecios.addEventListener("click", refrescarPreciosSetActual);
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
  catalogoListo = false;
  catalogoError = "";

  cargarEstado();
  cargarProgresoPorSet();
  cargarFiltrosColecciones();
  cargarHiddenEmptySets();

  wireGlobalButtons();
  wireBackupButtons();

  // ✅ Supabase (nuevo): sesión + listeners + pull + autosave
    try { 
    await sbInit(); 
  } catch (e) {
    console.error("Supabase init error:", e);
    uiSetSyncStatus("Sync desactivada (error).");
  }

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
    catalogoError = (err && err.message) ? err.message : "desconocido";
  } finally {
    catalogoListo = true;
    renderColecciones();
  }

  renderResultadosBuscar("");
}

init();

