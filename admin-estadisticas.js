// PORTAL ZWEITE · Estadísticas del Panel Administrador · v1.0
// Se carga después de admin-panel.js. Agrega la pestaña "Estadísticas" (partes y guardias).
// Todos los datos llegan con una sola función SQL (pd_admin_stats_datos) y se filtran/agregan en el navegador.
(function () {
  'use strict';

  // ───────── Constantes ─────────
  var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  var FRANJAS = [['00–06',0,6],['06–12',6,12],['12–18',12,18],['18–24',18,24]];
  var CATS = { activos:'Activos', honorarios:'Honorarios', confederados:'Confederados (canje)', aspirantes:'Aspirantes' };
  var CAT_COL = { activos:'--s1', honorarios:'--s7', confederados:'--s2', aspirantes:'--s3' };
  var MAQS = ['B-2','HX-2','H-2'];
  var MAQ_COL = { 'B-2':'--s1', 'HX-2':'--s5', 'H-2':'--s6' };
  var GT_COL = { Diurna:'--s4', Nocturna:'--s7' };
  // Descripción opcional de cada código de acto (se muestra junto al código). Ej: { '10-0-2': 'Incendio estructural' }
  var ACTOS_DESC = {};

  var ES = {
    datos: null, F: null, sub: 'resumen', actoNivel: 'detalle',
    topMetrica: 'partes', topCat: 'todas', genCat: 'todas', persona: '',
    f: { rapido: 'todo', desde: '', hasta: '', pruebas: 'reales', origen: 'todos', acto: '', maq: '', gt: '', gran: 'auto' }
  };
  var TB = {};

  // ───────── Utilidades ─────────
  function esc(s) { return escapeHtml(String(s == null ? '' : s)); }
  function nf(n, d) { return Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: d == null ? 1 : d }); }
  function pct(a, b) { return b ? (a / b * 100) : 0; }
  function sum(arr, fn) { var s = 0; for (var i = 0; i < arr.length; i++) s += fn(arr[i]); return s; }
  function avg(arr) { return arr.length ? sum(arr, function (x) { return x; }) / arr.length : 0; }
  function fecha(f) { return f ? formatearFecha(f) : '—'; }
  function hoyISO() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); }
  function sumDias(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function normActo(t) {
    var s = String(t || '').trim().replace(/[–—]/g, '-');
    if (!s) return 'Sin especificar';
    if (/^citaci[oó]n$/i.test(s)) return 'Citación';
    var m = s.match(/^(\d+(?:-\d+)*)/);
    if (m) return m[1];
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  function famActo(a) { var m = a.match(/^(\d+-\d+)/); return m ? m[1] : a; }
  function lblActo(a) { return ACTOS_DESC[a] ? a + ' · ' + ACTOS_DESC[a] : a; }
  function esCodigo(a) { return /^\d/.test(a); }
  function durMin(a, b) {
    if (!a || !b) return null;
    var x = +a.slice(0, 2) * 60 + +a.slice(3, 5), y = +b.slice(0, 2) * 60 + +b.slice(3, 5), d = y - x;
    if (d < 0) d += 1440;
    return d > 0 && d <= 720 ? d : null;
  }
  function fmtDur(m) { return m ? (m >= 60 ? Math.floor(m / 60) + ' h ' + Math.round(m % 60) + ' min' : Math.round(m) + ' min') : '—'; }
  function dowDe(f) { return (new Date(f + 'T00:00:00Z').getUTCDay() + 6) % 7; }
  function topN(map, n) { return Array.from(map.entries()).sort(function (a, b) { return b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'); }).slice(0, n); }
  function inc(map, k, v) { map.set(k, (map.get(k) || 0) + (v == null ? 1 : v)); }

  // ───────── Preparación de datos ─────────
  function prep(d) {
    var P = {};
    d.personas.forEach(function (r) { P[r[0]] = { n: r[1], cat: r[2], lista: r[3], perm: r[4] }; });
    d.P = P;
    d.partes.forEach(function (p) {
      p.acto = normActo(p.t); p.fam = famActo(p.acto);
      p.dow = p.f ? dowDe(p.f) : null;
      p.h = p.hi ? parseInt(p.hi.slice(0, 2), 10) : null;
      p.dur = durMin(p.hi, p.ht);
      p.mq = Array.from(new Set(p.m || [])); p.nm = p.mq.length;
      var seen = {}; p.as = [];
      (p.a || []).forEach(function (r) { if (!seen[r[0]]) { seen[r[0]] = 1; p.as.push([r[0], r[1] || (P[r[0]] && P[r[0]].cat) || 'activos']); } });
      p.na = p.as.length;
    });
    d.guardias.forEach(function (g) { g.dow = dowDe(g.f); });
    var cuenta = {};
    d.partes.forEach(function (p) { cuenta[p.acto] = (cuenta[p.acto] || 0) + 1; });
    d.actos = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; }).map(function (a) { return [a, cuenta[a]]; });
    d.anios = Array.from(new Set(d.partes.concat(d.guardias).map(function (x) { return x.f ? x.f.slice(0, 4) : null; }).filter(Boolean))).sort();
  }

  // ───────── Filtros ─────────
  function filtrar() {
    var f = ES.f, d = ES.datos;
    function ok(x) { return x && (!f.desde || x >= f.desde) && (!f.hasta || x <= f.hasta); }
    var partes = d.partes.filter(function (p) {
      return ok(p.f) && (f.pruebas === 'todas' || (f.pruebas === 'pruebas') === !!p.p) &&
        (f.origen === 'todos' || (f.origen === 'excel') === !!p.x) &&
        (!f.acto || p.acto === f.acto) && (!f.maq || p.mq.indexOf(f.maq) >= 0);
    });
    var guardias = d.guardias.filter(function (g) {
      return ok(g.f) && (!f.gt || g.t === f.gt) && (f.origen === 'todos' || (f.origen === 'excel') === !!g.x);
    });
    return { partes: partes, guardias: guardias };
  }

  // Cubetas de tiempo (día / semana / mes)
  function cubetas(F) {
    var fechas = F.partes.map(function (p) { return p.f; }).concat(F.guardias.map(function (g) { return g.f; })).sort();
    if (!fechas.length) return { keys: [], labels: [], idx: {}, keyOf: function () { return null; }, gran: 'mes' };
    var ini = fechas[0], fin = fechas[fechas.length - 1];
    var span = (new Date(fin) - new Date(ini)) / 864e5 + 1, gran = ES.f.gran;
    if (gran === 'auto') gran = span <= 45 ? 'dia' : span <= 180 ? 'semana' : 'mes';
    function keyOf(s) {
      if (gran === 'mes') return s.slice(0, 7);
      if (gran === 'dia') return s;
      return sumDias(s, -dowDe(s));
    }
    var keys = [], idx = {}, cur = ini, guard = 0;
    while (cur <= fin && guard++ < 4000) { var k = keyOf(cur); if (!(k in idx)) { idx[k] = keys.length; keys.push(k); } cur = sumDias(cur, 1); }
    var labels = keys.map(function (k) {
      if (gran === 'mes') return MESES[+k.slice(5, 7) - 1] + ' ' + k.slice(2, 4);
      return k.slice(8, 10) + '/' + k.slice(5, 7);
    });
    return { keys: keys, labels: labels, idx: idx, keyOf: keyOf, gran: gran };
  }
  function vec(bk, items, fn) {
    var v = bk.keys.map(function () { return 0; });
    items.forEach(function (it) { var i = bk.idx[bk.keyOf(it.f)]; if (i != null) v[i] += fn ? fn(it) : 1; });
    return v;
  }
  function granTxt(bk) { return bk.gran === 'mes' ? 'por mes' : bk.gran === 'semana' ? 'por semana (inicio lunes)' : 'por día'; }

  // ───────── Agregados por persona ─────────
  function personasPartes(F, cat) {
    var m = new Map();
    F.partes.forEach(function (p) {
      p.as.forEach(function (a) {
        if (cat && a[1] !== cat) return;
        var o = m.get(a[0]);
        if (!o) { o = { c: a[0], partes: 0, pri: null, ult: null, actos: new Map(), maq: new Map(), dow: [0,0,0,0,0,0,0] }; m.set(a[0], o); }
        o.partes++; if (!o.pri || p.f < o.pri) o.pri = p.f; if (!o.ult || p.f > o.ult) o.ult = p.f;
        inc(o.actos, p.acto); p.mq.forEach(function (q) { inc(o.maq, q); }); if (p.dow != null) o.dow[p.dow]++;
      });
    });
    return m;
  }
  function personasGuardias(F) {
    var m = new Map();
    F.guardias.forEach(function (g) {
      g.i.forEach(function (r) {
        var o = m.get(r[0]);
        if (!o) { o = { c: r[0], gd: 0, gn: 0, just: 0, falla: 0, apoyo: 0, jefe: 0, cond: 0 }; m.set(r[0], o); }
        if (r[1]) { if (g.t === 'Diurna') o.gd++; else o.gn++; if (r[3]) o.jefe++; if (r[4]) o.cond++; }
        else if (r[2] === 'Justificado') o.just++;
        else if (r[2] === 'Falla') o.falla++;
        else o.apoyo++;
      });
    });
    return m;
  }
  function nombre(c) { var p = ES.datos.P[c]; return String((p && p.n) || (c != null ? c : '(sin nombre)')); }
  function catDe(c, fb) { var p = ES.datos.P[c]; return (p && p.cat) || fb || ''; }

  // ───────── Escalas ─────────
  function escala(max) {
    if (!(max > 0)) max = 1;
    var raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
    var s = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p, n = Math.max(1, Math.ceil(max / s - 1e-9));
    return { mx: n * s, n: n, step: s };
  }

  // ───────── Componentes gráficos ─────────
  function leyenda(series) {
    if (series.length < 2) return '';
    return '<div class="es-leg">' + series.map(function (s) { return '<span><i style="background:var(' + s.c + ')"></i>' + esc(s.n) + '</span>'; }).join('') + '</div>';
  }
  function columnas(labels, series, o) {
    o = o || {};
    if (!labels.length) return '<p class="nota">Sin datos para graficar.</p>';
    var W = 720, H = o.h || 240, m = { l: 40, r: 8, t: 14, b: 28 }, n = labels.length;
    var stacked = o.stacked !== false && series.length > 1;
    var tot = labels.map(function (_, i) { return stacked ? sum(series, function (s) { return s.v[i] || 0; }) : Math.max.apply(null, series.map(function (s) { return s.v[i] || 0; })); });
    var sc = escala(Math.max.apply(null, tot).valueOf()), iw = W - m.l - m.r, ih = H - m.t - m.b, bw = iw / n;
    var bar = Math.max(2, Math.min(30, bw * 0.72)), g = '', k, i;
    for (k = 0; k <= sc.n; k++) {
      var y = m.t + ih - ih * k / sc.n;
      g += '<line class="es-gl" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '"/><text class="es-tk" x="' + (m.l - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + nf(sc.step * k) + '</text>';
    }
    var stepL = Math.ceil(n / 16);
    for (i = 0; i < n; i++) {
      var cx = m.l + bw * i + bw / 2, acc = 0;
      if (stacked) {
        series.forEach(function (s) {
          var v = s.v[i] || 0; if (!v) return;
          var h = ih * v / sc.mx, yy = m.t + ih - ih * acc / sc.mx - h; acc += v;
          g += '<rect class="es-bar" x="' + (cx - bar / 2) + '" y="' + yy + '" width="' + bar + '" height="' + Math.max(h, 1) + '" rx="2" fill="var(' + s.c + ')"/>';
        });
      } else {
        var gw = bar / series.length;
        series.forEach(function (s, j) {
          var v = s.v[i] || 0; if (!v) return;
          var h = ih * v / sc.mx;
          g += '<rect class="es-bar" x="' + (cx - bar / 2 + gw * j) + '" y="' + (m.t + ih - h) + '" width="' + Math.max(gw - 1, 1) + '" height="' + h + '" rx="2" fill="var(' + s.c + ')"/>';
        });
      }
      if (n <= 18 && tot[i]) g += '<text class="es-vl" x="' + cx + '" y="' + (m.t + ih - ih * tot[i] / sc.mx - 4) + '" text-anchor="middle">' + nf(tot[i]) + '</text>';
      if (i % stepL === 0) g += '<text class="es-tk" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
      var tip = labels[i] + (series.length > 1 ? ' — ' + series.map(function (s) { return s.n + ': ' + nf(s.v[i] || 0); }).join(' · ') + (stacked ? ' · Total: ' + nf(tot[i]) : '') : ': ' + nf(tot[i]));
      g += '<rect class="es-hit" x="' + (m.l + bw * i) + '" y="' + m.t + '" width="' + bw + '" height="' + ih + '"><title>' + esc(tip) + '</title></rect>';
    }
    return '<div class="es-chart">' + leyenda(series) + '<svg class="es-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || 'Gráfico de columnas') + '">' + g + '</svg></div>';
  }
  function lineas(labels, series, o) {
    o = o || {};
    if (!labels.length) return '<p class="nota">Sin datos para graficar.</p>';
    var W = 720, H = o.h || 220, m = { l: 40, r: 10, t: 12, b: 28 }, n = labels.length;
    var maxV = o.max != null ? o.max : Math.max.apply(null, series.map(function (s) { return Math.max.apply(null, s.v.map(function (x) { return x || 0; })); }));
    var sc = escala(maxV), iw = W - m.l - m.r, ih = H - m.t - m.b, g = '', k, i;
    function X(i) { return n === 1 ? m.l + iw / 2 : m.l + iw * i / (n - 1); }
    function Y(v) { return m.t + ih - ih * v / sc.mx; }
    for (k = 0; k <= sc.n; k++) {
      var y = m.t + ih - ih * k / sc.n;
      g += '<line class="es-gl" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '"/><text class="es-tk" x="' + (m.l - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + nf(sc.step * k) + (o.sufijo || '') + '</text>';
    }
    var stepL = Math.ceil(n / 14);
    for (i = 0; i < n; i += stepL) g += '<text class="es-tk" x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
    series.forEach(function (s) {
      var pts = [], seg = [];
      s.v.forEach(function (v, i) { if (v == null) { if (seg.length) pts.push(seg); seg = []; } else seg.push([X(i), Y(v)]); });
      if (seg.length) pts.push(seg);
      pts.forEach(function (sg) {
        if (sg.length > 1) g += '<polyline class="es-ln" fill="none" stroke="var(' + s.c + ')" points="' + sg.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '"/>';
        if (n <= 40) sg.forEach(function (p) { g += '<circle class="es-pt" cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="var(' + s.c + ')"/>'; });
      });
    });
    for (i = 0; i < n; i++) {
      var tip = labels[i] + ' — ' + series.map(function (s) { return s.n + ': ' + (s.v[i] == null ? '—' : nf(s.v[i]) + (o.sufijo || '')); }).join(' · ');
      g += '<rect class="es-hit" x="' + (X(i) - iw / n / 2) + '" y="' + m.t + '" width="' + (iw / n) + '" height="' + ih + '"><title>' + esc(tip) + '</title></rect>';
    }
    return '<div class="es-chart">' + leyenda(series) + '<svg class="es-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || 'Gráfico de líneas') + '">' + g + '</svg></div>';
  }
  function dona(items, o) {
    o = o || {};
    var tot = sum(items, function (i) { return i.v; });
    if (!tot) return '<p class="nota">Sin datos.</p>';
    var R = 56, C = 2 * Math.PI * R, off = 0, seg = '';
    items.forEach(function (it) {
      if (!it.v) return;
      var len = C * it.v / tot, gap = items.length > 1 ? 2 : 0;
      seg += '<circle class="es-dn" r="' + R + '" cx="80" cy="80" fill="none" stroke="var(' + it.c + ')" stroke-width="26" stroke-dasharray="' + Math.max(len - gap, 0.5) + ' ' + (C - Math.max(len - gap, 0.5)) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 80 80)"><title>' + esc(it.label + ': ' + nf(it.v) + ' (' + nf(pct(it.v, tot)) + '%)') + '</title></circle>';
      off += len;
    });
    var leg = items.filter(function (i) { return i.v; }).map(function (it) {
      return '<li><i style="background:var(' + it.c + ')"></i><span>' + esc(it.label) + '</span><b>' + nf(it.v) + '</b><em>' + nf(pct(it.v, tot)) + '%</em></li>';
    }).join('');
    return '<div class="es-donut"><svg viewBox="0 0 160 160" role="img" aria-label="' + esc(o.aria || 'Gráfico circular') + '">' + seg + '<text x="80" y="78" text-anchor="middle" class="es-dn-n">' + nf(tot) + '</text><text x="80" y="95" text-anchor="middle" class="es-tk">' + esc(o.centro || 'total') + '</text></svg><ul>' + leg + '</ul></div>';
  }
  function barrasH(items, o) {
    o = o || {};
    if (!items.length) return '<p class="nota">Sin datos.</p>';
    var mx = Math.max.apply(null, items.map(function (i) { return i.v; })) || 1;
    return '<div class="es-bh">' + items.map(function (i) {
      return '<div class="es-bh-r" title="' + esc(i.tip || (i.label + ': ' + nf(i.v))) + '"><span class="es-bh-l">' + (i.pre || '') + esc(i.label) + '</span><span class="es-bh-t"><span class="es-bh-b" style="width:' + (i.v / mx * 100).toFixed(1) + '%;background:var(' + (i.c || o.c || '--s1') + ')"></span></span><span class="es-bh-v">' + esc(i.txt != null ? i.txt : nf(i.v)) + '</span></div>';
    }).join('') + '</div>';
  }
  function heat(rows, cols, M, o) {
    o = o || {};
    var mx = 1; M.forEach(function (r) { r.forEach(function (v) { if (v > mx) mx = v; }); });
    return '<div class="es-heat-w"><table class="es-heat"><thead><tr><th></th>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr><th>' + esc(r) + '</th>' + M[i].map(function (v, j) {
          var q = v / mx;
          return '<td title="' + esc(r + ' · ' + cols[j] + ': ' + nf(v)) + '" style="background:color-mix(in srgb,var(' + (o.c || '--s1') + ') ' + Math.round(q * 78) + '%,transparent);' + (q > 0.55 ? 'color:#fff;' : '') + '">' + (v ? nf(v) : '') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ───────── Tabla con orden, búsqueda y CSV ─────────
  function tabla(id, cols, rows, o) {
    o = o || {};
    TB[id] = { cols: cols, rows: rows, sort: o.sort || null, dir: o.dir || -1, lim: o.lim || 15, all: false, q: '', csv: o.csv || id };
    return '<div class="es-tb"><div class="es-tb-bar"><input type="search" placeholder="Buscar en la tabla..." oninput="esBuscarTabla(\'' + id + '\',this.value)" aria-label="Buscar en la tabla"><button type="button" class="btn-texto" onclick="esCsv(\'' + id + '\')">⬇ Descargar CSV</button></div><div id="tb_' + id + '">' + tablaInner(id) + '</div></div>';
  }
  function tablaFilas(t) {
    var rows = t.rows.slice();
    if (t.q) { var q = t.q.toLowerCase(); rows = rows.filter(function (r) { return t.cols.some(function (c) { return String(r[c.k] == null ? '' : r[c.k]).toLowerCase().indexOf(q) >= 0; }); }); }
    if (t.sort) {
      var k = t.sort;
      rows.sort(function (a, b) {
        var x = a[k], y = b[k], r = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'es');
        return r * t.dir;
      });
    }
    return rows;
  }
  function tablaInner(id) {
    var t = TB[id], rows = tablaFilas(t), shown = t.all ? rows : rows.slice(0, t.lim);
    var h = '<div class="es-tb-w"><table class="es-t"><thead><tr>' + t.cols.map(function (c) {
      return '<th class="' + (c.num ? 'num' : '') + '" onclick="esOrdenar(\'' + id + '\',\'' + c.k + '\')" role="button" tabindex="0">' + esc(c.t) + (t.sort === c.k ? (t.dir < 0 ? ' ▼' : ' ▲') : '') + '</th>';
    }).join('') + '</tr></thead><tbody>' + (shown.length ? shown.map(function (r) {
      return '<tr>' + t.cols.map(function (c) { return '<td class="' + (c.num ? 'num' : '') + '">' + (c.f ? c.f(r[c.k], r) : esc(r[c.k] == null || r[c.k] === '' ? '—' : (typeof r[c.k] === 'number' ? nf(r[c.k]) : r[c.k]))) + '</td>'; }).join('') + '</tr>';
    }).join('') : '<tr><td colspan="' + t.cols.length + '" class="nota">Sin filas.</td></tr>') + '</tbody></table></div>';
    h += '<div class="es-tb-pie"><span>' + shown.length + ' de ' + rows.length + ' fila(s)</span>' + (rows.length > t.lim ? '<button type="button" class="btn-texto" onclick="esVerTodas(\'' + id + '\')">' + (t.all ? 'Ver menos' : 'Ver todas') + '</button>' : '') + '</div>';
    return h;
  }
  window.esOrdenar = function (id, k) { var t = TB[id]; if (t.sort === k) t.dir = -t.dir; else { t.sort = k; t.dir = -1; } document.getElementById('tb_' + id).innerHTML = tablaInner(id); };
  window.esBuscarTabla = function (id, q) { TB[id].q = q; document.getElementById('tb_' + id).innerHTML = tablaInner(id); };
  window.esVerTodas = function (id) { TB[id].all = !TB[id].all; document.getElementById('tb_' + id).innerHTML = tablaInner(id); };
  window.esCsv = function (id) {
    var t = TB[id], rows = tablaFilas(t);
    function cel(v) { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var csv = '﻿' + t.cols.map(function (c) { return cel(c.t); }).join(';') + '\n' + rows.map(function (r) { return t.cols.map(function (c) { return cel(r[c.k]); }).join(';'); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'estadisticas_' + t.csv + '_' + hoyISO() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };

  // ───────── Bloques de maquetación ─────────
  function card(t, body, o) { o = o || {}; return '<section class="es-card' + (o.w ? ' es-w' : '') + '"><h3>' + t + '</h3>' + (o.s ? '<p class="es-sub">' + o.s + '</p>' : '') + body + '</section>'; }
  function kpis(arr) { return '<div class="es-kpis">' + arr.map(function (k) { return '<div class="admin-kpi"><span>' + k[0] + '</span><strong>' + k[1] + '</strong>' + (k[2] ? '<em>' + k[2] + '</em>' : '') + '</div>'; }).join('') + '</div>'; }
  function grid() { return '<div class="es-g2">' + Array.prototype.join.call(arguments, '') + '</div>'; }
  function vacio(t) { return '<div class="admin-vacio"><strong>' + (t || 'No hay datos con estos filtros') + '</strong><p>Prueba otro período o limpia los filtros.</p></div>'; }
  function medalla(i) { return ['🥇 ', '🥈 ', '🥉 '][i] || ((i + 1) + '. '); }

  // ───────── Secciones ─────────
  function sResumen(F) {
    var P = F.partes, G = F.guardias;
    if (!P.length && !G.length) return vacio();
    var bk = cubetas(F), asis = sum(P, function (p) { return p.na; }), sal = sum(P, function (p) { return p.nm; });
    var pers = new Set(); P.forEach(function (p) { p.as.forEach(function (a) { pers.add(a[0]); }); });
    var durs = P.map(function (p) { return p.dur; }).filter(function (x) { return x != null; });
    var porDia = new Map(); P.forEach(function (p) { inc(porDia, p.f); });
    var dm = topN(porDia, 1)[0];
    var fs = P.map(function (p) { return p.f; }).sort(), spanSem = fs.length ? ((new Date(fs[fs.length - 1]) - new Date(fs[0])) / 864e5 + 1) / 7 : 0;
    var M = [0,1,2,3,4,5,6].map(function () { return [0,0,0,0]; }), sinHora = 0;
    P.forEach(function (p) { if (p.h == null) { sinHora++; return; } FRANJAS.forEach(function (fr, j) { if (p.h >= fr[1] && p.h < fr[2]) M[p.dow][j]++; }); });
    var horas = []; for (var h = 0; h < 24; h++) horas.push(0); P.forEach(function (p) { if (p.h != null) horas[p.h]++; });
    var promAs = bk.keys.map(function (_, i) { return null; });
    var tmp = bk.keys.map(function () { return [0, 0]; });
    P.forEach(function (p) { var i = bk.idx[bk.keyOf(p.f)]; if (i != null) { tmp[i][0] += p.na; tmp[i][1]++; } });
    promAs = tmp.map(function (t) { return t[1] ? Math.round(t[0] / t[1] * 10) / 10 : null; });
    var catAs = {}; P.forEach(function (p) { p.as.forEach(function (a) { catAs[a[1]] = (catAs[a[1]] || 0) + 1; }); });
    var actos = new Map(); P.forEach(function (p) { inc(actos, p.acto); });
    var maq = {}; MAQS.forEach(function (q) { maq[q] = 0; }); P.forEach(function (p) { p.mq.forEach(function (q) { maq[q] = (maq[q] || 0) + 1; }); });
    return kpis([
      ['Partes de emergencia', nf(P.length), nf(P.length / (spanSem || 1)) + ' por semana'],
      ['Asistencias (persona-parte)', nf(asis), nf(P.length ? asis / P.length : 0) + ' por parte'],
      ['Salidas de máquinas', nf(sal), nf(P.length ? sal / P.length : 0) + ' de promedio por parte'],
      ['Personas distintas', nf(pers.size), 'asistieron al menos 1 vez'],
      ['Guardias registradas', nf(G.length), nf(G.filter(function (g) { return g.t === 'Nocturna'; }).length) + ' noct. · ' + nf(G.filter(function (g) { return g.t === 'Diurna'; }).length) + ' diurnas'],
      ['Duración promedio', fmtDur(avg(durs)), nf(durs.length) + ' partes con horas válidas'],
      ['Día más activo', dm ? fecha(dm[0]) : '—', dm ? nf(dm[1]) + ' partes' : ''],
      ['Tipo de acto más frecuente', topN(actos, 1)[0] ? esc(topN(actos, 1)[0][0]) : '—', topN(actos, 1)[0] ? nf(pct(topN(actos, 1)[0][1], P.length)) + '% de los partes' : '']
    ]) +
    card('Partes de emergencia en el tiempo', columnas(bk.labels, [{ n: 'Partes', c: '--s1', v: vec(bk, P) }], { aria: 'Partes por período' }), { s: 'Cantidad de partes ' + granTxt(bk) + '.', w: true }) +
    grid(
      card('Promedio de asistentes por parte', lineas(bk.labels, [{ n: 'Asistentes por parte', c: '--s1', v: promAs }], { aria: 'Promedio de asistentes por parte' }), { s: 'Qué tan concurrida fue cada emergencia, ' + granTxt(bk) + '.' }),
      card('Asistencias por categoría', dona(['activos','honorarios','confederados','aspirantes'].map(function (k) { return { label: CATS[k], v: catAs[k] || 0, c: CAT_COL[k] }; }), { centro: 'asistencias' }))
    ) +
    grid(
      card('¿Cuándo ocurren? Día de semana × franja horaria', heat(DIAS, FRANJAS.map(function (f) { return f[0] + ' h'; }), M, {}), { s: 'Cantidad de partes' + (sinHora ? ' (' + sinHora + ' sin hora registrada no se cuentan).' : '.') }),
      card('Distribución por hora de inicio', columnas(horas.map(function (_, i) { return String(i).padStart(2, '0'); }), [{ n: 'Partes', c: '--s1', v: horas }], { aria: 'Partes por hora', h: 200 }))
    ) +
    grid(
      card('Actos más frecuentes', barrasH(topN(actos, 6).map(function (a) { return { label: lblActo(a[0]), v: a[1], txt: nf(a[1]) + ' · ' + nf(pct(a[1], P.length)) + '%' }; })), { s: 'Detalle completo en la pestaña «Actos de servicio».' }),
      card('Salidas por máquina', barrasH(MAQS.map(function (q) { return { label: q, v: maq[q] || 0, c: MAQ_COL[q], txt: nf(maq[q] || 0) + ' · ' + nf(pct(maq[q] || 0, P.length)) + '% de partes' }; })))
    ) + sCalidad(P);
  }
  function sCalidad(P) {
    var sinHi = P.filter(function (p) { return !p.hi; }), sinHt = P.filter(function (p) { return !p.ht; }), sinDir = P.filter(function (p) { return !String(p.d || '').trim(); });
    var sinAs = P.filter(function (p) { return !p.na; }), sinMq = P.filter(function (p) { return !p.nm; });
    var xs = P.filter(function (p) { return p.x; }).map(function (p) { return { p: p, n: parseInt((p.c || '').replace(/\D+/g, '').slice(4) || '0', 10) }; }).sort(function (a, b) { return a.n - b.n; });
    var raros = [];
    for (var i = 1; i < xs.length - 1; i++) {
      var a = xs[i - 1].p.f, b = xs[i].p.f, c = xs[i + 1].p.f;
      if (a <= c && (b < sumDias(a, -3) || b > sumDias(c, 3))) raros.push(xs[i].p);
    }
    function det(arr) { return arr.length ? '<details><summary>Ver códigos</summary><p class="nota">' + arr.slice(0, 80).map(function (p) { return esc(p.c); }).join(', ') + (arr.length > 80 ? '…' : '') + '</p></details>' : ''; }
    var fila = function (t, arr) { return '<li><span>' + t + '</span><b class="' + (arr.length ? 'es-warn' : 'es-okc') + '">' + nf(arr.length) + '</b>' + det(arr) + '</li>'; };
    return card('Calidad de los datos', '<ul class="es-cal">' + fila('Partes sin hora de inicio', sinHi) + fila('Partes sin hora de término', sinHt) + fila('Partes sin dirección', sinDir) + fila('Partes sin asistentes', sinAs) + fila('Partes sin máquinas', sinMq) + fila('Fechas sospechosas fuera de secuencia (serie Excel)', raros) + '</ul>', { s: 'Ayuda a detectar qué información falta o conviene corregir en el panel de Emergencias. Se calcula sobre los partes del filtro actual.', w: true });
  }

  function sMaquinas(F) {
    var P = F.partes; if (!P.length) return vacio();
    var bk = cubetas(F), tot = sum(P, function (p) { return p.nm; });
    var info = MAQS.map(function (q) {
      var ps = P.filter(function (p) { return p.mq.indexOf(q) >= 0; });
      return { q: q, n: ps.length, as: avg(ps.map(function (p) { return p.na; })), dur: avg(ps.map(function (p) { return p.dur; }).filter(function (x) { return x != null; })) };
    });
    var comb = new Map(); P.forEach(function (p) { inc(comb, p.nm ? p.mq.slice().sort().join(' + ') : 'Sin máquinas'); });
    var actosTop = topN((function () { var m = new Map(); P.forEach(function (p) { inc(m, p.acto); }); return m; })(), 12).map(function (a) { return a[0]; });
    var MA = actosTop.map(function (a) { return MAQS.map(function (q) { return P.filter(function (p) { return p.acto === a && p.mq.indexOf(q) >= 0; }).length; }); });
    var MD = MAQS.map(function (q) { return [0,1,2,3,4,5,6].map(function (d) { return P.filter(function (p) { return p.dow === d && p.mq.indexOf(q) >= 0; }).length; }); });
    var MH = MAQS.map(function (q) { return FRANJAS.map(function (fr) { return P.filter(function (p) { return p.h != null && p.h >= fr[1] && p.h < fr[2] && p.mq.indexOf(q) >= 0; }).length; }); });
    var filas = bk.keys.map(function (k, i) { var o = { periodo: bk.labels[i] }; MAQS.forEach(function (q) { o[q] = vec(bk, P.filter(function (p) { return p.mq.indexOf(q) >= 0; }))[i]; }); o.total = MAQS.reduce(function (s, q) { return s + o[q]; }, 0); return o; });
    return kpis(info.map(function (i) { return [esc(i.q) + ' · salidas', nf(i.n), nf(pct(i.n, P.length)) + '% de los partes']; }).concat([['Total de salidas', nf(tot), nf(P.length ? tot / P.length : 0) + ' de promedio por parte']])) +
      card('Movimientos de máquinas en el tiempo', columnas(bk.labels, MAQS.map(function (q) { return { n: q, c: MAQ_COL[q], v: vec(bk, P.filter(function (p) { return p.mq.indexOf(q) >= 0; })) }; }), { aria: 'Salidas por máquina' }), { s: 'Salidas de cada máquina ' + granTxt(bk) + ' (apiladas).', w: true }) +
      grid(
        card('Participación de cada máquina', dona(info.map(function (i) { return { label: i.q, v: i.n, c: MAQ_COL[i.q] }; }), { centro: 'salidas' })),
        card('Combinaciones de máquinas', barrasH(topN(comb, 8).map(function (a) { return { label: a[0], v: a[1], txt: nf(a[1]) + ' · ' + nf(pct(a[1], P.length)) + '%' }; })), { s: 'Qué máquinas salen juntas en un mismo parte.' })
      ) +
      grid(
        card('Asistentes y duración por máquina', '<div class="es-mini">' + info.map(function (i) { return '<div><strong style="color:var(' + MAQ_COL[i.q] + ')">' + esc(i.q) + '</strong><span>' + nf(i.as) + ' asistentes por parte</span><span>' + fmtDur(i.dur) + ' de duración media</span></div>'; }).join('') + '</div>'),
        card('Máquina × día de la semana', heat(MAQS, DIAS, MD))
      ) +
      grid(
        card('Máquina × franja horaria', heat(MAQS, FRANJAS.map(function (f) { return f[0] + ' h'; }), MH)),
        card('Máquina × tipo de acto (12 más frecuentes)', heat(actosTop.map(lblActo), MAQS, MA))
      ) +
      card('Detalle de salidas por período', tabla('maq', [{ k: 'periodo', t: 'Período' }, { k: 'B-2', t: 'B-2', num: 1 }, { k: 'HX-2', t: 'HX-2', num: 1 }, { k: 'H-2', t: 'H-2', num: 1 }, { k: 'total', t: 'Total', num: 1 }], filas, { lim: 24, csv: 'maquinas' }), { w: true });
  }

  function sActos(F) {
    var P = F.partes; if (!P.length) return vacio();
    var bk = cubetas(F), fam = ES.actoNivel === 'familia', kf = function (p) { return fam ? p.fam : p.acto; };
    var cnt = new Map(); P.forEach(function (p) { inc(cnt, kf(p)); });
    var orden = topN(cnt, 9999), top = orden.slice(0, 6).map(function (a) { return a[0]; });
    var conCod = P.filter(function (p) { return esCodigo(p.acto); }).length, top3 = sum(orden.slice(0, 3), function (a) { return a[1]; });
    var palette = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7'];
    var serie = top.map(function (a, i) { return { n: lblActo(a), c: palette[i], v: vec(bk, P.filter(function (p) { return kf(p) === a; })) }; });
    var otros = vec(bk, P.filter(function (p) { return top.indexOf(kf(p)) < 0; })); if (otros.some(Boolean)) serie.push({ n: 'Otros', c: '--s8', v: otros });
    var t10 = orden.slice(0, 10).map(function (a) { return a[0]; });
    var MD = t10.map(function (a) { return [0,1,2,3,4,5,6].map(function (d) { return P.filter(function (p) { return kf(p) === a && p.dow === d; }).length; }); });
    var MH = t10.map(function (a) { return FRANJAS.map(function (fr) { return P.filter(function (p) { return kf(p) === a && p.h != null && p.h >= fr[1] && p.h < fr[2]; }).length; }); });
    var filas = orden.map(function (a) {
      var ps = P.filter(function (p) { return kf(p) === a[0]; }), fs = ps.map(function (p) { return p.f; }).sort();
      return { acto: a[0], desc: ACTOS_DESC[a[0]] || '', n: a[1], pct: Math.round(pct(a[1], P.length) * 10) / 10, as: Math.round(avg(ps.map(function (p) { return p.na; })) * 10) / 10, mq: Math.round(avg(ps.map(function (p) { return p.nm; })) * 10) / 10, dur: Math.round(avg(ps.map(function (p) { return p.dur; }).filter(function (x) { return x != null; }))), pri: fs[0], ult: fs[fs.length - 1] };
    });
    var colsT = [{ k: 'acto', t: fam ? 'Familia' : 'Acto' }];
    if (Object.keys(ACTOS_DESC).length) colsT.push({ k: 'desc', t: 'Descripción' });
    colsT = colsT.concat([{ k: 'n', t: 'Cantidad', num: 1 }, { k: 'pct', t: '% del total', num: 1 }, { k: 'as', t: 'Asist. prom.', num: 1 }, { k: 'mq', t: 'Máq. prom.', num: 1 }, { k: 'dur', t: 'Duración prom. (min)', num: 1 }, { k: 'pri', t: 'Primero', f: fecha }, { k: 'ult', t: 'Último', f: fecha }]);
    var selector = '<div class="es-seg" role="group" aria-label="Nivel de detalle"><button type="button" class="' + (!fam ? 'activo' : '') + '" onclick="esActoNivel(\'detalle\')">Por código completo</button><button type="button" class="' + (fam ? 'activo' : '') + '" onclick="esActoNivel(\'familia\')">Por familia (ej. 10-6)</button></div>';
    return selector + kpis([
      [fam ? 'Familias distintas' : 'Tipos de acto distintos', nf(orden.length)],
      ['Más frecuente', esc(orden[0][0]), nf(orden[0][1]) + ' partes · ' + nf(pct(orden[0][1], P.length)) + '%'],
      ['Concentración top 3', nf(pct(top3, P.length)) + '%', 'de todos los partes'],
      ['Con código radial', nf(conCod), nf(pct(conCod, P.length)) + '% (el resto: citaciones, ejercicios, asambleas…)']
    ]) +
      grid(
        card('Ranking de actos', barrasH(orden.slice(0, 15).map(function (a, i) { return { label: lblActo(a[0]), v: a[1], txt: nf(a[1]) + ' · ' + nf(pct(a[1], P.length)) + '%' }; })), { s: 'Los 15 más frecuentes.' }),
        card('Composición', dona(orden.slice(0, 8).map(function (a, i) { return { label: lblActo(a[0]), v: a[1], c: palette[i % 7] }; }).concat(orden.length > 8 ? [{ label: 'Otros', v: sum(orden.slice(8), function (a) { return a[1]; }), c: '--s8' }] : []), { centro: 'partes' }))
      ) +
      card('Evolución de los actos principales', columnas(bk.labels, serie, { aria: 'Actos en el tiempo' }), { s: 'Los 6 actos más frecuentes ' + granTxt(bk) + '; el resto se agrupa en «Otros».', w: true }) +
      grid(
        card('Acto × día de la semana (top 10)', heat(t10.map(lblActo), DIAS, MD)),
        card('Acto × franja horaria (top 10)', heat(t10.map(lblActo), FRANJAS.map(function (f) { return f[0] + ' h'; }), MH))
      ) +
      card('Detalle por tipo de acto', tabla('actos' + (fam ? 'f' : 'd'), colsT, filas, { sort: 'n', lim: 20, csv: 'actos' }), { w: true });
  }

  function personasTabla(F, cat) {
    var pp = personasPartes(F, cat), pg = personasGuardias(F), claves = new Set(pp.keys());
    pg.forEach(function (_, c) { if (!cat || catDe(c) === cat) claves.add(c); });
    return Array.from(claves).map(function (c) {
      var a = pp.get(c) || { partes: 0, pri: null, ult: null, actos: new Map(), maq: new Map(), dow: [0,0,0,0,0,0,0] }, g = pg.get(c) || { gd: 0, gn: 0, just: 0, falla: 0, apoyo: 0, jefe: 0, cond: 0 };
      var asig = g.gd + g.gn + g.just + g.falla;
      return { c: c, n: nombre(c), cat: catDe(c), partes: a.partes, pct: Math.round(pct(a.partes, F.partes.length) * 10) / 10, gd: g.gd, gn: g.gn, g: g.gd + g.gn, just: g.just, falla: g.falla, apoyo: g.apoyo, jefe: g.jefe, cond: g.cond, cumpl: asig ? Math.round(pct(g.gd + g.gn, asig) * 10) / 10 : null, comb: a.partes + g.gd + g.gn, pri: a.pri, ult: a.ult, topActo: (topN(a.actos, 1)[0] || [''])[0], a: a };
    });
  }

  function sTop(F) {
    if (!F.partes.length && !F.guardias.length) return vacio();
    var cat = ES.topCat === 'todas' ? null : ES.topCat, met = ES.topMetrica;
    var rows = personasTabla(F, cat).filter(function (r) { return !cat || r.cat === cat || r.partes > 0 || r.g > 0; });
    var key = met === 'partes' ? 'partes' : met === 'guardias' ? 'g' : 'comb';
    var rk = rows.filter(function (r) { return r[key] > 0; }).sort(function (a, b) { return b[key] - a[key] || a.n.localeCompare(b.n, 'es'); });
    var top = rk.slice(0, 10), corte = top.length === 10 ? top[9][key] : null, empatados = corte != null ? rk.slice(10).filter(function (r) { return r[key] === corte; }).length : 0;
    var totBase = met === 'partes' ? F.partes.length : met === 'guardias' ? F.guardias.length : F.partes.length + F.guardias.length;
    var lbl = { partes: 'asistencias a emergencias', guardias: 'guardias cumplidas', combinado: 'asistencias + guardias' }[met];
    var seg = function (id, items, act, fn) { return '<div class="es-seg" role="group">' + items.map(function (i) { return '<button type="button" class="' + (act === i[0] ? 'activo' : '') + '" onclick="' + fn + '(\'' + i[0] + '\')">' + i[1] + '</button>'; }).join('') + '</div>'; };
    var sel = '<div class="es-ctl"><label>Ordenar por ' + seg('m', [['partes', 'Partes'], ['guardias', 'Guardias'], ['combinado', 'Combinado']], met, 'esTopMetrica') + '</label><label>Categoría ' + seg('c', [['todas', 'Todas'], ['activos', 'Activos'], ['honorarios', 'Honorarios'], ['confederados', 'Canjes'], ['aspirantes', 'Aspirantes']], ES.topCat, 'esTopCat') + '</label></div>';
    var tp = rows.slice().sort(function (a, b) { return b.comb - a.comb; });
    return sel + card('Top 10 · ' + lbl, top.length ? barrasH(top.map(function (r, i) { return { pre: '<span class="es-med">' + medalla(i) + '</span>', label: r.n + ' (' + r.c + ')', v: r[key], c: i < 3 ? '--s4' : '--s1', txt: nf(r[key]) + ' · ' + nf(pct(r[key], totBase)) + '%', tip: r.n + ' · ' + CATS[r.cat] + ' · Partes: ' + r.partes + ' · Guardias: ' + r.g }; })) + (empatados ? '<p class="nota">Hay ' + empatados + ' persona(s) más empatada(s) con ' + nf(corte) + ' en el puesto 10.</p>' : '') : '<p class="nota">Nadie con registros en este filtro.</p>', { s: 'El porcentaje se calcula sobre ' + nf(totBase) + (met === 'partes' ? ' partes' : met === 'guardias' ? ' guardias' : ' partes y guardias') + ' del período.', w: true }) +
      card('Ranking completo', tabla('top', [{ k: 'n', t: 'Nombre' }, { k: 'c', t: 'Clave' }, { k: 'cat', t: 'Categoría', f: function (v) { return esc(CATS[v] || v || '—'); } }, { k: 'partes', t: 'Partes', num: 1 }, { k: 'pct', t: '% partes', num: 1 }, { k: 'gd', t: 'G. diurnas', num: 1 }, { k: 'gn', t: 'G. nocturnas', num: 1 }, { k: 'comb', t: 'Combinado', num: 1 }, { k: 'ult', t: 'Última asistencia', f: fecha }], tp.filter(function (r) { return r.comb > 0; }), { sort: key === 'g' ? 'g' : key, lim: 20, csv: 'ranking' }), { w: true });
  }

  function sAsistencia(F) {
    var P = F.partes; if (!P.length) return vacio();
    var bk = cubetas(F), tot = sum(P, function (p) { return p.na; }), cats = ['activos', 'honorarios', 'confederados', 'aspirantes'];
    var porCat = {}; cats.forEach(function (c) { porCat[c] = { as: 0, pers: new Set(), partes: 0 }; });
    P.forEach(function (p) { var vistos = {}; p.as.forEach(function (a) { var o = porCat[a[1]]; if (!o) return; o.as++; o.pers.add(a[0]); if (!vistos[a[1]]) { vistos[a[1]] = 1; o.partes++; } }); });
    var enCat = {}; Object.keys(ES.datos.P).forEach(function (c) { var k = ES.datos.P[c].cat; enCat[k] = (enCat[k] || 0) + 1; });
    var hist = {}; P.forEach(function (p) { var b = Math.floor(p.na / 5) * 5; hist[b] = (hist[b] || 0) + 1; });
    var mxB = Math.max.apply(null, Object.keys(hist).map(Number)), hl = [], hv = []; for (var b = 0; b <= mxB; b += 5) { hl.push(b + '–' + (b + 4)); hv.push(hist[b] || 0); }
    var llenos = P.slice().sort(function (a, b) { return b.na - a.na; }).slice(0, 10).map(function (p) { return { c: p.c, f: p.f, acto: p.acto, na: p.na, d: p.d || '' }; });
    var rows = personasTabla(F, null);
    var enLista = Object.keys(ES.datos.P).filter(function (c) { return ES.datos.P[c].lista; });
    var sinAs = enLista.filter(function (c) { return !rows.some(function (r) { return r.c === c && (r.partes > 0 || r.g > 0); }); });
    var gcat = ES.genCat === 'todas' ? rows : rows.filter(function (r) { return r.cat === ES.genCat; });
    var seg = '<div class="es-seg" role="group">' + [['todas', 'Todas'], ['activos', 'Activos'], ['honorarios', 'Honorarios'], ['confederados', 'Canjes'], ['aspirantes', 'Aspirantes']].map(function (i) { return '<button type="button" class="' + (ES.genCat === i[0] ? 'activo' : '') + '" onclick="esGenCat(\'' + i[0] + '\')">' + i[1] + '</button>'; }).join('') + '</div>';
    return kpis(cats.map(function (c) { var o = porCat[c]; return [esc(CATS[c]), nf(o.as), nf(o.pers.size) + (enCat[c] ? ' de ' + nf(enCat[c]) : '') + ' personas · ' + nf(pct(o.as, tot)) + '%']; }).concat([['Sin ninguna asistencia', nf(sinAs.length), 'personas de la lista sin partes ni guardias']])) +
      grid(
        card('Participación por categoría', dona(cats.map(function (c) { return { label: CATS[c], v: porCat[c].as, c: CAT_COL[c] }; }), { centro: 'asistencias' })),
        card('Asistentes por parte (histograma)', columnas(hl, [{ n: 'Partes', c: '--s1', v: hv }], { aria: 'Histograma de asistentes por parte', h: 220 }), { s: 'Cuántos partes tuvieron entre X e Y asistentes.' })
      ) +
      card('Asistencias por categoría en el tiempo', columnas(bk.labels, cats.map(function (c) { return { n: CATS[c], c: CAT_COL[c], v: vec(bk, P, function (p) { return p.as.filter(function (a) { return a[1] === c; }).length; }) }; }), { aria: 'Asistencias por categoría' }), { s: 'Asistencias ' + granTxt(bk) + ', apiladas por categoría.', w: true }) +
      card('Partes con más asistentes', tabla('llenos', [{ k: 'c', t: 'Parte' }, { k: 'f', t: 'Fecha', f: fecha }, { k: 'acto', t: 'Acto' }, { k: 'd', t: 'Dirección' }, { k: 'na', t: 'Asistentes', num: 1 }], llenos, { sort: 'na', lim: 10, csv: 'partes_concurridos' }), { w: true }) +
      card('Asistencia por persona', '<div class="es-ctl"><label>Categoría ' + seg + '</label></div>' + tabla('gen' + ES.genCat, [{ k: 'n', t: 'Nombre' }, { k: 'c', t: 'Clave' }, { k: 'cat', t: 'Categoría', f: function (v) { return esc(CATS[v] || v || '—'); } }, { k: 'partes', t: 'Partes', num: 1 }, { k: 'pct', t: '% partes', num: 1 }, { k: 'g', t: 'Guardias', num: 1 }, { k: 'just', t: 'Justif.', num: 1 }, { k: 'falla', t: 'Fallas', num: 1 }, { k: 'ult', t: 'Última asistencia', f: fecha }], gcat, { sort: 'partes', lim: 20, csv: 'asistencia_personas' }) + (sinAs.length ? '<details><summary>Ver personas de la lista sin ninguna asistencia (' + sinAs.length + ')</summary><p class="nota">' + sinAs.map(function (c) { return esc(nombre(c) + ' (' + c + ')'); }).join(' · ') + '</p></details>' : ''), { w: true });
  }

  function sGrupo(cat, titulo, singular) {
    return function (F) {
      var P = F.partes; if (!P.length) return vacio();
      var bk = cubetas(F), pp = personasPartes(F, cat), pg = personasGuardias(F);
      var conGr = P.filter(function (p) { return p.as.some(function (a) { return a[1] === cat; }); }), totAs = sum(P, function (p) { return p.na; });
      var asGr = sum(P, function (p) { return p.as.filter(function (a) { return a[1] === cat; }).length; });
      var enCat = Object.keys(ES.datos.P).filter(function (c) { return ES.datos.P[c].cat === cat; });
      var filas = Array.from(new Set(enCat.concat(Array.from(pp.keys())))).map(function (c) {
        var a = pp.get(c) || { partes: 0, pri: null, ult: null, actos: new Map(), maq: new Map(), dow: [0,0,0,0,0,0,0] }, g = pg.get(c) || { gd: 0, gn: 0, just: 0, falla: 0 };
        return { n: nombre(c), c: c, partes: a.partes, pct: Math.round(pct(a.partes, P.length) * 10) / 10, g: g.gd + g.gn, just: g.just, falla: g.falla, pri: a.pri, ult: a.ult, acto: (topN(a.actos, 1)[0] || [''])[0], dias: a.ult ? Math.round((new Date(hoyISO()) - new Date(a.ult)) / 864e5) : null };
      });
      var activos = filas.filter(function (r) { return r.partes > 0; }).sort(function (a, b) { return b.partes - a.partes; });
      var actos = new Map(), dowv = [0,0,0,0,0,0,0], maq = new Map();
      conGr.forEach(function (p) { var n = p.as.filter(function (a) { return a[1] === cat; }).length; inc(actos, p.acto, n); if (p.dow != null) dowv[p.dow] += n; p.mq.forEach(function (q) { inc(maq, q, n); }); });
      var palette = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];
      var serPers = activos.slice(0, 5).map(function (r, i) { return { n: r.n, c: palette[i], v: vec(bk, P.filter(function (p) { return p.as.some(function (a) { return a[0] === r.c && a[1] === cat; }); })) }; });
      var serTot = [{ n: 'Asistencias', c: CAT_COL[cat], v: vec(bk, P, function (p) { return p.as.filter(function (a) { return a[1] === cat; }).length; }) }];
      var promPar = conGr.length ? asGr / conGr.length : 0;
      var porc = bk.keys.map(function () { return [0, 0]; }); P.forEach(function (p) { var i = bk.idx[bk.keyOf(p.f)]; if (i == null) return; porc[i][1]++; if (p.as.some(function (a) { return a[1] === cat; })) porc[i][0]++; });
      return kpis([
        [singular + ' con asistencia', nf(activos.length), 'de ' + nf(enCat.length) + ' registrados en la categoría'],
        ['Asistencias (persona-parte)', nf(asGr), nf(pct(asGr, totAs)) + '% de todas las asistencias'],
        ['Partes con al menos 1', nf(conGr.length), nf(pct(conGr.length, P.length)) + '% de los partes'],
        ['Promedio por parte (donde asisten)', nf(promPar), 'personas de la categoría'],
        ['Guardias cumplidas', nf(sum(filas, function (r) { return r.g; })), nf(sum(filas, function (r) { return r.just; })) + ' justificadas · ' + nf(sum(filas, function (r) { return r.falla; })) + ' fallas']
      ]) +
        card(titulo + ' en el tiempo', columnas(bk.labels, serTot, { aria: 'Asistencias de ' + titulo }), { s: 'Asistencias ' + granTxt(bk) + '.', w: true }) +
        grid(
          card('Ranking por persona', barrasH(activos.slice(0, 20).map(function (r, i) { return { pre: '<span class="es-med">' + medalla(i) + '</span>', label: r.n + ' (' + r.c + ')', v: r.partes, c: CAT_COL[cat], txt: nf(r.partes) + ' · ' + nf(r.pct) + '%' }; })), { s: '% sobre el total de partes del filtro.' }),
          card('Actos a los que asisten', barrasH(topN(actos, 8).map(function (a) { return { label: lblActo(a[0]), v: a[1], c: CAT_COL[cat] }; })))
        ) +
        (serPers.length > 1 ? card('Evolución por persona (top 5)', columnas(bk.labels, serPers, { stacked: false, aria: 'Asistencias por persona' }), { s: 'Partes asistidos por cada una, ' + granTxt(bk) + '.', w: true }) : '') +
        grid(
          card('Día de la semana', columnas(DIAS, [{ n: 'Asistencias', c: CAT_COL[cat], v: dowv }], { h: 200, aria: 'Asistencias por día' })),
          card('Máquinas en las que participan', barrasH(MAQS.map(function (q) { return { label: q, v: maq.get(q) || 0, c: MAQ_COL[q] }; })), { s: 'Asistencias en partes donde salió cada máquina.' })
        ) +
        card('Detalle por persona', tabla('grp' + cat, [{ k: 'n', t: 'Nombre' }, { k: 'c', t: 'Clave' }, { k: 'partes', t: 'Partes', num: 1 }, { k: 'pct', t: '% partes', num: 1 }, { k: 'g', t: 'Guardias', num: 1 }, { k: 'just', t: 'Justif.', num: 1 }, { k: 'falla', t: 'Fallas', num: 1 }, { k: 'pri', t: 'Primera', f: fecha }, { k: 'ult', t: 'Última', f: fecha }, { k: 'dias', t: 'Días desde la última', num: 1 }, { k: 'acto', t: 'Acto más frecuente' }], filas, { sort: 'partes', lim: 20, csv: 'detalle_' + cat }), { w: true });
    };
  }

  function sGuardias(F) {
    var G = F.guardias; if (!G.length) return vacio('No hay guardias en este período');
    var bk = cubetas({ partes: [], guardias: G }), pers = personasGuardias(F), ND = G.filter(function (g) { return g.t === 'Nocturna'; }), DD = G.filter(function (g) { return g.t === 'Diurna'; });
    var pres = 0, jus = 0, fal = 0, apo = 0;
    G.forEach(function (g) { g.i.forEach(function (r) { if (r[1]) pres++; else if (r[2] === 'Justificado') jus++; else if (r[2] === 'Falla') fal++; else apo++; }); });
    var asig = pres + jus + fal, presG = function (g) { return g.i.filter(function (r) { return r[1]; }).length; };
    var fechas = G.map(function (g) { return g.f; }).sort(), ini = ES.f.desde || fechas[0], fin = ES.f.hasta || fechas[fechas.length - 1], tengo = new Set(ND.map(function (g) { return g.f; })), faltan = [], c = ini, k = 0;
    while (c <= fin && k++ < 1500) { if (!tengo.has(c)) faltan.push(c); c = sumDias(c, 1); }
    var diasRango = Math.round((new Date(fin) - new Date(ini)) / 864e5) + 1;
    var avgV = function (items) { var t = bk.keys.map(function () { return [0, 0]; }); items.forEach(function (g) { var i = bk.idx[bk.keyOf(g.f)]; if (i != null) { t[i][0] += presG(g); t[i][1]++; } }); return t.map(function (x) { return x[1] ? Math.round(x[0] / x[1] * 10) / 10 : null; }); };
    var dN = [0,0,0,0,0,0,0], dD = [0,0,0,0,0,0,0]; ND.forEach(function (g) { dN[g.dow]++; }); DD.forEach(function (g) { dD[g.dow]++; });
    var rows = Array.from(pers.values()).map(function (r) { var asg = r.gd + r.gn + r.just + r.falla; return { n: nombre(r.c), c: r.c, cat: catDe(r.c), gd: r.gd, gn: r.gn, g: r.gd + r.gn, just: r.just, falla: r.falla, apoyo: r.apoyo, jefe: r.jefe, cond: r.cond, cumpl: asg ? Math.round(pct(r.gd + r.gn, asg) * 10) / 10 : null }; });
    var rk = function (key, c) { return barrasH(rows.filter(function (r) { return r[key] > 0; }).sort(function (a, b) { return b[key] - a[key] || a.n.localeCompare(b.n, 'es'); }).slice(0, 10).map(function (r) { return { label: r.n + ' (' + r.c + ')', v: r[key], c: c }; })); };
    return kpis([
      ['Guardias registradas', nf(G.length), nf(ND.length) + ' nocturnas · ' + nf(DD.length) + ' diurnas'],
      ['Presencias (de turno)', nf(pres), nf(G.length ? pres / G.length : 0) + ' por guardia'],
      ['Justificados', nf(jus), nf(pct(jus, asig)) + '% de las asignaciones'],
      ['Fallas', nf(fal), nf(pct(fal, asig)) + '% de las asignaciones'],
      ['Cumplimiento', nf(pct(pres, asig)) + '%', 'presentes ÷ (presentes + justificados + fallas)'],
      ['Noches con guardia registrada', nf(ND.length) + ' de ' + nf(diasRango), nf(pct(ND.length, diasRango)) + '% del período'],
      ['Personas distintas', nf(pers.size), nf(apo) + ' participaciones de apoyo (no de turno)']
    ]) +
      card('Guardias en el tiempo', columnas(bk.labels, [{ n: 'Nocturnas', c: GT_COL.Nocturna, v: vec(bk, ND) }, { n: 'Diurnas', c: GT_COL.Diurna, v: vec(bk, DD) }], { aria: 'Guardias por período' }), { s: 'Guardias registradas ' + granTxt(bk) + '.', w: true }) +
      grid(
        card('Integrantes presentes por guardia', lineas(bk.labels, [{ n: 'Nocturna', c: GT_COL.Nocturna, v: avgV(ND) }, { n: 'Diurna', c: GT_COL.Diurna, v: avgV(DD) }], { aria: 'Promedio de presentes por guardia' }), { s: 'Dotación promedio ' + granTxt(bk) + '.' }),
        card('Guardias por día de la semana', columnas(DIAS, [{ n: 'Nocturnas', c: GT_COL.Nocturna, v: dN }, { n: 'Diurnas', c: GT_COL.Diurna, v: dD }], { stacked: false, h: 220, aria: 'Guardias por día' }))
      ) +
      grid(
        card('Más guardias cumplidas (top 10)', rk('g', '--s1')),
        card('Más justificaciones (top 10)', rk('just', '--s4'))
      ) +
      grid(
        card('Más fallas', rk('falla', '--s8')),
        card('Jefes de guardia y conductores', '<h4 class="es-h4">Jefe de guardia</h4>' + rk('jefe', '--s7') + '<h4 class="es-h4">Conductor</h4>' + rk('cond', '--s2'))
      ) +
      card('Noches sin guardia registrada', '<p>' + nf(faltan.length) + ' noche(s) del período no tienen guardia nocturna registrada.</p>' + (faltan.length ? '<details><summary>Ver fechas</summary><p class="nota">' + faltan.slice(0, 200).map(fecha).join(' · ') + (faltan.length > 200 ? '…' : '') + '</p></details>' : ''), { s: 'Considera desde ' + fecha(ini) + ' hasta ' + fecha(fin) + '. Útil para detectar guardias que faltan por cargar.', w: true }) +
      card('Detalle por persona', tabla('guardias', [{ k: 'n', t: 'Nombre' }, { k: 'c', t: 'Clave' }, { k: 'cat', t: 'Categoría', f: function (v) { return esc(CATS[v] || v || '—'); } }, { k: 'gn', t: 'Nocturnas', num: 1 }, { k: 'gd', t: 'Diurnas', num: 1 }, { k: 'g', t: 'Total', num: 1 }, { k: 'just', t: 'Justif.', num: 1 }, { k: 'falla', t: 'Fallas', num: 1 }, { k: 'apoyo', t: 'Apoyo', num: 1 }, { k: 'jefe', t: 'Jefe', num: 1 }, { k: 'cond', t: 'Conductor', num: 1 }, { k: 'cumpl', t: 'Cumplimiento %', num: 1, f: function (v) { return v == null ? '—' : nf(v) + '%'; } }], rows, { sort: 'g', lim: 20, csv: 'guardias_personas' }), { w: true });
  }

  function sPersona(F) {
    var opts = Object.keys(ES.datos.P).sort(function (a, b) { return nombre(a).localeCompare(nombre(b), 'es'); });
    var sel = '<div class="es-ctl"><label>Persona<select onchange="esPersona(this.value)"><option value="">— Elige una persona —</option>' + opts.map(function (c) { return '<option value="' + esc(c) + '"' + (ES.persona === c ? ' selected' : '') + '>' + esc(nombre(c) + ' (' + c + ')') + '</option>'; }).join('') + '</select></label></div>';
    if (!ES.persona) return sel + '<div class="admin-vacio"><strong>Elige una persona para ver su ficha</strong><p>Muestra sus asistencias a emergencias y guardias dentro de los filtros activos.</p></div>';
    var c = ES.persona, ps = F.partes.filter(function (p) { return p.as.some(function (a) { return a[0] === c; }); }), gs = F.guardias.filter(function (g) { return g.i.some(function (r) { return r[0] === c; }); });
    var bk = cubetas({ partes: ps, guardias: gs }), pg = personasGuardias({ guardias: gs }).get(c) || { gd: 0, gn: 0, just: 0, falla: 0, apoyo: 0, jefe: 0, cond: 0 };
    var actos = new Map(), maq = new Map(), dow = [0,0,0,0,0,0,0]; ps.forEach(function (p) { inc(actos, p.acto); p.mq.forEach(function (q) { inc(maq, q); }); if (p.dow != null) dow[p.dow]++; });
    var info = ES.datos.P[c] || {};
    var fs = ps.map(function (p) { return p.f; }).sort(), asg = pg.gd + pg.gn + pg.just + pg.falla;
    var filas = ps.slice().sort(function (a, b) { return a.f < b.f ? 1 : -1; }).map(function (p) { return { c: p.c, f: p.f, acto: p.acto, d: p.d || '', cat: (p.as.filter(function (a) { return a[0] === c; })[0] || [])[1] }; });
    var gl = gs.slice().sort(function (a, b) { return a.f < b.f ? 1 : -1; }).map(function (g) { var r = g.i.filter(function (x) { return x[0] === c; })[0]; return { f: g.f, t: g.t, est: r[1] ? 'Presente' : (r[2] || 'No de turno') }; });
    return sel + kpis([
      ['Persona', esc(info.n || c), esc(CATS[info.cat] || info.cat || '') + ' · ' + esc(info.perm || '')],
      ['Partes asistidos', nf(ps.length), nf(pct(ps.length, F.partes.length)) + '% de los partes del filtro'],
      ['Guardias cumplidas', nf(pg.gd + pg.gn), nf(pg.gn) + ' noct. · ' + nf(pg.gd) + ' diurnas'],
      ['Justificadas / fallas', nf(pg.just) + ' / ' + nf(pg.falla), asg ? nf(pct(pg.gd + pg.gn, asg)) + '% de cumplimiento' : ''],
      ['Primera / última asistencia', fs.length ? fecha(fs[0]) + ' → ' + fecha(fs[fs.length - 1]) : '—']
    ]) +
      card('Partes asistidos en el tiempo', columnas(bk.labels, [{ n: 'Partes', c: '--s1', v: vec(bk, ps) }], { aria: 'Partes por período', h: 200 }), { w: true }) +
      grid(
        card('Actos más frecuentes', barrasH(topN(actos, 8).map(function (a) { return { label: lblActo(a[0]), v: a[1] }; }))),
        card('Día de la semana', columnas(DIAS, [{ n: 'Partes', c: '--s1', v: dow }], { h: 200, aria: 'Partes por día' }))
      ) +
      card('Máquinas en las que participó', barrasH(MAQS.map(function (q) { return { label: q, v: maq.get(q) || 0, c: MAQ_COL[q] }; }))) +
      card('Partes asistidos', tabla('pers_partes', [{ k: 'c', t: 'Parte' }, { k: 'f', t: 'Fecha', f: fecha }, { k: 'acto', t: 'Acto' }, { k: 'd', t: 'Dirección' }, { k: 'cat', t: 'Categoría', f: function (v) { return esc(CATS[v] || v || '—'); } }], filas, { sort: 'f', lim: 10, csv: 'partes_persona' }), { w: true }) +
      card('Guardias', tabla('pers_guardias', [{ k: 'f', t: 'Fecha', f: fecha }, { k: 't', t: 'Tipo' }, { k: 'est', t: 'Estado' }], gl, { sort: 'f', lim: 10, csv: 'guardias_persona' }), { w: true });
  }

  var SECCIONES = {
    resumen: ['Resumen', sResumen], maquinas: ['Movimientos de máquinas', sMaquinas], actos: ['Actos de servicio', sActos],
    top: ['Mejores asistencias (10)', sTop], asistencia: ['Asistencia general', sAsistencia],
    canjes: ['Canjes y participantes', sGrupo('confederados', 'Asistencia de canjes y participantes', 'Confederados')],
    aspirantes: ['Aspirantes', sGrupo('aspirantes', 'Asistencia de aspirantes', 'Aspirantes')],
    guardias: ['Guardias', sGuardias], persona: ['Ficha por persona', sPersona]
  };

  // ───────── Pantalla, filtros y eventos ─────────
  function pintarFiltros() {
    var f = ES.f, d = ES.datos;
    var rap = [['todo', 'Todo']].concat(d.anios.map(function (a) { return ['y' + a, 'Año ' + a]; })).concat([['mes', 'Mes actual'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días']]);
    var sel = function (id, val, opts) { return '<select id="' + id + '" onchange="esFiltro(\'' + id.slice(3) + '\',this.value)">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; };
    return '<div class="es-filtros"><div class="es-rapido" role="group" aria-label="Período rápido">' + rap.map(function (r) { return '<button type="button" class="' + (f.rapido === r[0] ? 'activo' : '') + '" onclick="esRapido(\'' + r[0] + '\')">' + r[1] + '</button>'; }).join('') + '</div>' +
      '<div class="es-filtros-grid">' +
      '<label>Desde<input id="esdesde" type="date" value="' + esc(f.desde) + '" onchange="esFiltro(\'desde\',this.value)"></label>' +
      '<label>Hasta<input id="eshasta" type="date" value="' + esc(f.hasta) + '" onchange="esFiltro(\'hasta\',this.value)"></label>' +
      '<label>Partes' + sel('espruebas', f.pruebas, [['reales', 'Solo reales'], ['pruebas', 'Solo de prueba'], ['todas', 'Todos']]) + '</label>' +
      '<label>Origen de datos' + sel('esorigen', f.origen, [['todos', 'Todos'], ['excel', 'Histórico (Excel)'], ['app', 'Registrados en la app']]) + '</label>' +
      '<label>Tipo de acto' + sel('esacto', f.acto, [['', 'Todos']].concat(d.actos.map(function (a) { return [a[0], lblActo(a[0]) + ' (' + a[1] + ')']; }))) + '</label>' +
      '<label>Máquina' + sel('esmaq', f.maq, [['', 'Todas']].concat(MAQS.map(function (q) { return [q, q]; }))) + '</label>' +
      '<label>Guardia' + sel('esgt', f.gt, [['', 'Diurna y nocturna'], ['Diurna', 'Solo diurna'], ['Nocturna', 'Solo nocturna']]) + '</label>' +
      '<label>Agrupar por' + sel('esgran', f.gran, [['auto', 'Automático'], ['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']]) + '</label>' +
      '</div><div class="es-filtros-pie"><span id="esResumenFiltro" class="nota"></span><span><button type="button" class="btn-texto" onclick="esLimpiar()">Limpiar filtros</button><button type="button" class="btn-texto" onclick="window.print()">🖨 Imprimir / PDF</button></span></div></div>';
  }
  function pintar() {
    var cuerpo = document.getElementById('esCuerpo'); if (!cuerpo) return;
    ES.F = filtrar();
    document.querySelectorAll('[data-estab]').forEach(function (b) { b.classList.toggle('activo', b.dataset.estab === ES.sub); });
    var r = document.getElementById('esResumenFiltro');
    if (r) r.textContent = nf(ES.F.partes.length) + ' parte(s) y ' + nf(ES.F.guardias.length) + ' guardia(s) con los filtros actuales. Acto y máquina filtran solo partes; el tipo de guardia filtra solo guardias.';
    try { cuerpo.innerHTML = SECCIONES[ES.sub][1](ES.F); }
    catch (e) { console.error(e); cuerpo.innerHTML = '<div class="admin-vacio admin-error"><strong>No se pudo dibujar esta sección</strong><p>' + esc(e.message) + '</p></div>'; }
  }
  window.renderAdminEstadisticas = async function (forzar) {
    var cont = document.getElementById('contenidoAdmin');
    cont.classList.add('es-ancho');
    if (!ES.datos || forzar) {
      cont.innerHTML = '<p class="nota">Cargando estadísticas...</p>';
      var res = await cliente.rpc('pd_admin_stats_datos', { p_token: SESION.token });
      if (res.error) { cont.innerHTML = '<div class="admin-vacio admin-error"><strong>No se pudieron cargar las estadísticas</strong><p>' + esc(res.error.message) + '</p></div>'; return; }
      ES.datos = res.data; prep(ES.datos);
    }
    cont.innerHTML = '<div class="es-root"><section class="admin-resumen"><div class="admin-resumen-cabecera"><div><h2>Estadísticas</h2><p>Partes de emergencia y guardias. Todos los gráficos respetan los filtros.</p></div><button class="btn-secundario" onclick="renderAdminEstadisticas(true)">↻ Actualizar datos</button></div></section>' +
      pintarFiltros() + '<nav class="es-subtabs" aria-label="Secciones de estadísticas">' + Object.keys(SECCIONES).map(function (k) { return '<button type="button" data-estab="' + k + '" onclick="esSub(\'' + k + '\')">' + SECCIONES[k][0] + '</button>'; }).join('') + '</nav><div id="esCuerpo"></div></div>';
    pintar();
  };
  window.esSub = function (k) { ES.sub = k; pintar(); };
  window.esFiltro = function (k, v) { ES.f[k] = v; if (k === 'desde' || k === 'hasta') ES.f.rapido = ''; if (k === 'desde' || k === 'hasta') document.querySelectorAll('.es-rapido button').forEach(function (b) { b.classList.remove('activo'); }); pintar(); };
  window.esRapido = function (k) {
    var f = ES.f, hoy = hoyISO(); f.rapido = k; f.hasta = '';
    if (k === 'todo') f.desde = '';
    else if (k[0] === 'y') { f.desde = k.slice(1) + '-01-01'; f.hasta = k.slice(1) + '-12-31'; }
    else if (k === 'mes') f.desde = hoy.slice(0, 8) + '01';
    else f.desde = sumDias(hoy, -(+k - 1));
    document.getElementById('esdesde').value = f.desde; document.getElementById('eshasta').value = f.hasta;
    document.querySelectorAll('.es-rapido button').forEach(function (b) { b.classList.toggle('activo', b.getAttribute('onclick') === "esRapido('" + k + "')"); });
    pintar();
  };
  window.esLimpiar = function () { ES.f = { rapido: 'todo', desde: '', hasta: '', pruebas: 'reales', origen: 'todos', acto: '', maq: '', gt: '', gran: 'auto' }; window.renderAdminEstadisticas(); };
  window.esActoNivel = function (n) { ES.actoNivel = n; pintar(); };
  window.esTopMetrica = function (m) { ES.topMetrica = m; pintar(); };
  window.esTopCat = function (c) { ES.topCat = c; pintar(); };
  window.esGenCat = function (c) { ES.genCat = c; pintar(); };
  window.esPersona = function (c) { ES.persona = c; pintar(); };

  // ───────── Integración con el panel ─────────
  var original = window.mostrarAdminTab;
  window.mostrarAdminTab = function (nombre) {
    var cont = document.getElementById('contenidoAdmin');
    if (nombre !== 'estadisticas') { if (cont) cont.classList.remove('es-ancho'); return original(nombre); }
    if (!SESION || SESION.permisos !== 'Administrador de sistema') { alert('Acceso exclusivo al administrador de sistema.'); return; }
    ADMIN_TAB_ACTUAL = nombre;
    document.querySelectorAll('[data-admintab]').forEach(function (b) { b.classList.toggle('activo', b.dataset.admintab === nombre); });
    window.renderAdminEstadisticas();
  };
})();
