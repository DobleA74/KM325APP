/* public/sortable.js
   Tabla ordenable por <th class="sortable" data-order="campo">
   Uso:
     window.makeSortableTable(
        tableEl,
        rowsArray,
        (row, key) => row[key],
        (sortedRows) => { rowsArray = sortedRows; render(); },
        "fecha_entrada",
        "desc"
     );
*/

(function () {
  function isISODate(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }
  function isHHMM(s) {
    return typeof s === "string" && /^(\d{1,2}):(\d{2})$/.test(s);
  }
  function hhmmToMin(s) {
    const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
  function toNumberMaybe(v) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const s = String(v ?? "").trim();
    if (!s) return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  function toComparable(v) {
    if (v == null) return null;

    if (typeof v === "number" && Number.isFinite(v)) return v;

    const s = String(v).trim();
    if (!s) return null;

    // ISO date
    if (isISODate(s)) {
      const t = Date.parse(s);
      return Number.isFinite(t) ? t : s;
    }

    // time
    if (isHHMM(s)) {
      const mins = hhmmToMin(s);
      return mins == null ? s : mins;
    }

    // numeric string
    const n = toNumberMaybe(s);
    if (n != null) return n;

    return s;
  }
  function cmp(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;

    if (typeof a === "number" && typeof b === "number") return a - b;

    return String(a).localeCompare(String(b), "es", {
      sensitivity: "base",
      numeric: true,
    });
  }

  window.makeSortableTable = function (
    tableEl,
    rowsArray,
    valueGetter,
    onSorted,
    defaultKey = null,
    defaultDir = "asc"
  ) {
    if (!tableEl) return;

    let state = {
      key: defaultKey,
      dir: defaultDir === "desc" ? "desc" : "asc",
    };

    function sortNow(key) {
      if (!key) return;

      if (state.key === key) state.dir = state.dir === "asc" ? "desc" : "asc";
      else {
        state.key = key;
        state.dir = "asc";
      }

      const mult = state.dir === "asc" ? 1 : -1;

      // ordenamos IN PLACE para no desincronizar referencias
      rowsArray.sort((ra, rb) => {
        const va = toComparable(valueGetter(ra, state.key));
        const vb = toComparable(valueGetter(rb, state.key));
        const c = cmp(va, vb);
        if (c !== 0) return c * mult;

        // desempate estable por id si existe
        const ida = toComparable(ra.id ?? ra.legajo ?? "");
        const idb = toComparable(rb.id ?? rb.legajo ?? "");
        return cmp(ida, idb);
      });

      onSorted(rowsArray);
      paintHeaders();
    }

    function paintHeaders() {
      tableEl.querySelectorAll("th.sortable").forEach((th) => {
        const k = th.dataset.order;
        if (!k) return;
        th.setAttribute("data-dir", state.key === k ? state.dir : "");
      });
    }

    tableEl.querySelectorAll("th.sortable").forEach((th) => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => sortNow(th.dataset.order));
    });

    // ordenar inicial si hay defaultKey
    if (state.key) sortNow(state.key);
    else paintHeaders();
  };
})();

