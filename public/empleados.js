console.log("✅ ABM Empleados cargado - v3");

const form = document.getElementById("form-empleado");
const inpLegajo = document.getElementById("legajo");
const inpNombre = document.getElementById("nombre");
const selSector = document.getElementById("sector");
const selPuesto = document.getElementById("puesto");
const tbody = document.getElementById("tbody-empleados");
const msg = document.getElementById("msg");

let empleadosCache = [];

// Normaliza legajo a 8 dígitos (00000001) SOLO para guardar/actualizar
function normalizarLegajo(valor) {
  const soloNum = String(valor || "").trim().replace(/\D/g, "");
  if (!soloNum) return "";
  return soloNum.padStart(8, "0");
}

async function cargarEmpleados() {
  const res = await fetch("/api/empleados");
  empleadosCache = await res.json();
  renderTabla();
}

function renderTabla() {
  tbody.innerHTML = "";

  if (!empleadosCache.length) {
    tbody.innerHTML = `<tr><td colspan="5">No hay empleados cargados.</td></tr>`;
    return;
  }

  // Orden por legajo como texto
  empleadosCache.sort((a, b) => String(a.legajo).localeCompare(String(b.legajo)));

  empleadosCache.forEach((e) => {
    const tr = document.createElement("tr");

    tr.appendChild(td(e.legajo));
    tr.appendChild(td(e.nombre));
    tr.appendChild(td(e.sector));
    tr.appendChild(td(e.puesto));

    const tdAcc = document.createElement("td");

    const btnEditar = document.createElement("button");
    btnEditar.type = "button";
    btnEditar.innerText = "Editar";
    btnEditar.style.marginRight = "6px";
    btnEditar.addEventListener("click", () => cargarEnFormulario(e));
    tdAcc.appendChild(btnEditar);

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.innerText = "Eliminar";
    // IMPORTANTÍSIMO: eliminar con el legajo EXACTO (sin normalizar)
    btnEliminar.addEventListener("click", () => eliminarEmpleadoExacto(e.legajo));
    tdAcc.appendChild(btnEliminar);

    tr.appendChild(tdAcc);
    tbody.appendChild(tr);
  });
}

function td(texto) {
  const td = document.createElement("td");
  td.innerText = texto ?? "";
  return td;
}

function cargarEnFormulario(e) {
  inpLegajo.value = e.legajo || "";
  inpNombre.value = e.nombre || "";
  selSector.value = e.sector || "";
  selPuesto.value = e.puesto || "";
  msg.innerText = "✏️ Editando legajo " + (e.legajo || "");
}

// Guardar / actualizar (ACA SÍ normalizamos)
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const legajoNorm = normalizarLegajo(inpLegajo.value);

  const payload = {
    legajo: legajoNorm,
    nombre: (inpNombre.value || "").trim(),
    sector: selSector.value || "",
    puesto: selPuesto.value || "",
  };

  if (!payload.legajo) {
    alert("Legajo es obligatorio");
    return;
  }

  const res = await fetch("/api/empleados", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (data.ok) {
    msg.innerText = "✅ Guardado";
    inpLegajo.value = "";
    inpNombre.value = "";
    selSector.value = "";
    selPuesto.value = "";
    await cargarEmpleados();
  } else {
    msg.innerText = "❌ Error: " + (data.error || "desconocido");
  }
});

// Eliminar (ACA NO normalizamos: borramos el legajo TAL CUAL existe en DB)
async function eliminarEmpleadoExacto(legajoExacto) {
  const legajo = String(legajoExacto ?? "").trim();
  if (!legajo) return;

  if (!confirm(`¿Eliminar empleado legajo "${legajo}"?`)) return;

  const res = await fetch(`/api/empleados/${encodeURIComponent(legajo)}`, {
    method: "DELETE",
  });

  const data = await res.json();

  if (data.ok) {
    msg.innerText = `🗑️ Eliminado "${legajo}"`;
    await cargarEmpleados();
  } else {
    msg.innerText = "❌ Error al eliminar: " + (data.error || "desconocido");
  }
}

// Opcional: cuando salís del campo legajo, lo normaliza para que no vuelvas a crear "1"
inpLegajo.addEventListener("blur", () => {
  if (inpLegajo.value.trim() !== "") {
    inpLegajo.value = normalizarLegajo(inpLegajo.value);
  }
});

cargarEmpleados();
