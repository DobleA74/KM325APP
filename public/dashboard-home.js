(async function () {
  const elA = document.getElementById('dash-arqueos');
  const elB = document.getElementById('dash-asistencias');
  const elC = document.getElementById('dash-novedades');

  const elArqEstado = document.getElementById('dash-arqueos-estado');
  const elAsiAyer = document.getElementById('dash-asistencias-ayer');
  const elJorn = document.getElementById('dash-jornadas');
  const elAlerts = document.getElementById('dash-alertas');

  if (!elA || !elB || !elC) return;

  async function safeJson(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  // These endpoints are optional; if they don't exist yet, we keep the placeholder.
  const dash = await safeJson('/api/dashboard');
  if (!dash) return;

  if (dash.ultimos_arqueos) elA.textContent = dash.ultimos_arqueos;
  if (dash.ultimas_asistencias) elB.textContent = dash.ultimas_asistencias;
  if (dash.ultimas_novedades) elC.textContent = dash.ultimas_novedades;

  // v2 fields (si existen)
  if (elJorn && dash.jornadas_abiertas && typeof dash.jornadas_abiertas.pendientes === 'number') {
    elJorn.textContent = String(dash.jornadas_abiertas.pendientes);
  }

  if (elAsiAyer && dash.asistencias) {
    const a = dash.asistencias;
    if (a.ayer_fecha) {
      elAsiAyer.textContent = a.ayer_cargado ? `Ayer (${a.ayer_fecha}): OK (${a.ayer_cant})` : `Ayer (${a.ayer_fecha}): falta cargar`;
    }
  }

  if (elArqEstado && dash.arqueos && dash.arqueos.estado) {
    const st = dash.arqueos.estado;
    const f = dash.arqueos.fecha_estado || '';
    const playa = st.playa ? `${st.playa.cargados}/${st.playa.esperados}` : '0/3';
    const shop = st.shop ? `${st.shop.cargados}/${st.shop.esperados}` : '0/2';
    elArqEstado.textContent = `Estado ${f}: Playa ${playa} • Shop ${shop}`;
  }

  if (elAlerts) {
    const items = Array.isArray(dash.alertas) ? dash.alertas : [];
    if (!items.length) {
      elAlerts.innerHTML = '<div class="home-alerts__ok">Sin alertas por hoy ✅</div>';
    } else {
      elAlerts.innerHTML = `
        <div class="home-alerts__title">Alertas</div>
        <ul class="home-alerts__list">
          ${items.map(i => `<li>${(i && i.mensaje) ? i.mensaje : ''}</li>`).join('')}
        </ul>
      `;
    }
  }
})();
