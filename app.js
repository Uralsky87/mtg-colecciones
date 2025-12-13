// ===============================
// 1. Datos de ejemplo (MVP con varias colecciones)
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

// Obtener lista única de colecciones desde los datos
function obtenerColecciones() {
  return [...new Set(cartas.map(c => c.coleccion))];
}

// Lista de colecciones únicas
const colecciones = [...new Set(cartas.map(c => c.coleccion))];

// Colección seleccionada actualmente ("TODAS" o una de las colecciones)
let coleccionActual = "TODAS";

// Texto de búsqueda por nombre (filtro)
let filtroNombre = "";

// ===============================
// 2. Estado de la colección (localStorage)
// ===============================

const LS_KEY_COLECCION = "mtg_coleccion";

// Objeto donde guardamos si tengo la carta o no, por id
// Ejemplo: { "1": true, "2": false, ... }
let coleccionEstado = {};

function cargarColeccion() {
  const guardado = localStorage.getItem(LS_KEY_COLECCION);
  if (guardado) {
    coleccionEstado = JSON.parse(guardado);
  } else {
    coleccionEstado = {};
  }
}

function guardarColeccion() {
  localStorage.setItem(LS_KEY_COLECCION, JSON.stringify(coleccionEstado));
}

function progresoColeccion(nombreColeccion) {
  const cartasDelSet = cartas.filter(c => c.coleccion === nombreColeccion);
  const total = cartasDelSet.length;
  const tengo = cartasDelSet.filter(c => coleccionEstado[c.id]).length;
  return { tengo, total };
}

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
// 3. Selector de colección
// ===============================

function inicializarSelectorColecciones() {
  const select = document.getElementById("selectColeccion");
  if (!select) return;

  function inicializarBuscadorNombre() {
  const input = document.getElementById("buscarNombre");
  if (!input) return;

  // Por si en el futuro quieres recordar el último filtro, podrías usar localStorage.
  // De momento, empezar siempre vacío:
  input.value = "";

  input.addEventListener("input", () => {
    filtroNombre = input.value.toLowerCase();
    mostrarCartas(); // volvemos a pintar con el filtro aplicado
  });
}

  // Limpiamos por si acaso
  select.innerHTML = "";

  // Opción "Todas"
  const optTodas = document.createElement("option");
  optTodas.value = "TODAS";
  optTodas.textContent = "Todas las colecciones";
  select.appendChild(optTodas);

  // Una opción por cada colección
  colecciones.forEach(col => {
    const opt = document.createElement("option");
    opt.value = col;
    opt.textContent = col;
    select.appendChild(opt);
  });

  // Seleccionar por defecto "TODAS"
  select.value = coleccionActual;

  // Cuando cambie la selección, actualizamos y volvemos a pintar
  select.addEventListener("change", () => {
    coleccionActual = select.value;
    mostrarCartas();
  });
}

// ===============================
// 4. Resumen (según la colección seleccionada)
// ===============================

function mostrarResumen() {
  const resumenDiv = document.getElementById("resumen");
  if (!resumenDiv) return;

   // Filtramos las cartas según la colección actual
  let lista = cartas;
  if (coleccionActual !== "TODAS") {
    lista = cartas.filter(c => c.coleccion === coleccionActual);
  }

  // Aplicamos también el filtro de nombre al resumen
  if (filtroNombre && filtroNombre.trim() !== "") {
    const texto = filtroNombre.trim();
    lista = lista.filter(c =>
      c.nombre.toLowerCase().includes(texto)
    );
  }

  const total = lista.length;
  let tengo = 0;

  lista.forEach(carta => {
    if (coleccionEstado[carta.id]) {
      tengo++;
    }
  });

  const porcentaje = total > 0 ? ((tengo / total) * 100).toFixed(1) : 0;

  const textoColeccion =
    coleccionActual === "TODAS" ? "overall" : `en "${coleccionActual}"`;

  resumenDiv.textContent = `Tienes ${tengo} de ${total} cartas (${porcentaje}%) ${textoColeccion}.`;
}

// ===============================
// 5. Renderizado de cartas
// ===============================

function mostrarCartas() {
  const app = document.getElementById("app");
  if (!app) return;

  // Filtramos por colección seleccionada
  let lista = cartas;
  if (coleccionActual !== "TODAS") {
    lista = cartas.filter(c => c.coleccion === coleccionActual);
  }

  // Filtro por nombre (si hay texto en el buscador)
  if (filtroNombre && filtroNombre.trim() !== "") {
    const texto = filtroNombre.trim();
    lista = lista.filter(c =>
      c.nombre.toLowerCase().includes(texto)
    );
  }

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
    const tengoEsta = !!coleccionEstado[carta.id]; // true/false

    html += `
      <tr>
        <td>${carta.nombre}</td>
        <td>${carta.coleccion}</td>
        <td>${carta.numero}</td>
        <td>${carta.rareza}</td>
        <td style="text-align:center;">
          <input 
            type="checkbox" 
            class="checkbox-tengo" 
            data-id="${carta.id}"
            ${tengoEsta ? "checked" : ""}
          >
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  app.innerHTML = html;

  // Listeners de los checkboxes
  const checkboxes = document.querySelectorAll(".checkbox-tengo");
  checkboxes.forEach(chk => {
    chk.addEventListener("change", () => {
      const idCarta = parseInt(chk.dataset.id, 10);
      coleccionEstado[idCarta] = chk.checked;   // true si marcado, false si no
      guardarColeccion();
      mostrarResumen(); // actualizar resumen al cambiar
    });
  });

  // Actualizar resumen cada vez que mostramos
  mostrarResumen();
}

function cambiarPantalla(nombre) {
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));

  if (nombre === "colecciones") {
    mostrarPantallaColecciones();
    document.getElementById("contenedorColecciones").classList.add("activa");
  }

  // Más pantallas vendrán luego
}

// ===============================
// 6. Inicialización
// ===============================

function inicializar() {
  cargarColeccion();

  // Activamos menú
  document.querySelectorAll("#menuPrincipal button").forEach(btn => {
    btn.addEventListener("click", () => {
      cambiarPantalla(btn.dataset.pantalla);
    });
  });

  // Al iniciar, mostrar colecciones
  cambiarPantalla("colecciones");
}

inicializar();