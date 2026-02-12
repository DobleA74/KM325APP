(async function(){
  const $ = (id)=>document.getElementById(id);

  const empleadoSel = $('c_empleado');
  const desdeInp = $('c_desde');
  const hastaInp = $('c_hasta');
  const patronSel = $('c_patron');
  const inicioPatronInp = $('c_inicio_patron');
  const patronInfo = $('patron_info');
  const tbody = document.querySelector('#tabla_calendario tbody');
  const calMsg = $('cal_msg');

  const modal = $('modal_ex');
  const exClose = $('ex_close');
  const exGuardar = $('ex_guardar');
  const exEliminar = $('ex_eliminar');

  const exLegajo = $('ex_legajo');
  const exFecha = $('ex_fecha');
  const exTipo = $('ex_tipo');
  const exPuesto = $('ex_puesto');
  const exTurno = $('ex_turno');
  const exMotivo = $('ex_motivo');

  let currentExId = null;

  function openModal(){
    modal.setAttribute('aria-hidden','false');
    modal.classList.add('open');
  }
  function closeModal(){
    modal.setAttribute('aria-hidden','true');
    modal.classList.remove('open');
  }
  exClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });

  function fmtMin(min){
    if(min === null || min === undefined) return '';
    const h = Math.floor(min/60).toString().padStart(2,'0');
    const m = (min%60).toString().padStart(2,'0');
    return `${h}:${m}`;
  }

  
  async function loadPuestos(){
    try{
      const r = await fetch('/api/puestos');
      const data = await r.json();
      const items = (data && data.items) ? data.items : [];
      // items puede venir como [{puesto,...}] o como strings
      const puestos = items.map(x => (typeof x === 'string' ? x : x.puesto)).filter(Boolean);

      // llenar select de Puesto en modal de Excepción
      exPuesto.innerHTML = '<option value="">(sin cambio)</option>' + puestos.map(p=>`<option value="${p}">${p}</option>`).join('');
    }catch(e){
      // si falla, dejar el select como está
      console.warn('No se pudo cargar puestos', e);
    }
  }

async function loadEmpleados(){
    const r = await fetch('/api/empleados');
    const data = await r.json();
    empleadoSel.innerHTML = '<option value="">(seleccionar)</option>' + data.map(e=>`<option value="${e.legajo}">${e.legajo} – ${e.nombre} (${e.puesto || 's/puesto'})</option>`).join('');
  }

  async function loadPatrones(){
    const r = await fetch('/api/patrones');
    const data = await r.json();
    patronSel.innerHTML = '<option value="">(sin patrón)</option>' + data.map(p=>`<option value="${p.id}">${p.nombre} (ciclo ${p.ciclo_dias}d)</option>`).join('');
  }

  function defaultRange(){
    const today = new Date();
    const from = new Date(today);
    const to = new Date(today);
    to.setDate(to.getDate()+14);
    desdeInp.value = from.toISOString().slice(0,10);
    hastaInp.value = to.toISOString().slice(0,10);
  }

  async function loadAsignacionPatron(){
    const legajo = empleadoSel.value;
    patronInfo.textContent = '';
    if(!legajo){ patronSel.value=''; inicioPatronInp.value=''; return; }
    // Cargamos patrón efectivo (empleado o puesto) para que lo de arriba sea consistente con Configuración avanzada.
    const r = await fetch(`/api/empleados/${encodeURIComponent(legajo)}/patron-efectivo`);
    const data = await r.json();

    if (data && data.patron_id) {
      const fuente = String(data.fuente || '').toUpperCase();

      // Solo llenamos los inputs de arriba si ES un override por empleado.
      if (fuente === 'EMPLEADO') {
        patronSel.value = String(data.patron_id);
        inicioPatronInp.value = data.fecha_inicio || '';
        patronInfo.textContent = `Patrón efectivo: ${data.patron_nombre} (override del empleado, desde ${data.fecha_inicio})`;
      } else {
        // Mostramos el mismo patrón que viene por puesto para no confundir,
        // pero el botón "Guardar override" recién crea el override a nivel empleado.
        patronSel.value = String(data.patron_id);
        inicioPatronInp.value = data.fecha_inicio || '';
        const puesto = data.puesto ? ` — Puesto: ${data.puesto}` : '';
        patronInfo.textContent = `Patrón efectivo: ${data.patron_nombre} (por configuración avanzada${puesto}). Si cambiás y guardás acá, creás un override SOLO para este empleado.`;
      }
    } else {
      patronSel.value = '';
      inicioPatronInp.value = '';
      patronInfo.textContent = 'Este empleado no tiene patrón efectivo (ni override ni patrón por puesto).';
    }
  }

  async function cargarCalendario(){
    const legajo = empleadoSel.value;
    if(!legajo){ calMsg.textContent='Seleccioná un empleado.'; return; }
    const desde = desdeInp.value;
    const hasta = hastaInp.value;
    if(!desde || !hasta){ calMsg.textContent='Elegí rango de fechas.'; return; }
    calMsg.textContent='';
    tbody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';

    const r = await fetch(`/api/calendario/resuelto?legajo=${encodeURIComponent(legajo)}&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`);
    const data = await r.json();

    if(data.error){
      tbody.innerHTML = '';
      calMsg.textContent = data.error;
      return;
    }

    const rows = data.dias || [];
    if(!rows.length){
      tbody.innerHTML = '';
      calMsg.textContent = 'Sin datos para mostrar.';
      return;
    }

    tbody.innerHTML = rows.map(d=>{
      const horario = (d.hora_inicio_min!=null && d.hora_fin_min!=null) ? `${fmtMin(d.hora_inicio_min)} – ${fmtMin(d.hora_fin_min)}` : '';
      const fuente = d.fuente || '';
      const puesto = d.puesto || '';
      const turno = d.turno || '';
      const exBadge = d.excepcion_id ? `data-exid="${d.excepcion_id}"` : '';
      return `
        <tr>
          <td>${d.fecha}</td>
          <td>${puesto}</td>
          <td>${turno}</td>
          <td>${horario}</td>
          <td>${fuente}</td>
          <td>
            <button class="btn btn-sm" data-fecha="${d.fecha}" ${exBadge}>Excepción</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('button[data-fecha]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const fecha = btn.getAttribute('data-fecha');
        const exid = btn.getAttribute('data-exid');
        currentExId = exid ? Number(exid) : null;

        exLegajo.value = legajo;
        exFecha.value = fecha;
        exTipo.value = 'CAMBIO';
        exPuesto.value = '';
        exTurno.value = '';
        exMotivo.value = '';

        if(currentExId){
          // cargar excepción existente desde la última respuesta (sin request extra)
          const day = rows.find(x=>x.fecha===fecha);
          if(day && day.excepcion){
            exTipo.value = day.excepcion.tipo || 'CAMBIO';
            exPuesto.value = day.excepcion.puesto_override || '';
            exTurno.value = day.excepcion.turno_override || '';
            exMotivo.value = day.excepcion.motivo || '';
          }
          exEliminar.style.display = '';
        } else {
          exEliminar.style.display = 'none';
        }

        openModal();
      });
    });
  }

  $('btn_cargar').addEventListener('click', async ()=>{
    await loadAsignacionPatron();
    await cargarCalendario();
  });

  empleadoSel.addEventListener('change', async ()=>{
    await loadAsignacionPatron();
  });

  $('btn_guardar_patron').addEventListener('click', async ()=>{
    const legajo = empleadoSel.value;
    const patron_id = patronSel.value;
    const fecha_inicio = inicioPatronInp.value;
    if(!legajo){ alert('Seleccioná un empleado'); return; }
    if(!patron_id || !fecha_inicio){ alert('Seleccioná patrón e inicio'); return; }

    const r = await fetch(`/api/empleados/${encodeURIComponent(legajo)}/patron`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ patron_id: Number(patron_id), fecha_inicio })
    });
    const data = await r.json();
    if(data.error){ alert(data.error); return; }
    await loadAsignacionPatron();
    await cargarCalendario();
  });

  exGuardar.addEventListener('click', async ()=>{
    const payload = {
      legajo: exLegajo.value,
      fecha: exFecha.value,
      tipo: exTipo.value,
      puesto_override: exPuesto.value || null,
      turno_override: exTurno.value || null,
      motivo: exMotivo.value || null
    };
    const r = await fetch('/api/calendario/excepciones', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if(data.error){ alert(data.error); return; }
    closeModal();
    await cargarCalendario();
  });

  exEliminar.addEventListener('click', async ()=>{
    if(!currentExId) return;
    if(!confirm('¿Eliminar excepción?')) return;
    const r = await fetch(`/api/calendario/excepciones/${currentExId}`, { method:'DELETE' });
    const data = await r.json();
    if(data.error){ alert(data.error); return; }
    closeModal();
    await cargarCalendario();
  });

  // init
  defaultRange();
  await loadEmpleados();
  await loadPuestos();
  await loadPatrones();
})();
