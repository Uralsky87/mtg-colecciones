// ===============================
// 1) Datos de ejemplo
// ===============================
const cartas = [
  // TestSet A
  { id: 1, nombre: "Lightning Bolt",  coleccion: "TestSet A", numero: 101, rareza: "Común" },
  { id: 2, nombre: "Counterspell",    coleccion: "TestSet A", numero: 102, rareza: "Común" },
  { id: 3, nombre: "Llanowar Elves",  coleccion: "TestSet A", numero: 103, rareza: "Común" },
  { id: 4, nombre: "Serra Angel",     coleccion: "TestSet A", numero: 104, rareza: "Rara" },
  { id: 5, nombre: "Shivan Dragon",   coleccion: "TestSet A", numero: 105, rareza: "Rara" },

  // TestSet B
  { id: 6,  nombre: "Birds of Paradise", coleccion: "TestSet B", numero: 201, rareza: "Mítica" },
  { id: 7,  nombre: "Duress",            coleccion: "TestSet B", numero: 202, rareza: "Común" },
  { id: 8,  nombre: "Giant Growth",      coleccion: "TestSet B", numero: 203, rareza: "Común" },
  { id: 9,  nombre: "Thoughtseize",      coleccion: "TestSet B", numero: 204, rareza: "Rara" },
  { id: 10, nombre: "Wrath of God",      coleccion: "TestSet B", numero: 205, rareza: "Rara" }
];

const LS_KEY_COLECCION = "mtg_coleccion";
let coleccionEstado = {};
let filtroNombre = "";

// ===============================
// 2) LocalStorage
// ===============================
function cargarColeccion() {
  const guardado = localStorage.getItem(LS_KEY_COLECCION);
  coleccionEstado = guardado ? JSON.parse(guardado) : {};
}

function guardarColeccion() {
  localStorage.setItem(LS_KEY_COLECCION, JSON.stringify(coleccionEstado));
}

// ===============================
// 3) Utilidades
// ===============================
function obtenerColecciones() {
  return [...new Set(cartas.map(c => c.coleccion))];
}

function progresoColeccion(nombreColeccion) {
  const cartasDelSet = cartas.filter(c => c.coleccion === nombreColeccion);
  const total = cartasDelSet.length;
  const tengo = cartasDelSet.filter(c => !!coleccionEstado[c.id]).length;
  return { tengo, total };
}

// ===============================
// 4) Navegación entre pantallas
// ===============================
function activarPantalla(nombre) {
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));

  if (nombre === "colecciones") {
    document.getElementById("pantallaColecciones").classList.add("activa");
    mostrarPantallaColecciones();
  }

  if (nombre === "buscar") {
    document.getElementById("pantallaBuscar").classList.add("activa");
    mostrarBusqueda(); // pinta resultados según filtro actual
  }

  if (nombre === "estadisticas") {
    document.getElementById("pantallaEstadisticas").classList.add("activa");
  }
}

// ===============================
// 5) Pantalla Colecciones
// ===============================
function mostrarPantallaColecciones() {
  const cont = document.getElementById("contenedorColecciones");
  const sets = obtenerColecciones();

  let html = `<h2>Ediciones</h2>`;

  sets.forEach(set => {
    const { tengo, total } = progresoColeccion(set);
    html += `
      <div class="coleccion-item">
        <strong>${set}</strong><br>
        <span class="progreso">${tengo} / ${total} cartas</span>
      </div>
    `;
  });

  cont.innerHTML = html;
}

// ===============================
// 6) Pantalla Buscar
// ===============================
function mostrarResumen(lista) {
  const resumenDiv = document.getElementById("resumen");
  if (!resumenDiv) return;

  const total = lista.length;
  const tengo = lista.filter(c => !!coleccionEstado[c.id]).length;
  const porcentaje = total > 0 ? ((tengo / total) * 100).toFixed(1) : "0.0";

  resumenDiv.textContent = `Tienes ${tengo} de ${total} cartas (${porcentaje}%).`;
}

function renderTabla(lista) {
  const app = document.getElementById("app");
  if (!app) return;

  let html = `
    <table class="card-list">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Colección</th>
          <th>Número</th>
          <th>Rareza</th>
          <th>Tengo</th>
        </tr>
      </thead>
      <tbody>
  `;

  lista.forEach(carta => {
    const tengoEsta = !!coleccionEstado[carta.id];
    html += `
      <tr>
        <td>${carta.nombre}</td>
        <td>${carta.coleccion}</td>
        <td>${carta.numero}</td>
        <td>${carta.rareza}</td>
        <td style="text-align:center;">
          <input type="checkbox" class="checkbox-tengo" data-id="${carta.id}" ${tengoEsta ? "checked" : ""}>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  app.innerHTML = html;

  document.querySelectorAll(".checkbox-tengo").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = parseInt(chk.dataset.id, 10);
      coleccionEstado[id] = chk.checked;
      guardarColeccion();
      // refresca resumen sin repintar todo
      mostrarResumen(listaFiltradaActual());
    });
  });
}

function listaFiltradaActual() {
  const texto = filtroNombre.trim().toLowerCase();
  if (!texto) return cartas;
  return cartas.filter(c => c.nombre.toLowerCase().includes(texto));
}

function mostrarBusqueda() {
  const lista = listaFiltradaActual();
  mostrarResumen(lista);
  renderTabla(lista);
}

// ===============================
// 7) Inicialización
// ===============================
function inicializarBuscador() {
  const input = document.getElementById("buscarNombre");
  if (!input) return;

  input.value = "";
  input.addEventListener("input", () => {
    filtroNombre = input.value;
    mostrarBusqueda();
  });
}

function inicializarMenu() {
  document.querySelectorAll("#menuPrincipal button").forEach(btn => {
    btn.addEventListener("click", () => activarPantalla(btn.dataset.pantalla));
  });
}

function inicializar() {
  cargarColeccion();
  inicializarMenu();
  inicializarBuscador();
  activarPantalla("colecciones"); // pantalla inicial
}

inicializar();
