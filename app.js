// Limpiar filtro año
document.addEventListener("DOMContentLoaded", () => {
  const btnLimpiarYear = document.getElementById("btnLimpiarFiltroYearColecciones");
  if (btnLimpiarYear) {
    btnLimpiarYear.addEventListener("click", () => {
      setFiltroYearColecciones("all");
      // Actualizar UI
      aplicarUIFiltrosColecciones();
      scheduleRenderColecciones();
    });
  }
});
// ===============================
// 1) Datos de ejemplo (AHORA con lang: "en" / "es")
// ===============================

const VERSION = "1.12";
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

function escapeScryfallRegexLiteral(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const LS_COMMANDER_CREATURE_TYPES = "mtg_commander_creature_types_v1";
let commanderCreatureTypeCatalog = [];

function buildCommanderCreatureTypeClause(term) {
  const safe = String(term || "").replace(/"/g, "").trim();
  if (!safe) return "";
  return /\s/.test(safe) ? `t:"${safe}"` : `t:${safe}`;
}

function setCommanderCreatureTypeCatalog(types) {
  const unique = new Map();
  for (const type of (types || [])) {
    const safe = String(type || "").trim().replace(/\s+/g, " ");
    if (!safe) continue;
    unique.set(safe.toLowerCase(), safe);
  }
  commanderCreatureTypeCatalog = [...unique.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function loadCommanderCreatureTypeCatalogCache() {
  try {
    const raw = safeLocalStorageGet(LS_COMMANDER_CREATURE_TYPES);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    setCommanderCreatureTypeCatalog(parsed);
    return commanderCreatureTypeCatalog.length > 0;
  } catch {
    return false;
  }
}

function saveCommanderCreatureTypeCatalogCache() {
  if (commanderCreatureTypeCatalog.length === 0) return;
  safeLocalStorageSet(LS_COMMANDER_CREATURE_TYPES, JSON.stringify(commanderCreatureTypeCatalog));
}

function extractCommanderCreatureTypeFallbackSuggestions() {
  const collected = [];
  const pushSubtypeParts = (typeLine) => {
    const safe = String(typeLine || "").trim();
    if (!safe || !/creature/i.test(safe)) return;
    const parts = safe.split("—");
    const subtypePart = String(parts[1] || "").trim();
    if (!subtypePart) return;
    collected.push(subtypePart);
    subtypePart.split(/\s+/).forEach(token => {
      if (token) collected.push(token);
    });
  };

  for (const card of cartas || []) pushSubtypeParts(card?.type_line);
  for (const loadedCards of Object.values(cacheCartasPorSetLang || {})) {
    for (const card of loadedCards || []) pushSubtypeParts(card?.type_line);
  }

  setCommanderCreatureTypeCatalog(collected);
}

async function ensureCommanderCreatureTypeCatalogLoaded() {
  if (commanderCreatureTypeCatalog.length > 0) return commanderCreatureTypeCatalog;
  loadCommanderCreatureTypeCatalogCache();
  if (commanderCreatureTypeCatalog.length > 0) return commanderCreatureTypeCatalog;

  try {
    const data = await scryFetchJson(`${SCY_BASE}/catalog/creature-types`);
    const values = Array.isArray(data?.data) ? data.data : [];
    if (values.length > 0) {
      setCommanderCreatureTypeCatalog(values);
      saveCommanderCreatureTypeCatalogCache();
      return commanderCreatureTypeCatalog;
    }
  } catch {}

  extractCommanderCreatureTypeFallbackSuggestions();
  return commanderCreatureTypeCatalog;
}

function splitCommanderCreatureTypeSegments(raw) {
  return String(raw || "")
    .split(",")
    .map(segment => segment.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function resolveCommanderCreatureTypeSegmentTerms(segment) {
  const safe = String(segment || "").trim().replace(/\s+/g, " ");
  if (!safe) return [];
  const exactCatalogMatch = commanderCreatureTypeCatalog.find(type => type.toLowerCase() === safe.toLowerCase());
  if (exactCatalogMatch) return [exactCatalogMatch];
  return safe.split(/\s+/).filter(Boolean);
}

function getCommanderCreatureTypeTerms() {
  const raw = document.getElementById("inputCreatureTypeCommander")?.value || "";
  const terms = [];
  const seen = new Set();

  for (const segment of splitCommanderCreatureTypeSegments(raw)) {
    for (const term of resolveCommanderCreatureTypeSegmentTerms(segment)) {
      const normalized = String(term || "").trim();
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) continue;
      seen.add(key);
      terms.push(normalized);
    }
  }

  return terms;
}

function updateCommanderCreatureTypeSuggestions() {
  const input = document.getElementById("inputCreatureTypeCommander");
  const list = document.getElementById("commanderCreatureTypeSuggestions");
  if (!input || !list) return;

  const raw = String(input.value || "");
  const commaIndex = raw.lastIndexOf(",");
  const prefix = commaIndex >= 0 ? raw.slice(0, commaIndex + 1) : "";
  const currentToken = raw.slice(commaIndex + 1).trim().toLowerCase();
  const selected = new Set(
    splitCommanderCreatureTypeSegments(prefix)
      .map(segment => segment.toLowerCase())
      .filter(Boolean)
  );

  const matches = commanderCreatureTypeCatalog
    .filter(type => !selected.has(type.toLowerCase()))
    .filter(type => !currentToken || type.toLowerCase().includes(currentToken))
    .slice(0, 20);

  list.innerHTML = matches
    .map(type => {
      const value = prefix ? `${prefix} ${type}`.trim() : type;
      return `<option value="${escapeAttr(value)}"></option>`;
    })
    .join("");
}

function maybeAppendCommanderCreatureTypeSeparator() {
  const input = document.getElementById("inputCreatureTypeCommander");
  if (!input) return;

  const raw = String(input.value || "");
  if (!raw || /,\s*$/.test(raw)) return;

  const commaIndex = raw.lastIndexOf(",");
  const prefix = commaIndex >= 0 ? raw.slice(0, commaIndex + 1).trimEnd() : "";
  const currentSegment = raw.slice(commaIndex + 1).trim().replace(/\s+/g, " ");
  if (!currentSegment) return;

  const exactCatalogMatch = commanderCreatureTypeCatalog.find(type => type.toLowerCase() === currentSegment.toLowerCase());
  if (!exactCatalogMatch) return;

  input.value = prefix ? `${prefix} ${exactCatalogMatch}, ` : `${exactCatalogMatch}, `;
  updateCommanderCreatureTypeSuggestions();
}

function getCommanderSelectedColors() {
  const colors = [];
  document.querySelectorAll(".chk-commander-color:checked").forEach(chk => {
    const value = String(chk.value || "").trim().toLowerCase();
    if (value) colors.push(value);
  });
  return [...new Set(colors)].sort();
}

function isCommanderColorlessSelected() {
  const chk = document.getElementById("chkCommanderColorless");
  return chk ? !!chk.checked : false;
}

function isCommanderExactColorsSelected() {
  const chk = document.getElementById("chkCommanderExacto");
  return chk ? !!chk.checked : false;
}

function updateCommanderExactColorsAvailability() {
  const chkExact = document.getElementById("chkCommanderExacto");
  if (!chkExact) return;

  const hasColoredSelection = getCommanderSelectedColors().length > 0;
  chkExact.disabled = !hasColoredSelection;
  if (!hasColoredSelection) chkExact.checked = false;
}

function syncCommanderColorSelection(changedInput = null) {
  const colorlessChk = document.getElementById("chkCommanderColorless");
  const colorChecks = [...document.querySelectorAll(".chk-commander-color")];
  if (!colorlessChk || colorChecks.length === 0) return;

  if (changedInput === colorlessChk && colorlessChk.checked) {
    colorChecks.forEach(chk => {
      chk.checked = false;
    });
  } else if (changedInput && colorChecks.includes(changedInput) && changedInput.checked) {
    colorlessChk.checked = false;
  } else if (colorlessChk.checked && colorChecks.some(chk => chk.checked)) {
    colorlessChk.checked = false;
  }

  updateCommanderExactColorsAvailability();
}

function buildCommanderQueryFromUI() {
  syncCommanderColorSelection();

  const colors = getCommanderSelectedColors();
  const colorless = isCommanderColorlessSelected();
  const exactColors = isCommanderExactColorsSelected();
  const rulingRaw = document.getElementById("inputRulingCommander")?.value || "";
  const ruling = String(rulingRaw).replace(/"/g, "").trim();
  const creatureTypeTerms = getCommanderCreatureTypeTerms();

  const clauses = ["game:paper", buildSearchLangClause(), "is:commander", "order:cmc"];

  if (colorless && colors.length === 0) {
    clauses.push("id=0");
  } else if (colors.length > 0) {
    const joinedColors = colors.join("");
    clauses.push(exactColors ? `id=${joinedColors}` : `id>=${joinedColors}`);
  }

  if (ruling) {
    clauses.push(`oracle:/.*${escapeScryfallRegexLiteral(ruling)}.*/i`);
  }

  for (const term of creatureTypeTerms) {
    const clause = buildCommanderCreatureTypeClause(term);
    if (clause) clauses.push(clause);
  }

  if (commanderCmcMin !== null && commanderCmcMax === null) {
    clauses.push(`cmc>=${commanderCmcMin}`);
  } else if (commanderCmcMin !== null && commanderCmcMax !== null) {
    clauses.push(`cmc>=${commanderCmcMin}`);
    if (!commanderCmcMaxOpen) clauses.push(`cmc<=${commanderCmcMax}`);
  }

  return clauses.join(" ");
}

function updateCommanderCmcUI() {
  const texto = document.getElementById("manaRangoTexto");
  const min = commanderCmcMin;
  const max = commanderCmcMax;

  document.querySelectorAll("[data-cmc]").forEach(btn => {
    const parsed = parseCommanderCmcValue(btn.dataset.cmc);
    if (!parsed) return;
    const value = parsed.value;
    const isActive = min !== null && (
      (max === null && value === min && parsed.open === commanderCmcMaxOpen) ||
      (max !== null && value === min) ||
      (max !== null && commanderCmcMaxOpen && value === 10)
    );
    const isInRange = min !== null && max !== null && value >= min && (commanderCmcMaxOpen || value <= max);
    btn.classList.toggle("active", isActive);
    btn.classList.toggle("in-range", isInRange);
  });

  if (!texto) return;

  if (min === null) {
    texto.textContent = "Sin filtro de coste.";
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

  const chkExact = document.getElementById("chkCommanderExacto");
  if (chkExact) chkExact.checked = false;

  const rulingInput = document.getElementById("inputRulingCommander");
  if (rulingInput) rulingInput.value = "";

  const creatureTypeInput = document.getElementById("inputCreatureTypeCommander");
  if (creatureTypeInput) creatureTypeInput.value = "";
  updateCommanderCreatureTypeSuggestions();

  setCommanderCmcRange(null, null, false);
  updateCommanderExactColorsAvailability();

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
    if (opts.randomOne) {
      const randomCard = await scrySearchRandomCommander(query, {
        signal: commanderSearchAbortController.signal
      });
      cards = randomCard ? [randomCard] : [];
    } else {
      cards = await scrySearchCommanders(query, {
        signal: commanderSearchAbortController.signal,
        unique: "cards"
      });
    }
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

  const avisoLimit = (!opts.randomOne && cards.length >= COMMANDER_SEARCH_LIMIT)
    ? `<div class="card"><p class="hint">Nota: se muestran solo los primeros ${COMMANDER_SEARCH_LIMIT} comandantes. Ajusta filtros para acotar.</p></div>`
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
      </div>
    `;
  }

  html += `</div>`;

  cont.innerHTML = html;

  const verById = new Map();
  for (const g of grupos) for (const v of g.versiones) verById.set(v.id, v);

  const mapaOracleAImg = new Map();
  for (const g of grupos) {
    mapaOracleAImg.set(g.oracleId, {
      titulo: g.titulo,
      img: g.img,
      versiones: g.versiones || [],
      allVersionsLoaded: false,
      loadingVersions: false
    });
  }

  cont._searchVerById = verById;
  cont._searchOracleImg = mapaOracleAImg;

  cont.querySelectorAll("img.carta-imagen[data-img-src]").forEach(img => {
    const src = img.dataset.imgSrc;
    if (src) loadImageWithCache(img, src);
  });

  if (!cont.dataset.wiredCommanderSearch) {
    cont.dataset.wiredCommanderSearch = "1";

    cont.addEventListener("click", async (e) => {
      const target = e.target;
      const btn = target.closest("button");
      if (!btn) return;

      if (btn.classList.contains("btn-cmd-prev") || btn.classList.contains("btn-cmd-next")) {
        const cardEl = btn.closest(".carta-item-comandante");
        if (!cardEl) return;
        const oracleId = cardEl.dataset.oracle;
        const data = cont._searchOracleImg?.get(oracleId);
        if (!data) return;
        const currentPrintId = cardEl.querySelector(".cmd-title")?.dataset.id || "";

        if (!data.allVersionsLoaded && !data.loadingVersions) {
          data.loadingVersions = true;
          cardEl.dataset.loadingVersions = "1";
          cardEl.setAttribute("aria-busy", "true");
          const navButtons = cardEl.querySelectorAll(".btn-cmd-nav");
          navButtons.forEach(navBtn => { navBtn.disabled = true; });

          try {
            const fetchedCards = await scrySearchCommanderPrintsByOracle(oracleId, {
              signal: commanderSearchAbortController?.signal
            });
            const fetchedGroup = agruparResultadosBusqueda(fetchedCards).find(group => group.oracleId === oracleId);
            if (fetchedGroup?.versiones?.length) {
              data.titulo = fetchedGroup.titulo;
              data.img = fetchedGroup.img;
              data.versiones = fetchedGroup.versiones;
              for (const version of fetchedGroup.versiones) {
                cont._searchVerById?.set(version.id, version);
              }
            }
            data.allVersionsLoaded = true;
          } catch (err) {
            if (!(err && err.name === "AbortError")) {
              console.error(err);
            }
          } finally {
            data.loadingVersions = false;
            delete cardEl.dataset.loadingVersions;
            cardEl.removeAttribute("aria-busy");
            navButtons.forEach(navBtn => { navBtn.disabled = false; });
          }
        }

        const versiones = data.versiones || [];
        if (versiones.length === 0) return;

        const hydratedCurrentIdx = currentPrintId
          ? versiones.findIndex(version => version.id === currentPrintId)
          : -1;
        const currentIdx = hydratedCurrentIdx >= 0 ? hydratedCurrentIdx : Number(cardEl.dataset.idx || 0);
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

function classifyStorageError(err) {
  if (!err) return "storage-unknown-error";

  const errorName = String(err.name || "").trim();
  if (errorName === "QuotaExceededError") return "storage-quota-exceeded";
  if (errorName === "SecurityError") return "storage-security-blocked";
  return "storage-unknown-error";
}

function getApproxStorageBytes(value) {
  if (typeof value !== "string") return 0;
  try {
    return new Blob([value]).size;
  } catch {
    return value.length * 2;
  }
}

function createStorageResult(partial = {}) {
  return {
    ok: partial.ok !== undefined ? !!partial.ok : true,
    reason: String(partial.reason || "success").trim() || "success",
    operation: String(partial.operation || "storage-op").trim() || "storage-op",
    key: partial.key == null ? null : String(partial.key),
    wroteMainState: !!partial.wroteMainState,
    wroteSnapshot: !!partial.wroteSnapshot,
    bytes: Math.max(0, Number(partial.bytes) || 0),
    error: partial.error || null,
    details: partial.details || null
  };
}

function createStorageSuccessResult(partial = {}) {
  return createStorageResult({
    ...partial,
    ok: true,
    reason: String(partial.reason || "success").trim() || "success",
    error: partial.error || null
  });
}

function createStorageFailureResult(partial = {}) {
  const error = partial.error || null;
  const classifiedReason = partial.reason || classifyStorageError(error);
  return createStorageResult({
    ...partial,
    ok: false,
    reason: String(classifiedReason || "storage-unknown-error").trim() || "storage-unknown-error",
    error
  });
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
let searchAutocompleteAbortController = null;

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

function cancelSearchAutocompleteAbort() {
  if (searchAutocompleteAbortController) {
    searchAutocompleteAbortController.abort();
    searchAutocompleteAbortController = null;
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

    // En navegador web no intentamos cachear con fetch si la imagen es cross-origin,
    // porque Scryfall no expone CORS para este caso y el <img> ya puede cargarla directa.
    try {
      const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
      const page = pageUrl ? new URL(pageUrl) : null;
      const target = new URL(key, pageUrl || undefined);
      const isHttpPage = !!page && /^https?:$/i.test(page.protocol);
      const isCrossOrigin = !!page && target.origin !== page.origin;
      if (isHttpPage && isCrossOrigin) {
        return;
      }
    } catch (_) {}

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
    if (!Array.isArray(cards) || cards.length === 0) {
      await deleteSetFromDB(setKey);
      return;
    }

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

async function deleteSetFromDB(setKey) {
  const safeSetKey = String(setKey || '').trim();
  if (!safeSetKey) return;

  try {
    const db = await openCardsDB();
    const tx = db.transaction(STORE_SETS, 'readwrite');
    const store = tx.objectStore(STORE_SETS);
    await store.delete(safeSetKey);
    await tx.complete;
  } catch (err) {
    console.warn('Error borrando set de IndexedDB:', err);
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

        if (!Array.isArray(data.cards) || data.cards.length === 0) {
          deleteSetFromDB(setKey).catch(() => {});
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
let bootRecoveryPendingConfirmation = false;

function uiSetSyncStatus(msg, options = {}) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("is-info", "is-warning", "is-error");

  const tone = String(options.tone || "").trim().toLowerCase();
  if (tone === "info" || tone === "warning" || tone === "error") {
    el.classList.add(`is-${tone}`);
  }
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
  const hasEstado3 = hasEstado3Data();
  return {
    version: hasEstado3 ? 3 : 2,
    savedAt: new Date().toISOString(),
    estado: estado || {},              // Legacy v1 (mantener para compatibilidad)
    estado2: estado2 || {},            // Nuevo v2 por oracle_id
    estado3: estado3 || createEmptyEstado3(),
    oracleIdCache: oracleIdCache || {}, // Cache de resolución
    progresoPorSet: progresoPorSet || {},
    progresoPorSetMeta: progresoPorSetMeta || normalizeSetProgressMeta({}),
    hiddenEmptySetKeys: [...(hiddenEmptySetKeys || new Set())],
    hiddenCollections: [...(hiddenCollections || new Set())],
    statsSnapshot: statsSnapshot || null,
    decks: decks || [],
    cardControlsConfig: cardControlsConfig || DEFAULT_CARD_CONTROLS,
    filtros: {
      filtroIdiomaColecciones: buildCollectionFiltersSnapshot().lang,
      filtroTextoColecciones: buildCollectionFiltersSnapshot().texto,
      vistaColecciones: buildCollectionFiltersSnapshot().vista,
      filtroYearColecciones: buildCollectionFiltersSnapshot().year,
      filtroTiposSet: buildCollectionFiltersSnapshot().filtroTiposSet,
      ocultarTokens: buildCollectionFiltersSnapshot().ocultarTokens,
      ocultarArte: buildCollectionFiltersSnapshot().ocultarArte
    }
  };
}

function sbApplyCloudPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object") return false;
  if (bootRecoveryPendingConfirmation && !options.allowRecoveredLocalOverwrite) {
    if (DEBUG) console.warn("sbApplyCloudPayload: aplicación bloqueada por recovery local pendiente");
    return false;
  }

  const version = payload.version || 1;
  console.log(`sbApplyCloudPayload: aplicando datos desde la nube (version ${version})...`);
  
  // Activar bandera para prevenir marcar como dirty
  sbApplyingCloudData = true;
  
  try {
    if (version >= 3 && payload.estado3 && typeof payload.estado3 === "object") {
      estado3 = normalizeEstado3(payload.estado3);
      guardarEstado3();
      console.log(`Estado v3 aplicado: ${Object.keys(estado3.inventoryByPrintId || {}).length} prints`);
    }

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
      progresoPorSetMeta = normalizeSetProgressMeta(payload.progresoPorSetMeta);
      safeLocalStorageSet(LS_SET_PROGRESS, JSON.stringify(progresoPorSet));
      safeLocalStorageSet(LS_SET_PROGRESS_META, JSON.stringify(progresoPorSetMeta));
      updateSetProgressCacheValidity({ triggerRefresh: true, reason: "cloud-payload" });
    }

    if (Array.isArray(payload.hiddenEmptySetKeys)) {
      hiddenEmptySetKeys = new Set(payload.hiddenEmptySetKeys);
      guardarHiddenEmptySets();
    }

    if (Array.isArray(payload.hiddenCollections)) {
      hiddenCollections = new Set(payload.hiddenCollections);
      guardarHiddenCollections();
    }

    let shouldReconcileStatsSnapshot = false;

    // ✅ NUEVO: aplicar snapshot de estadísticas desde nube
    if (payload.statsSnapshot && typeof payload.statsSnapshot === "object") {
      statsSnapshot = normalizeStatsSnapshot(payload.statsSnapshot, {
        source: "cloud-cache",
        stale: true,
        note: "Snapshot recibido desde la nube. Pendiente de reconciliación local."
      });
      safeLocalStorageSet(LS_STATS_SNAPSHOT, JSON.stringify(statsSnapshot));
      shouldReconcileStatsSnapshot = !!statsSnapshot;
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
    applyCollectionFiltersSnapshot({
      lang: f.filtroIdiomaColecciones ?? f.lang,
      texto: f.filtroTextoColecciones ?? f.texto,
      vista: f.vistaColecciones ?? f.vista,
      year: f.filtroYearColecciones ?? f.year,
      filtroTiposSet: f.filtroTiposSet,
      ocultarTokens: f.ocultarTokens,
      ocultarArte: f.ocultarArte
    });

    renderColecciones();
    if (setActualKey) renderTablaSet(setActualKey);

    // ✅ Bonus: pinta estadísticas con snapshot (NO recalcula aquí)
    try {
      if (typeof renderEstadisticas === "function") {
        renderEstadisticas({ forceRecalc: false });
      }
    } catch {}

    if (shouldReconcileStatsSnapshot) {
      scheduleStatsSnapshotUpdate({ renderIfVisible: true });
    }
    
    console.log("sbApplyCloudPayload: datos aplicados correctamente");
    return true;
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
    if (bootRecoveryPendingConfirmation) {
      const confirmarCloudSobreRecovery = await mostrarModalConfirmacion({
        titulo: "Recuperación local detectada",
        mensaje:
          "La app ha arrancado usando una copia local recuperada.\n\n" +
          "Si descargas ahora desde la nube, sustituirás ese estado local recuperado por el estado cloud.\n\n" +
          "¿Quieres aplicar igualmente los datos de la nube?",
        textoAceptar: "Aplicar nube",
        textoCancelar: "Mantener local"
      });

      if (!confirmarCloudSobreRecovery) {
        uiSetSyncStatus("Se mantiene la colección local recuperada. La nube no se ha aplicado.", { tone: "warning" });
        return;
      }
    }

    const applied = sbApplyCloudPayload(data.data || {}, { allowRecoveredLocalOverwrite: true });
    if (!applied) {
      uiSetSyncStatus("La nube no se ha aplicado sobre la colección recuperada localmente.", { tone: "warning" });
      return;
    }
    bootRecoveryPendingConfirmation = false;
    
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

async function sbPushNow(options = {}) {
  const source = String(options.source || "manual").trim() || "manual";
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

  if (bootRecoveryPendingConfirmation) {
    if (source !== "manual") {
      uiSetSyncStatus("La colección local recuperada sigue pendiente de confirmar. El guardado automático en la nube se ha pausado.", { tone: "warning" });
      sbPushInFlight = false;
      return;
    }

    const confirmarPushSobreRecovery = await mostrarModalConfirmacion({
      titulo: "Recuperación local pendiente",
      mensaje:
        "La app ha arrancado usando una copia local recuperada.\n\n" +
        "Si guardas ahora en la nube, ese estado local recuperado sustituirá el estado cloud actual.\n\n" +
        "¿Quieres subir igualmente la colección local a la nube?",
      textoAceptar: "Subir a la nube",
      textoCancelar: "Cancelar"
    });

    if (!confirmarPushSobreRecovery) {
      uiSetSyncStatus("No se ha subido el estado local recuperado a la nube.", { tone: "warning" });
      sbPushInFlight = false;
      return;
    }
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
  bootRecoveryPendingConfirmation = false;
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
    await sbPushNow({ source: "auto" });
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
      await sbPushNow({ source: "manual" });
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

function getEstadoKeyFromCard(card) {
  if (card && card.id) return String(card.id);
  if (card && card.oracle_id) return String(card.oracle_id);
  return "";
}

function getTotalQtyEstado2(st2) {
  return buildLegacyPossessionAdapter(st2).totals.qty;
}

function getTotalQtyEstado3(entry) {
  return Number(entry?.qty || 0);
}

function getEstado3InventoryMap() {
  return estado3?.inventoryByPrintId || {};
}

function getEstado3ManualInventoryMap() {
  return estado3?.manualInventoryByCardLang || {};
}

function hasEstado3Data() {
  return hasEstado3InventoryData() || hasEstado3ManualInventoryData() || !!estado3?.migrationMeta;
}

function hasEstado3InventoryData() {
  return Object.keys(getEstado3InventoryMap()).length > 0;
}

function hasEstado3ManualInventoryData() {
  return Object.keys(getEstado3ManualInventoryMap()).length > 0;
}

function getInventoryEntryV3(printId) {
  const key = String(printId || "").trim();
  if (!key) return normalizeInventoryEntryV3({});

  const entry = getEstado3InventoryMap()[key];
  if (!entry) return normalizeInventoryEntryV3({});

  const norm = normalizeInventoryEntryV3(entry);
  if (JSON.stringify(norm) !== JSON.stringify(entry)) {
    estado3.inventoryByPrintId[key] = norm;
  }
  return norm;
}

function getManualInventoryLangMapBySelectionKey(selectionKey) {
  const key = normalizeVisibleVariantSelectionKey(selectionKey);
  if (!key) return {};

  const entry = getEstado3ManualInventoryMap()[key];
  if (!entry || typeof entry !== "object") return {};

  const normalized = normalizeManualInventoryLangMap(entry);
  if (JSON.stringify(normalized) !== JSON.stringify(entry)) {
    if (!estado3 || typeof estado3 !== "object") estado3 = createEmptyEstado3();
    if (!estado3.manualInventoryByCardLang || typeof estado3.manualInventoryByCardLang !== "object") {
      estado3.manualInventoryByCardLang = {};
    }
    if (Object.keys(normalized).length === 0) {
      delete estado3.manualInventoryByCardLang[key];
    } else {
      estado3.manualInventoryByCardLang[key] = normalized;
    }
  }

  return normalized;
}

function getManualInventoryEntryBySelectionKey(selectionKey, lang) {
  const key = normalizeVisibleVariantSelectionKey(selectionKey);
  const safeLang = normalizePhase1ManualLangCode(lang);
  if (!key || !safeLang) return normalizeInventoryEntryV3({});

  return getManualInventoryLangMapBySelectionKey(key)[safeLang] || normalizeInventoryEntryV3({});
}

function setManualInventoryEntryBySelectionKey(selectionKey, lang, entry, { persist = true } = {}) {
  const key = normalizeVisibleVariantSelectionKey(selectionKey);
  const safeLang = normalizePhase1ManualLangCode(lang);
  if (!key || !safeLang) return normalizeInventoryEntryV3({});

  if (!estado3 || typeof estado3 !== "object") estado3 = createEmptyEstado3();
  if (!estado3.manualInventoryByCardLang || typeof estado3.manualInventoryByCardLang !== "object") {
    estado3.manualInventoryByCardLang = {};
  }

  const current = getManualInventoryLangMapBySelectionKey(key);
  const normalized = normalizeInventoryEntryV3({
    ...entry,
    updatedAt: entry?.updatedAt ?? Date.now()
  });

  if (isEmptyInventoryEntryV3(normalized)) {
    if (current[safeLang] !== undefined) {
      delete current[safeLang];
      if (Object.keys(current).length === 0) {
        delete estado3.manualInventoryByCardLang[key];
      } else {
        estado3.manualInventoryByCardLang[key] = current;
      }
      if (persist) guardarEstado3();
    }
    return normalized;
  }

  if (JSON.stringify(current[safeLang] || {}) === JSON.stringify(normalized)) {
    return normalizeInventoryEntryV3(current[safeLang]);
  }

  estado3.manualInventoryByCardLang[key] = {
    ...current,
    [safeLang]: normalized
  };
  if (persist) guardarEstado3();
  return normalized;
}

function getInventoryQtyV3(printId) {
  return getTotalQtyEstado3(getInventoryEntryV3(printId));
}

function getInventoryAggregateQtyByOracleV3(oracleId) {
  const key = String(oracleId || "").trim();
  if (!key) return 0;

  const seen = new Set();
  let total = 0;

  for (const printId of catalogPrintsByOracleId[key] || []) {
    if (seen.has(printId)) continue;
    seen.add(printId);
    total += getInventoryQtyV3(printId);
  }

  if (total > 0) return total;

  for (const [printId, entry] of Object.entries(getEstado3InventoryMap())) {
    if (seen.has(printId)) continue;
    const entryOracleId = catalogPrintMetaById[printId]?.oracleId || oracleIdCache[printId]?.oracle_id || "";
    if (entryOracleId !== key) continue;
    total += getTotalQtyEstado3(entry);
  }

  return total;
}

function getTotalQtyByOracle(oracleId) {
  const key = String(oracleId || "").trim();
  if (!key) return 0;

  if (hasEstado3InventoryData()) {
    let total = getInventoryAggregateQtyByOracleV3(key);

    for (const [estadoKey, st2Raw] of Object.entries(estado2 || {})) {
      const st2 = getEstadoCarta2(estadoKey);
      if (hasResolvedInventoryMirrorV3ForEstadoKey(estadoKey, st2)) continue;

      const meta = getCatalogPrintMetaForIntegrity(estadoKey);
      const entryOracleId = String(meta?.oracleId || oracleIdCache[estadoKey]?.oracle_id || estadoKey || "").trim();
      if (entryOracleId !== key) continue;
      total += getTotalQtyEstado2(st2Raw || st2);
    }

    return total;
  }

  const seen = new Set();
  let total = 0;

  for (const cartas of Object.values(cacheCartasPorSetLang || {})) {
    if (!Array.isArray(cartas)) continue;
    for (const carta of cartas) {
      if (!carta || carta.oracle_id !== key) continue;
      const estadoKey = getEstadoKeyFromCard(carta);
      if (!estadoKey || seen.has(estadoKey)) continue;
      seen.add(estadoKey);
      total += getTotalQtyEstado2(getEstadoCarta2(estadoKey));
    }
  }

  if (total > 0) return total;
  return getTotalQtyEstado2(getEstadoCarta2(key));
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

let setExactVariantsByCollectorKey = {};

function buildSetExactCollectorCacheKey(setCode, collectorNumber = "") {
  return `${String(setCode || "").trim().toLowerCase()}::${normalizeCollectorNumberKey(collectorNumber)}`;
}

function getCachedSetExactVariants(setCode, collectorNumber = "") {
  return setExactVariantsByCollectorKey[buildSetExactCollectorCacheKey(setCode, collectorNumber)] || null;
}

function clearCachedSetExactVariants(setCode = "") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  if (!safeSetCode) {
    setExactVariantsByCollectorKey = {};
    return;
  }
  const prefix = `${safeSetCode}::`;
  for (const key of Object.keys(setExactVariantsByCollectorKey || {})) {
    if (String(key || "").startsWith(prefix)) {
      delete setExactVariantsByCollectorKey[key];
    }
  }
}

function getMergedSetExactCards(setKey) {
  const { code, lang } = parseSetKeyParts(setKey);
  const safeSetCode = String(code || "").trim().toLowerCase();
  if (!safeSetCode) return [];

  clearCachedSetExactVariants(safeSetCode);

  const runtimeLangs = getSetRuntimeUiLangs(safeSetCode, lang);
  const collectorMap = new Map();

  for (const runtimeLang of runtimeLangs) {
    const cards = cartasDeSetKey(`${safeSetCode}__${runtimeLang}`);
    if (!Array.isArray(cards) || cards.length === 0) continue;

    for (const rawCard of cards) {
      const card = normalizeVisibleVariantCard(rawCard, rawCard);
      const normalizedCollector = normalizeCollectorNumberKey(card.collector_number || card.numero || "");
      if (!normalizedCollector) continue;

      const entry = collectorMap.get(normalizedCollector) || {
        collectorNumber: String(card.collector_number || card.numero || ""),
        variants: {}
      };

      if (!entry.variants[card.lang]) {
        entry.variants[card.lang] = card;
      }

      if (!entry.collectorNumber) {
        entry.collectorNumber = String(card.collector_number || card.numero || "");
      }

      collectorMap.set(normalizedCollector, entry);
    }
  }

  const preferredLang = safeSetCode === String(setActualCode || "").trim().toLowerCase()
    ? (normalizeLanguagePreferenceCode(setActualLang, lang) || lang || "en")
    : (normalizeLanguagePreferenceCode(getActiveVisibleLang(safeSetCode), lang) || lang || "en");
  const rows = [];

  for (const [normalizedCollector, entry] of collectorMap.entries()) {
    const variants = entry.variants || {};
    const displayCard = variants[preferredLang] || variants[lang] || variants.en || variants.es || Object.values(variants)[0];
    if (!displayCard) continue;

    setExactVariantsByCollectorKey[buildSetExactCollectorCacheKey(safeSetCode, normalizedCollector)] = variants;
    rows.push({
      ...displayCard,
      numero: String(displayCard.numero || entry.collectorNumber || ""),
      collector_number: String(displayCard.collector_number || entry.collectorNumber || ""),
      _setExactAvailableLangs: Object.keys(variants)
    });
  }

  return rows.sort((a, b) => compareCollectorNumbers(a.numero, b.numero));
}

const LS_SET_PROGRESS = "mtg_set_progress_v1";
const LS_SET_PROGRESS_META = "mtg_set_progress_meta_v1";
let progresoPorSet = {}; // { "khm__en": { total: 286, tengo: 12 }, ... }
let progresoPorSetMeta = {
  version: 1,
  inventoryToken: "",
  updatedAt: 0
};
let progresoPorSetStale = false;
let progresoPorSetRefreshPromise = null;

function normalizeSetProgressMeta(raw) {
  if (!raw || typeof raw !== "object") {
    return { version: 1, inventoryToken: "", updatedAt: 0 };
  }

  const version = clampInt(Number(raw.version ?? 1), 1, 999) || 1;
  const inventoryToken = String(raw.inventoryToken || "").trim();
  const updatedAt = Number.isFinite(Number(raw.updatedAt)) ? Math.trunc(Number(raw.updatedAt)) : 0;
  return { version, inventoryToken, updatedAt };
}

function computeInventoryProgressFingerprint() {
  if (hasEstado3InventoryData() || hasEstado3ManualInventoryData() || estado3?.migrationMeta) {
    const inventoryEntries = Object.values(getEstado3InventoryMap());
    const manualMaps = Object.values(getEstado3ManualInventoryMap());

    let qtyTotal = 0;
    let foilTotal = 0;
    let riCount = 0;
    let maxUpdatedAt = 0;

    for (const entry of inventoryEntries) {
      const normalized = normalizeInventoryEntryV3(entry);
      qtyTotal += Number(normalized.qty || 0);
      foilTotal += Number(normalized.foil || 0);
      if (normalized.ri) riCount += 1;
      maxUpdatedAt = Math.max(maxUpdatedAt, Number(normalized.updatedAt || 0));
    }

    for (const manualMap of manualMaps) {
      for (const entry of Object.values(manualMap || {})) {
        const normalized = normalizeInventoryEntryV3(entry);
        qtyTotal += Number(normalized.qty || 0);
        foilTotal += Number(normalized.foil || 0);
        if (normalized.ri) riCount += 1;
        maxUpdatedAt = Math.max(maxUpdatedAt, Number(normalized.updatedAt || 0));
      }
    }

    const migrationMeta = estado3?.migrationMeta || {};
    const migratedAt = String(migrationMeta.migratedAt || "").trim();
    const sourceStateKeys = clampInt(Number(migrationMeta.sourceStateKeys ?? 0), 0, 999999) || 0;
    const unresolvedBuckets = Array.isArray(migrationMeta.unresolvedBuckets) ? migrationMeta.unresolvedBuckets.length : 0;

    return [
      "v3",
      inventoryEntries.length,
      manualMaps.length,
      qtyTotal,
      foilTotal,
      riCount,
      maxUpdatedAt,
      migratedAt,
      sourceStateKeys,
      unresolvedBuckets
    ].join("|");
  }

  const estado2Keys = Object.keys(estado2 || {}).sort();
  if (estado2Keys.length > 0) {
    let qtyTotal = 0;
    let foilTotal = 0;
    let riCount = 0;

    for (const oracleId of estado2Keys) {
      const adapter = buildLegacyPossessionAdapter(getEstadoCarta2(oracleId));
      qtyTotal += Number(adapter.totals.qty || 0);
      foilTotal += Number(adapter.totals.foil || 0);
      if (adapter.totals.ri) riCount += 1;
    }

    return ["v2", estado2Keys.length, qtyTotal, foilTotal, riCount].join("|");
  }

  const legacyKeys = Object.keys(estado || {}).sort();
  let qtyTotal = 0;
  let foilTotal = 0;
  let riCount = 0;

  for (const id of legacyKeys) {
    const st = getEstadoCarta(id);
    qtyTotal += Number(st.qty || 0);
    foilTotal += Number(st.foilQty || 0);
    if (st.wantMore) riCount += 1;
  }

  return ["v1", legacyKeys.length, qtyTotal, foilTotal, riCount].join("|");
}

function getCurrentSetProgressInventoryToken() {
  return computeInventoryProgressFingerprint();
}

function getSavedProgressForSet(setKey) {
  if (progresoPorSetStale) return null;
  const saved = progresoPorSet?.[setKey];
  if (!saved || typeof saved.total !== "number") return null;

  const total = Number(saved.total);
  const tengo = Number(saved.tengo || 0);
  const totalSafe = Number.isFinite(total) ? total : null;
  const tengoSafe = Number.isFinite(tengo) ? tengo : 0;

  if (totalSafe != null && totalSafe > 0) {
    return { tengo: Math.max(0, Math.min(tengoSafe, totalSafe)), total: totalSafe };
  }

  return { tengo: Math.max(0, tengoSafe), total: totalSafe };
}

function updateSetProgressCacheValidity({ triggerRefresh = false, reason = "" } = {}) {
  const currentToken = getCurrentSetProgressInventoryToken();
  const cachedToken = String(progresoPorSetMeta?.inventoryToken || "").trim();
  const hasSavedProgress = Object.keys(progresoPorSet || {}).length > 0;
  const shouldMarkStale = hasSavedProgress && (!cachedToken || cachedToken !== currentToken);

  progresoPorSetStale = shouldMarkStale;

  if (shouldMarkStale && triggerRefresh && !progresoPorSetRefreshPromise) {
    progresoPorSetRefreshPromise = recomputeAllProgressFromCache()
      .catch(err => {
        if (DEBUG) console.warn("Error recalculando progreso por set tras invalidacion:", reason || "unknown", err);
      })
      .finally(() => {
        progresoPorSetRefreshPromise = null;
        scheduleRenderColecciones();
      });
  }

  return !shouldMarkStale;
}

function cargarProgresoPorSet() {
  const raw = safeLocalStorageGet(LS_SET_PROGRESS);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") progresoPorSet = obj;
  } catch {}
}

function cargarProgresoPorSetMeta() {
  const raw = safeLocalStorageGet(LS_SET_PROGRESS_META);
  if (!raw) {
    progresoPorSetMeta = normalizeSetProgressMeta({});
    return;
  }

  try {
    progresoPorSetMeta = normalizeSetProgressMeta(JSON.parse(raw));
  } catch {
    progresoPorSetMeta = normalizeSetProgressMeta({});
  }
}

function guardarProgresoPorSet() {
  progresoPorSetMeta = normalizeSetProgressMeta({
    version: 1,
    inventoryToken: getCurrentSetProgressInventoryToken(),
    updatedAt: Date.now()
  });
  progresoPorSetStale = false;
  safeLocalStorageSet(LS_SET_PROGRESS, JSON.stringify(progresoPorSet));
  safeLocalStorageSet(LS_SET_PROGRESS_META, JSON.stringify(progresoPorSetMeta));
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

function normalizeStatsSnapshot(raw, { source = "local", stale = false, note = "" } = {}) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.resumen || typeof raw.resumen !== "object") return null;

  const normalized = {
    ...raw,
    version: Number(raw.version) || 1,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
    resumen: {
      distinct: Number(raw.resumen?.distinct || 0),
      totalQty: Number(raw.resumen?.totalQty || 0),
      foilQty: Number(raw.resumen?.foilQty || 0),
      riCount: Number(raw.resumen?.riCount || 0)
    },
    controlsStats: {
      counters: Array.isArray(raw.controlsStats?.counters) ? raw.controlsStats.counters : [],
      tags: Array.isArray(raw.controlsStats?.tags) ? raw.controlsStats.tags : []
    },
    sets: raw.sets && typeof raw.sets === "object" ? raw.sets : {},
    meta: {
      source: String(raw.meta?.source || source || "local").trim() || "local",
      stale: raw.meta?.stale !== undefined ? !!raw.meta.stale : !!stale,
      note: String(raw.meta?.note || note || "").trim(),
      receivedAt: Number.isFinite(Number(raw.meta?.receivedAt)) ? Number(raw.meta.receivedAt) : Date.now()
    }
  };

  return normalized;
}

function cargarStatsSnapshot() {
  const raw = safeLocalStorageGet(LS_STATS_SNAPSHOT);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    statsSnapshot = normalizeStatsSnapshot(obj, { source: "local", stale: false });
  } catch {}
}

function guardarStatsSnapshot(snap, { markDirty = true } = {}) {
  statsSnapshot = normalizeStatsSnapshot(snap, { source: snap?.meta?.source || "local", stale: !!snap?.meta?.stale, note: snap?.meta?.note || "" });
  safeLocalStorageSet(LS_STATS_SNAPSHOT, JSON.stringify(statsSnapshot || {}));

  // Queremos que se sincronice con Supabase, pero NO cuando viene de un pull
  if (markDirty && !sbApplyingCloudData) sbMarkDirty();
}

function accumulateStatsFromInventoryEntry(entryRaw, countersCfg, tagsCfg, counterTotals, tagTotals) {
  const entry = normalizeInventoryEntryV3(entryRaw);
  const qty = Number(entry.qty || 0);
  const foil = Number(entry.foil || 0);
  const distinct = qty > 0 ? 1 : 0;
  const riCount = entry.ri ? 1 : 0;

  for (const c of countersCfg) {
    if (c.key === "qty") {
      counterTotals[c.key] += qty;
    } else if (c.key === "foil") {
      counterTotals[c.key] += foil;
    } else {
      counterTotals[c.key] += Number(entry.counters?.[c.key] || 0);
    }
  }

  for (const t of tagsCfg) {
    if (t.key === "ri") {
      if (entry.ri) tagTotals[t.key] += 1;
    } else {
      if (entry.tags?.[t.key]) tagTotals[t.key] += 1;
    }
  }

  return { distinct, qty, foil, riCount };
}

function buildSetStatsSummary() {
  const setKeys = setMetaByKey.size > 0 ? Array.from(setMetaByKey.keys()) : Object.keys(progresoPorSet || {});
  const totalColecciones = setKeys.length;

  let conAlguna = 0;
  let completas = 0;
  let sumTengo = 0;
  let sumTotal = 0;
  let live = 0;
  let cached = 0;
  let missing = 0;

  for (const setKey of setKeys) {
    let progress = null;

    if (cacheCartasPorSetLang[setKey]) {
      progress = progresoDeColeccion(setKey);
      live += 1;
    } else {
      const saved = getSavedProgressForSet(setKey);
      if (saved) {
        progress = saved;
        cached += 1;
      } else {
        missing += 1;
      }
    }

    if (!progress) continue;

    const t = Number(progress.total);
    const h = Number(progress.tengo || 0);
    if (h > 0) conAlguna++;
    if (Number.isFinite(t) && t > 0) {
      sumTotal += t;
      sumTengo += Math.min(h, t);
      if (h === t) completas++;
    }
  }

  const pctGlobal = sumTotal > 0 ? Math.round((sumTengo / sumTotal) * 100) : null;
  const mode = missing > 0 ? "partial" : (cached > 0 ? "cached" : "fresh");

  return {
    totalColecciones,
    conAlguna,
    completas,
    pctGlobal,
    coverage: {
      live,
      cached,
      missing,
      mode,
      known: live + cached
    }
  };
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

  if (hasEstado3InventoryData() || hasEstado3ManualInventoryData()) {
    for (const printId of Object.keys(getEstado3InventoryMap())) {
      const entryTotals = accumulateStatsFromInventoryEntry(getInventoryEntryV3(printId), countersCfg, tagsCfg, counterTotals, tagTotals);
      distinct += entryTotals.distinct;
      totalQty += entryTotals.qty;
      foilQty += entryTotals.foil;
      riCount += entryTotals.riCount;
    }

    for (const selectionKey of Object.keys(getEstado3ManualInventoryMap())) {
      const manualByLang = getManualInventoryLangMapBySelectionKey(selectionKey);
      for (const entry of Object.values(manualByLang)) {
        const entryTotals = accumulateStatsFromInventoryEntry(entry, countersCfg, tagsCfg, counterTotals, tagTotals);
        distinct += entryTotals.distinct;
        totalQty += entryTotals.qty;
        foilQty += entryTotals.foil;
        riCount += entryTotals.riCount;
      }
    }

    for (const [estadoKey, st2Raw] of Object.entries(estado2 || {})) {
      const st2 = getEstadoCarta2(estadoKey);
      if (hasResolvedInventoryMirrorV3ForEstadoKey(estadoKey, st2) || hasManualInventoryMirrorV3ForEstadoKey(estadoKey)) continue;
      const adapter = buildLegacyPossessionAdapter(st2);

      const q = adapter.totals.qty;
      if (q > 0) distinct++;
      totalQty += q;
      foilQty += adapter.totals.foil;
      if (adapter.totals.ri) riCount++;

      for (const c of countersCfg) {
        if (c.key === "qty") {
          counterTotals[c.key] += q;
        } else if (c.key === "foil") {
          counterTotals[c.key] += adapter.totals.foil;
        } else {
          counterTotals[c.key] += Number(adapter.langs.en.counters?.[c.key] || 0) + Number(adapter.langs.es.counters?.[c.key] || 0);
        }
      }

      for (const t of tagsCfg) {
        if (t.key === "ri") {
          if (adapter.totals.ri) tagTotals[t.key] += 1;
        } else {
          if (adapter.langs.en.tags?.[t.key] || adapter.langs.es.tags?.[t.key]) tagTotals[t.key] += 1;
        }
      }
    }
  } else {
    const estado2Keys = Object.keys(estado2 || {});
    if (estado2Keys.length > 0) {
    for (const oracleId of estado2Keys) {
      const st2 = getEstadoCarta2(oracleId);
      const adapter = buildLegacyPossessionAdapter(st2);
      const q = adapter.totals.qty;
      if (q > 0) distinct++;
      totalQty += q;
      foilQty += adapter.totals.foil;
      if (adapter.totals.ri) riCount++;

      for (const c of countersCfg) {
        if (c.key === "qty") {
          counterTotals[c.key] += q;
        } else if (c.key === "foil") {
          counterTotals[c.key] += adapter.totals.foil;
        } else {
          counterTotals[c.key] += Number(adapter.langs.en.counters?.[c.key] || 0) + Number(adapter.langs.es.counters?.[c.key] || 0);
        }
      }

      for (const t of tagsCfg) {
        if (t.key === "ri") {
          if (adapter.totals.ri) tagTotals[t.key] += 1;
        } else {
          if (adapter.langs.en.tags?.[t.key] || adapter.langs.es.tags?.[t.key]) tagTotals[t.key] += 1;
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
  }

  return {
    version: 1,
    updatedAt: Date.now(),
    resumen: { distinct, totalQty, foilQty, riCount },
    controlsStats: {
      counters: countersCfg.map(c => ({ key: c.key, label: c.label, value: counterTotals[c.key] || 0 })),
      tags: tagsCfg.map(t => ({ key: t.key, label: t.label, value: tagTotals[t.key] || 0 }))
    },
    sets: buildSetStatsSummary()
  };
}

function actualizarStatsSnapshot({ render = false } = {}) {
  const snap = normalizeStatsSnapshot(calcularStatsDesdeEstado(), {
    source: "local-recalc",
    stale: false,
    note: ""
  });
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
  const coverage = s.coverage || {};
  const meta = snap.meta || {};
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
    ${meta.stale ? `<div class="hint" style="margin-top:6px;">${escapeHtml(meta.note || "Snapshot pendiente de reconciliación local.")}</div>` : ""}
  `;

  const pctTxt = (s.pctGlobal == null) ? "—" : `${s.pctGlobal}%`;
  const pctLabel = coverage.missing > 0 ? "% global conocido" : "% global";
  const coverageHint = coverage.mode === "fresh"
    ? "Cobertura de progreso: todas las colecciones visibles están recalculadas en sesión."
    : coverage.mode === "cached"
      ? `Cobertura de progreso: ${coverage.live || 0} recalculadas en sesión y ${coverage.cached || 0} desde caché guardada.`
      : `Cobertura de progreso parcial: ${coverage.live || 0} recalculadas en sesión, ${coverage.cached || 0} desde caché y ${coverage.missing || 0} sin progreso conocido.`;

  elSets.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="k">Colecciones (idioma) conocidas</div><div class="v">${s.totalColecciones ?? 0}</div></div>
      <div class="stat"><div class="k">Con alguna carta</div><div class="v">${s.conAlguna ?? 0}</div></div>
      <div class="stat"><div class="k">Completas</div><div class="v">${s.completas ?? 0}</div></div>
      <div class="stat"><div class="k">${pctLabel}</div><div class="v">${pctTxt}</div></div>
      <div class="stat"><div class="k">Sin progreso conocido</div><div class="v">${coverage.missing ?? 0}</div></div>
    </div>
    <div class="hint" style="margin-top:10px;">${escapeHtml(coverageHint)}</div>
  `;
}

function renderEstadisticas({ forceRecalc = false } = {}) {
  // 1) pinta instantáneo desde snapshot si existe
  if (statsSnapshot) renderStatsDesdeSnapshot(statsSnapshot);

  // 2) si no hay snapshot, calcula una vez (para no ver “—”)
  if (!statsSnapshot) {
    const snap = normalizeStatsSnapshot(calcularStatsDesdeEstado(), { source: "local-recalc", stale: false, note: "" });
    guardarStatsSnapshot(snap, { markDirty: false });
    renderStatsDesdeSnapshot(snap);
    return;
  }

  // 3) si fuerzas recálculo
  if (forceRecalc) {
    const snap = normalizeStatsSnapshot(calcularStatsDesdeEstado(), { source: "local-recalc", stale: false, note: "" });
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
        const estadoKey = getEstadoKeyFromCard(c);
        if (hasEstado3InventoryData()) {
          return getCoexistingTotalQtyForEstadoKey(estadoKey) > 0;
        }
        if (!estadoKey) return getEstadoCarta(c.id).qty > 0; // Fallback legacy
        return getLegacyPossessionAdapterForState(estadoKey).totals.qty > 0;
      }).length
    : 0;
  return { total, tengo };
}

async function recomputeAllProgressFromCache() {
  const updated = new Set();
  const now = Date.now();
  const nextProgress = {};

  // 1) RAM cache
  for (const [setKey, lista] of Object.entries(cacheCartasPorSetLang || {})) {
    if (!Array.isArray(lista)) continue;
    const { total, tengo } = computeProgresoFromList(lista);
    nextProgress[setKey] = { total, tengo, updatedAt: now };
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
          nextProgress[data.setKey] = { total, tengo, updatedAt: now };
        }

        cursor.continue();
      };
      request.onerror = () => resolve();
    });
  } catch (err) {
    if (DEBUG) console.warn('Error recalculando progreso desde IndexedDB:', err);
  }

  progresoPorSet = nextProgress;
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
// 2.5) NUEVO ESTADO v2: Por clave de estado (id de print recomendado) con idiomas separados
// ===============================

const LS_KEY_V2 = "mtg_coleccion_estado_v2";
const LS_KEY_V3 = "mtg_coleccion_estado_v3";
const LS_KEY_V3_BACKUP_V2 = "mtg_coleccion_estado_v3_backup_v2";
const LS_KEY_V3_SNAPSHOT_PREV = "mtg_coleccion_estado_v3_snapshot_prev";
const LS_KEY_V3_SNAPSHOT_META = "mtg_coleccion_estado_v3_snapshot_meta";
const LS_ORACLE_CACHE = "mtg_oracle_id_cache_v1";

let estado2 = {}; // stateKey -> { qty_en, qty_es, foil_en, foil_es, ri_en, ri_es, counters_en, counters_es, tags_en, tags_es }
let estado3 = createEmptyEstado3();
let estadoLegacyById = {}; // Copia temporal del estado legacy (por id) para migración
let oracleIdCache = {}; // id -> { oracle_id, lang } - cache de resolución
let bootStateHealth = null;

// Índice para búsqueda rápida: oracle_id -> { en: "id-en", es: "id-es" }
let oracleToIds = {};

// Índices v3 reconstruibles desde catálogo cargado
let catalogPrintMetaById = {};
let catalogPrintsByOracleId = {};
let catalogPrintsBySetCode = {};
let catalogVariantPrintsBySetCard = {};
let catalogPrintsByOracleIdAndLang = {};
let catalogPrintsBySetCollectorLang = {};
let catalogPrintsByOracleSetCollectorLang = {};
let canonicalPrintByOracleLang = {};

// Cola de IDs legacy pendientes de resolver
let pendingLegacyIds = new Set();
let resolvingLegacyIds = false;

function createEmptyEstado3() {
  return {
    version: 3,
    inventoryByPrintId: {},
    manualInventoryByCardLang: {},
    uiPreferences: {
      globalFallbackLang: "en",
      preferredSetLang: {},
      selectedVariantByCard: {},
      visibleLangsBySet: {},
      visibleLangsByCard: {},
      activeLangBySet: {},
      manualSetLangOverrides: {},
      manualCardLangOverrides: {}
    },
    migrationMeta: null
  };
}

const APP_SUPPORTED_LANGS = new Set(["en", "es"]);

function normalizeSupportedLangCode(lang) {
  const value = String(lang || "").trim().toLowerCase();
  return APP_SUPPORTED_LANGS.has(value) ? value : "";
}

function normalizeLanguagePreferenceCode(lang, fallback = "") {
  const value = normalizeSupportedLangCode(lang);
  if (value) return value;
  return normalizeSupportedLangCode(fallback);
}

function normalizeLanguagePreferenceList(list, { fallbackToEnglish = false } = {}) {
  const normalized = [];
  const seen = new Set();
  const source = Array.isArray(list) ? list : [];

  for (const rawLang of source) {
    const lang = normalizeLanguagePreferenceCode(rawLang);
    if (!lang || seen.has(lang)) continue;
    seen.add(lang);
    normalized.push(lang);
  }

  if (fallbackToEnglish && normalized.length === 0) {
    normalized.push("en");
  }

  return normalized;
}

const PHASE1_SUPPORTED_MANUAL_LANGS = new Set(["en", "es"]);

function normalizePhase1ManualLangCode(lang, fallback = "") {
  const normalized = normalizeLanguagePreferenceCode(lang, fallback);
  if (!normalized) return "";
  return PHASE1_SUPPORTED_MANUAL_LANGS.has(normalized) ? normalized : "";
}

function normalizeManualLangOverrideMap(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;

  for (const [langRaw, enabledRaw] of Object.entries(input)) {
    const lang = normalizePhase1ManualLangCode(langRaw);
    if (!lang || !enabledRaw) continue;
    out[lang] = true;
  }

  return out;
}

function normalizeManualInventoryLangMap(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;

  for (const [langRaw, entryRaw] of Object.entries(input)) {
    const lang = normalizePhase1ManualLangCode(langRaw);
    if (!lang) continue;
    const entry = normalizeInventoryEntryV3(entryRaw);
    if (isEmptyInventoryEntryV3(entry)) continue;
    out[lang] = entry;
  }

  return out;
}

function normalizeInventoryEntryV3(entry) {
  const qty = clampInt(Number(entry?.qty ?? 0), 0, 999);
  const foil = clampInt(Number(entry?.foil ?? 0), 0, qty);
  const ri = !!entry?.ri;
  const counters = normalizeCounterMap(entry?.counters);
  const tags = normalizeTagMap(entry?.tags);
  const updatedAt = Number(entry?.updatedAt);

  return {
    qty,
    foil,
    ri,
    counters,
    tags,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.trunc(updatedAt) : 0
  };
}

function isEmptyInventoryEntryV3(entry) {
  return !entry.qty && !entry.foil && !entry.ri && Object.keys(entry.counters || {}).length === 0 && Object.keys(entry.tags || {}).length === 0;
}

function mergeCounterMapsV3(baseMap, incomingMap) {
  const out = {};
  const left = normalizeCounterMap(baseMap);
  const right = normalizeCounterMap(incomingMap);

  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const value = clampInt(Number(left[key] || 0) + Number(right[key] || 0), 0, 999);
    if (value > 0) out[key] = value;
  }

  return out;
}

function mergeTagMapsV3(baseMap, incomingMap) {
  const out = {};
  const left = normalizeTagMap(baseMap);
  const right = normalizeTagMap(incomingMap);

  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const value = !!left[key] || !!right[key];
    if (value) out[key] = true;
  }

  return out;
}

function mergeInventoryEntriesV3(baseEntry, incomingEntry, updatedAt = Date.now()) {
  const left = normalizeInventoryEntryV3(baseEntry);
  const right = normalizeInventoryEntryV3(incomingEntry);

  return normalizeInventoryEntryV3({
    qty: Number(left.qty || 0) + Number(right.qty || 0),
    foil: Number(left.foil || 0) + Number(right.foil || 0),
    ri: !!left.ri || !!right.ri,
    counters: mergeCounterMapsV3(left.counters, right.counters),
    tags: mergeTagMapsV3(left.tags, right.tags),
    updatedAt: Number.isFinite(Number(updatedAt)) && Number(updatedAt) > 0
      ? Math.trunc(Number(updatedAt))
      : Math.max(Number(left.updatedAt || 0), Number(right.updatedAt || 0), Date.now())
  });
}

function setInventoryEntryV3(printId, entry, { persist = true } = {}) {
  const key = String(printId || "").trim();
  if (!key) return normalizeInventoryEntryV3({});

  if (!estado3 || typeof estado3 !== "object") estado3 = createEmptyEstado3();
  if (!estado3.inventoryByPrintId || typeof estado3.inventoryByPrintId !== "object") {
    estado3.inventoryByPrintId = {};
  }

  const normalized = normalizeInventoryEntryV3({
    ...entry,
    updatedAt: entry?.updatedAt ?? Date.now()
  });
  const existing = estado3.inventoryByPrintId[key];
  const existingNormalized = existing ? normalizeInventoryEntryV3(existing) : null;

  if (isEmptyInventoryEntryV3(normalized)) {
    if (existing !== undefined) {
      delete estado3.inventoryByPrintId[key];
      if (persist) guardarEstado3();
    }
    return normalized;
  }

  if (existingNormalized && JSON.stringify(existingNormalized) === JSON.stringify(normalized)) {
    return existingNormalized;
  }

  estado3.inventoryByPrintId[key] = normalized;
  if (persist) guardarEstado3();
  return normalized;
}

function mergeInventoryEntryV3(printId, entry, { persist = true, updatedAt = Date.now() } = {}) {
  const key = String(printId || "").trim();
  if (!key) return normalizeInventoryEntryV3({});
  const current = getInventoryEntryV3(key);
  const merged = mergeInventoryEntriesV3(current, entry, updatedAt);
  return setInventoryEntryV3(key, merged, { persist });
}

function getSelectionKeyFromCatalogMeta(meta) {
  if (!meta?.setCode || !meta?.oracleId) return "";
  return buildVisibleVariantSelectionKey(meta.setCode, meta.oracleId, meta.collectorNumber || "");
}

function deriveStableSelectionKeyFromEstadoKey(estadoKey) {
  const raw = String(estadoKey || "").trim();
  if (!raw) return "";

  if (raw.includes("::")) {
    return normalizeVisibleVariantSelectionKey(raw);
  }

  const meta = getCatalogPrintMetaForIntegrity(raw);
  if (meta) return getSelectionKeyFromCatalogMeta(meta);

  // Phase 1 safeguard: oracle-only keys are ambiguous because they don't encode
  // set or collector number, so we refuse to derive a manual selection key.
  return "";
}

function getCatalogPrintMetaForIntegrity(printId) {
  const key = String(printId || "").trim();
  if (!key) return null;
  if (catalogPrintMetaById[key]) return catalogPrintMetaById[key];

  const knownCard = typeof getKnownCardById === "function" ? getKnownCardById(key) : null;
  return knownCard ? extractCatalogPrintMeta(knownCard, knownCard.setKey || "") : null;
}

function parseVisibleVariantSelectionKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return { setCode: "", oracleId: "", collectorNumber: "" };
  const [setCode = "", oracleId = "", collectorNumber = ""] = raw.split("::");
  return {
    setCode: String(setCode || "").trim().toLowerCase(),
    oracleId: String(oracleId || "").trim(),
    collectorNumber: normalizeCollectorNumberKey(collectorNumber)
  };
}

function normalizeVisibleVariantSelectionKey(key) {
  const parsed = parseVisibleVariantSelectionKey(key);
  if (!parsed.setCode || !parsed.oracleId) return "";
  return `${parsed.setCode}::${parsed.oracleId}::${parsed.collectorNumber}`;
}

function normalizeManualSetLangOverrides(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;

  for (const [setCodeRaw, valueRaw] of Object.entries(input)) {
    const setCode = String(setCodeRaw || "").trim().toLowerCase();
    if (!setCode) continue;
    const normalized = normalizeManualLangOverrideMap(valueRaw);
    if (Object.keys(normalized).length === 0) continue;
    out[setCode] = normalized;
  }

  return out;
}

function normalizeManualCardLangOverrides(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;

  for (const [selectionKeyRaw, valueRaw] of Object.entries(input)) {
    const selectionKey = normalizeVisibleVariantSelectionKey(selectionKeyRaw);
    if (!selectionKey) continue;
    const normalized = normalizeManualLangOverrideMap(valueRaw);
    if (Object.keys(normalized).length === 0) continue;
    out[selectionKey] = normalized;
  }

  return out;
}

function normalizeManualInventoryByCardLang(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;

  for (const [selectionKeyRaw, valueRaw] of Object.entries(input)) {
    const selectionKey = normalizeVisibleVariantSelectionKey(selectionKeyRaw);
    if (!selectionKey) continue;
    const normalized = normalizeManualInventoryLangMap(valueRaw);
    if (Object.keys(normalized).length === 0) continue;
    out[selectionKey] = normalized;
  }

  return out;
}

function isSelectedVariantPrintIdValid(setCode, oracleId, collectorNumber, printId) {
  const safePrintId = String(printId || "").trim();
  if (!safePrintId) return false;

  const meta = getCatalogPrintMetaForIntegrity(safePrintId);
  if (!meta) return true;

  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeOracleId = String(oracleId || "").trim();
  const safeCollectorNumber = normalizeCollectorNumberKey(collectorNumber);

  if (safeOracleId && meta.oracleId && meta.oracleId !== safeOracleId) return false;
  if (safeSetCode && meta.setCode && meta.setCode !== safeSetCode) return false;
  if (safeCollectorNumber && meta.collectorNumber && normalizeCollectorNumberKey(meta.collectorNumber) !== safeCollectorNumber) return false;
  return true;
}

function enforceUiPreferencesIntegrityV3(input) {
  const normalized = normalizeUiPreferencesV3(input);
  const selectedVariantByCard = {};
  const visibleLangsBySet = {};
  const visibleLangsByCard = {};
  const activeLangBySet = {};
  const manualSetLangOverrides = normalizeManualSetLangOverrides(normalized.manualSetLangOverrides);
  const manualCardLangOverrides = normalizeManualCardLangOverrides(normalized.manualCardLangOverrides);

  for (const [selectionKey, printId] of Object.entries(normalized.selectedVariantByCard || {})) {
    const parsed = parseVisibleVariantSelectionKey(selectionKey);
    if (!parsed.setCode || !parsed.oracleId) continue;
    if (!isSelectedVariantPrintIdValid(parsed.setCode, parsed.oracleId, parsed.collectorNumber, printId)) continue;
    selectedVariantByCard[selectionKey] = String(printId || "").trim();
  }

  for (const [setCodeRaw, langsRaw] of Object.entries(normalized.visibleLangsBySet || {})) {
    const setCode = String(setCodeRaw || "").trim().toLowerCase();
    if (!setCode) continue;
    visibleLangsBySet[setCode] = normalizeLanguagePreferenceList(langsRaw, { fallbackToEnglish: true });
  }

  for (const [cardKeyRaw, langsRaw] of Object.entries(normalized.visibleLangsByCard || {})) {
    const cardKey = String(cardKeyRaw || "").trim();
    if (!cardKey) continue;
    const parsed = parseVisibleVariantSelectionKey(cardKey);
    if (!parsed.setCode || !parsed.oracleId) continue;
    visibleLangsByCard[cardKey] = normalizeLanguagePreferenceList(langsRaw, { fallbackToEnglish: true });
  }

  for (const [setCodeRaw, langRaw] of Object.entries(normalized.activeLangBySet || {})) {
    const setCode = String(setCodeRaw || "").trim().toLowerCase();
    const lang = normalizeLanguagePreferenceCode(langRaw);
    if (!setCode || !lang) continue;
    activeLangBySet[setCode] = lang;
    if (!visibleLangsBySet[setCode]) {
      visibleLangsBySet[setCode] = [lang];
    } else if (!visibleLangsBySet[setCode].includes(lang)) {
      visibleLangsBySet[setCode] = [...visibleLangsBySet[setCode], lang];
    }
  }

  return {
    globalFallbackLang: normalized.globalFallbackLang,
    preferredSetLang: { ...(normalized.preferredSetLang || {}) },
    selectedVariantByCard,
    visibleLangsBySet,
    visibleLangsByCard,
    activeLangBySet,
    manualSetLangOverrides,
    manualCardLangOverrides
  };
}

function normalizeUiPreferencesV3(input) {
  const raw = input && typeof input === "object" ? input : {};
  const preferredSetLang = {};
  const selectedVariantByCard = {};
  const visibleLangsBySet = {};
  const visibleLangsByCard = {};
  const activeLangBySet = {};
  const manualSetLangOverrides = normalizeManualSetLangOverrides(raw.manualSetLangOverrides);
  const manualCardLangOverrides = normalizeManualCardLangOverrides(raw.manualCardLangOverrides);

  for (const [key, value] of Object.entries(raw.preferredSetLang || {})) {
    const setCode = String(key || "").trim().toLowerCase();
    const lang = normalizeLanguagePreferenceCode(value);
    if (!setCode) continue;
    if (!lang) continue;
    preferredSetLang[setCode] = lang;
  }

  for (const [key, value] of Object.entries(raw.selectedVariantByCard || {})) {
    const cardKey = String(key || "").trim();
    const printId = String(value || "").trim();
    if (!cardKey || !printId) continue;
    selectedVariantByCard[cardKey] = printId;
  }

  for (const [key, value] of Object.entries(raw.visibleLangsBySet || {})) {
    const setCode = String(key || "").trim().toLowerCase();
    if (!setCode) continue;
    visibleLangsBySet[setCode] = normalizeLanguagePreferenceList(value, { fallbackToEnglish: true });
  }

  for (const [key, value] of Object.entries(raw.visibleLangsByCard || {})) {
    const cardKey = String(key || "").trim();
    if (!cardKey) continue;
    visibleLangsByCard[cardKey] = normalizeLanguagePreferenceList(value, { fallbackToEnglish: true });
  }

  for (const [key, value] of Object.entries(raw.activeLangBySet || {})) {
    const setCode = String(key || "").trim().toLowerCase();
    const lang = normalizeLanguagePreferenceCode(value);
    if (!setCode || !lang) continue;
    activeLangBySet[setCode] = lang;
  }

  const fallbackLang = normalizeLanguagePreferenceCode(raw.globalFallbackLang, "en");

  return {
    globalFallbackLang: fallbackLang || "en",
    preferredSetLang,
    selectedVariantByCard,
    visibleLangsBySet,
    visibleLangsByCard,
    activeLangBySet,
    manualSetLangOverrides,
    manualCardLangOverrides
  };
}

function normalizeEstado3(input) {
  const raw = input && typeof input === "object" ? input : {};
  const out = createEmptyEstado3();
  out.uiPreferences = normalizeUiPreferencesV3(raw.uiPreferences);
  out.manualInventoryByCardLang = normalizeManualInventoryByCardLang(raw.manualInventoryByCardLang);

  if (raw.migrationMeta && typeof raw.migrationMeta === "object") {
    const unresolvedBuckets = Array.isArray(raw.migrationMeta.unresolvedBuckets)
      ? raw.migrationMeta.unresolvedBuckets
          .filter(item => item && typeof item === "object")
          .map(item => ({ ...item }))
      : [];

    out.migrationMeta = {
      migratedFromVersion: clampInt(Number(raw.migrationMeta.migratedFromVersion ?? 0), 0, 999),
      migratedAt: String(raw.migrationMeta.migratedAt || "").trim(),
      unresolvedBuckets,
      sourceStateKeys: clampInt(Number(raw.migrationMeta.sourceStateKeys ?? 0), 0, 999999)
    };
  }

  for (const [printIdRaw, entryRaw] of Object.entries(raw.inventoryByPrintId || {})) {
    const printId = String(printIdRaw || "").trim();
    if (!printId) continue;
    const entry = normalizeInventoryEntryV3(entryRaw);
    if (isEmptyInventoryEntryV3(entry)) continue;
    out.inventoryByPrintId[printId] = entry;
  }

  return out;
}

function cargarEstado3() {
  const raw3 = safeLocalStorageGet(LS_KEY_V3);
  if (!raw3) {
    estado3 = createEmptyEstado3();
    return;
  }

  try {
    estado3 = normalizeEstado3(JSON.parse(raw3) || {});
  } catch (e) {
    console.warn("Estado v3 corrupto en localStorage, se reinicia:", e);
    estado3 = createEmptyEstado3();
  }
}

function isValidEstado3PayloadMinimo(value) {
  return !!value
    && value.version === 3
    && value.inventoryByPrintId && typeof value.inventoryByPrintId === "object"
    && value.manualInventoryByCardLang && typeof value.manualInventoryByCardLang === "object"
    && value.uiPreferences && typeof value.uiPreferences === "object";
}

function buildEstado3Snapshot(estado3Value, options = {}) {
  const normalizedEstado3 = normalizeEstado3(estado3Value);
  if (!isValidEstado3PayloadMinimo(normalizedEstado3)) return null;

  return {
    schemaVersion: 3,
    snapshotVersion: 1,
    savedAt: new Date().toISOString(),
    source: String(options.source || "pre-main-write").trim() || "pre-main-write",
    inventoryEntries: Object.keys(normalizedEstado3.inventoryByPrintId || {}).length,
    manualInventoryEntries: Object.keys(normalizedEstado3.manualInventoryByCardLang || {}).length,
    uiPreferenceSets: Object.keys(normalizedEstado3.uiPreferences?.preferredSetLang || {}).length,
    estado3: normalizedEstado3
  };
}

function validarEstado3Snapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (Number(snapshot.schemaVersion) !== 3) return false;
  if (!snapshot.savedAt || Number.isNaN(Date.parse(snapshot.savedAt))) return false;
  return isValidEstado3PayloadMinimo(snapshot.estado3);
}

function cargarEstado3SnapshotPrev() {
  const raw = safeLocalStorageGet(LS_KEY_V3_SNAPSHOT_PREV);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return validarEstado3Snapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cargarEstado3SnapshotMeta() {
  const raw = safeLocalStorageGet(LS_KEY_V3_SNAPSHOT_META);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function guardarEstado3SnapshotMeta(meta = {}) {
  const currentMeta = cargarEstado3SnapshotMeta() || {};
  const payload = {
    lastSnapshotAt: meta.lastSnapshotAt ?? currentMeta.lastSnapshotAt ?? null,
    lastSnapshotReason: String(meta.lastSnapshotReason ?? currentMeta.lastSnapshotReason ?? "unknown").trim() || "unknown",
    lastRestoreAt: meta.lastRestoreAt ?? currentMeta.lastRestoreAt ?? null,
    lastRestoreSource: meta.lastRestoreSource ?? currentMeta.lastRestoreSource ?? null
  };
  return safeLocalStorageSet(LS_KEY_V3_SNAPSHOT_META, JSON.stringify(payload));
}

function guardarEstado3SnapshotPrev(snapshot, options = {}) {
  if (!validarEstado3Snapshot(snapshot)) {
    return createStorageFailureResult({
      operation: "storage-set",
      key: LS_KEY_V3_SNAPSHOT_PREV,
      reason: "storage-invalid-state",
      details: { reason: options.reason || "snapshot-write" }
    });
  }

  let json;
  try {
    json = JSON.stringify(snapshot);
  } catch (error) {
    return createStorageFailureResult({
      operation: "storage-set",
      key: LS_KEY_V3_SNAPSHOT_PREV,
      reason: "storage-serialize-failed",
      error,
      details: { reason: options.reason || "snapshot-write" }
    });
  }

  const bytes = getApproxStorageBytes(json);

  try {
    localStorage.setItem(LS_KEY_V3_SNAPSHOT_PREV, json);
  } catch (error) {
    return createStorageFailureResult({
      operation: "storage-set",
      key: LS_KEY_V3_SNAPSHOT_PREV,
      reason: classifyStorageError(error),
      error,
      bytes,
      details: { reason: options.reason || "snapshot-write" }
    });
  }

  guardarEstado3SnapshotMeta({
    lastSnapshotAt: snapshot.savedAt,
    lastSnapshotReason: options.reason || "snapshot-write"
  });

  return createStorageSuccessResult({
    operation: "storage-set",
    key: LS_KEY_V3_SNAPSHOT_PREV,
    wroteSnapshot: true,
    bytes,
    details: { reason: options.reason || "snapshot-write" }
  });
}

function restaurarEstado3DesdeSnapshotPrev(options = {}) {
  const {
    markDirty = false,
    reason = "snapshot-restore",
    snapshot = null
  } = options;

  const sourceSnapshot = snapshot || cargarEstado3SnapshotPrev();
  if (!sourceSnapshot) {
    return createStorageFailureResult({
      operation: "storage-restore",
      key: LS_KEY_V3,
      reason: "storage-snapshot-missing",
      details: { reason }
    });
  }

  if (!validarEstado3Snapshot(sourceSnapshot)) {
    return createStorageFailureResult({
      operation: "storage-restore",
      key: LS_KEY_V3,
      reason: "storage-snapshot-invalid",
      details: {
        reason,
        snapshotSource: sourceSnapshot.source || null,
        snapshotSavedAt: sourceSnapshot.savedAt || null
      }
    });
  }

  let restoredEstado3;
  try {
    restoredEstado3 = normalizeEstado3(sourceSnapshot.estado3);
    restoredEstado3.uiPreferences = enforceUiPreferencesIntegrityV3(restoredEstado3.uiPreferences);
  } catch (error) {
    return createStorageFailureResult({
      operation: "storage-restore",
      key: LS_KEY_V3,
      reason: "storage-invalid-state",
      error,
      details: {
        reason,
        snapshotSource: sourceSnapshot.source || null,
        snapshotSavedAt: sourceSnapshot.savedAt || null
      }
    });
  }

  if (!isValidEstado3PayloadMinimo(restoredEstado3)) {
    return createStorageFailureResult({
      operation: "storage-restore",
      key: LS_KEY_V3,
      reason: "storage-invalid-state",
      details: {
        reason,
        snapshotSource: sourceSnapshot.source || null,
        snapshotSavedAt: sourceSnapshot.savedAt || null
      }
    });
  }

  let json;
  try {
    json = JSON.stringify(restoredEstado3);
  } catch (error) {
    return createStorageFailureResult({
      operation: "storage-restore",
      key: LS_KEY_V3,
      reason: "storage-serialize-failed",
      error,
      details: {
        reason,
        snapshotSource: sourceSnapshot.source || null,
        snapshotSavedAt: sourceSnapshot.savedAt || null
      }
    });
  }

  const bytes = getApproxStorageBytes(json);

  try {
    localStorage.setItem(LS_KEY_V3, json);
  } catch (error) {
    return createStorageFailureResult({
      operation: "storage-restore",
      key: LS_KEY_V3,
      reason: classifyStorageError(error),
      error,
      bytes,
      details: {
        reason,
        snapshotSource: sourceSnapshot.source || null,
        snapshotSavedAt: sourceSnapshot.savedAt || null
      }
    });
  }

  estado3 = restoredEstado3;

  guardarEstado3SnapshotMeta({
    lastRestoreAt: new Date().toISOString(),
    lastRestoreSource: sourceSnapshot.source || "snapshot-prev"
  });

  if (markDirty) {
    markLocalDirty(reason);
  }

  return createStorageSuccessResult({
    operation: "storage-restore",
    key: LS_KEY_V3,
    wroteMainState: true,
    bytes,
    details: {
      reason,
      snapshotSource: sourceSnapshot.source || null,
      snapshotSavedAt: sourceSnapshot.savedAt || null,
      restoredFromSnapshot: true
    }
  });
}

function guardarEstado3Seguro(options = {}) {
  const {
    markDirty = true,
    reason = "estado3-write",
    persistSnapshot = true
  } = options;

  let normalizedEstado3;
  try {
    normalizedEstado3 = normalizeEstado3(estado3);
    normalizedEstado3.uiPreferences = enforceUiPreferencesIntegrityV3(normalizedEstado3.uiPreferences);
  } catch (error) {
    return createStorageFailureResult({
      operation: "storage-set",
      key: LS_KEY_V3,
      reason: "storage-invalid-state",
      error,
      details: { reason }
    });
  }

  if (!isValidEstado3PayloadMinimo(normalizedEstado3)) {
    return createStorageFailureResult({
      operation: "storage-set",
      key: LS_KEY_V3,
      reason: "storage-invalid-state",
      details: { reason }
    });
  }

  let json;
  try {
    json = JSON.stringify(normalizedEstado3);
  } catch (error) {
    return createStorageFailureResult({
      operation: "storage-set",
      key: LS_KEY_V3,
      reason: "storage-serialize-failed",
      error,
      details: { reason }
    });
  }

  const bytes = getApproxStorageBytes(json);
  let wroteSnapshot = false;

  if (persistSnapshot) {
    const currentSnapshotSource = cargarEstado3SnapshotPrev();
    let currentRawEstado3 = safeLocalStorageGet(LS_KEY_V3);
    if (currentRawEstado3) {
      try {
        const currentParsedEstado3 = JSON.parse(currentRawEstado3);
        const snapshot = buildEstado3Snapshot(currentParsedEstado3, { source: "pre-main-write" });
        if (snapshot) {
          const snapshotResult = guardarEstado3SnapshotPrev(snapshot, { reason });
          wroteSnapshot = !!snapshotResult.ok;
        }
      } catch {
        wroteSnapshot = false;
      }
    } else if (currentSnapshotSource) {
      wroteSnapshot = true;
    }
  }

  try {
    localStorage.setItem(LS_KEY_V3, json);
  } catch (error) {
    return createStorageFailureResult({
      operation: "storage-set",
      key: LS_KEY_V3,
      reason: classifyStorageError(error),
      error,
      wroteSnapshot,
      bytes,
      details: { reason }
    });
  }

  estado3 = normalizedEstado3;
  if (markDirty && typeof sbMarkDirty === "function") sbMarkDirty();

  return createStorageSuccessResult({
    operation: "storage-set",
    key: LS_KEY_V3,
    wroteMainState: true,
    wroteSnapshot,
    bytes,
    details: { reason }
  });
}

function guardarEstado3() {
  return guardarEstado3Seguro({
    markDirty: true,
    reason: "estado3-write"
  });
}

function createBootStateHealth(partial = {}) {
  return {
    ok: partial.ok !== undefined ? !!partial.ok : true,
    bootMode: String(partial.bootMode || "normal").trim() || "normal",
    source: String(partial.source || "estado3").trim() || "estado3",
    recovered: !!partial.recovered,
    degradedBlocks: Array.isArray(partial.degradedBlocks) ? partial.degradedBlocks.slice() : [],
    notices: Array.isArray(partial.notices) ? partial.notices.slice() : [],
    error: partial.error || null
  };
}

function syncBootRecoverySessionFlag(health = bootStateHealth) {
  bootRecoveryPendingConfirmation = !!(health && health.bootMode === "recovered-local");
}

function getBootStateHealthNotice(health = bootStateHealth) {
  if (!health || typeof health !== "object") return null;

  if (health.bootMode === "recovered-local" && bootRecoveryPendingConfirmation) {
    return {
      level: "info",
      message: "Se ha recuperado la coleccion desde una copia local reciente."
    };
  }

  if (health.bootMode === "degraded") {
    if (health.source === "estado2-partial") {
      return {
        level: "warning",
        message: "Arranque degradado: se ha usado compatibilidad parcial desde estado2."
      };
    }

    return {
      level: "warning",
      message: "Arranque degradado: no se encontro un inventario local v3 totalmente recuperable."
    };
  }

  return null;
}

function applyBootStateHealth(health = bootStateHealth) {
  const notice = getBootStateHealthNotice(health);
  if (!notice) return false;
  uiSetSyncStatus(notice.message, { tone: notice.level });
  return true;
}

function hasUsableEstado2ForBoot(value = estado2) {
  return !!value && typeof value === "object" && Object.keys(value).length > 0;
}

function cargarEstado3ConSalud() {
  const raw3 = safeLocalStorageGet(LS_KEY_V3);
  if (!raw3) {
    estado3 = createEmptyEstado3();
    return createBootStateHealth({
      ok: false,
      bootMode: "degraded",
      source: "empty-default",
      degradedBlocks: ["estado3"],
      notices: [{
        level: "warning",
        code: "estado3-missing",
        message: "No se encontro inventario v3 local; se usara arranque degradado."
      }]
    });
  }

  try {
    const parsed = JSON.parse(raw3);
    const normalized = normalizeEstado3(parsed || {});
    normalized.uiPreferences = enforceUiPreferencesIntegrityV3(normalized.uiPreferences);

    if (!isValidEstado3PayloadMinimo(normalized)) {
      throw new Error("estado3-invalid-min-structure");
    }

    estado3 = normalized;
    return createBootStateHealth({
      ok: true,
      bootMode: "normal",
      source: "estado3"
    });
  } catch (error) {
    const restoreResult = restaurarEstado3DesdeSnapshotPrev({
      markDirty: false,
      reason: "boot-recovery"
    });

    if (restoreResult.ok) {
      return createBootStateHealth({
        ok: true,
        bootMode: "recovered-local",
        source: "snapshot-prev",
        recovered: true,
        notices: [{
          level: "info",
          code: "snapshot-restored",
          message: "Se ha recuperado la coleccion desde una copia local reciente."
        }]
      });
    }

    estado3 = createEmptyEstado3();
    return createBootStateHealth({
      ok: false,
      bootMode: "degraded",
      source: "empty-default",
      degradedBlocks: ["estado3"],
      notices: [{
        level: "warning",
        code: "estado3-unavailable",
        message: "El inventario v3 local no era usable y no se pudo restaurar desde snapshot."
      }],
      error
    });
  }
}

function cargarPersistenciaSecundariaConSalud() {
  const degradedBlocks = [];

  try {
    cargarEstado2();
  } catch (error) {
    estado2 = {};
    degradedBlocks.push("estado2");
    if (DEBUG) console.warn("Error cargando estado2 en arranque:", error);
  }

  try {
    cargarEstado();
  } catch (error) {
    estado = {};
    degradedBlocks.push("estado");
    if (DEBUG) console.warn("Error cargando estado legacy en arranque:", error);
  }

  try {
    cargarUILangByOracle();
  } catch (error) {
    degradedBlocks.push("uiLangByOracle");
    if (DEBUG) console.warn("Error cargando preferencias UI por carta:", error);
  }

  try {
    cargarProgresoPorSet();
    cargarProgresoPorSetMeta();
  } catch (error) {
    degradedBlocks.push("setProgress");
    if (DEBUG) console.warn("Error cargando progreso por set:", error);
  }

  try {
    cargarCardControlsConfig();
  } catch (error) {
    degradedBlocks.push("cardControls");
    if (DEBUG) console.warn("Error cargando configuracion de controles:", error);
  }

  try {
    cargarFiltrosColecciones();
  } catch (error) {
    degradedBlocks.push("collectionFilters");
    if (DEBUG) console.warn("Error cargando filtros de colecciones:", error);
  }

  try {
    cargarHiddenEmptySets();
  } catch (error) {
    degradedBlocks.push("hiddenEmptySets");
    if (DEBUG) console.warn("Error cargando sets ocultos vacios:", error);
  }

  try {
    cargarHiddenCollections();
  } catch (error) {
    degradedBlocks.push("hiddenCollections");
    if (DEBUG) console.warn("Error cargando colecciones ocultas:", error);
  }

  try {
    cargarStatsSnapshot();
  } catch (error) {
    statsSnapshot = null;
    degradedBlocks.push("statsSnapshot");
    if (DEBUG) console.warn("Error cargando snapshot de estadisticas:", error);
  }

  try {
    cargarDecks();
  } catch (error) {
    degradedBlocks.push("decks");
    if (DEBUG) console.warn("Error cargando mazos:", error);
  }

  scheduleStatsSnapshotUpdate({ renderIfVisible: false });

  return createBootStateHealth({
    ok: degradedBlocks.length === 0,
    bootMode: degradedBlocks.length === 0 ? "normal" : "degraded",
    source: "secondary-persistence",
    degradedBlocks
  });
}

function bootLoadPersistentState() {
  const coreHealth = cargarEstado3ConSalud();
  const secondaryHealth = cargarPersistenciaSecundariaConSalud();

  if (coreHealth.bootMode === "degraded" && hasUsableEstado2ForBoot()) {
    coreHealth.source = "estado2-partial";
    coreHealth.notices = coreHealth.notices.concat({
      level: "warning",
      code: "estado2-partial-available",
      message: "Se ha encontrado soporte de compatibilidad desde estado2 para un arranque degradado."
    });
  }

  return createBootStateHealth({
    ok: coreHealth.ok,
    bootMode: coreHealth.bootMode,
    source: coreHealth.source,
    recovered: coreHealth.recovered,
    degradedBlocks: [...new Set([...(coreHealth.degradedBlocks || []), ...(secondaryHealth.degradedBlocks || [])])],
    notices: [...(coreHealth.notices || []), ...(secondaryHealth.notices || [])],
    error: coreHealth.error || secondaryHealth.error || null
  });
}

function guardarEstado3BackupDesdeV2(sourceEstado2 = estado2) {
  safeLocalStorageSet(LS_KEY_V3_BACKUP_V2, JSON.stringify(sourceEstado2 || {}));
}

function parseSetKeyParts(setKey) {
  const raw = String(setKey || "").trim().toLowerCase();
  if (!raw) return { code: "", lang: "en" };
  const [codePart, langPart] = raw.split("__");
  return {
    code: String(codePart || "").trim().toLowerCase(),
    lang: String(langPart || "en").trim().toLowerCase() || "en"
  };
}

function normalizeCollectorNumberKey(value) {
  return String(value || "").trim().toLowerCase();
}

function pushUniqueValue(target, key, value) {
  if (!key || !value) return;
  if (!target[key]) target[key] = [];
  if (!target[key].includes(value)) target[key].push(value);
}

function compareCatalogPrintIds(leftId, rightId) {
  const left = catalogPrintMetaById[leftId];
  const right = catalogPrintMetaById[rightId];
  if (!left || !right) return String(leftId).localeCompare(String(rightId), "en", { sensitivity: "base" });

  const dateCompare = String(left.releasedAt || "").localeCompare(String(right.releasedAt || ""), "en", { sensitivity: "base" });
  if (dateCompare !== 0) return dateCompare;

  const setCompare = String(left.setCode || "").localeCompare(String(right.setCode || ""), "en", { sensitivity: "base" });
  if (setCompare !== 0) return setCompare;

  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const collectorCompare = collator.compare(String(left.collectorNumber || ""), String(right.collectorNumber || ""));
  if (collectorCompare !== 0) return collectorCompare;

  return String(left.printId || leftId).localeCompare(String(right.printId || rightId), "en", { sensitivity: "base" });
}

function extractCatalogPrintMeta(card, setKeyFallback = "") {
  if (!card || !card.id) return null;

  const printId = String(card.id || "").trim();
  const oracleId = String(card.oracle_id || oracleIdCache[printId]?.oracle_id || "").trim();
  if (!printId || !oracleId) return null;

  const setKey = String(card.setKey || setKeyFallback || "").trim().toLowerCase();
  const parsedSetKey = parseSetKeyParts(setKey);
  const setCode = String(card.setCode || card.set || card._raw?.set || parsedSetKey.code || "").trim().toLowerCase();
  const lang = String(card.lang || parsedSetKey.lang || oracleIdCache[printId]?.lang || card._raw?.lang || "en").trim().toLowerCase() || "en";
  const collectorNumber = String(card.collector_number || card.collectorNumber || card.numero || card._raw?.collector_number || "").trim();

  return {
    printId,
    oracleId,
    setCode,
    setKey: setKey || (setCode ? `${setCode}__${lang}` : ""),
    collectorNumber,
    lang,
    name: String(card.nombre || card.name || card._raw?.name || "").trim(),
    nameEn: String(card.nameEn || card._raw?.printed_name || card._raw?.name || card.nombre || "").trim(),
    imageUrl: card._img || card.imageUrl || card._raw?.image_uris?.normal || card._raw?.card_faces?.[0]?.image_uris?.normal || null,
    releasedAt: String(card.releasedAt || card._raw?.released_at || "").trim(),
    setName: String(card.set_name || card._raw?.set_name || "").trim()
  };
}

function rebuildCatalogIndexesV3() {
  catalogPrintMetaById = {};
  catalogPrintsByOracleId = {};
  catalogPrintsBySetCode = {};
  catalogVariantPrintsBySetCard = {};
  catalogPrintsByOracleIdAndLang = {};
  catalogPrintsBySetCollectorLang = {};
  catalogPrintsByOracleSetCollectorLang = {};
  canonicalPrintByOracleLang = {};

  for (const [setKey, cartas] of Object.entries(cacheCartasPorSetLang || {})) {
    if (!Array.isArray(cartas)) continue;

    for (const carta of cartas) {
      const meta = extractCatalogPrintMeta(carta, setKey);
      if (!meta) continue;

      catalogPrintMetaById[meta.printId] = meta;
      pushUniqueValue(catalogPrintsByOracleId, meta.oracleId, meta.printId);
      pushUniqueValue(catalogPrintsBySetCode, meta.setCode, meta.printId);
      pushUniqueValue(catalogVariantPrintsBySetCard, `${meta.setCode}::${meta.oracleId}::${normalizeCollectorNumberKey(meta.collectorNumber)}`, meta.printId);
      pushUniqueValue(catalogPrintsByOracleIdAndLang, `${meta.oracleId}::${meta.lang}`, meta.printId);
      pushUniqueValue(catalogPrintsBySetCollectorLang, `${meta.setCode}::${normalizeCollectorNumberKey(meta.collectorNumber)}::${meta.lang}`, meta.printId);
      pushUniqueValue(catalogPrintsByOracleSetCollectorLang, `${meta.oracleId}::${meta.setCode}::${normalizeCollectorNumberKey(meta.collectorNumber)}::${meta.lang}`, meta.printId);

      if (!oracleIdCache[meta.printId]) {
        oracleIdCache[meta.printId] = { oracle_id: meta.oracleId, lang: meta.lang };
      }
    }
  }

  oracleToIds = {};
  for (const [key, printIds] of Object.entries(catalogPrintsByOracleIdAndLang)) {
    const sorted = [...printIds].sort(compareCatalogPrintIds);
    if (sorted.length === 0) continue;
    canonicalPrintByOracleLang[key] = sorted[0];

    const [oracleId, lang] = key.split("::");
    if (!oracleToIds[oracleId]) oracleToIds[oracleId] = {};
    if (lang === "en" || lang === "es") {
      oracleToIds[oracleId][lang] = sorted[0];
    }
  }
}

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

function getEstadoCartaCompatV3(estadoKey, fallbackSt2 = null) {
  const empty = { qty_en: 0, qty_es: 0, foil_en: 0, foil_es: 0, ri_en: false, ri_es: false, counters_en: {}, counters_es: {}, tags_en: {}, tags_es: {} };
  const safeKey = String(estadoKey || "").trim();
  if (!safeKey) return fallbackSt2 ? normalizarEstadoCarta2(fallbackSt2) : empty;

  const base = fallbackSt2 ? normalizarEstadoCarta2(fallbackSt2) : getEstadoCarta2(safeKey);
  if (!hasEstado3InventoryData() && !hasEstado3ManualInventoryData()) return base;

  const next = { ...base };
  const selectionKey = deriveStableSelectionKeyFromEstadoKey(safeKey);
  const hasMirror = hasResolvedInventoryMirrorV3ForEstadoKey(safeKey, base) || hasManualInventoryMirrorV3ForEstadoKey(safeKey);

  for (const lang of ["en", "es"]) {
    const target = resolveInventoryTargetPrintV3(safeKey, lang);
    let entry = normalizeInventoryEntryV3({});
    if (target.printId) {
      entry = getInventoryEntryV3(target.printId);
    } else if (selectionKey) {
      entry = getManualInventoryEntryBySelectionKey(selectionKey, lang);
    }

    if (!target.printId && selectionKey && isEmptyInventoryEntryV3(entry)) {
      continue;
    }

    if (isEmptyInventoryEntryV3(entry) && !hasMirror) continue;

    if (lang === "en") {
      next.qty_en = Number(entry.qty || 0);
      next.foil_en = Number(entry.foil || 0);
      next.ri_en = !!entry.ri;
      next.counters_en = normalizeCounterMap(entry.counters);
      next.tags_en = normalizeTagMap(entry.tags);
    } else {
      next.qty_es = Number(entry.qty || 0);
      next.foil_es = Number(entry.foil || 0);
      next.ri_es = !!entry.ri;
      next.counters_es = normalizeCounterMap(entry.counters);
      next.tags_es = normalizeTagMap(entry.tags);
    }
  }

  return normalizarEstadoCarta2(next);
}

function normalizeLegacyPossessionLang(lang, fallback = "en") {
  const safeLang = normalizeLanguagePreferenceCode(lang, fallback) || fallback || "en";
  return safeLang === "es" ? "es" : "en";
}

function createEmptyLegacyPossessionLangEntry() {
  return {
    qty: 0,
    foil: 0,
    ri: false,
    counters: {},
    tags: {}
  };
}

function getLegacyPossessionLangEntry(st2, lang) {
  const normalized = normalizarEstadoCarta2(st2);
  const safeLang = normalizeLegacyPossessionLang(lang);
  if (safeLang === "es") {
    return {
      qty: Number(normalized.qty_es || 0),
      foil: Number(normalized.foil_es || 0),
      ri: !!normalized.ri_es,
      counters: normalizeCounterMap(normalized.counters_es),
      tags: normalizeTagMap(normalized.tags_es)
    };
  }

  return {
    qty: Number(normalized.qty_en || 0),
    foil: Number(normalized.foil_en || 0),
    ri: !!normalized.ri_en,
    counters: normalizeCounterMap(normalized.counters_en),
    tags: normalizeTagMap(normalized.tags_en)
  };
}

function buildLegacyPossessionAdapter(st2) {
  const normalized = normalizarEstadoCarta2(st2);
  const langs = {
    en: getLegacyPossessionLangEntry(normalized, "en"),
    es: getLegacyPossessionLangEntry(normalized, "es")
  };

  return {
    raw: normalized,
    langs,
    totals: {
      qty: langs.en.qty + langs.es.qty,
      foil: langs.en.foil + langs.es.foil,
      ri: langs.en.ri || langs.es.ri
    }
  };
}

function getLegacyPossessionAdapterForState(estadoKey, fallbackSt2 = null) {
  const safeKey = String(estadoKey || "").trim();
  if (!safeKey) {
    return buildLegacyPossessionAdapter(fallbackSt2 || {});
  }
  return buildLegacyPossessionAdapter(getEstadoCartaCompatV3(safeKey, fallbackSt2));
}

function buildInventoryEntryV3FromEstado2Lang(st2, lang, updatedAt = Date.now()) {
  const safeLang = normalizeLegacyPossessionLang(lang);
  const langEntry = getLegacyPossessionLangEntry(st2, safeLang);
  return normalizeInventoryEntryV3({
    qty: langEntry.qty,
    foil: langEntry.foil,
    ri: langEntry.ri,
    counters: langEntry.counters,
    tags: langEntry.tags,
    updatedAt
  });
}

function resolveInventoryTargetPrintV3(estadoKey, lang) {
  const safeKey = String(estadoKey || "").trim();
  const safeLang = normalizePhase1ManualLangCode(lang, "en") || "en";
  if (!safeKey) return { printId: "", reason: "empty-state-key" };

  const meta = getCatalogPrintMetaForIntegrity(safeKey);
  if (meta) {
    if (meta.lang === safeLang) {
      return { printId: meta.printId, reason: "direct-print-match" };
    }

    const siblingKey = `${meta.oracleId}::${meta.setCode}::${normalizeCollectorNumberKey(meta.collectorNumber)}::${safeLang}`;
    const siblingCandidates = [...(catalogPrintsByOracleSetCollectorLang[siblingKey] || [])].sort(compareCatalogPrintIds);
    if (siblingCandidates.length > 0) {
      return { printId: siblingCandidates[0], reason: "same-set-same-collector-sibling-lang" };
    }

    // Do not collapse a concrete visible print into the oracle-level canonical
    // print for another collector number or set. That merges distinct basic-land
    // arts/variants into a shared quantity bucket and produces multi-step jumps.
    return { printId: "", reason: "missing-language-variant" };
  }

  const cached = oracleIdCache[safeKey];
  if (cached?.oracle_id) {
    if (cached.lang === safeLang) {
      return { printId: safeKey, reason: "cached-print-match" };
    }

    // Cached print ids have the same ambiguity as catalog meta entries: if the
    // sibling language does not exist for this exact visible variant, keep the
    // quantity in the manual per-selection bucket instead of reusing a global
    // oracle-level print.
    return { printId: "", reason: "missing-language-variant" };
  }

  const canonical = canonicalPrintByOracleLang[`${safeKey}::${safeLang}`];
  if (canonical) {
    return { printId: canonical, reason: "oracle-level-legacy-fallback" };
  }

  return { printId: "", reason: "missing-language-variant" };
}

function buildDesiredInventoryEntriesFromEstado2Key(estadoKey, st2, updatedAt = Date.now()) {
  const desiredEntries = {};
  const desiredManualEntriesBySelectionKey = {};
  const unresolvedBuckets = [];
  const selectionKey = deriveStableSelectionKeyFromEstadoKey(estadoKey);

  for (const lang of ["en", "es"]) {
    const entry = buildInventoryEntryV3FromEstado2Lang(st2, lang, updatedAt);
    if (isEmptyInventoryEntryV3(entry)) continue;

    const target = resolveInventoryTargetPrintV3(estadoKey, lang);
    if (!target.printId) {
      if (selectionKey) {
        const parsed = parseVisibleVariantSelectionKey(selectionKey);
        if (isManualLangAllowedForCard(parsed.setCode, parsed.oracleId, parsed.collectorNumber, lang)) {
          if (!desiredManualEntriesBySelectionKey[selectionKey]) desiredManualEntriesBySelectionKey[selectionKey] = {};
          desiredManualEntriesBySelectionKey[selectionKey][lang] = normalizeInventoryEntryV3(entry);
          continue;
        }
      }

      unresolvedBuckets.push({
        stateKey: String(estadoKey || "").trim(),
        sourceLang: lang,
        reason: target.reason,
        entry
      });
      continue;
    }

    if (desiredEntries[target.printId]) {
      desiredEntries[target.printId] = mergeInventoryEntriesV3(desiredEntries[target.printId], entry, updatedAt);
    } else {
      desiredEntries[target.printId] = normalizeInventoryEntryV3(entry);
    }
  }

  return { desiredEntries, desiredManualEntriesBySelectionKey, unresolvedBuckets };
}

function getRelatedSelectionKeysForEstadoKeyV3(estadoKey) {
  const key = deriveStableSelectionKeyFromEstadoKey(estadoKey);
  return key ? new Set([key]) : new Set();
}

function getRelatedPrintIdsForEstadoKeyV3(estadoKey) {
  const related = new Set();
  const safeKey = String(estadoKey || "").trim();
  if (!safeKey) return related;

  const meta = getCatalogPrintMetaForIntegrity(safeKey);
  if (meta) {
    related.add(meta.printId);
    if (meta.oracleId) {
      const canonicalEn = canonicalPrintByOracleLang[`${meta.oracleId}::en`];
      const canonicalEs = canonicalPrintByOracleLang[`${meta.oracleId}::es`];
      if (canonicalEn) related.add(canonicalEn);
      if (canonicalEs) related.add(canonicalEs);
    }

    const variantKey = `${meta.setCode}::${meta.oracleId}::${normalizeCollectorNumberKey(meta.collectorNumber)}`;
    for (const printId of catalogVariantPrintsBySetCard[variantKey] || []) {
      related.add(printId);
    }

    return related;
  }

  const cached = oracleIdCache[safeKey];
  const oracleId = String(cached?.oracle_id || safeKey).trim();
  const canonicalEn = canonicalPrintByOracleLang[`${oracleId}::en`];
  const canonicalEs = canonicalPrintByOracleLang[`${oracleId}::es`];
  if (cached) related.add(safeKey);
  if (canonicalEn) related.add(canonicalEn);
  if (canonicalEs) related.add(canonicalEs);
  return related;
}

function rebuildEstado3FromEstado2({ persist = true } = {}) {
  const stateKeys = Object.keys(estado2 || {});
  if (stateKeys.length === 0) return false;

  const migratedAt = new Date().toISOString();
  const updatedAt = Date.now();
  const next = createEmptyEstado3();
  next.uiPreferences = enforceUiPreferencesIntegrityV3(estado3?.uiPreferences);

  const unresolvedBuckets = [];
  for (const estadoKey of stateKeys) {
    const st2 = getEstadoCarta2(estadoKey);
    const { desiredEntries, desiredManualEntriesBySelectionKey, unresolvedBuckets: unresolvedForKey } = buildDesiredInventoryEntriesFromEstado2Key(estadoKey, st2, updatedAt);
    unresolvedBuckets.push(...unresolvedForKey);

    for (const [printId, entry] of Object.entries(desiredEntries)) {
      next.inventoryByPrintId[printId] = next.inventoryByPrintId[printId]
        ? mergeInventoryEntriesV3(next.inventoryByPrintId[printId], entry, updatedAt)
        : normalizeInventoryEntryV3(entry);
    }

    for (const [selectionKey, entryByLang] of Object.entries(desiredManualEntriesBySelectionKey)) {
      const normalized = normalizeManualInventoryLangMap(entryByLang);
      if (Object.keys(normalized).length === 0) continue;
      next.manualInventoryByCardLang[selectionKey] = normalized;
    }
  }

  next.migrationMeta = {
    migratedFromVersion: 2,
    migratedAt,
    unresolvedBuckets,
    sourceStateKeys: stateKeys.length
  };

  estado3 = next;
  if (persist) {
    guardarEstado3BackupDesdeV2();
    guardarEstado3();
  }
  return true;
}

function syncEstado3FromEstado2Key(estadoKey, { persist = true } = {}) {
  const safeKey = String(estadoKey || "").trim();
  if (!safeKey) return false;

  // During v2/v3 coexistence, rebuilding the canonical inventory from the full
  // compatibility state is safer than incrementally replacing all related
  // variants for a single visible print. Incremental replacement can wipe the
  // sibling EN/ES print when the user edits the same card from the other
  // visible variant.
  return rebuildEstado3FromEstado2({ persist });
}

function hasResolvedInventoryMirrorV3ForEstadoKey(estadoKey, st2 = null) {
  const safeKey = String(estadoKey || "").trim();
  if (!safeKey) return false;
  const source = st2 || getEstadoCarta2(safeKey);
  const { desiredEntries, desiredManualEntriesBySelectionKey } = buildDesiredInventoryEntriesFromEstado2Key(safeKey, source, Date.now());
  return Object.keys(desiredEntries).length > 0 || Object.keys(desiredManualEntriesBySelectionKey).length > 0;
}

function hasManualInventoryMirrorV3ForEstadoKey(estadoKey) {
  const selectionKey = deriveStableSelectionKeyFromEstadoKey(estadoKey);
  if (!selectionKey) return false;
  return Object.keys(getManualInventoryLangMapBySelectionKey(selectionKey)).length > 0;
}

function getCoexistingTotalQtyForEstadoKey(estadoKey) {
  const safeKey = String(estadoKey || "").trim();
  if (!safeKey) return 0;

  const st2 = getEstadoCarta2(safeKey);
  if (!hasEstado3InventoryData()) {
    return getTotalQtyEstado2(st2);
  }

  const { desiredEntries } = buildDesiredInventoryEntriesFromEstado2Key(safeKey, st2, Date.now());
  const targetPrintIds = Object.keys(desiredEntries);
  if (targetPrintIds.length === 0) {
    return getTotalQtyEstado2(st2);
  }

  let total = 0;
  for (const printId of targetPrintIds) {
    total += getInventoryQtyV3(printId);
  }
  return total;
}

function commitEstado2Write(estadoKey, { refreshProgress = false } = {}) {
  syncEstado3FromEstado2Key(estadoKey, { persist: true });
  guardarEstado2();
  sbMarkDirty();
  if (refreshProgress) actualizarProgresoSetActualSiSePuede();
  scheduleStatsSnapshotUpdate({ renderIfVisible: true });
}

function setQtyLang(oracle_id, lang, value) {
  if (!oracle_id || oracle_id === 'undefined' || oracle_id === 'null') {
    console.warn('setQtyLang: oracle_id inválido', oracle_id);
    return;
  }
  
  const st = ensureEstadoCarta2(oracle_id);
  const qty = clampInt(Number(value), 0, 999);
  const safeLang = normalizeLegacyPossessionLang(lang);
  const langKey = safeLang === "es" ? "qty_es" : "qty_en";
  const foilKey = safeLang === "es" ? "foil_es" : "foil_en";
  
  st[langKey] = qty;
  
  // Ajustar foil si qty baja
  if (st[foilKey] > qty) st[foilKey] = qty;
  
  // Si qty llega a 0, limpiar foil
  if (qty === 0) st[foilKey] = 0;

  commitEstado2Write(oracle_id, { refreshProgress: true });
}

function setFoilLang(oracle_id, lang, value) {
  if (!oracle_id || oracle_id === 'undefined' || oracle_id === 'null') {
    console.warn('setFoilLang: oracle_id inválido', oracle_id);
    return;
  }
  
  const st = ensureEstadoCarta2(oracle_id);
  const safeLang = normalizeLegacyPossessionLang(lang);
  const qtyKey = safeLang === "es" ? "qty_es" : "qty_en";
  const foilKey = safeLang === "es" ? "foil_es" : "foil_en";
  
  st[foilKey] = clampInt(Number(value), 0, st[qtyKey]);
  
  commitEstado2Write(oracle_id);
}

function setRiLang(oracle_id, lang, value) {
  if (!oracle_id || oracle_id === 'undefined' || oracle_id === 'null') {
    console.warn('setRiLang: oracle_id inválido', oracle_id);
    return;
  }
  
  const st = ensureEstadoCarta2(oracle_id);
  const safeLang = normalizeLegacyPossessionLang(lang);
  const riKey = safeLang === "es" ? "ri_es" : "ri_en";
  
  st[riKey] = !!value;
  
  commitEstado2Write(oracle_id);
}

function getCounterValue(st2, lang, key) {
  const langState = buildLegacyPossessionAdapter(st2).langs[normalizeLegacyPossessionLang(lang)];
  if (key === "qty") return langState.qty;
  if (key === "foil") return langState.foil;
  const map = langState.counters || {};
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
  const safeLang = normalizeLegacyPossessionLang(lang);
  const mapKey = safeLang === "es" ? "counters_es" : "counters_en";
  if (!st[mapKey] || typeof st[mapKey] !== "object") st[mapKey] = {};
  st[mapKey][key] = clampInt(Number(value ?? 0), 0, 999);

  commitEstado2Write(oracle_id);
}

function getTagValue(st2, lang, key) {
  const langState = buildLegacyPossessionAdapter(st2).langs[normalizeLegacyPossessionLang(lang)];
  if (key === "ri") return !!langState.ri;
  const map = langState.tags || {};
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
  const safeLang = normalizeLegacyPossessionLang(lang);
  const mapKey = safeLang === "es" ? "tags_es" : "tags_en";
  if (!st[mapKey] || typeof st[mapKey] !== "object") st[mapKey] = {};
  st[mapKey][key] = !!value;

  commitEstado2Write(oracle_id);
}

function getPreferredLangForEstadoKey(estadoKey, fallback = "en") {
  const cfg = getCardControlsConfig();
  if (cfg.langMode === "en" || cfg.langMode === "es") return cfg.langMode;

  const key = String(estadoKey || "").trim();
  if (!key) return fallback === "es" ? "es" : "en";

  const meta = getCatalogPrintMetaForIntegrity(key);
  if (meta?.setCode) {
    return normalizeLegacyPossessionLang(
      getActiveVisibleLang(meta.setCode, meta.oracleId || "", meta.collectorNumber || "", fallback),
      fallback
    );
  }

  const oracleId = uiLangByOracle[key]
    ? key
    : (oracleIdCache[key]?.oracle_id || "");

  if (oracleId) return getUILang(oracleId);
  return fallback === "es" ? "es" : "en";
}

function adjustTotalQty(estadoKey, delta, preferredLang = "en") {
  const d = Math.trunc(Number(delta) || 0);
  if (!estadoKey || d === 0) return;

  const prefLang = normalizeLegacyPossessionLang(preferredLang);
  const otherLang = prefLang === "en" ? "es" : "en";

  if (d > 0) {
    const adapter = getLegacyPossessionAdapterForState(estadoKey);
    const prefQty = adapter.langs[prefLang].qty;
    setQtyLang(estadoKey, prefLang, prefQty + d);
    return;
  }

  let remaining = -d;
  while (remaining > 0) {
    const adapter = getLegacyPossessionAdapterForState(estadoKey);
    const prefQty = adapter.langs[prefLang].qty;
    const otherQty = adapter.langs[otherLang].qty;

    if (prefQty > 0) {
      setQtyLang(estadoKey, prefLang, prefQty - 1);
    } else if (otherQty > 0) {
      setQtyLang(estadoKey, otherLang, otherQty - 1);
    } else {
      break;
    }

    remaining -= 1;
  }
}

function setTotalQtyWithPreferredLang(estadoKey, targetTotal, preferredLang = "en") {
  if (!estadoKey) return;
  const target = clampInt(Number(targetTotal), 0, 999);
  const current = getLegacyPossessionAdapterForState(estadoKey).totals.qty;
  adjustTotalQty(estadoKey, target - current, preferredLang);
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
    const parsed = JSON.parse(raw) || {};
    const normalized = {};
    for (const [oracleIdRaw, langRaw] of Object.entries(parsed)) {
      const oracleId = String(oracleIdRaw || "").trim();
      const lang = normalizeLegacyPossessionLang(langRaw, "en");
      if (!oracleId) continue;
      normalized[oracleId] = lang;
    }
    uiLangByOracle = normalized;
  } catch (e) {
    console.warn("UI lang cache corrupto:", e);
    uiLangByOracle = {};
  }
}

function guardarUILangByOracle() {
  safeLocalStorageSet(LS_UI_LANG, JSON.stringify(uiLangByOracle));
}

function syncLegacyUiLangCacheForSet(setCode, lang) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeLang = normalizeLegacyPossessionLang(lang, "en");
  if (!safeSetCode || !safeLang) return false;

  let changed = false;

  for (const [setKey, cards] of Object.entries(cacheCartasPorSetLang || {})) {
    const [codeRaw] = String(setKey || "").split("__");
    const code = String(codeRaw || "").trim().toLowerCase();
    if (code !== safeSetCode || !Array.isArray(cards)) continue;

    for (const card of cards) {
      const oracleId = String(card?.oracle_id || "").trim();
      if (!oracleId) continue;
      if (uiLangByOracle[oracleId] === safeLang) continue;
      uiLangByOracle[oracleId] = safeLang;
      changed = true;
    }
  }

  if (changed) guardarUILangByOracle();
  return changed;
}

function getUILang(oracle_id) {
  const key = String(oracle_id || "").trim();
  if (!key) return "en";
  return normalizeLegacyPossessionLang(uiLangByOracle[key], "en");
}

function setUILang(oracle_id, lang, setCode = "") {
  const oracleKey = String(oracle_id || "").trim();
  const safeLang = normalizeLegacyPossessionLang(lang, "en");
  if (!oracleKey) return;

  uiLangByOracle[oracleKey] = safeLang;
  guardarUILangByOracle();

  const setCodeKey = String(setCode || "").trim().toLowerCase();
  if (setCodeKey) {
    setPreferredVisibleLang(setCodeKey, safeLang, { persist: true, syncLegacy: false });
  }
}

function getUiPreferencesV3() {
  if (!estado3 || typeof estado3 !== "object") estado3 = createEmptyEstado3();
  estado3.uiPreferences = enforceUiPreferencesIntegrityV3(estado3.uiPreferences);
  return estado3.uiPreferences;
}

function getManualSetLangOverrides(setCode) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  if (!safeSetCode) return {};
  return normalizeManualLangOverrideMap(getUiPreferencesV3().manualSetLangOverrides?.[safeSetCode]);
}

function setManualSetLangOverride(setCode, lang, enabled, { persist = true } = {}) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeLang = normalizePhase1ManualLangCode(lang);
  if (!safeSetCode || !safeLang) return false;

  const uiPrefs = getUiPreferencesV3();
  if (!uiPrefs.manualSetLangOverrides || typeof uiPrefs.manualSetLangOverrides !== "object") {
    uiPrefs.manualSetLangOverrides = {};
  }

  const current = normalizeManualLangOverrideMap(uiPrefs.manualSetLangOverrides[safeSetCode]);
  const next = { ...current };
  if (enabled) next[safeLang] = true;
  else delete next[safeLang];

  if (JSON.stringify(current) === JSON.stringify(next)) return false;

  if (Object.keys(next).length === 0) delete uiPrefs.manualSetLangOverrides[safeSetCode];
  else uiPrefs.manualSetLangOverrides[safeSetCode] = next;

  if (persist) guardarEstado3();
  if (typeof reconstruirCatalogoColecciones === "function") reconstruirCatalogoColecciones();
  if (typeof renderColecciones === "function") renderColecciones();
  if (safeSetCode === String(setActualCode || "").trim().toLowerCase()) {
    renderSetVisibleLangToolbar(safeSetCode);
    if (setActualKey && typeof renderTablaSet === "function") renderTablaSet(setActualKey);
  }
  return true;
}

function hasManualSetLangOverride(setCode, lang) {
  const safeLang = normalizePhase1ManualLangCode(lang);
  if (!safeLang) return false;
  return !!getManualSetLangOverrides(setCode)[safeLang];
}

function getManualCardLangOverrides(setCode, oracleId, collectorNumber = "") {
  const selectionKey = buildVisibleVariantSelectionKey(setCode, oracleId, collectorNumber);
  if (!selectionKey) return {};
  return normalizeManualLangOverrideMap(getUiPreferencesV3().manualCardLangOverrides?.[selectionKey]);
}

function setManualCardLangOverride(setCode, oracleId, collectorNumber, lang, enabled, { persist = true } = {}) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const selectionKey = buildVisibleVariantSelectionKey(setCode, oracleId, collectorNumber);
  const safeLang = normalizePhase1ManualLangCode(lang);
  if (!selectionKey || !safeLang) return false;

  const uiPrefs = getUiPreferencesV3();
  if (!uiPrefs.manualCardLangOverrides || typeof uiPrefs.manualCardLangOverrides !== "object") {
    uiPrefs.manualCardLangOverrides = {};
  }

  const current = normalizeManualLangOverrideMap(uiPrefs.manualCardLangOverrides[selectionKey]);
  const next = { ...current };
  if (enabled) next[safeLang] = true;
  else delete next[safeLang];

  if (JSON.stringify(current) === JSON.stringify(next)) return false;

  if (Object.keys(next).length === 0) delete uiPrefs.manualCardLangOverrides[selectionKey];
  else uiPrefs.manualCardLangOverrides[selectionKey] = next;

  if (persist) guardarEstado3();
  if (safeSetCode === String(setActualCode || "").trim().toLowerCase()) {
    renderSetVisibleLangToolbar(safeSetCode);
    if (setActualKey && typeof renderTablaSet === "function") renderTablaSet(setActualKey);
  }
  return true;
}

function hasManualCardLangOverride(setCode, oracleId, collectorNumber, lang) {
  const safeLang = normalizePhase1ManualLangCode(lang);
  if (!safeLang) return false;
  return !!getManualCardLangOverrides(setCode, oracleId, collectorNumber)[safeLang];
}

function getManualAvailableLangsForCard(setCode, oracleId, collectorNumber = "") {
  return getStableVisibleLangDisplayOrder([
    ...Object.keys(getManualSetLangOverrides(setCode)),
    ...Object.keys(getManualCardLangOverrides(setCode, oracleId, collectorNumber))
  ]);
}

function isManualLangAllowedForCard(setCode, oracleId, collectorNumber, lang) {
  const safeLang = normalizePhase1ManualLangCode(lang);
  if (!safeLang) return false;
  return hasManualCardLangOverride(setCode, oracleId, collectorNumber, safeLang)
    || hasManualSetLangOverride(setCode, safeLang)
    || (safeLang === "es" && hasCanonicalSpanishSetException(setCode) && !hasLoadedNonEmptySetLangBucket(setCode, safeLang));
}

function buildVisibleVariantSelectionKey(setCode, oracleId, collectorNumber = "") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeOracleId = String(oracleId || "").trim();
  const safeCollector = normalizeCollectorNumberKey(collectorNumber);
  return `${safeSetCode}::${safeOracleId}::${safeCollector}`;
}

function getSetVisibleLangChoices(setCode) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const uiPrefs = getUiPreferencesV3();
  const choices = new Set(normalizeLanguagePreferenceList(getSetUiAvailableLangs(safeSetCode), { fallbackToEnglish: true }));

  for (const [setKey, cartas] of Object.entries(cacheCartasPorSetLang || {})) {
    if (!Array.isArray(cartas) || cartas.length === 0) continue;
    const { code, lang } = parseSetKeyParts(setKey);
    if (code !== safeSetCode) continue;
    const safeLang = normalizeLanguagePreferenceCode(lang);
    if (safeLang) choices.add(safeLang);
  }

  [
    uiPrefs.activeLangBySet?.[safeSetCode],
    uiPrefs.preferredSetLang?.[safeSetCode],
    ...(uiPrefs.visibleLangsBySet?.[safeSetCode] || []),
    ...Object.keys(getManualSetLangOverrides(safeSetCode))
  ].forEach(lang => {
    const safeLang = normalizeLanguagePreferenceCode(lang);
    if (safeLang) choices.add(safeLang);
  });

  if (choices.size === 0) choices.add(DEFAULT_APP_FALLBACK_LANG);
  return getStableVisibleLangDisplayOrder([...choices]);
}

function getVisibleLangFallback(setCode, fallbackLang = "en") {
  const preferred = normalizeLanguagePreferenceCode(fallbackLang, DEFAULT_APP_FALLBACK_LANG) || DEFAULT_APP_FALLBACK_LANG;
  const availableChoices = getSetVisibleLangChoices(setCode);
  if (availableChoices.includes(preferred)) return preferred;
  return availableChoices[0] || DEFAULT_APP_FALLBACK_LANG;
}

function filterAvailableVisibleLangs(setCode, langs, fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const available = new Set(getSetVisibleLangChoices(safeSetCode));
  const normalized = normalizeLanguagePreferenceList(langs, {
    fallbackToEnglish: false,
    fallbackLang: getVisibleLangFallback(safeSetCode, fallbackLang)
  });
  const filtered = normalized.filter(lang => available.size === 0 || available.has(lang));
  if (filtered.length > 0) return filtered;
  return [getVisibleLangFallback(safeSetCode, fallbackLang)];
}

function shouldRepairLegacyVisibleLangsForSet(setCode, storedLangs, fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const availableChoices = getSetVisibleLangChoices(safeSetCode);
  const normalizedStored = normalizeLanguagePreferenceList(storedLangs, {
    fallbackToEnglish: false,
    fallbackLang: getVisibleLangFallback(safeSetCode, fallbackLang)
  });

  if (normalizedStored.length !== 1) return false;
  if (normalizedStored[0] !== "en") return false;
  if (!availableChoices.includes("es")) return false;

  const uiPrefs = getUiPreferencesV3();
  const preferred = normalizeLanguagePreferenceCode(uiPrefs.preferredSetLang?.[safeSetCode]);
  const active = normalizeLanguagePreferenceCode(uiPrefs.activeLangBySet?.[safeSetCode]);

  if (preferred && preferred !== "en") return false;
  if (active && active !== "en") return false;

  return true;
}

function getVisibleLangsForSet(setCode, fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const uiPrefs = getUiPreferencesV3();
  const stored = uiPrefs.visibleLangsBySet?.[safeSetCode];
  if (Array.isArray(stored) && stored.length > 0) {
    const filteredStored = filterAvailableVisibleLangs(safeSetCode, stored, fallbackLang);
    if (shouldRepairLegacyVisibleLangsForSet(safeSetCode, filteredStored, fallbackLang)) {
      const repaired = filterAvailableVisibleLangs(safeSetCode, getSetVisibleLangChoices(safeSetCode), fallbackLang);
      uiPrefs.visibleLangsBySet[safeSetCode] = repaired;
      guardarEstado3();
      return repaired;
    }
    return filteredStored;
  }
  return filterAvailableVisibleLangs(safeSetCode, getSetVisibleLangChoices(safeSetCode), fallbackLang);
}

function setVisibleLangsForSet(setCode, langs, { persist = true } = {}) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  if (!safeSetCode) return [];
  const uiPrefs = getUiPreferencesV3();
  const normalizedLangs = filterAvailableVisibleLangs(safeSetCode, langs, uiPrefs.preferredSetLang?.[safeSetCode] || uiPrefs.activeLangBySet?.[safeSetCode] || "en");
  const previousLangs = JSON.stringify(uiPrefs.visibleLangsBySet?.[safeSetCode] || []);
  uiPrefs.visibleLangsBySet[safeSetCode] = normalizedLangs;

  const activeLang = normalizeLanguagePreferenceCode(uiPrefs.activeLangBySet?.[safeSetCode]);
  if (!activeLang || !normalizedLangs.includes(activeLang)) {
    uiPrefs.activeLangBySet[safeSetCode] = normalizedLangs[0];
  }

  if (persist && previousLangs !== JSON.stringify(normalizedLangs)) guardarEstado3();
  return [...normalizedLangs];
}

const LANGS_WITH_FLAG_ASSET = new Set(["en", "es"]);
const LANG_DISPLAY_LABELS = {};
const LANG_DISPLAY_ORDER = ["en", "es"];

function hasLangFlagAsset(lang) {
  return LANGS_WITH_FLAG_ASSET.has(normalizeLanguagePreferenceCode(lang));
}

function getLangDisplayLabel(lang) {
  const safeLang = normalizeLanguagePreferenceCode(lang, "en") || "en";
  return LANG_DISPLAY_LABELS[safeLang] || safeLang.toUpperCase();
}

function sortVariantLangCodes(langs, preferredLangs = []) {
  const unique = [...new Set((langs || []).map(lang => normalizeLanguagePreferenceCode(lang)).filter(Boolean))];
  const preferred = preferredLangs.map(lang => normalizeLanguagePreferenceCode(lang)).filter(Boolean);
  const score = (lang) => {
    const preferredIndex = preferred.indexOf(lang);
    if (preferredIndex !== -1) return preferredIndex - 100;
    const knownIndex = LANG_DISPLAY_ORDER.indexOf(lang);
    if (knownIndex !== -1) return knownIndex;
    return LANG_DISPLAY_ORDER.length + 100;
  };
  return unique.sort((left, right) => {
    const scoreDiff = score(left) - score(right);
    if (scoreDiff !== 0) return scoreDiff;
    return left.localeCompare(right);
  });
}

function getStableVisibleLangDisplayOrder(langs) {
  return sortVariantLangCodes(normalizeLanguagePreferenceList(langs), []);
}

function getSetExactSessionCardKey(setCode, oracleId, collectorNumber = "") {
  return buildVisibleVariantSelectionKey(setCode, oracleId, collectorNumber);
}

function getSetRuntimeUiLangs(setCode, fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const uiEnabled = new Set(getUiEnabledSetLangs());
  const runtimeLangs = new Set();

  for (const lang of getSetAvailableLangs(safeSetCode)) {
    if (uiEnabled.has(lang)) runtimeLangs.add(lang);
  }

  for (const setKey of Object.keys(cacheCartasPorSetLang || {})) {
    const { code, lang } = parseSetKeyParts(setKey);
    if (code !== safeSetCode) continue;
    if (uiEnabled.has(lang)) runtimeLangs.add(lang);
  }

  for (const lang of Object.keys(getManualSetLangOverrides(safeSetCode))) {
    if (uiEnabled.has(lang)) runtimeLangs.add(lang);
  }

  if (runtimeLangs.size === 0) {
    runtimeLangs.add(normalizeLanguagePreferenceCode(fallbackLang, DEFAULT_APP_FALLBACK_LANG) || DEFAULT_APP_FALLBACK_LANG);
  }

  return getStableVisibleLangDisplayOrder([...runtimeLangs]);
}

function getSessionVisibleLangsForSetExact(setCode, fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const runtimeLangs = getSetRuntimeUiLangs(safeSetCode, fallbackLang);
  const stored = Array.isArray(setExactSessionVisibleLangsBySet?.[safeSetCode])
    ? setExactSessionVisibleLangsBySet[safeSetCode]
    : runtimeLangs;
  const allowed = new Set(runtimeLangs);
  const filtered = getStableVisibleLangDisplayOrder(stored.filter(lang => allowed.has(lang)));
  const result = filtered.length > 0 ? filtered : runtimeLangs;
  setExactSessionVisibleLangsBySet[safeSetCode] = result;
  return result;
}

function setSessionVisibleLangsForSetExact(setCode, langs, fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const runtimeLangs = getSetRuntimeUiLangs(safeSetCode, fallbackLang);
  const allowed = new Set(runtimeLangs);
  const normalized = getStableVisibleLangDisplayOrder(normalizeLanguagePreferenceList(langs, {
    fallbackToEnglish: false,
    fallbackLang: getVisibleLangFallback(safeSetCode, fallbackLang)
  }).filter(lang => allowed.has(lang)));
  const result = normalized.length > 0 ? normalized : runtimeLangs;
  setExactSessionVisibleLangsBySet[safeSetCode] = result;
  return result;
}

function getSessionVisibleLangsForCardExact(setCode, oracleId, collectorNumber, fallbackLang = "en") {
  const key = getSetExactSessionCardKey(setCode, oracleId, collectorNumber);
  const stored = Array.isArray(setExactSessionVisibleLangsByCard?.[key])
    ? setExactSessionVisibleLangsByCard[key]
    : null;
  if (stored && stored.length > 0) return stored;
  return getSessionVisibleLangsForSetExact(setCode, fallbackLang);
}

function setSessionVisibleLangsForCardExact(setCode, oracleId, collectorNumber, langs, fallbackLang = "en") {
  const key = getSetExactSessionCardKey(setCode, oracleId, collectorNumber);
  const inherited = getSessionVisibleLangsForSetExact(setCode, fallbackLang);
  const runtimeAllowed = new Set(getSetRuntimeUiLangs(setCode, fallbackLang));
  const normalized = getStableVisibleLangDisplayOrder(normalizeLanguagePreferenceList(langs, {
    fallbackToEnglish: false,
    fallbackLang: getVisibleLangFallback(setCode, fallbackLang)
  }).filter(lang => runtimeAllowed.has(lang)));

  if (normalized.length === 0 || JSON.stringify(normalized) === JSON.stringify(inherited)) {
    delete setExactSessionVisibleLangsByCard[key];
    return inherited;
  }

  setExactSessionVisibleLangsByCard[key] = normalized;
  return normalized;
}

function clearSetExactSessionVisibleLangOverridesForSet(setCode) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  delete setExactSessionVisibleLangsBySet[safeSetCode];
  const prefix = `${safeSetCode}::`;
  for (const key of Object.keys(setExactSessionVisibleLangsByCard || {})) {
    if (String(key || "").startsWith(prefix)) {
      delete setExactSessionVisibleLangsByCard[key];
    }
  }
}

function hasLoadedSetLangBucket(setCode, lang) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeLang = normalizeLanguagePreferenceCode(lang, "en") || "en";
  return Array.isArray(cacheCartasPorSetLang[`${safeSetCode}__${safeLang}`]);
}

function hasLoadedNonEmptySetLangBucket(setCode, lang) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeLang = normalizeLanguagePreferenceCode(lang, "en") || "en";
  return cartasDeSetKey(`${safeSetCode}__${safeLang}`).length > 0;
}

function getExactSetPrintIdForLang(setCode, collectorNumber, lang) {
  const cachedVariants = getCachedSetExactVariants(setCode, collectorNumber);
  const cachedCard = cachedVariants?.[normalizeLanguagePreferenceCode(lang, "en") || "en"];
  if (cachedCard?.id) return String(cachedCard.id);

  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeCollectorNumber = normalizeCollectorNumberKey(collectorNumber);
  const safeLang = normalizeLanguagePreferenceCode(lang, "en") || "en";
  if (!safeSetCode || !safeCollectorNumber) return "";

  const byCollectorKey = `${safeSetCode}::${safeCollectorNumber}::${safeLang}`;
  return [...(catalogPrintsBySetCollectorLang[byCollectorKey] || [])].sort(compareCatalogPrintIds)[0] || "";
}

function getExactSetCardForLang(setCode, collectorNumber, lang, fallbackCard = null) {
  const cachedVariants = getCachedSetExactVariants(setCode, collectorNumber);
  const cachedCard = cachedVariants?.[normalizeLanguagePreferenceCode(lang, "en") || "en"];
  if (cachedCard) return normalizeVisibleVariantCard(cachedCard, fallbackCard);

  const printId = getExactSetPrintIdForLang(setCode, collectorNumber, lang);
  if (!printId) return null;
  const knownCard = getKnownCardById(printId);
  return knownCard ? normalizeVisibleVariantCard(knownCard, fallbackCard) : null;
}

function getVariantScopeForCardUI(card) {
  const normalized = normalizeVisibleVariantCard(card, card);
  const setCode = String(normalized.setCode || normalized.set || "").trim().toLowerCase();
  const collectorNumber = normalizeCollectorNumberKey(normalized.collector_number || normalized.numero || "");
  const isSetScreenActive = !!pantallas?.set?.classList.contains("active");
  return isSetScreenActive && setCode && collectorNumber && setCode === String(setActualCode || "").trim().toLowerCase()
    ? "set-exact"
    : "generic";
}

function getVariantScopeForElement(element) {
  const host = element?.id === "modalCartaBody"
    ? element
    : (element?.classList?.contains("carta-item") ? element : element?.closest?.(".carta-item") || element?.closest?.("#modalCartaBody"));
  const controls = host?.querySelector?.(".carta-controles");
  return controls?.dataset?.variantScope || host?.dataset?.variantScope || "generic";
}

function getExactSetAvailableLangsForCard(cardOrSetCode, oracleIdArg = "", collectorNumberArg = "", currentLangArg = "en") {
  const base = (cardOrSetCode && typeof cardOrSetCode === "object")
    ? normalizeVisibleVariantCard(cardOrSetCode, cardOrSetCode)
    : normalizeVisibleVariantCard({
        oracle_id: oracleIdArg,
        setCode: cardOrSetCode,
        set: cardOrSetCode,
        collector_number: collectorNumberArg,
        numero: collectorNumberArg,
        lang: currentLangArg
      }, null);

  const setCode = String(base?.setCode || base?.set || cardOrSetCode || "").trim().toLowerCase();
  const collectorNumber = normalizeCollectorNumberKey(base?.collector_number || base?.numero || collectorNumberArg || "");
  const currentLang = normalizeLanguagePreferenceCode(base?.lang || currentLangArg, "en") || "en";
  const fallbackLang = getVisibleLangFallback(setCode, currentLang);
  const available = new Set([currentLang, fallbackLang]);

  if (!setCode || !collectorNumber) {
    return sortVariantLangCodes([...available], [currentLang, fallbackLang, "en", "es"]);
  }

  for (const lang of getManualAvailableLangsForCard(setCode, String(base?.oracle_id || oracleIdArg || "").trim(), collectorNumber)) {
    available.add(lang);
  }

  for (const lang of Object.keys(getCachedSetExactVariants(setCode, collectorNumber) || {})) {
    available.add(lang);
  }

  for (const lang of getSetRuntimeUiLangs(setCode, currentLang)) {
    if (hasLoadedSetLangBucket(setCode, lang)) {
      if (getExactSetPrintIdForLang(setCode, collectorNumber, lang)) {
        available.add(lang);
      }
    } else {
      available.add(lang);
    }
  }

  return sortVariantLangCodes([...available], [currentLang, fallbackLang, "en", "es"]);
}

function shouldRepairLegacyVisibleLangsForCardExactSet(setCode, storedLangs, availableLangs, fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const normalizedStored = normalizeLanguagePreferenceList(storedLangs, {
    fallbackToEnglish: false,
    fallbackLang: getVisibleLangFallback(safeSetCode, fallbackLang)
  });

  if (normalizedStored.length !== 1) return false;
  if (normalizedStored[0] !== "en") return false;
  if (!Array.isArray(availableLangs) || !availableLangs.includes("es")) return false;

  const uiPrefs = getUiPreferencesV3();
  const preferred = normalizeLanguagePreferenceCode(uiPrefs.preferredSetLang?.[safeSetCode]);
  const active = normalizeLanguagePreferenceCode(uiPrefs.activeLangBySet?.[safeSetCode]);

  if (preferred && preferred !== "en") return false;
  if (active && active !== "en") return false;

  return true;
}

function getVisibleLangsForCardExactSet(setCode, oracleId, collectorNumber = "", fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const uiPrefs = getUiPreferencesV3();
  const currentLang = normalizeLanguagePreferenceCode(getKnownCardById(getSelectedVariantPrintId(setCode, oracleId, collectorNumber))?.lang, fallbackLang)
    || normalizeLanguagePreferenceCode(uiPrefs.activeLangBySet?.[safeSetCode], fallbackLang)
    || normalizeLanguagePreferenceCode(fallbackLang, "en")
    || "en";
  const availableLangs = getExactSetAvailableLangsForCard(setCode, oracleId, collectorNumber, currentLang);
  const sourceLangs = getSessionVisibleLangsForCardExact(safeSetCode, oracleId, collectorNumber, fallbackLang);
  const normalized = normalizeLanguagePreferenceList(sourceLangs, {
    fallbackToEnglish: false,
    fallbackLang: getVisibleLangFallback(safeSetCode, fallbackLang)
  });
  const filtered = normalized.filter(lang => availableLangs.includes(lang));
  if (filtered.length > 0) {
    return sortVariantLangCodes(filtered, [currentLang, fallbackLang, "en", "es"]);
  }
  return [availableLangs[0] || getVisibleLangFallback(safeSetCode, fallbackLang)];
}

async function resolveExactSetVariantForCard(card, preferredLang = null, { loadOnDemand = true } = {}) {
  const base = normalizeVisibleVariantCard(card, card);
  const setCode = String(base.setCode || parseSetKeyParts(base.setKey).code || "").trim().toLowerCase();
  const collectorNumber = normalizeCollectorNumberKey(base.collector_number || base.numero || "");
  const oracleId = String(base.oracle_id || "").trim();
  const fallbackLang = String(base.lang || "en").trim().toLowerCase() || "en";

  if (!setCode || !collectorNumber) {
    return resolveVisibleVariantForCard(card, preferredLang);
  }

  const visibleLangs = getVisibleLangsForCardExactSet(setCode, oracleId, collectorNumber, fallbackLang);
  const requestedLang = preferredLang
    ? getVisibleLangFallback(setCode, preferredLang)
    : getPreferredVisibleLang(setCode, fallbackLang, oracleId, collectorNumber);
  const targetLang = visibleLangs.includes(requestedLang) ? requestedLang : (visibleLangs[0] || requestedLang);

  const selectedPrintId = getSelectedVariantPrintId(setCode, oracleId, collectorNumber);
  if (selectedPrintId) {
    const selectedCard = getKnownCardById(selectedPrintId);
    if (selectedCard) {
      const normalizedSelected = normalizeVisibleVariantCard(selectedCard, base);
      const selectedCollector = normalizeCollectorNumberKey(normalizedSelected.collector_number || normalizedSelected.numero || "");
      const selectedSetCode = String(normalizedSelected.setCode || normalizedSelected.set || "").trim().toLowerCase();
      if (selectedSetCode === setCode && selectedCollector === collectorNumber && (!preferredLang || normalizedSelected.lang === targetLang)) {
        return normalizedSelected;
      }
    }
  }

  if (normalizeCollectorNumberKey(base.collector_number || base.numero || "") === collectorNumber && base.lang === targetLang) {
    return base;
  }

  let exactCard = getExactSetCardForLang(setCode, collectorNumber, targetLang, base);
  if (exactCard) return exactCard;

  if (loadOnDemand && !hasLoadedSetLangBucket(setCode, targetLang)) {
    await ensureSetCardsLoaded(`${setCode}__${targetLang}`);
    exactCard = getExactSetCardForLang(setCode, collectorNumber, targetLang, base);
    if (exactCard) return exactCard;
  }

  if (isManualLangAllowedForCard(setCode, oracleId, collectorNumber, targetLang) && base.lang !== targetLang) {
    return buildManualVisibleVariantFallback(base, targetLang);
  }

  return base;
}

function getAvailableVariantLangsForCard(cardOrSetCode, oracleIdArg = "", collectorNumberArg = "", currentLangArg = "en") {
  const base = (cardOrSetCode && typeof cardOrSetCode === "object")
    ? normalizeVisibleVariantCard(cardOrSetCode, cardOrSetCode)
    : normalizeVisibleVariantCard({
        oracle_id: oracleIdArg,
        setCode: cardOrSetCode,
        set: cardOrSetCode,
        collector_number: collectorNumberArg,
        numero: collectorNumberArg,
        lang: currentLangArg
      }, null);

  const setCode = String(base?.setCode || base?.set || cardOrSetCode || "").trim().toLowerCase();
  const oracleId = String(base?.oracle_id || oracleIdArg || "").trim();
  const collectorNumber = normalizeCollectorNumberKey(base?.collector_number || base?.numero || collectorNumberArg || "");
  const currentLang = normalizeLanguagePreferenceCode(base?.lang || currentLangArg, "en") || "en";
  const fallbackLang = getVisibleLangFallback(setCode, currentLang);
  const available = new Set([currentLang, fallbackLang]);

  if (!setCode) {
    return sortVariantLangCodes([...available], [currentLang, fallbackLang, "en", "es"]);
  }

  for (const lang of getManualAvailableLangsForCard(setCode, oracleId, collectorNumber)) {
    available.add(lang);
  }

  if (!oracleId) {
    if (collectorNumber) {
      for (const lang of getSetUiAvailableLangs(setCode)) {
        const byCollectorKey = `${setCode}::${collectorNumber}::${lang}`;
        if ((catalogPrintsBySetCollectorLang[byCollectorKey] || []).length > 0) {
          available.add(lang);
        } else if (!cacheCartasPorSetLang[`${setCode}__${lang}`]) {
          available.add(lang);
        }
      }
    }
    return sortVariantLangCodes([...available], [currentLang, fallbackLang, "en", "es"]);
  }

  const variantKey = `${setCode}::${oracleId}::${collectorNumber}`;
  for (const printId of catalogVariantPrintsBySetCard[variantKey] || []) {
    const meta = catalogPrintMetaById[printId];
    const lang = normalizeLanguagePreferenceCode(meta?.lang);
    if (lang) available.add(lang);
  }

  for (const [langRaw, variant] of Object.entries(cacheCardByOracleLang[oracleId] || {})) {
    const lang = normalizeLanguagePreferenceCode(langRaw);
    if (!lang) continue;
    const variantSetCode = String(variant?.setCode || variant?.set || variant?._raw?.set || "").trim().toLowerCase();
    const variantCollector = normalizeCollectorNumberKey(variant?.collector_number || variant?.numero || "");
    if (variantSetCode && variantSetCode !== setCode) continue;
    if (collectorNumber && variantCollector && variantCollector !== collectorNumber) continue;
    available.add(lang);
  }

  if (collectorNumber) {
    for (const lang of getSetUiAvailableLangs(setCode)) {
      const byCollectorKey = `${setCode}::${collectorNumber}::${lang}`;
      if ((catalogPrintsBySetCollectorLang[byCollectorKey] || []).length > 0) {
        available.add(lang);
      } else if (!cacheCartasPorSetLang[`${setCode}__${lang}`]) {
        available.add(lang);
      }
    }
  }

  const availableResult = sortVariantLangCodes([...available], [currentLang, fallbackLang, "en", "es"]);
  return availableResult;
}

function filterVisibleLangsForCard(setCode, oracleId, collectorNumber, langs, fallbackLang = "en", currentLang = "en") {
  const availableLangs = getAvailableVariantLangsForCard(setCode, oracleId, collectorNumber, currentLang);
  const availableSet = new Set(availableLangs);
  const normalized = normalizeLanguagePreferenceList(langs, {
    fallbackToEnglish: false,
    fallbackLang: getVisibleLangFallback(setCode, fallbackLang)
  });
  const filtered = normalized.filter(lang => availableSet.has(lang));
  if (filtered.length > 0) {
    return sortVariantLangCodes(filtered, [currentLang, fallbackLang, "en", "es"]);
  }
  return [availableLangs[0] || getVisibleLangFallback(setCode, fallbackLang)];
}

function buildVisibleLangPanelId(setCode, oracleId, collectorNumber = "") {
  return `lang-panel-${buildVisibleVariantSelectionKey(setCode, oracleId, collectorNumber).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function getVisibleVariantResolutionInfo(card, { variantScope = "generic" } = {}) {
  const normalized = normalizeVisibleVariantCard(card, card);
  const resolutionMode = String(normalized?._variantResolution || "").trim().toLowerCase();
  if (resolutionMode === "manual-fallback") {
    return {
      mode: "manual-fallback",
      text: "Idioma manual · sin print resuelto"
    };
  }

  const displayedLang = normalizeLanguagePreferenceCode(normalized?.lang, "en") || "en";
  const setCode = String(normalized?.setCode || normalized?.set || "").trim().toLowerCase();
  const oracleId = String(normalized?.oracle_id || "").trim();
  const collectorNumber = normalizeCollectorNumberKey(normalized?.collector_number || normalized?.numero || "");
  const metaLang = normalizeLanguagePreferenceCode(getCatalogPrintMetaForIntegrity(normalized?.id)?.lang);
  const hasExactResolvedPrint = variantScope === "set-exact"
    ? !!getExactSetPrintIdForLang(setCode, collectorNumber, displayedLang)
    : false;

  if (displayedLang && metaLang && metaLang === displayedLang) {
    return { mode: "resolved", text: "" };
  }

  if (hasExactResolvedPrint) {
    return { mode: "resolved", text: "" };
  }

  if (isManualLangAllowedForCard(setCode, oracleId, collectorNumber, displayedLang)) {
    return {
      mode: "manual-fallback",
      text: "Idioma manual · sin print resuelto"
    };
  }

  return { mode: "resolved", text: "" };
}

function getSetLangResolutionInfo(setCode, lang) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeLang = normalizePhase1ManualLangCode(lang);
  if (!safeSetCode || !safeLang) return { mode: "resolved", text: "" };

  const rawSetLangs = new Set(normalizeSetLangs(setLangsByCode[safeSetCode] || []));
  const hasRealSetLang = rawSetLangs.has(safeLang) || hasLoadedNonEmptySetLangBucket(safeSetCode, safeLang);

   if (safeLang === "es" && hasCanonicalSpanishSetException(safeSetCode) && !hasLoadedNonEmptySetLangBucket(safeSetCode, safeLang)) {
    return {
      mode: "manual-fallback",
      text: "Excepcion espanola · set sin print resuelto"
    };
  }

  if (hasManualSetLangOverride(safeSetCode, safeLang) && !hasRealSetLang) {
    return {
      mode: "manual-fallback",
      text: "Idioma manual · set sin print resuelto"
    };
  }

  return { mode: "resolved", text: "" };
}

function renderLangResolutionNoteHTML(info) {
  if (!info || info.mode !== "manual-fallback" || !info.text) return "";
  return `<div class="lang-resolution-note is-manual" title="${escapeAttr(info.text)}">${escapeHtml(info.text)}</div>`;
}

const visibleVariantSelectorFeedbackTimerByElement = new WeakMap();

function getVisibleVariantSelectorFeedback(controls) {
  if (!controls) return null;
  const message = String(controls.dataset.langFeedbackMessage || "").trim();
  if (!message) return null;

  return {
    type: String(controls.dataset.langFeedbackType || "info").trim() || "info",
    message
  };
}

function clearVisibleVariantSelectorFeedback(controls) {
  if (!controls) return;
  const timerId = visibleVariantSelectorFeedbackTimerByElement.get(controls);
  if (timerId) {
    clearTimeout(timerId);
    visibleVariantSelectorFeedbackTimerByElement.delete(controls);
  }

  delete controls.dataset.langFeedbackType;
  delete controls.dataset.langFeedbackMessage;
}

function setVisibleVariantSelectorFeedback(controls, message, { type = "info", durationMs = 2800 } = {}) {
  if (!controls) return;
  const safeMessage = String(message || "").trim();
  if (!safeMessage) {
    clearVisibleVariantSelectorFeedback(controls);
    return;
  }

  clearVisibleVariantSelectorFeedback(controls);
  controls.dataset.langFeedbackType = String(type || "info").trim() || "info";
  controls.dataset.langFeedbackMessage = safeMessage;

  const host = controls.classList.contains("modal-controles")
    ? document.getElementById("modalCartaBody")
    : controls.closest(".carta-item");
  const currentCard = getCurrentVisibleVariantCardForElement(host);
  if (host && currentCard) syncVisibleVariantSelectorUI(host, currentCard);

  const timerId = setTimeout(() => {
    clearVisibleVariantSelectorFeedback(controls);
    const feedbackHost = controls.classList.contains("modal-controles")
      ? document.getElementById("modalCartaBody")
      : controls.closest(".carta-item");
    const feedbackCard = getCurrentVisibleVariantCardForElement(feedbackHost);
    if (feedbackHost && feedbackCard) syncVisibleVariantSelectorUI(feedbackHost, feedbackCard);
  }, durationMs);

  visibleVariantSelectorFeedbackTimerByElement.set(controls, timerId);
}

function getEffectiveSetVisibleLang(setCode, fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeFallback = normalizeLanguagePreferenceCode(fallbackLang, DEFAULT_APP_FALLBACK_LANG) || DEFAULT_APP_FALLBACK_LANG;
  if (!safeSetCode) return safeFallback;

  const activeLang = getActiveVisibleLang(safeSetCode, "", "", safeFallback);
  if (safeSetCode !== String(setActualCode || "").trim().toLowerCase()) {
    return activeLang;
  }

  const openedLang = normalizeLanguagePreferenceCode(setActualLang, activeLang) || activeLang;
  const activeResolution = getSetLangResolutionInfo(safeSetCode, activeLang);
  const openedSetKey = openedLang ? `${safeSetCode}__${openedLang}` : "";
  const currentSetKey = String(setActualKey || "").trim().toLowerCase();
  const hasOpenedExactSet = !!openedSetKey
    && currentSetKey === openedSetKey
    && (cartasDeSetKey(openedSetKey).length > 0 || hasLoadedNonEmptySetLangBucket(safeSetCode, openedLang));

  if (activeResolution.mode === "manual-fallback") return activeLang;
  if (hasOpenedExactSet) return openedLang;
  return activeLang;
}

function shouldLockVisibleVariantSelector({ context = "card", variantScope = "generic" } = {}) {
  return context === "card" && variantScope === "set-exact";
}

function buildVisibleVariantLockFeedback() {
  return "Esta carta sigue el idioma base activo del set.";
}

function renderLanguageBadgeHTML(lang, { active = false } = {}) {
  const safeLang = normalizeLanguagePreferenceCode(lang, "en") || "en";
  const label = getLangDisplayLabel(safeLang);
  const classes = ["lang-badge"];
  if (active) classes.push("lang-active");
  if (!hasLangFlagAsset(safeLang)) classes.push("lang-badge-code");

  if (hasLangFlagAsset(safeLang)) {
    return `<span class="${classes.join(" ")}"><img class="flag-icon" src="icons/flag-${safeLang}.svg" alt="${escapeAttr(label)}" /><span class="lang-label">${escapeHtml(label)}</span></span>`;
  }

  return `<span class="${classes.join(" ")}"><span class="lang-code-pill">${escapeHtml(label)}</span></span>`;
}

function renderVisibleVariantSelectorHTML(card, { langMode = "both", panelOpen = false, context = "card", variantScope = "generic", feedback = null } = {}) {
  const normalized = normalizeVisibleVariantCard(card, card);
  const setCode = String(normalized.setCode || normalized.set || "").toLowerCase();
  const oracleId = String(normalized.oracle_id || "");
  const collectorNumber = String(normalized.collector_number || normalized.numero || "");
  const activeLang = normalizeLanguagePreferenceCode(normalized.lang, "en") || "en";
  const resolutionInfo = getVisibleVariantResolutionInfo(normalized, { variantScope });
  const selectorLocked = shouldLockVisibleVariantSelector({ context, variantScope });
  const feedbackHtml = feedback?.message
    ? `<div class="lang-selector-feedback is-${escapeAttr(feedback.type || "info")}" role="status" aria-live="polite">${escapeHtml(feedback.message || "")}</div>`
    : "";

  if (langMode !== "both" || selectorLocked) {
    const lockButtonHtml = selectorLocked
      ? `<button class="btn-lang-choice is-active is-locked" type="button" data-lang-locked="true" aria-label="${escapeAttr(buildVisibleVariantLockFeedback())}">${renderLanguageBadgeHTML(activeLang, { active: true })}</button>`
      : renderLanguageBadgeHTML(activeLang, { active: true });
    const readonlyContentHtml = selectorLocked
      ? `<div class="lang-selector-anchor">${lockButtonHtml}${feedbackHtml}</div>`
      : `${lockButtonHtml}${feedbackHtml}`;
    return `<div class="lang-selector-shell is-readonly">${readonlyContentHtml}${renderLangResolutionNoteHTML(resolutionInfo)}</div>`;
  }

  const availableLangs = variantScope === "set-exact"
    ? getExactSetAvailableLangsForCard(normalized)
    : getAvailableVariantLangsForCard(normalized);
  const visibleLangs = getStableVisibleLangDisplayOrder([...availableLangs, activeLang]);
  const choicesHtml = visibleLangs.map(lang => {
    const isActive = lang === activeLang;
    return `<button class="btn-lang-choice${isActive ? " is-active" : ""}" type="button" data-lang-choice="${escapeAttr(lang)}" data-oracle="${escapeAttr(oracleId)}" data-set-code="${escapeAttr(setCode)}" data-collector-number="${escapeAttr(collectorNumber)}" aria-pressed="${isActive ? "true" : "false"}">${renderLanguageBadgeHTML(lang, { active: isActive })}</button>`;
  }).join("");

  return `
    <div class="lang-selector-shell" data-selector-context="${escapeAttr(context)}">
      <div class="lang-selector-top">
        <div class="lang-selector-buttons">${choicesHtml}</div>
      </div>
      ${renderLangResolutionNoteHTML(resolutionInfo)}
      ${feedbackHtml}
    </div>
  `;
}

function buildSetVisibleLangPanelId(setCode) {
  return `set-lang-panel-${String(setCode || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
}

function getSetReleasedAt(setCode, lang = "") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeLang = normalizeLanguagePreferenceCode(lang, "") || "";
  if (!safeSetCode) return "";

  if (safeLang) {
    const exactMeta = setMetaByKey.get(`${safeSetCode}__${safeLang}`);
    if (exactMeta?.released_at) return String(exactMeta.released_at || "").trim();
  }

  for (const candidateLang of getUiEnabledSetLangs()) {
    const meta = setMetaByKey.get(`${safeSetCode}__${candidateLang}`);
    if (meta?.released_at) return String(meta.released_at || "").trim();
  }

  const collectionEntry = obtenerColecciones().find(entry => String(entry.code || "").trim().toLowerCase() === safeSetCode);
  return String(collectionEntry?.released_at || "").trim();
}

function isFutureReleasedAt(releasedAt) {
  const safeReleasedAt = String(releasedAt || "").trim();
  if (!safeReleasedAt) return false;

  const [year, month, day] = safeReleasedAt.split("-").map(part => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;

  const releaseDateUtc = Date.UTC(year, month - 1, day);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return releaseDateUtc > todayUtc;
}

function clearSetLangToolbarFeedback({ rerender = true } = {}) {
  if (setLangToolbarFeedbackTimer) {
    clearTimeout(setLangToolbarFeedbackTimer);
    setLangToolbarFeedbackTimer = null;
  }

  const previousSetCode = setLangToolbarFeedbackState?.setCode || "";
  setLangToolbarFeedbackState = null;
  if (rerender && previousSetCode) {
    renderSetVisibleLangToolbar(previousSetCode || setActualCode);
  }
}

function setSetLangToolbarFeedback(setCode, feedback = null) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  clearSetLangToolbarFeedback({ rerender: false });

  if (!safeSetCode || !feedback?.message) {
    renderSetVisibleLangToolbar(safeSetCode || setActualCode);
    return;
  }

  setLangToolbarFeedbackState = {
    setCode: safeSetCode,
    type: feedback.type || "info",
    message: String(feedback.message || "").trim(),
    persist: !!feedback.persist
  };

  if (!feedback.persist) {
    const timeoutMs = Number.isFinite(feedback.timeoutMs) ? feedback.timeoutMs : 4800;
    setLangToolbarFeedbackTimer = setTimeout(() => {
      clearSetLangToolbarFeedback();
    }, Math.max(1200, timeoutMs));
  }

  renderSetVisibleLangToolbar(safeSetCode);
}

function getSetLangToolbarFeedback(setCode) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  if (!safeSetCode) return null;
  if (setLangToolbarFeedbackState?.setCode !== safeSetCode) return null;
  return setLangToolbarFeedbackState;
}

function buildSetLangSwitchFeedback(result) {
  if (!result || result.status === "changed") return null;

  const langLabel = getLangDisplayLabel(result.requestedLang || result.effectiveLangAfter || DEFAULT_APP_FALLBACK_LANG);

  switch (result.reason) {
    case "already-active":
      return {
        type: "info",
        message: `Ya estas viendo este set en ${langLabel}.`,
        timeoutMs: 2800
      };
    case "manual-fallback-unresolved":
      return {
        type: "warning",
        message: `${langLabel} esta previsto para este set, pero todavia no hay cartas disponibles.`,
        timeoutMs: 5200
      };
    case "lang-not-openable":
      return {
        type: "warning",
        message: `Este set no se puede abrir en ${langLabel}.`,
        timeoutMs: 5200
      };
    case "set-not-released-yet":
      return {
        type: "warning",
        message: `Este set aun no ha salido en ${langLabel}.`,
        timeoutMs: 5200
      };
    case "no-cards-for-lang":
      return {
        type: "warning",
        message: `No hay cartas publicadas para este set en ${langLabel}.`,
        timeoutMs: 5200
      };
    case "load-error":
      return {
        type: "error",
        message: `No se pudo cargar ${langLabel}. Intentalo otra vez.`,
        timeoutMs: 6200,
        persist: true
      };
    default:
      return {
        type: "warning",
        message: "No se pudo cambiar el idioma para este set.",
        timeoutMs: 4800
      };
  }
}

async function switchSetBaseLanguageWithResult(setCode, requestedLang) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const safeRequestedLang = normalizeLanguagePreferenceCode(requestedLang, getActiveVisibleLang(safeSetCode) || DEFAULT_APP_FALLBACK_LANG)
    || DEFAULT_APP_FALLBACK_LANG;
  const effectiveLangBefore = getEffectiveSetVisibleLang(safeSetCode, getActiveVisibleLang(safeSetCode) || DEFAULT_APP_FALLBACK_LANG)
    || DEFAULT_APP_FALLBACK_LANG;

  const baseResult = {
    status: "unchanged",
    reason: "fallback-unchanged",
    setCode: safeSetCode,
    requestedLang: safeRequestedLang,
    effectiveLangBefore,
    effectiveLangAfter: effectiveLangBefore,
    targetSetKey: safeSetCode && safeRequestedLang ? `${safeSetCode}__${safeRequestedLang}` : "",
    releaseDate: getSetReleasedAt(safeSetCode, safeRequestedLang)
  };

  if (!safeSetCode) {
    return {
      ...baseResult,
      status: "failed",
      reason: "load-error"
    };
  }

  if (safeRequestedLang === effectiveLangBefore) {
    return {
      ...baseResult,
      reason: "already-active"
    };
  }

  const resolutionInfo = getSetLangResolutionInfo(safeSetCode, safeRequestedLang);
  if (resolutionInfo.mode === "manual-fallback") {
    return {
      ...baseResult,
      reason: "manual-fallback-unresolved"
    };
  }

  const openableLangs = getSetOpenableLangs(safeSetCode);
  if (!openableLangs.includes(safeRequestedLang)) {
    return {
      ...baseResult,
      reason: "lang-not-openable"
    };
  }

  const nextLang = setActiveVisibleLang(safeSetCode, safeRequestedLang, { persist: false, syncLegacy: true });
  const explicitTargetSetKey = nextLang ? `${safeSetCode}__${nextLang}` : "";

  try {
    if (explicitTargetSetKey) {
      await ensureSetCardsLoaded(explicitTargetSetKey);
      const loadedCards = cartasDeSetKey(explicitTargetSetKey).length;
      if (loadedCards > 0) {
        clearSetExactSessionVisibleLangOverridesForSet(safeSetCode);
        const overridesCleared = clearVisibleVariantOverridesForSet(safeSetCode, { persist: false });
        if (nextLang || overridesCleared) guardarEstado3();
        await abrirSet(explicitTargetSetKey);
        return {
          ...baseResult,
          status: "changed",
          reason: "changed",
          effectiveLangAfter: nextLang || safeRequestedLang,
          targetSetKey: explicitTargetSetKey,
          releaseDate: getSetReleasedAt(safeSetCode, nextLang || safeRequestedLang)
        };
      }
    }

    const restoredLang = setActiveVisibleLang(safeSetCode, effectiveLangBefore, { persist: false, syncLegacy: true });
    if (restoredLang !== nextLang) guardarEstado3();
    await syncOpenedSetToActiveVisibleLang(safeSetCode);

    const releaseDate = getSetReleasedAt(safeSetCode, nextLang || safeRequestedLang);
    return {
      ...baseResult,
      reason: isFutureReleasedAt(releaseDate) ? "set-not-released-yet" : "no-cards-for-lang",
      effectiveLangAfter: restoredLang || effectiveLangBefore,
      targetSetKey: explicitTargetSetKey,
      releaseDate
    };
  } catch (err) {
    const restoredLang = setActiveVisibleLang(safeSetCode, effectiveLangBefore, { persist: false, syncLegacy: true });
    if (restoredLang !== nextLang) guardarEstado3();
    await syncOpenedSetToActiveVisibleLang(safeSetCode);
    return {
      ...baseResult,
      status: "failed",
      reason: "load-error",
      effectiveLangAfter: restoredLang || effectiveLangBefore,
      targetSetKey: explicitTargetSetKey,
      error: err
    };
  }
}

function getSetLangToolbarRenderState(setCode) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const storedActiveLang = getActiveVisibleLang(safeSetCode);
  const loadingForSet = setLangToolbarLoadingState?.busy && setLangToolbarLoadingState?.setCode === safeSetCode;
  const pendingLang = loadingForSet
    ? (normalizeLanguagePreferenceCode(setLangToolbarLoadingState?.targetLang, storedActiveLang) || storedActiveLang)
    : "";
  const effectiveActiveLang = pendingLang || getEffectiveSetVisibleLang(safeSetCode, storedActiveLang || "en") || "en";

  return {
    activeLang: effectiveActiveLang,
    isLoading: !!loadingForSet,
    loadingLang: pendingLang || effectiveActiveLang,
    feedback: getSetLangToolbarFeedback(safeSetCode)
  };
}

function setSetListLoadingState(isLoading, message = "") {
  const shell = document.getElementById("setListShell");
  const overlay = document.getElementById("setLoadingOverlay");
  if (!shell || !overlay) return;

  const text = overlay.querySelector(".set-loading-overlay-text");
  if (text && message) text.textContent = message;

  shell.classList.toggle("is-loading", !!isLoading);
  overlay.classList.toggle("hidden", !isLoading);
  overlay.setAttribute("aria-hidden", isLoading ? "false" : "true");
}

function setSetLangToolbarLoading(setCode, targetLang = "", isLoading = false) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const loadingLang = normalizeLanguagePreferenceCode(targetLang, getActiveVisibleLang(safeSetCode)) || getActiveVisibleLang(safeSetCode) || "en";

  if (isLoading && safeSetCode) {
    setLangToolbarLoadingState = {
      busy: true,
      setCode: safeSetCode,
      targetLang: loadingLang
    };
  } else {
    setLangToolbarLoadingState = null;
  }

  setSetListLoadingState(
    !!(isLoading && safeSetCode),
    `Cargando cartas en ${getLangDisplayLabel(loadingLang)}...`
  );

  renderSetVisibleLangToolbar(safeSetCode || setActualCode);
}

function renderSetVisibleLangSelectorHTML(setCode, { panelOpen = false } = {}) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  if (!safeSetCode) return "";

  const { activeLang, isLoading, loadingLang, feedback } = getSetLangToolbarRenderState(safeSetCode);
  const resolutionInfo = getSetLangResolutionInfo(safeSetCode, activeLang);
  const availableLangs = getStableVisibleLangDisplayOrder(getSetRuntimeUiLangs(safeSetCode, activeLang));
  const visibleLangs = getStableVisibleLangDisplayOrder([...availableLangs, activeLang]);
  const loadingText = `Cargando set en ${getLangDisplayLabel(loadingLang)}...`;

  const choicesHtml = visibleLangs.map(lang => {
    const isActive = lang === activeLang;
    return `<button class="btn-lang-choice${isActive ? " is-active" : ""}" type="button" data-set-lang-choice="${escapeAttr(lang)}" data-set-code="${escapeAttr(safeSetCode)}" aria-pressed="${isActive ? "true" : "false"}" ${isLoading ? "disabled" : ""}>${renderLanguageBadgeHTML(lang, { active: isActive })}</button>`;
  }).join("");

  return `
    <div class="set-lang-toolbar-card${isLoading ? " is-loading" : ""}">
      <div class="set-lang-toolbar-copy">
        <div class="set-lang-toolbar-title">Idiomas base del set</div>
        <div class="set-lang-toolbar-hint">La tabla usa este idioma como vista principal.</div>
        ${isLoading ? `<div class="set-lang-toolbar-status" role="status" aria-live="polite"><span class="set-lang-toolbar-spinner" aria-hidden="true"></span><span>${escapeHtml(loadingText)}</span></div>` : ""}
      </div>
      <div class="lang-selector-shell" data-selector-context="set" ${isLoading ? 'aria-busy="true"' : ""}>
        <div class="lang-selector-top">
          <div class="lang-selector-buttons">${choicesHtml}</div>
        </div>
        ${renderLangResolutionNoteHTML(resolutionInfo)}
        ${feedback ? `<div class="set-lang-toolbar-feedback is-${escapeAttr(feedback.type || "info")}" role="status" aria-live="polite">${escapeHtml(feedback.message || "")}</div>` : ""}
      </div>
    </div>
  `;
}

function renderSetVisibleLangToolbar(setCode = setActualCode) {
  const toolbar = document.getElementById("setLangToolbar");
  if (!toolbar) return;

  const safeSetCode = String(setCode || "").trim().toLowerCase();
  if (!safeSetCode) {
    toolbar.innerHTML = "";
    toolbar.dataset.langSelectorOpen = "false";
    toolbar.dataset.setCode = "";
    toolbar.classList.add("hidden");
    return;
  }

  const panelOpen = toolbar.dataset.langSelectorOpen === "true";
  toolbar.dataset.setCode = safeSetCode;
  toolbar.innerHTML = renderSetVisibleLangSelectorHTML(safeSetCode, { panelOpen });
  toolbar.classList.remove("hidden");
}

function closeSetVisibleLangPanel() {
  const toolbar = document.getElementById("setLangToolbar");
  if (!toolbar || toolbar.dataset.langSelectorOpen !== "true") return;
  toolbar.dataset.langSelectorOpen = "false";
  renderSetVisibleLangToolbar(toolbar.dataset.setCode || setActualCode);
}

function setSetVisibleLangPanelOpen(isOpen) {
  const toolbar = document.getElementById("setLangToolbar");
  if (!toolbar) return;
  toolbar.dataset.langSelectorOpen = isOpen ? "true" : "false";
  renderSetVisibleLangToolbar(toolbar.dataset.setCode || setActualCode);
}

function refreshSetVisibleLangUI({ rerenderTable = true } = {}) {
  renderSetVisibleLangToolbar(setActualCode);
  if (rerenderTable && setActualKey) renderTablaSet(setActualKey);
}

async function syncOpenedSetToActiveVisibleLang(setCode = setActualCode, { rerenderTable = true } = {}) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  if (!safeSetCode) return;

  const activeLang = getActiveVisibleLang(safeSetCode);
  const resolvedTargetLang = resolveSetBaseLang(safeSetCode, activeLang || DEFAULT_APP_FALLBACK_LANG);
  const explicitTargetSetKey = resolvedTargetLang ? `${safeSetCode}__${resolvedTargetLang}` : "";

  if (safeSetCode === setActualCode && explicitTargetSetKey) {
    try {
      await ensureSetCardsLoaded(explicitTargetSetKey);
      if (cartasDeSetKey(explicitTargetSetKey).length > 0) {
        if (explicitTargetSetKey !== setActualKey) {
          await abrirSet(explicitTargetSetKey);
        } else {
          refreshSetVisibleLangUI({ rerenderTable });
        }
        return;
      }
    } catch (err) {
      console.warn(`No se pudo abrir ${explicitTargetSetKey} al sincronizar idioma visible:`, err);
    }
  }

  refreshSetVisibleLangUI({ rerenderTable });
}

function clearVisibleVariantOverridesForSet(setCode, { persist = true } = {}) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  if (!safeSetCode) return false;

  const uiPrefs = getUiPreferencesV3();
  const keyPrefix = `${safeSetCode}::`;
  let changed = false;

  for (const key of Object.keys(uiPrefs.selectedVariantByCard || {})) {
    if (!String(key || "").startsWith(keyPrefix)) continue;
    delete uiPrefs.selectedVariantByCard[key];
    changed = true;
  }

  for (const key of Object.keys(uiPrefs.visibleLangsByCard || {})) {
    if (!String(key || "").startsWith(keyPrefix)) continue;
    delete uiPrefs.visibleLangsByCard[key];
    changed = true;
  }

  if (persist && changed) guardarEstado3();
  return changed;
}

function getVisibleLangsForCard(setCode, oracleId, collectorNumber = "", fallbackLang = "en") {
  const key = buildVisibleVariantSelectionKey(setCode, oracleId, collectorNumber);
  const uiPrefs = getUiPreferencesV3();
  const stored = uiPrefs.visibleLangsByCard?.[key];
  const currentLang = normalizeLanguagePreferenceCode(getKnownCardById(getSelectedVariantPrintId(setCode, oracleId, collectorNumber))?.lang, fallbackLang)
    || normalizeLanguagePreferenceCode(uiPrefs.activeLangBySet?.[String(setCode || "").trim().toLowerCase()], fallbackLang)
    || normalizeLanguagePreferenceCode(fallbackLang, "en")
    || "en";
  if (Array.isArray(stored) && stored.length > 0) {
    return filterVisibleLangsForCard(setCode, oracleId, collectorNumber, stored, fallbackLang, currentLang);
  }
  return filterVisibleLangsForCard(setCode, oracleId, collectorNumber, getVisibleLangsForSet(setCode, fallbackLang), fallbackLang, currentLang);
}

function setVisibleLangsForCard(setCode, oracleId, collectorNumber, langs, { persist = true } = {}) {
  const key = buildVisibleVariantSelectionKey(setCode, oracleId, collectorNumber);
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const uiPrefs = getUiPreferencesV3();
  const currentLang = normalizeLanguagePreferenceCode(getKnownCardById(getSelectedVariantPrintId(safeSetCode, oracleId, collectorNumber))?.lang,
    uiPrefs.activeLangBySet?.[safeSetCode] || uiPrefs.preferredSetLang?.[safeSetCode] || "en") || "en";
  const normalizedLangs = filterVisibleLangsForCard(
    safeSetCode,
    oracleId,
    collectorNumber,
    langs,
    uiPrefs.activeLangBySet?.[safeSetCode] || uiPrefs.preferredSetLang?.[safeSetCode] || "en",
    currentLang
  );
  const inheritedSetLangs = filterVisibleLangsForCard(safeSetCode, oracleId, collectorNumber, getVisibleLangsForSet(safeSetCode, normalizedLangs[0]), normalizedLangs[0], currentLang);
  const previous = JSON.stringify(uiPrefs.visibleLangsByCard?.[key] || []);

  if (JSON.stringify(normalizedLangs) === JSON.stringify(inheritedSetLangs)) {
    delete uiPrefs.visibleLangsByCard[key];
  } else {
    uiPrefs.visibleLangsByCard[key] = normalizedLangs;
  }

  if (persist && previous !== JSON.stringify(uiPrefs.visibleLangsByCard?.[key] || [])) guardarEstado3();
  return [...(uiPrefs.visibleLangsByCard?.[key] || inheritedSetLangs)];
}

function setVisibleLangsForCardExactSet(setCode, oracleId, collectorNumber, langs, { persist = true } = {}) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const uiPrefs = getUiPreferencesV3();
  const currentLang = normalizeLanguagePreferenceCode(
    getKnownCardById(getSelectedVariantPrintId(safeSetCode, oracleId, collectorNumber))?.lang,
    uiPrefs.activeLangBySet?.[safeSetCode] || uiPrefs.preferredSetLang?.[safeSetCode] || "en"
  ) || "en";
  const available = new Set(getExactSetAvailableLangsForCard(safeSetCode, oracleId, collectorNumber, currentLang));
  const normalizedLangs = setSessionVisibleLangsForCardExact(
    safeSetCode,
    oracleId,
    collectorNumber,
    sortVariantLangCodes(
      normalizeLanguagePreferenceList(langs, {
        fallbackToEnglish: false,
        fallbackLang: getVisibleLangFallback(safeSetCode, currentLang)
      }).filter(lang => available.has(lang)),
      [currentLang, "en", "es"]
    ),
    currentLang
  );
  return [...normalizedLangs];
}

function getActiveVisibleLang(setCode, oracleId = "", collectorNumber = "", fallbackLang = "en") {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  const uiPrefs = getUiPreferencesV3();
  const visibleLangs = oracleId
    ? getVisibleLangsForCard(safeSetCode, oracleId, collectorNumber, fallbackLang)
    : getVisibleLangsForSet(safeSetCode, fallbackLang);
  const activeLang = normalizeLanguagePreferenceCode(uiPrefs.activeLangBySet?.[safeSetCode]);
  if (activeLang && visibleLangs.includes(activeLang)) return activeLang;

  const preferred = normalizeLanguagePreferenceCode(uiPrefs.preferredSetLang?.[safeSetCode]);
  if (preferred && visibleLangs.includes(preferred)) return preferred;

  return visibleLangs[0] || getVisibleLangFallback(safeSetCode, fallbackLang);
}

function getPreferredVisibleLang(setCode, fallbackLang = "en", oracleId = "", collectorNumber = "") {
  return getActiveVisibleLang(setCode, oracleId, collectorNumber, fallbackLang);
}

function setActiveVisibleLang(setCode, lang, { persist = true, syncLegacy = false } = {}) {
  const safeSetCode = String(setCode || "").trim().toLowerCase();
  if (!safeSetCode) return "";
  const uiPrefs = getUiPreferencesV3();
  const visibleLangs = getSetVisibleLangChoices(safeSetCode);
  const safeLang = resolveSetBaseLang(safeSetCode, lang || visibleLangs[0] || DEFAULT_APP_FALLBACK_LANG);
  const previousPreferred = uiPrefs.preferredSetLang[safeSetCode];
  const previousActive = uiPrefs.activeLangBySet[safeSetCode];

  uiPrefs.preferredSetLang[safeSetCode] = safeLang;
  uiPrefs.activeLangBySet[safeSetCode] = safeLang;

  if (!Array.isArray(uiPrefs.visibleLangsBySet?.[safeSetCode]) || !uiPrefs.visibleLangsBySet[safeSetCode].includes(safeLang)) {
    setVisibleLangsForSet(safeSetCode, [...visibleLangs, safeLang], { persist: false });
  }

  if (persist && (previousPreferred !== safeLang || previousActive !== safeLang)) guardarEstado3();

  if (syncLegacy) syncLegacyUiLangCacheForSet(safeSetCode, safeLang);
  return safeLang;
}

function setPreferredVisibleLang(setCode, lang, { persist = true, syncLegacy = false } = {}) {
  return setActiveVisibleLang(setCode, lang, { persist, syncLegacy });
}

function getNextVisibleLang(setCode, currentLang, oracleId = "", collectorNumber = "", fallbackLang = "en") {
  const visibleLangs = getVisibleLangsForCard(setCode, oracleId, collectorNumber, fallbackLang);
  if (visibleLangs.length <= 1) return "";
  const safeCurrent = normalizeLanguagePreferenceCode(currentLang, visibleLangs[0]) || visibleLangs[0];
  const currentIndex = visibleLangs.indexOf(safeCurrent);
  if (currentIndex === -1) return visibleLangs[0];
  return visibleLangs[(currentIndex + 1) % visibleLangs.length] || "";
}

function getSelectedVariantPrintId(setCode, oracleId, collectorNumber = "") {
  const uiPrefs = getUiPreferencesV3();
  const key = buildVisibleVariantSelectionKey(setCode, oracleId, collectorNumber);
  const selected = String(uiPrefs.selectedVariantByCard?.[key] || "").trim();
  if (selected && !isSelectedVariantPrintIdValid(setCode, oracleId, collectorNumber, selected)) {
    delete uiPrefs.selectedVariantByCard[key];
    return "";
  }
  return selected || "";
}

function setSelectedVariantPrintId(setCode, oracleId, collectorNumber, printId) {
  const safePrintId = String(printId || "").trim();
  const uiPrefs = getUiPreferencesV3();
  const key = buildVisibleVariantSelectionKey(setCode, oracleId, collectorNumber);
  const previousPrintId = String(uiPrefs.selectedVariantByCard?.[key] || "").trim();
  if (!safePrintId) {
    delete uiPrefs.selectedVariantByCard[key];
  } else if (!isSelectedVariantPrintIdValid(setCode, oracleId, collectorNumber, safePrintId)) {
    return;
  } else {
    uiPrefs.selectedVariantByCard[key] = safePrintId;
  }
  if (previousPrintId !== String(uiPrefs.selectedVariantByCard?.[key] || "").trim()) {
    guardarEstado3();
  }
}

function getKnownCardById(printId) {
  const key = String(printId || "").trim();
  if (!key) return null;

  for (const cartas of Object.values(cacheCartasPorSetLang || {})) {
    if (!Array.isArray(cartas)) continue;
    const found = cartas.find(c => String(c?.id || "") === key);
    if (found) return found;
  }

  for (const variants of Object.values(cacheCardByOracleLang || {})) {
    if (!variants || typeof variants !== "object") continue;
    for (const variant of Object.values(variants)) {
      if (String(variant?.id || "") === key) return normalizeVisibleVariantCard(variant);
    }
  }

  return null;
}

function normalizeVisibleVariantCard(card, fallbackCard = null) {
  if (!card) return fallbackCard;

  if (card.nombre && card.numero !== undefined && card._img !== undefined) {
    return card;
  }

  const fallbackMeta = fallbackCard ? extractCatalogPrintMeta(fallbackCard, fallbackCard.setKey || "") : null;
  const cardMeta = extractCatalogPrintMeta(card, card.setKey || fallbackMeta?.setKey || "");
  const lang = String(card.lang || fallbackMeta?.lang || "en").toLowerCase();
  const setCode = String(card.setCode || card.set || card._raw?.set || fallbackMeta?.setCode || "").toLowerCase();
  const collectorNumber = String(card.collector_number || card.collectorNumber || card.numero || fallbackMeta?.collectorNumber || "");

  return {
    id: String(card.id || fallbackCard?.id || ""),
    oracle_id: String(card.oracle_id || fallbackCard?.oracle_id || cardMeta?.oracleId || ""),
    setCode,
    set: setCode,
    setKey: card.setKey || fallbackCard?.setKey || (setCode ? `${setCode}__${lang}` : ""),
    set_name: card.set_name || card._raw?.set_name || fallbackCard?.set_name || "",
    nombre: card.nombre || pickCardName(card, lang) || card.printed_name || card.name || fallbackCard?.nombre || "Carta",
    numero: collectorNumber,
    collector_number: collectorNumber,
    rareza: card.rareza || mapRarity(card.rarity),
    lang,
    releasedAt: card.releasedAt || card.released_at || fallbackCard?.releasedAt || "",
    type_line: card.type_line || fallbackCard?.type_line || "",
    cmc: card.cmc ?? fallbackCard?.cmc ?? 0,
    color_identity: card.color_identity || fallbackCard?.color_identity || [],
    _img: card._img || pickImage(card) || fallbackCard?._img || null,
    _prices: card._prices || card.prices || fallbackCard?._prices || null,
    _colors: card._colors || card.colors || fallbackCard?._colors || null,
    _raw: card._raw || card,
    _variantResolution: card._variantResolution || fallbackCard?._variantResolution || "",
    _variantResolutionReason: card._variantResolutionReason || fallbackCard?._variantResolutionReason || ""
  };
}

function buildManualVisibleVariantFallback(card, targetLang) {
  const base = normalizeVisibleVariantCard(card, card);
  const safeLang = normalizePhase1ManualLangCode(targetLang, base.lang || "en") || base.lang || "en";
  const setCode = String(base.setCode || base.set || "").trim().toLowerCase();
  return normalizeVisibleVariantCard({
    ...base,
    lang: safeLang,
    setKey: setCode ? `${setCode}__${safeLang}` : base.setKey,
    _variantResolution: "manual-fallback",
    _variantResolutionReason: "manual-lang-no-print"
  }, base);
}

function findCachedVariantForCard(card, lang) {
  const base = normalizeVisibleVariantCard(card, card);
  const oracleId = String(base.oracle_id || "").trim();
  const setCode = String(base.setCode || parseSetKeyParts(base.setKey).code || "").trim().toLowerCase();
  const collectorNumber = normalizeCollectorNumberKey(base.collector_number || base.numero || "");
  const targetLang = String(lang || "en").trim().toLowerCase();

  if (!oracleId || !setCode) return null;

  const setKey = `${setCode}__${targetLang}`;
  const cachedSetCards = cacheCartasPorSetLang[setKey] || [];
  const exact = cachedSetCards.find(c => String(c.oracle_id || "") === oracleId && normalizeCollectorNumberKey(c.collector_number || c.numero || "") === collectorNumber);
  if (exact) return normalizeVisibleVariantCard(exact, base);

  if (collectorNumber) {
    const byCollectorKey = `${setCode}::${collectorNumber}::${targetLang}`;
    const byCollectorPrintId = [...(catalogPrintsBySetCollectorLang[byCollectorKey] || [])].sort(compareCatalogPrintIds)[0];
    if (byCollectorPrintId) {
      const byCollectorCard = getKnownCardById(byCollectorPrintId);
      if (byCollectorCard) return normalizeVisibleVariantCard(byCollectorCard, base);
    }
  }

  if (!collectorNumber) {
    const generic = cachedSetCards.find(c => String(c.oracle_id || "") === oracleId);
    if (generic) return normalizeVisibleVariantCard(generic, base);
  }

  const cachedByLang = cacheCardByOracleLang[oracleId]?.[targetLang];
  if (cachedByLang) {
    const cachedVariantCollector = normalizeCollectorNumberKey(cachedByLang?.collector_number || cachedByLang?.numero || "");
    const cachedVariantSetCode = String(cachedByLang?.setCode || cachedByLang?.set || cachedByLang?._raw?.set || "").trim().toLowerCase();
    const sameCollector = !collectorNumber || !cachedVariantCollector || cachedVariantCollector === collectorNumber;
    const sameSet = !setCode || !cachedVariantSetCode || cachedVariantSetCode === setCode;
    if (sameCollector && sameSet) return normalizeVisibleVariantCard(cachedByLang, base);
  }

  return null;
}

async function resolveVisibleVariantForCard(card, preferredLang = null) {
  const base = normalizeVisibleVariantCard(card, card);
  const oracleId = String(base.oracle_id || "").trim();
  const setCode = String(base.setCode || parseSetKeyParts(base.setKey).code || "").trim().toLowerCase();
  const collectorNumber = String(base.collector_number || base.numero || "").trim();
  const fallbackLang = String(base.lang || "en").trim().toLowerCase() || "en";
  const visibleLangs = getVisibleLangsForCard(setCode, oracleId, collectorNumber, fallbackLang);
  const requestedLang = preferredLang ? getVisibleLangFallback(setCode, preferredLang) : getPreferredVisibleLang(setCode, fallbackLang, oracleId, collectorNumber);
  const targetLang = visibleLangs.includes(requestedLang) ? requestedLang : (visibleLangs[0] || requestedLang);

  const selectedPrintId = getSelectedVariantPrintId(setCode, oracleId, collectorNumber);
  if (selectedPrintId) {
    const selectedCard = getKnownCardById(selectedPrintId);
    if (selectedCard) {
      const normalizedSelected = normalizeVisibleVariantCard(selectedCard, base);
      if (!preferredLang || normalizedSelected.lang === targetLang) {
        return normalizedSelected;
      }
    }
  }

  if (base.lang === targetLang) return base;

  const cached = findCachedVariantForCard(base, targetLang);
  if (cached) return cached;

  const fetched = await getPrintByOracleLang(oracleId, targetLang, setCode, collectorNumber);
  if (fetched) return normalizeVisibleVariantCard(fetched, base);
  if (isManualLangAllowedForCard(setCode, oracleId, collectorNumber, targetLang)) {
    return buildManualVisibleVariantFallback(base, targetLang);
  }
  return base;
}

function getCurrentVisibleVariantCardForElement(element, fallbackCard = null) {
  if (!element) return fallbackCard;

  const modalBody = element.id === "modalCartaBody" ? element : element.closest("#modalCartaBody");
  if (modalBody) {
    const currentPrintId = String(modalBody.dataset.currentPrintId || "").trim();
    const currentLang = normalizeLanguagePreferenceCode(modalBody.dataset.activeLang, fallbackCard?.lang || "en") || fallbackCard?.lang || "en";
    const knownCard = getKnownCardById(currentPrintId);
    if (knownCard) {
      const normalizedKnown = normalizeVisibleVariantCard(knownCard, fallbackCard);
      if (normalizedKnown.lang !== currentLang) {
        return buildManualVisibleVariantFallback(normalizedKnown, currentLang);
      }
      return normalizedKnown;
    }
    return normalizeVisibleVariantCard({
      id: currentPrintId,
      oracle_id: modalBody.dataset.oracle || fallbackCard?.oracle_id || "",
      setCode: modalBody.dataset.setCode || fallbackCard?.setCode || fallbackCard?.set || "",
      set: modalBody.dataset.setCode || fallbackCard?.setCode || fallbackCard?.set || "",
      collector_number: modalBody.dataset.collectorNumber || fallbackCard?.collector_number || fallbackCard?.numero || "",
      numero: modalBody.dataset.collectorNumber || fallbackCard?.collector_number || fallbackCard?.numero || "",
      lang: currentLang
    }, fallbackCard);
  }

  const cartaItem = element.classList?.contains("carta-item") ? element : element.closest(".carta-item");
  if (cartaItem) {
    const currentPrintId = String(cartaItem.dataset.visiblePrintId || cartaItem.dataset.cardId || "").trim();
    const currentLang = normalizeLanguagePreferenceCode(cartaItem.dataset.visibleLang, fallbackCard?.lang || "en") || fallbackCard?.lang || "en";
    const knownCard = getKnownCardById(currentPrintId);
    if (knownCard) {
      const normalizedKnown = normalizeVisibleVariantCard(knownCard, fallbackCard);
      if (normalizedKnown.lang !== currentLang) {
        return buildManualVisibleVariantFallback(normalizedKnown, currentLang);
      }
      return normalizedKnown;
    }
    return normalizeVisibleVariantCard({
      id: currentPrintId,
      oracle_id: cartaItem.dataset.oracle || fallbackCard?.oracle_id || "",
      setCode: cartaItem.dataset.setCode || fallbackCard?.setCode || fallbackCard?.set || "",
      set: cartaItem.dataset.setCode || fallbackCard?.setCode || fallbackCard?.set || "",
      collector_number: cartaItem.dataset.collectorNumber || fallbackCard?.collector_number || fallbackCard?.numero || "",
      numero: cartaItem.dataset.collectorNumber || fallbackCard?.collector_number || fallbackCard?.numero || "",
      lang: currentLang
    }, fallbackCard);
  }

  return fallbackCard;
}

function syncVisibleVariantSelectorUI(element, variantCard) {
  const currentCard = getCurrentVisibleVariantCardForElement(element, variantCard);
  if (!currentCard) return;

  const host = element.id === "modalCartaBody" ? element : (element.classList?.contains("carta-item") ? element : element.closest(".carta-item"));
  if (!host) return;

  const controls = host.querySelector(".carta-controles");
  const header = controls?.querySelector(".controles-header");
  if (!controls || !header) return;

  const panelOpen = controls.dataset.langSelectorOpen === "true";
  const langMode = controls.dataset.langMode || getCardControlsConfig().langMode || "both";
  const context = controls.classList.contains("modal-controles") ? "modal" : "card";
  const variantScope = controls.dataset.variantScope || getVariantScopeForElement(host);
  const feedback = getVisibleVariantSelectorFeedback(controls);
  controls.dataset.langSelectorLocked = shouldLockVisibleVariantSelector({ context, variantScope }) ? "true" : "false";
  header.innerHTML = renderVisibleVariantSelectorHTML(currentCard, { langMode, panelOpen, context, variantScope, feedback });
}

function closeAllVisibleVariantPanels(exceptControls = null) {
  document.querySelectorAll('.carta-controles[data-lang-selector-open="true"]').forEach(controls => {
    if (exceptControls && controls === exceptControls) return;
    controls.dataset.langSelectorOpen = "false";
    const host = controls.classList.contains("modal-controles")
      ? document.getElementById("modalCartaBody")
      : controls.closest(".carta-item");
    if (host?.classList?.contains("carta-item")) {
      host.classList.remove("has-open-lang-panel");
    }
    const currentCard = getCurrentVisibleVariantCardForElement(host);
    if (host && currentCard) syncVisibleVariantSelectorUI(host, currentCard);
  });
}

function setVisibleVariantPanelOpen(controls, isOpen) {
  if (!controls) return;
  controls.dataset.langSelectorOpen = isOpen ? "true" : "false";
  const host = controls.classList.contains("modal-controles")
    ? document.getElementById("modalCartaBody")
    : controls.closest(".carta-item");
  if (host?.classList?.contains("carta-item")) {
    host.classList.toggle("has-open-lang-panel", !!isOpen);
  }
  const currentCard = getCurrentVisibleVariantCardForElement(host);
  if (host && currentCard) syncVisibleVariantSelectorUI(host, currentCard);
}

async function selectVisibleVariantLangForElement(element, lang, fallbackCard = null) {
  const currentCard = getCurrentVisibleVariantCardForElement(element, fallbackCard);
  if (!currentCard) return null;

  const normalized = normalizeVisibleVariantCard(currentCard, currentCard);
  const setCode = String(normalized.setCode || normalized.set || "").toLowerCase();
  const oracleId = String(normalized.oracle_id || "");
  const collectorNumber = String(normalized.collector_number || normalized.numero || "");
  const targetLang = normalizeLanguagePreferenceCode(lang, normalized.lang || "en") || normalized.lang || "en";
  const variantScope = getVariantScopeForElement(element);
  const shouldShowExactLoadHint = variantScope === "set-exact"
    && !!setCode
    && targetLang !== normalizeLanguagePreferenceCode(normalized.lang, "en")
    && !hasLoadedSetLangBucket(setCode, targetLang);

  if (shouldShowExactLoadHint) {
    setSetListLoadingState(true, `Cargando cartas en ${getLangDisplayLabel(targetLang)}...`);
  }

  let variantCard = null;
  try {
    variantCard = variantScope === "set-exact"
      ? await resolveExactSetVariantForCard(normalized, targetLang)
      : await resolveVisibleVariantForCard(normalized, targetLang);
  } finally {
    if (shouldShowExactLoadHint && !(setLangToolbarLoadingState?.busy && setLangToolbarLoadingState?.setCode === setCode)) {
      setSetListLoadingState(false);
    }
  }
  if (!variantCard) return null;

  if (variantCard.id) {
    setSelectedVariantPrintId(setCode, oracleId, collectorNumber, variantCard.id);
  }

  const modalBody = document.getElementById("modalCartaBody");
  const setCard = document.querySelector(`.carta-item[data-set-code="${CSS.escape(setCode)}"][data-collector-number="${CSS.escape(collectorNumber)}"]`);

  if (setCard) applyVisibleVariantToCardItem(setCard, variantCard);
  if (modalBody
    && String(modalBody.dataset.setCode || "").toLowerCase() === setCode
    && String(modalBody.dataset.collectorNumber || "") === collectorNumber) {
    applyVisibleVariantToModal(modalBody, variantCard);
  }

  return normalizeVisibleVariantCard(variantCard, normalized);
}

async function updateVisibleLangSelectionForElement(element, nextVisibleLangs, fallbackCard = null) {
  const currentCard = getCurrentVisibleVariantCardForElement(element, fallbackCard);
  if (!currentCard) return null;

  const normalized = normalizeVisibleVariantCard(currentCard, currentCard);
  const setCode = String(normalized.setCode || normalized.set || "").toLowerCase();
  const oracleId = String(normalized.oracle_id || "");
  const collectorNumber = String(normalized.collector_number || normalized.numero || "");
  const variantScope = getVariantScopeForElement(element);
  const normalizedLangs = variantScope === "set-exact"
    ? setVisibleLangsForCardExactSet(setCode, oracleId, collectorNumber, nextVisibleLangs, { persist: true })
    : setVisibleLangsForCard(setCode, oracleId, collectorNumber, nextVisibleLangs, { persist: true });
  const safeVisibleLangs = sortVariantLangCodes(normalizedLangs, [normalized.lang, "en", "es"]);
  const currentLang = normalizeLanguagePreferenceCode(normalized.lang, safeVisibleLangs[0]) || safeVisibleLangs[0];
  const nextLang = safeVisibleLangs.includes(currentLang) ? currentLang : (safeVisibleLangs[0] || currentLang);
  if (!safeVisibleLangs.includes(currentLang)) {
    setSelectedVariantPrintId(setCode, oracleId, collectorNumber, "");
  }
  return selectVisibleVariantLangForElement(element, nextLang, normalized);
}

function applyVisibleVariantToCardItem(cartaItem, variantCard) {
  if (!cartaItem || !variantCard) return;

  const normalized = normalizeVisibleVariantCard(variantCard, variantCard);
  const visibleLang = String(normalized.lang || "en").trim().toLowerCase() || "en";
  const normalizedSetCode = String(normalized.setCode || normalized.set || "").trim().toLowerCase();
  const normalizedCollectorNumber = String(normalized.collector_number || normalized.numero || "").trim();
  const normalizedOracleId = String(normalized.oracle_id || "").trim();

  cartaItem.dataset.visiblePrintId = String(normalized.id || "");
  cartaItem.dataset.visibleLang = visibleLang;
  cartaItem.dataset.cardId = String(normalized.id || "");
  if (normalizedOracleId) cartaItem.dataset.oracle = normalizedOracleId;
  if (normalizedSetCode) cartaItem.dataset.setCode = normalizedSetCode;
  if (normalizedCollectorNumber) cartaItem.dataset.collectorNumber = normalizedCollectorNumber;

  const btnCarta = cartaItem.querySelector('.btn-link-carta');
  if (btnCarta) {
    btnCarta.dataset.id = String(normalized.id || "");
    if (normalizedOracleId) btnCarta.dataset.oracle = normalizedOracleId;
    if (normalizedSetCode) btnCarta.dataset.setCode = normalizedSetCode;
    if (normalizedCollectorNumber) btnCarta.dataset.collectorNumber = normalizedCollectorNumber;
    btnCarta.textContent = normalized.nombre || "Carta";
  }

  const numero = cartaItem.querySelector('.carta-numero');
  if (numero) numero.textContent = `#${normalizedCollectorNumber}`;

  const img = cartaItem.querySelector('.carta-imagen');
  if (img) {
    img.alt = normalized.nombre || "Carta";
    img.dataset.oracle = normalizedOracleId;
    img.dataset.set = normalizedSetCode;
    img.dataset.numero = normalizedCollectorNumber;
    if (normalized._img) loadImageWithCache(img, normalized._img);
  }

  const controles = cartaItem.querySelector('.carta-controles');
  if (controles) {
    controles.dataset.activeLang = visibleLang;
  }
  syncVisibleVariantSelectorUI(cartaItem, normalized);
}

function applyVisibleVariantToModal(container, variantCard) {
  if (!container || !variantCard) return;
  const normalized = normalizeVisibleVariantCard(variantCard, variantCard);
  const modal = document.getElementById('modalCarta');
  const titulo = document.getElementById('modalCartaTitulo');
  if (titulo) titulo.textContent = normalized.nombre || 'Carta';

  container.dataset.currentPrintId = String(normalized.id || '');
  container.dataset.activeLang = String(normalized.lang || 'en');
  container.dataset.setCode = String(normalized.setCode || normalized.set || '');
  container.dataset.collectorNumber = String(normalized.collector_number || normalized.numero || '');

  const img = container.querySelector('#imgCartaModal') || container.querySelector('img[data-img-url]');
  if (img && normalized._img) {
    img.alt = normalized.nombre || 'Carta';
    loadImageWithCache(img, normalized._img);
  }

  const info = container.querySelector('#modalCartaInfoLinea');
  if (info) {
    info.textContent = [normalized.collector_number ? `#${normalized.collector_number}` : '', normalized.rareza || ''].filter(Boolean).join(' · ');
  }

  const precio = container.querySelector('#modalCartaPrecio');
  if (precio) {
    precio.textContent = `Precio orientativo: ${formatPrecioEUR(normalized._prices)}`;
  }

  const btnSwitch = modal?.querySelector('.btn-modal-lang-switch');
  const visibleLang = String(normalized.lang || 'en').toLowerCase() || 'en';
  const controls = container.querySelector('.carta-controles');
  if (controls) controls.dataset.activeLang = visibleLang;
  if (btnSwitch) btnSwitch.remove();
  syncVisibleVariantSelectorUI(container, normalized);
}

// Buscar print de una carta por oracle_id y lang en Scryfall
async function getPrintByOracleLang(oracle_id, lang, preferredSetCode = null, preferredCollectorNumber = null) {
  if (!oracle_id) return null;
  const normalizedPreferredSetCode = String(preferredSetCode || "").trim().toLowerCase();
  const normalizedPreferredCollector = normalizeCollectorNumberKey(preferredCollectorNumber || "");
  
  // Si es EN, devolver la carta ya cargada (no fetch adicional)
  if (lang === "en") {
    if (normalizedPreferredSetCode && normalizedPreferredCollector) {
      const byCollectorKey = `${normalizedPreferredSetCode}::${normalizedPreferredCollector}::en`;
      const byCollectorPrintId = [...(catalogPrintsBySetCollectorLang[byCollectorKey] || [])].sort(compareCatalogPrintIds)[0];
      if (byCollectorPrintId) {
        const byCollectorCard = getKnownCardById(byCollectorPrintId);
        if (byCollectorCard) {
          if (!cacheCardByOracleLang[oracle_id]) cacheCardByOracleLang[oracle_id] = {};
          cacheCardByOracleLang[oracle_id].en = byCollectorCard;
          return byCollectorCard;
        }
      }
    }

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
    const cachedEs = cacheCardByOracleLang[oracle_id].es;
    const cachedEsSetCode = String(cachedEs?.setCode || cachedEs?.set || cachedEs?._raw?.set || "").trim().toLowerCase();
    const cachedEsCollector = normalizeCollectorNumberKey(cachedEs?.collector_number || cachedEs?.numero || "");
    const exactPreferredMatch = !normalizedPreferredSetCode || !normalizedPreferredCollector
      || (cachedEsSetCode === normalizedPreferredSetCode && cachedEsCollector === normalizedPreferredCollector);
    if (exactPreferredMatch) {
    console.log(`✓ Print ES cacheado para oracle ${oracle_id}`);
      return cachedEs;
    }
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
    
    // Si se pidió una carta concreta del set y no existe esa misma impresión en el idioma objetivo,
    // no saltar a otra versión/arte de la carta.
    if (!selectedCard && normalizedPreferredSetCode && normalizedPreferredCollector) {
      fetchingPrints.delete(fetchKey);
      return null;
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
  rebuildCatalogIndexesV3();
  guardarOracleCache();
  console.log(`Índice oracle_id construido: ${Object.keys(oracleToIds).length} cartas únicas, ${Object.keys(catalogPrintMetaById).length} prints indexados`);
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
    const lang = normalizeLegacyPossessionLang(cached.lang || "en");
    const adapter = getLegacyPossessionAdapterForState(id);
    const langState = adapter.langs[lang] || createEmptyLegacyPossessionLangEntry();
    
    return {
      qty: langState.qty,
      foilQty: langState.foil,
      playedQty: 0, // No usado
      wantMore: langState.ri
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
// Scryfall - búsqueda por nombre (EN/ES en producto actual)
// ===============================

function getSearchLangs() {
  const langs = (typeof getUiEnabledSetLangs === "function" ? getUiEnabledSetLangs() : ["en", "es"])
    .map(lang => normalizeLanguagePreferenceCode(lang))
    .filter(Boolean);
  return langs.length > 0 ? [...new Set(langs)] : ["en", "es"];
}

function buildSearchLangClause() {
  const langs = getSearchLangs();
  if (langs.length === 1) return `lang:${langs[0]}`;
  return `(${langs.map(lang => `lang:${lang}`).join(" or ")})`;
}

const SEARCH_LIMIT = 200; // evita bajar 1000+ prints en cartas hiper reimpresas
const COMMANDER_SEARCH_LIMIT = 200;
const SEARCH_AUTOCOMPLETE_MIN_CHARS = 3;
const SEARCH_AUTOCOMPLETE_LIMIT = 12;
const SEARCH_AUTOCOMPLETE_DEBOUNCE_MS = 180;
let buscarExacta = false;
let buscarVerImagenes = true;
let searchAutocompleteTimer = null;
let searchAutocompleteRequestSeq = 0;
let buscarSuggestionsVisible = false;
let buscarSuggestionsItems = [];
let buscarSuggestionsActiveIndex = -1;
let buscarSuggestionsSource = "remote";

function getBuscarSuggestionsElements() {
  return {
    input: document.getElementById("inputBuscar"),
    list: document.getElementById("buscarCardSuggestions")
  };
}

function getBuscarSuggestionsQuery() {
  return String(getBuscarSuggestionsElements().input?.value || "").trim();
}

function formatBuscarSuggestionLabel(nombre, query) {
  const suggestion = String(nombre || "");
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("es");
  if (!normalizedQuery) return escapeHtml(suggestion);

  const matchIndex = suggestion.toLocaleLowerCase("es").indexOf(normalizedQuery);
  if (matchIndex < 0) return escapeHtml(suggestion);

  const matchEnd = matchIndex + normalizedQuery.length;
  return [
    escapeHtml(suggestion.slice(0, matchIndex)),
    `<mark class="buscar-sugerencias-match">${escapeHtml(suggestion.slice(matchIndex, matchEnd))}</mark>`,
    escapeHtml(suggestion.slice(matchEnd))
  ].join("");
}

function renderBuscarSuggestionsList() {
  const { input, list } = getBuscarSuggestionsElements();
  if (!input || !list) return;

  const shouldShow = buscarSuggestionsVisible && buscarSuggestionsItems.length > 0;
  input.setAttribute("aria-expanded", shouldShow ? "true" : "false");
  list.classList.toggle("hidden", !shouldShow);

  if (!shouldShow) {
    list.innerHTML = "";
    return;
  }

  const query = getBuscarSuggestionsQuery();
  const sourceBanner = buscarSuggestionsSource === "local"
    ? `<div class="buscar-sugerencias-source" role="note">Sugerencias locales</div>`
    : "";

  const itemsHtml = buscarSuggestionsItems.map((nombre, index) => {
    const isActive = index === buscarSuggestionsActiveIndex;
    return `
      <button
        type="button"
        class="buscar-sugerencias-item${isActive ? " is-active" : ""}"
        data-suggestion-index="${index}"
        role="option"
        aria-selected="${isActive ? "true" : "false"}"
      >
        <span class="buscar-sugerencias-texto">${formatBuscarSuggestionLabel(nombre, query)}</span>
        <span class="buscar-sugerencias-pill">Carta</span>
      </button>
    `;
  }).join("");

  list.innerHTML = `${sourceBanner}${itemsHtml}`;
}

function updateBuscarSuggestions(items, { visible = true, source = "remote" } = {}) {
  buscarSuggestionsItems = Array.isArray(items) ? items.slice(0, SEARCH_AUTOCOMPLETE_LIMIT) : [];
  buscarSuggestionsActiveIndex = buscarSuggestionsItems.length ? 0 : -1;
  buscarSuggestionsVisible = visible && buscarSuggestionsItems.length > 0;
  buscarSuggestionsSource = source === "local" ? "local" : "remote";
  renderBuscarSuggestionsList();
}

function setBuscarSuggestionsVisible(visible) {
  buscarSuggestionsVisible = !!visible && buscarSuggestionsItems.length > 0;
  renderBuscarSuggestionsList();
}

function moveBuscarSuggestionsActive(delta) {
  if (!buscarSuggestionsItems.length) return;
  const total = buscarSuggestionsItems.length;
  const nextIndex = buscarSuggestionsActiveIndex < 0
    ? 0
    : (buscarSuggestionsActiveIndex + delta + total) % total;
  buscarSuggestionsActiveIndex = nextIndex;
  buscarSuggestionsVisible = true;
  renderBuscarSuggestionsList();
}

function applyBuscarSuggestion(nombre) {
  const { input } = getBuscarSuggestionsElements();
  if (!input) return;
  input.value = String(nombre || "");
  clearBuscarSuggestions();
}

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

  // Solo papel, idiomas visibles soportados por producto actual y búsqueda flexible por nombre.
  const query = `game:paper ${buildSearchLangClause()} ${nameClause}`;
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

async function scryAutocompleteCardNames(texto, opts = {}) {
  const qUser = String(texto || "").trim();
  if (!qUser || qUser.length < SEARCH_AUTOCOMPLETE_MIN_CHARS) return [];

  const q = encodeURIComponent(qUser);
  const url = `${SCY_BASE}/cards/autocomplete?q=${q}`;

  try {
    const data = await scryFetchJson(url, opts);
    const items = Array.isArray(data?.data) ? data.data : [];
    return items
      .map(name => String(name || "").trim())
      .filter(Boolean)
      .slice(0, SEARCH_AUTOCOMPLETE_LIMIT);
  } catch (err) {
    if (err.status === 404 && err.data && err.data.object === "error" && err.data.code === "not_found") {
      return [];
    }
    throw err;
  }
}

function localAutocompleteCardNames(texto, limit = SEARCH_AUTOCOMPLETE_LIMIT) {
  const q = normalizarTexto(String(texto || "").trim());
  if (!q || q.length < SEARCH_AUTOCOMPLETE_MIN_CHARS) return [];

  const unique = new Map();
  const max = Math.max(1, Number(limit) || SEARCH_AUTOCOMPLETE_LIMIT);

  const tryAdd = (nameRaw) => {
    const name = String(nameRaw || "").trim();
    if (!name) return;
    const key = normalizarTexto(name);
    if (!key || unique.has(key)) return;
    if (!key.includes(q)) return;
    unique.set(key, name);
  };

  const scanCards = (cards) => {
    for (const card of (cards || [])) {
      tryAdd(card?.nombre);
      tryAdd(card?.name);
      tryAdd(card?.printed_name);
      tryAdd(card?._raw?.printed_name);
      tryAdd(card?._raw?.name);
      if (unique.size >= max) return true;
    }
    return false;
  };

  if (scanCards(cartas)) return [...unique.values()];

  const bySetLang = Object.values(cacheCartasPorSetLang || {});
  for (const cards of bySetLang) {
    if (scanCards(cards)) break;
  }

  return [...unique.values()]
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    .slice(0, max);
}

function clearBuscarSuggestions() {
  searchAutocompleteRequestSeq += 1;

  if (searchAutocompleteTimer) {
    clearTimeout(searchAutocompleteTimer);
    searchAutocompleteTimer = null;
  }

  cancelSearchAutocompleteAbort();

  buscarSuggestionsItems = [];
  buscarSuggestionsActiveIndex = -1;
  buscarSuggestionsVisible = false;
  buscarSuggestionsSource = "remote";
  renderBuscarSuggestionsList();
}

async function actualizarBuscarSuggestions(texto, seq) {
  const { list } = getBuscarSuggestionsElements();
  if (!list) return;

  const q = String(texto || "").trim();
  if (q.length < SEARCH_AUTOCOMPLETE_MIN_CHARS) {
    clearBuscarSuggestions();
    return;
  }

  cancelSearchAutocompleteAbort();
  searchAutocompleteAbortController = new AbortController();

  let sugerencias = [];
  let source = "remote";
  try {
    sugerencias = await scryAutocompleteCardNames(q, { signal: searchAutocompleteAbortController.signal });
  } catch (err) {
    if (err && err.name === "AbortError") return;
    console.warn("No se pudieron cargar sugerencias remotas de búsqueda. Se usa fallback local:", err);
    sugerencias = localAutocompleteCardNames(q);
    source = "local";
  }

  if (seq !== searchAutocompleteRequestSeq) return;

  if (!sugerencias.length) {
    clearBuscarSuggestions();
    return;
  }

  updateBuscarSuggestions(sugerencias, { visible: true, source });
}

function programarBuscarSuggestions(texto) {
  const q = String(texto || "");

  if (searchAutocompleteTimer) {
    clearTimeout(searchAutocompleteTimer);
    searchAutocompleteTimer = null;
  }

  if (q.trim().length < SEARCH_AUTOCOMPLETE_MIN_CHARS) {
    clearBuscarSuggestions();
    return;
  }

  const seq = ++searchAutocompleteRequestSeq;
  searchAutocompleteTimer = setTimeout(() => {
    searchAutocompleteTimer = null;
    actualizarBuscarSuggestions(q, seq);
  }, SEARCH_AUTOCOMPLETE_DEBOUNCE_MS);
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

async function scrySearchRandomCommander(query, opts = {}) {
  if (!query) return null;

  const params = new URLSearchParams();
  params.append("q", query);
  params.append("unique", "cards");

  const firstUrl = `${SCY_BASE}/cards/search?${params.toString()}`;

  try {
    const firstPage = await scryFetchJson(firstUrl, opts);
    const totalCards = Number(firstPage?.total_cards || 0);
    const firstData = Array.isArray(firstPage?.data) ? firstPage.data : [];
    if (totalCards <= 0 || firstData.length === 0) return null;

    const pageSize = 175;
    const randomIndex = Math.floor(Math.random() * totalCards);
    const targetPage = Math.floor(randomIndex / pageSize) + 1;
    const indexInPage = randomIndex % pageSize;
    const pageData = targetPage === 1
      ? firstData
      : (await scryFetchJson(`${firstUrl}&page=${targetPage}`, opts))?.data || [];

    return pageData[indexInPage] || pageData[pageData.length - 1] || null;
  } catch (err) {
    if (err.status === 404 && err.data && err.data.object === "error" && err.data.code === "not_found") {
      return null;
    }
    throw err;
  }
}

async function scrySearchCommanderPrintsByOracle(oracleId, opts = {}) {
  const safeOracleId = String(oracleId || "").trim();
  if (!safeOracleId) return [];

  const query = `game:paper ${buildSearchLangClause()} oracleid:${safeOracleId}`;
  const q = encodeURIComponent(query);
  const url = `${SCY_BASE}/cards/search?q=${q}&unique=prints&order=released&dir=desc`;

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
  return chk ? !chk.checked : !!buscarVerImagenes;
}

function agruparResultadosBusqueda(cards) {
  // Agrupar por oracle_id (misma carta a través de reimpresiones y idiomas)
  const map = new Map();

  for (const card of (cards || [])) {
    const lang = String(card.lang || "").toLowerCase();
    if (!getSearchLangs().includes(lang)) continue;

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
        // Estado por impresión (id)
        const st2 = getEstadoCartaCompatV3(v.id);

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

    const preferredNames = [];
    for (const lang of getSearchLangs()) {
      const version = versionesRaw.find(item => normalizeLanguagePreferenceCode(item?.lang) === lang);
      if (!version) continue;
      const displayName = String(
        lang === "en"
          ? (version.name || version.printed_name || "")
          : (version.printed_name || version.name || "")
      ).trim();
      if (displayName) preferredNames.push(displayName);
    }

    const uniquePreferredNames = [...new Set(preferredNames.map(name => name.trim()))].filter(Boolean);
    let titulo = uniquePreferredNames[0] || versionesRaw[0]?.printed_name || versionesRaw[0]?.name || "Carta";
    if (uniquePreferredNames.length > 1) {
      titulo = uniquePreferredNames.join(" / ");
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
    const dataLangs = getSetAvailableLangs(code);
    const availableLangs = getSetUiAvailableLangs(code);
    const nombreES = setNameEsByCode[code] || null;
    const nombreMostrar = (nombreES && dataLangs.includes("es")) ? `${s.name} / ${nombreES}` : s.name;

    const entry = {
      key: code,               // base key = code
      code: code,
      nombre: nombreMostrar,
      name_en: s.name,
      name_es: nombreES,
      dataLangs,
      availableLangs,
      released_at: s.released_at || "",
      set_type: s.set_type || "",
      digital: !!s.digital,
      icon_svg_uri: s.icon_svg_uri || ""
    };

    catalogoColecciones.push(entry);

    for (const lang of availableLangs) {
      setMetaByKey.set(`${code}__${lang}`, { ...entry, lang });
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
    setCode: String(card.set || code || "").toLowerCase(),
    setKey,
    set_name: card.set_name || "",
    nombre: pickCardName(card, lang),
    numero: card.collector_number,
    collector_number: card.collector_number,
    rareza: mapRarity(card.rarity),
    lang,
    releasedAt: card.released_at || "",
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

function abrirModalCarta({ titulo, imageUrl, numero, rareza, precio, navLista = null, navIndex = -1, cardData = null, oracleId = null, setCode = "", collectorNumber = "" }) {
  const modal = document.getElementById("modalCarta");
  const tit = document.getElementById("modalCartaTitulo");
  const body = document.getElementById("modalCartaBody");

  if (!modal || !tit || !body) return;

  const baseModalCard = normalizeVisibleVariantCard({
    ...(cardData || {}),
    id: cardData?.id || "",
    oracle_id: oracleId || cardData?.oracle_id || "",
    setCode: String(setCode || cardData?.set || "").toLowerCase(),
    set: String(setCode || cardData?.set || "").toLowerCase(),
    nombre: titulo || pickCardName(cardData || {}, cardData?.lang || "en") || "Carta",
    numero: collectorNumber || numero || cardData?.collector_number || "",
    collector_number: collectorNumber || numero || cardData?.collector_number || "",
    rareza: rareza || mapRarity(cardData?.rarity) || "",
    _img: imageUrl || pickImage(cardData || {}) || "",
    _prices: cardData?.prices || null,
    _raw: cardData || null
  }, cardData || null);

  tit.textContent = baseModalCard.nombre || "Carta";

  // Guardamos estado para navegación
  if (Array.isArray(navLista) && navLista.length) {
    modalNavState.lista = navLista;
    modalNavState.idx = navIndex;
  } else {
    modalNavState.lista = null;
    modalNavState.idx = -1;
  }

  const infoBits = [];
  if (baseModalCard.collector_number) infoBits.push(`#${baseModalCard.collector_number}`);
  if (baseModalCard.rareza) infoBits.push(baseModalCard.rareza);
  const infoLinea = infoBits.length ? infoBits.join(" · ") : "";

  const precioTxt = precio || formatPrecioEUR(baseModalCard._prices) || "—";

  const tieneNav = Array.isArray(navLista) && navLista.length > 0 && navIndex >= 0;
  const prevDisabled = !tieneNav || navIndex <= 0;
  const nextDisabled = !tieneNav || navIndex >= navLista.length - 1;

  // Detectar si es carta de doble cara
  const esDobleCaracardFaces = baseModalCard?._raw?.card_faces?.length >= 2;
  const imagenCara1 = baseModalCard?._raw?.card_faces?.[0]?.image_uris?.normal;
  const imagenCara2 = baseModalCard?._raw?.card_faces?.[1]?.image_uris?.normal;
  
  // Variable para rastrear qué cara se muestra (la guardamos en el body como data attribute)
  let caraActual = 1;

  body.innerHTML = `
    <div class="card" style="margin-bottom:12px;">
      <div class="modal-info-row">
        <div class="modal-info-main">
          ${infoLinea ? `<div id="modalCartaInfoLinea"><strong>${infoLinea}</strong></div>` : `<div id="modalCartaInfoLinea"></div>`}
          <div id="modalCartaPrecio" class="hint" style="margin-top:6px;">Precio orientativo: ${precioTxt}</div>
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
        <img id="imgCartaModal" alt="${baseModalCard.nombre || "Carta"}" loading="lazy" 
             data-cara1="${imagenCara1}" data-cara2="${imagenCara2}" data-cara-actual="1" />
        <button id="btnVoltearCarta" class="btn-voltear-carta" type="button" title="Voltear carta">
          🔄
        </button>
      </div>
    ` : (baseModalCard._img ? `<img alt="${baseModalCard.nombre || "Carta"}" loading="lazy" data-img-url="${baseModalCard._img}" />`
              : `<div class="card"><p>No hay imagen disponible.</p></div>`)}
    ${baseModalCard.oracle_id ? generarControlesModalCarta(baseModalCard) : ''}
  `;

  body.dataset.oracle = String(baseModalCard.oracle_id || "");
  body.dataset.setCode = String(baseModalCard.setCode || "");
  body.dataset.collectorNumber = String(baseModalCard.collector_number || "");
  body.dataset.currentPrintId = String(baseModalCard.id || "");
  body.dataset.activeLang = String(baseModalCard.lang || "en");

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
  } else if (baseModalCard._img) {
    const imgSimple = body.querySelector('img[data-img-url]') || body.querySelector('img');
    if (imgSimple) loadImageWithCache(imgSimple, baseModalCard._img);
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
  if (baseModalCard.oracle_id) {
    applyVisibleVariantToModal(body, baseModalCard);
    wireControlesModalCarta(body, baseModalCard);
    if (getCardControlsConfig().langMode === "both") {
      const variantScope = getVariantScopeForCardUI(baseModalCard);
      const modalPreferredLang = getActiveVisibleLang(
        String(baseModalCard.setCode || baseModalCard.set || "").toLowerCase(),
        String(baseModalCard.oracle_id || ""),
        String(baseModalCard.collector_number || baseModalCard.numero || ""),
        baseModalCard.lang || "en"
      );
      const variantResolver = variantScope === "set-exact"
        ? resolveExactSetVariantForCard
        : resolveVisibleVariantForCard;
      variantResolver(baseModalCard, modalPreferredLang).then(variantCard => {
        if (variantCard) applyVisibleVariantToModal(body, variantCard);
      }).catch(() => {});
    }
  }

  modal.classList.remove("hidden");
}

function generarControlesModalCarta(card) {
  const cfg = getCardControlsConfig();
  const normalized = normalizeVisibleVariantCard(card, card);
  const setCode = String(normalized.setCode || normalized.set || "").toLowerCase();
  const collectorNumber = String(normalized.collector_number || normalized.numero || "");
  const variantScope = getVariantScopeForCardUI(normalized);
  const langActivo = cfg.langMode === "both"
    ? getPreferredVisibleLang(setCode, normalized.lang || getActiveVisibleLang(setCode, normalized.oracle_id, collectorNumber, "en"), normalized.oracle_id, collectorNumber)
    : getPreferredSetLang(setCode, cfg.langMode);

  if (cfg.langMode !== "both") {
    return `
      <div class="card" style="margin-top: 16px;">
        <div class="carta-controles modal-controles" data-active-lang="${langActivo}" data-lang-mode="${cfg.langMode}" data-lang-selector-open="false" data-variant-scope="${variantScope}" style="background: rgba(0,0,0,.06);">
          <div class="controles-header">
            ${renderVisibleVariantSelectorHTML({ ...normalized, lang: langActivo }, { langMode: cfg.langMode, panelOpen: false, context: "modal", variantScope })}
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card" style="margin-top: 16px;">
      <div class="carta-controles modal-controles" data-active-lang="${langActivo}" data-lang-mode="both" data-lang-selector-open="false" data-variant-scope="${variantScope}" style="background: rgba(0,0,0,.06);">
        <div class="controles-header">
          ${renderVisibleVariantSelectorHTML({ ...normalized, lang: langActivo }, { langMode: "both", panelOpen: false, context: "modal", variantScope })}
        </div>
      </div>
    </div>
  `;
}

function wireControlesModalCarta(container, card) {
  if (container.dataset.modalVariantSelectorWired === "true") return;
  container.dataset.modalVariantSelectorWired = "true";

  container.addEventListener("click", async (event) => {
    const target = event.target;
    const controls = target.closest(".carta-controles");
    if (!controls) return;

    const toggleBtn = target.closest(".btn-lang-panel-toggle");
    if (toggleBtn) {
      const shouldOpen = controls.dataset.langSelectorOpen !== "true";
      closeAllVisibleVariantPanels(shouldOpen ? controls : null);
      setVisibleVariantPanelOpen(controls, shouldOpen);
      return;
    }

    const choiceBtn = target.closest(".btn-lang-choice");
    if (!choiceBtn) return;
    if (controls.dataset.langSelectorLocked === "true" || choiceBtn.dataset.langLocked === "true") {
      setVisibleVariantSelectorFeedback(controls, buildVisibleVariantLockFeedback(), { type: "info" });
      return;
    }
    if (controls.dataset.animating === "true") return;
    controls.dataset.animating = "true";
    try {
      await selectVisibleVariantLangForElement(container, choiceBtn.dataset.langChoice || "", card);
      syncVisibleVariantSelectorUI(container, getCurrentVisibleVariantCardForElement(container, card));
    } finally {
      setTimeout(() => {
        controls.dataset.animating = "false";
      }, 180);
    }
  });

  container.addEventListener("change", async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.classList.contains("chk-visible-lang")) return;
    const controls = input.closest(".carta-controles");
    if (!controls) return;

    const currentCard = getCurrentVisibleVariantCardForElement(container, card);
    if (!currentCard) return;
    const normalized = normalizeVisibleVariantCard(currentCard, currentCard);
    const variantScope = getVariantScopeForElement(container);
    const availableLangs = variantScope === "set-exact"
      ? getExactSetAvailableLangsForCard(normalized)
      : getAvailableVariantLangsForCard(normalized);
    const selectedLangs = availableLangs.filter(lang => {
      const checkbox = controls.querySelector(`.chk-visible-lang[data-lang-option="${lang}"]`);
      return !!checkbox?.checked;
    });

    if (selectedLangs.length === 0) {
      input.checked = true;
      return;
    }

    await updateVisibleLangSelectionForElement(container, selectedLangs, card);
    syncVisibleVariantSelectorUI(container, getCurrentVisibleVariantCardForElement(container, card));
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
// MTGJSON (traducciones + idiomas por set)
// ===============================

const MTGJSON_SETLIST_URL = "https://mtgjson.com/api/v5/SetList.json";
const LS_SET_METADATA_BY_CODE = "mtg_set_metadata_by_code_v1";
const DEFAULT_APP_FALLBACK_LANG = "en";
const UI_ENABLED_SET_LANGS = ["en", "es"];
const MTGJSON_LANGUAGE_TO_APP_LANG = {
  english: "en",
  spanish: "es"
};
const CANONICAL_SPANISH_SET_EXCEPTIONS = {
  forceSpanishByCode: {
    ps11: true,
    psal: true
  },
  forceSpanishOnlyByCode: {
    ps11: true,
    psal: true
  },
  spanishNameByCode: {}
};

let setNameEsByCode = {}; // { "ons": "Embestida", ... }
let setLangsByCode = {};  // { "ons": ["en", "es"], ... }
const setUiLangHydrationInFlight = new Map();
let setExactSessionVisibleLangsBySet = {};
let setExactSessionVisibleLangsByCard = {};

function getUiEnabledSetLangs() {
  return [...UI_ENABLED_SET_LANGS];
}

function hasCanonicalSpanishSetException(code) {
  const safeCode = String(code || "").trim().toLowerCase();
  if (!safeCode) return false;
  return !!CANONICAL_SPANISH_SET_EXCEPTIONS.forceSpanishByCode?.[safeCode];
}

function getCanonicalSpanishSetName(code) {
  const safeCode = String(code || "").trim().toLowerCase();
  if (!safeCode) return "";
  const name = CANONICAL_SPANISH_SET_EXCEPTIONS.spanishNameByCode?.[safeCode];
  return String(name || "").trim();
}

function hasCanonicalSpanishOnlySetException(code) {
  const safeCode = String(code || "").trim().toLowerCase();
  if (!safeCode) return false;
  return !!CANONICAL_SPANISH_SET_EXCEPTIONS.forceSpanishOnlyByCode?.[safeCode];
}

function normalizeAppLangCode(lang) {
  const key = String(lang || "").trim().toLowerCase();
  if (!key) return "";
  return normalizeSupportedLangCode(MTGJSON_LANGUAGE_TO_APP_LANG[key] || key);
}

const SET_LANGUAGE_OVERRIDES = {
  forceInclude: {},
  forceExclude: {}
};

function normalizeSetLangs(langs) {
  const normalized = new Set();
  const source = Array.isArray(langs) ? langs : [];

  for (const lang of source) {
    const mapped = normalizeAppLangCode(lang);
    if (mapped) normalized.add(mapped);
  }

  if (normalized.size === 0) normalized.add(DEFAULT_APP_FALLBACK_LANG);
  return [...normalized].sort();
}

function applySetLanguageOverrides(code, langs) {
  const langSet = new Set(normalizeSetLangs(langs));
  const add = SET_LANGUAGE_OVERRIDES.forceInclude?.[code] || [];
  const remove = SET_LANGUAGE_OVERRIDES.forceExclude?.[code] || [];

  if (hasCanonicalSpanishSetException(code)) {
    langSet.add("es");
  }

  if (hasCanonicalSpanishOnlySetException(code)) {
    langSet.delete("en");
    langSet.add("es");
  }

  add.forEach(lang => {
    const mapped = normalizeAppLangCode(lang);
    if (mapped) langSet.add(mapped);
  });

  remove.forEach(lang => {
    const mapped = normalizeAppLangCode(lang);
    if (mapped) langSet.delete(mapped);
  });

  if (langSet.size === 0) langSet.add(DEFAULT_APP_FALLBACK_LANG);
  return [...langSet].sort();
}

function getSetAvailableLangs(code) {
  const codeLower = String(code || "").toLowerCase();
  const manualLangs = Object.keys(getManualSetLangOverrides(codeLower));
  return applySetLanguageOverrides(codeLower, [...(setLangsByCode[codeLower] || [DEFAULT_APP_FALLBACK_LANG]), ...manualLangs]);
}

function getSetOpenableLangs(code) {
  const codeLower = String(code || "").trim().toLowerCase();
  if (!codeLower) return [DEFAULT_APP_FALLBACK_LANG];

  const openable = new Set(getSetUiAvailableLangs(codeLower));

  for (const setKey of Object.keys(cacheCartasPorSetLang || {})) {
    const [setCodeRaw, langRaw] = String(setKey || "").split("__");
    const setCode = String(setCodeRaw || "").trim().toLowerCase();
    const lang = normalizeAppLangCode(langRaw);
    if (setCode !== codeLower || !lang) continue;
    if (getUiEnabledSetLangs().includes(lang)) openable.add(lang);
  }

  for (const lang of getUiEnabledSetLangs()) {
    if (setMetaByKey.has(`${codeLower}__${lang}`)) openable.add(lang);
  }

  if (openable.size === 0) openable.add(DEFAULT_APP_FALLBACK_LANG);
  return getUiEnabledSetLangs().filter(lang => openable.has(lang));
}

function resolveSetBaseLang(code, preferredLang = "") {
  const codeLower = String(code || "").trim().toLowerCase();
  const preferred = normalizeAppLangCode(preferredLang);
  const openable = getSetOpenableLangs(codeLower);

  if (preferred && openable.includes(preferred)) return preferred;
  if (openable.includes(DEFAULT_APP_FALLBACK_LANG)) return DEFAULT_APP_FALLBACK_LANG;
  if (openable.includes("es")) return "es";
  return openable[0] || DEFAULT_APP_FALLBACK_LANG;
}

function getSetUiAvailableLangs(code) {
  const available = new Set(getSetAvailableLangs(code));
  const visible = getUiEnabledSetLangs().filter(lang => available.has(lang));
  if (visible.length > 0) return visible;
  if (available.has(DEFAULT_APP_FALLBACK_LANG)) return [DEFAULT_APP_FALLBACK_LANG];
  return [getPreferredSetLang(code, DEFAULT_APP_FALLBACK_LANG)];
}

function setHasLang(code, lang) {
  return getSetAvailableLangs(code).includes(normalizeAppLangCode(lang) || DEFAULT_APP_FALLBACK_LANG);
}

function getPreferredSetLang(code, preferredLang = "en") {
  return resolveSetBaseLang(code, preferredLang);
}

function getPreferredSetKey(code, preferredLang = "en") {
  const codeLower = String(code || "").toLowerCase();
  return `${codeLower}__${resolveSetBaseLang(codeLower, preferredLang)}`;
}

async function hydrateUiSetLangChoicesFromSetData(code, probeLangs = []) {
  const safeCode = String(code || "").trim().toLowerCase();
  if (!safeCode) return false;

  const normalizedProbeLangs = [...new Set((Array.isArray(probeLangs) ? probeLangs : [])
    .map(lang => normalizeAppLangCode(lang))
    .filter(Boolean)
    .filter(lang => lang !== DEFAULT_APP_FALLBACK_LANG))];

  if (normalizedProbeLangs.length === 0) return false;

  const missingLangs = normalizedProbeLangs.filter(lang => !getSetVisibleLangChoices(safeCode).includes(lang));
  if (missingLangs.length === 0) return false;

  const hydrationKey = `${safeCode}::${missingLangs.sort().join(",")}`;
  if (setUiLangHydrationInFlight.has(hydrationKey)) {
    return setUiLangHydrationInFlight.get(hydrationKey);
  }

  const hydrationPromise = (async () => {
    let changed = false;

    for (const lang of missingLangs) {
      try {
        await ensureSetCardsLoaded(`${safeCode}__${lang}`);
        if (cartasDeSetKey(`${safeCode}__${lang}`).length > 0) {
          const merged = new Set(getSetAvailableLangs(safeCode));
          merged.add(lang);
          setLangsByCode[safeCode] = applySetLanguageOverrides(safeCode, [...merged]);
          changed = true;
        }
      } catch (err) {
        console.warn(`No se pudo hidratar ${safeCode}__${lang}:`, err);
      }
    }

    if (changed) guardarSetMetadataEnLocalStorage();
    return changed;
  })().finally(() => {
    setUiLangHydrationInFlight.delete(hydrationKey);
  });

  setUiLangHydrationInFlight.set(hydrationKey, hydrationPromise);
  return hydrationPromise;
}

function cargarSetMetadataDesdeLocalStorage() {
  const raw = safeLocalStorageGet(LS_SET_METADATA_BY_CODE);
  if (!raw) return false;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      const namesRaw = (obj.names && typeof obj.names === "object") ? obj.names : {};
      const normalizedNames = {};
      for (const [codeRaw, valueRaw] of Object.entries(namesRaw)) {
        const code = String(codeRaw || "").trim().toLowerCase();
        const value = String(valueRaw || "").trim();
        if (!code || !value) continue;
        normalizedNames[code] = value;
      }
      for (const [codeRaw, valueRaw] of Object.entries(CANONICAL_SPANISH_SET_EXCEPTIONS.spanishNameByCode || {})) {
        const code = String(codeRaw || "").trim().toLowerCase();
        const value = String(valueRaw || "").trim();
        if (!code || !value) continue;
        normalizedNames[code] = value;
      }
      setNameEsByCode = normalizedNames;
      const langsRaw = (obj.langs && typeof obj.langs === "object") ? obj.langs : {};
      const normalizedLangs = {};
      for (const [codeRaw, langs] of Object.entries(langsRaw)) {
        const code = String(codeRaw || "").trim().toLowerCase();
        if (!code) continue;
        normalizedLangs[code] = applySetLanguageOverrides(code, langs);
      }
      setLangsByCode = normalizedLangs;
      return true;
    }
  } catch {}
  return false;
}

function guardarSetMetadataEnLocalStorage() {
  safeLocalStorageSet(LS_SET_METADATA_BY_CODE, JSON.stringify({
    names: setNameEsByCode,
    langs: setLangsByCode
  }));
}

async function cargarSetMetadataDesdeMTGJSON() {
  cargarSetMetadataDesdeLocalStorage();

  const data = await fetch(MTGJSON_SETLIST_URL, { headers: { "Accept": "application/json" } })
    .then(r => {
      if (!r.ok) throw new Error(`MTGJSON ${r.status}`);
      return r.json();
    });

  const sets = data?.data || [];
  const names = {};
  const langs = {};

  for (const s of sets) {
    const code = String(s.code || "").toLowerCase();
    if (!code) continue;

    const esName = getCanonicalSpanishSetName(code) || s?.translations?.Spanish;
    if (esName) names[code] = esName;

    langs[code] = applySetLanguageOverrides(code, Array.isArray(s?.languages) ? s.languages : []);
  }

  for (const [codeRaw, valueRaw] of Object.entries(CANONICAL_SPANISH_SET_EXCEPTIONS.spanishNameByCode || {})) {
    const code = String(codeRaw || "").trim().toLowerCase();
    const value = String(valueRaw || "").trim();
    if (!code || !value) continue;
    names[code] = value;
    if (!langs[code]) langs[code] = applySetLanguageOverrides(code, []);
  }

  setNameEsByCode = names;
  setLangsByCode = langs;
  guardarSetMetadataEnLocalStorage();
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

// ===============================
// Sistema de navegación
// - historial interno independiente del historial del navegador
// - sincronización con History API para botón atrás del sistema/móvil
// - idempotente: no acumula entradas duplicadas consecutivas
// - bloqueo por token para popstate (evita carreras en pulsaciones rápidas)
// - deduplicación de refrescos de pantalla en ventana corta
// Diagnóstico: añade ?debugNav=1 en la URL para activar trazas de consola
// ===============================
let historialNavegacion = ["menu"];
let manejandoPopstate = false;
let impedirSalidaApp = true; // Evita que la app se cierre al presionar retroceso
let navHistorySeq = 0;
let popstateLockToken = 0;
let popstateReleaseTimer = null;
const NAV_REFRESH_DEDUPE_MS = 120;
let lastPantallaRefresh = { signature: "", at: 0 };
window.DEBUG_NAV = new URL(window.location.href).searchParams.get("debugNav") === "1";

function getNavigationDebugState() {
  return {
    activeScreen: resolverPantallaActiva(),
    historial: [...historialNavegacion],
    manejandoPopstate: !!manejandoPopstate,
    impedirSalidaApp: !!impedirSalidaApp,
    historyLength: window.history.length
  };
}

function navDebugLog(event, payload = {}) {
  if (!window.DEBUG_NAV) return;
  console.log(`[NAV] ${event}`, {
    ...payload,
    ...getNavigationDebugState()
  });
}

function isKnownPantalla(nombre) {
  const target = String(nombre || "").trim();
  return !!target && !!pantallas[target];
}

function buildNavHistoryState(state = {}, { forceNewSeq = true } = {}) {
  const candidate = state && typeof state === "object" ? state : {};
  const pantallaRaw = String(candidate.pantalla || "").trim();
  const pantalla = isKnownPantalla(pantallaRaw) ? pantallaRaw : resolverPantallaActiva();
  if (forceNewSeq) navHistorySeq += 1;
  return {
    ...candidate,
    pantalla,
    navSeq: navHistorySeq
  };
}

function pushHistoryStateSafe(state) {
  const safeState = buildNavHistoryState(state, { forceNewSeq: true });
  try {
    window.history.pushState(safeState, "", "");
    navDebugLog("history.pushState", { state: safeState });
  } catch (err) {
    navDebugLog("history.pushState.error", { state: safeState, error: err?.message || String(err || "") });
  }
}

function replaceHistoryStateSafe(state) {
  const safeState = buildNavHistoryState(state, { forceNewSeq: true });
  try {
    window.history.replaceState(safeState, "", "");
    navDebugLog("history.replaceState", { state: safeState });
  } catch (err) {
    navDebugLog("history.replaceState.error", { state: safeState, error: err?.message || String(err || "") });
  }
}

function setManejandoPopstate(value, reason = "") {
  manejandoPopstate = !!value;
  navDebugLog("popstate.lock", { value: manejandoPopstate, reason });
}

function clearPopstateReleaseTimer() {
  if (!popstateReleaseTimer) return;
  clearTimeout(popstateReleaseTimer);
  popstateReleaseTimer = null;
}

function acquirePopstateLock(reason = "") {
  clearPopstateReleaseTimer();
  popstateLockToken += 1;
  setManejandoPopstate(true, reason || "popstate-acquire");
  return popstateLockToken;
}

function releasePopstateLock(token, reason = "") {
  if (token !== popstateLockToken) {
    navDebugLog("popstate.release.stale", { token, expected: popstateLockToken, reason });
    return;
  }
  clearPopstateReleaseTimer();
  setManejandoPopstate(false, reason || "popstate-release");
}

function schedulePopstateRelease(token, delayMs = 50, reason = "") {
  clearPopstateReleaseTimer();
  popstateReleaseTimer = setTimeout(() => {
    popstateReleaseTimer = null;
    releasePopstateLock(token, reason || "popstate-release-timer");
  }, delayMs);
}

function syncNavigationFromHistoryState(state) {
  const target = String(state?.pantalla || "").trim();
  if (!isKnownPantalla(target)) return false;

  normalizeHistorialNavegacion();
  const active = resolverPantallaActiva();
  if (active === target) {
    // El estado del navegador ya coincide con la pantalla visible.
    // Tratarlo como gestionado evita consumir un retroceso adicional.
    navDebugLog("syncHistoryState.sameScreen.handled", { target });
    return true;
  }

  const targetIndex = historialNavegacion.lastIndexOf(target);
  if (targetIndex >= 0) {
    historialNavegacion = historialNavegacion.slice(0, targetIndex + 1);
  } else {
    pushHistorialPantallaUnique(target);
  }

  refrescarPantallaDestino(target);
  mostrarPantalla(target, false);
  navDebugLog("historyState.synced", { target });
  return true;
}

function syncHistorialWithActiveScreen() {
  normalizeHistorialNavegacion();
  const active = resolverPantallaActiva();
  if (!isKnownPantalla(active)) return;

  const last = historialNavegacion[historialNavegacion.length - 1];
  if (last === active) return;

  const targetIndex = historialNavegacion.lastIndexOf(active);
  if (targetIndex >= 0) {
    historialNavegacion = historialNavegacion.slice(0, targetIndex + 1);
  } else {
    historialNavegacion.push(active);
  }

  navDebugLog("historial.syncedWithActive", { active });
}

function getPantallaRefreshSignature(nombre) {
  return String(nombre || "").trim();
}

function shouldSkipPantallaRefresh(nombre) {
  const signature = getPantallaRefreshSignature(nombre);
  const now = (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();

  const isDuplicate = signature
    && lastPantallaRefresh.signature === signature
    && (now - lastPantallaRefresh.at) < NAV_REFRESH_DEDUPE_MS;

  if (!isDuplicate) {
    lastPantallaRefresh = { signature, at: now };
  }

  return isDuplicate;
}

function normalizeHistorialNavegacion() {
  const validScreens = new Set(Object.keys(pantallas));
  const normalized = [];

  for (const raw of Array.isArray(historialNavegacion) ? historialNavegacion : []) {
    const screen = String(raw || "").trim();
    if (!screen || !validScreens.has(screen)) continue;
    if (normalized[normalized.length - 1] === screen) continue;
    normalized.push(screen);
  }

  historialNavegacion = normalized.length > 0 ? normalized : ["menu"];
  return historialNavegacion;
}

function pushHistorialPantallaUnique(nombre) {
  const target = String(nombre || "").trim();
  if (!target) return false;

  normalizeHistorialNavegacion();
  if (historialNavegacion[historialNavegacion.length - 1] === target) {
    navDebugLog("historial.skipDuplicate", { target });
    return false;
  }

  historialNavegacion.push(target);
  navDebugLog("historial.push", { target });
  return true;
}

window.__getNavigationDebugState = getNavigationDebugState;

function mostrarPantalla(nombre, agregarAlHistorial = true) {
  navDebugLog("mostrarPantalla.start", { nombre, agregarAlHistorial });

  Object.values(pantallas).forEach(p => {
    if (p) p.classList.remove("active");
  });

  if (pantallas[nombre]) {
    pantallas[nombre].classList.add("active");
  } else {
    navDebugLog("mostrarPantalla.invalidTarget", { nombre });
  }

  if (nombre === "cuenta" && typeof applyBootStateHealth === "function") {
    applyBootStateHealth();
  }
  
  // Agregar al historial de navegación interna
  if (agregarAlHistorial && !manejandoPopstate) {
    const pushed = pushHistorialPantallaUnique(nombre);
    // Agregar un estado al historial del navegador para que el botón de retroceso funcione
    if (pushed) {
      pushHistoryStateSafe({ pantalla: nombre });
    }
  }
  
  // Re-detectar scroller activo al cambiar vistas
  if (typeof updateScrollerOnViewChange === "function") {
    updateScrollerOnViewChange();
  }

  navDebugLog("mostrarPantalla.end", { nombre, agregarAlHistorial });
}

function refrescarPantallaDestino(nombre) {
  if (shouldSkipPantallaRefresh(nombre)) {
    navDebugLog("refrescarPantallaDestino.skipDedupe", { nombre });
    return;
  }

  navDebugLog("refrescarPantallaDestino.run", { nombre });

  if (nombre === "colecciones") {
    aplicarUIFiltrosColecciones();
    aplicarUIFiltrosTipo();
    renderColecciones();
  } else if (nombre === "decks") {
    renderListaDecks();
  } else if (nombre === "buscar") {
    const inputBuscar = document.getElementById("inputBuscar");
    if (inputBuscar) inputBuscar.value = "";
    clearBuscarSuggestions();
    renderResultadosBuscar("");
  } else if (nombre === "comandantes") {
    resetCommanderSearchUI();
  } else if (nombre === "estadisticas") {
    renderEstadisticas({ forceRecalc: false });
  } else if (nombre === "cuenta") {
    actualizarFechaCatalogo();
  } else if (nombre === "set") {
    if (setActualKey) {
      renderTablaSet(setActualKey);
    }
  } else if (nombre === "verDeck") {
    if (typeof renderDeckCartas === "function") {
      renderDeckCartas();
    }
  }
}

function resolverPantallaActiva() {
  const activa = document.querySelector(".pantalla.active");
  if (!activa) return "menu";

  for (const [nombre, elemento] of Object.entries(pantallas)) {
    if (elemento === activa) return nombre;
  }
  return "menu";
}

function navegarAObjetivo(target) {
  navDebugLog("navegarAObjetivo.start", { target });
  if (!target) return false;

  normalizeHistorialNavegacion();

  const pantallaActiva = resolverPantallaActiva();
  if (pantallaActiva === target) {
    navDebugLog("navegarAObjetivo.noop", { target });
    return true;
  }

  const targetIndex = historialNavegacion.lastIndexOf(target);
  if (targetIndex >= 0) {
    historialNavegacion = historialNavegacion.slice(0, targetIndex + 1);
  } else if (historialNavegacion[historialNavegacion.length - 1] !== target) {
    historialNavegacion.push(target);
  }

  refrescarPantallaDestino(target);
  mostrarPantalla(target, false);

  replaceHistoryStateSafe({ pantalla: target });

  navDebugLog("navegarAObjetivo.end", { target });

  return true;
}

function navegarAtras() {
  navDebugLog("navegarAtras.start");
  syncHistorialWithActiveScreen();
  normalizeHistorialNavegacion();

  if (historialNavegacion.length > 1) {
    // Quitar la pantalla actual del historial
    historialNavegacion.pop();

    // Si quedan duplicados del mismo destino, compactarlos para evitar retrocesos redundantes.
    while (historialNavegacion.length > 1
      && historialNavegacion[historialNavegacion.length - 1] === historialNavegacion[historialNavegacion.length - 2]) {
      historialNavegacion.pop();
    }

    // Obtener la pantalla anterior
    const pantallaAnterior = historialNavegacion[historialNavegacion.length - 1];
    refrescarPantallaDestino(pantallaAnterior);
    
    // Mostrar la pantalla anterior sin agregar al historial
    mostrarPantalla(pantallaAnterior, false);
    navDebugLog("navegarAtras.end", { resultado: true, pantallaAnterior });
    return true;
  } else if (impedirSalidaApp) {
    // Si estamos en el menú principal, mantener la app abierta
    // agregando de nuevo una entrada al historial
    pushHistoryStateSafe({ pantalla: "menu" });
    navDebugLog("navegarAtras.end", { resultado: true, pantallaAnterior: "menu" });
    return true;
  }
  navDebugLog("navegarAtras.end", { resultado: false });
  return false;
}

// ===============================
// 4) Colecciones: filtro + lista + progreso
// ===============================

function normalizeCollectionFilterLang(lang, fallback = "all") {
  if (String(lang || "").trim().toLowerCase() === "all") return "all";
  return normalizeLanguagePreferenceCode(lang, fallback === "all" ? "" : fallback) || (fallback === "all" ? "all" : fallback);
}

const DEFAULT_SET_TYPE_FILTERS = ["expansion", "core", "commander", "masters", "promo", "token", "memorabilia", "other"];
const ALLOWED_SET_TYPE_FILTERS = new Set(DEFAULT_SET_TYPE_FILTERS);

function normalizeCollectionYearFilter(yearValue) {
  const raw = String(yearValue || "").trim();
  return /^\d{4}$/.test(raw) ? raw : "all";
}

function normalizeSetTypeFilters(values) {
  const normalized = new Set();
  const source = Array.isArray(values) ? values : [];

  for (const valueRaw of source) {
    const value = String(valueRaw || "").trim().toLowerCase();
    if (ALLOWED_SET_TYPE_FILTERS.has(value)) normalized.add(value);
  }

  return normalized.size > 0 ? normalized : new Set(DEFAULT_SET_TYPE_FILTERS);
}

function buildCollectionFiltersSnapshot() {
  return {
    lang: normalizeCollectionFilterLang(filtroIdiomaColecciones),
    texto: String(filtroTextoColecciones || "").trim().toLowerCase(),
    vista: vistaColecciones === "lista" ? "lista" : "simbolo",
    year: normalizeCollectionYearFilter(filtroYearColecciones),
    filtroTiposSet: [...normalizeSetTypeFilters([...filtroTiposSet])],
    ocultarTokens: !!ocultarTokens,
    ocultarArte: !!ocultarArte
  };
}

function applyCollectionFiltersSnapshot(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  filtroIdiomaColecciones = normalizeCollectionFilterLang(data.lang);
  filtroTextoColecciones = typeof data.texto === "string" ? data.texto.trim().toLowerCase() : "";
  vistaColecciones = data.vista === "lista" ? "lista" : "simbolo";
  filtroYearColecciones = normalizeCollectionYearFilter(data.year);
  filtroTiposSet = normalizeSetTypeFilters(data.filtroTiposSet);
  ocultarTokens = !!data.ocultarTokens;
  ocultarArte = !!data.ocultarArte;
}

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
    const countersHtml = counters.map(c => {
      const checkedAttr = c.enabled ? "checked" : "";
      return `
        <div class="opciones-item" data-control-type="counter" data-key="${escapeAttr(c.key)}">
          <label class="chkline">
            <input type="checkbox" data-action="toggle" ${checkedAttr} />
            <span>${escapeHtml(c.label)}</span>
          </label>
          <button class="btn-secundario btn-mini" data-action="remove">Eliminar</button>
        </div>
      `;
    }).join("");
    contadoresList.innerHTML = counters.length ? countersHtml : `<div class="hint">No hay contadores extra.</div>`;
  }

  const tagsList = document.getElementById("listaTagsOpciones");
  if (tagsList) {
    const tags = cfg.extraTags || [];
    const tagsHtml = tags.map(t => {
      const checkedAttr = t.enabled ? "checked" : "";
      const removeButtonHtml = t.builtIn
        ? ""
        : `<button class="btn-secundario btn-mini" data-action="remove">Eliminar</button>`;
      return `
        <div class="opciones-item" data-control-type="tag" data-key="${escapeAttr(t.key)}">
          <label class="chkline">
            <input type="checkbox" data-action="toggle" ${checkedAttr} />
            <span>${escapeHtml(t.label)}</span>
          </label>
          ${removeButtonHtml}
        </div>
      `;
    }).join("");
    tagsList.innerHTML = tags.length ? tagsHtml : `<div class="hint">No hay tags.</div>`;
  }
}


function setFiltroTextoColecciones(texto) {
  filtroTextoColecciones = normalizarTexto((texto || "").trim());
  guardarFiltrosColecciones();
  scheduleRenderColecciones();
}

function setFiltroYearColecciones(yearValue) {
  filtroYearColecciones = normalizeCollectionYearFilter(yearValue);
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
      const estadoKey = getEstadoKeyFromCard(c);
      if (!estadoKey) return getEstadoCarta(c.id).qty > 0; // Fallback legacy
      return getLegacyPossessionAdapterForState(estadoKey).totals.qty > 0;
    }).length;
    return { tengo, total };
  }

  // Si no está cargado, intenta usar el resumen guardado
  const saved = getSavedProgressForSet(setKey);
  if (saved) return saved;

  // Si no sabemos nada todavía
  return { tengo: 0, total: null };
}

function setFiltroColecciones(lang) {
  filtroIdiomaColecciones = normalizeCollectionFilterLang(lang);
  document.querySelectorAll(".btn-filtro").forEach(b => {
    b.classList.toggle("active", b.dataset.lang === filtroIdiomaColecciones);
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

  // Mostrar año seleccionado junto al botón
  const yearSpan = document.getElementById("filtroYearSeleccionado");
  if (yearSpan) {
    if (filtroYearColecciones && filtroYearColecciones !== "all") {
      yearSpan.textContent = filtroYearColecciones;
      yearSpan.style.display = "inline";
    } else {
      yearSpan.textContent = "";
      yearSpan.style.display = "none";
    }
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
let filtroTiposSet = new Set(DEFAULT_SET_TYPE_FILTERS);

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

  // ocultar sets vacíos (si todos los idiomas disponibles están marcados vacíos)
  sets = sets.filter(s => {
    const availableLangs = Array.isArray(s.availableLangs) && s.availableLangs.length > 0
      ? s.availableLangs
      : ["en"];
    return !availableLangs.every(lang => hiddenEmptySetKeys.has(`${s.code}__${lang}`));
  });

  if (filtroIdiomaColecciones !== "all") {
    sets = sets.filter(s => Array.isArray(s.availableLangs) && s.availableLangs.includes(filtroIdiomaColecciones));
  }

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
    const hasEn = setHasLang(s.code, "en");
    const hasEs = setHasLang(s.code, "es");
    const pEn = hasEn ? progresoDeColeccion(`${s.code}__en`) : { tengo: 0, total: null };
    const pEs = hasEs ? progresoDeColeccion(`${s.code}__es`) : { tengo: 0, total: null };

    const totalEnTxt = !hasEn ? "-" : (pEn.total === null ? "?" : pEn.total);
    const totalEsTxt = !hasEs ? "-" : (pEs.total === null ? "?" : pEs.total);

    // Calcular porcentajes
    let pctEn = "-%";
    let pctEs = "-%";
    let pctEnNum = 0;
    let pctEsNum = 0;
    
    if (hasEn && pEn.total && pEn.total > 0) {
      pctEnNum = Math.floor((pEn.tengo / pEn.total) * 100);
      pctEn = pctEnNum + "%";
    }
    
    if (hasEs && pEs.total && pEs.total > 0) {
      pctEsNum = Math.floor((pEs.tengo / pEs.total) * 100);
      pctEs = pctEsNum + "%";
    }

    // Calcular progreso para la barra visual (solo idioma inglés, o español si inglés no disponible)
    let progresoPromedio = 0;
    if (hasEn && pEn.total && pEn.total > 0) {
      progresoPromedio = pctEnNum;
    } else if (hasEs && pEs.total && pEs.total > 0) {
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
      const pctPrincipal = hasEn ? pctEn : (hasEs ? pctEs : "-%");

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
      <span class="coleccion-lista-pct">${pctPrincipal}</span>
    </div>
  </div>
`;
    } else {
      const langStats = [
        hasEn ? `<span class="pct-lang">${pctEn}</span> EN ${pEn.tengo}/${totalEnTxt}` : "",
        hasEs ? `ES ${pEs.tengo}/${totalEsTxt} <span class="pct-lang">${pctEs}</span>` : ""
      ].filter(Boolean).join(" · ");

      // Vista símbolo: la original
      html += `
  <div class="coleccion-item${completeClass}" data-code="${s.code}" data-progress="${progresoPromedio}">
    ${fechaTxt ? `<span class="set-date">${fechaTxt}</span>` : ""}
    <div class="coleccion-titulo">
      ${iconHtml}
      <div class="coleccion-nombre">${escapeHtml(s.nombre)}</div>
    </div>
    <div class="badge">${langStats}</div>
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
      const preferredLang = filtroIdiomaColecciones === "all" ? "en" : filtroIdiomaColecciones;
      abrirSet(getPreferredSetKey(code, preferredLang));
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

function guardarFiltrosColecciones() {
  const data = buildCollectionFiltersSnapshot();
  safeLocalStorageSet(LS_FILTERS_KEY, JSON.stringify(data));
  if (typeof sbMarkDirty === "function") sbMarkDirty();
}

function cargarFiltrosColecciones() {
  const raw = safeLocalStorageGet(LS_FILTERS_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      applyCollectionFiltersSnapshot(data);
    }
  } catch {
    // si está corrupto, lo ignoramos
  }
}

let setActualCode = null;
let setActualLang = "en";
let setLangToolbarLoadingState = null;
let setLangToolbarFeedbackState = null;
let setLangToolbarFeedbackTimer = null;

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
const VIRTUAL_SCROLL_BUFFER_ROWS = 32; // Buffer mayor para minimizar parpadeo
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

function rerenderSetConFiltros({ keepScroll = true } = {}) {
  if (!setActualKey) return;
  aplicarUIFiltrosSet();
  if (keepScroll) {
    renderTablaSetWithStableScroll(setActualKey);
  } else {
    renderTablaSet(setActualKey);
  }
}

function setFiltroTextoSet(texto) {
  filtroTextoSet = String(texto || "");
  rerenderSetConFiltros();
}

function setFiltroSoloFaltanSet(enabled) {
  filtroSoloFaltanSet = !!enabled;
  if (filtroSoloFaltanSet) {
    filtroEnPosesionSet = false;
  }
  rerenderSetConFiltros();
}

function setFiltroEnPosesionSet(enabled) {
  filtroEnPosesionSet = !!enabled;
  if (filtroEnPosesionSet) {
    filtroSoloFaltanSet = false;
  }
  rerenderSetConFiltros();
}

function setFiltroColorSetEnabled(enabled) {
  filtroColorSetEnabled = !!enabled;
  if (!filtroColorSetEnabled) {
    filtroColoresSet.clear();
  }
  rerenderSetConFiltros();
}

function toggleColorFiltroSet(color, enabled) {
  const normalizedColor = String(color || "").trim().toUpperCase();
  if (!normalizedColor) return;

  if (enabled) {
    filtroColoresSet.add(normalizedColor);
  } else {
    filtroColoresSet.delete(normalizedColor);
  }

  filtroColorSetEnabled = filtroColoresSet.size > 0;
  rerenderSetConFiltros();
}

function toggleRarezaFiltroSet(rareza, enabled) {
  const normalizedRareza = String(rareza || "").trim();
  if (!normalizedRareza) return;

  if (enabled) {
    filtroRarezasSet.add(normalizedRareza);
  } else {
    filtroRarezasSet.delete(normalizedRareza);
  }

  rerenderSetConFiltros();
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

function getCardColorIdentity(card) {
  const asArray = (v) => (Array.isArray(v) ? v : null);
  const asNonEmptyArray = (v) => {
    const arr = asArray(v);
    return arr && arr.length > 0 ? arr : null;
  };

  let colors =
    asNonEmptyArray(card?.color_identity) ||
    asNonEmptyArray(card?._colors) ||
    asNonEmptyArray(card?._raw?.color_identity) ||
    asNonEmptyArray(card?._raw?.colors);

  if (!colors && Array.isArray(card?._raw?.card_faces)) {
    const faceColors = [];
    for (const face of card._raw.card_faces) {
      const faceIds = asNonEmptyArray(face?.color_identity) || asNonEmptyArray(face?.colors);
      if (faceIds) faceColors.push(...faceIds);
    }
    if (faceColors.length > 0) colors = faceColors;
  }

  return (colors || [])
    .map(c => String(c || "").trim().toUpperCase())
    .filter(Boolean);
}

function getCardTotalsForSetFilter(card) {
  const estadoKey = getEstadoKeyFromCard(card);
  if (estadoKey) {
    const adapter = getLegacyPossessionAdapterForState(estadoKey);
    return {
      qty: Number(adapter?.totals?.qty || 0),
      foil: Number(adapter?.totals?.foil || 0)
    };
  }

  const legacy = getEstadoCarta(card?.id || "");
  return {
    qty: Number(legacy?.qty || 0),
    foil: Number(legacy?.foilQty || 0)
  };
}

function cardMatchesColorFilter(card) {
  const VALID_CARD_COLORS = new Set(["W", "U", "B", "R", "G", "C"]);
  const selected = new Set(
    [...(filtroColoresSet || [])]
      .map(c => String(c || "").trim().toUpperCase())
      .filter(c => VALID_CARD_COLORS.has(c))
  );

  if (selected.size === 0) return true;

  const colors = new Set(
    getCardColorIdentity(card)
      .map(c => String(c || "").trim().toUpperCase())
      .filter(c => VALID_CARD_COLORS.has(c))
  );

  // Colorless in Scryfall usually means empty color identity.
  const wantsColorless = selected.has("C");
  const isColorless = colors.size === 0 || colors.has("C");
  if (wantsColorless && isColorless) return true;

  for (const color of selected) {
    if (color === "C") continue;
    if (colors.has(color)) return true;
  }

  return false;
}

function cardMatchesRarityFilter(card) {
  if (filtroRarezasSet.size === 0) return false;
  if (filtroRarezasSet.size >= 4) return true;
  return filtroRarezasSet.has(card?.rareza);
}

function getListaSetFiltrada(setKey) {
  let lista = getMergedSetExactCards(setKey);

  const ft = normalizarTexto(String(filtroTextoSet || "").trim());
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

  if (filtroRarezasSet.size < 4) {
    lista = lista.filter(c => cardMatchesRarityFilter(c));
  }

  return lista;
}

async function abrirSet(setKey) {
  const [codeRaw, langRaw] = String(setKey || "").split("__");
  const code = String(codeRaw || "").toLowerCase();
  const explicitLang = normalizeLanguagePreferenceCode(langRaw);
  const lang = resolveSetBaseLang(code, explicitLang || DEFAULT_APP_FALLBACK_LANG);
  const resolvedSetKey = `${code}__${lang}`;
  const currentScreen = historialNavegacion[historialNavegacion.length - 1] || "menu";
  const shouldPushSetHistory = currentScreen !== "set";

  setActualKey = resolvedSetKey;
  setActualCode = code;
  setActualLang = lang;
  getSessionVisibleLangsForSetExact(code, lang);

  // Actualizar checkbox de ocultar colección
  const chkOcultarColeccion = document.getElementById("chkOcultarColeccion");
  if (chkOcultarColeccion) {
    chkOcultarColeccion.checked = hiddenCollections.has(code);
  }

  const info = setMetaByKey.get(resolvedSetKey) || { nombre: "Set", lang };
  document.getElementById("tituloSet").textContent = info.nombre; // Sin mostrar idioma
  aplicarUILangSet();
  renderSetVisibleLangToolbar();

  // UI rápida de “cargando”
  document.getElementById("progresoSet").textContent = "Cargando cartas...";
  document.getElementById("listaCartasSet").innerHTML = `<div class="card"><p>Cargando…</p></div>`;
  setSetListLoadingState(true, `Cargando cartas en ${getLangDisplayLabel(lang)}...`);
  mostrarPantalla("set", shouldPushSetHistory);

  try {
    await ensureSetCardsLoaded(resolvedSetKey);
    syncLegacyUiLangCacheForSet(code, lang);
    const missingUiLangs = getUiEnabledSetLangs().filter(candidateLang => candidateLang !== lang && !getSetVisibleLangChoices(code).includes(candidateLang));
    if (missingUiLangs.length > 0) {
      const hydrated = await hydrateUiSetLangChoicesFromSetData(code, missingUiLangs);
      if (hydrated) {
        renderSetVisibleLangToolbar(code);
      }
    }
    actualizarProgresoGuardado(resolvedSetKey);
    renderColecciones();
    if (cartasDeSetKey(resolvedSetKey).length === 0) {
      hiddenEmptySetKeys.add(resolvedSetKey);
guardarHiddenEmptySets();
renderColecciones(); // para que al volver ya no salga

  document.getElementById("progresoSet").textContent = "0 / 0";
  document.getElementById("listaCartasSet").innerHTML =
    `<div class="card"><p>No hay cartas para este set en este idioma.</p></div>`;
  return;
}

  } catch (err) {
    setSetListLoadingState(false);
    document.getElementById("listaCartasSet").innerHTML =
      `<div class="card"><p>Error cargando este set. Mira la consola.</p></div>`;
    console.error(err);
    return;
  }

  // Ya cargado: progreso real + tabla
  const { tengo, total } = progresoDeColeccion(resolvedSetKey);
  document.getElementById("progresoSet").textContent = `Progreso: ${tengo} / ${total}`;

  aplicarUIFiltrosSet();
  renderSetVisibleLangToolbar(code);
  renderTablaSet(resolvedSetKey);
  setSetListLoadingState(false);
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

  const createStepperRow = ({ label, classMinus, classPlus, classInput, stateKey, lang, min, max, value, disabledMinus, disabledPlus, disabledInput, controlKey, controlKind }) => {
    const row = document.createElement("div");
    row.className = "control-fila";

    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = label;

    const stepper = document.createElement("div");
    stepper.className = "stepper";

    const btnMinus = document.createElement("button");
    btnMinus.className = `btn-step ${classMinus}`;
    btnMinus.dataset.state = stateKey || "";
    btnMinus.dataset.lang = lang;
    if (controlKey) btnMinus.dataset.control = controlKey;
    if (controlKind) btnMinus.dataset.kind = controlKind;
    btnMinus.type = "button";
    btnMinus.textContent = "−";
    if (disabledMinus) btnMinus.disabled = true;

    const input = document.createElement("input");
    input.type = "number";
    input.className = `inp-num ${classInput}`;
    input.dataset.state = stateKey || "";
    input.dataset.lang = lang;
    if (controlKey) input.dataset.control = controlKey;
    if (controlKind) input.dataset.kind = controlKind;
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    if (disabledInput) input.disabled = true;

    const btnPlus = document.createElement("button");
    btnPlus.className = `btn-step ${classPlus}`;
    btnPlus.dataset.state = stateKey || "";
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

  const createTagRow = ({ label, stateKey, lang, checked, controlKey }) => {
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
    input.dataset.state = stateKey || "";
    input.dataset.lang = lang;
    if (controlKey) input.dataset.control = controlKey;
    input.checked = !!checked;

    labelEl.appendChild(input);
    row.appendChild(lbl);
    row.appendChild(labelEl);
    return row;
  };

  const createLangPanel = ({ lang, stateKey, qty, foil, ri, extraCounters = [], extraTags = [] }) => {
    const panel = document.createElement("div");
    panel.className = "lang-panel";
    panel.dataset.lang = lang;

    if (getCardControlsConfig().showQty) {
      panel.appendChild(createStepperRow({
        label: "Cantidad",
        classMinus: "btn-qty-minus",
        classPlus: "btn-qty-plus",
        classInput: "inp-qty",
        stateKey,
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
        stateKey,
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
        stateKey,
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
      panel.appendChild(createTagRow({ label: tag.label, stateKey, lang, checked: tag.checked, controlKey: tag.key }));
    }
    return panel;
  };

  const createCartaItem = (c, idx) => {
    // Usar estado2 para determinar si tiene cantidad (suma de ambos idiomas)
    let totalQty = 0;
    let possession = null;
    const oracleId = c.oracle_id || "";
    const estadoKey = getEstadoKeyFromCard(c);

    if (estadoKey) {
      possession = getLegacyPossessionAdapterForState(estadoKey);
      totalQty = possession.totals.qty;
    } else {
      // Fallback para cartas sin oracle_id (no debería pasar)
      const stLegacy = getEstadoCarta(c.id);
      totalQty = stLegacy.qty;
      // Crear objeto compatible con estructura v2 para el renderizado
      possession = buildLegacyPossessionAdapter({ qty_en: stLegacy.qty, qty_es: 0, foil_en: stLegacy.foilQty, foil_es: 0, ri_en: stLegacy.wantMore, ri_es: false, counters_en: {}, counters_es: {}, tags_en: {}, tags_es: {} });
    }

    const controlsCfg = getCardControlsConfig();
    const langMode = controlsCfg.langMode || "both";
    const langsToShow = langMode === "both" ? ["en", "es"] : [langMode];

    const baseVisibleCard = normalizeVisibleVariantCard(c, c);
    const setCode = String(baseVisibleCard.setCode || c.setCode || c.set || parseSetKeyParts(c.setKey).code || "").toLowerCase();
    const collectorNumber = String(baseVisibleCard.collector_number || c.collector_number || c.numero || "");
    const langActivo = langMode === "both"
        ? getEffectiveSetVisibleLang(setCode, baseVisibleCard.lang || getActiveVisibleLang(setCode, String(baseVisibleCard.oracle_id || c.oracle_id || ""), collectorNumber, "en"))
      : getPreferredSetLang(setCode, langMode);
    const tieneImg = c._img && c._img.trim() !== "";
    const hasQty = totalQty > 0;

    const item = document.createElement("div");
    item.className = `carta-item${hasQty ? " has-qty" : ""}`;
    item.dataset.oracle = oracleId;
    item.dataset.stateKey = estadoKey;
    item.dataset.cardId = String(c.id);
    item.dataset.setCode = setCode;
    item.dataset.collectorNumber = collectorNumber;
    item.dataset.visiblePrintId = String(baseVisibleCard.id || c.id || "");
    item.dataset.visibleLang = String(langActivo || baseVisibleCard.lang || "en");

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
    btnCarta.dataset.setCode = setCode;
    btnCarta.dataset.collectorNumber = collectorNumber;
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
      img.dataset.set = setCode;
      img.dataset.numero = collectorNumber;
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
    controles.dataset.langMode = langMode;
    controles.dataset.langSelectorOpen = "false";
    controles.dataset.variantScope = "set-exact";
    controles.dataset.langSelectorLocked = "true";
    item.dataset.variantScope = "set-exact";

    const controlesHeader = document.createElement("div");
    controlesHeader.className = "controles-header";
    controlesHeader.innerHTML = renderVisibleVariantSelectorHTML(
      { ...baseVisibleCard, lang: langActivo },
      { langMode, panelOpen: false, context: "card", variantScope: "set-exact" }
    );

    const slider = document.createElement("div");
    slider.className = "lang-slider";
    const track = document.createElement("div");
    track.className = "lang-track";

    const extraCountersCfg = getEnabledCountersConfig().filter(c => c.key !== "qty" && c.key !== "foil");
    const extraTagsCfg = getEnabledTagsConfig();

    const buildExtraCounters = (lang) => extraCountersCfg.map(c => ({
      key: c.key,
      label: c.label,
      value: getCounterValue(possession.raw, lang, c.key)
    }));

    const buildExtraTags = (lang) => extraTagsCfg.map(t => ({
      key: t.key,
      label: t.label,
      checked: getTagValue(possession.raw, lang, t.key)
    }));

    for (const lang of langsToShow) {
      const langState = possession.langs[normalizeLegacyPossessionLang(lang)] || createEmptyLegacyPossessionLangEntry();
      track.appendChild(createLangPanel({
        lang,
        stateKey: estadoKey,
        qty: langState.qty,
        foil: langState.foil,
        ri: langState.ri,
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

    const initialVisibleCard = normalizeVisibleVariantCard({ ...baseVisibleCard, lang: langActivo }, baseVisibleCard);
    applyVisibleVariantToCardItem(item, initialVisibleCard);
    const preferredVisibleLang = langMode === "both"
      ? langActivo
      : langMode;
    resolveExactSetVariantForCard(baseVisibleCard, preferredVisibleLang).then(variantCard => {
      if (variantCard) applyVisibleVariantToCardItem(item, variantCard);
    }).catch(() => {});

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
        let restoreDisplay = null;
        let restoreVisibility = null;
        if (firstItem.style.display === "none") {
          restoreDisplay = firstItem.style.display;
          restoreVisibility = firstItem.style.visibility;
          firstItem.style.visibility = "hidden";
          firstItem.style.display = "";
        }

        const rect = firstItem.getBoundingClientRect();
        if (rect.height > 0) {
          virtualScrollState.rowHeight = rect.height + rowGap;
        }

        if (restoreDisplay !== null) {
          firstItem.style.display = restoreDisplay;
          firstItem.style.visibility = restoreVisibility;
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

    // --- NUEVO: Mantener todos los nodos y solo ocultar/mostrar ---
    // Inicializar todos los nodos una vez
    if (!grid._allCartaItems || grid._allCartaItems.length !== lista.length) {
      grid.innerHTML = "";
      grid._allCartaItems = [];
      for (let i = 0; i < lista.length; i++) {
        const item = createCartaItem(lista[i], i);
        item.style.display = "none";
        grid.appendChild(item);
        grid._allCartaItems.push(item);
      }
    }

    const setItemVisible = (idx, visible) => {
      const item = grid._allCartaItems[idx];
      if (!item) return;
      const nextDisplay = visible ? "" : "none";
      if (item.style.display !== nextDisplay) {
        item.style.display = nextDisplay;
      }
    };

    const renderRange = () => {
      if (!virtualScrollState.active) return;

      const { startRow, endRow, totalRows, columns, rowHeight } = calcRange();
      const startIdx = Math.max(0, startRow * columns);
      const endIdx = Math.min(lista.length, endRow * columns);

      // Solo actualizar si el rango cambia
      if (startIdx === virtualScrollState.lastStart && endIdx === virtualScrollState.lastEnd) return;

      const prevStart = virtualScrollState.lastStart;
      const prevEnd = virtualScrollState.lastEnd;

      virtualScrollState.lastStart = startIdx;
      virtualScrollState.lastEnd = endIdx;

      const topPad = startRow * rowHeight;
      const bottomPad = Math.max(0, (totalRows - endRow) * rowHeight);
      wrapper.style.paddingTop = `${topPad}px`;
      wrapper.style.paddingBottom = `${bottomPad}px`;

      // Actualización incremental: solo tocar nodos que entran/salen del rango.
      if (prevStart < 0 || prevEnd < 0) {
        for (let i = startIdx; i < endIdx; i++) setItemVisible(i, true);
        return;
      }

      // Se ocultan los que salieron por la izquierda
      for (let i = prevStart; i < Math.min(prevEnd, startIdx); i++) setItemVisible(i, false);
      // Se ocultan los que salieron por la derecha
      for (let i = Math.max(prevStart, endIdx); i < prevEnd; i++) setItemVisible(i, false);
      // Se muestran los que entraron por la izquierda
      for (let i = startIdx; i < Math.min(endIdx, prevStart); i++) setItemVisible(i, true);
      // Se muestran los que entraron por la derecha
      for (let i = Math.max(startIdx, prevEnd); i < endIdx; i++) setItemVisible(i, true);
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

    applyVerCartasState(grid);
    updateMetrics();
    // Forzar render inicial al entrar en el set
    renderRange();
    // Ejecutar un renderRange extra en el siguiente frame para asegurar render correcto
    requestAnimationFrame(() => {
      renderRange();
    });
  }
  
  if (DEBUG) {
    const endTime = performance.now();
    recordMetric('renderTablaSet', endTime - startTime);
  }
}

// Helper: Actualizar panel de idioma específico sin re-render completo
function actualizarPanelLang(estadoKey, lang) {
  const adapter = getLegacyPossessionAdapterForState(estadoKey);
  const langState = adapter.langs[normalizeLegacyPossessionLang(lang)] || createEmptyLegacyPossessionLangEntry();
  const qty = langState.qty;
  const foil = langState.foil;
  const cfg = getCardControlsConfig();
  
  // Buscar el panel específico de este estado y lang
  const cartaItem = document.querySelector(`.carta-item[data-state-key="${estadoKey}"]`);
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
    const value = getCounterValue(adapter.raw, lang, c.key);
    const input = panel.querySelector(`.inp-counter[data-control="${c.key}"]`);
    const btnMinus = panel.querySelector(`.btn-counter-minus[data-control="${c.key}"]`);
    if (input) input.value = value;
    if (btnMinus) btnMinus.disabled = value <= 0;
  }

  // Actualizar tags
  const extraTags = getEnabledTagsConfig();
  for (const t of extraTags) {
    const checked = getTagValue(adapter.raw, lang, t.key);
    const chk = panel.querySelector(`.chk-tag[data-control="${t.key}"]`);
    if (chk) chk.checked = !!checked;
  }
  
  // Actualizar LED (suma de ambos idiomas)
  const totalQty = adapter.totals.qty;
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
  const targetLang = getBulkSetTargetLang();
  
  const cartas = cartasDeSetKey(setActualKey);
  cartas.forEach(c => {
    const estadoKey = getEstadoKeyFromCard(c);
    if (!estadoKey) return;
    const possession = getLegacyPossessionAdapterForState(estadoKey);
    const targetQty = possession.langs[targetLang]?.qty || 0;
    if (targetQty === 0) {
      setQtyLang(estadoKey, targetLang, 1);
    }
  });
  
  renderTablaSet(setActualKey);
  scheduleRenderColecciones();
}

function desmarcarTodasCartasSet() {
  if (!setActualKey) return;
  const targetLang = getBulkSetTargetLang();
  
  const cartas = cartasDeSetKey(setActualKey);
  cartas.forEach(c => {
    const estadoKey = getEstadoKeyFromCard(c);
    if (!estadoKey) return;
    setQtyLang(estadoKey, targetLang, 0);
  });
  
  renderTablaSet(setActualKey);
  scheduleRenderColecciones();
}

function getBulkSetTargetLang(setCode = setActualCode) {
  const safeSetCode = String(setCode || setActualCode || "").trim().toLowerCase();
  const currentSetLang = safeSetCode && safeSetCode === setActualCode
    ? normalizeLegacyPossessionLang(setActualLang, "en")
    : "";
  return currentSetLang || normalizeLegacyPossessionLang(getActiveVisibleLang(safeSetCode), "en");
}

function getBulkSetTargetLangLabel(setCode = setActualCode) {
  const lang = getBulkSetTargetLang(setCode);
  return lang === "es" ? "español" : "inglés";
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
  const targetLang = getBulkSetTargetLang();
  
  const indices = parseRangosCartas(rangosTexto);
  if (indices.length === 0) return;
  
  const lista = getListaSetFiltrada(setActualKey);
  
  indices.forEach(idx => {
    // Las posiciones son 1-based para el usuario
    const cartaIdx = idx - 1;
    if (cartaIdx >= 0 && cartaIdx < lista.length) {
      const carta = lista[cartaIdx];
      const estadoKey = getEstadoKeyFromCard(carta);
      if (!estadoKey) return;
      adjustTotalQty(estadoKey, 1, targetLang);
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
        const possession = getLegacyPossessionAdapterForState(v.id, v.st2 || null);
        const langState = possession.langs[normalizeLegacyPossessionLang(lang)] || createEmptyLegacyPossessionLangEntry();
        const qty = langState.qty;
        const foilQty = langState.foil;
        const totalQty = possession.totals.qty;
        const hasQty = totalQty > 0;
        const imgUrl = v._img || "";

        let controlsHtml = "";

        if (controlsCfg.showQty) {
          controlsHtml += `
            <div class="control-fila">
              <span class="lbl">Cantidad</span>
              <div class="stepper">
                <button class="btn-step btn-qty-minus-buscar" data-state="${v.id}" data-lang="${lang}" ${qty <= 0 ? "disabled" : ""}>−</button>
                <input type="number" class="inp-num inp-qty-buscar" data-state="${v.id}" data-lang="${lang}" min="0" max="999" value="${qty}" />
                <button class="btn-step btn-qty-plus-buscar" data-state="${v.id}" data-lang="${lang}">+</button>
              </div>
            </div>
          `;
        }

        if (controlsCfg.showFoil) {
          controlsHtml += `
            <div class="control-fila">
              <span class="lbl">Foil</span>
              <div class="stepper">
                <button class="btn-step btn-foil-minus-buscar" data-state="${v.id}" data-lang="${lang}" ${foilQty <= 0 || qty === 0 ? "disabled" : ""}>−</button>
                <input type="number" class="inp-num inp-foil-buscar" data-state="${v.id}" data-lang="${lang}" min="0" max="${qty}" value="${foilQty}" ${qty === 0 ? "disabled" : ""} />
                <button class="btn-step btn-foil-plus-buscar" data-state="${v.id}" data-lang="${lang}" ${qty === 0 || foilQty >= qty ? "disabled" : ""}>+</button>
              </div>
            </div>
          `;
        }

        for (const c of extraCountersCfg) {
          const value = getCounterValue(possession.raw, lang, c.key);
          controlsHtml += `
            <div class="control-fila">
              <span class="lbl">${escapeHtml(c.label)}</span>
              <div class="stepper">
                <button class="btn-step btn-counter-minus" data-state="${v.id}" data-lang="${lang}" data-control="${escapeAttr(c.key)}" ${value <= 0 ? "disabled" : ""}>−</button>
                <input type="number" class="inp-num inp-counter" data-state="${v.id}" data-lang="${lang}" data-control="${escapeAttr(c.key)}" min="0" max="999" value="${value}" />
                <button class="btn-step btn-counter-plus" data-state="${v.id}" data-lang="${lang}" data-control="${escapeAttr(c.key)}">+</button>
              </div>
            </div>
          `;
        }

        for (const t of extraTagsCfg) {
          const checked = getTagValue(possession.raw, lang, t.key);
          controlsHtml += `
            <div class="control-fila">
              <span class="lbl">${escapeHtml(t.label)}</span>
              <label class="chkline">
                <input type="checkbox" class="chk-tag" data-state="${v.id}" data-lang="${lang}" data-control="${escapeAttr(t.key)}" ${checked ? "checked" : ""} />
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
        const possession = getLegacyPossessionAdapterForState(v.id, v.st2 || null);
        const langState = possession.langs[normalizeLegacyPossessionLang(lang)] || createEmptyLegacyPossessionLangEntry();
        const qty = langState.qty;
        const foilQty = langState.foil;

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
                    <button class="btn-step btn-qty-minus-buscar" data-state="${v.id}" data-lang="${lang}" ${qty <= 0 ? "disabled" : ""}>−</button>
                    <input
                      type="number"
                      class="inp-num inp-qty-buscar"
                      data-state="${v.id}"
                      data-lang="${lang}"
                      min="0"
                      max="999"
                      value="${qty}"
                    />
                    <button class="btn-step btn-qty-plus-buscar" data-state="${v.id}" data-lang="${lang}">+</button>
                  </div>
                </div>

                <!-- Foil -->
                <div class="control-fila-buscar">
                  <span class="lbl-buscar">Foil</span>
                  <div class="stepper stepper-buscar">
                    <button class="btn-step btn-foil-minus-buscar" data-state="${v.id}" data-lang="${lang}" ${foilQty <= 0 || qty === 0 ? "disabled" : ""}>−</button>
                    <input
                      type="number"
                      class="inp-num inp-foil-buscar"
                      data-state="${v.id}"
                      data-lang="${lang}"
                      min="0"
                      max="${qty}"
                      value="${foilQty}"
                      ${qty === 0 ? "disabled" : ""}
                    />
                    <button class="btn-step btn-foil-plus-buscar" data-state="${v.id}" data-lang="${lang}" ${qty === 0 || foilQty >= qty ? "disabled" : ""}>+</button>
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
        const estadoKey = btn.dataset.state;
        const lang = btn.dataset.lang || "en";
        if (!estadoKey) return;
        const currentQty = getLegacyPossessionAdapterForState(estadoKey).langs[normalizeLegacyPossessionLang(lang)].qty;
        setQtyLang(estadoKey, lang, currentQty - 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-qty-plus-buscar")) {
        const estadoKey = btn.dataset.state;
        const lang = btn.dataset.lang || "en";
        if (!estadoKey) return;
        const currentQty = getLegacyPossessionAdapterForState(estadoKey).langs[normalizeLegacyPossessionLang(lang)].qty;
        setQtyLang(estadoKey, lang, currentQty + 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-foil-minus-buscar")) {
        const estadoKey = btn.dataset.state;
        const lang = btn.dataset.lang || "en";
        if (!estadoKey) return;
        const currentFoil = getLegacyPossessionAdapterForState(estadoKey).langs[normalizeLegacyPossessionLang(lang)].foil;
        setFoilLang(estadoKey, lang, currentFoil - 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-foil-plus-buscar")) {
        const estadoKey = btn.dataset.state;
        const lang = btn.dataset.lang || "en";
        if (!estadoKey) return;
        const currentFoil = getLegacyPossessionAdapterForState(estadoKey).langs[normalizeLegacyPossessionLang(lang)].foil;
        setFoilLang(estadoKey, lang, currentFoil + 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-counter-minus")) {
        const estadoKey = btn.dataset.state;
        const lang = btn.dataset.lang || "en";
        const key = btn.dataset.control;
        if (!estadoKey || !key) return;
        const st2 = getEstadoCarta2(estadoKey);
        const currentVal = getCounterValue(st2, lang, key);
        setCounterLang(estadoKey, lang, key, currentVal - 1);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
        return;
      }

      if (btn.classList.contains("btn-counter-plus")) {
        const estadoKey = btn.dataset.state;
        const lang = btn.dataset.lang || "en";
        const key = btn.dataset.control;
        if (!estadoKey || !key) return;
        const st2 = getEstadoCarta2(estadoKey);
        const currentVal = getCounterValue(st2, lang, key);
        setCounterLang(estadoKey, lang, key, currentVal + 1);
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
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang || "en";
        if (!estadoKey) return;
        setQtyLang(estadoKey, lang, target.value);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
      }

      if (target.classList.contains("inp-foil-buscar")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang || "en";
        if (!estadoKey) return;
        setFoilLang(estadoKey, lang, target.value);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
      }

      if (target.classList.contains("inp-counter")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang || "en";
        const key = target.dataset.control;
        if (!estadoKey || !key) return;
        setCounterLang(estadoKey, lang, key, target.value);
        renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
        scheduleRenderColecciones();
      }

      if (target.classList.contains("chk-tag")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang || "en";
        const key = target.dataset.control;
        if (!estadoKey || !key) return;
        setTagLang(estadoKey, lang, key, target.checked);
      }
    });
  }
}


function exportarEstado() {
  const version = hasEstado3Data() ? 3 : 2;
  const payload = {
    app: "MTG Colecciones",
    version,
    exportedAt: new Date().toISOString(),
    estado, // Legacy para compatibilidad
    estado2, // Nuevo modelo
    estado3, // Modelo v3 separado por posesión
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
  if (payload.estado3 && typeof payload.estado3 === "object") return { ok: true, msg: "" };
  if (payload.estado2 && typeof payload.estado2 === "object") return { ok: true, msg: "" };
  if (!payload.estado || typeof payload.estado !== "object") return { ok: false, msg: "Falta 'estado', 'estado2' o 'estado3' en el JSON." };
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

  // Importar estado legacy (siempre presente en versiones antiguas)
  if (payload.estado && typeof payload.estado === "object") {
    estado = payload.estado;
  }

  if (payload.estado3 && typeof payload.estado3 === "object") {
    estado3 = normalizeEstado3(payload.estado3);
    guardarEstado3();
  }

  // Importar estado2 si está presente (versión 2)
  if (payload.estado2) {
    estado2 = payload.estado2;
    guardarEstado2();
  }

  // Importar oracleIdCache si está presente
  if (payload.oracleIdCache) {
    oracleIdCache = payload.oracleIdCache;
    guardarOracleCache();
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
    cont.innerHTML = `<div class="card"><p class="hint">No hay decks todavía.</p></div>`;
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
    setsACargar.add(getPreferredSetKey(carta.set, "en"));
  }
  
  // Cargar todos los sets necesarios en paralelo (más rápido)
  await Promise.all(
    Array.from(setsACargar).map(setKey => ensureSetCardsLoaded(setKey).catch(() => {}))
  );
  
  // Caché de búsquedas por nombre para evitar duplicados
  const cacheBusquedas = new Map();
  
  for (const carta of cartas) {
    const setKey = getPreferredSetKey(carta.set, "en");
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
    if (existeExacta) {
      const estadoKeyExacta = getEstadoKeyFromCard(existeExacta);
      const totalQty = estadoKeyExacta ? getTotalQtyEstado2(getEstadoCartaCompatV3(estadoKeyExacta)) : 0;
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
      const totalQty = getTotalQtyByOracle(oracleId);
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
            if (normalizarTexto(c.nombre) === nombreNorm) {
              const estadoKey = getEstadoKeyFromCard(c);
              const totalQty = estadoKey ? getTotalQtyEstado2(getEstadoCartaCompatV3(estadoKey)) : 0;
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
                const totalQty = getTotalQtyByOracle(version.oracle_id);
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
  const setKey = getPreferredSetKey(carta.set, "en");
  
  // Cargar el set y obtener la imagen
  await ensureSetCardsLoaded(setKey);
  const listaSet = cartasDeSetKey(setKey);
  const cartaCatalogo = listaSet.find(c => c.numero === carta.numero);
  const tieneImg = cartaCatalogo?._img && cartaCatalogo._img.trim() !== "";
  const imagenUrl = cartaCatalogo?._img || '';
  
  // Obtener cantidad real de la colección
  const estadoKeyDeck = getEstadoKeyFromCard(cartaCatalogo);
  const adapter = estadoKeyDeck
    ? getLegacyPossessionAdapterForState(estadoKeyDeck)
    : buildLegacyPossessionAdapter({ qty_en: 0, qty_es: 0, foil_en: 0, foil_es: 0 });
  const cantidadMostrar = adapter.totals.qty;
  
  const estadoKey = estadoKeyDeck || '';
  
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
            <button class="btn-step btn-qty-minus-deck" data-state="${estadoKey}" ${cantidadMostrar <= 0 ? "disabled" : ""}>−</button>
            <input
              type="number"
              class="inp-num inp-qty-deck"
              data-state="${estadoKey}"
              min="0"
              max="999"
              value="${cantidadMostrar}"
            />
            <button class="btn-step btn-qty-plus-deck" data-state="${estadoKey}">+</button>
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
      
      const setKey = getPreferredSetKey(set, "en");
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
      const estadoKey = btn.dataset.state;
      if (!estadoKey) return;
      const preferredLang = getPreferredLangForEstadoKey(estadoKey, "en");
      adjustTotalQty(estadoKey, -1, preferredLang);
      renderDeckCartas();
      renderColecciones();
    });
  });

  cont.querySelectorAll(".btn-qty-plus-deck").forEach(btn => {
    btn.addEventListener("click", () => {
      const estadoKey = btn.dataset.state;
      if (!estadoKey) return;
      const preferredLang = getPreferredLangForEstadoKey(estadoKey, "en");
      adjustTotalQty(estadoKey, 1, preferredLang);
      renderDeckCartas();
      renderColecciones();
    });
  });

  cont.querySelectorAll(".inp-qty-deck").forEach(inp => {
    inp.addEventListener("change", () => {
      const estadoKey = inp.dataset.state;
      if (!estadoKey) return;
      const preferredLang = getPreferredLangForEstadoKey(estadoKey, "en");
      setTotalQtyWithPreferredLang(estadoKey, inp.value, preferredLang);
      renderDeckCartas();
      renderColecciones();
    });
  });
}

function renderCartaDeck(carta, numero, tipo) {
  const ledIcon = carta.ledType === 'violeta' ? 'Ledvioleta' : (carta.tengo ? 'Ledazul' : 'Ledrojo');
  const cartaId = `${carta.set}-${carta.numero}-${tipo}`;
  const setKey = getPreferredSetKey(carta.set, "en");
  
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
  const setKey = getPreferredSetKey(set, "en");
  await ensureSetCardsLoaded(setKey);
  const listaSet = cartasDeSetKey(setKey);
  const carta = listaSet.find(c => c.numero === numero);
  
  const estadoKey = getEstadoKeyFromCard(carta);
  if (estadoKey) {
    const adapter = getLegacyPossessionAdapterForState(estadoKey);
    if (adapter.totals.qty === 0) {
      const preferredLang = getPreferredLangForEstadoKey(estadoKey, "en");
      setQtyLang(estadoKey, preferredLang, 1);
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
      const setKey = getPreferredSetKey(set, "en");
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

  // Menú principal (delegado)
  if (!document.body.dataset.menuWired) {
    document.body.dataset.menuWired = "1";
    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-menu");
      if (!btn) return;
      handleMenuNavigation(btn.dataset.pantalla);
    });
  }

  const backTargets = {
    volverMenu: "menu",
    volverDecks: "decks",
    volverColecciones: "colecciones"
  };

  // Volver al menú
  document.querySelectorAll("[data-action='volverMenu']").forEach(btn => {
    btn.addEventListener("click", () => {
      navegarAObjetivo(backTargets[btn.dataset.action]);
    });
  });
  
  // Buscar actualizaciones manualmente (solo web/PWA)
  const btnBuscarActualizaciones = document.getElementById("btnBuscarActualizaciones");
  if (btnBuscarActualizaciones) {
    const isElectronRuntime = String(navigator?.userAgent || "").toLowerCase().includes("electron/");

    if (isElectronRuntime) {
      btnBuscarActualizaciones.hidden = true;
    } else {
      btnBuscarActualizaciones.addEventListener("click", async () => {
        await buscarActualizacionesManualmente();
      });
    }
  }

  // Volver a decks
  document.querySelectorAll("[data-action='volverDecks']").forEach(btn => {
    btn.addEventListener("click", () => {
      navegarAObjetivo(backTargets[btn.dataset.action]);
    });
  });

  // Volver a colecciones
  document.querySelectorAll("[data-action='volverColecciones']").forEach(btn => {
    btn.addEventListener("click", () => {
      navegarAObjetivo(backTargets[btn.dataset.action]);
    });
  });

  // Buscar cartas
  const btnBuscar = document.getElementById("btnBuscar");
  if (btnBuscar) {
    btnBuscar.addEventListener("click", async () => {
      const inputBuscar = document.getElementById("inputBuscar");
      clearBuscarSuggestions();
      await renderResultadosBuscar(inputBuscar ? inputBuscar.value : "", { exact: getBuscarExacta() });
    });
  }

  const inputBuscar = document.getElementById("inputBuscar");
  const buscarSuggestionsList = document.getElementById("buscarCardSuggestions");
  if (inputBuscar) {
    inputBuscar.addEventListener("input", () => {
      programarBuscarSuggestions(inputBuscar.value);
    });
    inputBuscar.addEventListener("focus", () => {
      const currentQuery = inputBuscar.value.trim();
      if (buscarSuggestionsItems.length && currentQuery.length >= SEARCH_AUTOCOMPLETE_MIN_CHARS) {
        setBuscarSuggestionsVisible(true);
      }
    });
    inputBuscar.addEventListener("keydown", async (e) => {
      if (e.key === "ArrowDown") {
        if (buscarSuggestionsItems.length) {
          e.preventDefault();
          moveBuscarSuggestionsActive(1);
        }
        return;
      }

      if (e.key === "ArrowUp") {
        if (buscarSuggestionsItems.length) {
          e.preventDefault();
          moveBuscarSuggestionsActive(-1);
        }
        return;
      }

      if (e.key === "Escape") {
        if (buscarSuggestionsVisible) {
          e.preventDefault();
          setBuscarSuggestionsVisible(false);
        }
        return;
      }

      if (e.key === "Enter") {
        if (buscarSuggestionsVisible && buscarSuggestionsActiveIndex >= 0 && buscarSuggestionsItems[buscarSuggestionsActiveIndex]) {
          e.preventDefault();
          applyBuscarSuggestion(buscarSuggestionsItems[buscarSuggestionsActiveIndex]);
        }
        clearBuscarSuggestions();
        await renderResultadosBuscar(inputBuscar.value, { exact: getBuscarExacta() });
      }
    });
  }

  if (buscarSuggestionsList) {
    buscarSuggestionsList.addEventListener("mousedown", (e) => {
      const button = e.target.closest(".buscar-sugerencias-item");
      if (!button) return;
      e.preventDefault();
    });

    buscarSuggestionsList.addEventListener("click", async (e) => {
      const button = e.target.closest(".buscar-sugerencias-item");
      if (!button) return;
      const index = Number(button.dataset.suggestionIndex);
      const nombre = buscarSuggestionsItems[index];
      if (!nombre) return;
      applyBuscarSuggestion(nombre);
      await renderResultadosBuscar(nombre, { exact: getBuscarExacta() });
    });
  }

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".buscar-sugerencias-wrap")) return;
    setBuscarSuggestionsVisible(false);
  });

  const chkBuscarExacta = document.getElementById("chkBuscarExacta");
  if (chkBuscarExacta) {
    chkBuscarExacta.addEventListener("change", () => {
      buscarExacta = !!chkBuscarExacta.checked;
    });
  }

  const chkBuscarVerImagenes = document.getElementById("chkBuscarVerImagenes");
  if (chkBuscarVerImagenes) {
    chkBuscarVerImagenes.addEventListener("change", () => {
      buscarVerImagenes = !chkBuscarVerImagenes.checked;
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

  const inputCreatureTypeCommander = document.getElementById("inputCreatureTypeCommander");
  if (inputCreatureTypeCommander) {
    ensureCommanderCreatureTypeCatalogLoaded().finally(() => {
      updateCommanderCreatureTypeSuggestions();
    });
    inputCreatureTypeCommander.addEventListener("focus", () => {
      ensureCommanderCreatureTypeCatalogLoaded().finally(() => {
        updateCommanderCreatureTypeSuggestions();
      });
    });
    inputCreatureTypeCommander.addEventListener("input", () => {
      updateCommanderCreatureTypeSuggestions();
    });
    inputCreatureTypeCommander.addEventListener("change", () => {
      maybeAppendCommanderCreatureTypeSeparator();
    });
    inputCreatureTypeCommander.addEventListener("blur", () => {
      maybeAppendCommanderCreatureTypeSeparator();
    });
    inputCreatureTypeCommander.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") await renderResultadosComandantes();
    });
  }

  document.querySelectorAll(".chk-commander-color").forEach(chk => {
    chk.addEventListener("change", () => syncCommanderColorSelection(chk));
  });

  const chkCommanderColorless = document.getElementById("chkCommanderColorless");
  if (chkCommanderColorless) {
    chkCommanderColorless.addEventListener("change", () => syncCommanderColorSelection(chkCommanderColorless));
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
    chkSoloFaltanSet.addEventListener("change", () => {
      setFiltroSoloFaltanSet(chkSoloFaltanSet.checked);
      if (chkEnPosesionSet) chkEnPosesionSet.checked = filtroEnPosesionSet;
      chkSoloFaltanSet.checked = filtroSoloFaltanSet;
    });
  }

  const chkEnPosesionSet = document.getElementById("chkEnPosesionSet");
  if (chkEnPosesionSet) {
    chkEnPosesionSet.addEventListener("change", () => {
      setFiltroEnPosesionSet(chkEnPosesionSet.checked);
      if (chkSoloFaltanSet) chkSoloFaltanSet.checked = filtroSoloFaltanSet;
      chkEnPosesionSet.checked = filtroEnPosesionSet;
    });
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

  if (modalOpcionesControles) {
    // Estado inicial robusto: oculto aunque falle alguna regla CSS.
    modalOpcionesControles.classList.add("modal-overlay-hidden");
    modalOpcionesControles.hidden = true;
  }

  const closeOpcionesControles = () => {
    if (modalOpcionesControles) {
      modalOpcionesControles.classList.add("modal-overlay-hidden");
      modalOpcionesControles.hidden = true;
    }
  };

  if (btnOpcionesControles && modalOpcionesControles) {
    btnOpcionesControles.addEventListener("click", () => {
      renderCardControlsOptionsUI();
      modalOpcionesControles.hidden = false;
      modalOpcionesControles.classList.remove("modal-overlay-hidden");
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
  const modalConfirmacion = document.getElementById("modalConfirmacion");
  const modalConfirmacionTitulo = document.getElementById("modalConfirmacionTitulo");
  const modalConfirmacionMensaje = document.getElementById("modalConfirmacionMensaje");
  const btnAceptarConfirmacion = document.getElementById("btnAceptarConfirmacion");
  const btnCancelarConfirmacion = document.getElementById("btnCancelarConfirmacion");
  let resolverConfirmacionActual = null;

  function cerrarModalConfirmacion(confirmado = false) {
    if (!modalConfirmacion || modalConfirmacion.classList.contains("hidden")) return;

    modalConfirmacion.classList.add("hidden");

    const resolver = resolverConfirmacionActual;
    resolverConfirmacionActual = null;
    if (resolver) resolver(confirmado);
  }

  function mostrarModalConfirmacion({
    titulo = "Confirmar acción",
    mensaje = "¿Deseas continuar?",
    textoAceptar = "Aceptar",
    textoCancelar = "Cancelar"
  } = {}) {
    if (!modalConfirmacion || !modalConfirmacionTitulo || !modalConfirmacionMensaje || !btnAceptarConfirmacion || !btnCancelarConfirmacion) {
      return Promise.resolve(confirm(mensaje));
    }

    if (resolverConfirmacionActual) {
      cerrarModalConfirmacion(false);
    }

    modalConfirmacionTitulo.textContent = titulo;
    modalConfirmacionMensaje.textContent = mensaje;
    btnAceptarConfirmacion.textContent = textoAceptar;
    btnCancelarConfirmacion.textContent = textoCancelar;
    modalConfirmacion.classList.remove("hidden");

    return new Promise((resolve) => {
      resolverConfirmacionActual = resolve;
      requestAnimationFrame(() => btnCancelarConfirmacion.focus());
    });
  }

  if (btnAceptarConfirmacion) {
    btnAceptarConfirmacion.addEventListener("click", () => cerrarModalConfirmacion(true));
  }

  if (btnCancelarConfirmacion) {
    btnCancelarConfirmacion.addEventListener("click", () => cerrarModalConfirmacion(false));
  }

  if (modalConfirmacion) {
    modalConfirmacion.addEventListener("click", (e) => {
      if (e.target && e.target.dataset && e.target.dataset.action === "cancelarConfirmacion") {
        cerrarModalConfirmacion(false);
      }
    });
  }

  if (btnMarcarTodasSet) {
    btnMarcarTodasSet.addEventListener("click", async () => {
      const targetLangLabel = getBulkSetTargetLangLabel();
      const confirmarMarcarTodas = await mostrarModalConfirmacion({
        titulo: "Marcar todas",
        mensaje: `¿Seguro que quieres marcar todas las cartas de este set en ${targetLangLabel}?`,
        textoAceptar: "Aceptar",
        textoCancelar: "Cancelar"
      });
      if (!confirmarMarcarTodas) return;

      marcarTodasCartasSet();
    });
  }

  // Desmarcar todas las cartas del set
  const btnDesmarcarTodasSet = document.getElementById("btnDesmarcarTodasSet");
  if (btnDesmarcarTodasSet) {
    btnDesmarcarTodasSet.addEventListener("click", async () => {
      const targetLangLabel = getBulkSetTargetLangLabel();
      const confirmarDesmarcarTodas = await mostrarModalConfirmacion({
        titulo: "Desmarcar todas",
        mensaje: `¿Seguro que quieres desmarcar todas las cartas de este set en ${targetLangLabel}?`,
        textoAceptar: "Aceptar",
        textoCancelar: "Cancelar"
      });
      if (!confirmarDesmarcarTodas) return;

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
      guardarFiltrosColecciones();
      aplicarUIFiltrosTipo();
      renderColecciones();
    });
  }

  const btnArt = document.getElementById("btnToggleArte");
  if (btnArt) {
    btnArt.addEventListener("click", () => {
      ocultarArte = !ocultarArte;
      guardarFiltrosColecciones();
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
      filtroTiposSet = normalizeSetTypeFilters([...filtroTiposSet]);
      guardarFiltrosColecciones();
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
      filtroTiposSet = new Set(DEFAULT_SET_TYPE_FILTERS);
      guardarFiltrosColecciones();
      aplicarUIFiltrosTipo();
      renderColecciones();
    });
  }
  
  // Botón desmarcar todos
  const btnDesmarcarTodos = document.getElementById("btnDesmarcarTodos");
  if (btnDesmarcarTodos) {
    btnDesmarcarTodos.addEventListener("click", () => {
      filtroTiposSet.clear();
      guardarFiltrosColecciones();
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
    if (e.key !== "Escape") return;

    if (document.querySelector('.carta-controles[data-lang-selector-open="true"]')) {
      closeAllVisibleVariantPanels();
      return;
    }

    const setLangToolbar = document.getElementById("setLangToolbar");
    if (setLangToolbar && setLangToolbar.dataset.langSelectorOpen === "true") {
      closeSetVisibleLangPanel();
      return;
    }

    if (modalConfirmacion && !modalConfirmacion.classList.contains("hidden")) {
      cerrarModalConfirmacion(false);
      return;
    }

    cerrarModalCarta();
  });

  if (!document.body.dataset.visibleVariantPanelsWired) {
    document.body.dataset.visibleVariantPanelsWired = "1";
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (target.closest("#setLangToolbar .btn-lang-panel-toggle")) return;
      if (target.closest("#setLangToolbar .lang-selector-panel")) return;
      if (target.closest(".btn-lang-panel-toggle")) return;
      if (target.closest(".lang-selector-panel")) return;
      closeAllVisibleVariantPanels();
      closeSetVisibleLangPanel();
    });
  }

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
        const cartaItem = btn.closest(".carta-item");
        const visibleId = cartaItem?.dataset.visiblePrintId || id;
        const carta = getKnownCardById(visibleId)
          || (cacheCartasPorSetLang[setKey] || []).find(x => x.id === visibleId)
          || (cacheCartasPorSetLang[setKey] || []).find(x => x.id === id);
        
        abrirModalCarta({
          titulo: carta?.nombre || "Carta",
          imageUrl: carta?._img || null,
          numero: carta?.collector_number || carta?.numero || "",
          rareza: carta?.rareza || "",
          precio: formatPrecioEUR(carta?._prices),
          cardData: carta?._raw || null,
          oracleId: carta?.oracle_id || null,
          setCode: cartaItem?.dataset.setCode || carta?.setCode || carta?.set || "",
          collectorNumber: cartaItem?.dataset.collectorNumber || carta?.collector_number || carta?.numero || "",
          navLista: getListaSetFiltrada(setKey),
          navIndex: getListaSetFiltrada(setKey).findIndex(c => c.id === id)
        });
        return;
      }
      
      if (target.closest(".btn-lang-panel-toggle")) {
        const controls = target.closest(".carta-controles");
        if (!controls) return;
        if (controls.dataset.langSelectorLocked === "true") return;
        const shouldOpen = controls.dataset.langSelectorOpen !== "true";
        closeSetVisibleLangPanel();
        closeAllVisibleVariantPanels(shouldOpen ? controls : null);
        setVisibleVariantPanelOpen(controls, shouldOpen);
        return;
      }

      if (target.closest(".btn-lang-choice")) {
        const choiceBtn = target.closest(".btn-lang-choice");
        const cartaControles = choiceBtn.closest(".carta-controles");
        const cartaItem = choiceBtn.closest(".carta-item");
        if (!choiceBtn || !cartaControles || !cartaItem) return;
        if (cartaControles.dataset.langSelectorLocked === "true" || choiceBtn.dataset.langLocked === "true") {
          setVisibleVariantSelectorFeedback(cartaControles, buildVisibleVariantLockFeedback(), { type: "info" });
          return;
        }
        if (cartaControles.dataset.animating === "true") return;
        cartaControles.dataset.animating = "true";
        try {
          await selectVisibleVariantLangForElement(cartaItem, choiceBtn.dataset.langChoice || "");
          syncVisibleVariantSelectorUI(cartaItem, getCurrentVisibleVariantCardForElement(cartaItem));
        } finally {
          setTimeout(() => {
            cartaControles.dataset.animating = "false";
          }, 180);
        }
        return;
      }
      
      // Botones cantidad
      if (target.classList.contains("btn-qty-minus")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        if (!estadoKey || !lang) return;
        const currentQty = getLegacyPossessionAdapterForState(estadoKey).langs[normalizeLegacyPossessionLang(lang)].qty;
        setQtyLang(estadoKey, lang, currentQty - 1);
        actualizarPanelLang(estadoKey, lang);
        scheduleRenderColecciones();
        return;
      }
      
      if (target.classList.contains("btn-qty-plus")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        if (!estadoKey || !lang) return;
        const currentQty = getLegacyPossessionAdapterForState(estadoKey).langs[normalizeLegacyPossessionLang(lang)].qty;
        setQtyLang(estadoKey, lang, currentQty + 1);
        actualizarPanelLang(estadoKey, lang);
        scheduleRenderColecciones();
        return;
      }
      
      // Botones foil
      if (target.classList.contains("btn-foil-minus")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        if (!estadoKey || !lang) return;
        const currentFoil = getLegacyPossessionAdapterForState(estadoKey).langs[normalizeLegacyPossessionLang(lang)].foil;
        setFoilLang(estadoKey, lang, currentFoil - 1);
        actualizarPanelLang(estadoKey, lang);
        scheduleRenderColecciones();
        return;
      }
      
      if (target.classList.contains("btn-foil-plus")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        if (!estadoKey || !lang) return;
        const currentFoil = getLegacyPossessionAdapterForState(estadoKey).langs[normalizeLegacyPossessionLang(lang)].foil;
        setFoilLang(estadoKey, lang, currentFoil + 1);
        actualizarPanelLang(estadoKey, lang);
        scheduleRenderColecciones();
        return;
      }

      // Contadores personalizados
      if (target.classList.contains("btn-counter-minus")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        const key = target.dataset.control;
        if (!estadoKey || !lang || !key) return;
        const st2 = getEstadoCarta2(estadoKey);
        const currentVal = getCounterValue(st2, lang, key);
        setCounterLang(estadoKey, lang, key, currentVal - 1);
        actualizarPanelLang(estadoKey, lang);
        scheduleRenderColecciones();
        return;
      }

      if (target.classList.contains("btn-counter-plus")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        const key = target.dataset.control;
        if (!estadoKey || !lang || !key) return;
        const st2 = getEstadoCarta2(estadoKey);
        const currentVal = getCounterValue(st2, lang, key);
        setCounterLang(estadoKey, lang, key, currentVal + 1);
        actualizarPanelLang(estadoKey, lang);
        scheduleRenderColecciones();
        return;
      }
    });
    
    // Change events para inputs
    listaCartasSet.addEventListener("change", (e) => {
      const target = e.target;

      if (target.classList.contains("chk-visible-lang")) {
        const controls = target.closest(".carta-controles");
        const cartaItem = target.closest(".carta-item");
        if (!controls || !cartaItem) return;
        if (controls.dataset.langSelectorLocked === "true") {
          target.checked = !!target.defaultChecked;
          return;
        }

        const currentCard = getCurrentVisibleVariantCardForElement(cartaItem);
        if (!currentCard) return;
        const normalized = normalizeVisibleVariantCard(currentCard, currentCard);
        const availableLangs = getAvailableVariantLangsForCard(normalized);
        const selectedLangs = availableLangs.filter(lang => {
          const checkbox = controls.querySelector(`.chk-visible-lang[data-lang-option="${lang}"]`);
          return !!checkbox?.checked;
        });

        if (selectedLangs.length === 0) {
          target.checked = true;
          return;
        }

        updateVisibleLangSelectionForElement(cartaItem, selectedLangs).then(() => {
          syncVisibleVariantSelectorUI(cartaItem, getCurrentVisibleVariantCardForElement(cartaItem));
        }).catch(() => {});
        return;
      }
      
      // Input cantidad
      if (target.classList.contains("inp-qty")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        if (!estadoKey || !lang) return;
        setQtyLang(estadoKey, lang, target.value);
        actualizarPanelLang(estadoKey, lang);
        scheduleRenderColecciones();
        return;
      }
      
      // Input foil
      if (target.classList.contains("inp-foil")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        if (!estadoKey || !lang) return;
        setFoilLang(estadoKey, lang, target.value);
        actualizarPanelLang(estadoKey, lang);
        scheduleRenderColecciones();
        return;
      }

      // Inputs de contadores personalizados
      if (target.classList.contains("inp-counter")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        const key = target.dataset.control;
        if (!estadoKey || !lang || !key) return;
        setCounterLang(estadoKey, lang, key, target.value);
        actualizarPanelLang(estadoKey, lang);
        scheduleRenderColecciones();
        return;
      }
      
      // Tags
      if (target.classList.contains("chk-tag")) {
        const estadoKey = target.dataset.state;
        const lang = target.dataset.lang;
        const key = target.dataset.control;
        if (!estadoKey || !lang || !key) return;
        setTagLang(estadoKey, lang, key, target.checked);
        return;
      }
    });
  }

  const setLangToolbar = document.getElementById("setLangToolbar");
  if (setLangToolbar && !setLangToolbar.dataset.wired) {
    setLangToolbar.dataset.wired = "1";

    setLangToolbar.addEventListener("click", async (e) => {
      const target = e.target;

      const toggleBtn = target.closest("[data-set-lang-panel-toggle]");
      if (toggleBtn) {
        const shouldOpen = setLangToolbar.dataset.langSelectorOpen !== "true";
        closeAllVisibleVariantPanels();
        setSetVisibleLangPanelOpen(shouldOpen);
        return;
      }

      const choiceBtn = target.closest("[data-set-lang-choice]");
      if (!choiceBtn) return;

      const safeSetCode = String(choiceBtn.dataset.setCode || setActualCode || "").trim().toLowerCase();
      const selectedLang = normalizeLanguagePreferenceCode(choiceBtn.dataset.setLangChoice, getActiveVisibleLang(safeSetCode));
      if (!safeSetCode || !selectedLang) return;

      closeSetVisibleLangPanel();
      clearSetLangToolbarFeedback({ rerender: false });

      setSetLangToolbarLoading(safeSetCode, selectedLang, true);

      try {
        const result = await switchSetBaseLanguageWithResult(safeSetCode, selectedLang);
        const feedback = buildSetLangSwitchFeedback(result);
        if (feedback) {
          setSetLangToolbarFeedback(safeSetCode, feedback);
        } else {
          clearSetLangToolbarFeedback({ rerender: false });
        }

        if (result?.reason === "load-error" && result?.error) {
          console.warn(`No se pudo cambiar el idioma base del set ${safeSetCode}:`, result.error);
        }
      } catch (err) {
        console.warn(`No se pudo cambiar el idioma base del set ${safeSetCode}:`, err);
        setSetLangToolbarFeedback(safeSetCode, {
          type: "error",
          message: "No se pudo cargar el idioma. Intentalo otra vez.",
          timeoutMs: 6200,
          persist: true
        });
      } finally {
        setSetLangToolbarLoading(safeSetCode, "", false);
      }
    });

    setLangToolbar.addEventListener("change", async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || !target.classList.contains("chk-set-visible-lang")) return;

      const safeSetCode = String(target.dataset.setCode || setActualCode || "").trim().toLowerCase();
      if (!safeSetCode) return;

      const availableLangs = sortVariantLangCodes(getSetRuntimeUiLangs(safeSetCode), [getActiveVisibleLang(safeSetCode), "en", "es"]);
      const selectedLangs = availableLangs.filter(lang => {
        const checkbox = setLangToolbar.querySelector(`.chk-set-visible-lang[data-set-lang-option="${lang}"]`);
        return !!checkbox?.checked;
      });

      if (selectedLangs.length === 0) {
        target.checked = true;
        return;
      }

      const nextVisibleLangs = setSessionVisibleLangsForSetExact(safeSetCode, selectedLangs, getActiveVisibleLang(safeSetCode));
      const activeLang = getActiveVisibleLang(safeSetCode);
      if (!nextVisibleLangs.includes(activeLang)) {
        setActiveVisibleLang(safeSetCode, nextVisibleLangs[0], { persist: false, syncLegacy: true });
      }

      clearSetExactSessionVisibleLangOverridesForSet(safeSetCode);
      clearVisibleVariantOverridesForSet(safeSetCode, { persist: false });
      guardarEstado3();

      await syncOpenedSetToActiveVisibleLang(safeSetCode);
    });
  }

  // Actualizar precios
  const btnActualizarPrecios = document.getElementById("btnActualizarPrecios");
  if (btnActualizarPrecios) btnActualizarPrecios.addEventListener("click", refrescarPreciosSetActual);

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

  const btnEliminarDeck = document.getElementById("btnEliminarDeck");
  if (btnEliminarDeck) {
    btnEliminarDeck.addEventListener("click", async () => {
      if (!deckActual) return;
      
      // Verificar si se completó el mazo previamente
      if (deckActual.completado) {
        const eliminarCartas = await mostrarModalConfirmacion({
          titulo: "Eliminar deck",
          mensaje: `¿Deseas eliminar las cartas de este mazo de tu colección?`,
          textoAceptar: "Aceptar",
          textoCancelar: "Cancelar"
        });
        
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
                const setKey = getPreferredSetKey(carta.set, "en");
                await ensureSetCardsLoaded(setKey);
                const listaSet = cartasDeSetKey(setKey);
                const cartaCatalogo = listaSet.find(c => c.numero === carta.numero);
                
                const estadoKey = getEstadoKeyFromCard(cartaCatalogo);
                if (estadoKey) {
                  const adapter = getLegacyPossessionAdapterForState(estadoKey);
                  if (adapter.totals.qty > 0) {
                    const preferredLang = getPreferredLangForEstadoKey(estadoKey, "en");
                    adjustTotalQty(estadoKey, -1, preferredLang);
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
            const confirmarFinal = await mostrarModalConfirmacion({
              titulo: "Confirmar eliminación",
              mensaje: `El mazo y ${cartasEliminadas} cartas van a ser eliminadas de la colección. ¿Está seguro?`,
              textoAceptar: "Aceptar",
              textoCancelar: "Cancelar"
            });
            
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
                  const setKey = getPreferredSetKey(carta.set, "en");
                  await ensureSetCardsLoaded(setKey);
                  const listaSet = cartasDeSetKey(setKey);
                  const cartaCatalogo = listaSet.find(c => c.numero === carta.numero);
                  
                  const estadoKey = getEstadoKeyFromCard(cartaCatalogo);
                  if (estadoKey) {
                    const preferredLang = getPreferredLangForEstadoKey(estadoKey, "en");
                    adjustTotalQty(estadoKey, 1, preferredLang);
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
          const confirmarSoloMazo = await mostrarModalConfirmacion({
            titulo: "Eliminar solo deck",
            mensaje: `Se eliminará el mazo, pero las cartas se quedarán en la colección. ¿Está seguro?`,
            textoAceptar: "Aceptar",
            textoCancelar: "Cancelar"
          });
          
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
        const confirmarEliminarDeck = await mostrarModalConfirmacion({
          titulo: "Eliminar deck",
          mensaje: `¿Eliminar el deck "${deckActual.nombre}"?`,
          textoAceptar: "Aceptar",
          textoCancelar: "Cancelar"
        });

        if (confirmarEliminarDeck) {
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
      const confirmarCompletarMazo = await mostrarModalConfirmacion({
        titulo: "Completar mazo",
        mensaje:
          "El botón 'Completar mazo' añadirá automáticamente 1 unidad en la colección de todas las cartas que actualmente estén marcadas como 'Falta' (LED rojo).\n\n" +
          "Cada carta se agregará en el set específico que aparece en la descripción (código y número de colector).\n\n" +
          "Nota: Las cartas que ya posees (LED azul) o que tienes en otro set (LED violeta) no se verán afectadas.\n\n" +
          "¿Deseas continuar?",
        textoAceptar: "Aceptar",
        textoCancelar: "Cancelar"
      });

      if (confirmarCompletarMazo) {
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
    
    const promptUpdate = async (worker) => {
      // Hay una actualización disponible
      btn.textContent = textoOriginal;
      btn.disabled = false;

      const actualizar = await mostrarModalConfirmacion({
        titulo: "Nueva versión disponible",
        mensaje:
          "✅ ¡Nueva versión disponible!\n\n" +
          "Se recargará la aplicación para aplicar la actualización.\n\n" +
          "¿Actualizar ahora?",
        textoAceptar: "Actualizar",
        textoCancelar: "Cancelar"
      });

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
      await promptUpdate(waiting);
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
        await promptUpdate(waitingAfter);
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

  bootStateHealth = bootLoadPersistentState();
  syncBootRecoverySessionFlag(bootStateHealth);
  updateSetProgressCacheValidity({ triggerRefresh: true, reason: "init" });

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

  // ✅ Supabase (nuevo): sesión + listeners + pull + autosave
    try { 
    await sbInit(); 
  } catch (e) {
    console.error("Supabase init error:", e);
    uiSetSyncStatus("Sync desactivada (error).");
  }

  applyBootStateHealth();

  try {
    // 1) Cargar catálogo desde cache (rápido)
    const tieneCacheLocal = cargarCatalogo();
    
    if (tieneCacheLocal) {
      console.log("Catálogo cargado desde cache, mostrando UI...");
      
      // 2) Metadatos de idiomas y traducciones (MTGJSON) - opcional
      try {
        await cargarSetMetadataDesdeMTGJSON();
        console.log("Metadatos MTGJSON cargados:", Object.keys(setNameEsByCode).length, "traducciones ES y", Object.keys(setLangsByCode).length, "sets con idiomas");
      } catch (err) {
        console.warn("No se pudieron cargar metadatos de MTGJSON:", err);
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
      
      // 2) Metadatos de idiomas y traducciones (MTGJSON) - opcional
      try {
        await cargarSetMetadataDesdeMTGJSON();
        console.log("Metadatos MTGJSON cargados:", Object.keys(setNameEsByCode).length, "traducciones ES y", Object.keys(setLangsByCode).length, "sets con idiomas");
      } catch (err) {
        console.warn("No se pudieron cargar metadatos de MTGJSON:", err);
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
    const swUrl = `./service-worker.js?v=${VERSION}`;

    // Limpiar SWs antiguos (incluido sw.js viejo y service-worker.js sin query)
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const reg of registrations) {
        const script = reg.active?.scriptURL || "";
        if (!script.includes(`service-worker.js?v=${VERSION}`)) {
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



// Botón de retroceso del sistema/móvil → popstate
window.addEventListener("popstate", (event) => {
  navDebugLog("popstate.received", { state: event?.state || null });
  // Prevenir que popstate se procese durante nuestra navegación interna
  if (manejandoPopstate) {
    navDebugLog("popstate.ignored.locked", { state: event?.state || null });
    return;
  }
  
  const lockToken = acquirePopstateLock("popstate-received");

  // Si el state tiene una pantalla conocida y distinta a la activa, ir directamente.
  // Si no, usar navegarAtras() para retroceder por el historial interno.
  const syncedByState = syncNavigationFromHistoryState(event?.state || null);
  if (syncedByState) {
    schedulePopstateRelease(lockToken, 50, "popstate-state-sync-release");
    return;
  }

  const resultado = navegarAtras();

  if (!resultado && !impedirSalidaApp) {
    releasePopstateLock(lockToken, "popstate-no-result");
    return;
  }

  schedulePopstateRelease(lockToken, 50, "popstate-timeout-release");
});

// Entrada inicial en el historial del navegador para que el botón atrás del sistema funcione desde el primer momento
pushHistoryStateSafe({ pantalla: "menu", bootstrap: true });
