import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth.jsx";
import {
  createEmpleadoBase,
  emptyEmpleado,
  getEmpleado,
  legacyEmpleadosUrl,
  normalizeBasicoToNumber,
  patchEmpleado,
  replaceFamiliares,
} from "../services/empleados";

const SECTORES = [
  { value: "playa", label: "Playa" },
  { value: "shop", label: "Shop" },
];

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <span>{label}</span>
        {hint ? (
          <span className="muted" style={{ fontSize: 12 }}>
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </label>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// UI -> API
function sectorUiToApi(s) {
  const v = String(s || "")
    .trim()
    .toLowerCase();
  if (v === "playa") return "PLAYA";
  if (v === "shop") return "SHOP";
  const u = String(s || "")
    .trim()
    .toUpperCase();
  if (u === "PLAYA" || u === "SHOP") return u;
  return "";
}

// API -> UI
function sectorApiToUi(s) {
  const u = String(s || "")
    .trim()
    .toUpperCase();
  if (u === "PLAYA") return "playa";
  if (u === "SHOP") return "shop";
  return "";
}

function emptyFamiliar() {
  return {
    parentesco: "",
    nombre: "",
    cuil: "",
    fecha_nac: "",
    part_mat_nac: 0,
    tomo: "",
    acta: "",
    folio: "",
  };
}

export default function EmpleadoEdit({ mode }) {
  const { user } = useAuth();
  const isAdmin = user?.rol === "ADMIN";
  const nav = useNavigate();
  const params = useParams();
  const legajoParam = params.legajo;

  const isCreate = mode === "create";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("personales");
  const [form, setForm] = useState(emptyEmpleado());

  // Puestos por sector (desde backend)
  const [puestosItems, setPuestosItems] = useState([]);
  const [puestosLoading, setPuestosLoading] = useState(false);
  const [puestosError, setPuestosError] = useState("");

  useEffect(() => {
    const apiSector = sectorUiToApi(form.sector);

    if (!apiSector) {
      setPuestosItems([]);
      setPuestosError("");
      setPuestosLoading(false);
      return;
    }

    let cancelled = false;
    setPuestosLoading(true);
    setPuestosError("");

    api
      .get(`/api/puestos?sector=${encodeURIComponent(apiSector)}`)
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setPuestosItems(items.filter((x) => Number(x.activo) === 1));
      })
      .catch((e) => {
        if (cancelled) return;
        setPuestosItems([]);
        setPuestosError(e?.message || "Error cargando puestos");
      })
      .finally(() => {
        if (cancelled) return;
        setPuestosLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.sector]);

  const puestoSel = useMemo(() => {
    return puestosItems.find((x) => x.puesto === form.puesto) || null;
  }, [puestosItems, form.puesto]);

  const title = isCreate ? "Nuevo empleado" : `Empleado ${legajoParam}`;

  async function load() {
    if (isCreate) return;
    if (!legajoParam) return;
    try {
      setError("");
      setNotice("");
      setLoading(true);
      const data = await getEmpleado(legajoParam);
      const emp = { ...emptyEmpleado(), ...(data || {}) };

      // normalizar sector a valores de UI
      const uiSector = sectorApiToUi(emp.sector);
      if (uiSector) emp.sector = uiSector;
      if (!emp.sector) emp.sector = "playa";

      // básico puede venir numérico
      if (
        emp.basico !== null &&
        emp.basico !== undefined &&
        emp.basico !== ""
      ) {
        emp.basico = String(emp.basico);
      }

      emp.familiares = Array.isArray(emp.familiares)
        ? emp.familiares.map((f) => ({
            ...emptyFamiliar(),
            ...f,
            part_mat_nac: f.part_mat_nac ? 1 : 0,
          }))
        : [];

      setForm(emp);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error cargando empleado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legajoParam, isCreate]);

  const disabled = !isAdmin;

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setFamiliar(idx, key, value) {
    setForm((prev) => {
      const fam = [...(prev.familiares || [])];
      fam[idx] = { ...(fam[idx] || emptyFamiliar()), [key]: value };
      return { ...prev, familiares: fam };
    });
  }

  function addFamiliar() {
    setForm((prev) => ({
      ...prev,
      familiares: [...(prev.familiares || []), emptyFamiliar()],
    }));
  }

  function removeFamiliar(idx) {
    setForm((prev) => {
      const fam = [...(prev.familiares || [])];
      fam.splice(idx, 1);
      return { ...prev, familiares: fam };
    });
  }

  const payloadBase = useMemo(() => {
    const puesto = String(form.puesto || "").trim();
    const categoria = String(form.categoria || "").trim();
    return {
      legajo: String(form.legajo || "").trim(),
      nombre: String(form.nombre || "").trim(),
      sector: sectorUiToApi(form.sector) || "",
      puesto, // fundamental
      categoria: categoria || puesto, // compat: si no usan categoría separada
      fecha_ingreso: String(form.fecha_ingreso || "").trim(),
    };
  }, [form]);

  const payloadExtras = useMemo(() => {
    const puesto = String(form.puesto || "").trim();
    const categoria = String(form.categoria || "").trim() || puesto;

    return {
      nombre: String(form.nombre || "").trim(),
      sector: sectorUiToApi(form.sector) || "",
      puesto,
      categoria,
      activo: Number(form.activo) ? 1 : 0,

      // personales
      domicilio: String(form.domicilio || "").trim(),
      localidad: String(form.localidad || "").trim(),
      cuil: String(form.cuil || "").trim(),
      dni: String(form.dni || "").trim(),
      estudios: String(form.estudios || "").trim(),
      estado_civil: String(form.estado_civil || "").trim(),
      fecha_nacimiento: String(form.fecha_nacimiento || "").trim(),
      telefono_fijo: String(form.telefono_fijo || "").trim(),
      telefono_celular: String(form.telefono_celular || "").trim(),
      email: String(form.email || "").trim(),
      nacionalidad: String(form.nacionalidad || "").trim(),
      gremio: String(form.gremio || "").trim(),
      basico: normalizeBasicoToNumber(form.basico),
      es_jubilado: form.es_jubilado ? 1 : 0,

      // laborales
      fecha_ingreso: String(form.fecha_ingreso || "").trim(),
      lugar_trabajo: String(form.lugar_trabajo || "").trim(),
      obra_social: String(form.obra_social || "").trim(),
      cbu: String(form.cbu || "").trim(),
      banco: String(form.banco || "").trim(),
      talle_pantalon: String(form.talle_pantalon || "").trim(),
      talle_camisa: String(form.talle_camisa || "").trim(),
      numero_botines: String(form.numero_botines || "").trim(),
    };
  }, [form]);

  const familiaresPayload = useMemo(() => {
    const fam = Array.isArray(form.familiares) ? form.familiares : [];
    return fam
      .map((f) => ({
        parentesco: String(f.parentesco || "").trim(),
        nombre: String(f.nombre || "").trim(),
        cuil: String(f.cuil || "").trim(),
        fecha_nac: String(f.fecha_nac || "").trim(),
        part_mat_nac: f.part_mat_nac ? 1 : 0,
        tomo: String(f.tomo || "").trim(),
        acta: String(f.acta || "").trim(),
        folio: String(f.folio || "").trim(),
      }))
      .filter(
        (f) =>
          f.parentesco ||
          f.nombre ||
          f.cuil ||
          f.fecha_nac ||
          f.tomo ||
          f.acta ||
          f.folio,
      );
  }, [form.familiares]);

  function validate() {
    const L = String(form.legajo || "").trim();
    const N = String(form.nombre || "").trim();
    if (!L) return "Falta legajo";
    if (!N) return "Falta nombre";

    const P = String(form.puesto || "").trim();
    if (!P) return "Falta puesto";

    const fi = String(form.fecha_ingreso || "").trim();
    if (fi && !/^\d{4}-\d{2}-\d{2}$/.test(fi))
      return "Fecha de ingreso inválida (YYYY-MM-DD)";

    const fn = String(form.fecha_nacimiento || "").trim();
    if (fn && !/^\d{4}-\d{2}-\d{2}$/.test(fn))
      return "Fecha de nacimiento inválida (YYYY-MM-DD)";

    const email = String(form.email || "").trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return "Email inválido";

    const cbu = String(form.cbu || "").trim();
    if (cbu && !/^\d{22}$/.test(cbu))
      return "CBU inválido (debe tener 22 dígitos)";

    const bas = normalizeBasicoToNumber(form.basico);
    if (
      form.basico !== "" &&
      form.basico !== null &&
      form.basico !== undefined &&
      bas === null
    )
      return "Básico inválido";

    return "";
  }

  async function onSave() {
    if (!isAdmin) return;
    if (saving) return;

    const v = validate();
    if (v) {
      setError(`⚠️ ${v}`);
      return;
    }

    try {
      setError("");
      setNotice("");
      setSaving(true);

      const legajo = String(form.legajo || "").trim();

      if (isCreate) {
        await createEmpleadoBase(payloadBase);
      }

      await patchEmpleado(legajo, payloadExtras);
      await replaceFamiliares(legajo, familiaresPayload);

      setNotice("✅ Guardado");
      if (isCreate) {
        nav(`/empleados/${encodeURIComponent(legajo)}`, { replace: true });
      } else {
        await load();
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="muted">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Ficha completa (planilla ingreso): personales, laborales y
            familiares.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <a className="btn" href={legacyEmpleadosUrl()}>
            Abrir legacy
          </a>
          <Link className="btn" to="/empleados">
            Volver
          </Link>
          {isAdmin ? (
            <button className="btn primary" onClick={onSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          ) : (
            <span className="badge">Solo lectura</span>
          )}
        </div>
      </div>

      {error ? (
        <div
          className="card"
          style={{ marginTop: 12, borderColor: "rgba(239,68,68,0.35)" }}
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          className="card"
          style={{ marginTop: 12, borderColor: "rgba(59,130,246,0.35)" }}
        >
          {notice}
        </div>
      ) : null}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button
          className="btn"
          onClick={() => setTab("personales")}
          style={{ opacity: tab === "personales" ? 1 : 0.7 }}
        >
          Datos personales
        </button>
        <button
          className="btn"
          onClick={() => setTab("laborales")}
          style={{ opacity: tab === "laborales" ? 1 : 0.7 }}
        >
          Datos laborales
        </button>
        <button
          className="btn"
          onClick={() => setTab("familia")}
          style={{ opacity: tab === "familia" ? 1 : 0.7 }}
        >
          Datos familiares
        </button>
      </div>

      {/* Form */}
      <div className="row" style={{ marginTop: 12 }}>
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Identificación</h3>
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Campos base para compatibilidad.
          </div>

          <div className="row" style={{ gap: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "180px minmax(300px,1fr)",
                gap: 16,
                alignItems: "end",
                width: "100%",
              }}
            >
              <Field
                label="Legajo"
                hint={isCreate ? "obligatorio" : "no editable"}
              >
                <input
                  value={form.legajo ?? ""}
                  onChange={(e) => setField("legajo", e.target.value)}
                  disabled={!isCreate || disabled}
                  placeholder="Ej: 123"
                  style={{ width: "100%" }}
                />
              </Field>

              <Field label="Nombre y Apellido" hint="obligatorio">
                <input
                  value={form.nombre ?? ""}
                  onChange={(e) => setField("nombre", e.target.value)}
                  disabled={disabled}
                  style={{ width: "100%" }}
                />
              </Field>
            </div>
          </div>

          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Field label="Sector">
                <select
                  value={form.sector ?? "playa"}
                  onChange={(e) => {
                    setField("sector", e.target.value);
                    setField("puesto", "");
                    // opcional:
                    setField("categoria", "");
                  }}
                  disabled={disabled}
                >
                  {SECTORES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <Field label="Puesto" hint={puestosLoading ? "Cargando..." : ""}>
                <select
                  value={form.puesto ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setField("puesto", v);
                    setField(
                      "categoria",
                      (form.categoria || "").trim() ? form.categoria : v,
                    );
                  }}
                  disabled={
                    disabled || puestosLoading || !sectorUiToApi(form.sector)
                  }
                  style={{ width: "100%" }}
                >
                  <option value="">
                    {sectorUiToApi(form.sector)
                      ? "Seleccionar puesto..."
                      : "Elegí un sector primero"}
                  </option>

                  {puestosItems.map((p) => (
                    <option key={p.puesto} value={p.puesto}>
                      {p.puesto}
                    </option>
                  ))}
                </select>

                {puestoSel ? (
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Horarios:{" "}
                    {[
                      puestoSel.manana && `Mañana ${puestoSel.manana}`,
                      puestoSel.tarde && `Tarde ${puestoSel.tarde}`,
                      puestoSel.noche && `Noche ${puestoSel.noche}`,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </div>
                ) : null}

                {puestosError ? (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    No se pudieron cargar los puestos: {puestosError}
                  </div>
                ) : null}
              </Field>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <Field label="Categoría" hint="opcional (si la usan aparte)">
                <input
                  value={form.categoria ?? ""}
                  onChange={(e) => setField("categoria", e.target.value)}
                  disabled={disabled}
                  placeholder="Ej: convenio / escala"
                />
              </Field>
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <Field
                label="Fecha de ingreso"
                hint={isCreate ? "recomendado" : ""}
              >
                <input
                  type="date"
                  value={form.fecha_ingreso || ""}
                  onChange={(e) => setField("fecha_ingreso", e.target.value)}
                  disabled={disabled}
                  max={todayISO()}
                />
              </Field>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 6,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={!!Number(form.activo)}
                onChange={(e) => setField("activo", e.target.checked ? 1 : 0)}
                disabled={disabled}
              />
              <span>Activo</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={!!Number(form.es_jubilado)}
                onChange={(e) =>
                  setField("es_jubilado", e.target.checked ? 1 : 0)
                }
                disabled={disabled}
              />
              <span>Es jubilado</span>
            </label>
          </div>
        </div>

        {/* Tab body */}
        <div className="card" style={{ flex: 2, minWidth: 340 }}>
          {tab === "personales" ? (
            <>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>
                Datos personales
              </h3>

              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <Field label="CUIL">
                    <input
                      value={form.cuil ?? ""}
                      onChange={(e) => setField("cuil", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <Field label="DNI">
                    <input
                      value={form.dni ?? ""}
                      onChange={(e) => setField("dni", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <Field label="Fecha de nacimiento">
                    <input
                      type="date"
                      value={form.fecha_nacimiento || ""}
                      onChange={(e) =>
                        setField("fecha_nacimiento", e.target.value)
                      }
                      disabled={disabled}
                      max={todayISO()}
                    />
                  </Field>
                </div>
              </div>

              <Field label="Domicilio">
                <input
                  value={form.domicilio ?? ""}
                  onChange={(e) => setField("domicilio", e.target.value)}
                  disabled={disabled}
                />
              </Field>

              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Field label="Localidad">
                    <input
                      value={form.localidad ?? ""}
                      onChange={(e) => setField("localidad", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Field label="Nacionalidad">
                    <input
                      value={form.nacionalidad ?? ""}
                      onChange={(e) => setField("nacionalidad", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </div>

              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <Field label="Estado civil">
                    <input
                      value={form.estado_civil ?? ""}
                      onChange={(e) => setField("estado_civil", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <Field label="Estudios">
                    <input
                      value={form.estudios ?? ""}
                      onChange={(e) => setField("estudios", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </div>

              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Field label="Teléfono fijo">
                    <input
                      value={form.telefono_fijo ?? ""}
                      onChange={(e) =>
                        setField("telefono_fijo", e.target.value)
                      }
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Field label="Teléfono celular">
                    <input
                      value={form.telefono_celular ?? ""}
                      onChange={(e) =>
                        setField("telefono_celular", e.target.value)
                      }
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </div>

              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 2, minWidth: 260 }}>
                  <Field label="Email" hint="validación básica">
                    <input
                      value={form.email ?? ""}
                      onChange={(e) => setField("email", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <Field label="Gremio">
                    <input
                      value={form.gremio ?? ""}
                      onChange={(e) => setField("gremio", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <Field label="Básico" hint="$">
                    <input
                      value={form.basico ?? ""}
                      onChange={(e) => setField("basico", e.target.value)}
                      disabled={disabled}
                      placeholder="0"
                    />
                  </Field>
                </div>
              </div>
            </>
          ) : null}

          {tab === "laborales" ? (
            <>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>Datos laborales</h3>

              <Field label="Lugar de trabajo (dirección)">
                <input
                  value={form.lugar_trabajo ?? ""}
                  onChange={(e) => setField("lugar_trabajo", e.target.value)}
                  disabled={disabled}
                  placeholder="Ej: Av. San Martín 453 Bis"
                />
              </Field>

              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 2, minWidth: 260 }}>
                  <Field
                    label="Obra social"
                    hint="si tenía una anterior, detallar"
                  >
                    <input
                      value={form.obra_social ?? ""}
                      onChange={(e) => setField("obra_social", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 2, minWidth: 260 }}>
                  <Field label="CBU - Cuenta sueldos" hint="22 dígitos">
                    <input
                      value={form.cbu ?? ""}
                      onChange={(e) => setField("cbu", e.target.value)}
                      disabled={disabled}
                      inputMode="numeric"
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <Field label="Banco">
                    <input
                      value={form.banco ?? ""}
                      onChange={(e) => setField("banco", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </div>

              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Field label="Talle pantalón">
                    <input
                      value={form.talle_pantalon ?? ""}
                      onChange={(e) =>
                        setField("talle_pantalon", e.target.value)
                      }
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Field label="Talle camisa">
                    <input
                      value={form.talle_camisa ?? ""}
                      onChange={(e) => setField("talle_camisa", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Field label="Número botines">
                    <input
                      value={form.numero_botines ?? ""}
                      onChange={(e) =>
                        setField("numero_botines", e.target.value)
                      }
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </div>
            </>
          ) : null}

          {tab === "familia" ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 6 }}>
                    Datos familiares
                  </h3>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Parentesco, CUIL, fecha nac y documentación
                    (tomo/acta/folio).
                  </div>
                </div>
                {isAdmin ? (
                  <button
                    className="btn"
                    onClick={addFamiliar}
                    disabled={disabled}
                  >
                    + Agregar familiar
                  </button>
                ) : null}
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Parentesco</th>
                    <th>Nombre y Apellido</th>
                    <th>CUIL</th>
                    <th>Fecha Nac</th>
                    <th>Part. Mat/Nac</th>
                    <th>Tomo</th>
                    <th>Acta</th>
                    <th>Folio</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(form.familiares || []).length ? (
                    (form.familiares || []).map((f, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            value={f.parentesco || ""}
                            onChange={(e) =>
                              setFamiliar(idx, "parentesco", e.target.value)
                            }
                            disabled={disabled}
                            style={{ width: 140 }}
                          />
                        </td>
                        <td>
                          <input
                            value={f.nombre || ""}
                            onChange={(e) =>
                              setFamiliar(idx, "nombre", e.target.value)
                            }
                            disabled={disabled}
                            style={{ width: 240 }}
                          />
                        </td>
                        <td>
                          <input
                            value={f.cuil || ""}
                            onChange={(e) =>
                              setFamiliar(idx, "cuil", e.target.value)
                            }
                            disabled={disabled}
                            style={{ width: 170 }}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={f.fecha_nac || ""}
                            onChange={(e) =>
                              setFamiliar(idx, "fecha_nac", e.target.value)
                            }
                            disabled={disabled}
                            max={todayISO()}
                            style={{ width: 150 }}
                          />
                        </td>
                        <td>
                          <select
                            value={Number(f.part_mat_nac) ? "1" : "0"}
                            onChange={(e) =>
                              setFamiliar(
                                idx,
                                "part_mat_nac",
                                e.target.value === "1" ? 1 : 0,
                              )
                            }
                            disabled={disabled}
                            style={{ width: 110 }}
                          >
                            <option value="0">No</option>
                            <option value="1">Sí</option>
                          </select>
                        </td>
                        <td>
                          <input
                            value={f.tomo || ""}
                            onChange={(e) =>
                              setFamiliar(idx, "tomo", e.target.value)
                            }
                            disabled={disabled}
                            style={{ width: 90 }}
                          />
                        </td>
                        <td>
                          <input
                            value={f.acta || ""}
                            onChange={(e) =>
                              setFamiliar(idx, "acta", e.target.value)
                            }
                            disabled={disabled}
                            style={{ width: 90 }}
                          />
                        </td>
                        <td>
                          <input
                            value={f.folio || ""}
                            onChange={(e) =>
                              setFamiliar(idx, "folio", e.target.value)
                            }
                            disabled={disabled}
                            style={{ width: 90 }}
                          />
                        </td>
                        <td>
                          {isAdmin ? (
                            <button
                              className="btn danger"
                              onClick={() => removeFamiliar(idx)}
                              disabled={disabled}
                            >
                              Quitar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="muted">
                        Sin familiares cargados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Nota: para compatibilidad, el alta se hace con POST base y luego se
        completa con PATCH + familiares.
      </div>
    </div>
  );
}
