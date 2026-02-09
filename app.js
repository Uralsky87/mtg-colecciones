// ===============================
// 1) Datos de ejemplo (AHORA con lang: "en" / "es")
// ===============================

const VERSION = "0.82";
const DEBUG = false; // Cambiar a true para habilitar métricas de rendimiento
const JS_URL = (typeof document !== "undefined" && document.currentScript?.src) || "app.js loaded";
console.log("ManaCodex VERSION", VERSION, "JS URL", JS_URL);

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    if (DEBUG) console.warn("[STORAGE] getItem falló:", key, err);
    return null;
  }
}

// ===============================
// 6b) Comandantes: búsqueda por filtros
// ===============================

const COMMANDER_CMC_STEPS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
let commanderCmcMin = null;
let commanderCmcMax = null;
let commanderCmcMaxOpen = false;

function parseCommanderCmcValue(raw) {
  const label = String(raw || "").trim();
  if (label === "10+") return { value: 10, open: true, label };
  const num = Number(label);
  return Number.isFinite(num) ? { value: num, open: false, label: String(num) } : null;
}

function formatCommanderCmcLabel(value, open) {
  if (open && value === 10) return "10+";
  return String(value);
}

function getCommanderSelectedColors() {
  const order = ["w", "u", "b", "r", "g"];
  const selected = new Set();
  document.querySelectorAll(".chk-commander-color:checked").forEach(chk => {
    if (chk?.value) selected.add(chk.value);
  });
  return order.filter(c => selected.has(c));
}

function isCommanderColorlessSelected() {
  const chk = document.getElementById("chkCommanderColorless");
  return chk ? !!chk.checked : false;
}

function isCommanderExactColorsSelected() {
  const chk = document.getElementById("chkCommanderExacto");
  return chk ? !!chk.checked : false;
}

function buildCommanderQueryFromUI() {
  const colors = getCommanderSelectedColors();
  const colorless = isCommanderColorlessSelected();
  const exactColors = isCommanderExactColorsSelected();
  const rulingRaw = document.getElementById("inputRulingCommander")?.value || "";
  const ruling = String(rulingRaw).replace(/"/g, "").trim();

  const clauses = ["game:paper", "(lang:en or lang:es)", "is:commander", "order:cmc"];

  if (colors.length > 0) {
    clauses.push(`${exactColors ? "id=" : "id:"}${colors.join("")}`);
  } else if (colorless) {
    clauses.push("id:c");
  }

  if (Number.isFinite(commanderCmcMin)) {
    clauses.push(`cmc>=${commanderCmcMin}`);
  }

  if (Number.isFinite(commanderCmcMax) && !commanderCmcMaxOpen) {
    clauses.push(`cmc<=${commanderCmcMax}`);
  }

  if (ruling) {
    clauses.push(`o:"${ruling}"`);
  }

  return clauses.join(" ").trim();
}

function updateCommanderCmcUI() {
  const bar = document.getElementById("manaRangoBar");
  if (!bar) return;

  const min = Number.isFinite(commanderCmcMin) ? commanderCmcMin : null;
  const max = Number.isFinite(commanderCmcMax) ? commanderCmcMax : null;

  bar.querySelectorAll(".mana-step").forEach(btn => {
    const parsed = parseCommanderCmcValue(btn.dataset.cmc || "");
    if (!parsed) return;

    const val = parsed.value;
    const active = (min !== null && max === null && val === min) || (min !== null && max !== null && (val === min || val === max));
    let inRange = false;

    if (min !== null && max !== null) {
      if (commanderCmcMaxOpen) {
        inRange = val >= min;
      } else {
        inRange = val >= min && val <= max;
      }
    }

    btn.classList.toggle("active", active);
    btn.classList.toggle("in-range", inRange);
  });

  const texto = document.getElementById("manaRangoTexto");
  if (!texto) return;

  if (min === null && max === null) {
    texto.textContent = "Sin rango de coste.";
  } else if (min !== null && max === null) {
    texto.textContent = min === 10 ? "Coste 10+." : `Coste desde ${formatCommanderCmcLabel(min, false)}.`;
  } else if (min !== null && max !== null) {
    texto.textContent = commanderCmcMaxOpen
      ? `Coste desde ${formatCommanderCmcLabel(min, false)} a 10+.`
      : `Coste entre ${formatCommanderCmcLabel(min, false)} y ${formatCommanderCmcLabel(max, false)}.`;
  }
}

function setCommanderCmcRange(min, max, maxOpen) {
  commanderCmcMin = Number.isFinite(min) ? min : null;
  commanderCmcMax = Number.isFinite(max) ? max : null;
  commanderCmcMaxOpen = !!maxOpen;
  updateCommanderCmcUI();
}

function handleCommanderCmcSelection(raw) {
  const parsed = parseCommanderCmcValue(raw);
  if (!parsed) return;

  const val = parsed.value;
  const isOpen = parsed.open;

  if (commanderCmcMin === null || commanderCmcMax !== null) {
    if (isOpen) {
      setCommanderCmcRange(val, null, false);
    } else {
      setCommanderCmcRange(val, null, false);
    }
    return;
  }

  if (commanderCmcMax === null) {
    const prevMin = commanderCmcMin;
    let min = commanderCmcMin;
    let max = val;
    let maxOpen = isOpen;

    if (max < min) {
      const tmp = min;
      min = max;
      max = tmp;
      maxOpen = prevMin === 10;
    }

    setCommanderCmcRange(min, max, maxOpen);
  }
}

function resetCommanderSearchUI() {
  document.querySelectorAll(".chk-commander-color").forEach(chk => {
    chk.checked = false;
  });

  const chkColorless = document.getElementById("chkCommanderColorless");
  if (chkColorless) chkColorless.checked = false;

  const rulingInput = document.getElementById("inputRulingCommander");
  if (rulingInput) rulingInput.value = "";

  setCommanderCmcRange(null, null, false);

  const cont = document.getElementById("resultadosComandantes");
  if (cont) {
    cont.innerHTML = `<div class="card"><p>Selecciona filtros y pulsa “Buscar”.</p></div>`;
  }
}

async function renderResultadosComandantes(opts = {}) {
  const cont = document.getElementById("resultadosComandantes");
  if (!cont) return;

  const query = buildCommanderQueryFromUI();

  cancelCommanderSearchAbort();
  commanderSearchAbortController = new AbortController();

  cont.innerHTML = `<div class="card"><p>Buscando comandantes en Scryfall…</p></div>`;

  let cards = [];
  try {
    cards = await scrySearchCommanders(query, {
      signal: commanderSearchAbortController.signal,
      unique: "prints"
    });
  } catch (err) {
    if (err && err.name === "AbortError") return;
    console.error(err);
    cont.innerHTML = `<div class="card"><p>Error buscando. Mira la consola.</p></div>`;
    return;
  }

  let grupos = agruparResultadosBusqueda(cards);

  if (grupos.length === 0) {
    cont.innerHTML = `<div class="card"><p>No se encontraron comandantes para los filtros actuales.</p></div>`;
    return;
  }

  if (opts.randomOne) {
    const idx = Math.floor(Math.random() * grupos.length);
    grupos = [grupos[idx]];
  }

  const avisoLimit = (cards.length >= COMMANDER_SEARCH_LIMIT)
    ? `<div class="card"><p class="hint">Nota: se muestran solo las primeras ${COMMANDER_SEARCH_LIMIT} ediciones. Ajusta filtros para acotar.</p></div>`
    : "";

  let html = avisoLimit;

  html += `<div class="cartas-grid cartas-grid-comandantes">`;

  for (const g of grupos) {
    const versiones = g.versiones || [];
    if (versiones.length === 0) continue;

    let idx = versiones.findIndex(v => String(v.lang || "").toLowerCase() === "es");
    if (idx < 0) idx = versiones.findIndex(v => String(v.lang || "").toLowerCase() === "en");
    if (idx < 0) idx = 0;

    const v = versiones[idx];
    const imgUrl = v._img || "";

    html += `
      <div class="carta-item carta-item-comandante" data-oracle="${g.oracleId}" data-idx="${idx}">
        <div class="carta-header cmd-header">
          <button class="btn-secundario btn-cmd-nav btn-cmd-prev" type="button" aria-label="Anterior">◀</button>
          <button class="btn-link-carta cmd-title" type="button" data-accion="ver-print" data-id="${v.id}">
            ${escapeHtml(v.nombre)} <span class="lang-pill">${formatLang(v.lang)}</span>
          </button>
          <button class="btn-secundario btn-cmd-nav btn-cmd-next" type="button" aria-label="Siguiente">▶</button>
        </div>
        <div class="hint cmd-set">
          ${escapeHtml(v.set_name || "")} <span class="cmd-collector">(#${escapeHtml(v.collector_number || "")}, ${escapeHtml(v.rareza)})</span>
        </div>
        <div class="carta-imagen-container">
          <img class="carta-imagen cmd-img" data-img-src="${escapeAttr(imgUrl)}" alt="${escapeAttr(v.nombre || "")}" loading="lazy" style="${imgUrl ? "" : "display:none;"}" />
          <div class="carta-imagen-placeholder cmd-placeholder" style="${imgUrl ? "display:none;" : ""}">Sin imagen</div>
        </div>
        <div class="cmd-actions">
          <button class="btn-secundario btn-ir-set" type="button" data-setkey="${v.setKey}" data-cardname="${escapeAttr(v.nombre || "")}">Ir</button>
        </div>
      </div>
    `;
  }

  html += `</div>`;

  cont.innerHTML = html;

  const verById = new Map();
  for (const g of grupos) for (const v of g.versiones) verById.set(v.id, v);

  const mapaOracleAImg = new Map();
  for (const g of grupos) mapaOracleAImg.set(g.oracleId, { titulo: g.titulo, img: g.img, versiones: g.versiones || [] });

  cont._searchVerById = verById;
  cont._searchOracleImg = mapaOracleAImg;

  cont.querySelectorAll("img.carta-imagen[data-img-src]").forEach(img => {
    const src = img.dataset.imgSrc;
    if (src) loadImageWithCache(img, src);
  });

  if (!cont.dataset.wiredCommanderSearch) {
    cont.dataset.wiredCommanderSearch = "1";

    cont.addEventListener("click", (e) => {
      const target = e.target;
      const btn = target.closest("button");
      if (!btn) return;

      if (btn.classList.contains("btn-cmd-prev") || btn.classList.contains("btn-cmd-next")) {
        const cardEl = btn.closest(".carta-item-comandante");
        if (!cardEl) return;
        const oracleId = cardEl.dataset.oracle;
        const data = cont._searchOracleImg?.get(oracleId);
        const versiones = data?.versiones || [];
        if (versiones.length === 0) return;

        const currentIdx = Number(cardEl.dataset.idx || 0);
        const dir = btn.classList.contains("btn-cmd-next") ? 1 : -1;
        const nextIdx = (currentIdx + dir + versiones.length) % versiones.length;
        const v = versiones[nextIdx];

        cardEl.dataset.idx = String(nextIdx);

        const titleBtn = cardEl.querySelector(".cmd-title");
        if (titleBtn) {
          titleBtn.dataset.id = v.id;
          titleBtn.innerHTML = `${escapeHtml(v.nombre)} <span class="lang-pill">${formatLang(v.lang)}</span>`;
        }

        const setEl = cardEl.querySelector(".cmd-set");
        if (setEl) {
          setEl.innerHTML = `${escapeHtml(v.set_name || "")} <span class="cmd-collector">(#${escapeHtml(v.collector_number || "")}, ${escapeHtml(v.rareza)})</span>`;
        }

        const img = cardEl.querySelector("img.carta-imagen");
        const placeholder = cardEl.querySelector(".cmd-placeholder");
        const imgUrl = v._img || "";
        if (img) {
          img.dataset.imgSrc = imgUrl;
          img.alt = v.nombre || "";
          if (imgUrl) {
            img.style.display = "";
            if (placeholder) placeholder.style.display = "none";
            loadImageWithCache(img, imgUrl);
          } else {
            img.style.display = "none";
            if (placeholder) placeholder.style.display = "";
          }
        }

        const btnIr = cardEl.querySelector(".btn-ir-set");
        if (btnIr) {
          btnIr.dataset.setkey = v.setKey;
          btnIr.dataset.cardname = v.nombre || "";
        }
        return;
      }

      if (btn.dataset.accion === "ver-print") {
        const v = cont._searchVerById?.get(btn.dataset.id);
        if (!v) return;
        abrirModalCarta({
          titulo: v.nombre,
          imageUrl: v._img || null,
          numero: v.collector_number || "",
          rareza: v.rareza || "",
          precio: formatPrecioEUR(v._prices)
        });
        return;
      }

      if (btn.classList.contains("btn-ir-set")) {
        (async () => {
          const setKey = btn.dataset.setkey;
          const cardName = btn.dataset.cardname || "";
          if (!setKey) return;

          filtroSoloFaltanSet = false;
          setFiltroTextoSet(cardName);

          if (typeof hiddenEmptySetKeys !== "undefined" && hiddenEmptySetKeys.has(setKey)) {
            hiddenEmptySetKeys.delete(setKey);
            if (typeof guardarHiddenEmptySets === "function") guardarHiddenEmptySets();
          }

          await abrirSet(setKey);
          if (typeof aplicarUIFiltrosSet === "function") aplicarUIFiltrosSet();
        })();
      }
    });
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (DEBUG) console.warn("[STORAGE] setItem falló:", key, err);
    return false;
  }
}

function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    if (DEBUG) console.warn("[STORAGE] removeItem falló:", key, err);
    return false;
  }
}

// ===============================
// Baseline: Métricas de rendimiento (DEBUG mode)
// ===============================
const metrics = {
  renderTablaSet: [],
  renderColecciones: [],
  buscar: [],
  navegacion: []
};

function recordMetric(name, duration) {
  if (!DEBUG) return;
  if (!metrics[name]) metrics[name] = [];
  metrics[name].push(duration);
  const avg = (metrics[name].reduce((a, b) => a + b, 0) / metrics[name].length).toFixed(2);
  const p95 = metrics[name].sort((a, b) => a - b)[Math.floor(metrics[name].length * 0.95)]?.toFixed(2) || '0';
  console.log(`[METRIC] ${name}: ${duration.toFixed(2)}ms (avg: ${avg}ms, p95: ${p95}ms)`);
}

function getMetricsReport() {
  if (!DEBUG) return;
  const report = {};
  for (const [key, values] of Object.entries(metrics)) {
    if (values.length === 0) continue;
    report[key] = {
      count: values.length,
      avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      p50: values.sort((a, b) => a - b)[Math.floor(values.length * 0.5)]?.toFixed(2),
      p95: values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)]?.toFixed(2),
      max: Math.max(...values).toFixed(2)
    };
  }
  console.table(report);
}

// ===============================
// Batch 3: AbortController para búsquedas
// ===============================
// Cancela búsquedas y cargas obsoletas si el usuario navega o teclea
let searchAbortController = null;
let setLoadAbortController = null;
let commanderSearchAbortController = null;

function cancelSearchAbort() {
  if (searchAbortController) {
    searchAbortController.abort();
    searchAbortController = null;
  }
}

function cancelSetLoadAbort() {
  if (setLoadAbortController) {
    setLoadAbortController.abort();
    setLoadAbortController = null;
  }
}

function cancelCommanderSearchAbort() {
  if (commanderSearchAbortController) {
    commanderSearchAbortController.abort();
    commanderSearchAbortController = null;
  }
}

// ===============================
// Utilidades de optimización
// ===============================

// Debounce para evitar llamadas excesivas a funciones costosas
let renderColeccionesTimeout = null;
let renderColeccionesRAF = null;
function scheduleRenderColecciones() {
  if (renderColeccionesTimeout || renderColeccionesRAF) return; // Ya hay uno programado
  // Usar requestAnimationFrame para sincronía con frames (mejor que setTimeout)
  renderColeccionesRAF = requestAnimationFrame(() => {
    renderColecciones();
    renderColeccionesTimeout = null;
    renderColeccionesRAF = null;
  });
  // Fallback para setTimeout si rAF está saturado
  renderColeccionesTimeout = setTimeout(() => {
    if (renderColeccionesRAF) {
      cancelAnimationFrame(renderColeccionesRAF);
    }
    renderColecciones();
    renderColeccionesTimeout = null;
    renderColeccionesRAF = null;
  }, 50); // 50ms max wait
}

// Guardar estado con debounce para reducir escrituras en localStorage
let saveEstado2Timeout = null;
function guardarEstado2Debounced() {
  clearTimeout(saveEstado2Timeout);
  saveEstado2Timeout = setTimeout(() => {
    guardarEstado2Seguro();
    saveEstado2Timeout = null;
  }, 300); // 300ms sin cambios antes de guardar
}

// Batch 5: Escritura segura a localStorage con manejo de cuotas
function guardarEstado2Seguro() {
  try {
    const json = JSON.stringify(estado2);
    localStorage.setItem(LS_KEY_V2, json);
    if (typeof sbMarkDirty === "function") sbMarkDirty();
    if (DEBUG) console.log(`[STORAGE] Estado guardado (${(json.length / 1024).toFixed(2)} KB)`);
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      console.warn("[STORAGE] Cuota de localStorage excedida. Limpiando caches viejos...");
      // Intentar liberar espacio borrando caches viejos
      try {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith("mtg_catalogo_") && key !== LS_CATALOGO_SETS) {
            localStorage.removeItem(key);
          }
        }
        // Reintentar
        localStorage.setItem(LS_KEY_V2, JSON.stringify(estado2));
      } catch (err2) {
        console.error("[STORAGE] Imposible guardar estado. Limpieza falló:", err2);
      }
    } else if (err.name === 'SecurityError') {
      console.warn("[STORAGE] localStorage en modo privado o bloqueado. Cambios no persistidos.");
    } else {
      console.error("[STORAGE] Error guardando estado:", err);
    }
  }
}

// ===============================
// IndexedDB - Cache persistente de cartas
// ===============================

const DB_NAME = 'mtg_cards_cache';
const DB_VERSION = 2;
const STORE_SETS = 'sets';
const STORE_IMAGES = 'images';
const CACHE_EXPIRY_DAYS = 7; // Revalidar después de 7 días
const IMAGE_CACHE_EXPIRY_DAYS = 14; // Cache de imágenes
const IMAGE_CACHE_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const LS_IMAGE_CACHE_SIZE = "mtg_image_cache_bytes_v1";

// Cache en memoria para evitar parpadeos al re-render en scroll virtual
const MEMORY_IMAGE_CACHE_MAX_BYTES = 40 * 1024 * 1024; // 40 MB
const memoryImageBlobCache = new Map();
let memoryImageBlobBytes = 0;

let dbInstance = null;

// Abrir/crear la base de datos
async function openCardsDB() {
  if (dbInstance) return dbInstance;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('Error abriendo IndexedDB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Crear object store para sets si no existe
      if (!db.objectStoreNames.contains(STORE_SETS)) {
        const store = db.createObjectStore(STORE_SETS, { keyPath: 'setKey' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Crear object store para imágenes si no existe
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        const store = db.createObjectStore(STORE_IMAGES, { keyPath: 'url' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

function getImageCacheSize() {
  const raw = safeLocalStorageGet(LS_IMAGE_CACHE_SIZE);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function setImageCacheSize(bytes) {
  const value = Math.max(0, Math.floor(bytes || 0));
  safeLocalStorageSet(LS_IMAGE_CACHE_SIZE, String(value));
}

function bumpImageCacheSize(delta) {
  const current = getImageCacheSize();
  setImageCacheSize(current + (Number(delta) || 0));
}

function rememberImageBlob(key, blob) {
  if (!key || !blob) return;
  const size = blob.size || 0;
  if (!Number.isFinite(size) || size <= 0) return;

  if (memoryImageBlobCache.has(key)) return;

  while (memoryImageBlobBytes + size > MEMORY_IMAGE_CACHE_MAX_BYTES && memoryImageBlobCache.size > 0) {
    const firstKey = memoryImageBlobCache.keys().next().value;
    const firstBlob = memoryImageBlobCache.get(firstKey);
    memoryImageBlobCache.delete(firstKey);
    memoryImageBlobBytes -= (firstBlob?.size || 0);
  }

  if (memoryImageBlobBytes + size <= MEMORY_IMAGE_CACHE_MAX_BYTES) {
    memoryImageBlobCache.set(key, blob);
    memoryImageBlobBytes += size;
  }
}

function getMemoryImageBlob(key) {
  return key ? memoryImageBlobCache.get(key) : null;
}

function setImageSrc(imgEl, src) {
  if (!imgEl) return;
  const prevBlob = imgEl.dataset.blobUrl;
  if (prevBlob && prevBlob.startsWith('blob:')) {
    try { URL.revokeObjectURL(prevBlob); } catch {}
  }
  imgEl.src = src;
  if (src && src.startsWith('blob:')) {
    imgEl.dataset.blobUrl = src;
  } else {
    delete imgEl.dataset.blobUrl;
  }
}

async function saveImageToDB(url, blob) {
  try {
    if (!url || !blob) return;
    const db = await openCardsDB();
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    const size = blob.size || 0;

    const existing = await new Promise((resolve) => {
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    const prevSize = existing?.size ?? existing?.blob?.size ?? 0;

    const data = {
      url,
      blob,
      size,
      timestamp: Date.now()
    };

    store.put(data);

    bumpImageCacheSize(size - prevSize);
    enforceImageCacheLimit().catch(() => {});
  } catch (err) {
    if (DEBUG) console.warn('Error guardando imagen en IndexedDB:', err);
  }
}

async function getImageFromDB(url) {
  try {
    if (!url) return null;
    const db = await openCardsDB();
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const store = tx.objectStore(STORE_IMAGES);

    return new Promise((resolve) => {
      const request = store.get(url);
      request.onsuccess = () => {
        const data = request.result;
        if (!data) return resolve(null);

        const age = Date.now() - data.timestamp;
        const maxAge = IMAGE_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        if (age > maxAge) {
          resolve(null);
          return;
        }

        resolve(data);
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    if (DEBUG) console.warn('Error leyendo imagen desde IndexedDB:', err);
    return null;
  }
}

async function enforceImageCacheLimit() {
  try {
    let total = getImageCacheSize();
    if (total <= IMAGE_CACHE_MAX_BYTES) return;

    const db = await openCardsDB();
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    const index = store.index('timestamp');

    await new Promise((resolve) => {
      const request = index.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || total <= IMAGE_CACHE_MAX_BYTES) {
          resolve();
          return;
        }

        const value = cursor.value || {};
        const size = value.size ?? value.blob?.size ?? 0;
        total -= size;
        cursor.delete();
        cursor.continue();
      };
      request.onerror = () => resolve();
    });

    setImageCacheSize(total);
  } catch (err) {
    if (DEBUG) console.warn('Error limitando cache de imágenes:', err);
  }
}

async function loadImageWithCache(imgEl, url) {
  if (!imgEl || !url) return;
  const key = String(url);

  if (imgEl.dataset.imgCacheKey === key && imgEl.dataset.imgCacheState === 'loaded') return;
  imgEl.dataset.imgCacheKey = key;
  imgEl.dataset.imgCacheState = 'loading';

  try {
    const memBlob = getMemoryImageBlob(key);
    if (memBlob) {
      const blobUrl = URL.createObjectURL(memBlob);
      setImageSrc(imgEl, blobUrl);
      imgEl.dataset.imgCacheState = 'loaded';
      return;
    }

    const cached = await getImageFromDB(key);
    if (cached && cached.blob) {
      rememberImageBlob(key, cached.blob);
      const blobUrl = URL.createObjectURL(cached.blob);
      setImageSrc(imgEl, blobUrl);
      imgEl.dataset.imgCacheState = 'loaded';
      return;
    }

    setImageSrc(imgEl, key);
    imgEl.dataset.imgCacheState = 'loaded';

    // Guardar en background (si CORS permite)
    const res = await fetch(key, { cache: 'force-cache' });
    if (res && res.ok) {
      const blob = await res.blob();
      rememberImageBlob(key, blob);
      saveImageToDB(key, blob);
    }
  } catch (err) {
    imgEl.dataset.imgCacheState = 'error';
    if (DEBUG) console.warn('Error cargando imagen con cache:', err);
    setImageSrc(imgEl, key);
  }
}

// Guardar cartas de un set en IndexedDB
async function saveSetToDB(setKey, cards) {
  try {
    const db = await openCardsDB();
    const tx = db.transaction(STORE_SETS, 'readwrite');
    const store = tx.objectStore(STORE_SETS);
    
    const data = {
      setKey,
      cards,
      timestamp: Date.now(),
      version: VERSION
    };
    
    await store.put(data);
    await tx.complete;
    
    console.log(`✅ Set ${setKey} guardado en IndexedDB (${cards.length} cartas)`);
  } catch (err) {
    console.warn('Error guardando en IndexedDB:', err);
    // No es crítico, simplemente no se cachea
  }
}

// Obtener cartas de un set desde IndexedDB
async function getSetFromDB(setKey) {
  try {
    const db = await openCardsDB();
    const tx = db.transaction(STORE_SETS, 'readonly');
    const store = tx.objectStore(STORE_SETS);
    
    return new Promise((resolve, reject) => {
      const request = store.get(setKey);
      
      request.onsuccess = () => {
        const data = request.result;
        
        if (!data) {
          resolve(null);
          return;
        }
        
        // Verificar si expiró (7 días)
        const age = Date.now() - data.timestamp;
        const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        
        if (age > maxAge) {
          console.log(`⚠️ Cache de ${setKey} expirado (${Math.floor(age / (24*60*60*1000))} días)`);
          resolve(null);
          return;
        }
        
        console.log(`✅ Set ${setKey} cargado desde IndexedDB (${data.cards.length} cartas)`);
        resolve(data);
      };
      
      request.onerror = () => {
        console.warn('Error leyendo de IndexedDB:', request.error);
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('Error accediendo a IndexedDB:', err);
    return null;
  }
}

// Limpiar cache antiguo (opcional, para mantenimiento)
async function cleanExpiredCache() {
  try {
    const db = await openCardsDB();
    const tx = db.transaction(STORE_SETS, 'readwrite');
    const store = tx.objectStore(STORE_SETS);
    const index = store.index('timestamp');
    
    const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAge;
    
    const request = index.openCursor();
    let deleted = 0;
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.timestamp < cutoff) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      } else {
        if (deleted > 0) {
          console.log(`🧹 Limpiados ${deleted} sets expirados de IndexedDB`);
        }
      }
    };
  } catch (err) {
    console.warn('Error limpiando cache:', err);
  }
}

async function cleanExpiredImageCache() {
  try {
    const db = await openCardsDB();
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    const index = store.index('timestamp');

    const maxAge = IMAGE_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAge;

    const request = index.openCursor();
    let deleted = 0;
    let freed = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.timestamp < cutoff) {
          const size = cursor.value.size ?? cursor.value.blob?.size ?? 0;
          freed += size;
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      } else {
        if (deleted > 0) {
          bumpImageCacheSize(-freed);
          console.log(`🧹 Limpiadas ${deleted} imágenes expiradas de IndexedDB`);
        }
      }
    };
  } catch (err) {
    if (DEBUG) console.warn('Error limpiando cache de imágenes:', err);
  }
}

// Debug de viewport para móvil (verificar versión cargada)
console.log("🔧 ManaCodex v" + VERSION + " - Viewport Debug:", {
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
  userAgent: navigator.userAgent,
  cacheVersion: "20260112c"
});

// Función para normalizar texto (remover acentos)
const _normalizarCache = new Map();
const _NORMALIZAR_CACHE_MAX = 5000;

function normalizarTexto(texto) {
  const key = String(texto || "");
  const cached = _normalizarCache.get(key);
  if (cached !== undefined) return cached;

  const normalized = key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  _normalizarCache.set(key, normalized);
  if (_normalizarCache.size > _NORMALIZAR_CACHE_MAX) _normalizarCache.clear();
  return normalized;
}

const cartas = [];
const expandedCardIds = new Set(); // ids desplegados en esta sesión

// === SUPABASE (Auth + Sync) ===
const SUPABASE_URL = "https://slvpktkrfbsxwagibfjx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdnBrdGtyZmJzeHdhZ2liZmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE3MTQsImV4cCI6MjA4MTk4NzcxNH0.-U3ijfDUuSFNKG2001QBzSH3pGlgYXLT2Z8TCRvV6rM";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const LS_LOCAL_UPDATED_AT = "mtg_local_updated_at_v1";
const LS_CATALOGO_SETS = "mtg_catalogo_sets_v1";
const LS_CATALOGO_TIMESTAMP = "mtg_catalogo_timestamp_v1";
let sbLocalUpdatedAt = 0;

function sbLoadLocalUpdatedAt() {
  const raw = safeLocalStorageGet(LS_LOCAL_UPDATED_AT);
  const n = Number(raw);
  sbLocalUpdatedAt = Number.isFinite(n) ? n : 0;
}

function sbTouchLocalUpdatedAt() {
  sbLocalUpdatedAt = Date.now();
  safeLocalStorageSet(LS_LOCAL_UPDATED_AT, String(sbLocalUpdatedAt));
}

function getEmailRedirectTo() {
  // En GH Pages forzamos la URL final “limpia”
  if (location.hostname.endsWith("github.io")) {
    return "https://uralsky87.github.io/mtg-colecciones/";
  }
  // En local (Live Server) usamos la actual
  return location.origin + location.pathname;
}

// Theme: force light mode only. Removed theme switching UI.
function applyTheme(/* theme */) {
  document.documentElement.setAttribute("data-theme", "light");
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
let sbPushInFlight = false;
let sbApplyingCloudData = false; // Bandera para prevenir marcar como dirty durante sincronización

function uiSetSyncStatus(msg) {
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = msg || "";
}

function sbUpdateAuthUI() {
  if (DEBUG) console.log("sbUpdateAuthUI: actualizando UI", { hasUser: !!sbUser, email: sbUser?.email, dirty: sbDirty });
  
  const inputEmail = document.getElementById("inputEmail");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const btnPushNow = document.getElementById("btnPushNow"); // Guardar cambios

  if (sbUser) {
    if (inputEmail) inputEmail.value = sbUser.email || "";
    if (btnLogin) btnLogin.disabled = true;
    if (btnLogout) {
      btnLogout.style.display = "inline-block";
      btnLogout.disabled = false;
      if (DEBUG) console.log("sbUpdateAuthUI: btnLogout visible y habilitado");
    }
    if (btnPushNow) {
      btnPushNow.disabled = false;
      if (DEBUG) console.log("sbUpdateAuthUI: btnPushNow habilitado");
    }
    uiSetSyncStatus(`Conectado como ${sbUser.email || "usuario"} ✅`);
  } else {
    if (btnLogin) btnLogin.disabled = false;
    if (btnLogout) {
      btnLogout.style.display = "none";
      if (DEBUG) console.log("sbUpdateAuthUI: btnLogout oculto");
    }
    if (btnPushNow) {
      btnPushNow.disabled = true;
      if (DEBUG) console.log("sbUpdateAuthUI: btnPushNow deshabilitado (no hay sesión)");
    }
    uiSetSyncStatus("No has iniciado sesión.");
  }
}

function sbBuildCloudPayload() {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    estado: estado || {},              // Legacy v1 (mantener para compatibilidad)
    estado2: estado2 || {},            // Nuevo v2 por oracle_id
    oracleIdCache: oracleIdCache || {}, // Cache de resolución
    progresoPorSet: progresoPorSet || {},
    hiddenEmptySetKeys: [...(hiddenEmptySetKeys || new Set())],
    hiddenCollections: [...(hiddenCollections || new Set())],
    statsSnapshot: statsSnapshot || null,
    decks: decks || [],
    cardControlsConfig: cardControlsConfig || DEFAULT_CARD_CONTROLS,
    filtros: {
      filtroIdiomaColecciones: filtroIdiomaColecciones ?? "all",
      filtroTextoColecciones: filtroTextoColecciones ?? "",
      filtroTiposSet: [...filtroTiposSet],
      ocultarTokens: !!ocultarTokens,
      ocultarArte: !!ocultarArte
    }
  };
}

function sbApplyCloudPayload(payload) {
  if (!payload || typeof payload !== "object") return;

  const version = payload.version || 1;
  console.log(`sbApplyCloudPayload: aplicando datos desde la nube (version ${version})...`);
  
  // Activar bandera para prevenir marcar como dirty
  sbApplyingCloudData = true;
  
  try {
    // Aplicar estado v2 si existe
    if (version >= 2 && payload.estado2 && typeof payload.estado2 === "object") {
      estado2 = payload.estado2;
      guardarEstado2();
      console.log(`Estado v2 aplicado: ${Object.keys(estado2).length} cartas`);
    }
    
    // Aplicar cache de oracle_id si existe
    if (version >= 2 && payload.oracleIdCache && typeof payload.oracleIdCache === "object") {
      oracleIdCache = payload.oracleIdCache;
      guardarOracleCache();
      console.log(`Oracle cache aplicado: ${Object.keys(oracleIdCache).length} entradas`);
    }
    
    // Aplicar estado legacy v1 (para migración o compatibilidad)
    if (payload.estado && typeof payload.estado === "object") {
      estadoLegacyById = payload.estado; // Guardar como legacy para posible migración
      estado = payload.estado; // Mantener también para compatibilidad
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

    if (Array.isArray(payload.hiddenCollections)) {
      hiddenCollections = new Set(payload.hiddenCollections);
      guardarHiddenCollections();
    }

    // ✅ NUEVO: aplicar snapshot de estadísticas desde nube
    if (payload.statsSnapshot && typeof payload.statsSnapshot === "object") {
      statsSnapshot = payload.statsSnapshot;
      safeLocalStorageSet(LS_STATS_SNAPSHOT, JSON.stringify(statsSnapshot));
    }

    // ✅ Aplicar decks desde la nube
    if (Array.isArray(payload.decks)) {
      decks = payload.decks;
      guardarDecks();
    }

    if (payload.cardControlsConfig && typeof payload.cardControlsConfig === "object") {
      cardControlsConfig = normalizeCardControlsConfig(payload.cardControlsConfig);
      guardarCardControlsConfig();
    }

    const f = payload.filtros || {};
    if (typeof f.filtroIdiomaColecciones === "string") filtroIdiomaColecciones = f.filtroIdiomaColecciones;
    if (typeof f.filtroTextoColecciones === "string") filtroTextoColecciones = f.filtroTextoColecciones;
    if (Array.isArray(f.filtroTiposSet)) filtroTiposSet = new Set(f.filtroTiposSet);
    if (typeof f.ocultarTokens === "boolean") ocultarTokens = f.ocultarTokens;
    if (typeof f.ocultarArte === "boolean") ocultarArte = f.ocultarArte;

    renderColecciones();
    if (setActualKey) renderTablaSet(setActualKey);

    // ✅ Bonus: pinta estadísticas con snapshot (NO recalcula aquí)
    try {
      if (typeof renderEstadisticas === "function") {
        renderEstadisticas({ forceRecalc: false });
      }
    } catch {}
    
    console.log("sbApplyCloudPayload: datos aplicados correctamente");
  } finally {
    // Desactivar bandera
    sbApplyingCloudData = false;
  }
}

async function sbLoginWithEmail(email) {
  if (sbLoginInFlight) return;
  sbLoginInFlight = true;

  const btnLogin = document.getElementById("btnLogin");
  const prevText = btnLogin?.textContent;
  if (btnLogin) {
    btnLogin.disabled = true;
    btnLogin.textContent = "Enviando...";
  }

  try {
    const clean = String(email || "").trim().toLowerCase();
    if (!clean) { uiSetSyncStatus("Escribe un email."); return; }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
    if (!emailOk) { uiSetSyncStatus("Email inválido."); return; }

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
    if (btnLogin) {
      btnLogin.disabled = false;
      if (prevText) btnLogin.textContent = prevText;
    }
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
  if (!sbUser?.id) { uiSetSyncStatus("Inicia sesión primero."); return; }
  if (sbPullInFlight) return;
  sbPullInFlight = true;

  try {
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
    
    // Asegurar que no quede marcado como dirty después de descargar
    sbDirty = false;
    if (DEBUG) console.log("sbPullNow: datos descargados, sbDirty =", sbDirty);

    // Actualizar UI con el estado correcto
    if (sbUser) {
      uiSetSyncStatus(`Conectado como ${sbUser.email || "usuario"} ✅`);
    } else {
      uiSetSyncStatus("Descargado ✅");
    }
  } finally {
    sbPullInFlight = false;
  }
}

async function sbPushNow() {
  if (DEBUG) console.log("sbPushNow: iniciando...", { userId: sbUser?.id, isDirty: sbDirty });

  if (sbPushInFlight) return;
  sbPushInFlight = true;
  
  if (!sbUser?.id) { 
    if (DEBUG) console.warn("sbPushNow: no hay usuario logueado");
    uiSetSyncStatus("Inicia sesión primero."); 
    sbPushInFlight = false;
    return; 
  }
  
  if (!sbDirty) { 
    if (DEBUG) console.log("sbPushNow: no hay cambios pendientes");
    uiSetSyncStatus("No hay cambios que guardar."); 
    sbPushInFlight = false;
    return; 
  }

  // Anti-pisado
  let cloudUpdatedAt = null;
  try { cloudUpdatedAt = await sbGetCloudMeta(); } catch (err) {
    if (DEBUG) console.warn("sbPushNow: error obteniendo meta de la nube", err);
  }

  if (sbKnownCloudUpdatedAt && cloudUpdatedAt && cloudUpdatedAt > sbKnownCloudUpdatedAt) {
    uiSetSyncStatus("⚠️ La nube tiene cambios de otro dispositivo. Pulsa “Actualizar” antes de guardar.");
    sbPushInFlight = false;
    return;
  }

  uiSetSyncStatus("Subiendo a la nube…");
  if (DEBUG) console.log("sbPushNow: subiendo datos...");

  const payload = sbBuildCloudPayload();
  const { error } = await supabaseClient
    .from(SB_TABLE)
    .upsert({ user_id: sbUser.id, data: payload }, { onConflict: "user_id" });

  if (error) {
    console.error("sbPushNow: error al subir", error);
    uiSetSyncStatus("Error subiendo (mira consola).");
    sbPushInFlight = false;
    return;
  }

  sbDirty = false;
  if (DEBUG) console.log("sbPushNow: datos guardados exitosamente");

  // refrescar meta
  try { sbKnownCloudUpdatedAt = await sbGetCloudMeta(); } catch {}

  uiSetSyncStatus("Guardado ✅");
  sbPushInFlight = false;
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
  if (DEBUG) console.log("sbLogout: cerrando sesión...");
  
  // Deshabilitar botones temporalmente
  const btnLogout = document.getElementById("btnLogout");
  const btnPushNow = document.getElementById("btnPushNow");
  const wasDisabled = btnLogout?.disabled;
  
  try {
    if (btnLogout) {
      btnLogout.disabled = true;
      if (DEBUG) console.log("sbLogout: botón deshabilitado");
    }
    if (btnPushNow) btnPushNow.disabled = true;
    
    uiSetSyncStatus("Cerrando sesión...");
    if (DEBUG) console.log("sbLogout: llamando a signOut()...");
    
    // Timeout de 15 segundos para signOut (aumentado para evitar falsos positivos)
    const signOutPromise = supabaseClient.auth.signOut();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout al cerrar sesión")), 15000)
    );
    
    await Promise.race([signOutPromise, timeoutPromise]);
    
    if (DEBUG) console.log("sbLogout: signOut() completado");
    
    // Limpiar estado local
    sbUser = null;
    sbDirty = false;
    sbKnownCloudUpdatedAt = null;
    sbStopAutoSave();
    
    if (DEBUG) console.log("sbLogout: estado limpio");
    
    // Actualizar UI inmediatamente
    sbUpdateAuthUI();
    uiSetSyncStatus("Sesión cerrada correctamente");
    
    if (DEBUG) console.log("sbLogout: completado exitosamente");
    
  } catch (err) {
    console.error("sbLogout: error al cerrar sesión", err);
    uiSetSyncStatus("Error al cerrar sesión: " + (err.message || "desconocido"));
    
    // Re-habilitar botón si hubo error
    if (btnLogout && !wasDisabled) btnLogout.disabled = false;
    if (btnPushNow && sbUser) btnPushNow.disabled = false;
  }
}

// Asegurar que los botones están conectados (puede ser llamado múltiples veces)
function sbEnsureButtonsWired() {
  if (DEBUG) console.log("sbEnsureButtonsWired: verificando botones...");
  
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const btnPushNow = document.getElementById("btnPushNow");
  const inputEmail = document.getElementById("inputEmail");

  if (DEBUG) {
    if (!btnLogin) console.warn("sbEnsureButtonsWired: btnLogin no encontrado");
    if (!btnLogout) console.warn("sbEnsureButtonsWired: btnLogout no encontrado");
    if (!btnPushNow) console.warn("sbEnsureButtonsWired: btnPushNow no encontrado");
    if (!inputEmail) console.warn("sbEnsureButtonsWired: inputEmail no encontrado");
  }

  // onClickOnce ya previene duplicados con dataset.wired
  onClickOnce(btnLogin, async () => {
    try {
      await sbLoginWithEmail(inputEmail ? inputEmail.value : "");
    } catch (err) {
      console.error("Error en btnLogin:", err);
      uiSetSyncStatus("Error al intentar iniciar sesión");
    }
  });

  onClickOnce(btnLogout, async () => {
    if (DEBUG) console.log("=== CLICK EN BOTÓN SALIR ===");
    try {
      await sbLogout();
    } catch (err) {
      console.error("Error en btnLogout:", err);
      uiSetSyncStatus("Error al cerrar sesión");
    }
    if (DEBUG) console.log("=== FIN CLICK EN BOTÓN SALIR ===");
  });
  
  onClickOnce(btnPushNow, async () => {
    try {
      await sbPushNow();
    } catch (err) {
      console.error("Error en btnPushNow:", err);
      uiSetSyncStatus("Error al guardar");
    }
  });
  
  if (DEBUG) console.log("sbEnsureButtonsWired: verificación completa");
}

let sbInitDone = false;

// Canal de comunicación entre pestañas (solo desktop)
let authChannel = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    authChannel = new BroadcastChannel('mtg-auth');
  } catch {
    authChannel = null;
  }
}

async function sbCompleteMagicLinkIfPresent() {
  if (sbExchangeInFlight) return;
  sbExchangeInFlight = true;

  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    
    // También verificar si hay tokens en el hash (método alternativo de Supabase)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const hasHashAuth = hashParams.has('access_token') || hashParams.has('refresh_token');
    
    // Si no hay parámetros de auth, salir
    if (!code && !hasHashAuth) return;

    console.log('🔐 Callback de autenticación detectado', { hasCode: !!code, hasHashAuth });
    uiSetSyncStatus("Completando inicio de sesión…");

    // Si hay code, intercambiarlo por sesión
    if (code) {
      const { error } = await supabaseClient.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("exchangeCodeForSession:", error);
        uiSetSyncStatus("Login ya completado en otra pestaña. Actualizando sesión…");
      } else {
        console.log('✅ Sesión intercambiada exitosamente');
        sbJustExchanged = true;
        setTimeout(() => { sbJustExchanged = false; }, 1500);
      }
      
      // Limpia ?code=... de la URL
      url.searchParams.delete("code");
      window.history.replaceState({}, document.title, url.toString());
    }
    
    // Si hay hash auth, dejar que Supabase lo procese automáticamente
    // y solo limpiar el hash después
    if (hasHashAuth) {
      console.log('✅ Auth por hash detectado, esperando procesamiento...');
      // Esperar un momento para que Supabase procese
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Limpiar el hash
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      
      sbJustExchanged = true;
      setTimeout(() => { sbJustExchanged = false; }, 1500);
    }
    
    // Notificar a otras pestañas que el login se completó
    if (authChannel) {
      authChannel.postMessage({ type: 'AUTH_COMPLETE' });
    }
    safeLocalStorageSet('mtg-auth-event', Date.now().toString());
    
    // Detectar si esta ventana debe cerrarse (fue abierta por el magic link)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone === true;
    const hasLittleHistory = window.history.length <= 2;
    
    if (!isStandalone && hasLittleHistory) {
      console.log('🔒 Intentando cerrar ventana de callback...');
      uiSetSyncStatus("Login completado. Cerrando esta ventana…");
      
      setTimeout(() => {
        // Intentar cerrar
        window.close();
        
        // Verificar si se cerró
        setTimeout(() => {
          if (!window.closed) {
            console.log('⚠️ No se pudo cerrar la ventana automáticamente');
            uiSetSyncStatus("✅ Login completo. Puedes cerrar esta ventana manualmente.");
          }
        }, 500);
      }, 1500);
    }
    
  } finally {
    sbExchangeInFlight = false;
  }
}

function onClickOnce(el, handler) {
  if (!el) {
    if (DEBUG) console.warn("onClickOnce: elemento no encontrado");
    return;
  }
  if (el.dataset.wired === "1") {
    if (DEBUG) console.log("onClickOnce: elemento ya conectado, OMITIENDO", el.id || el);
    return;
  }
  el.dataset.wired = "1";
  
  // Wrapper que registra el click y previene doble-click
  let processing = false;
  const wrappedHandler = async (event) => {
    if (DEBUG) {
      console.log(`[CLICK] Botón ${el.id || 'sin-id'} clickeado`, { 
        disabled: el.disabled, 
        visible: el.style.display !== 'none',
        processing: processing
      });
    }
    
    if (el.disabled) {
      if (DEBUG) console.warn(`[CLICK] Botón ${el.id} está deshabilitado, ignorando`);
      return;
    }
    
    if (processing) {
      if (DEBUG) console.warn(`[CLICK] Botón ${el.id} ya está procesando, ignorando click duplicado`);
      return;
    }
    
    processing = true;
    try {
      await handler(event);
    } catch (err) {
      console.error(`[CLICK] Error en handler de ${el.id}:`, err);
    } finally {
      processing = false;
    }
  };
  
  el.addEventListener("click", wrappedHandler);
  if (DEBUG) console.log("onClickOnce: listener añadido a", el.id || el);
}

function sbMarkDirty() {
  // No marcar como dirty si estamos aplicando datos desde la nube
  if (sbApplyingCloudData) {
    if (DEBUG) console.log("sbMarkDirty: ignorado (aplicando datos de la nube)");
    return;
  }
  
  sbDirty = true;
  sbTouchLocalUpdatedAt();
  if (DEBUG) console.log("sbMarkDirty: marcado como dirty");
  uiSetSyncStatus("Cambios sin guardar…");
}

async function sbInit() {
  await sbCompleteMagicLinkIfPresent();

  if (sbInitDone) return;
  sbInitDone = true;

  // Si ya NO usas el sistema de sbLocalUpdatedAt, puedes borrar esta línea:
  // sbLoadLocalUpdatedAt();

  // 1) sesión actual al cargar
  const { data } = await supabaseClient.auth.getSession();
  sbUser = data?.session?.user || null;
  sbUpdateAuthUI();

  // 2) wire botones (una sola vez)
  sbEnsureButtonsWired();

  // 3) Si ya estaba logueado, hacemos pull y arrancamos autosave
  if (sbUser) {
    await sbPullNow();
    sbStartAutoSave();
  } else {
    sbStopAutoSave();
  }

  // 4) escuchar cambios de sesión (login/logout) (solo una vez)
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    // evita el pull doble del arranque
    if (event === "INITIAL_SESSION") return;

    sbUser = session?.user || null;
    sbUpdateAuthUI();

    if (sbUser) {
      await sbPullNow();
      sbStartAutoSave();
    } else {
      sbStopAutoSave();
      sbDirty = false;
    }
  });

  // 5) storage event + BroadcastChannel listener (solo una vez)
  if (!window.__sbStorageWired) {
    window.__sbStorageWired = true;

    window.addEventListener("storage", async (e) => {
      const k = String(e.key || "");
      if (!k) return;

      if (k.includes("supabase") || k.includes("auth-token") || k === 'mtg-auth-event') {
        console.log('📦 Evento storage detectado:', k);
        
        const { data } = await supabaseClient.auth.getSession();
        sbUser = data?.session?.user || null;
        sbUpdateAuthUI();

        if (sbUser) {
          await sbPullNow();
          
          // En PC: forzar recarga para actualizar completamente la UI
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
          
          if (!isMobile && !isStandalone && !sbJustExchanged && k === 'mtg-auth-event') {
            console.log('🔄 Recargando página para actualizar UI completamente...');
            setTimeout(() => {
              window.location.reload();
            }, 500);
          }
        }
      }
    });

    // Escuchar mensajes de otras pestañas vía BroadcastChannel
    if (authChannel) {
      authChannel.onmessage = async (e) => {
        if (e.data?.type === 'AUTH_COMPLETE') {
          console.log('📩 Mensaje de autenticación recibido de otra ventana');
          
          const { data } = await supabaseClient.auth.getSession();
          sbUser = data?.session?.user || null;
          sbUpdateAuthUI();
          
          if (sbUser) {
            await sbPullNow();
            
            // En PC: forzar recarga para actualizar completamente la UI
            // Detectar si NO es móvil y NO es la ventana que acaba de hacer login
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
            
            if (!isMobile && !isStandalone && !sbJustExchanged) {
              console.log('🔄 Recargando página para actualizar UI completamente...');
              setTimeout(() => {
                window.location.reload();
              }, 500);
            }
          }
        }
      };
    }
  }
}

function getLangFromCard(c) {
  return (c.lang || "en").toLowerCase(); // default en
}

function setKeyFromCard(c) {
  const lang = getLangFromCard(c);
  return `${c.coleccion}__${lang}`;
}

function langFlag(lang) {
  const l = (lang || "").toLowerCase();
  if (l === "es") return '<svg class="flag" width="20" height="15" viewBox="0 0 60 40"><rect width="60" height="40" fill="#c60b1e"/><rect y="10" width="60" height="20" fill="#ffc400"/></svg>';
  if (l === "en") return '<svg class="flag" width="20" height="15" viewBox="0 0 60 30"><clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></svg>';
  return '🏳️';
}

function formatLang(lang) {
  return String(lang || "en").toUpperCase(); // "EN" / "ES"
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  const raw = safeLocalStorageGet(LS_SET_PROGRESS);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") progresoPorSet = obj;
  } catch {}
}

function guardarProgresoPorSet() {
  safeLocalStorageSet(LS_SET_PROGRESS, JSON.stringify(progresoPorSet));
  if (typeof sbMarkDirty === "function") sbMarkDirty();
}

// ===============================
// Estadísticas - Snapshot persistente
// ===============================

const LS_STATS_SNAPSHOT = "mtg_stats_snapshot_v1";
let statsSnapshot = null;

let statsSnapshotTimeout = null;
function scheduleStatsSnapshotUpdate({ renderIfVisible = false } = {}) {
  clearTimeout(statsSnapshotTimeout);
  statsSnapshotTimeout = setTimeout(() => {
    actualizarStatsSnapshot({ render: renderIfVisible && document.getElementById("pantallaEstadisticas")?.classList.contains("active") });
    statsSnapshotTimeout = null;
  }, 300);
}

// Si estás aplicando payload de la nube, evita marcar dirty por cosas derivadas
let sbApplyingCloud = false;

function cargarStatsSnapshot() {
  const raw = safeLocalStorageGet(LS_STATS_SNAPSHOT);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") statsSnapshot = obj;
  } catch {}
}

function guardarStatsSnapshot(snap, { markDirty = true } = {}) {
  statsSnapshot = snap || null;
  safeLocalStorageSet(LS_STATS_SNAPSHOT, JSON.stringify(statsSnapshot || {}));

  // Queremos que se sincronice con Supabase, pero NO cuando viene de un pull
  if (markDirty && !sbApplyingCloud) sbMarkDirty();
}

function calcularStatsDesdeEstado() {
  // Estadísticas SOLO desde `estado` (idempotente => nunca duplica)
  let distinct = 0;     // cartas distintas con qty > 0
  let totalQty = 0;     // suma de qty
  let foilQty = 0;      // suma de foilQty
  let riCount = 0;      // nº de cartas con wantMore

  const countersCfg = getEnabledCountersConfig();
  const tagsCfg = getEnabledTagsConfig();
  const counterTotals = {};
  const tagTotals = {};
  countersCfg.forEach(c => { counterTotals[c.key] = 0; });
  tagsCfg.forEach(t => { tagTotals[t.key] = 0; });

  const estado2Keys = Object.keys(estado2 || {});
  if (estado2Keys.length > 0) {
    for (const oracleId of estado2Keys) {
      const st2 = getEstadoCarta2(oracleId);
      const q = Number(st2.qty_en || 0) + Number(st2.qty_es || 0);
      if (q > 0) distinct++;
      totalQty += q;
      foilQty += Number(st2.foil_en || 0) + Number(st2.foil_es || 0);
      if (st2.ri_en || st2.ri_es) riCount++;

      for (const c of countersCfg) {
        if (c.key === "qty") {
          counterTotals[c.key] += q;
        } else if (c.key === "foil") {
          counterTotals[c.key] += Number(st2.foil_en || 0) + Number(st2.foil_es || 0);
        } else {
          counterTotals[c.key] += Number(st2.counters_en?.[c.key] || 0) + Number(st2.counters_es?.[c.key] || 0);
        }
      }

      for (const t of tagsCfg) {
        if (t.key === "ri") {
          if (st2.ri_en || st2.ri_es) tagTotals[t.key] += 1;
        } else {
          if (st2.tags_en?.[t.key] || st2.tags_es?.[t.key]) tagTotals[t.key] += 1;
        }
      }
    }
  } else {
    // Fallback legacy
    for (const id of Object.keys(estado || {})) {
      const st = getEstadoCarta(id); // normaliza
      const q = Number(st.qty || 0);
      if (q > 0) distinct++;
      totalQty += q;
      foilQty += Number(st.foilQty || 0);
      if (st.wantMore) riCount++;

      for (const c of countersCfg) {
        if (c.key === "qty") counterTotals[c.key] += q;
        if (c.key === "foil") counterTotals[c.key] += Number(st.foilQty || 0);
      }

      for (const t of tagsCfg) {
        if (t.key === "ri" && st.wantMore) tagTotals[t.key] += 1;
      }
    }
  }

  // Stats por sets (coordinado con colecciones)
  const setKeys = setMetaByKey.size > 0 ? Array.from(setMetaByKey.keys()) : Object.keys(progresoPorSet || {});
  const totalColecciones = setKeys.length;

  let conAlguna = 0;
  let completas = 0;
  let sumTengo = 0;
  let sumTotal = 0;

  for (const setKey of setKeys) {
    const p = progresoDeColeccion(setKey);
    const t = Number(p.total);
    const h = Number(p.tengo || 0);
    if (h > 0) conAlguna++;
    if (Number.isFinite(t) && t > 0) {
      sumTotal += t;
      sumTengo += Math.min(h, t);
      if (h === t) completas++;
    }
  }

  const pctGlobal = sumTotal > 0 ? Math.round((sumTengo / sumTotal) * 100) : null;

  return {
    version: 1,
    updatedAt: Date.now(),
    resumen: { distinct, totalQty, foilQty, riCount },
    controlsStats: {
      counters: countersCfg.map(c => ({ key: c.key, label: c.label, value: counterTotals[c.key] || 0 })),
      tags: tagsCfg.map(t => ({ key: t.key, label: t.label, value: tagTotals[t.key] || 0 }))
    },
    sets: { totalColecciones, conAlguna, completas, pctGlobal }
  };
}

function actualizarStatsSnapshot({ render = false } = {}) {
  const snap = calcularStatsDesdeEstado();
  guardarStatsSnapshot(snap, { markDirty: true });

  if (render) renderEstadisticas({ forceRecalc: false });
}

function renderStatsDesdeSnapshot(snap) {
  const elResumen = document.getElementById("statsResumen");
  const elSets = document.getElementById("statsSets");

  if (!elResumen || !elSets) return;

  if (!snap || !snap.resumen) {
    elResumen.textContent = "—";
    elSets.textContent = "—";
    return;
  }

  const r = snap.resumen;
  const s = snap.sets || {};
  const controlsStats = snap.controlsStats || { counters: [], tags: [] };

  const resumenItems = [
    { label: "Total de cartas en colección", value: r.distinct }
  ];

  for (const c of controlsStats.counters || []) {
    resumenItems.push({ label: c.label, value: c.value });
  }

  for (const t of controlsStats.tags || []) {
    resumenItems.push({ label: t.label, value: t.value });
  }

  elResumen.innerHTML = `
    <div class="stat-grid">
      ${resumenItems.map(item => `<div class="stat"><div class="k">${escapeHtml(String(item.label))}</div><div class="v">${item.value}</div></div>`).join("")}
    </div>
    <div class="hint" style="margin-top:10px;">
      Última actualización: ${snap.updatedAt ? new Date(snap.updatedAt).toLocaleString() : "—"}
    </div>
  `;

  const pctTxt = (s.pctGlobal == null) ? "—" : `${s.pctGlobal}%`;

  elSets.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="k">Colecciones (idioma) conocidas</div><div class="v">${s.totalColecciones ?? 0}</div></div>
      <div class="stat"><div class="k">Con alguna carta</div><div class="v">${s.conAlguna ?? 0}</div></div>
      <div class="stat"><div class="k">Completas</div><div class="v">${s.completas ?? 0}</div></div>
      <div class="stat"><div class="k">% global</div><div class="v">${pctTxt}</div></div>
    </div>
  `;
}

function renderEstadisticas({ forceRecalc = false } = {}) {
  // 1) pinta instantáneo desde snapshot si existe
  if (statsSnapshot) renderStatsDesdeSnapshot(statsSnapshot);

  // 2) si no hay snapshot, calcula una vez (para no ver “—”)
  if (!statsSnapshot) {
    const snap = calcularStatsDesdeEstado();
    guardarStatsSnapshot(snap, { markDirty: false });
    renderStatsDesdeSnapshot(snap);
    return;
  }

  // 3) si fuerzas recálculo
  if (forceRecalc) {
    const snap = calcularStatsDesdeEstado();
    guardarStatsSnapshot(snap, { markDirty: true });
    renderStatsDesdeSnapshot(snap);
  }
}

function actualizarProgresoGuardado(setKey) {
  const lista = cacheCartasPorSetLang[setKey];
  if (!lista) return; // si no hay cartas cargadas, no podemos calcular total

  const { total, tengo } = computeProgresoFromList(lista);
  progresoPorSet[setKey] = { total, tengo, updatedAt: Date.now() };
  guardarProgresoPorSet();
}

function actualizarProgresoSetActualSiSePuede() {
  if (!setActualKey) return;
  if (!cacheCartasPorSetLang[setActualKey]) return; // si no está cargado, no podemos contar
  actualizarProgresoGuardado(setActualKey);          // esto ya guarda en localStorage
}

function computeProgresoFromList(lista) {
  const total = Array.isArray(lista) ? lista.length : 0;
  const tengo = Array.isArray(lista)
    ? lista.filter(c => {
        if (!c.oracle_id) return getEstadoCarta(c.id).qty > 0; // Fallback legacy
        const st2 = getEstadoCarta2(c.oracle_id);
        return (st2.qty_en + st2.qty_es) > 0;
      }).length
    : 0;
  return { total, tengo };
}

async function recomputeAllProgressFromCache() {
  const updated = new Set();
  const now = Date.now();

  // 1) RAM cache
  for (const [setKey, lista] of Object.entries(cacheCartasPorSetLang || {})) {
    if (!Array.isArray(lista)) continue;
    const { total, tengo } = computeProgresoFromList(lista);
    progresoPorSet[setKey] = { total, tengo, updatedAt: now };
    updated.add(setKey);
  }

  // 2) IndexedDB cache
  try {
    const db = await openCardsDB();
    const tx = db.transaction(STORE_SETS, 'readonly');
    const store = tx.objectStore(STORE_SETS);

    await new Promise((resolve) => {
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return resolve();

        const data = cursor.value;
        if (data && data.setKey && Array.isArray(data.cards) && !updated.has(data.setKey)) {
          const { total, tengo } = computeProgresoFromList(data.cards);
          progresoPorSet[data.setKey] = { total, tengo, updatedAt: now };
        }

        cursor.continue();
      };
      request.onerror = () => resolve();
    });
  } catch (err) {
    if (DEBUG) console.warn('Error recalculando progreso desde IndexedDB:', err);
  }

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

    // migración intermedia: si venía como boolean foil, pásalo a foilQty
if (st && typeof st === "object" && ("foil" in st) && !("foilQty" in st)) {
  const qty = clampInt(Number(st.qty ?? (st.tengo ? 1 : 0)), 0, 999);
  // antes era checkbox => interpretamos “tengo 1 foil”
  st.foilQty = (st.foil && qty > 0) ? 1 : 0;
  delete st.foil;
  cambiado = true;
}
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
  const raw = safeLocalStorageGet(LS_KEY);
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
  safeLocalStorageSet(LS_KEY, JSON.stringify(estado));
  if (typeof sbMarkDirty === "function") sbMarkDirty();
  cargarStatsSnapshot();
}

function normalizarEstadoCarta(st) {
  const qty = clampInt(Number(st.qty ?? 0), 0, 999);

  // foilQty: 0..qty
  const foilQty = clampInt(Number(st.foilQty ?? 0), 0, qty);

  // playedQty: 0..qty
  const playedQty = clampInt(Number(st.playedQty ?? 0), 0, qty);

  const wantMore = !!st.wantMore;

  return { qty, foilQty, playedQty, wantMore };
}

function ensureEstadoCarta(id) {
  const key = String(id);
  if (!estado[key]) {
    estado[key] = { qty: 0, foilQty: 0, playedQty: 0, wantMore: false };
  }
  return estado[key];
}

function getEstadoCarta(id) {
  const key = String(id);
  const st = estado[key];

  if (!st) return { qty: 0, foilQty: 0, playedQty: 0, wantMore: false };

  const norm = normalizarEstadoCarta(st);
  estado[key] = norm;
  return norm;
}


function setQty(id, value) {
  const st = ensureEstadoCarta(id);
  const qty = clampInt(Number(value), 0, 999);

  st.qty = qty;

  if (st.playedQty > st.qty) st.playedQty = st.qty;
  if ((st.foilQty ?? 0) > st.qty) st.foilQty = st.qty;

  if (st.qty === 0) {
    st.foilQty = 0;
    st.playedQty = 0;
  }

  guardarEstado();
  sbMarkDirty();
}

function setFoilQty(id, value) {
  const st = ensureEstadoCarta(id);
  st.foilQty = clampInt(Number(value), 0, st.qty);
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
// 2.5) NUEVO ESTADO v2: Por oracle_id con idiomas separados
// ===============================

const LS_KEY_V2 = "mtg_coleccion_estado_v2";
const LS_ORACLE_CACHE = "mtg_oracle_id_cache_v1";

let estado2 = {}; // oracle_id -> { qty_en, qty_es, foil_en, foil_es, ri_en, ri_es, counters_en, counters_es, tags_en, tags_es }
let estadoLegacyById = {}; // Copia temporal del estado legacy (por id) para migración
let oracleIdCache = {}; // id -> { oracle_id, lang } - cache de resolución

// Índice para búsqueda rápida: oracle_id -> { en: "id-en", es: "id-es" }
let oracleToIds = {};

// Cola de IDs legacy pendientes de resolver
let pendingLegacyIds = new Set();
let resolvingLegacyIds = false;

// ===== Validación y normalización =====

function normalizeCounterMap(map) {
  const out = {};
  if (!map || typeof map !== "object") return out;
  for (const [k, v] of Object.entries(map)) {
    const key = String(k || "").trim();
    if (!key) continue;
    out[key] = clampInt(Number(v ?? 0), 0, 999);
  }
  return out;
}

function normalizeTagMap(map) {
  const out = {};
  if (!map || typeof map !== "object") return out;
  for (const [k, v] of Object.entries(map)) {
    const key = String(k || "").trim();
    if (!key) continue;
    out[key] = !!v;
  }
  return out;
}

function normalizarEstadoCarta2(st) {
  const qty_en = clampInt(Number(st.qty_en ?? 0), 0, 999);
  const qty_es = clampInt(Number(st.qty_es ?? 0), 0, 999);
  
  // foil no puede exceder qty
  const foil_en = clampInt(Number(st.foil_en ?? 0), 0, qty_en);
  const foil_es = clampInt(Number(st.foil_es ?? 0), 0, qty_es);
  
  const ri_en = !!st.ri_en;
  const ri_es = !!st.ri_es;

  const counters_en = normalizeCounterMap(st.counters_en);
  const counters_es = normalizeCounterMap(st.counters_es);
  const tags_en = normalizeTagMap(st.tags_en);
  const tags_es = normalizeTagMap(st.tags_es);
  
  return { qty_en, qty_es, foil_en, foil_es, ri_en, ri_es, counters_en, counters_es, tags_en, tags_es };
}

function ensureEstadoCarta2(oracle_id) {
  const key = String(oracle_id);
  if (!estado2[key]) {
    estado2[key] = { qty_en: 0, qty_es: 0, foil_en: 0, foil_es: 0, ri_en: false, ri_es: false, counters_en: {}, counters_es: {}, tags_en: {}, tags_es: {} };
  }
  return estado2[key];
}

// ===== API pública v2 =====

function getEstadoCarta2(oracle_id) {
  if (!oracle_id) return { qty_en: 0, qty_es: 0, foil_en: 0, foil_es: 0, ri_en: false, ri_es: false, counters_en: {}, counters_es: {}, tags_en: {}, tags_es: {} };
  
  const key = String(oracle_id);
  const st = estado2[key];
  
  if (!st) return { qty_en: 0, qty_es: 0, foil_en: 0, foil_es: 0, ri_en: false, ri_es: false, counters_en: {}, counters_es: {}, tags_en: {}, tags_es: {} };
  
  const norm = normalizarEstadoCarta2(st);
  estado2[key] = norm;
  return norm;
}

function setQtyLang(oracle_id, lang, value) {
  if (!oracle_id || oracle_id === 'undefined' || oracle_id === 'null') {
    console.warn('setQtyLang: oracle_id inválido', oracle_id);
    return;
  }
  
  const st = ensureEstadoCarta2(oracle_id);
  const qty = clampInt(Number(value), 0, 999);
  const langKey = lang === "es" ? "qty_es" : "qty_en";
  const foilKey = lang === "es" ? "foil_es" : "foil_en";
  
  st[langKey] = qty;
  
  // Ajustar foil si qty baja
  if (st[foilKey] > qty) st[foilKey] = qty;
  
  // Si qty llega a 0, limpiar foil
  if (qty === 0) st[foilKey] = 0;
  
  guardarEstado2();
  sbMarkDirty();
  actualizarProgresoSetActualSiSePuede();
  scheduleStatsSnapshotUpdate({ renderIfVisible: true });
}

function setFoilLang(oracle_id, lang, value) {
  if (!oracle_id || oracle_id === 'undefined' || oracle_id === 'null') {
    console.warn('setFoilLang: oracle_id inválido', oracle_id);
    return;
  }
  
  const st = ensureEstadoCarta2(oracle_id);
  const qtyKey = lang === "es" ? "qty_es" : "qty_en";
  const foilKey = lang === "es" ? "foil_es" : "foil_en";
  
  st[foilKey] = clampInt(Number(value), 0, st[qtyKey]);
  
  guardarEstado2();
  sbMarkDirty();
  scheduleStatsSnapshotUpdate({ renderIfVisible: true });
}

function setRiLang(oracle_id, lang, value) {
  if (!oracle_id || oracle_id === 'undefined' || oracle_id === 'null') {
    console.warn('setRiLang: oracle_id inválido', oracle_id);
    return;
  }
  
  const st = ensureEstadoCarta2(oracle_id);
  const riKey = lang === "es" ? "ri_es" : "ri_en";
  
  st[riKey] = !!value;
  
  guardarEstado2();
  sbMarkDirty();
  scheduleStatsSnapshotUpdate({ renderIfVisible: true });
}

function getCounterValue(st2, lang, key) {
  if (key === "qty") return lang === "es" ? st2.qty_es : st2.qty_en;
  if (key === "foil") return lang === "es" ? st2.foil_es : st2.foil_en;
  const map = lang === "es" ? (st2.counters_es || {}) : (st2.counters_en || {});
  return Number(map[key] ?? 0);
}

function setCounterLang(oracle_id, lang, key, value) {
  if (!oracle_id || oracle_id === 'undefined' || oracle_id === 'null') {
    console.warn('setCounterLang: oracle_id inválido', oracle_id);
    return;
  }
  if (key === "qty") {
    setQtyLang(oracle_id, lang, value);
    return;
  }
  if (key === "foil") {
    setFoilLang(oracle_id, lang, value);
    return;
  }

  const st = ensureEstadoCarta2(oracle_id);
  const mapKey = lang === "es" ? "counters_es" : "counters_en";
  if (!st[mapKey] || typeof st[mapKey] !== "object") st[mapKey] = {};
  st[mapKey][key] = clampInt(Number(value ?? 0), 0, 999);

  guardarEstado2();
  sbMarkDirty();
  scheduleStatsSnapshotUpdate({ renderIfVisible: true });
}

function getTagValue(st2, lang, key) {
  if (key === "ri") return lang === "es" ? !!st2.ri_es : !!st2.ri_en;
  const map = lang === "es" ? (st2.tags_es || {}) : (st2.tags_en || {});
  return !!map[key];
}

function setTagLang(oracle_id, lang, key, value) {
  if (!oracle_id || oracle_id === 'undefined' || oracle_id === 'null') {
    console.warn('setTagLang: oracle_id inválido', oracle_id);
    return;
  }
  if (key === "ri") {
    setRiLang(oracle_id, lang, value);
    return;
  }

  const st = ensureEstadoCarta2(oracle_id);
  const mapKey = lang === "es" ? "tags_es" : "tags_en";
  if (!st[mapKey] || typeof st[mapKey] !== "object") st[mapKey] = {};
  st[mapKey][key] = !!value;

  guardarEstado2();
  sbMarkDirty();
  scheduleStatsSnapshotUpdate({ renderIfVisible: true });
}

// ===== UI: Alternancia de idioma por carta =====
let uiLangByOracle = {}; // { oracle_id: "en"|"es" } - idioma activo en UI para cada carta
let cacheCardByOracleLang = {}; // { oracle_id: { en: cardData, es: cardData } } - cache de prints por idioma
let fetchingPrints = new Set(); // oracle_ids siendo buscados (evitar duplicados)

const LS_UI_LANG = "mtg_ui_lang_by_oracle_v1";

function cargarUILangByOracle() {
  const raw = safeLocalStorageGet(LS_UI_LANG);
  if (!raw) return;
  try {
    uiLangByOracle = JSON.parse(raw) || {};
  } catch (e) {
    console.warn("UI lang cache corrupto:", e);
    uiLangByOracle = {};
  }
}

function guardarUILangByOracle() {
  safeLocalStorageSet(LS_UI_LANG, JSON.stringify(uiLangByOracle));
}

function getUILang(oracle_id) {
  return uiLangByOracle[oracle_id] || "en";
}

function setUILang(oracle_id, lang) {
  uiLangByOracle[oracle_id] = lang;
  guardarUILangByOracle();
}

// Buscar print de una carta por oracle_id y lang en Scryfall
async function getPrintByOracleLang(oracle_id, lang, preferredSetCode = null, preferredCollectorNumber = null) {
  if (!oracle_id) return null;
  
  // Si es EN, devolver la carta ya cargada (no fetch adicional)
  if (lang === "en") {
    // Buscar en cache de cartas cargadas
    for (const [setKey, cartas] of Object.entries(cacheCartasPorSetLang)) {
      const found = cartas.find(c => c.oracle_id === oracle_id && c.lang === "en");
      if (found) {
        if (!cacheCardByOracleLang[oracle_id]) cacheCardByOracleLang[oracle_id] = {};
        cacheCardByOracleLang[oracle_id].en = found;
        return found;
      }
    }
    return null;
  }
  
  // Para ES, revisar cache primero
  if (cacheCardByOracleLang[oracle_id]?.es) {
    console.log(`✓ Print ES cacheado para oracle ${oracle_id}`);
    return cacheCardByOracleLang[oracle_id].es;
  }
  
  // Evitar búsquedas duplicadas simultáneas
  const fetchKey = `${oracle_id}_${lang}`;
  if (fetchingPrints.has(fetchKey)) {
    console.log(`⏳ Ya se está buscando print ${lang} para oracle ${oracle_id}`);
    return null;
  }
  
  fetchingPrints.add(fetchKey);
  
  try {
    let query = `oracleid:${oracle_id} lang:${lang}`;
    let cards = [];
    
    // Estrategia 1: Priorizar mismo set si se proporciona
    if (preferredSetCode) {
      const priorityQuery = `${query} set:${preferredSetCode}`;
      console.log(`🔍 Buscando print ES prioritario: ${priorityQuery}`);
      cards = await scrySearchCards(priorityQuery);
      
      if (cards.length > 0) {
        console.log(`✓ Encontrados ${cards.length} prints ES en set ${preferredSetCode}`);
      }
    }
    
    // Estrategia 2: Si no hay match con set específico, buscar cualquier print ES
    if (cards.length === 0) {
      console.log(`🔍 Buscando cualquier print ES: ${query}`);
      cards = await scrySearchCards(query);
      
      if (cards.length > 0) {
        console.log(`✓ Encontrados ${cards.length} prints ES en otros sets`);
      }
    }
    
    if (cards.length === 0) {
      console.log(`✗ No se encontró ningún print ${lang} para oracle ${oracle_id}`);
      fetchingPrints.delete(fetchKey);
      return null;
    }
    
    // Intentar encontrar con mismo collector_number
    let selectedCard = null;
    if (preferredCollectorNumber) {
      selectedCard = cards.find(c => c.collector_number === preferredCollectorNumber);
      if (selectedCard) {
        console.log(`✓ Match exacto: set ${selectedCard.set} #${selectedCard.collector_number}`);
      }
    }
    
    // Si no hay match exacto, tomar el primero con imagen
    if (!selectedCard) {
      selectedCard = cards.find(c => {
        const imgUrl = c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal;
        return imgUrl !== null && imgUrl !== undefined;
      });
      
      if (!selectedCard) {
        selectedCard = cards[0]; // Fallback al primero aunque no tenga imagen
      }
      
      if (selectedCard) {
        console.log(`→ Seleccionado: set ${selectedCard.set} #${selectedCard.collector_number}`);
      }
    }
    
    // Guardar en cache
    if (!cacheCardByOracleLang[oracle_id]) {
      cacheCardByOracleLang[oracle_id] = {};
    }
    cacheCardByOracleLang[oracle_id][lang] = selectedCard;
    
    fetchingPrints.delete(fetchKey);
    return selectedCard;
    
  } catch (err) {
    console.error(`✗ Error buscando print ${lang} para oracle ${oracle_id}:`, err);
    fetchingPrints.delete(fetchKey);
    return null;
  }
}

// ===== Guardado/Carga v2 =====

function cargarEstado2() {
  // Cargar estado v2
  const raw2 = safeLocalStorageGet(LS_KEY_V2);
  if (raw2) {
    try {
      estado2 = JSON.parse(raw2) || {};
    } catch (e) {
      console.warn("Estado v2 corrupto en localStorage, se reinicia:", e);
      estado2 = {};
    }
  }
  
  // Cargar cache de oracle_id
  const rawCache = safeLocalStorageGet(LS_ORACLE_CACHE);
  if (rawCache) {
    try {
      oracleIdCache = JSON.parse(rawCache) || {};
    } catch (e) {
      console.warn("Oracle cache corrupto, se reinicia:", e);
      oracleIdCache = {};
    }
  }
  
  // Cargar estado legacy para migración
  const rawLegacy = safeLocalStorageGet(LS_KEY);
  if (rawLegacy) {
    try {
      estadoLegacyById = JSON.parse(rawLegacy) || {};
    } catch (e) {
      console.warn("Estado legacy corrupto:", e);
      estadoLegacyById = {};
    }
  }
  
  console.log(`Estado cargado: ${Object.keys(estado2).length} cartas v2, ${Object.keys(estadoLegacyById).length} legacy`);
}

function guardarEstado2(immediate = false) {
  if (immediate) {
    // Guardar inmediatamente (usado en sync, logout, etc)
    clearTimeout(saveEstado2Timeout);
    safeLocalStorageSet(LS_KEY_V2, JSON.stringify(estado2));
    if (typeof sbMarkDirty === "function") sbMarkDirty();
    return;
  }
  // Usar debounce por defecto
  guardarEstado2Debounced();
}

function guardarOracleCache() {
  safeLocalStorageSet(LS_ORACLE_CACHE, JSON.stringify(oracleIdCache));
}

// ===== Construcción de índice oracle_id -> ids =====

function construirIndiceOracleToIds() {
  oracleToIds = {};
  
  // Recorrer todas las cartas cargadas en cache
  for (const [setKey, cartas] of Object.entries(cacheCartasPorSetLang)) {
    if (!Array.isArray(cartas)) continue;
    
    cartas.forEach(carta => {
      if (!carta.oracle_id || !carta.id) return;
      
      const oracle = String(carta.oracle_id);
      const lang = String(carta.lang || "en").toLowerCase();
      const id = String(carta.id);
      
      if (!oracleToIds[oracle]) {
        oracleToIds[oracle] = {};
      }
      
      if (lang === "en") {
        oracleToIds[oracle].en = id;
      } else if (lang === "es") {
        oracleToIds[oracle].es = id;
      }
      
      // Actualizar cache de resolución
      if (!oracleIdCache[id]) {
        oracleIdCache[id] = { oracle_id: oracle, lang };
      }
    });
  }
  
  guardarOracleCache();
  console.log(`Índice oracle_id construido: ${Object.keys(oracleToIds).length} cartas únicas`);
}

// ===== Migración progresiva desde estado legacy =====

async function migrarEstadoLegacy() {
  if (Object.keys(estadoLegacyById).length === 0) {
    console.log("No hay estado legacy para migrar");
    return;
  }
  
  console.log("Iniciando migración de estado legacy...");
  
  // Construir índice desde cache actual
  construirIndiceOracleToIds();
  
  let migradosDirectos = 0;
  let pendientes = 0;
  
  // Primera pasada: migrar IDs que ya conocemos
  for (const [id, legacyState] of Object.entries(estadoLegacyById)) {
    // Buscar en cache
    const cached = oracleIdCache[id];
    
    if (cached && cached.oracle_id) {
      // Migrar directamente
      migrarEntradaLegacy(id, cached.oracle_id, cached.lang, legacyState);
      migradosDirectos++;
    } else {
      // Añadir a pendientes
      pendingLegacyIds.add(id);
      pendientes++;
    }
  }
  
  console.log(`Migración directa: ${migradosDirectos} cartas. Pendientes de resolver: ${pendientes}`);
  
  // Guardar progreso
  guardarEstado2();
  
  // Resolver pendientes de forma progresiva
  if (pendingLegacyIds.size > 0) {
    console.log(`Iniciando resolución progresiva de ${pendingLegacyIds.size} IDs...`);
    resolverPendientesProgresivamente();
  }
}

function migrarEntradaLegacy(id, oracle_id, lang, legacyState) {
  const st = ensureEstadoCarta2(oracle_id);
  
  const langSuffix = lang === "es" ? "_es" : "_en";
  const qtyKey = `qty${langSuffix}`;
  const foilKey = `foil${langSuffix}`;
  const riKey = `ri${langSuffix}`;
  
  // Migrar qty
  if (typeof legacyState.qty === "number") {
    st[qtyKey] = Math.max(st[qtyKey], legacyState.qty);
  }
  
  // Migrar foilQty
  if (typeof legacyState.foilQty === "number") {
    st[foilKey] = Math.max(st[foilKey], legacyState.foilQty);
  }
  
  // Migrar wantMore
  if (legacyState.wantMore) {
    st[riKey] = true;
  }
  
  // Normalizar
  estado2[oracle_id] = normalizarEstadoCarta2(st);
}

// ===== Resolución progresiva con rate limiting =====

async function resolverPendientesProgresivamente() {
  if (resolvingLegacyIds) return; // Ya está en proceso
  
  resolvingLegacyIds = true;
  const batchSize = 5;
  const delayMs = 200; // 5 por segundo máximo
  
  const pendingArray = Array.from(pendingLegacyIds);
  
  for (let i = 0; i < pendingArray.length; i += batchSize) {
    const batch = pendingArray.slice(i, i + batchSize);
    
    await Promise.all(batch.map(id => resolverIdLegacy(id)));
    
    // Guardar progreso cada batch
    guardarEstado2();
    guardarOracleCache();
    
    // Delay entre batches
    if (i + batchSize < pendingArray.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  resolvingLegacyIds = false;
  console.log("Resolución de IDs legacy completada");
}

async function resolverIdLegacy(id) {
  if (!id) return;
  
  try {
    // Llamar a Scryfall para obtener oracle_id
    const url = `${SCY_BASE}/cards/${id}`;
    const card = await scryFetchJson(url);
    
    if (!card || !card.oracle_id) {
      console.warn(`No se pudo resolver oracle_id para ${id}`);
      pendingLegacyIds.delete(id);
      return;
    }
    
    const oracle_id = card.oracle_id;
    const lang = (card.lang || "en").toLowerCase();
    
    // Guardar en cache
    oracleIdCache[id] = { oracle_id, lang };
    
    // Migrar
    const legacyState = estadoLegacyById[id];
    if (legacyState) {
      migrarEntradaLegacy(id, oracle_id, lang, legacyState);
    }
    
    pendingLegacyIds.delete(id);
    
  } catch (err) {
    console.warn(`Error resolviendo ID ${id}:`, err);
    // No eliminar de pendientes por si queremos reintentar
  }
}

// ===== Helpers de compatibilidad (mantener getEstadoCarta para código legacy) =====

// Wrapper temporal para mantener compatibilidad con código existente
// Intentará usar estado2 si encuentra oracle_id, sino fallback a estado legacy
function getEstadoCarta_Compat(id) {
  // Buscar oracle_id para este id
  const cached = oracleIdCache[id];
  
  if (cached && cached.oracle_id) {
    // Usar estado2
    const st2 = getEstadoCarta2(cached.oracle_id);
    const lang = cached.lang || "en";
    
    const qtyKey = lang === "es" ? "qty_es" : "qty_en";
    const foilKey = lang === "es" ? "foil_es" : "foil_en";
    const riKey = lang === "es" ? "ri_es" : "ri_en";
    
    return {
      qty: st2[qtyKey],
      foilQty: st2[foilKey],
      playedQty: 0, // No usado
      wantMore: st2[riKey]
    };
  }
  
  // Fallback a estado legacy
  return getEstadoCarta(id);
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

async function scryFetchJson(url, opts = {}) {
  await scryDelay();
  const { signal } = opts || {};

  const res = await fetch(url, { headers: { "Accept": "application/json" }, signal });

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
async function scryFetchAllPages(firstUrl, opts = {}) {
  const all = [];
  let url = firstUrl;

  while (url) {
    const data = await scryFetchJson(url, opts);
    if (Array.isArray(data.data)) all.push(...data.data);
    url = data.has_more ? data.next_page : null;
  }
  return all;
}

// Búsqueda de cartas en Scryfall
async function scrySearchCards(query, opts = {}) {
  if (!query) return [];
  
  const params = new URLSearchParams();
  params.append('q', query);
  
  if (opts.unique) {
    params.append('unique', opts.unique);
  }
  
  const url = `${SCY_BASE}/cards/search?${params.toString()}`;
  
  try {
    const data = await scryFetchJson(url);
    
    // Scryfall devuelve object:"error" si no hay resultados
    if (data.object === "error") {
      console.log(`Scryfall search no results: ${data.details || data.code}`);
      return [];
    }
    
    return data.data || [];
  } catch (err) {
    console.error(`Error en scrySearchCards("${query}"):`, err);
    return [];
  }
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

// Actualizar catálogo desde Scryfall
async function actualizarCatalogo({ silent = false } = {}) {
  const msgEl = document.getElementById("msgCatalogo");
  
  try {
    if (!silent && msgEl) msgEl.textContent = "Actualizando catálogo...";
    console.log("Actualizando catálogo desde Scryfall...");
    
    const sets = await scryGetSets();
    catalogoSets = sets.filter(s => !s.digital);
    
    console.log("Catálogo actualizado:", catalogoSets.length, "sets");
    
    // Guardar en cache
    guardarCatalogo();
    
    // Reconstruir lista para UI
    reconstruirCatalogoColecciones();
    
    // Actualizar UI si estamos en colecciones
    if (typeof renderColecciones === "function") {
      renderColecciones();
    }
    
    if (!silent && msgEl) {
      msgEl.textContent = `Actualizado correctamente (${catalogoSets.length} sets)`;
      setTimeout(() => { if (msgEl) msgEl.textContent = ""; }, 3000);
    }
    
    return true;
  } catch (err) {
    console.error("Error actualizando catálogo:", err);
    if (!silent && msgEl) {
      msgEl.textContent = `Error: ${err.message || "No se pudo conectar"}`;
    }
    return false;
  }
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
const COMMANDER_SEARCH_LIMIT = 200;
let buscarExacta = false;
let buscarVerImagenes = false;

async function scryFetchAllPagesLimited(firstUrl, limit = 200, opts = {}) {
  const all = [];
  let url = firstUrl;

  while (url && all.length < limit) {
    const data = await scryFetchJson(url, opts);
    if (Array.isArray(data.data)) all.push(...data.data);
    url = (data.has_more && all.length < limit) ? data.next_page : null;
  }
  return all;
}

function buildNameQuery(qUser, exact = false) {
  // Si hay espacios, comillas. También quitamos comillas del usuario.
  const safe = String(qUser || "").replace(/"/g, "").trim();
  if (!safe) return "";
  if (exact) return `!"${safe}"`;
  return /\s/.test(safe) ? `name:"${safe}"` : `name:${safe}`;
}

async function scrySearchPrintsByName(texto, opts = {}) {
  const qUser = (texto || "").trim();
  if (!qUser) return [];

  const nameClause = buildNameQuery(qUser, !!opts.exact);
  if (!nameClause) return [];

  // Solo papel, solo EN/ES, y búsqueda flexible por nombre
  const query = `game:paper (lang:en or lang:es) ${nameClause}`;
  const q = encodeURIComponent(query);
  const url = `${SCY_BASE}/cards/search?q=${q}&unique=prints&order=released&dir=desc`;

  try {
    return await scryFetchAllPagesLimited(url, SEARCH_LIMIT, opts);
  } catch (err) {
    // Si no encuentra nada, Scryfall suele devolver 404 not_found
    if (err.status === 404 && err.data && err.data.object === "error" && err.data.code === "not_found") {
      return [];
    }
    throw err;
  }
}

async function scrySearchCommanders(query, opts = {}) {
  if (!query) return [];

  const params = new URLSearchParams();
  params.append("q", query);

  if (opts.unique) params.append("unique", opts.unique);

  const url = `${SCY_BASE}/cards/search?${params.toString()}`;

  try {
    return await scryFetchAllPagesLimited(url, COMMANDER_SEARCH_LIMIT, opts);
  } catch (err) {
    if (err.status === 404 && err.data && err.data.object === "error" && err.data.code === "not_found") {
      return [];
    }
    throw err;
  }
}

function getBuscarExacta() {
  const chk = document.getElementById("chkBuscarExacta");
  return chk ? !!chk.checked : !!buscarExacta;
}

function getBuscarVerImagenes() {
  const chk = document.getElementById("chkBuscarVerImagenes");
  return chk ? !!chk.checked : !!buscarVerImagenes;
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
        // Usar estado2 con oracle_id
        const st2 = getEstadoCarta2(v.oracle_id);

        return {
          id: v.id, // UUID (por si se necesita)
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
          st2
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
let catalogoLastUpdate = null;    // timestamp de última actualización

// Guardar catálogo en localStorage
function guardarCatalogo() {
  try {
    safeLocalStorageSet(LS_CATALOGO_SETS, JSON.stringify(catalogoSets));
    const timestamp = Date.now();
    safeLocalStorageSet(LS_CATALOGO_TIMESTAMP, timestamp.toString());
    catalogoLastUpdate = timestamp;
    console.log("Catálogo guardado en cache:", catalogoSets.length, "sets");
  } catch (err) {
    console.warn("Error guardando catálogo en localStorage:", err);
  }
}

// Cargar catálogo desde localStorage
function cargarCatalogo() {
  try {
    const rawSets = safeLocalStorageGet(LS_CATALOGO_SETS);
    const rawTimestamp = safeLocalStorageGet(LS_CATALOGO_TIMESTAMP);
    
    if (rawSets) {
      catalogoSets = JSON.parse(rawSets);
      catalogoLastUpdate = rawTimestamp ? parseInt(rawTimestamp, 10) : null;
      console.log("Catálogo cargado desde cache:", catalogoSets.length, "sets");
      return true;
    }
  } catch (err) {
    console.warn("Error cargando catálogo desde localStorage:", err);
  }
  return false;
}

// Obtener fecha de última actualización formateada
function getFechaUltimaActualizacion() {
  if (!catalogoLastUpdate) return "Nunca";
  
  const fecha = new Date(catalogoLastUpdate);
  const ahora = new Date();
  const diffMs = ahora - fecha;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHoras = Math.floor(diffMs / 3600000);
  const diffDias = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "Hace un momento";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHoras < 24) return `Hace ${diffHoras}h`;
  if (diffDias < 7) return `Hace ${diffDias} días`;
  
  return fecha.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

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
      set_type: s.set_type || "",
      digital: !!s.digital,
      icon_svg_uri: s.icon_svg_uri || ""
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
  // Verificar si ya está en memoria RAM
  if (cacheCartasPorSetLang[setKey]) {
    const primeracarta = cacheCartasPorSetLang[setKey][0];
    if (primeracarta && primeracarta.type_line !== undefined) {
      return; // Ya está cargado con la estructura correcta
    }
    // Si no tiene type_line, recargar
    delete cacheCartasPorSetLang[setKey];
  }

  const [codeRaw, langRaw] = String(setKey).split("__");
  const code = String(codeRaw || "").toLowerCase();
  const lang = String(langRaw || "en").toLowerCase();

  // 🚀 OPTIMIZACIÓN: Intentar cargar desde IndexedDB primero
  const cachedData = await getSetFromDB(setKey);
  
  if (cachedData && cachedData.cards && Array.isArray(cachedData.cards)) {
    // ✅ Encontrado en cache - carga instantánea
    cacheCartasPorSetLang[setKey] = cachedData.cards;
    actualizarProgresoGuardado(setKey);
    construirIndiceOracleToIds();
    
    // Mostrar indicador visual temporal
    const progresoEl = document.getElementById("progresoSet");
    if (progresoEl) {
      const oldText = progresoEl.textContent;
      progresoEl.textContent += " ⚡ (cargado desde cache)";
      setTimeout(() => {
        if (progresoEl.textContent.includes("⚡")) {
          progresoEl.textContent = oldText;
        }
      }, 2000);
    }
    
    return;
  }

  // ⬇️ No está en cache o expiró - descargar desde Scryfall
  console.log(`📡 Descargando ${setKey} desde Scryfall...`);
  const cards = await scryGetCardsBySetAndLang(code, lang);

  const processedCards = cards.map(card => ({
    id: card.id, // UUID string
    oracle_id: card.oracle_id,
    nombre: pickCardName(card, lang),
    numero: card.collector_number,
    rareza: mapRarity(card.rarity),
    lang,
    type_line: card.type_line || '',
    cmc: card.cmc || 0,
    color_identity: card.color_identity || [],
    _img: pickImage(card),
    _prices: card.prices || null,
    _colors: card.colors || null,
    _raw: card // Guardar objeto completo para acceder a card_faces
  }));

  cacheCartasPorSetLang[setKey] = processedCards;

  // 💾 Guardar en IndexedDB para futuras cargas
  saveSetToDB(setKey, processedCards).catch(err => {
    console.warn('No se pudo guardar en IndexedDB:', err);
  });

  // Guardar resumen (total/tengo) para que no vuelva a 0/? al reiniciar
  actualizarProgresoGuardado(setKey);
  
  // ✅ Actualizar índice oracle_id para facilitar migración
  construirIndiceOracleToIds();
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

    // 1) invalidar caché en memoria Y en IndexedDB (fuerza re-descarga desde Scryfall)
    if (cacheCartasPorSetLang && cacheCartasPorSetLang[setActualKey]) {
      delete cacheCartasPorSetLang[setActualKey];
    }
    
    // Limpiar de IndexedDB también para forzar descarga fresca con precios actualizados
    try {
      const db = await openCardsDB();
      const tx = db.transaction(STORE_SETS, 'readwrite');
      const store = tx.objectStore(STORE_SETS);
      await store.delete(setActualKey);
      console.log(`🗑️ Cache de ${setActualKey} eliminado de IndexedDB`);
    } catch (err) {
      console.warn('Error eliminando cache de IndexedDB:', err);
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
  const raw = safeLocalStorageGet(LS_HIDDEN_EMPTY_SETS);
  if (!raw) return;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) hiddenEmptySetKeys = new Set(arr);
  } catch {}
}

function guardarHiddenEmptySets() {
  safeLocalStorageSet(LS_HIDDEN_EMPTY_SETS, JSON.stringify([...hiddenEmptySetKeys]));
  if (typeof sbMarkDirty === "function") sbMarkDirty();
}

// ===============================
// Ocultar colecciones (persistente)
// ===============================

const LS_HIDDEN_COLLECTIONS = "mtg_hidden_collections_v1";
let hiddenCollections = new Set();

function cargarHiddenCollections() {
  const raw = safeLocalStorageGet(LS_HIDDEN_COLLECTIONS);
  if (!raw) return;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) hiddenCollections = new Set(arr);
  } catch {}
}

function guardarHiddenCollections() {
  safeLocalStorageSet(LS_HIDDEN_COLLECTIONS, JSON.stringify([...hiddenCollections]));
  if (typeof sbMarkDirty === "function") sbMarkDirty();
}

// ===============================
// Modal carta + precio
// ===============================

function abrirModalCarta({ titulo, imageUrl, numero, rareza, precio, navLista = null, navIndex = -1, cardData = null, oracleId = null }) {
  const modal = document.getElementById("modalCarta");
  const tit = document.getElementById("modalCartaTitulo");
  const body = document.getElementById("modalCartaBody");

  if (!modal || !tit || !body) return;

  tit.textContent = titulo || "Carta";

  // Guardamos estado para navegación
  if (Array.isArray(navLista) && navLista.length) {
    modalNavState.lista = navLista;
    modalNavState.idx = navIndex;
  } else {
    modalNavState.lista = null;
    modalNavState.idx = -1;
  }

  const infoBits = [];
  if (numero) infoBits.push(`#${numero}`);
  if (rareza) infoBits.push(rareza);
  const infoLinea = infoBits.length ? infoBits.join(" · ") : "";

  const precioTxt = precio || "—";

  const tieneNav = Array.isArray(navLista) && navLista.length > 0 && navIndex >= 0;
  const prevDisabled = !tieneNav || navIndex <= 0;
  const nextDisabled = !tieneNav || navIndex >= navLista.length - 1;

  // Detectar si es carta de doble cara
  const esDobleCaracardFaces = cardData?.card_faces?.length >= 2;
  const imagenCara1 = cardData?.card_faces?.[0]?.image_uris?.normal;
  const imagenCara2 = cardData?.card_faces?.[1]?.image_uris?.normal;
  
  // Variable para rastrear qué cara se muestra (la guardamos en el body como data attribute)
  let caraActual = 1;

  body.innerHTML = `
    <div class="card" style="margin-bottom:12px;">
      <div class="modal-info-row">
        <div class="modal-info-main">
          ${infoLinea ? `<div><strong>${infoLinea}</strong></div>` : ""}
          <div class="hint" style="margin-top:6px;">Precio orientativo: ${precioTxt}</div>
        </div>
        ${tieneNav ? `
        <div class="modal-nav">
          <button class="btn-secundario btn-nav-prev" type="button" ${prevDisabled ? "disabled" : ""} aria-label="Carta anterior">←</button>
          <button class="btn-secundario btn-nav-next" type="button" ${nextDisabled ? "disabled" : ""} aria-label="Carta siguiente">→</button>
        </div>
        ` : ""}
      </div>
    </div>
    ${esDobleCaracardFaces && imagenCara1 && imagenCara2 ? `
      <div style="position: relative; display: inline-block;">
        <img id="imgCartaModal" alt="${titulo || "Carta"}" loading="lazy" 
             data-cara1="${imagenCara1}" data-cara2="${imagenCara2}" data-cara-actual="1" />
        <button id="btnVoltearCarta" class="btn-voltear-carta" type="button" title="Voltear carta">
          🔄
        </button>
      </div>
    ` : (imageUrl ? `<img alt="${titulo || "Carta"}" loading="lazy" data-img-url="${imageUrl}" />`
              : `<div class="card"><p>No hay imagen disponible.</p></div>`)}
    ${oracleId ? generarControlesModalCarta(oracleId) : ''}
  `;

  const btnPrev = body.querySelector('.btn-nav-prev');
  const btnNext = body.querySelector('.btn-nav-next');
  const btnVoltear = body.querySelector('#btnVoltearCarta');
  const imgCarta = body.querySelector('#imgCartaModal');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => moverModalCarta(-1));
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => moverModalCarta(1));
  }
  
  if (imgCarta && imagenCara1) {
    loadImageWithCache(imgCarta, imagenCara1);
  } else if (imageUrl) {
    const imgSimple = body.querySelector('img[data-img-url]') || body.querySelector('img');
    if (imgSimple) loadImageWithCache(imgSimple, imageUrl);
  }

  if (btnVoltear && imgCarta) {
    btnVoltear.addEventListener('click', () => {
      const caraActual = parseInt(imgCarta.dataset.caraActual);
      const nuevaCara = caraActual === 1 ? 2 : 1;
      const nuevaImagen = nuevaCara === 1 ? imgCarta.dataset.cara1 : imgCarta.dataset.cara2;
      
      imgCarta.style.opacity = '0';
      setTimeout(() => {
        loadImageWithCache(imgCarta, nuevaImagen);
        imgCarta.dataset.caraActual = nuevaCara;
        imgCarta.style.opacity = '1';
      }, 150);
    });
  }

  // Event listeners para controles del modal (si existen)
  if (oracleId) {
    wireControlesModalCarta(body, oracleId);
  }

  modal.classList.remove("hidden");
}

function generarControlesModalCarta(oracleId) {
  const cfg = getCardControlsConfig();
  const langActivo = cfg.langMode === "both" ? getUILang(oracleId) : cfg.langMode;

  if (cfg.langMode !== "both") {
    return `
      <div class="card" style="margin-top: 16px;">
        <div class="carta-controles modal-controles" data-active-lang="${langActivo}" style="background: rgba(0,0,0,.06);">
          <div class="controles-header">
            <span class="lang-badge lang-active">
              <img class="flag-icon" src="icons/flag-${langActivo === "en" ? "en" : "es"}.svg" alt="${langActivo === "en" ? "EN" : "ES"}" />
              <span class="lang-label">${langActivo === "en" ? "EN" : "ES"}</span>
            </span>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card" style="margin-top: 16px;">
      <div class="carta-controles modal-controles" data-active-lang="${langActivo}" style="background: rgba(0,0,0,.06);">
        <!-- Header con botón de cambio de idioma (solo banderas pequeñas) -->
        <div class="controles-header">
          <button class="btn-lang-switch btn-modal-lang-switch" data-oracle="${oracleId}" type="button" title="Cambiar idioma" aria-label="Cambiar a idioma ${langActivo === "en" ? "español" : "inglés"}">
            <span class="lang-badge lang-active">
              <img class="flag-icon" src="icons/flag-${langActivo === "en" ? "en" : "es"}.svg" alt="${langActivo === "en" ? "EN" : "ES"}" />
              <span class="lang-label">${langActivo === "en" ? "EN" : "ES"}</span>
            </span>
            <span class="lang-switch-action">
              <span class="arrow">→</span>
              <img class="flag-icon flag-target-icon" src="icons/flag-${langActivo === "en" ? "es" : "en"}.svg" alt="${langActivo === "en" ? "ES" : "EN"}" />
            </span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function wireControlesModalCarta(container, oracleId) {
  // Toggle de idioma (único listener en el modal)
  container.querySelectorAll('.btn-modal-lang-switch').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (getCardControlsConfig().langMode !== "both") return;
      const cartaControles = btn.closest('.carta-controles');
      if (!cartaControles) return;
      
      // Prevenir clics múltiples
      if (cartaControles.dataset.animating === "true") return;
      cartaControles.dataset.animating = "true";
      
      const currentLang = cartaControles.dataset.activeLang || "en";
      const newLang = currentLang === "en" ? "es" : "en";
      setUILang(oracleId, newLang);
      
      // Actualizar atributo para animación CSS
      cartaControles.dataset.activeLang = newLang;
      
      // Actualizar badge activo: imagen y label
      const flagIcon = btn.querySelector(".lang-badge.lang-active .flag-icon");
      const langLabel = btn.querySelector(".lang-badge.lang-active .lang-label");
      const targetIcon = btn.querySelector(".flag-target-icon");
      
      if (flagIcon) flagIcon.src = `icons/flag-${newLang}.svg`;
      if (flagIcon) flagIcon.alt = newLang.toUpperCase();
      if (langLabel) langLabel.textContent = newLang === "en" ? "EN" : "ES";
      if (targetIcon) targetIcon.src = `icons/flag-${newLang === "en" ? "es" : "en"}.svg`;
      if (targetIcon) targetIcon.alt = newLang === "en" ? "ES" : "EN";
      
      // Actualizar aria-label
      btn.setAttribute("aria-label", `Cambiar a idioma ${newLang === "en" ? "español" : "inglés"}`);
      
      // Cambiar imagen del modal (si existe)
      const imgModal = document.querySelector('#imgCartaModal');
      const modalBody = document.getElementById('modalCartaBody');
      
      if (!imgModal && modalBody) {
        // Si no existe #imgCartaModal, buscar cualquier img en el modal (excepto botón de voltear)
        const allImgs = modalBody.querySelectorAll('img:not(#imgCartaModal)');
        if (allImgs.length > 0) {
          const firstImg = allImgs[0];
          
          if (newLang === "es") {
            // Buscar print ES y actualizar imagen
            const cartaItem = document.querySelector(`.carta-item[data-oracle="${oracleId}"]`);
            if (cartaItem) {
              const imgElement = cartaItem.querySelector('.carta-imagen');
              const setCode = imgElement?.dataset?.set || "";
              const numero = imgElement?.dataset?.numero || "";
              
              getPrintByOracleLang(oracleId, "es", setCode, numero).then(printES => {
                if (printES) {
                  const imgUrl = printES.image_uris?.normal || 
                               printES.card_faces?.[0]?.image_uris?.normal;
                  
                  if (imgUrl) {
                    if (!firstImg.dataset.imgEnOriginal) {
                      firstImg.dataset.imgEnOriginal = firstImg.dataset.imgCacheKey || firstImg.src;
                    }
                    console.log(`✅ Actualizando imagen modal a ES para ${oracleId}`);
                    loadImageWithCache(firstImg, imgUrl);
                  }
                }
              });
            }
          } else if (newLang === "en") {
            // Restaurar imagen EN
            if (firstImg.dataset.imgEnOriginal) {
              console.log(`✅ Restaurando imagen modal a EN para ${oracleId}`);
              loadImageWithCache(firstImg, firstImg.dataset.imgEnOriginal);
            }
          }
        }
      }
      
      // Desbloquear después de animación
      setTimeout(() => {
        cartaControles.dataset.animating = "false";
      }, 220);
    });
  });
}

function obtenerDatosCartaActual() {
  // Helper para reabrir el modal con los mismos datos
  if (!modalNavState.lista || modalNavState.idx < 0) return {};
  const c = modalNavState.lista[modalNavState.idx];
  if (!c) return {};
  
  return {
    titulo: c?.nombre || "Carta",
    imageUrl: c?._img || null,
    numero: c?.numero || "",
    rareza: c?.rareza || "",
    precio: formatPrecioEUR(c?._prices),
    navLista: modalNavState.lista,
    navIndex: modalNavState.idx,
    cardData: c?._raw || null
  };
}

function moverModalCarta(delta) {
  if (!modalNavState.lista || modalNavState.idx < 0) return;
  const nuevo = modalNavState.idx + delta;
  if (nuevo < 0 || nuevo >= modalNavState.lista.length) return;

  const c = modalNavState.lista[nuevo];
  if (!c) return;

  abrirModalCarta({
    titulo: c?.nombre || "Carta",
    imageUrl: c?._img || null,
    numero: c?.numero || "",
    rareza: c?.rareza || "",
    precio: formatPrecioEUR(c?._prices),
    navLista: modalNavState.lista,
    navIndex: nuevo,
    cardData: c?._raw || null,
    oracleId: c?.oracle_id || null
  });
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
  const raw = safeLocalStorageGet(LS_SETNAME_ES_BY_CODE);
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
  safeLocalStorageSet(LS_SETNAME_ES_BY_CODE, JSON.stringify(setNameEsByCode));
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
  menu: document.getElementById("pantallaMenu"),
  colecciones: document.getElementById("pantallaColecciones"),
  set: document.getElementById("pantallaSet"),
  buscar: document.getElementById("pantallaBuscar"),
  comandantes: document.getElementById("pantallaComandantes"),
  decks: document.getElementById("pantallaDecks"),
  verDeck: document.getElementById("pantallaVerDeck"),
  estadisticas: document.getElementById("pantallaEstadisticas"),
  cuenta: document.getElementById("pantallaCuenta")
};

// Sistema de navegación con historial para manejo del botón de retroceso del móvil
let historialNavegacion = ["menu"];
let manejandoPopstate = false;
let impedirSalidaApp = true; // Evita que la app se cierre al presionar retroceso

function mostrarPantalla(nombre, agregarAlHistorial = true) {
  Object.values(pantallas).forEach(p => {
    if (p) p.classList.remove("active");
  });
  if (pantallas[nombre]) pantallas[nombre].classList.add("active");
  
  // Agregar al historial de navegación interna
  if (agregarAlHistorial && !manejandoPopstate) {
    historialNavegacion.push(nombre);
    // Agregar un estado al historial del navegador para que el botón de retroceso funcione
    window.history.pushState({ pantalla: nombre }, "", "");
  }
  
  // Re-detectar scroller activo al cambiar vistas
  if (typeof updateScrollerOnViewChange === "function") {
    updateScrollerOnViewChange();
  }
}

function navegarAtras() {
  if (historialNavegacion.length > 1) {
    // Quitar la pantalla actual del historial
    historialNavegacion.pop();
    // Obtener la pantalla anterior
    const pantallaAnterior = historialNavegacion[historialNavegacion.length - 1];
    
    // Ejecutar lógica específica según la pantalla de destino
    if (pantallaAnterior === "colecciones") {
      aplicarUIFiltrosColecciones();
      aplicarUIFiltrosTipo();
      renderColecciones();
    } else if (pantallaAnterior === "decks") {
      renderListaDecks();
    } else if (pantallaAnterior === "buscar") {
      const inputBuscar = document.getElementById("inputBuscar");
      if (inputBuscar) inputBuscar.value = "";
      renderResultadosBuscar("");
    } else if (pantallaAnterior === "comandantes") {
      resetCommanderSearchUI();
    } else if (pantallaAnterior === "estadisticas") {
      renderEstadisticas({ forceRecalc: false });
    } else if (pantallaAnterior === "cuenta") {
      actualizarFechaCatalogo();
    } else if (pantallaAnterior === "menu") {
      // No necesita lógica especial, solo mostrar el menú
    } else if (pantallaAnterior === "set") {
      // Al volver a set, renderizar la tabla con los filtros actuales
      if (setActualKey) {
        renderTablaSet(setActualKey);
      }
    } else if (pantallaAnterior === "verDeck") {
      // Al volver a ver deck, renderizar las cartas actuales
      if (typeof renderDeckCartas === "function") {
        renderDeckCartas();
      }
    }
    
    // Mostrar la pantalla anterior sin agregar al historial
    mostrarPantalla(pantallaAnterior, false);
    return true;
  } else if (impedirSalidaApp) {
    // Si estamos en el menú principal, mantener la app abierta
    // agregando de nuevo una entrada al historial
    window.history.pushState({ pantalla: "menu" }, "", "");
    return true;
  }
  return false;
}

// ===============================
// 4) Colecciones: filtro + lista + progreso
// ===============================

let filtroIdiomaColecciones = "all"; // "all" | "en" | "es"

let filtroTextoColecciones = ""; // texto del buscador

let filtroYearColecciones = "all";
let filtroYearColeccionesOptions = [];

let vistaColecciones = "simbolo"; // "simbolo" | "lista"

const LS_FILTERS_KEY = "mtg_colecciones_filtros_v1";

// ===============================
// Configuración global de controles de cartas
// ===============================
const LS_CARD_CONTROLS = "mtg_card_controls_v1";

const DEFAULT_CARD_CONTROLS = {
  langMode: "both", // "both" | "en" | "es"
  showQty: true,
  showFoil: true,
  extraCounters: [],
  extraTags: [],
  riTagEnabled: false
};

let cardControlsConfig = { ...DEFAULT_CARD_CONTROLS };

function normalizeControlList(list, { allowBuiltIn = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== "object") continue;
    const key = String(raw.key || "").trim();
    if (!key || seen.has(key)) continue;
    const label = String(raw.label || key).trim() || key;
    const enabled = !!raw.enabled;
    const builtIn = allowBuiltIn ? !!raw.builtIn : false;
    out.push({ key, label, enabled, builtIn });
    seen.add(key);
  }
  return out;
}

function normalizeCardControlsConfig(cfg) {
  const langMode = (cfg && typeof cfg.langMode === "string") ? cfg.langMode : DEFAULT_CARD_CONTROLS.langMode;
  const safeLangMode = (langMode === "en" || langMode === "es" || langMode === "both") ? langMode : "both";
  const showQty = cfg && typeof cfg.showQty === "boolean" ? cfg.showQty : DEFAULT_CARD_CONTROLS.showQty;
  const showFoil = cfg && typeof cfg.showFoil === "boolean" ? cfg.showFoil : DEFAULT_CARD_CONTROLS.showFoil;
  const riTagEnabled = cfg && typeof cfg.riTagEnabled === "boolean" ? cfg.riTagEnabled : DEFAULT_CARD_CONTROLS.riTagEnabled;

  const extraCounters = normalizeControlList(cfg?.extraCounters, { allowBuiltIn: false });
  const extraTags = normalizeControlList(cfg?.extraTags, { allowBuiltIn: true })
    .filter(t => t.key !== "ri" || riTagEnabled);

  return { langMode: safeLangMode, showQty, showFoil, extraCounters, extraTags, riTagEnabled };
}

function cargarCardControlsConfig() {
  const raw = safeLocalStorageGet(LS_CARD_CONTROLS);
  if (!raw) {
    cardControlsConfig = normalizeCardControlsConfig(DEFAULT_CARD_CONTROLS);
    return;
  }
  try {
    const cfg = JSON.parse(raw);
    cardControlsConfig = normalizeCardControlsConfig(cfg || {});
  } catch {
    cardControlsConfig = normalizeCardControlsConfig(DEFAULT_CARD_CONTROLS);
  }
}

function guardarCardControlsConfig() {
  safeLocalStorageSet(LS_CARD_CONTROLS, JSON.stringify(cardControlsConfig));
  if (!sbApplyingCloudData && typeof sbMarkDirty === "function") sbMarkDirty();
}

function getCardControlsConfig() {
  return cardControlsConfig || DEFAULT_CARD_CONTROLS;
}

function getControlLangs() {
  const cfg = getCardControlsConfig();
  return cfg.langMode === "both" ? ["en", "es"] : [cfg.langMode];
}

function getEnabledCountersConfig() {
  const cfg = getCardControlsConfig();
  const counters = [];
  if (cfg.showQty) counters.push({ key: "qty", label: "Cantidad" });
  if (cfg.showFoil) counters.push({ key: "foil", label: "Foil" });
  for (const c of cfg.extraCounters || []) {
    if (c.enabled) counters.push({ key: c.key, label: c.label });
  }
  return counters;
}

function getEnabledTagsConfig() {
  const cfg = getCardControlsConfig();
  const tags = [];
  for (const t of cfg.extraTags || []) {
    if (t.enabled) tags.push({ key: t.key, label: t.label, builtIn: !!t.builtIn });
  }
  return tags;
}

function makeControlKey(label, existingKeys = new Set()) {
  const base = String(label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const safeBase = base || "control";
  let key = safeBase;
  let idx = 2;
  while (existingKeys.has(key)) {
    key = `${safeBase}-${idx}`;
    idx += 1;
  }
  return key;
}

function applyCardControlsConfig(nextCfg) {
  cardControlsConfig = normalizeCardControlsConfig(nextCfg || {});
  guardarCardControlsConfig();
  renderCardControlsOptionsUI();
  if (setActualKey) renderTablaSet(setActualKey);
  scheduleStatsSnapshotUpdate({ renderIfVisible: true });
}

function renderCardControlsOptionsUI() {
  const cfg = getCardControlsConfig();

  document.querySelectorAll('input[name="modoIdiomaCartas"]').forEach(r => {
    r.checked = r.value === cfg.langMode;
  });

  const chkCantidad = document.getElementById("chkMostrarCantidad");
  if (chkCantidad) chkCantidad.checked = !!cfg.showQty;

  const chkFoil = document.getElementById("chkMostrarFoil");
  if (chkFoil) chkFoil.checked = !!cfg.showFoil;

  const contadoresList = document.getElementById("listaContadoresOpciones");
  if (contadoresList) {
    const counters = cfg.extraCounters || [];
    contadoresList.innerHTML = counters.length
      ? counters.map(c => `
        <div class="opciones-item" data-control-type="counter" data-key="${escapeAttr(c.key)}">
          <label class="chkline">
            <input type="checkbox" data-action="toggle" ${c.enabled ? "checked" : ""} />
            <span>${escapeHtml(c.label)}</span>
          </label>
          <button class="btn-secundario btn-mini" data-action="remove">Eliminar</button>
        </div>
      `).join("")
      : `<div class="hint">No hay contadores extra.</div>`;
  }

  const tagsList = document.getElementById("listaTagsOpciones");
  if (tagsList) {
    const tags = cfg.extraTags || [];
    tagsList.innerHTML = tags.length
      ? tags.map(t => `
        <div class="opciones-item" data-control-type="tag" data-key="${escapeAttr(t.key)}">
          <label class="chkline">
            <input type="checkbox" data-action="toggle" ${t.enabled ? "checked" : ""} />
            <span>${escapeHtml(t.label)}</span>
          </label>
          ${t.builtIn ? "" : `<button class=\"btn-secundario btn-mini\" data-action=\"remove\">Eliminar</button>`}
        </div>
      `).join("")
      : `<div class="hint">No hay tags.</div>`;
  }
}


function setFiltroTextoColecciones(texto) {
  filtroTextoColecciones = normalizarTexto((texto || "").trim());
  guardarFiltrosColecciones();
  scheduleRenderColecciones();
}

function setFiltroYearColecciones(yearValue) {
  const raw = String(yearValue || "").trim();
  const next = raw && raw !== "all" ? raw : "all";
  filtroYearColecciones = next;
  guardarFiltrosColecciones();
  scheduleRenderColecciones();
}

function getSetYearFromReleasedAt(releasedAt) {
  const year = String(releasedAt || "").slice(0, 4);
  return year && /^\d{4}$/.test(year) ? year : "";
}

function updateFiltroYearColeccionesOptions(setsAll) {
  const select = document.getElementById("selectFiltroYearColecciones");
  if (!select) return;
  const sets = Array.isArray(setsAll) ? setsAll : obtenerColecciones();
  const years = new Set();
  for (const s of sets || []) {
    const year = getSetYearFromReleasedAt(s.released_at);
    if (year) years.add(year);
  }
  filtroYearColeccionesOptions = Array.from(years).sort((a, b) => b.localeCompare(a));
  let nextValue = filtroYearColecciones;
  if (nextValue !== "all" && !filtroYearColeccionesOptions.includes(nextValue)) {
    nextValue = "all";
    filtroYearColecciones = "all";
  }

  select.innerHTML = [
    `<option value="all">Todos</option>`,
    ...filtroYearColeccionesOptions.map(y => `<option value="${y}">${y}</option>`)
  ].join("");
  select.value = nextValue;
  select.disabled = filtroYearColeccionesOptions.length === 0;
}


function progresoDeColeccion(setKey) {
  // Si está cargado en memoria esta sesión
  if (cacheCartasPorSetLang[setKey]) {
    const lista = cartasDeSetKey(setKey);
    const total = lista.length;
    // Usar estado2: contar cartas que tienen cantidad en cualquier idioma
    const tengo = lista.filter(c => {
      if (!c.oracle_id) return getEstadoCarta(c.id).qty > 0; // Fallback legacy
      const st2 = getEstadoCarta2(c.oracle_id);
      return (st2.qty_en + st2.qty_es) > 0;
    }).length;
    return { tengo, total };
  }

  // Si no está cargado, intenta usar el resumen guardado
  const saved = progresoPorSet[setKey];
  if (saved && typeof saved.total === "number") {
    const total = Number(saved.total);
    const tengo = Number(saved.tengo || 0);
    const totalSafe = Number.isFinite(total) ? total : null;
    const tengoSafe = Number.isFinite(tengo) ? tengo : 0;
    if (totalSafe != null && totalSafe > 0) {
      return { tengo: Math.max(0, Math.min(tengoSafe, totalSafe)), total: totalSafe };
    }
    return { tengo: Math.max(0, tengoSafe), total: totalSafe };
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
  scheduleRenderColecciones();
}

function aplicarUIFiltrosColecciones() {
  document.querySelectorAll(".btn-filtro").forEach(b => {
    b.classList.toggle("active", b.dataset.lang === filtroIdiomaColecciones);
  });

  const inputBuscarCol = document.getElementById("inputBuscarColecciones");
  if (inputBuscarCol) inputBuscarCol.value = filtroTextoColecciones || "";

  const selectYear = document.getElementById("selectFiltroYearColecciones");
  if (selectYear) {
    selectYear.value = filtroYearColecciones;
    selectYear.disabled = filtroYearColeccionesOptions.length === 0;
  }

  // Establecer el radio de vista correcto
  const radioVista = document.querySelector(`input[name="vistaColecciones"][value="${vistaColecciones}"]`);
  if (radioVista) radioVista.checked = true;
}

// ===============================
// Filtros de tipo (UI Colecciones)
// ===============================
let ocultarTokens = false;
let ocultarArte = false;
let mostrarOcultas = false;
// Cambio: ahora es un Set con múltiples valores seleccionados
let filtroTiposSet = new Set(["expansion", "core", "commander", "masters", "promo", "token", "memorabilia", "other"]);

function aplicarUIFiltrosTipo() {
  const bTok = document.getElementById("btnToggleTokens");
  const bArt = document.getElementById("btnToggleArte");
  const chkOcultas = document.getElementById("chkMostrarOcultas");
  
  // Actualizar checkboxes
  document.querySelectorAll(".chk-tipo-set").forEach(chk => {
    chk.checked = filtroTiposSet.has(chk.value);
  });

  if (chkOcultas) chkOcultas.checked = mostrarOcultas;
  if (bTok) bTok.classList.toggle("active", ocultarTokens);
  if (bArt) bArt.classList.toggle("active", ocultarArte);
}

function renderColecciones() {
  const cont = document.getElementById("listaColecciones");
  if (!cont) return;

  if (!catalogoListo) {
    cont.innerHTML = `<div class="card"><p>Cargando colecciones…</p></div>`;
    return;
  }

  if (catalogoError) {
    cont.innerHTML = `<div class="card"><p>Error cargando colecciones: ${escapeHtml(catalogoError)}</p></div>`;
    return;
  }

  let sets = obtenerColecciones();
  updateFiltroYearColeccionesOptions(sets);

  // Primero aplicar filtro de colecciones ocultas
  // Si mostrarOcultas está activo, solo mostrar las ocultas
  // Si mostrarOcultas está desactivado, ocultar las que están marcadas como ocultas
  if (mostrarOcultas) {
    // Mostrar SOLO las colecciones ocultas, ignorando otros filtros de tipo
    sets = sets.filter(s => hiddenCollections.has(s.code));
  } else {
    // Filtrar las colecciones ocultas (no mostrarlas)
    sets = sets.filter(s => !hiddenCollections.has(s.code));
    
    // filtro tipo set (ahora con múltiples selecciones)
    if (filtroTiposSet.size === 0) {
      // Si no hay ningún tipo seleccionado, no mostrar nada
      sets = [];
    } else if (filtroTiposSet.size < 8) {
      sets = sets.filter(s => {
        const tipo = (s.set_type || "").toLowerCase();
        
        // Si el tipo está en los seleccionados, incluirlo
        if (filtroTiposSet.has(tipo)) return true;
        
        // Si "other" está seleccionado y no coincide con ninguno conocido
        if (filtroTiposSet.has("other")) {
          const tiposConocidos = new Set(["expansion","core","commander","masters","promo","token","memorabilia"]);
          if (!tiposConocidos.has(tipo)) return true;
        }
        
        return false;
      });
    }
  }

  // ocultar tokens/arte (solo si no estamos en modo "mostrar ocultas")
  if (!mostrarOcultas && ocultarTokens) sets = sets.filter(s => (s.set_type || "").toLowerCase() !== "token");

  if (!mostrarOcultas && ocultarArte) {
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
    sets = sets.filter(s => normalizarTexto(s.nombre).includes(filtroTextoColecciones));
  }

  if (filtroYearColecciones && filtroYearColecciones !== "all") {
    sets = sets.filter(s => getSetYearFromReleasedAt(s.released_at) === filtroYearColecciones);
  }

  if (sets.length === 0) {
    cont.innerHTML = `<div class="card"><p>No hay colecciones que coincidan con el filtro.</p></div>`;
    return;
  }

  // Aplicar clase según la vista
  cont.classList.remove("vista-simbolo", "vista-lista");
  cont.classList.add(vistaColecciones === "lista" ? "vista-lista" : "vista-simbolo");

  let html = "";
  for (const s of sets) {
    const pEn = progresoDeColeccion(`${s.code}__en`);
    const pEs = progresoDeColeccion(`${s.code}__es`);

    const totalEnTxt = (pEn.total === null ? "?" : pEn.total);
    const totalEsTxt = (pEs.total === null ? "?" : pEs.total);

    // Calcular porcentajes
    let pctEn = "-%";
    let pctEs = "-%";
    let pctEnNum = 0;
    let pctEsNum = 0;
    
    if (pEn.total && pEn.total > 0) {
      pctEnNum = Math.floor((pEn.tengo / pEn.total) * 100);
      pctEn = pctEnNum + "%";
    }
    
    if (pEs.total && pEs.total > 0) {
      pctEsNum = Math.floor((pEs.tengo / pEs.total) * 100);
      pctEs = pctEsNum + "%";
    }

    // Calcular progreso para la barra visual (solo idioma inglés, o español si inglés no disponible)
    let progresoPromedio = 0;
    if (pEn.total && pEn.total > 0) {
      progresoPromedio = pctEnNum;
    } else if (pEs.total && pEs.total > 0) {
      progresoPromedio = pctEsNum;
    }
    if (!Number.isFinite(progresoPromedio)) progresoPromedio = 0;
    progresoPromedio = Math.max(0, Math.min(100, progresoPromedio));

    const fechaTxt = formatMesAnyo(s.released_at);

    // ✅ Icono (si existe)
    const iconHtml = s.icon_svg_uri
  ? `<img class="set-icon" src="${s.icon_svg_uri}" alt="${escapeAttr(s.nombre)}" loading="lazy" />`
  : `<div class="set-icon" style="background: rgba(0,0,0,.15); border-radius: 50%;"></div>`;

    // Icono para vista lista (más pequeño)
    const iconHtmlLista = s.icon_svg_uri
  ? `<img class="set-icon-lista" src="${s.icon_svg_uri}" alt="${escapeAttr(s.nombre)}" loading="lazy" />`
  : `<div class="set-icon-lista" style="background: rgba(0,0,0,.15); border-radius: 50%;"></div>`;

    const completeClass = progresoPromedio >= 100 ? " is-complete" : "";

    if (vistaColecciones === "lista") {
      // Vista lista: un item por línea
      html += `
  <div class="coleccion-item-lista${completeClass}" data-code="${s.code}" data-progress="${progresoPromedio}">
    <div class="coleccion-lista-icon">
      ${iconHtmlLista}
    </div>
    <div class="coleccion-lista-info">
      <div class="coleccion-lista-nombre">${escapeHtml(s.nombre)}</div>
      ${fechaTxt ? `<div class="coleccion-lista-fecha">${fechaTxt}</div>` : ""}
    </div>
    <div class="coleccion-lista-progress">
      <span class="coleccion-lista-pct">${pctEn}</span>
    </div>
  </div>
`;
    } else {
      // Vista símbolo: la original
      html += `
  <div class="coleccion-item${completeClass}" data-code="${s.code}" data-progress="${progresoPromedio}">
    ${fechaTxt ? `<span class="set-date">${fechaTxt}</span>` : ""}
    <div class="coleccion-titulo">
      ${iconHtml}
      <div class="coleccion-nombre">${escapeHtml(s.nombre)}</div>
    </div>
    <div class="badge"><span class="pct-lang">${pctEn}</span> EN ${pEn.tengo}/${totalEnTxt} · ES ${pEs.tengo}/${totalEsTxt} <span class="pct-lang">${pctEs}</span></div>
  </div>
`;
    }
  }

  cont.innerHTML = html;

  cont.querySelectorAll("[data-code]").forEach(item => {
    // Aplicar altura de progreso visual
    const progress = Math.max(0, Math.min(100, Number(item.dataset.progress) || 0));

    if (vistaColecciones === "lista") {
      item.style.setProperty('--progress-width', `${progress}%`);
    } else {
      item.style.setProperty('--progress-height', `${progress}%`);
    }
  });

  if (!cont.dataset.wiredColecciones) {
    cont.dataset.wiredColecciones = "1";
    cont.addEventListener("click", (e) => {
      const item = e.target.closest("[data-code]");
      if (!item || !cont.contains(item)) return;
      const code = item.dataset.code;
      if (!code) return;
      abrirSet(`${code}__en`);
    });
  }
}

function calcStatsFromEstado() {
  let totalCopias = 0;
  let unicasTengo = 0;
  let unicasFoil = 0;
  let totalPlayed = 0;
  let wantMore = 0;

  for (const id of Object.keys(estado || {})) {
    const st = getEstadoCarta(id); // ya normaliza
    const qty = Number(st.qty || 0);
    if (qty > 0) {
      unicasTengo += 1;
      totalCopias += qty;
      if (st.foil) unicasFoil += 1;
    }
    totalPlayed += Number(st.playedQty || 0);
    if (st.wantMore) wantMore += 1;
  }

  return { totalCopias, unicasTengo, unicasFoil, totalPlayed, wantMore };
}

function calcSetStatsFromProgreso() {
  const rows = [];
  for (const k of Object.keys(progresoPorSet || {})) {
    const p = progresoPorSet[k];
    if (!p || typeof p.total !== "number") continue;
    const tengo = Number(p.tengo || 0);
    const total = Number(p.total || 0);
    const pct = total > 0 ? (tengo / total) : 0;
    rows.push({ key: k, tengo, total, pct });
  }
  rows.sort((a,b) => (b.pct - a.pct) || (b.tengo - a.tengo));
  return rows;
}

function guardarStatsSnapshot(snap, { markDirty = false } = {}) {
  statsSnapshot = snap || null;
  safeLocalStorageSet(LS_STATS_SNAPSHOT, JSON.stringify(statsSnapshot));

  // opcional: si quieres que esto suba a Supabase en el próximo autosave
  if (markDirty && typeof sbMarkDirty === "function") sbMarkDirty();
}

function guardarFiltrosColecciones() {
  const data = {
    lang: filtroIdiomaColecciones,
    texto: filtroTextoColecciones,
    vista: vistaColecciones,
    year: filtroYearColecciones
  };
  safeLocalStorageSet(LS_FILTERS_KEY, JSON.stringify(data));
  if (typeof sbMarkDirty === "function") sbMarkDirty();
}

function cargarFiltrosColecciones() {
  const raw = safeLocalStorageGet(LS_FILTERS_KEY);
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
      if (data.vista === "lista" || data.vista === "simbolo") {
        vistaColecciones = data.vista;
      }
      if (typeof data.year === "string") {
        filtroYearColecciones = data.year.trim() || "all";
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
let filtroEnPosesionSet = false;
let filtroColorSetEnabled = false;
let filtroColoresSet = new Set();
let filtroRarezasSet = new Set(["Común", "Infrecuente", "Rara", "Mítica"]);
let ultimaListaSetRender = [];

const VIRTUAL_SCROLL_MIN_ITEMS = 120;
const VIRTUAL_SCROLL_BUFFER_ROWS = 8;
const VIRTUAL_SCROLL_DEFAULT_ROW_HEIGHT = 380;

const virtualScrollState = {
  active: false,
  setKey: null,
  list: [],
  cont: null,
  wrapper: null,
  grid: null,
  columns: 1,
  rowHeight: VIRTUAL_SCROLL_DEFAULT_ROW_HEIGHT,
  rowGap: 10,
  lastStart: -1,
  lastEnd: -1,
  rafId: null,
  onScroll: null,
  onResize: null
};

const modalNavState = {
  lista: null,
  idx: -1,
};

function aplicarUIFiltrosSet() {
  const inp = document.getElementById("inputBuscarEnSet");
  if (inp) inp.value = filtroTextoSet || "";

  const chk = document.getElementById("chkSoloFaltanSet");
  if (chk) chk.checked = !!filtroSoloFaltanSet;

  const chkPos = document.getElementById("chkEnPosesionSet");
  if (chkPos) chkPos.checked = !!filtroEnPosesionSet;

  const chkColor = document.getElementById("chkFiltroColorSet");
  if (chkColor) chkColor.checked = !!filtroColorSetEnabled;

  const colorWrap = document.getElementById("filtroColoresSet");
  if (colorWrap) colorWrap.classList.toggle("hidden", !filtroColorSetEnabled);

  document.querySelectorAll(".chk-color-set").forEach(chkColorOpt => {
    chkColorOpt.checked = filtroColoresSet.has(chkColorOpt.value);
  });

  document.querySelectorAll(".chk-rareza-set").forEach(chkR => {
    chkR.checked = filtroRarezasSet.has(chkR.value);
  });
}

function resetScrollSetList({ allowAutoScroll = false } = {}) {
  if (!allowAutoScroll) return;
  const cont = document.getElementById("listaCartasSet");
  if (!cont) return;
  const rect = cont.getBoundingClientRect();
  const top = rect.top + window.scrollY - 8;
  if (Number.isFinite(top)) {
    window.scrollTo({ top, behavior: "auto" });
  }
}

function renderTablaSetWithStableScroll(setKey) {
  if (!setKey) return;
  const scrollTop = window.scrollY;
  const activeEl = document.activeElement;
  renderTablaSet(setKey);
  requestAnimationFrame(() => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const nextTop = Math.min(scrollTop, maxScroll);
    if (Number.isFinite(nextTop)) window.scrollTo({ top: nextTop, behavior: "auto" });
    if (activeEl && typeof activeEl.focus === "function") {
      try {
        activeEl.focus({ preventScroll: true });
      } catch {
        activeEl.focus();
      }
    }
  });
}


function getCardTotalsForSetFilter(card) {
  if (card?.oracle_id) {
    const st2 = getEstadoCarta2(card.oracle_id);
    return {
      qty: (Number(st2.qty_en) || 0) + (Number(st2.qty_es) || 0),
      foil: (Number(st2.foil_en) || 0) + (Number(st2.foil_es) || 0)
    };
  }
  const st = getEstadoCarta(card?.id);
  return {
    qty: Number(st.qty) || 0,
    foil: Number(st.foilQty) || 0
  };
}

function cardMatchesColorFilter(card) {
  if (!filtroColorSetEnabled || filtroColoresSet.size === 0) return true;
  const identity = getCardColorIdentity(card);
  const normalized = identity.map(c => String(c || "").toUpperCase().trim()).filter(Boolean);
  const selected = filtroColoresSet;

  if (normalized.length === 0) {
    return selected.has("C");
  }

  if (selected.size === 1) {
    const only = [...selected][0];
    return normalized.includes(only);
  }
  return normalized.some(c => selected.has(c));
}

function getCardColorIdentity(card) {
  const asArray = (v) => (Array.isArray(v) ? v : null);

  let colors =
    asArray(card?.color_identity) ||
    asArray(card?._colors) ||
    asArray(card?._raw?.color_identity) ||
    asArray(card?._raw?.colors);

  if (!colors && Array.isArray(card?._raw?.card_faces)) {
    const faceColors = [];
    for (const face of card._raw.card_faces) {
      const faceIds = asArray(face?.color_identity) || asArray(face?.colors);
      if (faceIds && faceIds.length) faceColors.push(...faceIds);
    }
    if (faceColors.length) colors = faceColors;
  }

  return colors || [];
}

function cardMatchesRarityFilter(card) {
  if (filtroRarezasSet.size === 0 || filtroRarezasSet.size >= 4) return true;
  return filtroRarezasSet.has(card?.rareza);
}

function getListaSetFiltrada(setKey) {
  let lista = cartasDeSetKey(setKey)
    .sort((a, b) => compareCollectorNumbers(a.numero, b.numero));

  const ft = String(filtroTextoSet || "").trim();
if (ft) {
  lista = lista.filter(c => normalizarTexto(c.nombre).includes(ft));
}

  if (filtroEnPosesionSet || filtroSoloFaltanSet) {
    lista = lista.filter(c => {
      const { qty, foil } = getCardTotalsForSetFilter(c);
      const enPosesion = qty > 0;
      const enFalta = qty === 0 && foil === 0;
      if (filtroEnPosesionSet && filtroSoloFaltanSet) return enPosesion || enFalta;
      if (filtroEnPosesionSet) return enPosesion;
      if (filtroSoloFaltanSet) return enFalta;
      return true;
    });
  }

  if (filtroColorSetEnabled && filtroColoresSet.size > 0) {
    lista = lista.filter(c => cardMatchesColorFilter(c));
  }

  if (filtroRarezasSet.size > 0 && filtroRarezasSet.size < 4) {
    lista = lista.filter(c => cardMatchesRarityFilter(c));
  }

  return lista;
}

async function abrirSet(setKey) {
  setActualKey = setKey;

  const [code, lang] = setKey.split("__");
  setActualCode = code;
  // setActualLang ya no se usa - siempre cargamos EN

  // Actualizar checkbox de ocultar colección
  const chkOcultarColeccion = document.getElementById("chkOcultarColeccion");
  if (chkOcultarColeccion) {
    chkOcultarColeccion.checked = hiddenCollections.has(code);
  }

  const info = setMetaByKey.get(setKey) || { nombre: "Set", lang: "en" };
  document.getElementById("tituloSet").textContent = info.nombre; // Sin mostrar idioma

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
}


function renderTablaSet(setKey) {
  const startTime = DEBUG ? performance.now() : 0;
  const lista = getListaSetFiltrada(setKey);
  const cont = document.getElementById("listaCartasSet");
  if (!cont) return;

  ultimaListaSetRender = lista;

  const frag = document.createDocumentFragment();
  const grid = document.createElement("div");
  grid.className = "cartas-grid";

  const createStepperRow = ({ label, classMinus, classPlus, classInput, oracleId, lang, min, max, value, disabledMinus, disabledPlus, disabledInput, controlKey, controlKind }) => {
    const row = document.createElement("div");
    row.className = "control-fila";

    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = label;

    const stepper = document.createElement("div");
    stepper.className = "stepper";

    const btnMinus = document.createElement("button");
    btnMinus.className = `btn-step ${classMinus}`;
    btnMinus.dataset.oracle = oracleId || "";
    btnMinus.dataset.lang = lang;
    if (controlKey) btnMinus.dataset.control = controlKey;
    if (controlKind) btnMinus.dataset.kind = controlKind;
    btnMinus.type = "button";
    btnMinus.textContent = "−";
    if (disabledMinus) btnMinus.disabled = true;

    const input = document.createElement("input");
    input.type = "number";
    input.className = `inp-num ${classInput}`;
    input.dataset.oracle = oracleId || "";
    input.dataset.lang = lang;
    if (controlKey) input.dataset.control = controlKey;
    if (controlKind) input.dataset.kind = controlKind;
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    if (disabledInput) input.disabled = true;

    const btnPlus = document.createElement("button");
    btnPlus.className = `btn-step ${classPlus}`;
    btnPlus.dataset.oracle = oracleId || "";
    btnPlus.dataset.lang = lang;
    if (controlKey) btnPlus.dataset.control = controlKey;
    if (controlKind) btnPlus.dataset.kind = controlKind;
    btnPlus.type = "button";
    btnPlus.textContent = "+";
    if (disabledPlus) btnPlus.disabled = true;

    stepper.appendChild(btnMinus);
    stepper.appendChild(input);
    stepper.appendChild(btnPlus);

    row.appendChild(lbl);
    row.appendChild(stepper);

    return row;
  };

  const createTagRow = ({ label, oracleId, lang, checked, controlKey }) => {
    const row = document.createElement("div");
    row.className = "control-fila";

    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = label;

    const labelEl = document.createElement("label");
    labelEl.className = "chkline";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "chk-tag";
    input.dataset.oracle = oracleId || "";
    input.dataset.lang = lang;
    if (controlKey) input.dataset.control = controlKey;
    input.checked = !!checked;

    labelEl.appendChild(input);
    row.appendChild(lbl);
    row.appendChild(labelEl);
    return row;
  };

  const createLangPanel = ({ lang, oracleId, qty, foil, ri, extraCounters = [], extraTags = [] }) => {
    const panel = document.createElement("div");
    panel.className = "lang-panel";
    panel.dataset.lang = lang;

    if (getCardControlsConfig().showQty) {
      panel.appendChild(createStepperRow({
        label: "Cantidad",
        classMinus: "btn-qty-minus",
        classPlus: "btn-qty-plus",
        classInput: "inp-qty",
        oracleId,
        lang,
        min: 0,
        max: 999,
        value: qty,
        disabledMinus: qty <= 0,
        disabledPlus: false,
        disabledInput: false,
        controlKey: "qty",
        controlKind: "counter"
      }));
    }

    if (getCardControlsConfig().showFoil) {
      panel.appendChild(createStepperRow({
        label: "Foil",
        classMinus: "btn-foil-minus",
        classPlus: "btn-foil-plus",
        classInput: "inp-foil",
        oracleId,
        lang,
        min: 0,
        max: qty,
        value: foil,
        disabledMinus: foil <= 0 || qty === 0,
        disabledPlus: qty === 0 || foil >= qty,
        disabledInput: qty === 0,
        controlKey: "foil",
        controlKind: "counter"
      }));
    }

    for (const counter of extraCounters) {
      panel.appendChild(createStepperRow({
        label: counter.label,
        classMinus: "btn-counter-minus",
        classPlus: "btn-counter-plus",
        classInput: "inp-counter",
        oracleId,
        lang,
        min: 0,
        max: 999,
        value: counter.value,
        disabledMinus: counter.value <= 0,
        disabledPlus: false,
        disabledInput: false,
        controlKey: counter.key,
        controlKind: "counter"
      }));
    }

    for (const tag of extraTags) {
      panel.appendChild(createTagRow({ label: tag.label, oracleId, lang, checked: tag.checked, controlKey: tag.key }));
    }
    return panel;
  };

  const createCartaItem = (c, idx) => {
    // Usar estado2 para determinar si tiene cantidad (suma de ambos idiomas)
    let totalQty = 0;
    let st2 = null;
    const oracleId = c.oracle_id || "";

    if (c.oracle_id) {
      st2 = getEstadoCarta2(c.oracle_id);
      totalQty = st2.qty_en + st2.qty_es;
    } else {
      // Fallback para cartas sin oracle_id (no debería pasar)
      const stLegacy = getEstadoCarta(c.id);
      totalQty = stLegacy.qty;
      // Crear objeto compatible con estructura v2 para el renderizado
      st2 = { qty_en: stLegacy.qty, qty_es: 0, foil_en: stLegacy.foilQty, foil_es: 0, ri_en: stLegacy.wantMore, ri_es: false, counters_en: {}, counters_es: {}, tags_en: {}, tags_es: {} };
    }

    const controlsCfg = getCardControlsConfig();
    const langMode = controlsCfg.langMode || "both";
    const langsToShow = langMode === "both" ? ["en", "es"] : [langMode];

    // Layout clásico con toggle EN <-> ES
    const langActivo = langMode === "both" ? getUILang(c.oracle_id) : langMode;
    const tieneImg = c._img && c._img.trim() !== "";
    const hasQty = totalQty > 0;

    const item = document.createElement("div");
    item.className = `carta-item${hasQty ? " has-qty" : ""}`;
    item.dataset.oracle = oracleId;
    item.dataset.cardId = String(c.id);

    const header = document.createElement("div");
    header.className = "carta-header";

    const led = document.createElement("img");
    led.className = "led-indicator";
    led.alt = "";
    led.width = 24;
    led.height = 24;
    led.src = `icons/${hasQty ? "Ledazul" : "Ledrojo"}.png`;

    const btnCarta = document.createElement("button");
    btnCarta.className = "btn-link-carta";
    btnCarta.type = "button";
    btnCarta.dataset.accion = "ver-carta-set";
    btnCarta.dataset.oracle = oracleId;
    btnCarta.dataset.id = String(c.id);
    btnCarta.dataset.idx = String(idx);
    btnCarta.textContent = c.nombre || "";

    const numero = document.createElement("span");
    numero.className = "carta-numero";
    numero.textContent = `#${c.numero}`;

    header.appendChild(led);
    header.appendChild(btnCarta);
    header.appendChild(numero);

    const imgContainer = document.createElement("div");
    imgContainer.className = "carta-imagen-container";

    if (tieneImg) {
      const img = document.createElement("img");
      img.className = "carta-imagen";
      img.loading = "lazy";
      img.alt = c.nombre || "";
      img.dataset.imgEn = c._img;
      img.dataset.oracle = oracleId;
      img.dataset.set = c.set || "";
      img.dataset.numero = c.numero || "";
      loadImageWithCache(img, c._img);
      imgContainer.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "carta-imagen-placeholder";
      ph.textContent = "Sin imagen";
      imgContainer.appendChild(ph);
    }

    const controles = document.createElement("div");
    controles.className = "carta-controles";
    controles.dataset.activeLang = langActivo;

    const controlesHeader = document.createElement("div");
    controlesHeader.className = "controles-header";

    const badge = document.createElement("span");
    badge.className = "lang-badge lang-active";
    const badgeImg = document.createElement("img");
    badgeImg.className = "flag-icon";
    badgeImg.src = `icons/flag-${langActivo === "en" ? "en" : "es"}.svg`;
    badgeImg.alt = langActivo === "en" ? "EN" : "ES";
    const badgeLbl = document.createElement("span");
    badgeLbl.className = "lang-label";
    badgeLbl.textContent = langActivo === "en" ? "EN" : "ES";
    badge.appendChild(badgeImg);
    badge.appendChild(badgeLbl);

    if (langMode === "both") {
      const btnSwitch = document.createElement("button");
      btnSwitch.className = "btn-lang-switch";
      btnSwitch.type = "button";
      btnSwitch.dataset.oracle = oracleId;
      btnSwitch.title = "Cambiar idioma";
      btnSwitch.setAttribute("aria-label", `Cambiar a idioma ${langActivo === "en" ? "español" : "inglés"}`);

      const switchAction = document.createElement("span");
      switchAction.className = "lang-switch-action";
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "→";
      const targetImg = document.createElement("img");
      targetImg.className = "flag-icon flag-target-icon";
      targetImg.src = `icons/flag-${langActivo === "en" ? "es" : "en"}.svg`;
      targetImg.alt = langActivo === "en" ? "ES" : "EN";
      switchAction.appendChild(arrow);
      switchAction.appendChild(targetImg);

      btnSwitch.appendChild(badge);
      btnSwitch.appendChild(switchAction);
      controlesHeader.appendChild(btnSwitch);
    } else {
      controlesHeader.appendChild(badge);
    }

    const slider = document.createElement("div");
    slider.className = "lang-slider";
    const track = document.createElement("div");
    track.className = "lang-track";

    const extraCountersCfg = getEnabledCountersConfig().filter(c => c.key !== "qty" && c.key !== "foil");
    const extraTagsCfg = getEnabledTagsConfig();

    const buildExtraCounters = (lang) => extraCountersCfg.map(c => ({
      key: c.key,
      label: c.label,
      value: getCounterValue(st2, lang, c.key)
    }));

    const buildExtraTags = (lang) => extraTagsCfg.map(t => ({
      key: t.key,
      label: t.label,
      checked: getTagValue(st2, lang, t.key)
    }));

    for (const lang of langsToShow) {
      track.appendChild(createLangPanel({
        lang,
        oracleId,
        qty: lang === "es" ? st2.qty_es : st2.qty_en,
        foil: lang === "es" ? st2.foil_es : st2.foil_en,
        ri: lang === "es" ? st2.ri_es : st2.ri_en,
        extraCounters: buildExtraCounters(lang),
        extraTags: buildExtraTags(lang)
      }));
    }

    slider.appendChild(track);

    controles.appendChild(controlesHeader);
    controles.appendChild(slider);

    item.appendChild(header);
    item.appendChild(imgContainer);
    item.appendChild(controles);

    if (langMode === "es" && tieneImg && oracleId) {
      const imgElement = imgContainer.querySelector(".carta-imagen");
      if (imgElement) {
        const setCode = imgElement.dataset.set || "";
        const numero = imgElement.dataset.numero || "";
        getPrintByOracleLang(oracleId, "es", setCode, numero).then(printES => {
          if (printES) {
            const imgUrl = printES.image_uris?.normal || printES.card_faces?.[0]?.image_uris?.normal;
            if (imgUrl) imgElement.src = imgUrl;
          }
        }).catch(() => {});
      }
    }

    return item;
  };

  const applyVerCartasState = (targetGrid) => {
    const chkMostrarCartas = document.getElementById("chkMostrarCartas");
    if (chkMostrarCartas && targetGrid) {
      if (!chkMostrarCartas.checked) {
        targetGrid.classList.add("ocultar-imagenes");
      } else {
        targetGrid.classList.remove("ocultar-imagenes");
      }
    }
  };

  const disableVirtualScroll = () => {
    if (!virtualScrollState.active) return;
    if (virtualScrollState.rafId) {
      cancelAnimationFrame(virtualScrollState.rafId);
      virtualScrollState.rafId = null;
    }
    if (virtualScrollState.onScroll) window.removeEventListener("scroll", virtualScrollState.onScroll);
    if (virtualScrollState.onResize) window.removeEventListener("resize", virtualScrollState.onResize);
    virtualScrollState.active = false;
  };

  const useVirtualScroll = lista.length >= VIRTUAL_SCROLL_MIN_ITEMS;

  if (!useVirtualScroll) {
    disableVirtualScroll();
    lista.forEach((c, idx) => grid.appendChild(createCartaItem(c, idx)));
    frag.appendChild(grid);
    cont.innerHTML = "";
    cont.appendChild(frag);
    applyVerCartasState(grid);
  } else {
    const wrapper = document.createElement("div");
    wrapper.className = "cartas-virtual-wrapper";
    wrapper.style.position = "relative";
    wrapper.style.paddingTop = "0px";
    wrapper.style.paddingBottom = "0px";
    wrapper.appendChild(grid);

    cont.innerHTML = "";
    cont.appendChild(wrapper);

    const getColumns = () => {
      const computed = window.getComputedStyle(grid);
      const cols = computed.gridTemplateColumns.split(" ").filter(Boolean).length;
      return Math.max(1, cols || 1);
    };

    const updateMetrics = () => {
      const firstItem = grid.firstElementChild;
      const computed = window.getComputedStyle(grid);
      const rowGap = parseFloat(computed.rowGap || computed.gap || "0") || 0;

      if (firstItem) {
        const rect = firstItem.getBoundingClientRect();
        if (rect.height > 0) {
          virtualScrollState.rowHeight = rect.height + rowGap;
        }
      } else {
        virtualScrollState.rowHeight = VIRTUAL_SCROLL_DEFAULT_ROW_HEIGHT + rowGap;
      }

      virtualScrollState.rowGap = rowGap;
      virtualScrollState.columns = getColumns();
    };

    const calcRange = () => {
      const rect = cont.getBoundingClientRect();
      const containerTop = rect.top + window.scrollY;
      const rawScrollTop = Math.max(0, window.scrollY - containerTop);
      const viewHeight = window.innerHeight || 0;

      const columns = virtualScrollState.columns || 1;
      const rowHeight = virtualScrollState.rowHeight || VIRTUAL_SCROLL_DEFAULT_ROW_HEIGHT;
      const totalRows = Math.max(1, Math.ceil(lista.length / columns));

      const maxScroll = Math.max(0, (totalRows * rowHeight) - viewHeight);
      const scrollTop = Math.min(rawScrollTop, maxScroll);

      const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_SCROLL_BUFFER_ROWS);
      const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewHeight) / rowHeight) + VIRTUAL_SCROLL_BUFFER_ROWS);

      return { startRow, endRow, totalRows, columns, rowHeight };
    };

    const renderRange = () => {
      if (!virtualScrollState.active) return;

      const { startRow, endRow, totalRows, columns, rowHeight } = calcRange();
      const startIdx = Math.max(0, startRow * columns);
      const endIdx = Math.min(lista.length, endRow * columns);

      if (startIdx === virtualScrollState.lastStart && endIdx === virtualScrollState.lastEnd) return;

      virtualScrollState.lastStart = startIdx;
      virtualScrollState.lastEnd = endIdx;

      const topPad = startRow * rowHeight;
      const bottomPad = Math.max(0, (totalRows - endRow) * rowHeight);
      wrapper.style.paddingTop = `${topPad}px`;
      wrapper.style.paddingBottom = `${bottomPad}px`;

      const gridFrag = document.createDocumentFragment();
      for (let i = startIdx; i < endIdx; i++) {
        gridFrag.appendChild(createCartaItem(lista[i], i));
      }
      grid.replaceChildren(gridFrag);

      applyVerCartasState(grid);

      requestAnimationFrame(() => {
        updateMetrics();
      });
    };

    const scheduleRenderRange = () => {
      if (virtualScrollState.rafId) return;
      virtualScrollState.rafId = requestAnimationFrame(() => {
        virtualScrollState.rafId = null;
        renderRange();
      });
    };

    virtualScrollState.active = true;
    virtualScrollState.setKey = setKey;
    virtualScrollState.list = lista;
    virtualScrollState.cont = cont;
    virtualScrollState.wrapper = wrapper;
    virtualScrollState.grid = grid;
    virtualScrollState.lastStart = -1;
    virtualScrollState.lastEnd = -1;

    if (virtualScrollState.onScroll) window.removeEventListener("scroll", virtualScrollState.onScroll);
    if (virtualScrollState.onResize) window.removeEventListener("resize", virtualScrollState.onResize);

    virtualScrollState.onScroll = () => scheduleRenderRange();
    virtualScrollState.onResize = () => {
      updateMetrics();
      scheduleRenderRange();
    };

    window.addEventListener("scroll", virtualScrollState.onScroll, { passive: true });
    window.addEventListener("resize", virtualScrollState.onResize);

    updateMetrics();
    renderRange();
  }
  
  if (DEBUG) {
    const endTime = performance.now();
    recordMetric('renderTablaSet', endTime - startTime);
  }
}

// Helper: Actualizar panel de idioma específico sin re-render completo
function actualizarPanelLang(oracleId, lang) {
  const st2 = getEstadoCarta2(oracleId);
  const qty = lang === "en" ? st2.qty_en : st2.qty_es;
  const foil = lang === "en" ? st2.foil_en : st2.foil_es;
  const cfg = getCardControlsConfig();
  
  // Buscar el panel específico de este oracle_id y lang
  const cartaItem = document.querySelector(`.carta-item[data-oracle="${oracleId}"]`);
  if (!cartaItem) return;
  
  const panel = cartaItem.querySelector(`.lang-panel[data-lang="${lang}"]`);
  if (!panel) return;
  
  // Actualizar valores de inputs
  const qtyInput = panel.querySelector('.inp-qty');
  const foilInput = panel.querySelector('.inp-foil');
  if (cfg.showQty && qtyInput) qtyInput.value = qty;
  if (cfg.showFoil && foilInput) {
    foilInput.value = foil;
    foilInput.max = qty;
    foilInput.disabled = qty === 0;
  }
  
  // Actualizar botones qty
  const btnQtyMinus = panel.querySelector('.btn-qty-minus');
  if (cfg.showQty && btnQtyMinus) btnQtyMinus.disabled = qty <= 0;
  
  // Actualizar botones foil
  const btnFoilMinus = panel.querySelector('.btn-foil-minus');
  const btnFoilPlus = panel.querySelector('.btn-foil-plus');
  if (cfg.showFoil && btnFoilMinus) btnFoilMinus.disabled = foil <= 0 || qty === 0;
  if (cfg.showFoil && btnFoilPlus) btnFoilPlus.disabled = qty === 0 || foil >= qty;

  // Actualizar contadores personalizados
  const extraCounters = getEnabledCountersConfig().filter(c => c.key !== "qty" && c.key !== "foil");
  for (const c of extraCounters) {
    const value = getCounterValue(st2, lang, c.key);
    const input = panel.querySelector(`.inp-counter[data-control="${c.key}"]`);
    const btnMinus = panel.querySelector(`.btn-counter-minus[data-control="${c.key}"]`);
    if (input) input.value = value;
    if (btnMinus) btnMinus.disabled = value <= 0;
  }

  // Actualizar tags
  const extraTags = getEnabledTagsConfig();
  for (const t of extraTags) {
    const checked = getTagValue(st2, lang, t.key);
    const chk = panel.querySelector(`.chk-tag[data-control="${t.key}"]`);
    if (chk) chk.checked = !!checked;
  }
  
  // Actualizar LED (suma de ambos idiomas)
  const totalQty = st2.qty_en + st2.qty_es;
  const ledIndicator = cartaItem.querySelector('.led-indicator');
  if (ledIndicator) {
    ledIndicator.src = `icons/${totalQty > 0 ? 'Ledazul' : 'Ledrojo'}.png`;
  }
  
  // Actualizar has-qty class
  if (totalQty > 0) {
    cartaItem.classList.add('has-qty');
  } else {
    cartaItem.classList.remove('has-qty');
  }
}

// ===== Event listeners movidos a event delegation en wireGlobalButtons() =====
// Ya no se añaden listeners individuales aquí para evitar fugas de memoria
// Todo se maneja con UN SOLO listener delegado en el contenedor padre

// ===============================
// 5b) Autocompletar colección
// ===============================

function marcarTodasCartasSet() {
  if (!setActualKey) return;
  
  const cartas = cartasDeSetKey(setActualKey);
  cartas.forEach(c => {
    if (!c.oracle_id) return; // Skip si no tiene oracle_id
    const st2 = getEstadoCarta2(c.oracle_id);
    // Marcar en ambos idiomas si no tiene cantidad
    if (st2.qty_en === 0 && st2.qty_es === 0) {
      setQtyLang(c.oracle_id, "en", 1);
    }
  });
  
  renderTablaSet(setActualKey);
  scheduleRenderColecciones();
}

function desmarcarTodasCartasSet() {
  if (!setActualKey) return;
  
  const cartas = cartasDeSetKey(setActualKey);
  cartas.forEach(c => {
    if (!c.oracle_id) return; // Skip si no tiene oracle_id
    // Desmarcar ambos idiomas
    setQtyLang(c.oracle_id, "en", 0);
    setQtyLang(c.oracle_id, "es", 0);
  });
  
  renderTablaSet(setActualKey);
  scheduleRenderColecciones();
}

function parseRangosCartas(texto) {
  const rangos = texto.trim().split(',').map(s => s.trim()).filter(Boolean);
  const indices = new Set();
  
  for (const rango of rangos) {
    if (rango.includes('-')) {
      // Rango tipo "8-12"
      const [inicio, fin] = rango.split('-').map(n => parseInt(n.trim(), 10));
      if (isNaN(inicio) || isNaN(fin)) continue;
      
      for (let i = Math.min(inicio, fin); i <= Math.max(inicio, fin); i++) {
        indices.add(i);
      }
    } else {
      // Número individual tipo "1"
      const num = parseInt(rango, 10);
      if (!isNaN(num)) {
        indices.add(num);
      }
    }
  }
  
  return [...indices].sort((a, b) => a - b);
}

function aplicarRangosCartas(rangosTexto) {
  if (!setActualKey) return;
  
  const indices = parseRangosCartas(rangosTexto);
  if (indices.length === 0) return;
  
  const lista = getListaSetFiltrada(setActualKey);
  
  indices.forEach(idx => {
    // Las posiciones son 1-based para el usuario
    const cartaIdx = idx - 1;
    if (cartaIdx >= 0 && cartaIdx < lista.length) {
      const carta = lista[cartaIdx];
      if (!carta.oracle_id) return;
      const st2 = getEstadoCarta2(carta.oracle_id);
      // Por ahora solo EN
      setQtyLang(carta.oracle_id, "en", st2.qty_en + 1);
    }
  });
  
  renderTablaSet(setActualKey);
  scheduleRenderColecciones();
}


// ===============================
// 6) Buscar: por nombre + mostrar sets donde aparece y estado + botón Ir (set+idioma)
// ===============================

function buscarCartasPorNombre(texto) {
  const q = normalizarTexto(texto.trim());
  if (!q) return [];

  const coincidencias = cartas.filter(c => normalizarTexto(c.nombre).includes(q));

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

async function renderResultadosBuscar(texto, opts = {}) {
  const startTime = DEBUG ? performance.now() : 0;
  const cont = document.getElementById("resultadosBuscar");
  const q = (texto || "").trim();
  const exact = (typeof opts.exact === "boolean") ? opts.exact : getBuscarExacta();
  const verImagenes = (typeof opts.verImagenes === "boolean") ? opts.verImagenes : getBuscarVerImagenes();

  if (!cont) return;

  // Cancelar búsqueda anterior si existe
  cancelSearchAbort();
  searchAbortController = new AbortController();

  if (!q) {
    cont.innerHTML = `<div class="card"><p>Escribe un nombre y pulsa “Buscar”.</p></div>`;
    return;
  }

  // Guardar estado de expansión antes de limpiar
  const expandedGroups = new Set();
  cont.querySelectorAll(".versiones-container").forEach(container => {
    if (container.style.display !== "none") {
      expandedGroups.add(container.id);
    }
  });

  cont.innerHTML = `<div class="card"><p>Buscando en Scryfall…</p></div>`;

  let cards = [];
  try {
    cards = await scrySearchPrintsByName(q, { signal: searchAbortController.signal, exact });
  } catch (err) {
    if (err && err.name === "AbortError") return;
    console.error(err);
    cont.innerHTML = `<div class="card"><p>Error buscando. Mira la consola.</p></div>`;
    return;
  }

  const grupos = agruparResultadosBusqueda(cards);

  if (grupos.length === 0) {
    cont.innerHTML = `<div class="card"><p>No se encontraron cartas para: <strong>${escapeHtml(q)}</strong></p></div>`;
    return;
  }

  const avisoLimit = (cards.length >= SEARCH_LIMIT)
    ? `<div class="card"><p class="hint">Nota: se muestran solo las primeras ${SEARCH_LIMIT} ediciones (hay más reimpresiones).</p></div>`
    : "";

  let html = avisoLimit;

  if (verImagenes) {
    const controlsCfg = getCardControlsConfig();
    const extraCountersCfg = getEnabledCountersConfig().filter(c => c.key !== "qty" && c.key !== "foil");
    const extraTagsCfg = getEnabledTagsConfig();

    html += `<div class="cartas-grid cartas-grid-buscar">`;

    for (const g of grupos) {
      for (const v of g.versiones) {
        const lang = v.lang === "es" ? "es" : "en";
        const st2 = v.st2 || getEstadoCarta2(v.oracle_id);
        const qty = lang === "en" ? (st2.qty_en || 0) : (st2.qty_es || 0);
        const foilQty = lang === "en" ? (st2.foil_en || 0) : (st2.foil_es || 0);
        const totalQty = (st2.qty_en || 0) + (st2.qty_es || 0);
        const hasQty = totalQty > 0;
        const imgUrl = v._img || "";

        let controlsHtml = "";

        if (controlsCfg.showQty) {
          controlsHtml += `
            <div class="control-fila">
              <span class="lbl">Cantidad</span>
              <div class="stepper">
                <button class="btn-step btn-qty-minus-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}" ${qty <= 0 ? "disabled" : ""}>−</button>
                <input type="number" class="inp-num inp-qty-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}" min="0" max="999" value="${qty}" />
                <button class="btn-step btn-qty-plus-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}">+</button>
              </div>
            </div>
          `;
        }

        if (controlsCfg.showFoil) {
          controlsHtml += `
            <div class="control-fila">
              <span class="lbl">Foil</span>
              <div class="stepper">
                <button class="btn-step btn-foil-minus-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}" ${foilQty <= 0 || qty === 0 ? "disabled" : ""}>−</button>
                <input type="number" class="inp-num inp-foil-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}" min="0" max="${qty}" value="${foilQty}" ${qty === 0 ? "disabled" : ""} />
                <button class="btn-step btn-foil-plus-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}" ${qty === 0 || foilQty >= qty ? "disabled" : ""}>+</button>
              </div>
            </div>
          `;
        }

        for (const c of extraCountersCfg) {
          const value = getCounterValue(st2, lang, c.key);
          controlsHtml += `
            <div class="control-fila">
              <span class="lbl">${escapeHtml(c.label)}</span>
              <div class="stepper">
                <button class="btn-step btn-counter-minus" data-oracle="${v.oracle_id}" data-lang="${lang}" data-control="${escapeAttr(c.key)}" ${value <= 0 ? "disabled" : ""}>−</button>
                <input type="number" class="inp-num inp-counter" data-oracle="${v.oracle_id}" data-lang="${lang}" data-control="${escapeAttr(c.key)}" min="0" max="999" value="${value}" />
                <button class="btn-step btn-counter-plus" data-oracle="${v.oracle_id}" data-lang="${lang}" data-control="${escapeAttr(c.key)}">+</button>
              </div>
            </div>
          `;
        }

        for (const t of extraTagsCfg) {
          const checked = getTagValue(st2, lang, t.key);
          controlsHtml += `
            <div class="control-fila">
              <span class="lbl">${escapeHtml(t.label)}</span>
              <label class="chkline">
                <input type="checkbox" class="chk-tag" data-oracle="${v.oracle_id}" data-lang="${lang}" data-control="${escapeAttr(t.key)}" ${checked ? "checked" : ""} />
              </label>
            </div>
          `;
        }

        html += `
          <div class="carta-item${hasQty ? " has-qty" : ""} carta-item-buscar" data-oracle="${v.oracle_id}" data-card-id="${v.id}">
            <div class="carta-header">
              <img src="icons/${hasQty ? 'Ledazul' : 'Ledrojo'}.png" class="led-indicator" alt="" width="24" height="24">
              <button class="btn-link-carta" type="button" data-accion="ver-print" data-id="${v.id}">
                ${escapeHtml(v.nombre)} <span class="lang-pill">${formatLang(v.lang)}</span>
              </button>
              <span class="carta-numero">#${escapeHtml(v.collector_number || "")}</span>
            </div>
            <div class="hint" style="margin-top: 2px;">${escapeHtml(v.set_name || "")}</div>
            <div class="carta-imagen-container">
              ${imgUrl ? `<img class="carta-imagen" data-img-src="${escapeAttr(imgUrl)}" alt="${escapeAttr(v.nombre || "")}" loading="lazy" />` : `<div class="carta-imagen-placeholder">Sin imagen</div>`}
            </div>
            <div class="carta-controles">
              ${controlsHtml}
            </div>
            <button class="btn-secundario btn-ir-set" type="button" data-setkey="${v.setKey}" data-cardname="${escapeAttr(v.nombre || "")}">Ir</button>
          </div>
        `;
      }
    }

    html += `</div>`;
  } else {
    for (const g of grupos) {
      const grupoId = `grupo-${g.oracleId}`;
      const numVersiones = g.versiones.length;
      const isExpanded = expandedGroups.has(grupoId);
      
      html += `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <h3 style="margin: 0; flex: 1;">
              <button class="btn-link-carta" type="button" data-accion="ver-carta" data-oracle="${g.oracleId}">
                ${escapeHtml(g.titulo)}
              </button>
            </h3>
            <button 
              class="btn-secundario btn-toggle-versiones" 
              type="button" 
              data-target="${grupoId}"
              style="padding: 6px 12px; font-size: 0.9rem;"
            >
              ${isExpanded ? '▲ Ocultar' : '▼ Mostrar'} ${numVersiones} versión${numVersiones !== 1 ? 'es' : ''}
            </button>
          </div>

          <div id="${grupoId}" class="versiones-container" style="display: ${isExpanded ? 'block' : 'none'}; margin-top: 15px;">
            <div class="hint">Aparece en:</div>
            <ul class="lista-versiones">
      `;

      for (const v of g.versiones) {
        // Leer cantidades según el idioma de esta versión
        const lang = v.lang === "es" ? "es" : "en";
        const qty = lang === "en" ? (v.st2.qty_en || 0) : (v.st2.qty_es || 0);
        const foilQty = lang === "en" ? (v.st2.foil_en || 0) : (v.st2.foil_es || 0);

        html += `
          <li class="item-version">
            <div class="item-version-main">
              <div class="version-info">
                <img src="icons/${qty > 0 ? 'Ledazul' : 'Ledrojo'}.png" class="led-indicator" alt="" width="36" height="36">
                <button class="btn-link-carta" type="button" data-accion="ver-print" data-id="${v.id}">
                  <strong>${escapeHtml(v.set_name)}</strong>
                  <span class="lang-pill">${formatLang(v.lang)}</span>
                  <span class="hint"> (#${escapeHtml(v.collector_number)}, ${escapeHtml(v.rareza)})</span>
                </button>
              </div>

              <div class="version-controls">
                <!-- Cantidad -->
                <div class="control-fila-buscar">
                  <span class="lbl-buscar">Cantidad</span>
                  <div class="stepper stepper-buscar">
                    <button class="btn-step btn-qty-minus-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}" ${qty <= 0 ? "disabled" : ""}>−</button>
                    <input
                      type="number"
                      class="inp-num inp-qty-buscar"
                      data-oracle="${v.oracle_id}"
                      data-lang="${lang}"
                      min="0"
                      max="999"
                      value="${qty}"
                    />
                    <button class="btn-step btn-qty-plus-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}">+</button>
                  </div>
                </div>

                <!-- Foil -->
                <div class="control-fila-buscar">
                  <span class="lbl-buscar">Foil</span>
                  <div class="stepper stepper-buscar">
                    <button class="btn-step btn-foil-minus-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}" ${foilQty <= 0 || qty === 0 ? "disabled" : ""}>−</button>
                    <input
                      type="number"
                      class="inp-num inp-foil-buscar"
                      data-oracle="${v.oracle_id}"
                      data-lang="${lang}"
                      min="0"
                      max="${qty}"
                      value="${foilQty}"
                      ${qty === 0 ? "disabled" : ""}
                    />
                    <button class="btn-step btn-foil-plus-buscar" data-oracle="${v.oracle_id}" data-lang="${lang}" ${qty === 0 || foilQty >= qty ? "disabled" : ""}>+</button>
                  </div>
                </div>
              </div>

              <button
                class="btn-secundario btn-ir-set"
                type="button"
                data-setkey="${v.setKey}"
                data-cardname="${escapeAttr(v.nombre || "")}"
              >
                Ir
              </button>
            </div>
          </li>
        `;
      }

      html += `</ul></div></div>`;
    }
  }

  cont.innerHTML = html;

  // Map por id para abrir modal de un print concreto
  const verById = new Map();
  for (const g of grupos) for (const v of g.versiones) verById.set(v.id, v);

  // Título del grupo -> modal con imagen “general” del oracle
  const mapaOracleAImg = new Map();
  for (const g of grupos) mapaOracleAImg.set(g.oracleId, { titulo: g.titulo, img: g.img });

  cont._searchVerById = verById;
  cont._searchOracleImg = mapaOracleAImg;

  if (verImagenes) {
    cont.querySelectorAll("img.carta-imagen[data-img-src]").forEach(img => {
      const src = img.dataset.imgSrc;
      if (src) loadImageWithCache(img, src);
    });
  }

  // ===============================
  // Event Delegation para resultadosBuscar (búsqueda)
  // ===============================
  if (!cont.dataset.wiredSearch) {
    cont.dataset.wiredSearch = "1";

    cont.addEventListener("click", (e) => {
      const target = e.target;
      const btn = target.closest("button");
      if (!btn) return;

      if (btn.classList.contains("btn-toggle-versiones")) {
        const targetId = btn.dataset.target;
        const container = targetId ? document.getElementById(targetId) : null;

        if (container) {
          const isVisible = container.style.display !== "none";
          if (isVisible) {
            container.style.display = "none";
            btn.textContent = btn.textContent.replace("▲ Ocultar", "▼ Mostrar");
          } else {
            container.style.display = "block";
            btn.textContent = btn.textContent.replace("▼ Mostrar", "▲ Ocultar");
          }
        }
        return;
      }

      if (btn.dataset.accion === "ver-print") {
        const v = cont._searchVerById?.get(btn.dataset.id);
        if (!v) return;
        abrirModalCarta({
          titulo: v.nombre,
          imageUrl: v._img || null,
          numero: v.collector_number || "",
          rareza: v.rareza || "",
          precio: formatPrecioEUR(v._prices)
        });
        return;
      }

      if (btn.dataset.accion === "ver-carta") {
        const data = cont._searchOracleImg?.get(btn.dataset.oracle);
        if (!data) return;
        abrirModalCarta({ titulo: data.titulo, imageUrl: data.img });
        return;
      }

      if (btn.classList.contains("btn-qty-minus-buscar")) {
        const oracleId = btn.dataset.oracle;
        const lang = btn.dataset.lang || "en";
        if (!oracleId) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentQty = lang === "en" ? st2.qty_en : st2.qty_es;
        setQtyLang(oracleId, lang, currentQty - 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-qty-plus-buscar")) {
        const oracleId = btn.dataset.oracle;
        const lang = btn.dataset.lang || "en";
        if (!oracleId) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentQty = lang === "en" ? st2.qty_en : st2.qty_es;
        setQtyLang(oracleId, lang, currentQty + 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-foil-minus-buscar")) {
        const oracleId = btn.dataset.oracle;
        const lang = btn.dataset.lang || "en";
        if (!oracleId) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentFoil = lang === "en" ? st2.foil_en : st2.foil_es;
        setFoilLang(oracleId, lang, currentFoil - 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-foil-plus-buscar")) {
        const oracleId = btn.dataset.oracle;
        const lang = btn.dataset.lang || "en";
        if (!oracleId) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentFoil = lang === "en" ? st2.foil_en : st2.foil_es;
        setFoilLang(oracleId, lang, currentFoil + 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-counter-minus")) {
        const oracleId = btn.dataset.oracle;
        const lang = btn.dataset.lang || "en";
        const key = btn.dataset.control;
        if (!oracleId || !key) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentVal = getCounterValue(st2, lang, key);
        setCounterLang(oracleId, lang, key, currentVal - 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-counter-plus")) {
        const oracleId = btn.dataset.oracle;
        const lang = btn.dataset.lang || "en";
        const key = btn.dataset.control;
        if (!oracleId || !key) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentVal = getCounterValue(st2, lang, key);
        setCounterLang(oracleId, lang, key, currentVal + 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-ir-set")) {
        (async () => {
          const setKey = btn.dataset.setkey;
          const cardName = btn.dataset.cardname || "";
          if (!setKey) return;

          filtroSoloFaltanSet = false;
          setFiltroTextoSet(cardName);

          if (typeof hiddenEmptySetKeys !== "undefined" && hiddenEmptySetKeys.has(setKey)) {
            hiddenEmptySetKeys.delete(setKey);
            if (typeof guardarHiddenEmptySets === "function") guardarHiddenEmptySets();
          }

          await abrirSet(setKey);
          if (typeof aplicarUIFiltrosSet === "function") aplicarUIFiltrosSet();
        })();
      }
    });

    cont.addEventListener("change", (e) => {
      const target = e.target;

      if (target.classList.contains("inp-qty-buscar")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang || "en";
        if (!oracleId) return;
        setQtyLang(oracleId, lang, target.value);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
      }

      if (target.classList.contains("inp-foil-buscar")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang || "en";
        if (!oracleId) return;
        setFoilLang(oracleId, lang, target.value);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
      }

      if (target.classList.contains("inp-counter")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang || "en";
        const key = target.dataset.control;
        if (!oracleId || !key) return;
        setCounterLang(oracleId, lang, key, target.value);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
      }

      if (target.classList.contains("chk-tag")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang || "en";
        const key = target.dataset.control;
        if (!oracleId || !key) return;
        setTagLang(oracleId, lang, key, target.checked);
      }
    });
  }
}


function exportarEstado() {
  const payload = {
    app: "MTG Colecciones",
    version: 2, // Actualizado a v2
    exportedAt: new Date().toISOString(),
    estado, // Legacy para compatibilidad
    estado2, // Nuevo modelo
    oracleIdCache, // Para resolución
    cardControlsConfig: cardControlsConfig || DEFAULT_CARD_CONTROLS
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

  // Importar estado legacy (siempre presente)
  estado = payload.estado;

  // Importar estado2 si está presente (versión 2)
  if (payload.estado2) {
    estado2 = payload.estado2;
    guardarEstado2();
  }

  // Importar oracleIdCache si está presente
  if (payload.oracleIdCache) {
    oracleIdCache = payload.oracleIdCache;
    guardarOracleIdCache();
  }

  if (payload.cardControlsConfig) {
    cardControlsConfig = normalizeCardControlsConfig(payload.cardControlsConfig);
    guardarCardControlsConfig();
  }

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
// DECKS: Gestión de mazos
// ===============================

const LS_DECKS_KEY = "mtg_decks_v1";
let decks = [];
let deckActual = null;
let modoDeckVisualizacion = 'lista'; // 'lista' o 'imagenes'

function cargarDecks() {
  const raw = safeLocalStorageGet(LS_DECKS_KEY);
  if (!raw) return;
  try {
    decks = JSON.parse(raw);
  } catch (e) {
    console.error("Error cargando decks:", e);
  }
}

function guardarDecks() {
  safeLocalStorageSet(LS_DECKS_KEY, JSON.stringify(decks));
  if (typeof sbMarkDirty === "function") sbMarkDirty();
}

// Parser de formato Moxfield: "1 Argonath, Pillars of the Kings (LTC) 351"
// Soporta: foil (*F*), etched (*E*), números con guiones (MH2-12), etc.
function parsearLineaDeck(linea) {
  // Regex mejorado: permite números con guiones y caracteres opcionales al final (*F*, *E*, etc.)
  const match = linea.match(/^(\d+)\s+(.+?)\s+\(([A-Z0-9]+)\)\s+([\w-]+)(?:\s+\*[A-Z]\*)?$/i);
  if (!match) return null;
  
  return {
    cantidad: parseInt(match[1], 10),
    nombre: match[2].trim(),
    set: match[3].toUpperCase(),
    numero: match[4]
  };
}

function parsearListaDeck(texto) {
  const lineas = texto.split('\n').map(l => l.trim());
  const cartas = [];
  const sideboard = [];
  let esSideboard = false;
  
  for (const linea of lineas) {
    // Detectar inicio de sideboard
    if (linea.toUpperCase() === 'SIDEBOARD:') {
      esSideboard = true;
      continue;
    }
    
    if (!linea) continue;
    
    const carta = parsearLineaDeck(linea);
    if (carta) {
      if (esSideboard) {
        sideboard.push(carta);
      } else {
        cartas.push(carta);
      }
    }
  }
  
  return { cartas, sideboard };
}

function renderListaDecks() {
  const cont = document.getElementById("listaDecks");
  if (!cont) return;
  
  if (decks.length === 0) {
    cont.innerHTML = `<div class="card"><p class="hint">No hay decks todavía. Pulsa "+ Agregar Deck" para crear uno.</p></div>`;
    return;
  }
  
  let html = "";
  decks.forEach((deck, idx) => {
    const totalCartas = deck.cartas.reduce((sum, c) => sum + c.cantidad, 0);
    const tengo = deck.cartas.filter(c => c.tengo).length;
    const faltantes = deck.cartas.length - tengo;
    
    html += `
      <div class="card">
        <h3 style="margin-top:0;">
          <button class="btn-link-carta" data-deck-idx="${idx}" style="font-size: 1.1rem;">
            ${deck.nombre}
          </button>
        </h3>
        <div class="hint">
          ${totalCartas} cartas · ${tengo} tengo · ${faltantes} faltan
        </div>
      </div>
    `;
  });
  
  cont.innerHTML = html;
  
  cont.querySelectorAll(".btn-link-carta").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.deckIdx, 10);
      abrirDeck(idx);
    });
  });
}

function abrirDeck(idx) {
  deckActual = decks[idx];
  if (!deckActual) return;
  
  document.getElementById("tituloVerDeck").textContent = deckActual.nombre;
  mostrarPantalla("verDeck");
  
  // Verificar si necesita cargar información adicional
  const primeracarta = deckActual.cartas[0];
  const necesitaVerificacion = !primeracarta || !primeracarta.tipoLinea;
  
  if (necesitaVerificacion) {
    // Mostrar indicador de carga
    document.getElementById("mensajeCargandoDeck").style.display = "block";
    document.getElementById("listaCartasDeck").innerHTML = '';
    
    // Verificar en segundo plano
    actualizarEstadoDeck().then(() => {
      document.getElementById("mensajeCargandoDeck").style.display = "none";
    }).catch(err => {
      console.error('Error actualizando deck:', err);
      document.getElementById("mensajeCargandoDeck").style.display = "none";
      renderDeckCartas();
    });
  } else {
    renderDeckCartas();
  }
}

async function verificarCartasEnColeccion(cartas) {
  const cartasVerificadas = [];
  
  // Pre-cargar sets donde el usuario tiene cartas (según progreso guardado)
  const setsConProgreso = Object.keys(progresoPorSet || {});
  const setsACargar = new Set(setsConProgreso);
  
  // Agregar los sets de las cartas del deck
  for (const carta of cartas) {
    setsACargar.add(`${carta.set.toLowerCase()}__en`);
  }
  
  // Cargar todos los sets necesarios en paralelo (más rápido)
  await Promise.all(
    Array.from(setsACargar).map(setKey => ensureSetCardsLoaded(setKey).catch(() => {}))
  );
  
  // Caché de búsquedas por nombre para evitar duplicados
  const cacheBusquedas = new Map();
  
  for (const carta of cartas) {
    const setKey = `${carta.set.toLowerCase()}__en`;
    const listaSet = cartasDeSetKey(setKey);
    const existeExacta = listaSet.find(c => c.numero === carta.numero);
    
    // Guardar información adicional de la carta
    let infoAdicional = {};
    
    // Intentar obtener de la carta existente en el catálogo
    if (existeExacta && existeExacta._raw) {
      const raw = existeExacta._raw;
      infoAdicional = {
        tipoLinea: raw.type_line || existeExacta.type_line || '',
        cmc: raw.cmc !== undefined ? raw.cmc : (existeExacta.cmc || 0),
        colorIdentity: raw.color_identity?.length > 1 ? 'M' : (raw.color_identity?.[0] || existeExacta.color_identity?.[0] || 'C')
      };
    } else if (existeExacta) {
      infoAdicional = {
        tipoLinea: existeExacta.type_line || '',
        cmc: existeExacta.cmc || 0,
        colorIdentity: existeExacta.color_identity?.length > 1 ? 'M' : (existeExacta.color_identity?.[0] || 'C')
      };
    }
    
    // Si no tenemos información de tipo, buscar en Scryfall
    if (!infoAdicional.tipoLinea) {
      try {
        const versiones = await scrySearchPrintsByName(carta.nombre);
        if (versiones.length > 0) {
          const primeraVersion = versiones[0];
          infoAdicional = {
            tipoLinea: primeraVersion.type_line || '',
            cmc: primeraVersion.cmc !== undefined ? primeraVersion.cmc : 0,
            colorIdentity: primeraVersion.color_identity?.length > 1 ? 'M' : (primeraVersion.color_identity?.[0] || 'C')
          };
        }
      } catch (error) {
        console.error(`Error obteniendo info de ${carta.nombre}:`, error);
      }
    }
    
    // Si existe exacta y la tengo con la cantidad necesaria
    if (existeExacta && existeExacta.oracle_id) {
      const st2 = getEstadoCarta2(existeExacta.oracle_id);
      const totalQty = st2.qty_en + st2.qty_es;
      if (totalQty >= carta.cantidad) {
        cartasVerificadas.push({
          ...carta,
          ...infoAdicional,
          tengo: true,
          ledType: 'azul'
        });
        continue;
      }
    }
    
    // Buscar si tengo la carta en cualquier otra edición
    let tieneEnOtraEdicion = false;
    const oracleId = existeExacta?.oracle_id;
    
    if (oracleId) {
      // Buscar por oracle_id usando estado2 (muy rápido)
      const st2 = getEstadoCarta2(oracleId);
      const totalQty = st2.qty_en + st2.qty_es;
      if (totalQty > 0) {
        tieneEnOtraEdicion = true;
      }
    } else {
      // Si no tenemos oracle_id, buscar por nombre (más lento)
      const nombreNorm = normalizarTexto(carta.nombre);
      
      // Verificar si ya buscamos este nombre antes
      if (!cacheBusquedas.has(nombreNorm)) {
        // Buscar en sets cargados primero
        let encontradaEnCache = false;
        for (const [setKeyCargado, cartasCargadas] of Object.entries(cacheCartasPorSetLang)) {
          for (const c of cartasCargadas) {
            if (normalizarTexto(c.nombre) === nombreNorm && c.oracle_id) {
              const st2 = getEstadoCarta2(c.oracle_id);
              const totalQty = st2.qty_en + st2.qty_es;
              if (totalQty > 0) {
                encontradaEnCache = true;
                break;
              }
            }
          }
          if (encontradaEnCache) break;
        }
        
        // Si no se encontró en caché, buscar en Scryfall (último recurso)
        if (!encontradaEnCache) {
          try {
            const todasLasVersiones = await scrySearchPrintsByName(carta.nombre);
            for (const version of todasLasVersiones) {
              if (version.oracle_id) {
                const st2 = getEstadoCarta2(version.oracle_id);
                const totalQty = st2.qty_en + st2.qty_es;
                if (totalQty > 0) {
                  encontradaEnCache = true;
                  break;
                }
              }
            }
          } catch (error) {
            console.error(`Error buscando versiones de ${carta.nombre}:`, error);
          }
        }
        
        cacheBusquedas.set(nombreNorm, encontradaEnCache);
      }
      
      tieneEnOtraEdicion = cacheBusquedas.get(nombreNorm);
    }
    
    cartasVerificadas.push({
      ...carta,
      ...infoAdicional,
      tengo: tieneEnOtraEdicion,
      ledType: tieneEnOtraEdicion ? 'violeta' : 'rojo'
    });
  }
  
  return cartasVerificadas;
}

// Funciones auxiliares para decks
let ordenDeckActual = 'default';

function extraerTipoPrincipal(carta) {
  // Si la carta tiene información de tipo, la usamos
  if (carta.tipoLinea) {
    const tipo = carta.tipoLinea.toLowerCase();
    if (tipo.includes('creature')) return 'Criatura';
    if (tipo.includes('planeswalker')) return 'Planeswalker';
    if (tipo.includes('instant')) return 'Instantáneo';
    if (tipo.includes('sorcery')) return 'Conjuro';
    if (tipo.includes('enchantment')) return 'Encantamiento';
    if (tipo.includes('artifact')) return 'Artefacto';
    if (tipo.includes('land')) return 'Tierra';
  }
  return 'Otro';
}

function ordenarCartasDeck(cartas, criterio) {
  const copiaCartas = [...cartas];
  
  switch (criterio) {
    case 'tipo':
      const ordenTipos = {
        'Criatura': 1,
        'Planeswalker': 2,
        'Instantáneo': 3,
        'Conjuro': 4,
        'Encantamiento': 5,
        'Artefacto': 6,
        'Tierra': 7,
        'Otro': 8
      };
      return copiaCartas.sort((a, b) => {
        const tipoA = extraerTipoPrincipal(a);
        const tipoB = extraerTipoPrincipal(b);
        const diff = ordenTipos[tipoA] - ordenTipos[tipoB];
        if (diff !== 0) return diff;
        return normalizarTexto(a.nombre).localeCompare(normalizarTexto(b.nombre));
      });
      
    case 'cmc':
      return copiaCartas.sort((a, b) => {
        const cmcA = a.cmc || 0;
        const cmcB = b.cmc || 0;
        if (cmcA !== cmcB) return cmcA - cmcB;
        return normalizarTexto(a.nombre).localeCompare(normalizarTexto(b.nombre));
      });
      
    case 'color':
      const ordenColores = { 'W': 1, 'U': 2, 'B': 3, 'R': 4, 'G': 5, 'C': 6, 'M': 7 };
      return copiaCartas.sort((a, b) => {
        const colorA = a.colorIdentity || 'C';
        const colorB = b.colorIdentity || 'C';
        const diff = ordenColores[colorA] - ordenColores[colorB];
        if (diff !== 0) return diff;
        return normalizarTexto(a.nombre).localeCompare(normalizarTexto(b.nombre));
      });
      
    case 'nombre':
      return copiaCartas.sort((a, b) => {
        return normalizarTexto(a.nombre).localeCompare(normalizarTexto(b.nombre));
      });
      
    default:
      return copiaCartas;
  }
}

function renderDeckCartas() {
  if (!deckActual) return;
  
  const totalCartas = deckActual.cartas.reduce((sum, c) => sum + c.cantidad, 0);
  const tengo = deckActual.cartas.filter(c => c.tengo).length;
  const faltantes = deckActual.cartas.length - tengo;
  
  let resumenTexto = `<strong>${totalCartas} cartas</strong> · ${tengo} tengo · ${faltantes} faltan`;
  
  if (deckActual.sideboard && deckActual.sideboard.length > 0) {
    const totalSide = deckActual.sideboard.reduce((sum, c) => sum + c.cantidad, 0);
    const tengoSide = deckActual.sideboard.filter(c => c.tengo).length;
    resumenTexto += ` <span class="hint">(+${totalSide} sideboard)</span>`;
  }
  
  document.getElementById("resumenDeck").innerHTML = resumenTexto;
  
  // Renderizar según el modo seleccionado
  if (modoDeckVisualizacion === 'imagenes') {
    // Limpiar contenido anterior inmediatamente
    document.getElementById("listaCartasDeck").innerHTML = '';
    renderDeckCartasModoImagenes();
  } else {
    renderDeckCartasModoLista();
  }
}

function renderDeckCartasModoLista() {
  
  let cartasNormales = [...deckActual.cartas];
  
  // Ordenar según el criterio seleccionado
  if (ordenDeckActual !== 'default') {
    cartasNormales = ordenarCartasDeck(cartasNormales, ordenDeckActual);
  }
  
  let html = "";
  
  // Si se ordena por tipo, agrupar visualmente
  if (ordenDeckActual === 'tipo' && cartasNormales.length > 0) {
    const gruposPorTipo = {};
    cartasNormales.forEach(carta => {
      const tipo = extraerTipoPrincipal(carta);
      if (!gruposPorTipo[tipo]) gruposPorTipo[tipo] = [];
      gruposPorTipo[tipo].push(carta);
    });
    
    const ordenTipos = ['Criatura', 'Planeswalker', 'Instantáneo', 'Conjuro', 'Encantamiento', 'Artefacto', 'Tierra', 'Otro'];
    for (const tipo of ordenTipos) {
      if (gruposPorTipo[tipo] && gruposPorTipo[tipo].length > 0) {
        html += `<h4 style='margin-top: 20px; margin-bottom: 10px;'>${tipo}s (${gruposPorTipo[tipo].length})</h4>`;
        html += "<ul style='list-style: none; padding: 0; margin: 0;'>";
        gruposPorTipo[tipo].forEach((carta, idx) => {
          html += renderCartaDeck(carta, idx + 1, 'normal');
        });
        html += "</ul>";
      }
    }
  } else {
    // Cartas normales
    if (cartasNormales.length > 0) {
      html += "<ul style='list-style: none; padding: 0; margin: 0;'>";
      cartasNormales.forEach((carta, idx) => {
        html += renderCartaDeck(carta, idx + 1, 'normal');
      });
      html += "</ul>";
    }
  }
  
  // Sideboard
  if (deckActual.sideboard && deckActual.sideboard.length > 0) {
    html += "<h4 style='margin-top: 20px; margin-bottom: 10px;'>Sideboard</h4>";
    html += "<ul style='list-style: none; padding: 0; margin: 0;'>";
    deckActual.sideboard.forEach((carta, idx) => {
      html += renderCartaDeck(carta, idx + 1, 'sideboard');
    });
    html += "</ul>";
  }
  
  document.getElementById("listaCartasDeck").innerHTML = html;
  
  // Event listeners
  wireBotonesMostrarCartaDeck();
  wireBotonesIrDeckCarta();
}

async function renderDeckCartasModoImagenes() {
  if (!deckActual) return;
  
  // Mostrar mensaje de carga
  const mensajeCarga = document.getElementById("mensajeCargandoImagenesDeck");
  if (mensajeCarga) mensajeCarga.style.display = "block";
  
  let cartasNormales = [...deckActual.cartas];
  
  // Ordenar según el criterio seleccionado
  if (ordenDeckActual !== 'default') {
    cartasNormales = ordenarCartasDeck(cartasNormales, ordenDeckActual);
  }
  
  let html = '';
  
  // Si se ordena por tipo, agrupar visualmente
  if (ordenDeckActual === 'tipo') {
    const gruposPorTipo = {};
    cartasNormales.forEach(carta => {
      const tipo = extraerTipoPrincipal(carta);
      if (!gruposPorTipo[tipo]) gruposPorTipo[tipo] = [];
      gruposPorTipo[tipo].push(carta);
    });
    
    const ordenTipos = ['Criatura', 'Planeswalker', 'Instantáneo', 'Conjuro', 'Encantamiento', 'Artefacto', 'Tierra', 'Otro'];
    let posicion = 1;
    
    for (const tipo of ordenTipos) {
      if (gruposPorTipo[tipo] && gruposPorTipo[tipo].length > 0) {
        html += `<h4 style='margin-top: 20px; margin-bottom: 10px;'>${tipo}s (${gruposPorTipo[tipo].length})</h4>`;
        html += '<div class="cartas-grid">';
        for (const carta of gruposPorTipo[tipo]) {
          html += await renderCartaDeckImagen(carta, posicion, 'normal');
          posicion++;
        }
        html += '</div>';
      }
    }
  } else {
    // Sin agrupación
    html += '<div class="cartas-grid">';
    let posicion = 1;
    for (const carta of cartasNormales) {
      html += await renderCartaDeckImagen(carta, posicion, 'normal');
      posicion++;
    }
    html += '</div>';
  }
  
  // Sideboard
  if (deckActual.sideboard && deckActual.sideboard.length > 0) {
    html += `<h4 style='margin-top: 20px; margin-bottom: 10px;'>Sideboard (${deckActual.sideboard.length})</h4>`;
    html += '<div class="cartas-grid">';
    let posicionSide = 1;
    for (const carta of deckActual.sideboard) {
      html += await renderCartaDeckImagen(carta, posicionSide, 'sideboard');
      posicionSide++;
    }
    html += '</div>';
  }
  
  document.getElementById("listaCartasDeck").innerHTML = html;
  
  // Ocultar mensaje de carga
  if (mensajeCarga) mensajeCarga.style.display = "none";
  
  // Event listeners
  wireControlesDeckImagenes();
}

async function renderCartaDeckImagen(carta, posicion, tipo) {
  const ledIcon = carta.ledType === 'violeta' ? 'Ledvioleta' : (carta.tengo ? 'Ledazul' : 'Ledrojo');
  const setKey = `${carta.set.toLowerCase()}__en`;
  
  // Cargar el set y obtener la imagen
  await ensureSetCardsLoaded(setKey);
  const listaSet = cartasDeSetKey(setKey);
  const cartaCatalogo = listaSet.find(c => c.numero === carta.numero);
  const tieneImg = cartaCatalogo?._img && cartaCatalogo._img.trim() !== "";
  const imagenUrl = cartaCatalogo?._img || '';
  
  // Obtener cantidad real de la colección
  const st2 = cartaCatalogo && cartaCatalogo.oracle_id 
    ? getEstadoCarta2(cartaCatalogo.oracle_id) 
    : { qty_en: 0, qty_es: 0, foil_en: 0, foil_es: 0 };
  // Por ahora solo mostramos EN
  const cantidadMostrar = st2.qty_en;
  
  const oracleId = cartaCatalogo?.oracle_id || '';
  
  return `
    <div class="carta-item ${cantidadMostrar > 0 ? 'has-qty' : ''}">
      <!-- Header de la carta -->
      <div class="carta-header">
        <img src="icons/${ledIcon}.png" class="led-indicator" alt="" width="24" height="24">
        <button
          class="btn-link-carta btn-ver-carta-deck-img"
          type="button"
          data-nombre="${escapeAttr(carta.nombre)}"
          data-set="${carta.set}"
          data-numero="${carta.numero}"
        >
          ${carta.nombre}
        </button>
        <span class="carta-numero">#${posicion}</span>
      </div>

      <!-- Imagen de la carta -->
      <div class="carta-imagen-container">
        ${tieneImg 
          ? `<img src="${imagenUrl}" alt="${carta.nombre}" class="carta-imagen" loading="lazy" />`
          : `<div class="carta-imagen-placeholder">Sin imagen</div>`
        }
      </div>

      <!-- Controles de cantidad -->
      <div class="carta-controles">
        <div class="control-fila">
          <span class="lbl">Cantidad</span>
          <div class="stepper">
            <button class="btn-step btn-qty-minus-deck" data-oracle="${oracleId}" ${cantidadMostrar <= 0 ? "disabled" : ""}>−</button>
            <input
              type="number"
              class="inp-num inp-qty-deck"
              data-oracle="${oracleId}"
              min="0"
              max="999"
              value="${cantidadMostrar}"
            />
            <button class="btn-step btn-qty-plus-deck" data-oracle="${oracleId}">+</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function wireControlesDeckImagenes() {
  const cont = document.getElementById("listaCartasDeck");
  if (!cont) return;
  
  // Ver carta
  cont.querySelectorAll(".btn-ver-carta-deck-img").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nombre = btn.dataset.nombre;
      const set = btn.dataset.set;
      const numero = btn.dataset.numero;
      
      const setKey = `${set.toLowerCase()}__en`;
      await ensureSetCardsLoaded(setKey);
      const listaSet = cartasDeSetKey(setKey);
      const carta = listaSet.find(c => c.numero === numero);
      
      if (carta) {
        abrirModalCarta({
          titulo: carta.nombre || nombre,
          imageUrl: carta._img || null,
          numero: carta.numero || numero,
          rareza: carta.rareza || "",
          precio: formatPrecioEUR(carta._prices),
          cardData: carta._raw || null
        });
      }
    });
  });
  
  // Controles de cantidad
  cont.querySelectorAll(".btn-qty-minus-deck").forEach(btn => {
    btn.addEventListener("click", () => {
      const oracleId = btn.dataset.oracle;
      if (!oracleId) return;
      const st2 = getEstadoCarta2(oracleId);
      // Por ahora solo EN
      setQtyLang(oracleId, "en", st2.qty_en - 1);
      renderDeckCartas();
      renderColecciones();
    });
  });

  cont.querySelectorAll(".btn-qty-plus-deck").forEach(btn => {
    btn.addEventListener("click", () => {
      const oracleId = btn.dataset.oracle;
      if (!oracleId) return;
      const st2 = getEstadoCarta2(oracleId);
      setQtyLang(oracleId, "en", st2.qty_en + 1);
      renderDeckCartas();
      renderColecciones();
    });
  });

  cont.querySelectorAll(".inp-qty-deck").forEach(inp => {
    inp.addEventListener("change", () => {
      const oracleId = inp.dataset.oracle;
      if (!oracleId) return;
      setQtyLang(oracleId, "en", inp.value);
      renderDeckCartas();
      renderColecciones();
    });
  });
}

function renderCartaDeck(carta, numero, tipo) {
  const ledIcon = carta.ledType === 'violeta' ? 'Ledvioleta' : (carta.tengo ? 'Ledazul' : 'Ledrojo');
  const cartaId = `${carta.set}-${carta.numero}-${tipo}`;
  const setKey = `${carta.set.toLowerCase()}__en`;
  
  return `
    <li style="padding: 8px 0; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px;">
      <span style="min-width: 25px; text-align: right; font-weight: 500; color: #666;">${numero}</span>
      <img src="icons/${ledIcon}.png" alt="" width="24" height="24" class="deck-led" data-carta-id="${cartaId}">
      <button class="btn-link-carta btn-ver-carta-deck" data-nombre="${escapeAttr(carta.nombre)}" data-set="${carta.set}" data-numero="${carta.numero}" style="text-align: left; flex: 1;">
        <strong>${carta.cantidad}x</strong> ${carta.nombre} <span class="hint">(${carta.set} #${carta.numero})</span>
      </button>
      <button class="btn-secundario btn-ir-deck-carta" type="button" data-setkey="${setKey}" data-cardname="${escapeAttr(carta.nombre)}" style="padding: 4px 12px; font-size: 0.9rem;">Ir</button>
    </li>
  `;
}

async function completarMazo() {
  if (!deckActual) return;
  
  const cartasFaltantes = [];
  
  // Recopilar todas las cartas faltantes (LED rojo)
  const todasLasCartas = [...deckActual.cartas];
  if (deckActual.sideboard) {
    todasLasCartas.push(...deckActual.sideboard);
  }
  
  for (const carta of todasLasCartas) {
    if (carta.ledType === 'rojo' || (!carta.tengo && carta.ledType !== 'violeta')) {
      cartasFaltantes.push(carta);
    }
  }
  
  if (cartasFaltantes.length === 0) {
    alert("No hay cartas faltantes en este mazo.");
    return;
  }
  
  // Añadir todas las cartas faltantes
  for (const carta of cartasFaltantes) {
    await marcarCartaDeck(carta.nombre, carta.set, carta.numero);
  }
  
  // Marcar que se completó el mazo
  deckActual.completado = true;
  guardarDecks();
  
  // Actualizar estado
  actualizarEstadoDeck();
  
  alert(`Se han agregado ${cartasFaltantes.length} cartas a tu colección.`);
}

function wireCheckboxesDeck() {
  const checkboxes = document.querySelectorAll(".chk-carta-deck");
  checkboxes.forEach(chk => {
    chk.addEventListener("change", async () => {
      const nombre = chk.dataset.nombre;
      const set = chk.dataset.set;
      const numero = chk.dataset.numero;
      const tipo = chk.dataset.tipo;
      const cartaId = chk.dataset.cartaId;
      
      if (chk.checked) {
        // Buscar la carta en el catálogo y marcarla
        await marcarCartaDeck(nombre, set, numero);
      }
      
      // Actualizar LED
      const led = document.querySelector(`.deck-led[data-carta-id="${cartaId}"]`);
      if (led && chk.checked) {
        led.src = "icons/Ledazul.png";
      }
      
      // Actualizar en el deck
      actualizarEstadoCartaEnDeck(nombre, set, numero, tipo, chk.checked);
    });
  });
  
  // Checkbox maestro
  const chkMaestro = document.getElementById("chkMarcarTodasDeck");
  if (chkMaestro) {
    chkMaestro.addEventListener("change", () => {
      checkboxes.forEach(chk => {
        if (!chk.checked && chkMaestro.checked) {
          chk.checked = true;
          chk.dispatchEvent(new Event('change'));
        } else if (chk.checked && !chkMaestro.checked) {
          chk.checked = false;
        }
      });
      if (!chkMaestro.checked) {
        renderDeckCartas();
      }
    });
  }
}

async function marcarCartaDeck(nombre, set, numero) {
  // Buscar la carta exacta
  const setKey = `${set.toLowerCase()}__en`;
  await ensureSetCardsLoaded(setKey);
  const listaSet = cartasDeSetKey(setKey);
  const carta = listaSet.find(c => c.numero === numero);
  
  if (carta && carta.oracle_id) {
    const st2 = getEstadoCarta2(carta.oracle_id);
    if (st2.qty_en === 0) {
      // Por ahora solo EN
      setQtyLang(carta.oracle_id, "en", 1);
      renderColecciones();
    }
  }
}

function actualizarEstadoCartaEnDeck(nombre, set, numero, tipo, marcado) {
  let lista;
  if (tipo === 'sideboard') {
    lista = deckActual.sideboard;
  } else {
    lista = deckActual.cartas;
  }
  
  const carta = lista.find(c => c.nombre === nombre && c.set === set && c.numero === numero);
  if (carta) {
    carta.tengo = marcado;
    if (marcado) carta.ledType = 'azul';
    guardarDecks();
  }
}

function wireBotonesMostrarCartaDeck() {
  document.querySelectorAll(".btn-ver-carta-deck").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nombre = btn.dataset.nombre;
      const set = btn.dataset.set;
      const numero = btn.dataset.numero;
      
      // Buscar la carta
      const setKey = `${set.toLowerCase()}__en`;
      await ensureSetCardsLoaded(setKey);
      const listaSet = cartasDeSetKey(setKey);
      const carta = listaSet.find(c => c.numero === numero);
      
      if (carta) {
        abrirModalCarta({
          titulo: carta.nombre || nombre,
          imageUrl: carta._img || null,
          numero: carta.numero || numero,
          rareza: carta.rareza || "",
          precio: formatPrecioEUR(carta._prices),
          cardData: carta._raw || null
        });
      } else {
        // Si no encuentra la carta exacta, mostrar solo el nombre
        abrirModalCarta({
          titulo: nombre,
          imageUrl: null,
          numero: numero,
          rareza: "",
          precio: null
        });
      }
    });
  });
}

function wireBotonesIrDeckCarta() {
  document.querySelectorAll(".btn-ir-deck-carta").forEach(btn => {
    btn.addEventListener("click", async () => {
      const setKey = btn.dataset.setkey;
      const cardName = btn.dataset.cardname || "";
      if (!setKey) return;

      filtroSoloFaltanSet = false;
      setFiltroTextoSet(cardName);

      if (typeof hiddenEmptySetKeys !== "undefined" && hiddenEmptySetKeys.has(setKey)) {
        hiddenEmptySetKeys.delete(setKey);
        if (typeof guardarHiddenEmptySets === "function") guardarHiddenEmptySets();
      }

      await abrirSet(setKey);
      if (typeof aplicarUIFiltrosSet === "function") aplicarUIFiltrosSet();
    });
  });
}

async function actualizarEstadoDeck() {
  if (!deckActual) return;
  
  // Re-verificar todas las cartas
  deckActual.cartas = await verificarCartasEnColeccion(deckActual.cartas);
  if (deckActual.sideboard) {
    deckActual.sideboard = await verificarCartasEnColeccion(deckActual.sideboard);
  }
  
  guardarDecks();
  renderDeckCartas();
}


// ===============================
// 7) Inicialización (botones + pantallas)
// ===============================

function wireGlobalButtons() {
  // Theme buttons removed — app forces light theme.

// Pantalla de inicio eliminada - la app abre directamente en el menú

  // Stats: recalcular
  const btnStatsRecalcular = document.getElementById("btnStatsRecalcular");
  if (btnStatsRecalcular) {
    btnStatsRecalcular.addEventListener("click", async () => {
      const prevText = btnStatsRecalcular.textContent;
      btnStatsRecalcular.disabled = true;
      btnStatsRecalcular.textContent = "Recalculando...";

      const start = performance.now();
      await recomputeAllProgressFromCache();
      if (typeof renderEstadisticas === "function") renderEstadisticas({ forceRecalc: true });
      scheduleRenderColecciones();

      const elapsed = Math.round(performance.now() - start);
      btnStatsRecalcular.textContent = `✓ Hecho (${elapsed}ms)`;

      setTimeout(() => {
        btnStatsRecalcular.disabled = false;
        btnStatsRecalcular.textContent = prevText;
      }, 1200);
    });
  }

  const handleMenuNavigation = (destino) => {
    if (!destino) return;

    if (destino === "colecciones") {
      mostrarPantalla("colecciones");
      aplicarUIFiltrosColecciones();
      aplicarUIFiltrosTipo();
      renderColecciones();
      return;
    }

    if (destino === "buscar") {
      mostrarPantalla("buscar");
      const inputBuscar = document.getElementById("inputBuscar");
      if (inputBuscar) inputBuscar.value = "";
      renderResultadosBuscar("");
      return;
    }

    if (destino === "comandantes") {
      mostrarPantalla("comandantes");
      resetCommanderSearchUI();
      return;
    }

    if (destino === "decks") {
      mostrarPantalla("decks");
      renderListaDecks();
      return;
    }

    if (destino === "estadisticas") {
      mostrarPantalla("estadisticas");
      renderEstadisticas({ forceRecalc: false }); // pinta rápido con lo guardado
      return;
    }

    if (destino === "cuenta") {
      mostrarPantalla("cuenta");
      // Actualizar fecha del catálogo
      actualizarFechaCatalogo();
    }
  };

  document.querySelectorAll(".btn-menu").forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      handleMenuNavigation(btn.dataset.pantalla);
    });
  });

  // Menú principal (delegado)
  if (!document.body.dataset.menuWired) {
    document.body.dataset.menuWired = "1";
    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-menu");
      if (!btn) return;
      handleMenuNavigation(btn.dataset.pantalla);
    });
  }

  // Volver al menú
  document.querySelectorAll("[data-action='volverMenu']").forEach(btn => {
    btn.addEventListener("click", () => {
      window.history.back(); // Usar el historial del navegador
    });
  });
  
  // Buscar actualizaciones manualmente
  const btnBuscarActualizaciones = document.getElementById("btnBuscarActualizaciones");
  if (btnBuscarActualizaciones) {
    btnBuscarActualizaciones.addEventListener("click", async () => {
      await buscarActualizacionesManualmente();
    });
  }

  // Volver a decks
  document.querySelectorAll("[data-action='volverDecks']").forEach(btn => {
    btn.addEventListener("click", () => {
      window.history.back(); // Usar el historial del navegador
    });
  });

  // Volver a colecciones
  document.querySelectorAll("[data-action='volverColecciones']").forEach(btn => {
    btn.addEventListener("click", () => {
      window.history.back(); // Usar el historial del navegador
    });
  });

  // Buscar cartas
  const btnBuscar = document.getElementById("btnBuscar");
  if (btnBuscar) {
    btnBuscar.addEventListener("click", async () => {
      const inputBuscar = document.getElementById("inputBuscar");
      await renderResultadosBuscar(inputBuscar ? inputBuscar.value : "", { exact: getBuscarExacta() });
    });
  }

  const inputBuscar = document.getElementById("inputBuscar");
  if (inputBuscar) {
    inputBuscar.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") await renderResultadosBuscar(inputBuscar.value, { exact: getBuscarExacta() });
    });
  }

  const chkBuscarExacta = document.getElementById("chkBuscarExacta");
  if (chkBuscarExacta) {
    chkBuscarExacta.addEventListener("change", () => {
      buscarExacta = !!chkBuscarExacta.checked;
    });
  }

  const chkBuscarVerImagenes = document.getElementById("chkBuscarVerImagenes");
  if (chkBuscarVerImagenes) {
    chkBuscarVerImagenes.addEventListener("change", () => {
      buscarVerImagenes = !!chkBuscarVerImagenes.checked;
      const q = document.getElementById("inputBuscar")?.value || "";
      if (q.trim()) {
        renderResultadosBuscar(q, { exact: getBuscarExacta(), verImagenes: buscarVerImagenes });
      }
    });
  }

  // Buscar comandantes
  const btnBuscarComandantes = document.getElementById("btnBuscarComandantes");
  if (btnBuscarComandantes) {
    btnBuscarComandantes.addEventListener("click", async () => {
      await renderResultadosComandantes();
    });
  }

  const btnLuckyCommander = document.getElementById("btnLuckyCommander");
  if (btnLuckyCommander) {
    btnLuckyCommander.addEventListener("click", async () => {
      await renderResultadosComandantes({ randomOne: true });
    });
  }

  const inputRulingCommander = document.getElementById("inputRulingCommander");
  if (inputRulingCommander) {
    inputRulingCommander.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") await renderResultadosComandantes();
    });
  }

  const manaRangoBar = document.getElementById("manaRangoBar");
  if (manaRangoBar) {
    manaRangoBar.querySelectorAll(".mana-step").forEach(btn => {
      btn.addEventListener("click", () => handleCommanderCmcSelection(btn.dataset.cmc));
    });
  }

  const btnLimpiarManaRango = document.getElementById("btnLimpiarManaRango");
  if (btnLimpiarManaRango) {
    btnLimpiarManaRango.addEventListener("click", () => setCommanderCmcRange(null, null, false));
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

  const selectFiltroYearColecciones = document.getElementById("selectFiltroYearColecciones");
  if (selectFiltroYearColecciones) {
    selectFiltroYearColecciones.addEventListener("change", () => {
      setFiltroYearColecciones(selectFiltroYearColecciones.value);
    });
  }

  // Cambio de vista en colecciones
  document.querySelectorAll("input[name='vistaColecciones']").forEach(radio => {
    radio.addEventListener("change", () => {
      vistaColecciones = radio.value;
      guardarFiltrosColecciones();
      renderColecciones();
    });
  });

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

  const chkEnPosesionSet = document.getElementById("chkEnPosesionSet");
  if (chkEnPosesionSet) {
    chkEnPosesionSet.addEventListener("change", () => setFiltroEnPosesionSet(chkEnPosesionSet.checked));
  }

  const chkFiltroColorSet = document.getElementById("chkFiltroColorSet");
  const filtroColoresSetWrap = document.getElementById("filtroColoresSet");
  if (chkFiltroColorSet) {
    chkFiltroColorSet.addEventListener("change", () => {
      setFiltroColorSetEnabled(chkFiltroColorSet.checked);
      if (filtroColoresSetWrap) filtroColoresSetWrap.classList.toggle("hidden", !chkFiltroColorSet.checked);
    });
  }

  document.querySelectorAll(".chk-color-set").forEach(chkColor => {
    chkColor.addEventListener("change", () => toggleColorFiltroSet(chkColor.value, chkColor.checked));
  });

  document.querySelectorAll(".chk-rareza-set").forEach(chkRareza => {
    chkRareza.addEventListener("change", () => toggleRarezaFiltroSet(chkRareza.value, chkRareza.checked));
  });

  // Checkbox para mostrar/ocultar imágenes de cartas
  const chkMostrarCartas = document.getElementById("chkMostrarCartas");
  if (chkMostrarCartas) {
    chkMostrarCartas.addEventListener("change", () => {
      const gridCartas = document.querySelector(".cartas-grid");
      if (gridCartas) {
        if (chkMostrarCartas.checked) {
          gridCartas.classList.remove("ocultar-imagenes");
        } else {
          gridCartas.classList.add("ocultar-imagenes");
        }
      }
    });
  }

  // Checkbox para ocultar colección
  const chkOcultarColeccion = document.getElementById("chkOcultarColeccion");
  if (chkOcultarColeccion) {
    chkOcultarColeccion.addEventListener("change", () => {
      if (!setActualCode) return;
      
      if (chkOcultarColeccion.checked) {
        hiddenCollections.add(setActualCode);
      } else {
        hiddenCollections.delete(setActualCode);
      }
      
      guardarHiddenCollections();
    });
  }

  // Opciones de controles de cartas (global)
  const btnOpcionesControles = document.getElementById("btnOpcionesControles");
  const modalOpcionesControles = document.getElementById("modalOpcionesControles");
  const btnCerrarOpcionesControles = document.getElementById("btnCerrarOpcionesControles");

  const closeOpcionesControles = () => {
    if (modalOpcionesControles) modalOpcionesControles.style.display = "none";
  };

  if (btnOpcionesControles && modalOpcionesControles) {
    btnOpcionesControles.addEventListener("click", () => {
      renderCardControlsOptionsUI();
      modalOpcionesControles.style.display = "flex";
    });
  }

  if (btnCerrarOpcionesControles) {
    btnCerrarOpcionesControles.addEventListener("click", closeOpcionesControles);
  }

  if (modalOpcionesControles) {
    modalOpcionesControles.addEventListener("click", (e) => {
      if (e.target === modalOpcionesControles) closeOpcionesControles();
    });
  }

  document.querySelectorAll('input[name="modoIdiomaCartas"]').forEach(radio => {
    radio.addEventListener("change", () => {
      applyCardControlsConfig({
        ...getCardControlsConfig(),
        langMode: radio.value
      });
    });
  });

  const chkMostrarCantidad = document.getElementById("chkMostrarCantidad");
  if (chkMostrarCantidad) {
    chkMostrarCantidad.addEventListener("change", () => {
      applyCardControlsConfig({
        ...getCardControlsConfig(),
        showQty: chkMostrarCantidad.checked
      });
    });
  }

  const chkMostrarFoil = document.getElementById("chkMostrarFoil");
  if (chkMostrarFoil) {
    chkMostrarFoil.addEventListener("change", () => {
      applyCardControlsConfig({
        ...getCardControlsConfig(),
        showFoil: chkMostrarFoil.checked
      });
    });
  }

  const listaContadoresOpciones = document.getElementById("listaContadoresOpciones");
  if (listaContadoresOpciones) {
    listaContadoresOpciones.addEventListener("click", (e) => {
      const item = e.target.closest(".opciones-item[data-control-type='counter']");
      if (!item) return;
      const key = item.dataset.key;
      if (!key) return;

      if (e.target.dataset.action === "remove") {
        const cfg = getCardControlsConfig();
        const extraCounters = (cfg.extraCounters || []).filter(c => c.key !== key);
        applyCardControlsConfig({ ...cfg, extraCounters });
      }
    });

    listaContadoresOpciones.addEventListener("change", (e) => {
      if (e.target.dataset.action !== "toggle") return;
      const item = e.target.closest(".opciones-item[data-control-type='counter']");
      if (!item) return;
      const key = item.dataset.key;
      if (!key) return;
      const cfg = getCardControlsConfig();
      const extraCounters = (cfg.extraCounters || []).map(c => c.key === key ? { ...c, enabled: !!e.target.checked } : c);
      applyCardControlsConfig({ ...cfg, extraCounters });
    });
  }

  const listaTagsOpciones = document.getElementById("listaTagsOpciones");
  if (listaTagsOpciones) {
    listaTagsOpciones.addEventListener("click", (e) => {
      const item = e.target.closest(".opciones-item[data-control-type='tag']");
      if (!item) return;
      const key = item.dataset.key;
      if (!key) return;
      if (e.target.dataset.action === "remove") {
        const cfg = getCardControlsConfig();
        const extraTags = (cfg.extraTags || []).filter(t => t.key !== key);
        const riTagEnabled = key === "ri" ? false : !!cfg.riTagEnabled;
        applyCardControlsConfig({ ...cfg, extraTags, riTagEnabled });
      }
    });

    listaTagsOpciones.addEventListener("change", (e) => {
      if (e.target.dataset.action !== "toggle") return;
      const item = e.target.closest(".opciones-item[data-control-type='tag']");
      if (!item) return;
      const key = item.dataset.key;
      if (!key) return;
      const cfg = getCardControlsConfig();
      const extraTags = (cfg.extraTags || []).map(t => t.key === key ? { ...t, enabled: !!e.target.checked } : t);
      applyCardControlsConfig({ ...cfg, extraTags });
    });
  }

  const btnAgregarContador = document.getElementById("btnAgregarContador");
  const inputNuevoContador = document.getElementById("inputNuevoContador");
  if (btnAgregarContador && inputNuevoContador) {
    btnAgregarContador.addEventListener("click", () => {
      const label = String(inputNuevoContador.value || "").trim();
      if (!label) return;
      const cfg = getCardControlsConfig();
      const existingKeys = new Set([
        ...(cfg.extraCounters || []).map(c => c.key),
        ...(cfg.extraTags || []).map(t => t.key),
        "qty",
        "foil",
        "ri"
      ]);
      const key = makeControlKey(label, existingKeys);
      const extraCounters = [...(cfg.extraCounters || []), { key, label, enabled: true }];
      applyCardControlsConfig({ ...cfg, extraCounters });
      inputNuevoContador.value = "";
      inputNuevoContador.focus();
    });
  }

  const btnAgregarTag = document.getElementById("btnAgregarTag");
  const inputNuevoTag = document.getElementById("inputNuevoTag");
  if (btnAgregarTag && inputNuevoTag) {
    btnAgregarTag.addEventListener("click", () => {
      const label = String(inputNuevoTag.value || "").trim();
      if (!label) return;
      const cfg = getCardControlsConfig();
      const existingKeys = new Set([
        ...(cfg.extraCounters || []).map(c => c.key),
        ...(cfg.extraTags || []).map(t => t.key),
        "qty",
        "foil"
      ]);
      const key = makeControlKey(label, existingKeys);
      const extraTags = [...(cfg.extraTags || []), { key, label, enabled: true }];
      const riTagEnabled = key === "ri" ? true : !!cfg.riTagEnabled;
      applyCardControlsConfig({ ...cfg, extraTags, riTagEnabled });
      inputNuevoTag.value = "";
      inputNuevoTag.focus();
    });
  }

  // Toggle de idioma eliminado - ya no es necesario
  // Ahora siempre cargamos EN pero mostramos cantidades de ambos idiomas usando estado2

  // Autocompletar colección - Toggle desplegable
  const btnToggleAutocompletar = document.getElementById("btnToggleAutocompletar");
  const autocompletarContent = document.getElementById("autocompletarContent");
  
  if (btnToggleAutocompletar && autocompletarContent) {
    btnToggleAutocompletar.addEventListener("click", () => {
      autocompletarContent.classList.toggle("hidden");
      const arrow = btnToggleAutocompletar.querySelector(".arrow");
      if (arrow) arrow.textContent = autocompletarContent.classList.contains("hidden") ? "▼" : "▲";
    });
  }

  // Filtros del set - Toggle desplegable
  const btnToggleFiltrosSet = document.getElementById("btnToggleFiltrosSet");
  const filtrosSetContent = document.getElementById("filtrosSetContent");

  if (btnToggleFiltrosSet && filtrosSetContent) {
    btnToggleFiltrosSet.addEventListener("click", () => {
      filtrosSetContent.classList.toggle("hidden");
      const arrow = btnToggleFiltrosSet.querySelector(".arrow");
      if (arrow) {
        arrow.textContent = filtrosSetContent.classList.contains("hidden") ? "▼" : "▲";
      }
    });
  }

  // Marcar todas las cartas del set
  const btnMarcarTodasSet = document.getElementById("btnMarcarTodasSet");
  if (btnMarcarTodasSet) {
    btnMarcarTodasSet.addEventListener("click", () => {
      marcarTodasCartasSet();
    });
  }

  // Desmarcar todas las cartas del set
  const btnDesmarcarTodasSet = document.getElementById("btnDesmarcarTodasSet");
  if (btnDesmarcarTodasSet) {
    btnDesmarcarTodasSet.addEventListener("click", () => {
      desmarcarTodasCartasSet();
    });
  }

  // Aplicar rangos de cartas
  const btnAplicarRangos = document.getElementById("btnAplicarRangos");
  const inputRangosCartas = document.getElementById("inputRangosCartas");
  
  if (btnAplicarRangos && inputRangosCartas) {
    btnAplicarRangos.addEventListener("click", () => {
      const texto = inputRangosCartas.value;
      if (texto.trim()) {
        aplicarRangosCartas(texto);
        inputRangosCartas.value = ""; // Limpiar después de aplicar
      }
    });
    
    // También permitir Enter en el input
    inputRangosCartas.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnAplicarRangos.click();
      }
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

  // Menú desplegable de filtros
  const btnToggleFiltro = document.getElementById("btnToggleFiltroTipos");
  const filtroContent = document.getElementById("filtroTiposContent");
  
  if (btnToggleFiltro && filtroContent) {
    btnToggleFiltro.addEventListener("click", () => {
      filtroContent.classList.toggle("hidden");
      const arrow = btnToggleFiltro.querySelector(".arrow");
      if (arrow) arrow.textContent = filtroContent.classList.contains("hidden") ? "▼" : "▲";
    });
  }

  if (!document.body.dataset.yearFilterWired) {
    document.body.dataset.yearFilterWired = "1";
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("#btnToggleFiltroYearColecciones");
      if (!btn) return;
      const content = document.getElementById("filtroYearColeccionesContent");
      if (!content) return;
      content.classList.toggle("hidden");
      const arrow = btn.querySelector(".arrow");
      if (arrow) arrow.textContent = content.classList.contains("hidden") ? "▼" : "▲";
    });
  }
  
  // Checkboxes de tipos
  document.querySelectorAll(".chk-tipo-set").forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) {
        filtroTiposSet.add(chk.value);
      } else {
        filtroTiposSet.delete(chk.value);
      }
      renderColecciones();
    });
  });
  
  // Checkbox de mostrar ocultas
  const chkMostrarOcultas = document.getElementById("chkMostrarOcultas");
  if (chkMostrarOcultas) {
    chkMostrarOcultas.addEventListener("change", () => {
      mostrarOcultas = chkMostrarOcultas.checked;
      renderColecciones();
    });
  }
  
  // Botón marcar todos
  const btnMarcarTodos = document.getElementById("btnMarcarTodos");
  if (btnMarcarTodos) {
    btnMarcarTodos.addEventListener("click", () => {
      filtroTiposSet = new Set(["expansion", "core", "commander", "masters", "promo", "token", "memorabilia", "other"]);
      aplicarUIFiltrosTipo();
      renderColecciones();
    });
  }
  
  // Botón desmarcar todos
  const btnDesmarcarTodos = document.getElementById("btnDesmarcarTodos");
  if (btnDesmarcarTodos) {
    btnDesmarcarTodos.addEventListener("click", () => {
      filtroTiposSet.clear();
      aplicarUIFiltrosTipo();
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

  // ===============================
  // Event Delegation para listaCartasSet
  // ===============================
  // UN SOLO listener para manejar TODOS los eventos de las cartas
  // Elimina fugas de memoria y mejora el rendimiento dramáticamente
  
  const listaCartasSet = document.getElementById("listaCartasSet");
  if (listaCartasSet) {
    // Click events
    listaCartasSet.addEventListener("click", async (e) => {
      const target = e.target;
      
      // Ver carta (modal)
      if (target.classList.contains("btn-link-carta") || target.closest(".btn-link-carta")) {
        const btn = target.classList.contains("btn-link-carta") ? target : target.closest(".btn-link-carta");
        const id = btn.dataset.id;
        const setKey = setActualKey;
        const carta = (cacheCartasPorSetLang[setKey] || []).find(x => x.id === id);
        
        abrirModalCarta({
          titulo: carta?.nombre || "Carta",
          imageUrl: carta?._img || null,
          numero: carta?.numero || "",
          rareza: carta?.rareza || "",
          precio: formatPrecioEUR(carta?._prices),
          cardData: carta?._raw || null,
          oracleId: carta?.oracle_id || null,
          navLista: getListaSetFiltrada(setKey),
          navIndex: getListaSetFiltrada(setKey).findIndex(c => c.id === id)
        });
        return;
      }
      
      // Toggle idioma
      if (target.classList.contains("btn-lang-switch") || target.closest(".btn-lang-switch")) {
        const btn = target.classList.contains("btn-lang-switch") ? target : target.closest(".btn-lang-switch");
        const oracleId = btn.dataset.oracle;
        if (!oracleId) return;

        if (getCardControlsConfig().langMode !== "both") return;
        
        const cartaControles = btn.closest(".carta-controles");
        if (!cartaControles) return;
        
        // Prevenir clics múltiples durante animación
        if (cartaControles.dataset.animating === "true") return;
        cartaControles.dataset.animating = "true";
        
        const currentLang = cartaControles.dataset.activeLang || "en";
        const newLang = currentLang === "en" ? "es" : "en";
        
        setUILang(oracleId, newLang);
        cartaControles.dataset.activeLang = newLang;
        
        // Actualizar UI del botón
        const flagIcon = btn.querySelector(".lang-badge.lang-active .flag-icon");
        const langLabel = btn.querySelector(".lang-badge.lang-active .lang-label");
        const targetIcon = btn.querySelector(".flag-target-icon");
        
        if (flagIcon) {
          flagIcon.src = `icons/flag-${newLang}.svg`;
          flagIcon.alt = newLang.toUpperCase();
        }
        if (langLabel) langLabel.textContent = newLang === "en" ? "EN" : "ES";
        if (targetIcon) {
          targetIcon.src = `icons/flag-${newLang === "en" ? "es" : "en"}.svg`;
          targetIcon.alt = newLang === "en" ? "ES" : "EN";
        }
        
        btn.setAttribute("aria-label", `Cambiar a idioma ${newLang === "en" ? "español" : "inglés"}`);
        
        // Cargar imagen en paralelo
        const cartaItem = btn.closest(".carta-item");
        if (cartaItem) {
          const imgElement = cartaItem.querySelector(".carta-imagen");
          
          if (newLang === "es" && imgElement) {
            const setCode = imgElement.dataset.set || "";
            const numero = imgElement.dataset.numero || "";
            
            getPrintByOracleLang(oracleId, "es", setCode, numero).then(printES => {
              if (printES) {
                const imgUrl = printES.image_uris?.normal || printES.card_faces?.[0]?.image_uris?.normal;
                if (imgUrl) imgElement.src = imgUrl;
              }
            }).catch(err => console.error(`Error cargando imagen ES:`, err));
          } else if (newLang === "en" && imgElement) {
            const imgEnOriginal = imgElement.dataset.imgEn;
            if (imgEnOriginal) imgElement.src = imgEnOriginal;
          }
        }
        
        setTimeout(() => {
          cartaControles.dataset.animating = "false";
        }, 220);
        return;
      }
      
      // Botones cantidad
      if (target.classList.contains("btn-qty-minus")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        if (!oracleId || !lang) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentQty = lang === "en" ? st2.qty_en : st2.qty_es;
        setQtyLang(oracleId, lang, currentQty - 1);
        actualizarPanelLang(oracleId, lang);
        scheduleRenderColecciones();
        return;
      }
      
      if (target.classList.contains("btn-qty-plus")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        if (!oracleId || !lang) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentQty = lang === "en" ? st2.qty_en : st2.qty_es;
        setQtyLang(oracleId, lang, currentQty + 1);
        actualizarPanelLang(oracleId, lang);
        scheduleRenderColecciones();
        return;
      }
      
      // Botones foil
      if (target.classList.contains("btn-foil-minus")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        if (!oracleId || !lang) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentFoil = lang === "en" ? st2.foil_en : st2.foil_es;
        setFoilLang(oracleId, lang, currentFoil - 1);
        actualizarPanelLang(oracleId, lang);
        scheduleRenderColecciones();
        return;
      }
      
      if (target.classList.contains("btn-foil-plus")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        if (!oracleId || !lang) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentFoil = lang === "en" ? st2.foil_en : st2.foil_es;
        setFoilLang(oracleId, lang, currentFoil + 1);
        actualizarPanelLang(oracleId, lang);
        scheduleRenderColecciones();
        return;
      }

      // Contadores personalizados
      if (target.classList.contains("btn-counter-minus")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        const key = target.dataset.control;
        if (!oracleId || !lang || !key) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentVal = getCounterValue(st2, lang, key);
        setCounterLang(oracleId, lang, key, currentVal - 1);
        actualizarPanelLang(oracleId, lang);
        scheduleRenderColecciones();
        return;
      }

      if (target.classList.contains("btn-counter-plus")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        const key = target.dataset.control;
        if (!oracleId || !lang || !key) return;
        const st2 = getEstadoCarta2(oracleId);
        const currentVal = getCounterValue(st2, lang, key);
        setCounterLang(oracleId, lang, key, currentVal + 1);
        actualizarPanelLang(oracleId, lang);
        scheduleRenderColecciones();
        return;
      }
    });
    
    // Change events para inputs
    listaCartasSet.addEventListener("change", (e) => {
      const target = e.target;
      
      // Input cantidad
      if (target.classList.contains("inp-qty")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        if (!oracleId || !lang) return;
        setQtyLang(oracleId, lang, target.value);
        actualizarPanelLang(oracleId, lang);
        scheduleRenderColecciones();
        return;
      }
      
      // Input foil
      if (target.classList.contains("inp-foil")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        if (!oracleId || !lang) return;
        setFoilLang(oracleId, lang, target.value);
        actualizarPanelLang(oracleId, lang);
        scheduleRenderColecciones();
        return;
      }

      // Inputs de contadores personalizados
      if (target.classList.contains("inp-counter")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        const key = target.dataset.control;
        if (!oracleId || !lang || !key) return;
        setCounterLang(oracleId, lang, key, target.value);
        actualizarPanelLang(oracleId, lang);
        scheduleRenderColecciones();
        return;
      }
      
      // Tags
      if (target.classList.contains("chk-tag")) {
        const oracleId = target.dataset.oracle;
        const lang = target.dataset.lang;
        const key = target.dataset.control;
        if (!oracleId || !lang || !key) return;
        setTagLang(oracleId, lang, key, target.checked);
        return;
      }
    });
  }

  // Actualizar precios
  const btnActualizarPrecios = document.getElementById("btnActualizarPrecios");
  if (btnActualizarPrecios) btnActualizarPrecios.addEventListener("click", refrescarPreciosSetActual);

  // Decks
  const btnAgregarDeck = document.getElementById("btnAgregarDeck");
  if (btnAgregarDeck) {
    btnAgregarDeck.addEventListener("click", () => {
      document.getElementById("inputNombreDeck").value = "";
      document.getElementById("textareaListaDeck").value = "";
      document.getElementById("modalAgregarDeck").style.display = "flex";
    });
  }

  const btnCancelarDeck = document.getElementById("btnCancelarDeck");
  if (btnCancelarDeck) {
    btnCancelarDeck.addEventListener("click", () => {
      document.getElementById("modalAgregarDeck").style.display = "none";
    });
  }
  
  // Event listeners para cambiar modo de visualización del deck
  const radioModoDeckLista = document.getElementById("radioModoDeckLista");
  const radioModoDeckImagenes = document.getElementById("radioModoDeckImagenes");
  
  if (radioModoDeckLista) {
    radioModoDeckLista.addEventListener("change", () => {
      if (radioModoDeckLista.checked) {
        modoDeckVisualizacion = 'lista';
        renderDeckCartas();
      }
    });
  }
  
  if (radioModoDeckImagenes) {
    radioModoDeckImagenes.addEventListener("change", () => {
      if (radioModoDeckImagenes.checked) {
        modoDeckVisualizacion = 'imagenes';
        renderDeckCartas();
      }
    });
  }

  // Event listener para el selector de ordenación
  const selectorOrdenDeck = document.getElementById("selectorOrdenDeck");
  if (selectorOrdenDeck) {
    selectorOrdenDeck.addEventListener("change", () => {
      ordenDeckActual = selectorOrdenDeck.value;
      renderDeckCartas();
    });
  }

  const btnGuardarDeck = document.getElementById("btnGuardarDeck");
  if (btnGuardarDeck) {
    btnGuardarDeck.addEventListener("click", async () => {
      const nombre = document.getElementById("inputNombreDeck").value.trim();
      const lista = document.getElementById("textareaListaDeck").value;

      if (!nombre) {
        alert("Por favor ingresa un nombre para el deck.");
        return;
      }

      const resultado = parsearListaDeck(lista);
      if (resultado.cartas.length === 0 && resultado.sideboard.length === 0) {
        alert("No se pudo parsear ninguna carta. Verifica el formato.");
        return;
      }

      // Mostrar indicador de carga
      const mensajeCarga = document.getElementById("mensajeCargandoDeck");
      const btnCancelar = document.getElementById("btnCancelarDeck");
      
      btnGuardarDeck.disabled = true;
      btnGuardarDeck.textContent = "Verificando...";
      if (btnCancelar) btnCancelar.disabled = true;
      if (mensajeCarga) mensajeCarga.style.display = "block";

      try {
        const cartasVerificadas = await verificarCartasEnColeccion(resultado.cartas);
        const sideboardVerificado = await verificarCartasEnColeccion(resultado.sideboard);

        decks.push({
          nombre,
          cartas: cartasVerificadas,
          sideboard: sideboardVerificado
        });

        guardarDecks();
        renderListaDecks();
        document.getElementById("modalAgregarDeck").style.display = "none";
        mostrarPantalla("decks");
        
        // Resetear el formulario
        document.getElementById("inputNombreDeck").value = "";
        document.getElementById("textareaListaDeck").value = "";
      } catch (error) {
        console.error("Error al verificar cartas:", error);
        alert("Hubo un error al verificar las cartas. Por favor intenta de nuevo.");
      } finally {
        // Restaurar estado de botones
        btnGuardarDeck.disabled = false;
        btnGuardarDeck.textContent = "Guardar";
        if (btnCancelar) btnCancelar.disabled = false;
        if (mensajeCarga) mensajeCarga.style.display = "none";
      }
    });
  }

  const btnEliminarDeck = document.getElementById("btnEliminarDeck");
  if (btnEliminarDeck) {
    btnEliminarDeck.addEventListener("click", async () => {
      if (!deckActual) return;
      
      // Verificar si se completó el mazo previamente
      if (deckActual.completado) {
        const eliminarCartas = confirm(`¿Deseas eliminar las cartas de este mazo de tu colección?`);
        
        if (eliminarCartas) {
          // Mostrar indicador de carga
          const mensajeCarga = document.getElementById("mensajeEliminandoCartas");
          const btnActualizar = document.getElementById("btnActualizarDeck");
          const btnCompletar = document.getElementById("btnCompletarMazo");
          
          btnEliminarDeck.disabled = true;
          btnEliminarDeck.textContent = "Procesando...";
          if (btnActualizar) btnActualizar.disabled = true;
          if (btnCompletar) btnCompletar.disabled = true;
          if (mensajeCarga) mensajeCarga.style.display = "block";
          
          try {
            // Eliminar cartas en posesión (LED azul)
            const todasLasCartas = [...deckActual.cartas];
            if (deckActual.sideboard) {
              todasLasCartas.push(...deckActual.sideboard);
            }
            
            let cartasEliminadas = 0;
            for (const carta of todasLasCartas) {
              if (carta.tengo && carta.ledType === 'azul') {
                const setKey = `${carta.set.toLowerCase()}__en`;
                await ensureSetCardsLoaded(setKey);
                const listaSet = cartasDeSetKey(setKey);
                const cartaCatalogo = listaSet.find(c => c.numero === carta.numero);
                
                if (cartaCatalogo && cartaCatalogo.oracle_id) {
                  const st2 = getEstadoCarta2(cartaCatalogo.oracle_id);
                  // Por ahora solo EN
                  if (st2.qty_en > 0) {
                    setQtyLang(cartaCatalogo.oracle_id, "en", st2.qty_en - 1);
                    cartasEliminadas++;
                  }
                }
              }
            }
            
            renderColecciones();
            
            // Restaurar estado de botones antes del confirm
            btnEliminarDeck.disabled = false;
            btnEliminarDeck.textContent = "Eliminar Deck";
            if (btnActualizar) btnActualizar.disabled = false;
            if (btnCompletar) btnCompletar.disabled = false;
            if (mensajeCarga) mensajeCarga.style.display = "none";
            
            // Segunda confirmación
            const confirmarFinal = confirm(
              `El mazo y ${cartasEliminadas} cartas van a ser eliminadas de la colección. ¿Está seguro?`
            );
            
            if (confirmarFinal) {
              const idx = decks.findIndex(d => d.nombre === deckActual.nombre);
              if (idx >= 0) {
                decks.splice(idx, 1);
                guardarDecks();
                renderListaDecks();
                mostrarPantalla("decks");
              }
            } else {
              // Revertir cambios en la colección
              for (const carta of todasLasCartas) {
                if (carta.tengo && carta.ledType === 'azul') {
                  const setKey = `${carta.set.toLowerCase()}__en`;
                  await ensureSetCardsLoaded(setKey);
                  const listaSet = cartasDeSetKey(setKey);
                  const cartaCatalogo = listaSet.find(c => c.numero === carta.numero);
                  
                  if (cartaCatalogo && cartaCatalogo.oracle_id) {
                    const st2 = getEstadoCarta2(cartaCatalogo.oracle_id);
                    // Por ahora solo EN
                    setQtyLang(cartaCatalogo.oracle_id, "en", st2.qty_en + 1);
                  }
                }
              }
              renderColecciones();
            }
          } catch (error) {
            console.error("Error al eliminar cartas:", error);
            alert("Hubo un error al procesar la eliminación. Por favor intenta de nuevo.");
            // Restaurar estado en caso de error
            btnEliminarDeck.disabled = false;
            btnEliminarDeck.textContent = "Eliminar Deck";
            if (btnActualizar) btnActualizar.disabled = false;
            if (btnCompletar) btnCompletar.disabled = false;
            if (mensajeCarga) mensajeCarga.style.display = "none";
          }
        } else {
          // No eliminar cartas, solo mazo
          const confirmarSoloMazo = confirm(
            `Se eliminará el mazo, pero las cartas se quedarán en la colección. ¿Está seguro?`
          );
          
          if (confirmarSoloMazo) {
            const idx = decks.findIndex(d => d.nombre === deckActual.nombre);
            if (idx >= 0) {
              decks.splice(idx, 1);
              guardarDecks();
              renderListaDecks();
              mostrarPantalla("decks");
            }
          }
        }
      } else {
        // Si no se completó el mazo, solo preguntar una vez
        if (confirm(`¿Eliminar el deck "${deckActual.nombre}"?`)) {
          const idx = decks.findIndex(d => d.nombre === deckActual.nombre);
          if (idx >= 0) {
            decks.splice(idx, 1);
            guardarDecks();
            renderListaDecks();
            mostrarPantalla("decks");
          }
        }
      }
    });
  }

  const btnActualizarDeck = document.getElementById("btnActualizarDeck");
  if (btnActualizarDeck) {
    btnActualizarDeck.addEventListener("click", async () => {
      await actualizarEstadoDeck();
    });
  }

  const btnCompletarMazo = document.getElementById("btnCompletarMazo");
  if (btnCompletarMazo) {
    btnCompletarMazo.addEventListener("click", async () => {
      if (confirm(
        "El botón 'Completar mazo' añadirá automáticamente 1 unidad en la colección de todas las cartas que actualmente estén marcadas como 'Falta' (LED rojo).\n\n" +
        "Cada carta se agregará en el set específico que aparece en la descripción (código y número de colector).\n\n" +
        "Nota: Las cartas que ya posees (LED azul) o que tienes en otro set (LED violeta) no se verán afectadas.\n\n" +
        "¿Deseas continuar?"
      )) {
        // Mostrar indicador de carga
        const mensajeCarga = document.getElementById("mensajeCompletandoMazo");
        const btnActualizar = document.getElementById("btnActualizarDeck");
        
        btnCompletarMazo.disabled = true;
        btnCompletarMazo.textContent = "Completando...";
        if (btnActualizar) btnActualizar.disabled = true;
        if (mensajeCarga) mensajeCarga.style.display = "block";
        
        try {
          await completarMazo();
        } finally {
          // Restaurar estado de botones
          btnCompletarMazo.disabled = false;
          btnCompletarMazo.textContent = "Completar mazo ❗";
          if (btnActualizar) btnActualizar.disabled = false;
          if (mensajeCarga) mensajeCarga.style.display = "none";
        }
      }
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
  
  // Botón actualizar catálogo
  const btnActualizarCatalogo = document.getElementById("btnActualizarCatalogo");
  if (btnActualizarCatalogo) {
    btnActualizarCatalogo.addEventListener("click", async () => {
      btnActualizarCatalogo.disabled = true;
      await actualizarCatalogo({ silent: false });
      actualizarFechaCatalogo();
      btnActualizarCatalogo.disabled = false;
    });
  }
}

// Actualizar el texto de fecha de catálogo
function actualizarFechaCatalogo() {
  const el = document.getElementById("fechaCatalogo");
  if (!el) return;
  
  const raw = safeLocalStorageGet(LS_CATALOGO_TIMESTAMP);
  if (!raw) {
    el.textContent = "Catálogo: no descargado";
    return;
  }
  
  const timestamp = parseInt(raw, 10);
  if (!Number.isFinite(timestamp)) {
    el.textContent = "Catálogo: no descargado";
    return;
  }
  
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  el.textContent = `Catálogo: ${dateStr}`;
}

// ===============================
// Buscar actualizaciones manualmente
// ===============================

async function buscarActualizacionesManualmente() {
  const btn = document.getElementById("btnBuscarActualizaciones");
  
  if (!btn) return;
  
  // Verificar soporte de Service Worker
  if (!("serviceWorker" in navigator)) {
    alert("Tu navegador no soporta actualizaciones automáticas.");
    return;
  }
  
  // Verificar que hay registration
  if (!swRegistration) {
    alert("El sistema de actualizaciones no está activo. Recarga la página.");
    return;
  }
  
  try {
    // Cambiar texto del botón
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "🔍 Buscando...";
    
    console.log("🔄 Buscando actualizaciones manualmente...");
    
    // Forzar comprobación de actualizaciones
    await swRegistration.update();
    
    // Esperar un momento para que se procese
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const promptUpdate = (worker) => {
      // Hay una actualización disponible
      btn.textContent = textoOriginal;
      btn.disabled = false;

      const actualizar = confirm(
        "✅ ¡Nueva versión disponible!\n\n" +
        "Se recargará la aplicación para aplicar la actualización.\n\n" +
        "¿Actualizar ahora?"
      );

      if (actualizar) {
        // Enviar mensaje para activar inmediatamente
        worker.postMessage({ type: "SKIP_WAITING" });

        // Recargar cuando el nuevo SW tome control
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.location.reload();
        }, { once: true });

        // Si no hay controller change en 3 segundos, forzar recarga
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    };

    // Verificar si hay una actualización pendiente
    const waiting = swRegistration.waiting;
    const installing = swRegistration.installing;

    if (waiting) {
      promptUpdate(waiting);
    } else if (installing) {
      // Esperar a que termine la instalación para evitar falsos positivos
      await new Promise(resolve => {
        let done = false;
        const timeout = setTimeout(() => {
          if (done) return;
          done = true;
          resolve();
        }, 2500);

        const onStateChange = () => {
          if (done) return;
          if (installing.state === "installed" || installing.state === "activated" || installing.state === "redundant") {
            done = true;
            clearTimeout(timeout);
            resolve();
          }
        };

        installing.addEventListener("statechange", onStateChange);
      });

      const waitingAfter = swRegistration.waiting;
      if (waitingAfter) {
        promptUpdate(waitingAfter);
      } else {
        // No hay actualizaciones
        btn.textContent = "✅ Actualizado";

        setTimeout(() => {
          btn.textContent = textoOriginal;
          btn.disabled = false;
        }, 2000);

        console.log("✅ Ya estás usando la última versión");
      }
    } else {
      // No hay actualizaciones
      btn.textContent = "✅ Actualizado";
      
      setTimeout(() => {
        btn.textContent = textoOriginal;
        btn.disabled = false;
      }, 2000);
      
      console.log("✅ Ya estás usando la última versión");
    }
  } catch (err) {
    console.error("Error buscando actualizaciones:", err);
    
    btn.textContent = "❌ Error";
    setTimeout(() => {
      btn.textContent = "Comprobar actualizaciones";
      btn.disabled = false;
    }, 2000);
    
    alert("Error al buscar actualizaciones. Intenta recargar la página.");
  }
}

async function init() {
  catalogoListo = false;
  catalogoError = "";

  // Enforce light theme
  applyTheme();
  
  // Cargar estado v2 primero (incluye cache de oracle_id)
  cargarEstado2();
  
  // Cargar estado legacy para compatibilidad/migración
  cargarEstado();
  
  // Cargar preferencias de idioma UI por carta
  cargarUILangByOracle();
  
  cargarProgresoPorSet();
  cargarCardControlsConfig();
  cargarFiltrosColecciones();
  scheduleStatsSnapshotUpdate({ renderIfVisible: false });
  cargarHiddenEmptySets();
  cargarHiddenCollections();
  cargarStatsSnapshot();
  cargarDecks();

  wireGlobalButtons();
  wireBackupButtons();
  
  // 🧹 Limpiar cache antiguo de IndexedDB en background
  setTimeout(() => {
    cleanExpiredCache().catch(err => {
      console.warn('Error limpiando cache expirado:', err);
    });
    cleanExpiredImageCache().catch(err => {
      if (DEBUG) console.warn('Error limpiando cache de imágenes:', err);
    });
  }, 5000); // Después de 5 segundos para no bloquear el inicio

  try {
    const raw = safeLocalStorageGet(LS_STATS_SNAPSHOT);
    statsSnapshot = raw ? JSON.parse(raw) : null;
  } catch {
    statsSnapshot = null;
  }
  // ✅ Supabase (nuevo): sesión + listeners + pull + autosave
    try { 
    await sbInit(); 
  } catch (e) {
    console.error("Supabase init error:", e);
    uiSetSyncStatus("Sync desactivada (error).");
  }

  try {
    // 1) Cargar catálogo desde cache (rápido)
    const tieneCacheLocal = cargarCatalogo();
    
    if (tieneCacheLocal) {
      console.log("Catálogo cargado desde cache, mostrando UI...");
      
      // 2) Traducciones ES (MTGJSON) - opcional
      try {
        await cargarSetNameEsDesdeMTGJSON();
        console.log("Traducciones ES cargadas:", Object.keys(setNameEsByCode).length);
      } catch (err) {
        console.warn("No se pudieron cargar traducciones de MTGJSON:", err);
      }
      
      // 3) Reconstruir catálogo para la UI
      reconstruirCatalogoColecciones();
      catalogoListo = true;
      renderColecciones();
      
      // 4) Actualizar en background desde Scryfall
      console.log("Actualizando catálogo en background...");
      actualizarCatalogo({ silent: true }).catch(err => {
        console.warn("No se pudo actualizar catálogo en background:", err);
      });
    } else {
      // No hay cache, descargar ahora
      console.log("Sin cache local, descargando catálogo...");
      await actualizarCatalogo({ silent: true });
      
      // 2) Traducciones ES (MTGJSON) - opcional
      try {
        await cargarSetNameEsDesdeMTGJSON();
        console.log("Traducciones ES cargadas:", Object.keys(setNameEsByCode).length);
      } catch (err) {
        console.warn("No se pudieron cargar traducciones de MTGJSON:", err);
      }
      
      // 3) Reconstruir catálogo para la UI
      reconstruirCatalogoColecciones();
    }

  } catch (err) {
    console.error("Error cargando sets de Scryfall:", err);
    catalogoError = (err && err.message) ? err.message : "desconocido";
  } finally {
    catalogoListo = true;
    renderColecciones();
    
    // ✅ Iniciar migración progresiva de estado legacy a estado2
    // Esto se hace después de cargar el catálogo porque necesitamos el índice de cartas
    if (Object.keys(estadoLegacyById).length > 0) {
      console.log("Iniciando migración progresiva de estado legacy...");
      setTimeout(() => {
        migrarEstadoLegacy().catch(err => {
          console.error("Error en migración de estado:", err);
        });
      }, 2000); // Esperar 2 segundos para no bloquear la UI inicial
    }
  }

  renderResultadosBuscar("");
  
  // Inicializar botón scroll-to-top único
  if (typeof installScrollTopButton === "function") {
    setTimeout(() => installScrollTopButton(), 100);
  }
}

init();

// Variable global para acceder al Service Worker registration
let swRegistration = null;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const url = new URL(window.location.href);
    const noSw = url.searchParams.get("nosw") === "1";
    const swUrl = "./service-worker.js?v=0.76";

    // Limpiar SWs antiguos (incluido sw.js viejo y service-worker.js sin query)
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const reg of registrations) {
        const script = reg.active?.scriptURL || "";
        if (!script.includes("service-worker.js?v=0.76")) {
          console.log('[SW] Unregistering old SW', script);
          reg.unregister();
        }
      }
    });

    if (noSw) {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
      return; // No registrar SW en modo bypass
    }

    navigator.serviceWorker.register(swUrl).then(reg => {
      // Guardar referencia global
      swRegistration = reg;
      
      // Detectar actualizaciones
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Hay una nueva versión disponible
            mostrarBannerActualizacion(newWorker);
          }
        });
      });
      
      // Verificar actualizaciones cada 60 segundos
      setInterval(() => {
        reg.update();
      }, 60000);
    }).catch(console.error);
  });
}

function mostrarBannerActualizacion(newWorker) {
  const banner = document.getElementById("updateBanner");
  const btnActualizar = document.getElementById("btnActualizarApp");
  const btnCerrar = document.getElementById("btnCerrarUpdate");
  
  if (!banner) return;

  if (!newWorker || newWorker.state === "activated" || newWorker.state === "redundant") {
    banner.classList.add("hidden");
    return;
  }
  
  banner.classList.remove("hidden");

  const onStateChange = () => {
    if (newWorker.state === "activated" || newWorker.state === "redundant") {
      banner.classList.add("hidden");
    }
  };
  newWorker.addEventListener("statechange", onStateChange, { once: false });
  
  btnActualizar.addEventListener("click", () => {
    if (newWorker.state === "activated" || newWorker.state === "redundant") {
      banner.classList.add("hidden");
      return;
    }

    let reloaded = false;

    // Enviar mensaje al service worker para que se active inmediatamente
    newWorker.postMessage({ type: "SKIP_WAITING" });
    
    // Recargar la página cuando el nuevo SW tome control
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      reloaded = true;
      window.location.reload();
    }, { once: true });

    // Si ya estaba actualizado, ocultar el banner
    setTimeout(() => {
      if (!reloaded) {
        banner.classList.add("hidden");
      }
    }, 3000);
  }, { once: true });
  
  btnCerrar.addEventListener("click", () => {
    banner.classList.add("hidden");
  }, { once: true });
}

// ===============================
// Scroll-to-top: botón único global con debug
// ===============================

window.DEBUG_TOPBTN = new URL(window.location.href).searchParams.get('debugTop') === '1';

let topBtnState = {
  btn: null,
  listeners: [],
  installed: false
};

const TOPBTN_CANDIDATES = [
  '#listaColecciones',
  '#listaCartasSet',
  '#listaCartasDeck',
  '#resultadosBuscar',
  '.pantalla.active',
  '.pantalla',
  'main',
  '#app',
  '.view',
  '.screen',
  '.content'
];

function dedupe(nodes) {
  const seen = new Set();
  const out = [];
  for (const n of nodes) {
    if (!n) continue;
    const key = n === window ? 'window' : n === document ? 'document' : n.nodeType + ':' + n.tagName + ':' + (n.id || '') + ':' + (n.className || '');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

function getScrollCandidates() {
  let nodes = [window, document, document.documentElement, document.body];
  TOPBTN_CANDIDATES.forEach(sel => {
    nodes = nodes.concat(Array.from(document.querySelectorAll(sel)));
  });
  return dedupe(nodes);
}

function computeMaxScrollTop() {
  const fromWindow = window.scrollY || 0;
  const fromBody = document.body?.scrollTop || 0;
  const fromDocEl = document.documentElement?.scrollTop || 0;
  let maxTop = Math.max(fromWindow, fromBody, fromDocEl);

  for (const node of TOPBTN_CANDIDATES.flatMap(sel => Array.from(document.querySelectorAll(sel)))) {
    if (!node) continue;
    const t = node.scrollTop || 0;
    if (t > maxTop) maxTop = t;
  }

  if (window.DEBUG_TOPBTN) {
    console.log('[TOPBTN] computeMaxScrollTop', { fromWindow, fromBody, fromDocEl, maxTop });
  }

  return maxTop;
}

function updateTopBtnVisibility() {
  const btn = topBtnState.btn;
  if (!btn) return;
  const top = computeMaxScrollTop();
  const shouldShow = top > 50; // Umbral bajo para fácil debug

  if (window.DEBUG_TOPBTN) {
    console.log('[TOPBTN] scroll event', { scrollTop: top, shouldShow });
  }

  btn.classList.toggle('visible', shouldShow);
}

function unbindTopBtnListeners() {
  for (const { target, handler } of topBtnState.listeners) {
    target.removeEventListener('scroll', handler);
  }
  topBtnState.listeners = [];
}

function bindTopBtnListeners() {
  unbindTopBtnListeners();
  const handler = () => updateTopBtnVisibility();
  const targets = getScrollCandidates();
  for (const t of targets) {
    t.addEventListener('scroll', handler, { passive: true });
    topBtnState.listeners.push({ target: t, handler });
  }
  // Estado inicial
  updateTopBtnVisibility();
}

function installScrollTopButton() {
  if (topBtnState.installed) return;

  const btn = document.getElementById('btnScrollTop');
  if (!btn) {
    console.error('[TOPBTN] button #btnScrollTop not found in DOM');
    return;
  }

  topBtnState.btn = btn;
  topBtnState.installed = true;

  // Debug: fuerza visibilidad si está activado
  if (window.DEBUG_TOPBTN) {
    btn.style.display = 'flex';
    btn.style.outline = '2px solid red';
    btn.title = '[DEBUG] Botón forzado visible';
  }

  // Click handler: sube todos los candidatos
  btn.addEventListener('click', () => {
    console.log('[TOPBTN] click');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    for (const node of getScrollCandidates()) {
      if (node && node.scrollTo) node.scrollTo({ top: 0, behavior: 'smooth' });
      if (node) node.scrollTop = 0;
    }
  });

  // Inicializa listeners
  bindTopBtnListeners();

  // Observa cambios de DOM
  const mutObserver = new MutationObserver(() => {
    setTimeout(bindTopBtnListeners, 80);
  });
  mutObserver.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['class']
  });

  // Escucha resize/orientación
  window.addEventListener('resize', () => bindTopBtnListeners());
  window.addEventListener('orientationchange', () => bindTopBtnListeners());

  // Safety interval
  setInterval(() => bindTopBtnListeners(), 3000);

  // Log inicial
  console.log('[TOPBTN] mounted', {
    btnExists: !!btn,
    debugMode: window.DEBUG_TOPBTN
  });
}



// ===============================
// Manejo del botón de retroceso del móvil
// ===============================

// Interceptar el evento popstate (botón de retroceso del navegador/móvil)
window.addEventListener("popstate", (event) => {
  // Prevenir que popstate se procese durante nuestra navegación interna
  if (manejandoPopstate) return;
  
  manejandoPopstate = true;
  
  // Navegar a la pantalla anterior en el historial interno
  const resultado = navegarAtras();
  
  // Si navegarAtras devolvió false (no hay más historial), salir de la app
  if (!resultado && !impedirSalidaApp) {
    // Permitir que el navegador maneje el retroceso (salir de la app)
    manejandoPopstate = false;
    return;
  }
  
  setTimeout(() => {
    manejandoPopstate = false;
  }, 50);
});

// Inicializar el historial del navegador
// Agregar una entrada inicial inmediatamente para que el botón de retroceso funcione
window.history.pushState({ pantalla: "inicio" }, "", "");
