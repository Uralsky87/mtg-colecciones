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

function obtenerColecciones() {
  // colección única por (coleccion + lang)
  const map = new Map();
  cartas.forEach(c => {
    const lang = getLangFromCard(c);
    const key = `${c.coleccion}__${lang}`;
    if (!map.has(key)) map.set(key, { nombre: c.coleccion, lang, key });
  });

  // orden: por nombre, luego lang
  return [...map.values()].sort((a, b) => {
    const n = a.nombre.localeCompare(b.nombre);
    if (n !== 0) return n;
    return a.lang.localeCompare(b.lang);
  });
}

function cartasDeSetKey(key) {
  return cartas.filter(c => setKeyFromCard(c) === key);
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

function setFiltroTextoColecciones(texto) {
  filtroTextoColecciones = (texto || "").trim().toLowerCase();
  renderColecciones();
}

function progresoDeColeccion(setKey) {
  const cartasDelSet = cartasDeSetKey(setKey);
  const total = cartasDelSet.length;
  const tengo = cartasDelSet.filter(c => getEstadoCarta(c.id).qty > 0).length;
  return { tengo, total };
}

function setFiltroColecciones(lang) {
  filtroIdiomaColecciones = lang;
  document.querySelectorAll(".btn-filtro").forEach(b => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
  renderColecciones();
}

function renderColecciones() {
  const cont = document.getElementById("listaColecciones");

  let sets = obtenerColecciones();

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
        <div class="badge">${tengo} / ${total} cartas</div>
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

// ===============================
// 5) Set: lista de cartas + qty/foil/played/busco
// ===============================

let setActualKey = null;

function abrirSet(setKey) {
  setActualKey = setKey;

  const info = obtenerColecciones().find(s => s.key === setKey) || { nombre: "Set", lang: "en" };
  document.getElementById("tituloSet").textContent = `${info.nombre} (${formatLang(info.lang)})`;

  const { tengo, total } = progresoDeColeccion(setKey);
  document.getElementById("progresoSet").textContent = `Progreso: ${tengo} / ${total}`;

  const lista = cartasDeSetKey(setKey).sort((a, b) => a.numero - b.numero);

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
                Busco
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
      const id = Number(btn.dataset.id);
      const st = getEstadoCarta(id);
      setQty(id, st.qty - 1);
      abrirSet(setActualKey);
      renderColecciones();
    });
  });

  cont.querySelectorAll(".btn-qty-plus").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const st = getEstadoCarta(id);
      setQty(id, st.qty + 1);
      abrirSet(setActualKey);
      renderColecciones();
    });
  });

  cont.querySelectorAll(".inp-qty").forEach(inp => {
    inp.addEventListener("change", () => {
      const id = Number(inp.dataset.id);
      setQty(id, inp.value);
      abrirSet(setActualKey);
      renderColecciones();
    });
  });

  // played
  cont.querySelectorAll(".btn-played-minus").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const st = getEstadoCarta(id);
      setPlayedQty(id, st.playedQty - 1);
      abrirSet(setActualKey);
    });
  });

  cont.querySelectorAll(".btn-played-plus").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const st = getEstadoCarta(id);
      setPlayedQty(id, st.playedQty + 1);
      abrirSet(setActualKey);
    });
  });

  cont.querySelectorAll(".inp-played").forEach(inp => {
    inp.addEventListener("change", () => {
      const id = Number(inp.dataset.id);
      setPlayedQty(id, inp.value);
      abrirSet(setActualKey);
    });
  });

  // foil / busco
  cont.querySelectorAll(".chk-foil").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.id);
      setFoil(id, chk.checked);
      abrirSet(setActualKey);
    });
  });

  cont.querySelectorAll(".chk-want").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.id);
      setWantMore(id, chk.checked);
      abrirSet(setActualKey);
    });
  });

  mostrarPantalla("set");
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

function renderResultadosBuscar(texto) {
  const cont = document.getElementById("resultadosBuscar");
  const grupos = buscarCartasPorNombre(texto);

  if (!texto.trim()) {
    cont.innerHTML = `<div class="card"><p>Escribe un nombre y pulsa “Buscar”.</p></div>`;
    return;
  }

  if (grupos.length === 0) {
    cont.innerHTML = `<div class="card"><p>No se encontraron cartas para: <strong>${texto}</strong></p></div>`;
    return;
  }

  let html = "";
  grupos.forEach(g => {
    html += `<div class="card">
      <h3 style="margin-top:0;">${g.nombre}</h3>
      <div class="hint">Aparece en:</div>
      <ul>
    `;

    g.versiones.forEach(v => {
      const st = getEstadoCarta(v.id);
      const key = setKeyFromCard(v);

      const qtyTxt = st.qty > 0 ? `✅ x${st.qty}` : `❌ x0`;
      const foilTxt = st.foil ? " · ✨ Foil" : "";
      const playedTxt = st.playedQty > 0 ? ` · 🎴 Played:${st.playedQty}` : "";
      const wantTxt = st.wantMore ? " · 🔎 Busco" : "";

      html += `
        <li class="resultado-version">
          <span>
            <strong>${v.coleccion}</strong>
            <span class="lang-pill">${formatLang(getLangFromCard(v))}</span>
            (#${v.numero}, ${v.rareza}) — ${qtyTxt}${foilTxt}${playedTxt}${wantTxt}
          </span>
          <button class="btn-secundario btn-ir-set" data-setkey="${key}">Ir</button>
        </li>
      `;
    });

    html += `</ul></div>`;
  });

  cont.innerHTML = html;

  cont.querySelectorAll(".btn-ir-set").forEach(btn => {
    btn.addEventListener("click", () => {
      abrirSet(btn.dataset.setkey);
    });
  });
}

// ===============================
// 7) Inicialización (botones + pantallas)
// ===============================

function wireGlobalButtons() {
  // Entrar
  document.getElementById("btnEntrar").addEventListener("click", () => {
    mostrarPantalla("menu");
  });

  // Botones del menú principal
  document.querySelectorAll(".btn-menu").forEach(btn => {
    btn.addEventListener("click", () => {
      const destino = btn.dataset.pantalla;

      if (destino === "colecciones") {
        renderColecciones();
        mostrarPantalla("colecciones");

        const inputBuscarCol = document.getElementById("inputBuscarColecciones");
        if (inputBuscarCol) inputBuscarCol.value = filtroTextoColecciones;
      }

      if (destino === "buscar") {
        document.getElementById("inputBuscar").value = "";
        renderResultadosBuscar("");
        mostrarPantalla("buscar");
      }

      if (destino === "estadisticas") {
        mostrarPantalla("estadisticas");
      }
    });
  });

  // Buscador de colecciones (IMPORTANTE: va fuera del forEach anterior)
  const inputBuscarCol = document.getElementById("inputBuscarColecciones");
  if (inputBuscarCol) {
    inputBuscarCol.addEventListener("input", () => {
      setFiltroTextoColecciones(inputBuscarCol.value);
    });
  }

  // Volver al menú
  document.querySelectorAll("[data-action='volverMenu']").forEach(btn => {
    btn.addEventListener("click", () => mostrarPantalla("menu"));
  });

  // Volver a colecciones
  document.querySelectorAll("[data-action='volverColecciones']").forEach(btn => {
    btn.addEventListener("click", () => {
      renderColecciones();
      mostrarPantalla("colecciones");

      const inputBuscarCol = document.getElementById("inputBuscarColecciones");
      if (inputBuscarCol) inputBuscarCol.value = filtroTextoColecciones;
    });
  });

  // Buscar cartas
  document.getElementById("btnBuscar").addEventListener("click", () => {
    const texto = document.getElementById("inputBuscar").value;
    renderResultadosBuscar(texto);
  });

  document.getElementById("inputBuscar").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const texto = document.getElementById("inputBuscar").value;
      renderResultadosBuscar(texto);
    }
  });

  // Filtro de idioma en Colecciones
  document.querySelectorAll(".btn-filtro").forEach(btn => {
    btn.addEventListener("click", () => {
      setFiltroColecciones(btn.dataset.lang);
    });
  });
}


function init() {
  cargarEstado();
  wireGlobalButtons();
  renderResultadosBuscar("");
}

init();
