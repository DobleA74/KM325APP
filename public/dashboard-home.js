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
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  const dash = await safeJson('/api/dashboard');
  if (!dash) return;

  // Tolerancia: distintas versiones del backend pueden exponer diferentes nombres.
  const last3Asi = Array.isArray(dash.ultimos_asistencias)
    ? dash.ultimos_asistencias.slice(0, 3)
    : (dash.ultimos_movimientos && Array.isArray(dash.ultimos_movimientos.asistencias))
      ? dash.ultimos_movimientos.asistencias.slice(0, 3)
      : [];

  const last3Arq = Array.isArray(dash.ultimos_arqueos)
    ? dash.ultimos_arqueos.slice(0, 3)
    : (dash.ultimos_movimientos && Array.isArray(dash.ultimos_movimientos.arqueos))
      ? dash.ultimos_movimientos.arqueos.slice(0, 3)
      : [];

  // Cards (arriba)
  if (last3Asi.length) {
    const c = (last3Asi[0].cant ?? last3Asi[0].registros ?? 0);
    elB.textContent = `${last3Asi[0].fecha} (${c} registros)`;
  } else if (typeof dash.ultimas_asistencias === 'string' && dash.ultimas_asistencias.trim()) {
    elB.textContent = dash.ultimas_asistencias;
  }

  if (last3Arq.length) {
    const c = (last3Arq[0].cant ?? last3Arq[0].total_turnos ?? 0);
    elA.textContent = `${last3Arq[0].fecha} (${c} turnos)`;
  } else if (typeof dash.ultimos_arqueos === 'string' && dash.ultimos_arqueos.trim()) {
    elA.textContent = dash.ultimos_arqueos;
  }

  // Jornadas abiertas
  if (elJorn && dash.jornadas_abiertas && typeof dash.jornadas_abiertas.pendientes === 'number') {
    elJorn.textContent = String(dash.jornadas_abiertas.pendientes);
  }

  // Subtexto “últimos movimientos”
  if (elAsiAyer) {
    if (last3Asi.length) {
      elAsiAyer.textContent = `Últimos movimientos: ${last3Asi.map(x => {
        const c = (x.cant ?? x.registros ?? 0);
        return `${x.fecha} (${c})`;
      }).join(' · ')}`;
    }
  }

  if (elArqEstado) {
    // v1/v2: si el backend trae string estado, lo mostramos
    const fromArray = last3Arq.length ? (last3Arq[0].estado || '') : '';
    const fromObj = dash.arqueos && dash.arqueos.estado ? dash.arqueos.estado : null;

    if (fromArray) {
      elArqEstado.textContent = fromArray;
    } else if (fromObj) {
      const st = fromObj;
      const f = dash.arqueos.fecha_estado || '';
      const playa = st.playa ? `${st.playa.cargados}/${st.playa.esperados}` : '0/3';
      const shop = st.shop ? `${st.shop.cargados}/${st.shop.esperados}` : '0/2';
      elArqEstado.textContent = `Estado ${f}: Playa ${playa} • Shop ${shop}`;
    }
  }

  // Alertas
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
