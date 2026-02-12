/* Recibo individual (para exportar PDF desde el navegador)
   URL: /liquidacion/recibo?mes=YYYY-MM&legajo=NN
*/

const qs = new URLSearchParams(window.location.search);
const mes = (qs.get('mes') || '').trim();
const legajo = (qs.get('legajo') || '').trim();

const elSub = document.getElementById('recibo-sub');
const elMsg = document.getElementById('recibo-msg');
const elBody = document.getElementById('recibo-body');
const tbodyConceptos = document.getElementById('tbody-conceptos');
const tbodyArqueos = document.getElementById('tbody-arqueos');
const tfootTotal = document.getElementById('tfoot-total');

const btnPrint = document.getElementById('btn-print');
btnPrint?.addEventListener('click', () => window.print());

function fmtMoney(v) {
  const num = Number(v || 0);
  return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function safeJson(resp) {
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Respuesta no JSON (${resp.status}). ${text.slice(0, 120)}`);
  }
  return await resp.json();
}

function row(concepto, monto) {
  return `
    <tr>
      <td>${concepto}</td>
      <td style="text-align:right">$ ${fmtMoney(monto)}</td>
    </tr>
  `;
}

async function load() {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes) || !legajo) {
    elMsg.textContent = 'Faltan parámetros. Usar ?mes=YYYY-MM&legajo=NN';
    elMsg.className = 'notice danger';
    return;
  }

  try {
    elSub.textContent = `Mes ${mes} · Legajo ${legajo}`;

    // Resumen empleado
    const r1 = await fetch(`/api/liquidacion?mes=${encodeURIComponent(mes)}`);
    const j1 = await safeJson(r1);
    if (!j1.ok) throw new Error(j1.error || 'Error liquidación');

    const emp = (j1.items || []).find((x) => String(x.legajo) === String(legajo));
    if (!emp) {
      elMsg.textContent = 'Empleado no encontrado en este mes.';
      elMsg.className = 'notice danger';
      return;
    }

    // Arqueos empleado
    const r2 = await fetch(`/api/arqueos/empleado?legajo=${encodeURIComponent(legajo)}&mes=${encodeURIComponent(mes)}`);
    const j2 = await safeJson(r2);
    const arqs = (j2.ok ? j2.items : []) || [];

    // Render conceptos
    const pres = emp.pierde_presentismo ? 'No' : 'Sí';

    const conceptos = [
      ['Legajo', emp.legajo],
      ['Nombre', emp.nombre],
      ['Días (incluye francos)', emp.dias_trabajados],
      ['Francos', emp.dias_franco ?? 0],
      ['Noches (turnos)', emp.noches_turnos ?? 0],
      ['Feriados', emp.feriados_trabajados ?? 0],
      ['Tardanzas', emp.tardanzas ?? 0],
      ['Presentismo', pres],
    ];

    const montos = [
      ['Básico', emp.basico],
      ['Antigüedad', emp.monto_antiguedad],
      ['Adic. Nocturnidad', emp.adicional_nocturnidad],
      ['Premio asistencia', emp.premio_asistencia],
      ['Premio manejo fondos (bruto)', emp.premio_manejo_fondos_bruto],
      ['Ajuste arqueo (faltantes)', emp.ajuste_manejo_fondos],
      ['Premio manejo fondos (neto)', emp.premio_manejo_fondos],
      ['Adelantos', emp.adelantos],
    ];

    tbodyConceptos.innerHTML = '';
    // datos
    for (const [k, v] of conceptos) {
      tbodyConceptos.insertAdjacentHTML(
        'beforeend',
        `
        <tr>
          <td>${k}</td>
          <td style="text-align:right">${typeof v === 'number' ? v : v}</td>
        </tr>
        `,
      );
    }

    tbodyConceptos.insertAdjacentHTML(
      'beforeend',
      `<tr><td colspan="2" style="padding:10px 0"></td></tr>`,
    );

    let total = 0;
    for (const [k, v] of montos) {
      const num = Number(v || 0);
      // neto estimado: sumamos positivos, restamos adelantos y ajuste arqueo si querés
      // acá lo dejamos como suma simple para referencia + total neto abajo.
      tbodyConceptos.insertAdjacentHTML('beforeend', row(k, num));
      if (k === 'Adelantos' || k.startsWith('Ajuste')) total -= num;
      else if (k === 'Premio manejo fondos (bruto)') total += 0; // evitar doble conteo
      else if (k === 'Premio manejo fondos (neto)') total += num;
      else total += num;
    }

    tfootTotal.innerHTML = `
      <td style="font-weight:900">Total estimado</td>
      <td style="text-align:right; font-weight:900">$ ${fmtMoney(total)}</td>
    `;

    // Render arqueos
    tbodyArqueos.innerHTML = '';
    if (!arqs.length) {
      tbodyArqueos.innerHTML = `<tr><td colspan="5" class="small">Sin arqueos imputados en el mes.</td></tr>`;
    } else {
      for (const a of arqs) {
        tbodyArqueos.insertAdjacentHTML(
          'beforeend',
          `
          <tr>
            <td>${a.fecha || ''}</td>
            <td>${a.sector || ''}</td>
            <td>${a.turno || ''}</td>
            <td style="text-align:right">$ ${fmtMoney(a.monto_diferencia)}</td>
            <td style="text-align:right; font-weight:800">$ ${fmtMoney(a.monto_final)}</td>
          </tr>
          `,
        );
      }
    }

    elMsg.style.display = 'none';
    elBody.style.display = '';
  } catch (e) {
    console.error(e);
    elMsg.textContent = `Error: ${e.message || e}`;
    elMsg.className = 'notice danger';
  }
}

load();
