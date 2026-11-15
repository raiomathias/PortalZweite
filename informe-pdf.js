// PORTAL ZWEITE · Informe de Ayudantía en PDF (v1.0)
// Genera el informe del período (Desde – Hasta) con el mismo formato del informe oficial:
// membrete, asistencias por acto, mejores asistencias, movimiento de máquinas, asistencia de
// voluntarios, confederados y aspirantes. Se genera en el navegador con jsPDF + autoTable.
// La lógica (calcular / crearDocumento) no toca el DOM, para poder probarla fuera del navegador.
(function (root) {
  'use strict';

  var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var MAQS = ['B-2','H-2','HX-2'];
  var ORDEN_ESP = ['Ejercicio', 'Asamblea', 'Citación'];
  var ACTOS_NOMBRE = {
    '10-0-1': 'Inflamación Ducto Em. de Gases', '10-0-2': 'Llamado Estructural', '10-0-3': 'Llamado Estructural En Altura',
    '10-0-4': 'Llamado Estructural Industrial', '10-0-5': 'Llamado en Estructura Menor', '10-0-6': 'Llamado En Embarcación',
    '10-1-1': 'Incendio Vehículo Menor', '10-1-3': 'Incendio Vehículo Transporte de Carga', '10-2-1': 'Fuego en Basurero',
    '10-3-2': 'Rescate de Persona', '10-4-1': 'Rescate Vehicular Liviano', '10-4-2': 'Resc. Vehic. Pesado o con Mult. Victimas',
    '10-4-3': 'Resc. Vehic. Camión con Mat-Pel', '10-5-1': 'Derrame Hidrocarburo', '10-5-2': 'Incidente con Materiales Peligrosos',
    '10-6-1': 'Verificar Olor a Combustible', '10-6-2': 'Verificar Fuga u Olor a GLP o GNC', '10-6-3': 'Explosión de Gas',
    '10-6-4': 'Explosión de Gas con Fuego', '10-7': 'Llamado Eléctrico', '10-8': 'Llamado No Clasificado', '10-9-1': 'Rescate Animal',
    '10-9-2': 'Desprendimiento Techumbre', '10-9-3': 'Apertura de Inmueble', '10-9-5': 'Servicio por Inundación',
    '10-9-6': 'Servicio de Entrega de Agua', '10-10': 'Incendio Declarado', '10-12': 'Apoyo a Otros Cuerpos de Bomberos',
    '10-14': 'Simulacro', '6-16': 'Falsa Alarma', '6-13': 'Movimientos Fuera de Compañía'
  };

  // ───────── Utilidades ─────────
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function parseISO(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function ultimoDia(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function fechaLarga(iso) { var p = parseISO(iso); return p.d + ' de ' + MESES[p.m - 1].toLowerCase() + ' de ' + p.y; }
  function fechaCorta(iso) { var p = parseISO(iso); return pad2(p.d) + '-' + pad2(p.m) + '-' + p.y; }
  function pct2(n, tot) { return (tot ? n / tot * 100 : 0).toFixed(2).replace('.', ',') + '%'; }
  function pct0(n, tot) { return Math.round(tot ? n / tot * 100 : 0) + '%'; }
  function claveNum(a) { return String(a).split('-').map(Number); }
  function cmpCodigo(a, b) {
    var x = claveNum(a), y = claveNum(b);
    for (var i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); }
    return 0;
  }
  var U = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
  var D = ['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  var C = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
  function palabras(n) {
    if (n < 30) return U[n];
    if (n < 100) { var d = Math.floor(n / 10), u = n % 10; return D[d] + (u ? ' y ' + U[u] : ''); }
    if (n === 100) return 'cien';
    if (n < 1000) { var c = Math.floor(n / 100), r = n % 100; return C[c] + (r ? ' ' + palabras(r) : ''); }
    if (n < 1000000) { var m = Math.floor(n / 1000), r2 = n % 1000; return (m === 1 ? 'mil' : palabras(m) + ' mil') + (r2 ? ' ' + palabras(r2) : ''); }
    return String(n);
  }

  // Texto del período: "Enero – Junio 2026" si son meses completos, o fechas exactas.
  function periodoTexto(desde, hasta) {
    var a = parseISO(desde), b = parseISO(hasta);
    var completo = a.d === 1 && b.d === ultimoDia(b.y, b.m);
    if (!completo) return fechaCorta(desde) + ' – ' + fechaCorta(hasta);
    if (a.y === b.y && a.m === b.m) return MESES[a.m - 1] + ' ' + a.y;
    if (a.y === b.y) return MESES[a.m - 1] + ' – ' + MESES[b.m - 1] + ' ' + b.y;
    return MESES[a.m - 1] + ' ' + a.y + ' – ' + MESES[b.m - 1] + ' ' + b.y;
  }

  // ───────── Cálculo ─────────
  // partes: [{ acto, mq:[..], as:[[clave,categoria],..] }]  (ya filtrados por período y sin partes de prueba)
  // nombre: function(clave) -> nombre
  function calcular(partes, nombre) {
    var total = partes.length, actos = {}, maq = {}, salidas = 0, asis = { vol: {}, conf: {}, asp: {} };
    MAQS.forEach(function (q) { maq[q] = 0; });
    partes.forEach(function (p) {
      actos[p.acto] = (actos[p.acto] || 0) + 1;
      (p.mq || []).forEach(function (q) { maq[q] = (maq[q] || 0) + 1; salidas++; });
      p.as.forEach(function (a) {
        var g = a[1] === 'confederados' ? asis.conf : a[1] === 'aspirantes' ? asis.asp : asis.vol;
        g[a[0]] = (g[a[0]] || 0) + 1;
      });
    });
    var filasActos = Object.keys(actos).map(function (k) {
      var esCod = /^\d/.test(k);
      return { cod: k, esCod: esCod, desc: esCod ? (ACTOS_NOMBRE[k] || 'Sin descripción') : k, n: actos[k] };
    }).sort(function (a, b) {
      if (a.esCod !== b.esCod) return a.esCod ? 1 : -1;
      if (!a.esCod) return ORDEN_ESP.indexOf(a.cod) - ORDEN_ESP.indexOf(b.cod) || a.cod.localeCompare(b.cod, 'es');
      var ga = claveNum(a.cod)[0] === 10 ? 0 : 1, gb = claveNum(b.cod)[0] === 10 ? 0 : 1;
      return ga - gb || cmpCodigo(a.cod, b.cod);
    });
    var top5 = Object.keys(actos).map(function (k) { return { cod: k, n: actos[k] }; })
      .sort(function (a, b) { return b.n - a.n || a.cod.localeCompare(b.cod, 'es'); }).slice(0, 5);
    function ranking(g) {
      return Object.keys(g).map(function (c) { return { clave: c, nombre: String(nombre(c)), n: g[c] }; })
        .sort(function (a, b) { return b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'); });
    }
    return {
      total: total, salidas: salidas, filasActos: filasActos, top5: top5,
      maq: MAQS.map(function (q) { return { q: q, n: maq[q] || 0 }; }),
      vol: ranking(asis.vol), conf: ranking(asis.conf), asp: ranking(asis.asp)
    };
  }

  // ───────── Dibujo ─────────
  var W = 612, H = 936, ML = 84, MR = 84, CW = W - ML - MR;
  var HDR_Y = 30, BODY_TOP = 126, BODY_BOTTOM = 858;

  function crearDocumento(jsPDF, R, o) {
    var doc = new jsPDF({ unit: 'pt', format: [W, H] });
    var y = BODY_TOP;
    var LH = 14.5;

    function nuevaPagina() { doc.addPage([W, H]); y = BODY_TOP; }
    function hay(h) { if (y + h > BODY_BOTTOM) nuevaPagina(); }

    function parrafo(txt, o2) {
      o2 = o2 || {};
      var x = ML + (o2.sangria || 0), w = CW - (o2.sangria || 0);
      doc.setFont('times', 'normal'); doc.setFontSize(11);
      var prim = o2.primera || 0, lines;
      if (prim) {
        var l0 = doc.splitTextToSize(txt, w - prim)[0] || '';
        lines = [l0].concat(doc.splitTextToSize(txt.slice(l0.length).replace(/^\s+/, ''), w));
      } else lines = doc.splitTextToSize(txt, w);
      hay(Math.min(lines.length, 3) * LH);
      lines.forEach(function (ln, i) {
        if (y + LH > BODY_BOTTOM) nuevaPagina();
        var ind = i === 0 ? prim : 0;
        if (i < lines.length - 1 && ln.indexOf(' ') > 0) doc.text(ln, x + ind, y, { align: 'justify', maxWidth: w - ind });
        else doc.text(ln, x + ind, y);
        y += LH;
      });
      y += o2.despues == null ? 8 : o2.despues;
    }
    function titulo(txt) {
      hay(60);
      doc.setFont('times', 'bold'); doc.setFontSize(11);
      doc.text(txt, ML + 14, y);
      var w = doc.getTextWidth(txt.replace(/^\d+\.\s*/, '')), x0 = ML + 14 + doc.getTextWidth(txt.match(/^\d+\.\s*/) ? txt.match(/^\d+\.\s*/)[0] : '');
      doc.setLineWidth(0.7); doc.line(x0, y + 2, x0 + w, y + 2);
      y += 22;
    }
    function tituloSimple(txt) {
      hay(70);
      doc.setFont('times', 'bold'); doc.setFontSize(10.5);
      doc.text(txt, ML, y);
      doc.setLineWidth(0.7); doc.line(ML, y + 2, ML + doc.getTextWidth(txt), y + 2);
      y += 16;
    }
    function tabla(cfg) {
      var tw = cfg.ancho || CW, m = (W - tw) / 2;
      doc.autoTable({
        startY: y, head: [cfg.head], body: cfg.body, theme: 'grid', tableWidth: tw,
        margin: { top: BODY_TOP, bottom: H - BODY_BOTTOM, left: cfg.centrada === false ? ML : m, right: cfg.centrada === false ? W - ML - tw : m },
        styles: Object.assign({ font: 'helvetica', fontSize: 9, cellPadding: { top: 2.2, bottom: 2.2, left: 4, right: 4 }, lineColor: cfg.lineColor, lineWidth: 0.5, textColor: 20, valign: 'middle' }, cfg.styles || {}),
        headStyles: Object.assign({ fillColor: false, textColor: 20, fontStyle: 'bold', halign: 'center' }, cfg.headStyles || {}),
        columnStyles: cfg.columnStyles, didParseCell: cfg.didParseCell, rowPageBreak: 'avoid'
      });
      y = doc.lastAutoTable.finalY;
    }

    // ── Fecha, título e introducción ──
    var pTxt = periodoTexto(o.desde, o.hasta), dA = parseISO(o.desde), dB = parseISO(o.hasta);
    doc.setFont('times', 'normal'); doc.setFontSize(11);
    doc.text(o.fechaTexto, ML, y); y += 30;
    var tit = o.titulo || ('Informe Ayudantía periodo ' + pTxt);
    doc.setFont('times', 'bold'); doc.setFontSize(12);
    doc.text(tit, W / 2, y, { align: 'center' });
    var tw0 = doc.getTextWidth(tit); doc.setLineWidth(0.8); doc.line(W / 2 - tw0 / 2, y + 2, W / 2 + tw0 / 2, y + 2);
    y += 28;
    var rango = 'entre el ' + fechaLarga(o.desde) + ' y el ' + fechaLarga(o.hasta);
    parrafo('El presente informe tiene como propósito presentar de manera ordenada y detallada los registros correspondientes a los movimientos de máquina y asistencias de los voluntarios durante el período comprendido ' + rango + '.', { primera: 28, despues: 12 });
    parrafo('La información contenida ha sido recopilada a partir de los libros de guardia y los partes de concurrencia, incorporando además todos los actos de servicio y las citaciones de Compañía realizadas en dicho intervalo de tiempo.', { primera: 28, despues: 12 });
    parrafo('Este informe busca entregar una información completa de las actividades operativas desarrolladas durante el período señalado.', { primera: 28, despues: 14 });

    // ── 1. Asistencias ──
    titulo('1.  ASISTENCIAS:');
    parrafo('De un total de ' + R.total + ' actos de servicio, distribuidos de la siguiente manera:', { despues: 6 });
    var cuerpo = R.filasActos.map(function (f) { return [f.cod, f.desc, String(f.n), pct2(f.n, R.total)]; });
    cuerpo.push(['TOTAL', '', String(R.total), '100,00%']);
    tabla({
      head: ['Nomenclatura', 'Acto', 'Cantidad', '%'], body: cuerpo, lineColor: 0,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 82 }, 1: { cellWidth: 222 }, 2: { halign: 'center', cellWidth: 70 }, 3: { halign: 'center', cellWidth: 70 } },
      headStyles: { fillColor: [235, 235, 235] },
      didParseCell: function (d) { if (d.section === 'body' && d.row.index === cuerpo.length - 1) d.cell.styles.fontStyle = 'bold'; }
    });
    y += 18;
    parrafo('Siendo los cinco con mayor frecuencia de concurrencia.', { despues: 10 });
    grafico(R);
    y += 24;

    // ── 2. Mejores asistencias ──
    titulo('2.  MEJORES ASISTENCIAS:');
    parrafo('Los 10 voluntarios con mayor registro de asistencia se presentan en el siguiente cuadro.', { sangria: 14, despues: 8 });
    tabla({
      ancho: 372, head: ['LUGAR', 'NOMBRE', 'CLAVE', 'ASISTENCIA', 'PORCENTAJE'], lineColor: [142, 170, 219],
      body: R.vol.slice(0, 10).map(function (r, i) { return [String(i + 1), r.nombre, r.clave, String(r.n), pct2(r.n, R.total)]; }),
      styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fontSize: 8 },
      columnStyles: { 0: { halign: 'center', cellWidth: 40 }, 1: { cellWidth: 140 }, 2: { halign: 'center', cellWidth: 52 }, 3: { halign: 'center', cellWidth: 65 }, 4: { halign: 'center', cellWidth: 75 } }
    });
    y += 26;

    // ── 3. Movimiento de máquinas ──
    titulo('3.  MOVIMIENTO DE MAQUINAS:');
    var orden = R.maq.slice().sort(function (a, b) { return b.n - a.n; }).filter(function (m) { return m.n > 0; });
    var frase = 'El movimiento de material en actos de servicio fue de ' + palabras(R.salidas) + ' (' + R.salidas + ').';
    if (orden.length >= 2) frase += ' Las unidades ' + orden[0].q + ' y ' + orden[1].q + ' registraron el mayor porcentaje de movimientos.';
    else if (orden.length === 1) frase += ' La unidad ' + orden[0].q + ' registró todos los movimientos.';
    parrafo(frase, { despues: 8 });
    var destacados = orden.slice(0, 2).map(function (m) { return m.q; });
    var cm = R.maq.map(function (m) { return [m.q, String(m.n), pct2(m.n, R.salidas)]; });
    cm.push(['TOTAL', String(R.salidas), '']);
    tabla({
      ancho: 220, head: ['CARRO', 'CANTIDAD', '%'], body: cm, lineColor: 0,
      styles: { halign: 'center', fontStyle: 'bold', fontSize: 9 },
      headStyles: { fillColor: [20, 30, 50], textColor: 255 },
      didParseCell: function (d) {
        if (d.section === 'body' && d.row.index < R.maq.length && destacados.indexOf(R.maq[d.row.index].q) >= 0) d.cell.styles.fillColor = [255, 242, 204];
      }
    });
    y += 24;

    // ── 4. Asistencia total de voluntarios ──
    titulo('4.  ASISTENCIA TOTAL DE VOLUNTARIOS:');
    parrafo('En el siguiente cuadro se presenta el registro de asistencia de todos los voluntarios correspondiente al período comprendido ' + rango + '; se deja constancia que se omiten de la nómina los voluntarios sin participación.', { despues: 8 });
    if (!R.vol.length) parrafo('No se registraron asistencias de voluntarios en el período.');
    else tabla({
      ancho: 400, head: ['LUGAR', 'NOMBRE', 'CLAVE', 'ASISTENCIA', 'PORCENTAJE'], lineColor: [142, 170, 219],
      body: R.vol.map(function (r, i) { return [String(i + 1), r.nombre, r.clave, String(r.n), pct2(r.n, R.total)]; }),
      styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fontSize: 8 },
      columnStyles: { 0: { halign: 'center', cellWidth: 42 }, 1: { cellWidth: 158 }, 2: { halign: 'center', cellWidth: 55 }, 3: { halign: 'center', cellWidth: 65 }, 4: { halign: 'center', cellWidth: 80 } }
    });
    y += 26;

    // ── Confederados y participantes ──
    hay(50 + R.conf.length * 16);
    tituloSimple('ASISTENCIA DE CONFEDERADOS Y PARTICIPANTES');
    if (!R.conf.length) { parrafo('Sin asistencias registradas en el período.'); }
    else {
      tabla({
        ancho: 400, head: ['LUGAR', 'NOMBRE', 'CLAVE', 'ASISTENCIA', 'PORCENTAJE'], lineColor: [142, 170, 219],
        body: R.conf.map(function (r, i) { return [String(i + 1), r.nombre, r.clave, String(r.n), pct0(r.n, R.total)]; }),
        styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fontSize: 8 },
        columnStyles: { 0: { halign: 'center', cellWidth: 42 }, 1: { cellWidth: 158 }, 2: { halign: 'center', cellWidth: 55 }, 3: { halign: 'center', cellWidth: 65 }, 4: { halign: 'center', cellWidth: 80 } }
      });
      y += 20;
    }

    // ── Aspirantes ──
    hay(50 + R.asp.length * 16);
    tituloSimple('ASISTENCIA DE ASPIRANTES');
    if (!R.asp.length) { parrafo('Sin asistencias registradas en el período.'); }
    else {
      tabla({
        ancho: 300, head: ['LUGAR', 'NOMBRE', 'ASISTENCIA'], lineColor: [142, 170, 219],
        body: R.asp.map(function (r, i) { return [String(i + 1), r.nombre, String(r.n)]; }),
        styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fontSize: 8 },
        columnStyles: { 0: { halign: 'center', cellWidth: 45 }, 1: { cellWidth: 165 }, 2: { halign: 'center', cellWidth: 90 } }
      });
      y += 20;
    }

    // ── Firmas en blanco ──
    hay(120); y += 60;
    doc.setLineWidth(0.6); doc.setDrawColor(40);
    [[ML + 30, 'AYUDANTE'], [ML + CW - 30 - 150, 'CAPITÁN']].forEach(function (f) {
      doc.line(f[0], y, f[0] + 150, y);
      doc.setFont('times', 'bold'); doc.setFontSize(10.5);
      doc.text(f[1], f[0] + 75, y + 15, { align: 'center' });
    });

    // ── Membrete y pie en todas las páginas ──
    var A = root.PZ_INFORME_ASSETS, n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      if (A && A.membrete) doc.addImage(A.membrete, 'JPEG', ML, HDR_Y, CW, CW * A.membreteH / A.membreteW);
      doc.setDrawColor(0); doc.setLineWidth(0.6); doc.line(ML, H - 62, W - MR, H - 62);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0);
      doc.text('San Felipe Nº122 – fono 65-2252888', W / 2, H - 46, { align: 'center' });
      doc.setTextColor(5, 99, 193);
      doc.textWithLink('www.segundapuertomontt.cl', W / 2, H - 33, { align: 'center', url: 'http://www.segundapuertomontt.cl' });
      var lw = doc.getTextWidth('www.segundapuertomontt.cl'); doc.setDrawColor(5, 99, 193); doc.setLineWidth(0.5); doc.line(W / 2 - lw / 2, H - 31, W / 2 + lw / 2, H - 31);
      doc.setTextColor(0); doc.setDrawColor(0);
    }
    return doc;

    // Gráfico de columnas: los cinco actos más frecuentes.
    function grafico(R2) {
      var bw = 300, bh = 170;
      hay(bh + 10);
      var x0 = (W - bw) / 2, y0 = y;
      doc.setDrawColor(217, 217, 217); doc.setLineWidth(0.8); doc.rect(x0, y0, bw, bh);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(89, 89, 89);
      doc.text('ACTOS DE SERVICIO', W / 2, y0 + 24, { align: 'center', charSpace: 1.2 });
      var base = y0 + bh - 24, tope = y0 + 48, alto = base - tope - 22;
      var mx = Math.max.apply(null, R2.top5.map(function (t) { return t.n; })) || 1;
      var slot = (bw - 20) / Math.max(R2.top5.length, 1);
      doc.setDrawColor(217, 217, 217); doc.setLineWidth(0.5); doc.line(x0 + 10, base, x0 + bw - 10, base);
      R2.top5.forEach(function (t, i) {
        var cx = x0 + 10 + slot * i, h = Math.max(alto * t.n / mx, 2), bx = cx + slot / 2 - 4;
        if (i > 0) { doc.setDrawColor(235, 235, 235); doc.line(cx, tope, cx, base); }
        doc.setFillColor(68, 114, 196); doc.rect(bx, base - h, 8, h, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 110, 110);
        doc.text(String(t.n), bx + 3, base - h - 3, { angle: 90 });
        doc.setTextColor(170, 170, 170);
        doc.text(pct0(t.n, R2.total), bx + 17, base - 3, { angle: 90 });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(110, 110, 110);
        doc.text(/^\d/.test(t.cod) ? t.cod : t.cod.toUpperCase(), cx + slot / 2, base + 12, { align: 'center', charSpace: 0.8 });
      });
      doc.setTextColor(0); doc.setDrawColor(0);
      y = y0 + bh;
    }
  }

  // ───────── Utilidades públicas ─────────
  function fechaHoyTexto() {
    var d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    return 'Puerto Montt, ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
  }

  root.PZInforme = { calcular: calcular, crearDocumento: crearDocumento, periodoTexto: periodoTexto, fechaHoyTexto: fechaHoyTexto, palabras: palabras };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PZInforme;
})(typeof window !== 'undefined' ? window : globalThis);
