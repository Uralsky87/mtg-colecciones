// ===============================
// 1. Datos de ejemplo (MVP)
// ===============================

const cartas = [
  { id: 1, nombre: "Lightning Bolt", coleccion: "TestSet", numero: 101, rareza: "Común" },
  { id: 2, nombre: "Counterspell", coleccion: "TestSet", numero: 102, rareza: "Común" },
  { id: 3, nombre: "Llanowar Elves", coleccion: "TestSet", numero: 103, rareza: "Común" },
  { id: 4, nombre: "Serra Angel", coleccion: "TestSet", numero: 104, rareza: "Rara" },
  { id: 5, nombre: "Shivan Dragon", coleccion: "TestSet", numero: 105, rareza: "Rara" },
  { id: 6, nombre: "Birds of Paradise", coleccion: "TestSet", numero: 106, rareza: "Mítica" },
  { id: 7, nombre: "Duress", coleccion: "TestSet", numero: 107, rareza: "Común" },
  { id: 8, nombre: "Giant Growth", coleccion: "TestSet", numero: 108, rareza: "Común" },
  { id: 9, nombre: "Thoughtseize", coleccion: "TestSet", numero: 109, rareza: "Rara" },
  { id: 10, nombre: "Wrath of God", coleccion: "TestSet", numero: 110, rareza: "Rara" }
];

// ===============================
// 2. Estado de la colección (localStorage)
// ===============================

const LS_KEY_COLECCION = "mtg_coleccion";

// Objeto donde guardamos si tengo la carta o no, por id
// Ejemplo: { "1": true, "2": false, ... }
let coleccion = {};

function cargarColeccion() {
  const guardado = localStorage.getItem(LS_KEY_COLECCION);
  if (guardado) {
    coleccion = JSON.parse(guardado);
  } else {
    coleccion = {};
  }
}

function guardarColeccion() {
  localStorage.setItem(LS_KEY_COLECCION, JSON.stringify(coleccion));
}

function mostrarResumen() {
  const total = cartas.length;
  let tengo = 0;

  cartas.forEach(carta => {
    if (coleccion[carta.id]) {
      tengo++;
    }
  });

  const porcentaje = total > 0 ? ((tengo / total) * 100).toFixed(1) : 0;

  const resumenDiv = document.getElementById("resumen");
  resumenDiv.textContent = `Tienes ${tengo} de ${total} cartas (${porcentaje}%).`;
}

// ===============================
// 3. Renderizado de cartas
// ===============================

function mostrarCartas() {
  const app = document.getElementById("app");

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

  cartas.forEach(carta => {
    const tengoEsta = !!coleccion[carta.id]; // true/false

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

  mostrarResumen();

  // Añadimos los listeners a los checkboxes una vez pintados
  const checkboxes = document.querySelectorAll(".checkbox-tengo");
  checkboxes.forEach(chk => {
    chk.addEventListener("change", () => {
      const idCarta = parseInt(chk.dataset.id, 10);
      coleccion[idCarta] = chk.checked;   // true si marcado, false si no
      guardarColeccion();
      mostrarResumen();
    });
  });
}

// ===============================
// 4. Inicialización
// ===============================

function inicializar() {
  cargarColeccion();
  mostrarCartas();
}

inicializar();