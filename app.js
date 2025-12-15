// ===============================
// 1) Datos de ejemplo (con cartas repetidas en distintos sets)
// ===============================

const cartas = [
  // TestSet A
  { id: 1, nombre: "Lightning Bolt",  coleccion: "TestSet A", numero: 101, rareza: "Común" },
  { id: 2, nombre: "Counterspell",    coleccion: "TestSet A", numero: 102, rareza: "Común" },
  { id: 3, nombre: "Llanowar Elves",  coleccion: "TestSet A", numero: 103, rareza: "Común" },
  { id: 4, nombre: "Serra Angel",     coleccion: "TestSet A", numero: 104, rareza: "Rara" },
  { id: 5, nombre: "Shivan Dragon",   coleccion: "TestSet A", numero: 105, rareza: "Rara" },

  // TestSet B (incluye Lightning Bolt también, para simular reimpresión)
  { id: 6,  nombre: "Lightning Bolt",     coleccion: "TestSet B", numero: 201, rareza: "Común" },
  { id: 7,  nombre: "Duress",             coleccion: "TestSet B", numero: 202, rareza: "Común" },
  { id: 8,  nombre: "Giant Growth",       coleccion: "TestSet B", numero: 203, rareza: "Común" },
  { id: 9,  nombre: "Thoughtseize",       coleccion: "TestSet B", numero: 204, rareza: "Rara" },
  { id: 10, nombre: "Wrath of God",       coleccion: "TestSet B", numero: 205, rareza: "Rara" }
];

function obtenerColecciones() {
  return [...new Set(cartas.map(c => c.coleccion))];
}

// ===============================
// 2) Estado de colección (tengo + foil) en localStorage
// ===============================

const LS_KEY = "mtg_coleccion_estado_v1";

/**
 * Estructura:
 * estado[idCarta] = { tengo: boolean, foil: boolean }
 */
let estado = {};

function cargarEstado() {
  const raw = localStorage.getItem(LS_KEY);
  estado = raw ? JSON.parse(raw) : {};
}

function guardarEstado() {
  localStorage.setItem(LS_KEY, JSON.stringify(estado));
}

function getEstadoCarta(id) {
  if (!estado[id]) estado[id] = { tengo: false, foil: false };
  return estado[id];
}

function setTengo(id, value) {
  const st = getEstadoCarta(id);
  st.tengo = value;
  if (!st.tengo) st.foil = false; // si no la tienes, no puede ser foil
  guardarEstado();
}

function setFoil(id, value) {
  const st = getEstadoCarta(id);
  // solo permitimos foil si tengo = true
  st.foil = st.tengo ? value : false;
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
// 4) Colecciones: lista + progreso
// ===============================

function progresoDeColeccion(nombreColeccion) {
  const cartasDelSet = cartas.filter(c => c.coleccion === nombreColeccion);
  const total = cartasDelSet.length;
  const tengo = cartasDelSet.filter(c => getEstadoCarta(c.id).tengo).length;
  return { tengo, total };
}

function renderColecciones() {
  const cont = document.getElementById("listaColecciones");
  const sets = obtenerColecciones();

  let html = "";
  sets.forEach(set => {
    const { tengo, total } = progresoDeColeccion(set);

    html += `
      <div class="coleccion-item" data-set="${set}">
        <div><strong>${set}</strong></div>
        <div class="badge">${tengo} / ${total} cartas</div>
      </div>
    `;
  });

  cont.innerHTML = html;

  cont.querySelectorAll("[data-set]").forEach(item => {
    item.addEventListener("click", () => {
      const set = item.dataset.set;
      abrirSet(set);
    });
  });
}

// ===============================
// 5) Set: lista de cartas + tengo/foil
// ===============================

let setActual = null;

function abrirSet(nombreSet) {
  setActual = nombreSet;
  document.getElementById("tituloSet").textContent = nombreSet;

  const { tengo, total } = progresoDeColeccion(nombreSet);
  document.getElementById("progresoSet").textContent = `Progreso: ${tengo} / ${total}`;

  const lista = cartas
    .filter(c => c.coleccion === nombreSet)
    .sort((a, b) => a.numero - b.numero);

  let html = `
    <table class="tabla">
      <thead>
        <tr>
          <th>Carta</th>
          <th>#</th>
          <th>Rareza</th>
          <th style="text-align:right;">Tengo / Foil</th>
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
          <div class="acciones">
            <label>
              <input type="checkbox" class="chk-tengo" data-id="${c.id}" ${st.tengo ? "checked" : ""}>
              Tengo
            </label>
            <label>
              <input type="checkbox" class="chk-foil" data-id="${c.id}" ${st.foil ? "checked" : ""} ${st.tengo ? "" : "disabled"}>
              Foil
            </label>
          </div>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;

  const cont = document.getElementById("listaCartasSet");
  cont.innerHTML = html;

  // listeners
  cont.querySelectorAll(".chk-tengo").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.id);
      setTengo(id, chk.checked);
      // refrescamos el set para actualizar disabled/enabled y progreso
      abrirSet(setActual);
      // refrescamos también la lista de colecciones (progreso)
      renderColecciones();
    });
  });

  cont.querySelectorAll(".chk-foil").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.id);
      setFoil(id, chk.checked);
      abrirSet(setActual);
    });
  });

  mostrarPantalla("set");
}

// ===============================
// 6) Buscar: por nombre + mostrar sets donde aparece y estado
// ===============================

function buscarCartasPorNombre(texto) {
  const q = texto.trim().toLowerCase();
  if (!q) return [];

  // agrupar por nombre para mostrar “la carta” y debajo sus ediciones
  const coincidencias = cartas.filter(c => c.nombre.toLowerCase().includes(q));

  const porNombre = new Map();
  coincidencias.forEach(c => {
    if (!porNombre.has(c.nombre)) porNombre.set(c.nombre, []);
    porNombre.get(c.nombre).push(c);
  });

  return [...porNombre.entries()].map(([nombre, versiones]) => ({
    nombre,
    versiones: versiones.sort((a,b) => a.coleccion.localeCompare(b.coleccion))
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
      const tengoTxt = st.tengo ? "✅ Tengo" : "❌ No tengo";
      const foilTxt = st.foil ? " · ✨ Foil" : "";
      html += `<li><strong>${v.coleccion}</strong> (#${v.numero}, ${v.rareza}) — ${tengoTxt}${foilTxt}</li>`;
    });

    html += `</ul></div>`;
  });

  cont.innerHTML = html;
}

// ===============================
// 7) Inicialización (botones + pantallas)
// ===============================

function wireGlobalButtons() {
  // Entrar (bienvenida -> menú)
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

  // Botones "volver" (data-action)
  document.querySelectorAll("[data-action='volverMenu']").forEach(btn => {
    btn.addEventListener("click", () => mostrarPantalla("menu"));
  });

  document.querySelectorAll("[data-action='volverColecciones']").forEach(btn => {
    btn.addEventListener("click", () => {
      renderColecciones();
      mostrarPantalla("colecciones");
    });
  });

  // Buscar
  document.getElementById("btnBuscar").addEventListener("click", () => {
    const texto = document.getElementById("inputBuscar").value;
    renderResultadosBuscar(texto);
  });

  // Enter en el input
  document.getElementById("inputBuscar").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const texto = document.getElementById("inputBuscar").value;
      renderResultadosBuscar(texto);
    }
  });
}

function init() {
  cargarEstado();
  wireGlobalButtons();
  // pantalla inicial por defecto ya está en el HTML como active
  renderResultadosBuscar("");
}

init();
