// ===============================
// 1) Datos de ejemplo (AHORA con lang: "en" / "es")
// ===============================

// Función para normalizar texto (remover acentos)
function normalizarTexto(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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
  const raw = localStorage.getItem(LS_LOCAL_UPDATED_AT);
  const n = Number(raw);
  sbLocalUpdatedAt = Number.isFinite(n) ? n : 0;
}

function sbTouchLocalUpdatedAt() {
  sbLocalUpdatedAt = Date.now();
  localStorage.setItem(LS_LOCAL_UPDATED_AT, String(sbLocalUpdatedAt));
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
let sbApplyingCloudData = false; // Bandera para prevenir marcar como dirty durante sincronización

function uiSetSyncStatus(msg) {
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = msg || "";
}

function sbUpdateAuthUI() {
  console.log("sbUpdateAuthUI: actualizando UI", { hasUser: !!sbUser, email: sbUser?.email, dirty: sbDirty });
  
  const inputEmail = document.getElementById("inputEmail");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const btnPushNow = document.getElementById("btnPushNow"); // Guardar cambios

  if (sbUser) {
    if (inputEmail) inputEmail.value = sbUser.email || "";
    if (btnLogin) btnLogin.disabled = true;
    if (btnLogout) {
      btnLogout.style.display = "inline-block";
      btnLogout.disabled = false; // Asegurar que está habilitado
      console.log("sbUpdateAuthUI: btnLogout visible y habilitado");
    }
    if (btnPushNow) {
      btnPushNow.disabled = false;
      console.log("sbUpdateAuthUI: btnPushNow habilitado");
    }
    uiSetSyncStatus(`Conectado como ${sbUser.email || "usuario"} ✅`);
  } else {
    if (btnLogin) btnLogin.disabled = false;
    if (btnLogout) {
      btnLogout.style.display = "none";
      console.log("sbUpdateAuthUI: btnLogout oculto");
    }
    if (btnPushNow) {
      btnPushNow.disabled = true;
      console.log("sbUpdateAuthUI: btnPushNow deshabilitado (no hay sesión)");
    }
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
    hiddenCollections: [...(hiddenCollections || new Set())],
    statsSnapshot: statsSnapshot || null,
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

  console.log("sbApplyCloudPayload: aplicando datos desde la nube...");
  
  // Activar bandera para prevenir marcar como dirty
  sbApplyingCloudData = true;
  
  try {
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

    if (Array.isArray(payload.hiddenCollections)) {
      hiddenCollections = new Set(payload.hiddenCollections);
      guardarHiddenCollections();
    }

    // ✅ NUEVO: aplicar snapshot de estadísticas desde nube
    if (payload.statsSnapshot && typeof payload.statsSnapshot === "object") {
      statsSnapshot = payload.statsSnapshot;
      try {
        localStorage.setItem(LS_STATS_SNAPSHOT, JSON.stringify(statsSnapshot));
      } catch {}
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
    console.log("sbPullNow: datos descargados, sbDirty =", sbDirty);

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
  console.log("sbPushNow: iniciando...", { userId: sbUser?.id, isDirty: sbDirty });
  
  if (!sbUser?.id) { 
    console.warn("sbPushNow: no hay usuario logueado");
    uiSetSyncStatus("Inicia sesión primero."); 
    return; 
  }
  
  if (!sbDirty) { 
    console.log("sbPushNow: no hay cambios pendientes");
    uiSetSyncStatus("No hay cambios que guardar."); 
    return; 
  }

  // Anti-pisado
  let cloudUpdatedAt = null;
  try { cloudUpdatedAt = await sbGetCloudMeta(); } catch (err) {
    console.warn("sbPushNow: error obteniendo meta de la nube", err);
  }

  if (sbKnownCloudUpdatedAt && cloudUpdatedAt && cloudUpdatedAt > sbKnownCloudUpdatedAt) {
    uiSetSyncStatus("⚠️ La nube tiene cambios de otro dispositivo. Pulsa “Actualizar” antes de guardar.");
    return;
  }

  uiSetSyncStatus("Subiendo a la nube…");
  console.log("sbPushNow: subiendo datos...");

  const payload = sbBuildCloudPayload();
  const { error } = await supabaseClient
    .from(SB_TABLE)
    .upsert({ user_id: sbUser.id, data: payload }, { onConflict: "user_id" });

  if (error) {
    console.error("sbPushNow: error al subir", error);
    uiSetSyncStatus("Error subiendo (mira consola).");
    return;
  }

  sbDirty = false;
  console.log("sbPushNow: datos guardados exitosamente");

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
  console.log("sbLogout: cerrando sesión...");
  
  // Deshabilitar botones temporalmente
  const btnLogout = document.getElementById("btnLogout");
  const btnPushNow = document.getElementById("btnPushNow");
  const wasDisabled = btnLogout?.disabled;
  
  try {
    if (btnLogout) {
      btnLogout.disabled = true;
      console.log("sbLogout: botón deshabilitado");
    }
    if (btnPushNow) btnPushNow.disabled = true;
    
    uiSetSyncStatus("Cerrando sesión...");
    console.log("sbLogout: llamando a signOut()...");
    
    // Timeout de 15 segundos para signOut (aumentado para evitar falsos positivos)
    const signOutPromise = supabaseClient.auth.signOut();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout al cerrar sesión")), 15000)
    );
    
    await Promise.race([signOutPromise, timeoutPromise]);
    
    console.log("sbLogout: signOut() completado");
    
    // Limpiar estado local
    sbUser = null;
    sbDirty = false;
    sbKnownCloudUpdatedAt = null;
    sbStopAutoSave();
    
    console.log("sbLogout: estado limpio");
    
    // Actualizar UI inmediatamente
    sbUpdateAuthUI();
    uiSetSyncStatus("Sesión cerrada correctamente");
    
    console.log("sbLogout: completado exitosamente");
    
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
  console.log("sbEnsureButtonsWired: verificando botones...");
  
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const btnPushNow = document.getElementById("btnPushNow");
  const inputEmail = document.getElementById("inputEmail");

  if (!btnLogin) console.warn("sbEnsureButtonsWired: btnLogin no encontrado");
  if (!btnLogout) console.warn("sbEnsureButtonsWired: btnLogout no encontrado");
  if (!btnPushNow) console.warn("sbEnsureButtonsWired: btnPushNow no encontrado");
  if (!inputEmail) console.warn("sbEnsureButtonsWired: inputEmail no encontrado");

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
    console.log("=== CLICK EN BOTÓN SALIR ===");
    try {
      await sbLogout();
    } catch (err) {
      console.error("Error en btnLogout:", err);
      uiSetSyncStatus("Error al cerrar sesión");
    }
    console.log("=== FIN CLICK EN BOTÓN SALIR ===");
  });
  
  onClickOnce(btnPushNow, async () => {
    try {
      await sbPushNow();
    } catch (err) {
      console.error("Error en btnPushNow:", err);
      uiSetSyncStatus("Error al guardar");
    }
  });
  
  console.log("sbEnsureButtonsWired: verificación completa");
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
    localStorage.setItem('mtg-auth-event', Date.now().toString());
    
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
    console.warn("onClickOnce: elemento no encontrado");
    return;
  }
  if (el.dataset.wired === "1") {
    console.log("onClickOnce: elemento ya conectado, OMITIENDO", el.id || el);
    return;
  }
  el.dataset.wired = "1";
  
  // Wrapper que registra el click y previene doble-click
  let processing = false;
  const wrappedHandler = async (event) => {
    console.log(`[CLICK] Botón ${el.id || 'sin-id'} clickeado`, { 
      disabled: el.disabled, 
      visible: el.style.display !== 'none',
      processing: processing
    });
    
    if (el.disabled) {
      console.warn(`[CLICK] Botón ${el.id} está deshabilitado, ignorando`);
      return;
    }
    
    if (processing) {
      console.warn(`[CLICK] Botón ${el.id} ya está procesando, ignorando click duplicado`);
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
  console.log("onClickOnce: listener añadido a", el.id || el);
}

function sbMarkDirty() {
  // No marcar como dirty si estamos aplicando datos desde la nube
  if (sbApplyingCloudData) {
    console.log("sbMarkDirty: ignorado (aplicando datos de la nube)");
    return;
  }
  
  sbDirty = true;
  sbTouchLocalUpdatedAt();
  console.log("sbMarkDirty: marcado como dirty");
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
        const { data } = await supabaseClient.auth.getSession();
        sbUser = data?.session?.user || null;
        sbUpdateAuthUI();

        if (sbUser) await sbPullNow();
      }
    });

    // Escuchar mensajes de otras pestañas vía BroadcastChannel
    if (authChannel) {
      authChannel.onmessage = async (e) => {
        if (e.data?.type === 'AUTH_COMPLETE') {
          const { data } = await supabaseClient.auth.getSession();
          sbUser = data?.session?.user || null;
          sbUpdateAuthUI();
          if (sbUser) await sbPullNow();
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

// ===============================
// Estadísticas - Snapshot persistente
// ===============================

const LS_STATS_SNAPSHOT = "mtg_stats_snapshot_v1";
let statsSnapshot = null;

// Si estás aplicando payload de la nube, evita marcar dirty por cosas derivadas
let sbApplyingCloud = false;

function cargarStatsSnapshot() {
  const raw = localStorage.getItem(LS_STATS_SNAPSHOT);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") statsSnapshot = obj;
  } catch {}
}

function guardarStatsSnapshot(snap, { markDirty = true } = {}) {
  statsSnapshot = snap || null;
  localStorage.setItem(LS_STATS_SNAPSHOT, JSON.stringify(statsSnapshot || {}));

  // Queremos que se sincronice con Supabase, pero NO cuando viene de un pull
  if (markDirty && !sbApplyingCloud) sbMarkDirty();
}

function calcularStatsDesdeEstado() {
  // Estadísticas SOLO desde `estado` (idempotente => nunca duplica)
  let distinct = 0;     // cartas distintas con qty > 0
  let totalQty = 0;     // suma de qty
  let foilQty = 0;      // suma de foilQty
  let playedQty = 0;    // suma de playedQty
  let riCount = 0;      // nº de cartas con wantMore

  for (const id of Object.keys(estado || {})) {
    const st = getEstadoCarta(id); // normaliza
    const q = Number(st.qty || 0);
    if (q > 0) distinct++;
    totalQty += q;

    foilQty += Number(st.foilQty || 0);
    playedQty += Number(st.playedQty || 0);
    if (st.wantMore) riCount++;
  }

  // Stats por sets (usando progreso guardado; no requiere cargar sets)
  const entries = Object.entries(progresoPorSet || {});
  const totalColecciones = entries.length;

  const conAlguna = entries.filter(([,v]) => (v?.tengo || 0) > 0).length;
  const completas = entries.filter(([,v]) => {
    const t = Number(v?.total);
    const h = Number(v?.tengo || 0);
    return Number.isFinite(t) && t > 0 && h === t;
  }).length;

  // % global aproximado (solo colecciones con total conocido)
  let sumTengo = 0;
  let sumTotal = 0;
  for (const [, v] of entries) {
    const t = Number(v?.total);
    const h = Number(v?.tengo || 0);
    if (Number.isFinite(t) && t > 0) {
      sumTotal += t;
      sumTengo += Math.min(h, t);
    }
  }
  const pctGlobal = sumTotal > 0 ? Math.round((sumTengo / sumTotal) * 100) : null;

  return {
    version: 1,
    updatedAt: Date.now(),
    resumen: { distinct, totalQty, foilQty, playedQty, riCount },
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

  elResumen.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="k">Total de cartas en colección</div><div class="v">${r.distinct}</div></div>
      <div class="stat"><div class="k">Total de cartas unitarias</div><div class="v">${r.totalQty}</div></div>
      <div class="stat"><div class="k">Foil</div><div class="v">${r.foilQty}</div></div>
      <div class="stat"><div class="k">Ri</div><div class="v">${r.riCount}</div></div>
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

  const total = lista.length;
  const tengo = lista.filter(c => getEstadoCarta(c.id).qty > 0).length;

  progresoPorSet[setKey] = { total, tengo, updatedAt: Date.now() };
  guardarProgresoPorSet();
}

function actualizarProgresoSetActualSiSePuede() {
  if (!setActualKey) return;
  if (!cacheCartasPorSetLang[setActualKey]) return; // si no está cargado, no podemos contar
  actualizarProgresoGuardado(setActualKey);          // esto ya guarda en localStorage
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
let catalogoLastUpdate = null;    // timestamp de última actualización

// Guardar catálogo en localStorage
function guardarCatalogo() {
  try {
    localStorage.setItem(LS_CATALOGO_SETS, JSON.stringify(catalogoSets));
    const timestamp = Date.now();
    localStorage.setItem(LS_CATALOGO_TIMESTAMP, timestamp.toString());
    catalogoLastUpdate = timestamp;
    console.log("Catálogo guardado en cache:", catalogoSets.length, "sets");
  } catch (err) {
    console.warn("Error guardando catálogo en localStorage:", err);
  }
}

// Cargar catálogo desde localStorage
function cargarCatalogo() {
  try {
    const rawSets = localStorage.getItem(LS_CATALOGO_SETS);
    const rawTimestamp = localStorage.getItem(LS_CATALOGO_TIMESTAMP);
    
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
  // Verificar si necesita recarga (si no tiene type_line es estructura antigua)
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

  const cards = await scryGetCardsBySetAndLang(code, lang);

  cacheCartasPorSetLang[setKey] = cards.map(card => ({
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
// Ocultar colecciones (persistente)
// ===============================

const LS_HIDDEN_COLLECTIONS = "mtg_hidden_collections_v1";
let hiddenCollections = new Set();

function cargarHiddenCollections() {
  const raw = localStorage.getItem(LS_HIDDEN_COLLECTIONS);
  if (!raw) return;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) hiddenCollections = new Set(arr);
  } catch {}
}

function guardarHiddenCollections() {
  localStorage.setItem(LS_HIDDEN_COLLECTIONS, JSON.stringify([...hiddenCollections]));
  if (typeof sbMarkDirty === "function") sbMarkDirty();
}

// ===============================
// Modal carta + precio
// ===============================

function abrirModalCarta({ titulo, imageUrl, numero, rareza, precio, navLista = null, navIndex = -1, cardData = null }) {
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
        <img id="imgCartaModal" src="${imagenCara1}" alt="${titulo || "Carta"}" loading="lazy" 
             data-cara1="${imagenCara1}" data-cara2="${imagenCara2}" data-cara-actual="1" />
        <button id="btnVoltearCarta" class="btn-voltear-carta" type="button" title="Voltear carta">
          🔄
        </button>
      </div>
    ` : (imageUrl ? `<img src="${imageUrl}" alt="${titulo || "Carta"}" loading="lazy" />`
              : `<div class="card"><p>No hay imagen disponible.</p></div>`)}
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
  
  if (btnVoltear && imgCarta) {
    btnVoltear.addEventListener('click', () => {
      const caraActual = parseInt(imgCarta.dataset.caraActual);
      const nuevaCara = caraActual === 1 ? 2 : 1;
      const nuevaImagen = nuevaCara === 1 ? imgCarta.dataset.cara1 : imgCarta.dataset.cara2;
      
      imgCarta.style.opacity = '0';
      setTimeout(() => {
        imgCarta.src = nuevaImagen;
        imgCarta.dataset.caraActual = nuevaCara;
        imgCarta.style.opacity = '1';
      }, 150);
    });
  }

  modal.classList.remove("hidden");
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
  decks: document.getElementById("pantallaDecks"),
  verDeck: document.getElementById("pantallaVerDeck"),
  estadisticas: document.getElementById("pantallaEstadisticas"),
  cuenta: document.getElementById("pantallaCuenta")
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
  filtroTextoColecciones = normalizarTexto((texto || "").trim());
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
    cont.innerHTML = `<div class="card"><p>Error cargando colecciones: ${catalogoError}</p></div>`;
    return;
  }

  let sets = obtenerColecciones();

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

    const fechaTxt = formatMesAnyo(s.released_at);

    // ✅ Icono (si existe)
    const iconHtml = s.icon_svg_uri
  ? `<img class="set-icon" src="${s.icon_svg_uri}" alt="${s.nombre}" loading="lazy" />`
  : `<div class="set-icon" style="background: rgba(0,0,0,.15); border-radius: 50%;"></div>`;

    html += `
  <div class="coleccion-item" data-code="${s.code}" data-progress="${progresoPromedio}">
    ${fechaTxt ? `<span class="set-date">${fechaTxt}</span>` : ""}
    <div class="coleccion-titulo">
      ${iconHtml}
      <div class="coleccion-nombre">${s.nombre}</div>
    </div>
    <div class="badge"><span class="pct-lang">${pctEn}</span> EN ${pEn.tengo}/${totalEnTxt} · ES ${pEs.tengo}/${totalEsTxt} <span class="pct-lang">${pctEs}</span></div>
  </div>
`;
  }

  cont.innerHTML = html;

  cont.querySelectorAll("[data-code]").forEach(item => {
    // Aplicar altura de progreso visual
    const progress = item.dataset.progress || 0;
    item.style.setProperty('--progress-height', `${progress}%`);
    
    item.addEventListener("click", () => {
      const code = item.dataset.code;
      abrirSet(`${code}__en`);
    });
  });
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
  try { localStorage.setItem(LS_STATS_SNAPSHOT, JSON.stringify(statsSnapshot)); } catch {}

  // opcional: si quieres que esto suba a Supabase en el próximo autosave
  if (markDirty && typeof sbMarkDirty === "function") sbMarkDirty();
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
let ultimaListaSetRender = [];

const modalNavState = {
  lista: null,
  idx: -1,
};

function aplicarUIFiltrosSet() {
  const inp = document.getElementById("inputBuscarEnSet");
  if (inp) inp.value = filtroTextoSet || "";

  const chk = document.getElementById("chkSoloFaltanSet");
  if (chk) chk.checked = !!filtroSoloFaltanSet;
}

function setFiltroTextoSet(texto) {
  filtroTextoSet = normalizarTexto((texto || "").trim());
  if (setActualKey) renderTablaSet(setActualKey);
}

function setFiltroSoloFaltanSet(val) {
  filtroSoloFaltanSet = !!val;
  if (setActualKey) renderTablaSet(setActualKey);
}

function getListaSetFiltrada(setKey) {
  let lista = cartasDeSetKey(setKey)
    .sort((a, b) => compareCollectorNumbers(a.numero, b.numero));

  const ft = String(filtroTextoSet || "").trim();
if (ft) {
  lista = lista.filter(c => normalizarTexto(c.nombre).includes(ft));
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

  // Actualizar checkbox de ocultar colección
  const chkOcultarColeccion = document.getElementById("chkOcultarColeccion");
  if (chkOcultarColeccion) {
    chkOcultarColeccion.checked = hiddenCollections.has(code);
  }

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

  let html = `<div class="cartas-grid">`;

  lista.forEach((c, idx) => {
    const st = getEstadoCarta(c.id);
    const tieneImg = c._img && c._img.trim() !== "";

    html += `
  <div class="carta-item ${st.qty > 0 ? 'has-qty' : ''}">
    <!-- Header de la carta -->
    <div class="carta-header">
      <img src="icons/${st.qty > 0 ? 'Ledazul' : 'Ledrojo'}.png" class="led-indicator" alt="" width="24" height="24">
      <button
        class="btn-link-carta"
        type="button"
        data-accion="ver-carta-set"
        data-id="${c.id}"
        data-idx="${idx}"
      >
        ${c.nombre}
      </button>
      <span class="carta-numero">#${c.numero}</span>
    </div>

    <!-- Imagen de la carta -->
    <div class="carta-imagen-container">
      ${tieneImg 
        ? `<img src="${c._img}" alt="${c.nombre}" class="carta-imagen" loading="lazy" />`
        : `<div class="carta-imagen-placeholder">Sin imagen</div>`
      }
    </div>

    <!-- Controles de cantidad -->
    <div class="carta-controles">
      <!-- Cantidad -->
      <div class="control-fila">
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

      <!-- Foil -->
      <div class="control-fila">
        <span class="lbl">Foil</span>
        <div class="stepper">
          <button class="btn-step btn-foil-minus" data-id="${c.id}" ${st.foilQty <= 0 || st.qty === 0 ? "disabled" : ""}>−</button>
          <input
            type="number"
            class="inp-num inp-foil"
            data-id="${c.id}"
            min="0"
            max="${st.qty}"
            value="${st.foilQty}"
            ${st.qty === 0 ? "disabled" : ""}
          />
          <button class="btn-step btn-foil-plus" data-id="${c.id}" ${st.qty === 0 || st.foilQty >= st.qty ? "disabled" : ""}>+</button>
        </div>
      </div>

      <!-- Ri -->
      <div class="control-fila control-ri">
        <span class="lbl">Ri</span>
        <label class="chkline">
          <input type="checkbox" class="chk-want" data-id="${c.id}" ${st.wantMore ? "checked" : ""}>
        </label>
      </div>
    </div>
  </div>
`;
  });

  html += `</div>`;

  const cont = document.getElementById("listaCartasSet");
cont.innerHTML = html;

// Preservar el estado del checkbox "Ver cartas"
const chkVerCartasMovil = document.getElementById("chkVerCartasMovil");
const gridCartas = cont.querySelector(".cartas-grid");
if (chkVerCartasMovil && gridCartas) {
  if (!chkVerCartasMovil.checked) {
    gridCartas.classList.add("ocultar-imagenes");
  }
}

// Modal al clickar nombre
cont.querySelectorAll("[data-accion='ver-carta-set']").forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.id;
    const carta = (cacheCartasPorSetLang[setKey] || []).find(x => x.id === id);

    abrirModalCarta({
      titulo: carta?.nombre || "Carta",
      imageUrl: carta?._img || null,
      numero: carta?.numero || "",
      rareza: carta?.rareza || "",
      precio: formatPrecioEUR(carta?._prices),
      cardData: carta?._raw || null,
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

// ✅ foil qty
cont.querySelectorAll(".btn-foil-minus").forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.id;
    const st = getEstadoCarta(id);
    setFoilQty(id, (st.foilQty || 0) - 1);
    renderTablaSet(setActualKey);
    renderColecciones();
  });
});

cont.querySelectorAll(".btn-foil-plus").forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.id;
    const st = getEstadoCarta(id);
    setFoilQty(id, (st.foilQty || 0) + 1);
    renderTablaSet(setActualKey);
    renderColecciones();
  });
});

cont.querySelectorAll(".inp-foil").forEach(inp => {
  inp.addEventListener("change", () => {
    const id = inp.dataset.id;
    setFoilQty(id, inp.value);
    renderTablaSet(setActualKey);
    renderColecciones();
  });
});

// Ri
cont.querySelectorAll(".chk-want").forEach(chk => {
  chk.addEventListener("change", () => {
    const id = chk.dataset.id;
    setWantMore(id, chk.checked);
    renderTablaSet(setActualKey);
  });
});

}


// ===============================
// 5b) Autocompletar colección
// ===============================

function marcarTodasCartasSet() {
  if (!setActualKey) return;
  
  const cartas = cartasDeSetKey(setActualKey);
  cartas.forEach(c => {
    const st = getEstadoCarta(c.id);
    if (st.qty === 0) {
      setQty(c.id, 1);
    }
  });
  
  renderTablaSet(setActualKey);
  renderColecciones();
}

function desmarcarTodasCartasSet() {
  if (!setActualKey) return;
  
  const cartas = cartasDeSetKey(setActualKey);
  cartas.forEach(c => {
    setQty(c.id, 0);
  });
  
  renderTablaSet(setActualKey);
  renderColecciones();
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
      const st = getEstadoCarta(carta.id);
      setQty(carta.id, st.qty + 1);
    }
  });
  
  renderTablaSet(setActualKey);
  renderColecciones();
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

async function renderResultadosBuscar(texto) {
  const cont = document.getElementById("resultadosBuscar");
  const q = (texto || "").trim();

  if (!cont) return;

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
    const grupoId = `grupo-${g.oracleId}`;
    const numVersiones = g.versiones.length;
    const isExpanded = expandedGroups.has(grupoId);
    
    html += `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
          <h3 style="margin: 0; flex: 1;">
            <button class="btn-link-carta" type="button" data-accion="ver-carta" data-oracle="${g.oracleId}">
              ${g.titulo}
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
      const qty = v.st.qty || 0;
      const foilQty = v.st.foilQty || 0;

      html += `
        <li class="item-version">
          <div class="item-version-main">
            <div class="version-info">
              <img src="icons/${qty > 0 ? 'Ledazul' : 'Ledrojo'}.png" class="led-indicator" alt="" width="36" height="36">
              <button class="btn-link-carta" type="button" data-accion="ver-print" data-id="${v.id}">
                <strong>${v.set_name}</strong>
                <span class="lang-pill">${formatLang(v.lang)}</span>
                <span class="hint"> (#${v.collector_number}, ${v.rareza})</span>
              </button>
            </div>

            <div class="version-controls">
              <!-- Cantidad -->
              <div class="control-fila-buscar">
                <span class="lbl-buscar">Cantidad</span>
                <div class="stepper stepper-buscar">
                  <button class="btn-step btn-qty-minus-buscar" data-id="${v.id}" ${qty <= 0 ? "disabled" : ""}>−</button>
                  <input
                    type="number"
                    class="inp-num inp-qty-buscar"
                    data-id="${v.id}"
                    min="0"
                    max="999"
                    value="${qty}"
                  />
                  <button class="btn-step btn-qty-plus-buscar" data-id="${v.id}">+</button>
                </div>
              </div>

              <!-- Foil -->
              <div class="control-fila-buscar">
                <span class="lbl-buscar">Foil</span>
                <div class="stepper stepper-buscar">
                  <button class="btn-step btn-foil-minus-buscar" data-id="${v.id}" ${foilQty <= 0 || qty === 0 ? "disabled" : ""}>−</button>
                  <input
                    type="number"
                    class="inp-num inp-foil-buscar"
                    data-id="${v.id}"
                    min="0"
                    max="${qty}"
                    value="${foilQty}"
                    ${qty === 0 ? "disabled" : ""}
                  />
                  <button class="btn-step btn-foil-plus-buscar" data-id="${v.id}" ${qty === 0 || foilQty >= qty ? "disabled" : ""}>+</button>
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

  cont.innerHTML = html;
  
  // Event listeners para botones de expandir/colapsar
  cont.querySelectorAll(".btn-toggle-versiones").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const container = document.getElementById(targetId);
      
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
    });
  });

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

  // Título del grupo -> modal con imagen “general” del oracle
  const mapaOracleAImg = new Map();
  for (const g of grupos) mapaOracleAImg.set(g.oracleId, { titulo: g.titulo, img: g.img });

  cont.querySelectorAll("[data-accion='ver-carta']").forEach(btn => {
    btn.addEventListener("click", () => {
      const data = mapaOracleAImg.get(btn.dataset.oracle);
      if (!data) return;
      abrirModalCarta({ titulo: data.titulo, imageUrl: data.img });
    });
  });

  // Controles de cantidad en búsqueda
  cont.querySelectorAll(".btn-qty-minus-buscar").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setQty(id, st.qty - 1);
      renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
      renderColecciones();
    });
  });

  cont.querySelectorAll(".btn-qty-plus-buscar").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setQty(id, st.qty + 1);
      renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
      renderColecciones();
    });
  });

  cont.querySelectorAll(".inp-qty-buscar").forEach(inp => {
    inp.addEventListener("change", () => {
      const id = inp.dataset.id;
      setQty(id, inp.value);
      renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
      renderColecciones();
    });
  });

  // Controles de foil en búsqueda
  cont.querySelectorAll(".btn-foil-minus-buscar").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setFoilQty(id, (st.foilQty || 0) - 1);
      renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
      renderColecciones();
    });
  });

  cont.querySelectorAll(".btn-foil-plus-buscar").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setFoilQty(id, (st.foilQty || 0) + 1);
      renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
      renderColecciones();
    });
  });

  cont.querySelectorAll(".inp-foil-buscar").forEach(inp => {
    inp.addEventListener("change", () => {
      const id = inp.dataset.id;
      setFoilQty(id, inp.value);
      renderResultadosBuscar(document.getElementById("inputBuscar")?.value || "");
      renderColecciones();
    });
  });

  // Ir al set desde la búsqueda
  cont.querySelectorAll(".btn-ir-set").forEach(btn => {
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
// DECKS: Gestión de mazos
// ===============================

const LS_DECKS_KEY = "mtg_decks_v1";
let decks = [];
let deckActual = null;
let modoDeckVisualizacion = 'lista'; // 'lista' o 'imagenes'

function cargarDecks() {
  const raw = localStorage.getItem(LS_DECKS_KEY);
  if (!raw) return;
  try {
    decks = JSON.parse(raw);
  } catch (e) {
    console.error("Error cargando decks:", e);
  }
}

function guardarDecks() {
  localStorage.setItem(LS_DECKS_KEY, JSON.stringify(decks));
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
    if (existeExacta && getEstadoCarta(existeExacta.id).qty >= carta.cantidad) {
      cartasVerificadas.push({
        ...carta,
        ...infoAdicional,
        tengo: true,
        ledType: 'azul'
      });
      continue;
    }
    
    // Buscar si tengo la carta en cualquier otra edición
    let tieneEnOtraEdicion = false;
    const oracleId = existeExacta?.oracle_id;
    
    if (oracleId) {
      // Buscar por oracle_id en todos los sets cargados (muy rápido)
      for (const [setKeyCargado, cartasCargadas] of Object.entries(cacheCartasPorSetLang)) {
        for (const c of cartasCargadas) {
          if (c.oracle_id === oracleId) {
            const st = getEstadoCarta(c.id);
            if (st.qty > 0) {
              tieneEnOtraEdicion = true;
              break;
            }
          }
        }
        if (tieneEnOtraEdicion) break;
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
              const st = getEstadoCarta(c.id);
              if (st.qty > 0) {
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
              const st = getEstadoCarta(version.id);
              if (st.qty > 0) {
                encontradaEnCache = true;
                break;
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
  const st = cartaCatalogo ? getEstadoCarta(cartaCatalogo.id) : { qty: 0, foilQty: 0 };
  const cantidadMostrar = st.qty;
  
  const cartaId = cartaCatalogo?.id || `${carta.set}-${carta.numero}`;
  
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
            <button class="btn-step btn-qty-minus-deck" data-id="${cartaId}" ${cantidadMostrar <= 0 ? "disabled" : ""}>−</button>
            <input
              type="number"
              class="inp-num inp-qty-deck"
              data-id="${cartaId}"
              min="0"
              max="999"
              value="${cantidadMostrar}"
            />
            <button class="btn-step btn-qty-plus-deck" data-id="${cartaId}">+</button>
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
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setQty(id, st.qty - 1);
      renderDeckCartas();
      renderColecciones();
    });
  });

  cont.querySelectorAll(".btn-qty-plus-deck").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const st = getEstadoCarta(id);
      setQty(id, st.qty + 1);
      renderDeckCartas();
      renderColecciones();
    });
  });

  cont.querySelectorAll(".inp-qty-deck").forEach(inp => {
    inp.addEventListener("change", () => {
      const id = inp.dataset.id;
      setQty(id, inp.value);
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
  
  if (carta) {
    const st = getEstadoCarta(carta.id);
    if (st.qty === 0) {
      setQty(carta.id, 1);
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

// Entrar
  const btnEntrar = document.getElementById("btnEntrar");
  if (btnEntrar) btnEntrar.addEventListener("click", () => mostrarPantalla("menu"));

  // Stats: recalcular
  const btnStatsRecalcular = document.getElementById("btnStatsRecalcular");
if (btnStatsRecalcular) {
  btnStatsRecalcular.addEventListener("click", () => {
    if (typeof renderEstadisticas === "function") renderEstadisticas({ forceRecalc: true });
  });
}

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

      if (destino === "decks") {
        renderListaDecks();
        mostrarPantalla("decks");
        return;
      }

      if (destino === "estadisticas") {
  renderEstadisticas({ forceRecalc: false }); // pinta rápido con lo guardado
  mostrarPantalla("estadisticas");
  return;
}

      if (destino === "cuenta") {
        mostrarPantalla("cuenta");
        // Actualizar fecha del catálogo
        actualizarFechaCatalogo();
        return;
      }
    });
  });

  // Volver al menú
  document.querySelectorAll("[data-action='volverMenu']").forEach(btn => {
    btn.addEventListener("click", () => mostrarPantalla("menu"));
  });

  // Volver a decks
  document.querySelectorAll("[data-action='volverDecks']").forEach(btn => {
    btn.addEventListener("click", () => {
      renderListaDecks();
      mostrarPantalla("decks");
    });
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

  // Checkbox para ver/ocultar imágenes de cartas (móvil)
  const chkVerCartasMovil = document.getElementById("chkVerCartasMovil");
  if (chkVerCartasMovil) {
    chkVerCartasMovil.addEventListener("change", () => {
      const gridCartas = document.querySelector(".cartas-grid");
      if (gridCartas) {
        if (chkVerCartasMovil.checked) {
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
                
                if (cartaCatalogo) {
                  const st = getEstadoCarta(cartaCatalogo.id);
                  if (st.qty > 0) {
                    setQty(cartaCatalogo.id, st.qty - 1);
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
                  
                  if (cartaCatalogo) {
                    const st = getEstadoCarta(cartaCatalogo.id);
                    setQty(cartaCatalogo.id, st.qty + 1);
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
  const fechaEl = document.getElementById("fechaCatalogo");
  if (fechaEl) {
    fechaEl.textContent = `Última actualización: ${getFechaUltimaActualizacion()}`;
  }
}

async function init() {
  catalogoListo = false;
  catalogoError = "";

  // Enforce light theme
  applyTheme();
  cargarEstado();
  cargarProgresoPorSet();
  cargarFiltrosColecciones();
  cargarHiddenEmptySets();
  cargarHiddenCollections();
  cargarStatsSnapshot();
  cargarDecks();

  wireGlobalButtons();
  wireBackupButtons();

  try {
  const raw = localStorage.getItem(LS_STATS_SNAPSHOT);
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
  }

  renderResultadosBuscar("");
}

init();


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then(reg => {
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
  
  banner.classList.remove("hidden");
  
  btnActualizar.addEventListener("click", () => {
    // Enviar mensaje al service worker para que se active inmediatamente
    newWorker.postMessage({ type: "SKIP_WAITING" });
    
    // Recargar la página cuando el nuevo SW tome control
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, { once: true });
  
  btnCerrar.addEventListener("click", () => {
    banner.classList.add("hidden");
  }, { once: true });
}

// ===============================
// Botones flotantes scroll to top
// ===============================

function setupScrollToTopButton(buttonId, containerId) {
  const button = document.getElementById(buttonId);
  const container = document.getElementById(containerId);
  
  if (!button || !container) return;
  
  // Mostrar/ocultar botón según el scroll
  const handleScroll = () => {
    if (window.scrollY > 300) {
      button.classList.add("visible");
    } else {
      button.classList.remove("visible");
    }
  };
  
  // Scroll suave al inicio
  button.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
  
  // Escuchar scroll
  window.addEventListener("scroll", handleScroll);
  
  // Verificar posición inicial
  handleScroll();
}

// Inicializar botones
setupScrollToTopButton("btnScrollTopColecciones", "pantallaColecciones");
setupScrollToTopButton("btnScrollTopSet", "pantallaSet");
setupScrollToTopButton("btnScrollTopDeck", "pantallaVerDeck");
