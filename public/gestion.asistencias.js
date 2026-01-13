console.log("✅ GESTIÓN ASISTENCIAS - OK (listeners cargados)");

document.addEventListener("DOMContentLoaded", () => {
  const $desde = document.getElementById("desde");
  const $hasta = document.getElementById("hasta");
  const $legajo = document.getElementById("legajo");
  const $puesto = document.getElementById("puesto");
  const $sector = document.getElementById("sector");
  const $btnBuscar = document.getElementById("btn-buscar");
  const $btnLimpiar = document.getElementById("btn-limpiar");
  const $info = document.getElementById("info");
  const $totales = document.getElementById("totales");
  const $tbody = document.getElementById("tbody-asist");

  // Si falta algo, lo avisamos (esto te detecta IDs mal)
  const requeridos = { $desde, $hasta, $legajo, $puesto, $sector, $btnBuscar, $btnLimpiar, $info, $totales, $tbody };
  for (const [k, v] of Object.entries(requeridos)) {
    if (!v) console.error("❌ Falta elemento en HTML:", k);
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function haceDiasISO(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function setInfo(msg) { if ($info) $info.textContent = msg || ""; }
  function format2(n) { return Number(n || 0).toFixed(2); }

  function normalizarLegajoSoloSiHay(valor) {
    const raw = String(valor || "").trim();
    if (!raw) return "";
    const soloNum = raw.replace(/\D/g, "");
    if (!soloNum) return "";
    return soloNum.padStart(8, "0");
  }

  function td(text) {
    const el = document.createElement("td");
    el.textContent = text ?? "";
    return el;
  }

  function renderTabla(rows) {
    if (!$tbody) return;
    $tbody.innerHTML = "";

    if (!rows.length) {
      $tbody.innerHTML = `<tr><td colspan="12">Sin resultados.</td></tr>`;
      if ($totales) $totales.textContent = "";
      return;
    }

    let sumHoras = 0;
    let sumNoct = 0;

    rows.forEach((r) => {
      sumHoras += Number(r.horas || 0);
      sumNoct += Number(r.nocturnas || 0);

      const tr = document.createElement("tr");
      tr.appendChild(td(r.id));
      tr.appendChild(td(r.fecha_entrada));
      tr.appendChild(td(r.fecha_salida));
      tr.appendChild(td(r.legajo));
      tr.appendChild(td(r.nombre));
      tr.appendChild(td(r.sector));
      tr.appendChild(td(r.puesto));
      tr.appendChild(td(r.entrada));
      tr.appendChild(td(r.salida));
      tr.appendChild(td(format2(r.horas)));
      tr.appendChild(td(format2(r.nocturnas)));

      const tdAcc = document.createElement("td");
      const btnDel = document.createElement("button");
      btnDel.className = "btn-mini";
      btnDel.type = "button";
      btnDel.textContent = "🗑";
      btnDel.title = "Eliminar registro";
      btnDel.addEventListener("click", () => eliminarRegistro(r.id));
      tdAcc.appendChild(btnDel);
      tr.appendChild(tdAcc);

      $tbody.appendChild(tr);
    });

    if ($totales) {
      $totales.innerHTML = `
        <strong>Total registros:</strong> ${rows.length}
        &nbsp;|&nbsp;
        <strong>Total horas:</strong> ${format2(sumHoras)}
        &nbsp;|&nbsp;
        <strong>Total nocturnas:</strong> ${format2(sumNoct)}
      `;
    }
  }

  async function buscar() {
    setInfo("Buscando…");

    const params = new URLSearchParams();

    const desde = $desde?.value || "";
    const hasta = $hasta?.value || "";
    const puesto = $puesto?.value || "";
    const sector = $sector?.value || "";
    const legajo = normalizarLegajoSoloSiHay($legajo?.value || "");

    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (legajo) params.set("legajo", legajo);
    if (puesto) params.set("puesto", puesto);
    if (sector) params.set("sector", sector);

    try {
      const res = await fetch(`/api/asistencias?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Error en servidor");

      renderTabla(data.rows || []);
      setInfo(`OK (${(data.rows || []).length} registros)`);
    } catch (e) {
      console.error(e);
      setInfo("❌ Error al buscar");
      alert("Error al buscar asistencias");
    }
  }

  async function eliminarRegistro(id) {
    if (!confirm(`¿Eliminar registro ID ${id}?`)) return;

    try {
      const res = await fetch(`/api/asistencias/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo eliminar");

      setInfo(`✅ Eliminado ID ${id}`);
      buscar();
    } catch (e) {
      console.error(e);
      alert("No se pudo eliminar");
    }
  }

  function limpiar() {
    if ($desde) $desde.value = haceDiasISO(30);
    if ($hasta) $hasta.value = hoyISO();
    if ($legajo) $legajo.value = "";
    if ($puesto) $puesto.value = "";
    if ($sector) $sector.value = "";
    setInfo("");
    buscar();
  }

  // Defaults (30 días) - NO tocamos legajo
  if ($desde && !$desde.value) $desde.value = haceDiasISO(30);
  if ($hasta && !$hasta.value) $hasta.value = hoyISO();

  // Enganchar botones
  if ($btnBuscar) $btnBuscar.addEventListener("click", buscar);
  if ($btnLimpiar) $btnLimpiar.addEventListener("click", limpiar);

  // Primera carga
  buscar();
});
