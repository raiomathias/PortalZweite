// PORTAL ZWEITE · Parte de Emergencia en PDF (v1.0)
// Genera en el navegador el parte «Partes con lista asistencias y emergencias» (2 hojas, 612 x 936 pt)
// sobre el formulario oficial (parte-fondo-1.jpg / parte-fondo-2.jpg), rellenando los datos
// automáticamente y marcando con una X la casilla de cada persona que figura en la asistencia.
// La lógica (crearDocumento) no toca el DOM, para poder probarla fuera del navegador.
(function (root) {
  'use strict';

  var W = 612, H = 936;
  var GRIS = [89, 89, 89];          // color del texto rellenado, igual al parte original
  var TAM = 8.85;                    // tamaño base del texto de los campos
  var AJUSTE = 1.9;                  // de la línea inferior de la caja de texto a la línea base

  // Centro (x, y) de la casilla de asistencia de cada clave en la hoja 2.
  var CASILLAS = {
    "244-I":[62.0,203.2],"211":[62.0,216.0],"213-I":[62.0,229.7],"261":[62.0,242.9],"225":[62.0,256.0],"274-I":[62.0,269.4],"281":[62.0,282.7],
    "268":[62.0,295.7],"219":[62.0,308.7],"221":[62.0,322.0],"218":[62.0,335.5],"222-I":[62.0,348.5],"227":[62.0,361.8],"271":[62.0,375.2],
    "298":[62.0,388.3],"276":[62.0,401.5],"215":[62.0,415.0],"232":[62.0,428.0],"228":[62.0,441.3],"229-I":[62.0,454.8],"231":[62.0,467.8],
    "265":[62.0,481.1],"290":[62.0,494.5],"235":[62.0,507.6],"234":[62.0,520.8],"258":[62.0,534.5],"239":[62.0,547.3],"240":[62.0,560.6],
    "247":[62.0,573.8],"245-I":[62.0,586.9],"242":[62.0,600.3],"236":[62.0,613.6],"249":[62.0,626.6],"270":[62.0,640.1],"230":[62.0,653.4],
    "250":[62.0,666.4],"252":[62.0,679.9],"253":[62.0,693.1],"295":[230.9,189.9],"278":[230.9,203.2],"226":[230.9,216.0],"257-I":[230.9,229.7],
    "260":[230.9,242.9],"264":[230.9,256.0],"266":[230.9,269.0],"220":[230.9,282.2],"248":[230.9,295.5],"210":[230.9,322.0],"275":[230.9,335.3],
    "277":[230.9,348.0],"283":[230.9,361.8],"274":[230.9,375.0],"297":[230.9,387.8],"224":[230.9,401.1],"229":[230.9,414.3],"244":[230.9,427.8],
    "216":[230.9,440.8],"287":[230.9,454.1],"263":[230.9,467.6],"293":[230.9,480.6],"256":[230.9,493.9],"212":[230.9,507.3],"273":[230.9,520.4],
    "291":[230.9,533.6],"284":[230.9,547.1],"222":[230.9,560.1],"294":[230.9,573.4],"245":[230.9,586.9],"237":[230.9,599.9],"299":[230.9,613.1],
    "243":[230.9,626.6],"214":[230.9,639.7],"257":[230.9,652.9],"262":[230.9,666.2],"238":[230.9,679.2],"213":[230.9,692.2],"267":[391.6,189.9],
    "255":[391.6,203.2],"254":[391.6,216.0],"233":[391.6,229.7],"288":[391.6,242.9],"251":[391.6,256.0],"223":[391.6,269.4],"241":[391.6,282.7],
    "280":[391.6,295.7],"269":[391.6,308.7],"286":[391.6,322.0],"292":[391.6,335.5],"259":[391.6,348.5],"217":[391.6,361.8],"246":[391.6,375.2],
    "285":[391.6,388.3],"272":[391.6,401.5],"296":[391.6,415.0],"282":[391.6,428.0],"289":[391.6,441.3],"234-B":[391.6,467.8],"239-B":[391.6,481.1],
    "236-B":[391.6,494.5],"238-B":[391.6,507.6],"232-B":[391.6,520.8],"235-B":[391.6,534.5],"233-B":[391.6,547.3],"237-B":[391.6,560.6],
    "Asp-1":[391.6,586.9],"Asp-2":[391.6,600.3],"Asp-3":[391.6,613.6],"Asp-4":[391.6,626.6]
  };

  // Columnas de material mayor / material menor por unidad.
  var UNIDADES = [
    { clave: 'B2',  mx: 145.6, mmx: 62.2 },
    { clave: 'H2',  mx: 285.4, mmx: 232.2 },
    { clave: 'HX2', mx: 424.9, mmx: 395.4 }
  ];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fechaDMA(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
  }
  function txt(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }

  function crearDocumento(jsPDF, P, fondos) {
    P = P || {};
    var doc = new jsPDF({ unit: 'pt', format: [W, H], compress: true });

    // ───────── Hoja 1 ─────────
    doc.addImage(fondos[0], 'JPEG', 0, 0, W, H, undefined, 'FAST');
    doc.setFont('helvetica', 'normal'); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);

    // Escribe una línea con su base en yInf - AJUSTE; si no cabe en maxW, reduce el tamaño y, de ser necesario, recorta.
    function t(valor, x, yInf, maxW, tam, minTam) {
      var s = txt(valor); if (!s) return;
      var sz = tam || TAM, min = minTam || 6;
      doc.setFontSize(sz);
      while (maxW && doc.getTextWidth(s) > maxW && sz > min) { sz -= 0.25; doc.setFontSize(sz); }
      if (maxW && doc.getTextWidth(s) > maxW) {
        while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1);
        s += '…';
      }
      doc.text(s, x, yInf - AJUSTE);
    }
    // Texto multilínea dentro de un ancho dado; lineas = [yInf, yInf, ...]
    function bloque(valor, x, ys, maxW, tam) {
      var s = txt(valor); if (!s) return;
      doc.setFontSize(tam || TAM);
      var lineas = doc.splitTextToSize(s, maxW);
      if (lineas.length > ys.length) {
        lineas = lineas.slice(0, ys.length);
        var u = lineas[ys.length - 1];
        while (u.length > 1 && doc.getTextWidth(u + '…') > maxW) u = u.slice(0, -1);
        lineas[ys.length - 1] = u + '…';
      }
      lineas.forEach(function (l, i) { doc.text(l, x, ys[i] - AJUSTE); });
    }

    // El fondo trae separadores de plantilla («/ /» y «:») en fecha y horas: se tapan antes de escribir.
    doc.setFillColor(255, 255, 255);
    [[179.6, 192.4], [192.4, 205.2], [205.2, 217.6], [217.6, 230.4]].forEach(function (f) {
      doc.rect(128.4, f[0] + 0.9, 94.2, f[1] - f[0] - 1.8, 'F');
    });
    doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);

    // Encabezado
    t(P.idParte, 133.6, 178.7, 56);
    t(P.filaReporte, 193.0, 178.7, 22);
    t(fechaDMA(P.fechaInicio), 132.1, 191.2, 70);
    t(P.horaInicio, 130.9, 204.5, 70);
    t(P.horaTermino, 130.9, 216.7, 70);
    t(P.horaCierreParte, 130.9, 229.4, 70);
    t(P.mandoCBPM, 250.3, 191.2, 120);
    t(P.mandoCompania, 398.2, 191.2, 150);
    bloque(P.maquinas, 245.6, [216.7, 229.4], 140);

    // Antecedentes
    t(P.tipoActo, 145.6, 273.7, 122);
    t(P.direccion, 145.6, 287.0, 250);
    t(P.ciudad, 463.0, 287.0, 90);
    t(P.propietarioRut, 145.6, 300.2, 250);
    t(P.encargadoRut, 145.6, 313.4, 250);
    t(P.contacto, 145.6, 339.2, 122);
    bloque(P.observacionesAntecedentes, 145.6, [350.0, 361.7], 405);

    // Material mayor y material menor por unidad
    UNIDADES.forEach(function (u) {
      var con = txt(P['conductor' + u.clave]), km = txt(P['kmRegreso' + u.clave]), mm = txt(P['materialMenor' + u.clave]);
      var usa = con || km || mm;
      if (!usa) return;
      t(con, u.mx, 662.2, 128);
      var nom = u.clave.replace(/^([A-Z]+)(\d)$/, '$1-$2');
      var bi = ',' + txt(P.bombaInterna).replace(/\s+/g, '') + ',';
      t(bi.indexOf(',' + nom + ',') >= 0 ? 'SI' : 'NO', u.mx, 676.0, 128);
      t(km, u.mx, 689.0, 128);
      bloque(mm, u.mmx, [756.1, 767.5, 778.9, 790.3, 801.7, 813.1], 126);
    });
    t(P.observacionesMaterialMayor, 145.6, 715.0, 405);

    // ───────── Hoja 2 ─────────
    doc.addPage([W, H]);
    doc.addImage(fondos[1], 'JPEG', 0, 0, W, H, undefined, 'FAST');
    // X en la casilla de cada persona presente
    var claves = (P.asistenciaClaves || []).map(function (c) { return txt(c); });
    var marcadas = {};
    doc.setDrawColor(0); doc.setLineWidth(1.3); doc.setLineCap('round');
    claves.forEach(function (c) {
      var p = CASILLAS[c]; if (!p || marcadas[c]) return;
      marcadas[c] = true;
      var r = 3.6;
      doc.line(p[0] - r, p[1] - r, p[0] + r, p[1] + r);
      doc.line(p[0] - r, p[1] + r, p[0] + r, p[1] - r);
    });

    // Responsable del parte y oficial o voluntario a cargo
    doc.setFont('helvetica', 'normal'); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
    var ses = P.sesion || {};
    var resp = [txt(ses.nombre), txt(ses.clave)].filter(Boolean).join(' ');
    var mando = txt(P.mandoCompania);
    var nomMando = mando && P.nombresPorClave ? txt(P.nombresPorClave[mando]) : '';
    var oficial = [nomMando, mando].filter(Boolean).join(' ');
    t(resp, 107.7, 814.2, 166, 14, 8);
    t(oficial, 367.3, 814.2, 178, 14, 8);

    doc.setTextColor(0);
    return doc;
  }

  // Nombre de archivo: Parte_2026-057_05-10-2026_Direccion.pdf
  function nombreArchivo(P) {
    var f = /^(\d{4})-(\d{2})-(\d{2})/.exec((P && P.fechaInicio) || '');
    var fecha = f ? f[3] + '-' + f[2] + '-' + f[1] : '';
    var dir = txt(P && P.direccion).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
    return ['Parte', txt(P && P.idParte), fecha, dir].filter(Boolean).join('_') + '.pdf';
  }

  root.PZParte = { crearDocumento: crearDocumento, nombreArchivo: nombreArchivo, CASILLAS: CASILLAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PZParte;
})(typeof window !== 'undefined' ? window : globalThis);
