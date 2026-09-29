// ============================================================
// PORTAL ZWEITE - Emergencias / Guardias / Perfil / Admin
// Depende de app.js: cliente, SESION, DB, val(), escapeHtml()
// ============================================================

// ---------------- NAVEGACION ----------------

async function iniciarPortal() {
  document.getElementById('nombreUsuarioMenu').textContent = SESION.nombre;
  document.getElementById('rolUsuarioMenu').textContent = SESION.permisos;
  document.getElementById('menuCardAdmin').classList.toggle('oculto', SESION.permisos !== 'Administrador de sistema');
  await cargarDirectorioPD();
  mostrarPantalla('menu');
}

async function cargarDirectorioPD() {
  const { data, error } = await cliente.rpc('pd_directorio', { p_token: SESION.token });
  if (!error) {
    DB.directorio = data;
    ['honorarios', 'activos', 'confederados', 'aspirantes', 'conductores', 'jefes', 'todos'].forEach(cat => {
      if (!Array.isArray(DB.directorio[cat]) || !DB.directorio[cat].length) {
        console.warn('pd_directorio: la categoría "' + cat + '" llegó vacía.', DB.directorio);
      }
    });
    return;
  }
  console.error('pd_directorio error:', error);
  DB.directorio = { honorarios: [], activos: [], confederados: [], aspirantes: [], conductores: [], jefes: [], todos: [] };
}

// ============================================================
// BUSCADOR GENERICO DE PERSONAS (por clave radial o por nombre)
// ============================================================

const BUSCADOR_PERSONA_CTX = {};

function tplBuscadorPersona(id, placeholder) {
  return `<div class="buscador-persona">
    <div class="buscador-fila">
      <input type="text" id="busq_${id}" placeholder="${placeholder || 'Buscar por clave o nombre...'}"
        autocomplete="off" oninput="filtrarBuscadorPersona('${id}')" onfocus="filtrarBuscadorPersona('${id}')">
      <button type="button" class="btn-lista-personas" onclick="alternarListaPersonas('${id}')">▾ Lista</button>
    </div>
    <div id="resultados_${id}" class="resultados-busqueda oculto"></div>
  </div>`;
}

function registrarBuscadorPersona(id, lista, onSeleccionar) {
  BUSCADOR_PERSONA_CTX[id] = { lista: lista || [], onSeleccionar };
}

function filtrarBuscadorPersona(id) {
  const ctx = BUSCADOR_PERSONA_CTX[id];
  if (!ctx) return;
  const input = document.getElementById('busq_' + id);
  const cont = document.getElementById('resultados_' + id);
  const q = (input.value || '').trim().toLowerCase();

  const lista = (ctx.lista || []).slice().sort((a, b) =>
    String(a.nombre).localeCompare(String(b.nombre), 'es'));
  const coincidencias = q
    ? lista.filter(p => String(p.clave).toLowerCase().includes(q) || String(p.nombre).toLowerCase().includes(q))
    : lista;

  const cabecera = `<div class="resultados-cabecera">${coincidencias.length} persona(s)${q ? ' encontradas' : ' · desliza para ver más'}</div>`;
  cont.innerHTML = coincidencias.length
    ? cabecera + coincidencias.map(p =>
        `<div class="resultado-item" onclick="seleccionarBuscadorPersona('${id}','${escapeHtml(p.clave)}')">
          ${escapeHtml(p.nombre)} <span class="nota">(${escapeHtml(p.clave)})</span>
        </div>`).join('')
    : '<div class="resultado-item nota">Sin coincidencias.</div>';
  cont.classList.remove('oculto');
}

function alternarListaPersonas(id) {
  const cont = document.getElementById('resultados_' + id);
  if (!cont.classList.contains('oculto')) { cont.classList.add('oculto'); return; }
  document.getElementById('busq_' + id).value = '';
  filtrarBuscadorPersona(id);
}

function seleccionarBuscadorPersona(id, clave) {
  const ctx = BUSCADOR_PERSONA_CTX[id];
  if (!ctx) return;
  const persona = (ctx.lista || []).find(p => String(p.clave) === String(clave));
  if (!persona) return;
  ctx.onSeleccionar(persona);
  const input = document.getElementById('busq_' + id);
  const cont = document.getElementById('resultados_' + id);
  if (input) input.value = '';
  if (cont) { cont.classList.add('oculto'); cont.innerHTML = ''; }
}

document.addEventListener('click', function (e) {
  document.querySelectorAll('.resultados-busqueda:not(.oculto)').forEach(cont => {
    const contenedorPadre = cont.closest('.buscador-persona');
    if (contenedorPadre && !contenedorPadre.contains(e.target)) {
      cont.classList.add('oculto');
    }
  });
});

// ============================================================
// TAGS DE TEXTO SIMPLE
// ============================================================

const TAGS_TEXTO = {};

function tplTagsTexto(id, placeholder) {
  return `<div class="tags-fila-input">
    <input type="text" id="tagIn_${id}" placeholder="${placeholder || 'Escribe y presiona coma o Enter'}"
      oninput="onInputTagsTexto('${id}')" onkeydown="onKeydownTagsTexto('${id}', event)"
      onblur="confirmarTagTexto('${id}')">
  </div>
  <div id="tagLista_${id}" class="tags-contenedor"></div>`;
}

function iniciarTagsTexto(id, valoresIniciales) {
  TAGS_TEXTO[id] = (valoresIniciales || []).slice();
  renderTagsTexto(id);
}

function onInputTagsTexto(id) {
  const input = document.getElementById('tagIn_' + id);
  if (!input.value.includes(',')) return;
  const partes = input.value.split(',');
  const resto = partes.pop();
  partes.map(p => p.trim()).filter(Boolean).forEach(t => TAGS_TEXTO[id].push(t));
  input.value = resto;
  renderTagsTexto(id);
}

function onKeydownTagsTexto(id, e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = document.getElementById('tagIn_' + id);
  const t = input.value.trim();
  if (t) { TAGS_TEXTO[id].push(t); input.value = ''; renderTagsTexto(id); }
}

function confirmarTagTexto(id) {
  const input = document.getElementById('tagIn_' + id);
  if (!input) return;
  const t = input.value.trim();
  if (!t) return;
  if (!TAGS_TEXTO[id]) TAGS_TEXTO[id] = [];
  TAGS_TEXTO[id].push(t);
  input.value = '';
  renderTagsTexto(id);
}

function quitarTagTexto(id, indice) {
  TAGS_TEXTO[id].splice(indice, 1);
  renderTagsTexto(id);
}

function renderTagsTexto(id) {
  const cont = document.getElementById('tagLista_' + id);
  if (!cont) return;
  cont.innerHTML = (TAGS_TEXTO[id] || []).map((t, i) =>
    `<span class="tag-chip">${escapeHtml(t)} <span class="quitar" onclick="quitarTagTexto('${id}',${i})">✕</span></span>`
  ).join('');
}

// ============================================================
// TAGS DE MATERIAL + CANTIDAD
// ============================================================

const TAGS_MATERIAL = {};

function tplTagsMaterial(id) {
  return `<div class="tags-fila-input">
    <input type="text" id="tagMatNombre_${id}" placeholder="Material" style="flex:2;">
    <input type="number" id="tagMatCantidad_${id}" placeholder="Cant." min="1" value="1" style="flex:1;max-width:80px;">
    <button type="button" class="btn-secundario" style="margin-bottom:0;" onclick="agregarTagMaterial('${id}')">+ Agregar</button>
  </div>
  <div id="tagMatLista_${id}" class="tags-contenedor"></div>`;
}

function iniciarTagsMaterial(id) {
  TAGS_MATERIAL[id] = [];
  renderTagsMaterial(id);
}

function agregarTagMaterial(id) {
  const nombre = val('tagMatNombre_' + id).trim();
  const cantidad = Math.max(1, Number(val('tagMatCantidad_' + id)) || 1);
  if (!nombre) return;
  TAGS_MATERIAL[id].push({ nombre, cantidad });
  document.getElementById('tagMatNombre_' + id).value = '';
  document.getElementById('tagMatCantidad_' + id).value = '1';
  renderTagsMaterial(id);
}

function quitarTagMaterial(id, indice) {
  TAGS_MATERIAL[id].splice(indice, 1);
  renderTagsMaterial(id);
}

function renderTagsMaterial(id) {
  const cont = document.getElementById('tagMatLista_' + id);
  if (!cont) return;
  cont.innerHTML = (TAGS_MATERIAL[id] || []).map((t, i) =>
    `<span class="tag-chip">${escapeHtml(t.nombre)} ×${t.cantidad} <span class="quitar" onclick="quitarTagMaterial('${id}',${i})">✕</span></span>`
  ).join('');
}

function textoTagsMaterial(id) {
  return (TAGS_MATERIAL[id] || []).map(t => `${t.nombre} x${t.cantidad}`).join(', ');
}

// ============================================================
// HORA 24H
// ============================================================

function formatearHora24(campo) {
  const digitos = String(campo.value || '').replace(/\D/g, '').slice(0, 4);
  campo.value = digitos.length > 2 ? digitos.slice(0, 2) + ':' + digitos.slice(2) : digitos;
  const valido = !campo.value || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(campo.value);
  campo.setCustomValidity(valido ? '' : 'Usa horario 24h: HH:MM');
}

function mostrarPantalla(nombre) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.add('oculto'));
  if (nombre === 'menu') { document.getElementById('pantallaMenu').classList.remove('oculto'); return; }
  if (nombre === 'inventario') { document.getElementById('app').classList.remove('oculto'); mostrarTab('mapa'); return; }
  const el = document.getElementById('pantalla' + nombre.charAt(0).toUpperCase() + nombre.slice(1));
  el.classList.remove('oculto');
  if (nombre === 'emergencia') abrirFormularioEmergencia();
  if (nombre === 'guardia') abrirFormularioGuardia();
  if (nombre === 'perfil') abrirPerfil();
  if (nombre === 'admin') mostrarAdminTab('emergencias');
}

function volverAlMenu() { mostrarPantalla('menu'); }

// ============================================================
// EMERGENCIA
// ============================================================

let EMERG_ASISTENTES = { honorarios: [], activos: [], confederados: [], aspirantes: [] };
let EMERG_Mando_COMPANIA = null;
let EMERG_CONDUCTORES = {};

function renderConductorUnidadElegido(u) {
  const cont = document.getElementById('emCond_' + u + '_elegido');
  if (!cont) return;
  const persona = EMERG_CONDUCTORES[u];
  cont.innerHTML = persona
    ? `<div class="persona-elegida"><span>${escapeHtml(persona.nombre)} <span class="nota">(${escapeHtml(persona.clave)})</span></span>
        <span class="quitar" onclick="EMERG_CONDUCTORES['${u}']=null; renderConductorUnidadElegido('${u}');">✕</span></div>`
    : '<p class="nota">Nadie seleccionado aún.</p>';
}

function tplAsistenciaBloque(cat, titulo) {
  return `<div class="mover-maquina">
    <label style="margin-bottom:6px;">${titulo}</label>
    ${tplBuscadorPersona('em_' + cat, 'Buscar por clave o nombre...')}
    <div id="emChips_${cat}" style="margin-top:4px;"></div>
  </div>`;
}

function abrirFormularioEmergencia() {
  const cont = document.getElementById('contenidoEmergencia');
  cont.innerHTML = `
    <label>Fecha de inicio <input type="date" id="emFecha"></label>
    <div class="filtros">
      <label style="flex:1 1 100px;">Hora inicio
        <input type="text" id="emHoraInicio" inputmode="numeric" maxlength="5" placeholder="HH:MM" oninput="formatearHora24(this)"></label>
      <label style="flex:1 1 100px;">Hora término
        <input type="text" id="emHoraTermino" inputmode="numeric" maxlength="5" placeholder="HH:MM" oninput="formatearHora24(this)"></label>
      <label style="flex:1 1 100px;">Hora cierre parte
        <input type="text" id="emHoraCierre" inputmode="numeric" maxlength="5" placeholder="HH:MM" oninput="formatearHora24(this)"></label>
    </div>
    <label>Mando CBPM <input id="emMandoCBPM" placeholder="Clave radial"></label>
    <label style="margin-bottom:6px;">Mando Compañía (OBAC)</label>
    ${tplBuscadorPersona('emMandoCompania', 'Buscar por clave o nombre...')}
    <div id="emMandoCompaniaElegido"></div>

    <label>Máquinas concurrentes (opcional)</label>
    <p class="nota" style="margin:0 0 6px;">Escribe una máquina y presiona <strong>coma ( , )</strong> o <strong>Enter</strong> para agregarla a la lista.</p>
    ${tplTagsTexto('emMaquinas', 'Ej: B1, B2, HX2, R4')}

    <label>Tipo de acto <input id="emTipoActo" placeholder="Ej: 10-5-1"></label>
    <label>Dirección <input id="emDireccion"></label>
    <label>Ciudad <input id="emCiudad" value="Puerto Montt"></label>
    <label>Propietario y RUT <input id="emPropietario"></label>
    <label>Encargado y RUT <input id="emEncargado"></label>
    <label>Número de contacto <input id="emContacto"></label>
    <label>Observaciones / antecedentes <textarea id="emObsAntecedentes" rows="2"></textarea></label>

    <h3 class="categoria-titulo">Material mayor concurrente</h3>
    <div class="filtros">
      <label class="check-fila"><input type="checkbox" class="emMatMayor" value="B-2"> B-2</label>
      <label class="check-fila"><input type="checkbox" class="emMatMayor" value="HX-2"> HX-2</label>
      <label class="check-fila"><input type="checkbox" class="emMatMayor" value="H-2"> H-2</label>
    </div>

    <h3 class="categoria-titulo">Indique si alguna máquina utilizó la bomba interna</h3>
    <div class="filtros">
      <label class="check-fila"><input type="checkbox" id="emBombaB2"> B-2</label>
      <label class="check-fila"><input type="checkbox" id="emBombaHX2"> HX-2</label>
    </div>

    <div id="emUnidadesContenedor"></div>
    <label>Observaciones del material mayor <textarea id="emObsMatMayor" rows="2"></textarea></label>

    <h3 class="categoria-titulo">Asistencia</h3>
    ${tplAsistenciaBloque('honorarios', 'Honorarios')}
    ${tplAsistenciaBloque('activos', 'Activos')}
    ${tplAsistenciaBloque('confederados', 'Canje y participantes')}
    ${tplAsistenciaBloque('aspirantes', 'Aspirantes')}

    <button class="btn-principal" onclick="guardarEmergencia()" style="margin-top:16px;">Guardar y generar parte en PDF</button>
    <p id="emMensaje" class="mensaje"></p>
  `;

  EMERG_ASISTENTES = { honorarios: [], activos: [], confederados: [], aspirantes: [] };
  EMERG_Mando_COMPANIA = null;
  EMERG_CONDUCTORES = {};
  document.getElementById('emMandoCompaniaElegido').innerHTML = '';

  ['honorarios', 'activos', 'confederados', 'aspirantes'].forEach(cat => {
    registrarBuscadorPersona('em_' + cat, DB.directorio[cat], persona => agregarAsistente(cat, persona));
    document.getElementById('emChips_' + cat).innerHTML = '';
  });
  registrarBuscadorPersona('emMandoCompania', DB.directorio.todos, persona => {
    EMERG_Mando_COMPANIA = persona;
    renderMandoCompaniaElegido();
  });

  iniciarTagsTexto('emMaquinas', []);
  document.querySelectorAll('.emMatMayor').forEach(cb => cb.addEventListener('change', renderUnidadesEmergencia));
  renderUnidadesEmergencia();
}

function renderMandoCompaniaElegido() {
  const cont = document.getElementById('emMandoCompaniaElegido');
  cont.innerHTML = EMERG_Mando_COMPANIA
    ? `<div class="persona-elegida"><span>${escapeHtml(EMERG_Mando_COMPANIA.nombre)} <span class="nota">(${escapeHtml(EMERG_Mando_COMPANIA.clave)})</span></span>
        <span class="quitar" onclick="EMERG_Mando_COMPANIA=null; renderMandoCompaniaElegido();">✕</span></div>`
    : '<p class="nota">Nadie seleccionado aún.</p>';
}

function agregarAsistente(cat, persona) {
  if (EMERG_ASISTENTES[cat].some(a => a.clave === persona.clave)) return;
  EMERG_ASISTENTES[cat].push({ clave: persona.clave, nombre: persona.nombre, categoria: cat });
  renderChipsAsistencia(cat);
}

function quitarAsistente(cat, clave) {
  EMERG_ASISTENTES[cat] = EMERG_ASISTENTES[cat].filter(a => a.clave !== clave);
  renderChipsAsistencia(cat);
}

function renderChipsAsistencia(cat) {
  document.getElementById('emChips_' + cat).innerHTML = EMERG_ASISTENTES[cat].map(a =>
    `<span class="tag-chip">${escapeHtml(a.nombre)}
      <span class="quitar" onclick="quitarAsistente('${cat}','${escapeHtml(a.clave)}')">✕</span></span>`
  ).join('') || '<span class="nota">Nadie agregado aún.</span>';
}

function renderUnidadesEmergencia() {
  const seleccionadas = Array.from(document.querySelectorAll('.emMatMayor:checked')).map(cb => cb.value);
  const cont = document.getElementById('emUnidadesContenedor');
  cont.innerHTML = seleccionadas.map(u => {
    const idBusq = 'emCond_' + u;
    return `
    <div class="mover-maquina">
      <h4 class="categoria-titulo">${u}</h4>
      <label style="margin-bottom:6px;">Conductor</label>
      ${tplBuscadorPersona(idBusq, 'Buscar por clave o nombre...')}
      <div id="${idBusq}_elegido"></div>
      <label>Km salida <input id="emKmSalida_${u}" inputmode="numeric"></label>
      <label>Km regreso <input id="emKmRegreso_${u}" inputmode="numeric"></label>
      <label>Material menor utilizado</label>
      ${tplTagsMaterial('emMat_' + u)}
    </div>`;
  }).join('') || '';

  seleccionadas.forEach(u => {
    if (!(u in EMERG_CONDUCTORES)) EMERG_CONDUCTORES[u] = null;
    registrarBuscadorPersona('emCond_' + u, DB.directorio.conductores, persona => {
      EMERG_CONDUCTORES[u] = persona;
      renderConductorUnidadElegido(u);
    });
    renderConductorUnidadElegido(u);
    iniciarTagsMaterial('emMat_' + u);
  });

  if (!seleccionadas.length) {
    cont.innerHTML = '<p class="nota">Marca un material mayor arriba para registrar su conductor, kilometraje y material menor usado.</p>';
  }
}

async function guardarEmergencia() {
  confirmarTagTexto('emMaquinas');
  const msg = document.getElementById('emMensaje');
  msg.textContent = ''; msg.className = 'mensaje';

  const requeridos = {
    emFecha: 'Fecha de inicio', emHoraInicio: 'Hora inicio', emHoraTermino: 'Hora término',
    emHoraCierre: 'Hora cierre parte', emMandoCBPM: 'Mando CBPM',
    emTipoActo: 'Tipo de acto', emDireccion: 'Dirección', emCiudad: 'Ciudad'
  };
  for (const id in requeridos) {
    if (!val(id).trim()) { msg.textContent = 'Falta: ' + requeridos[id]; msg.className = 'mensaje mensaje-error'; return; }
  }
  if (!EMERG_Mando_COMPANIA) {
    msg.textContent = 'Selecciona el Mando de Compañía.'; msg.className = 'mensaje mensaje-error'; return;
  }

  const materialMayor = Array.from(document.querySelectorAll('.emMatMayor:checked')).map(cb => cb.value);
  const bombaInterna = [];
  if (document.getElementById('emBombaB2').checked) bombaInterna.push('B-2');
  if (document.getElementById('emBombaHX2').checked) bombaInterna.push('HX-2');

  const unidades = materialMayor.map(u => ({
    unidad: u,
    conductor: (EMERG_CONDUCTORES[u] && EMERG_CONDUCTORES[u].clave) || null,
    kmSalida: val('emKmSalida_' + u),
    kmRegreso: val('emKmRegreso_' + u),
    bombaInterna: bombaInterna.includes(u),
    materialMenor: textoTagsMaterial('emMat_' + u)
  }));

  const asistentes = [].concat(
    EMERG_ASISTENTES.honorarios, EMERG_ASISTENTES.activos, EMERG_ASISTENTES.confederados, EMERG_ASISTENTES.aspirantes
  );

  const payload = {
    fechaInicio: val('emFecha'), horaInicio: val('emHoraInicio'), horaTermino: val('emHoraTermino'),
    horaCierre: val('emHoraCierre'), mandoCBPM: val('emMandoCBPM'), mandoCompania: EMERG_Mando_COMPANIA.clave,
    maquinas: (TAGS_TEXTO['emMaquinas'] || []).join(', '), tipoActo: val('emTipoActo'), direccion: val('emDireccion'), ciudad: val('emCiudad'),
    propietarioRut: val('emPropietario'), encargadoRut: val('emEncargado'), contacto: val('emContacto'),
    observacionesAntecedentes: val('emObsAntecedentes'), materialMayor, bombaInterna,
    observacionesMaterialMayor: val('emObsMatMayor'), unidades, asistentes
  };

  msg.textContent = 'Guardando...';
  const { data, error } = await cliente.rpc('pd_guardar_emergencia', { p_token: SESION.token, p_datos: payload });
  if (error) { msg.textContent = error.message; msg.className = 'mensaje mensaje-error'; return; }

  msg.textContent = `Parte ${data.codigo} guardado. Generando PDF...`;
  await generarPDFParte(data.id, data.codigo, msg);
}

async function generarPDFParte(parteId, codigo, msg) {
  try {
    const { data: payload, error: e1 } = await cliente.rpc('pd_payload_pdf', { p_token: SESION.token, p_id: parteId });
    if (e1) throw new Error(e1.message);

    const resp = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secreto: CONFIG.APPS_SCRIPT_SECRET, payload })
    });
    const resultado = await resp.json();
    if (!resultado.ok) throw new Error(resultado.error || 'Apps Script devolvió un error desconocido');

    await cliente.rpc('pd_actualizar_pdf', {
      p_token: SESION.token, p_id: parteId, p_estado: 'ok',
      p_slides_url: resultado.slidesUrl, p_pdf_url: resultado.pdfUrl, p_error: null
    });
    msg.innerHTML = `✅ Parte <strong>${escapeHtml(codigo)}</strong> guardado y PDF generado. ` +
      `<a href="${resultado.pdfUrl}" target="_blank" rel="noopener">Abrir PDF</a>`;
    msg.className = 'mensaje';
  } catch (err) {
    const texto = String((err && err.message) || err);
    await cliente.rpc('pd_actualizar_pdf', {
      p_token: SESION.token, p_id: parteId, p_estado: 'error', p_slides_url: null, p_pdf_url: null, p_error: texto
    });
    msg.innerHTML = `⚠️️ El parte <strong>${escapeHtml(codigo)}</strong> quedó guardado, pero el PDF falló: ` +
      `${escapeHtml(texto)}. Avisa al administrador para generarlo manualmente.`;
    msg.className = 'mensaje mensaje-error';
  }
}

// ============================================================
// GUARDIA
// ============================================================

let GUARDIA_ACTUAL = { id: null, version: null };
let GUARDIA_JEFE = null;
let GUARDIA_CONDUCTOR = null;
let GUARDIA_INTEGRANTES = [];

function tplPersonaRolFija(idBase, titulo) {
  return `<div class="mover-maquina" id="bloque_${idBase}">
    <h4 class="categoria-titulo" style="margin-top:0;">${titulo}</h4>
    <div id="${idBase}_elegido"></div>
    ${tplBuscadorPersona(idBase, 'Buscar por clave o nombre...')}
    <div id="${idBase}_campos" class="oculto">
      <div class="filtros">
        <label style="flex:1 1 90px;">Pieza (1-3) <input type="number" id="${idBase}_pieza" min="1" max="3"></label>
        <label style="flex:1 1 90px;">Cama (1-4) <input type="number" id="${idBase}_cama" min="1" max="4"></label>
        <label class="check-fila" style="flex:1 1 100px;align-self:center;"><input type="checkbox" id="${idBase}_turno" checked> ¿Turno?</label>
      </div>
      <label>Observación <input id="${idBase}_obs" placeholder="Opcional..."></label>
    </div>
  </div>`;
}

function abrirFormularioGuardia() {
  const cont = document.getElementById('contenidoGuardia');
  const hoy = new Date().toISOString().slice(0, 10);
  cont.innerHTML = `
    <div class="filtros">
      <label style="flex:1 1 160px;">Fecha <input type="date" id="guFecha" value="${hoy}"></label>
      <label style="flex:1 1 140px;">Tipo
        <select id="guTipo"><option value="Diurna">Diurna</option><option value="Nocturna">Nocturna</option></select>
      </label>
    </div>
    <p id="guEstado" class="nota"></p>

    <h3 class="categoria-titulo">Emergencias del día</h3>
    <div id="guEmergenciasDia"><p class="nota">Selecciona fecha y tipo para ver las emergencias registradas ese día.</p></div>

    ${tplPersonaRolFija('guJefe', 'Jefe de Guardia *')}
    ${tplPersonaRolFija('guConductor', 'Conductor *')}
    <p class="nota" style="margin-top:-6px;">El Jefe de Guardia puede ser también el Conductor.</p>

    <h3 class="categoria-titulo">Resto de Integrantes</h3>
    ${tplBuscadorPersona('guIntegrante', 'Buscar por clave o nombre para agregar...')}
    <div id="guListaIntegrantes"></div>

    <label>Observaciones generales de la guardia <textarea id="guObservaciones" rows="2"></textarea></label>

    <button class="btn-principal" onclick="guardarGuardia()" style="margin-top:16px;">Guardar guardia</button>
    <p id="guMensaje" class="mensaje"></p>
  `;

  GUARDIA_JEFE = null; GUARDIA_CONDUCTOR = null; GUARDIA_INTEGRANTES = [];

  registrarBuscadorPersona('guJefe', DB.directorio.jefes, persona => seleccionarRolFijo('guJefe', persona));
  registrarBuscadorPersona('guConductor', DB.directorio.conductores, persona => seleccionarRolFijo('guConductor', persona));
  registrarBuscadorPersona('guIntegrante', listaDisponibleIntegrantes(), agregarIntegranteGuardia);

  renderRolFijo('guJefe'); renderRolFijo('guConductor'); renderListaIntegrantesGuardia();

  document.getElementById('guFecha').addEventListener('change', cargarGuardiaExistente);
  document.getElementById('guTipo').addEventListener('change', cargarGuardiaExistente);
  cargarGuardiaExistente();
}

function listaDisponibleIntegrantes() {
  const excluidas = new Set([GUARDIA_JEFE && GUARDIA_JEFE.clave, GUARDIA_CONDUCTOR && GUARDIA_CONDUCTOR.clave].filter(Boolean));
  return (DB.directorio.todos || []).filter(p => !excluidas.has(p.clave));
}

function seleccionarRolFijo(idBase, persona) {
  const datos = { clave: persona.clave, nombre: persona.nombre, pieza: '', cama: '', observacion: '', deTurno: true };
  if (idBase === 'guJefe') GUARDIA_JEFE = datos; else GUARDIA_CONDUCTOR = datos;
  GUARDIA_INTEGRANTES = GUARDIA_INTEGRANTES.filter(i => i.clave !== persona.clave);
  renderRolFijo(idBase);
  renderListaIntegrantesGuardia();
  registrarBuscadorPersona('guIntegrante', listaDisponibleIntegrantes(), agregarIntegranteGuardia);
}

function quitarRolFijo(idBase) {
  if (idBase === 'guJefe') GUARDIA_JEFE = null; else GUARDIA_CONDUCTOR = null;
  renderRolFijo(idBase);
  registrarBuscadorPersona('guIntegrante', listaDisponibleIntegrantes(), agregarIntegranteGuardia);
}

function renderRolFijo(idBase) {
  const datos = idBase === 'guJefe' ? GUARDIA_JEFE : GUARDIA_CONDUCTOR;
  const elegido = document.getElementById(idBase + '_elegido');
  const buscador = document.getElementById('busq_' + idBase).closest('.buscador-persona');
  const campos = document.getElementById(idBase + '_campos');

  if (!datos) {
    elegido.innerHTML = '';
    buscador.classList.remove('oculto');
    campos.classList.add('oculto');
    return;
  }
  elegido.innerHTML = `<div class="persona-elegida"><span>${escapeHtml(datos.nombre)} <span class="nota">(${escapeHtml(datos.clave)})</span></span>
    <span class="quitar" onclick="quitarRolFijo('${idBase}')">✕</span></div>`;
  buscador.classList.add('oculto');
  campos.classList.remove('oculto');
  document.getElementById(idBase + '_pieza').value = datos.pieza;
  document.getElementById(idBase + '_cama').value = datos.cama;
  document.getElementById(idBase + '_turno').checked = datos.deTurno;
  document.getElementById(idBase + '_obs').value = datos.observacion;
}

function leerCamposRolFijo(idBase) {
  const datos = idBase === 'guJefe' ? GUARDIA_JEFE : GUARDIA_CONDUCTOR;
  if (!datos) return null;
  datos.pieza = val(idBase + '_pieza');
  datos.cama = val(idBase + '_cama');
  datos.deTurno = document.getElementById(idBase + '_turno').checked;
  datos.observacion = val(idBase + '_obs');
  return datos;
}

async function cargarGuardiaExistente() {
  const fecha = val('guFecha'), tipo = val('guTipo');
  const estado = document.getElementById('guEstado');
  if (!fecha) return;
  estado.textContent = 'Cargando...';

  const [{ data: guardia, error: e1 }, { data: emergencias, error: e2 }] = await Promise.all([
    cliente.rpc('pd_obtener_guardia', { p_token: SESION.token, p_fecha: fecha, p_tipo: tipo }),
    cliente.rpc('pd_emergencias_del_dia', { p_token: SESION.token, p_fecha: fecha })
  ]);

  if (e1) { estado.textContent = e1.message; return; }
  const idsVinculados = new Set((guardia ? guardia.emergencias : []).map(e => e.parte_id));
  document.getElementById('guEmergenciasDia').innerHTML = (!e2 && emergencias && emergencias.length)
    ? emergencias.map(em => `
      <label class="check-fila">
        <input type="checkbox" class="guEmergenciaChk" value="${em.parte_id}" ${idsVinculados.has(em.parte_id) ? 'checked' : ''}>
        ${escapeHtml(em.hora_inicio)} · ${escapeHtml(em.codigo)} · ${escapeHtml(em.tipo_acto)} (Mando: ${escapeHtml(em.mando)})
      </label>`).join('')
    : '<p class="nota">No hay emergencias registradas ese día.</p>';

  GUARDIA_JEFE = null; GUARDIA_CONDUCTOR = null; GUARDIA_INTEGRANTES = [];

  if (guardia) {
    GUARDIA_ACTUAL = { id: guardia.id, version: guardia.version };
    (guardia.integrantes || []).forEach(i => {
      const datos = {
        clave: i.clave, nombre: i.nombre, pieza: i.pieza || '', cama: i.cama || '',
        observacion: i.observacion || '', deTurno: i.de_turno
      };
      if (i.es_jefe) GUARDIA_JEFE = datos;
      else if (i.es_conductor) GUARDIA_CONDUCTOR = datos;
      else GUARDIA_INTEGRANTES.push(datos);
    });
    document.getElementById('guObservaciones').value = guardia.observaciones || '';
    estado.textContent = `Editando guardia existente (v${guardia.version}) — creada por ${guardia.creado_por}.`;
  } else {
    GUARDIA_ACTUAL = { id: null, version: null };
    document.getElementById('guObservaciones').value = '';
    estado.textContent = 'No existe una guardia registrada para esa fecha y tipo. Se creará una nueva.';
  }

  renderRolFijo('guJefe'); renderRolFijo('guConductor'); renderListaIntegrantesGuardia();
  registrarBuscadorPersona('guIntegrante', listaDisponibleIntegrantes(), agregarIntegranteGuardia);
}

function agregarIntegranteGuardia(persona) {
  if (GUARDIA_INTEGRANTES.some(i => i.clave === persona.clave)) return;
  GUARDIA_INTEGRANTES.push({
    clave: persona.clave, nombre: persona.nombre, pieza: '', cama: '', observacion: '', deTurno: true
  });
  renderListaIntegrantesGuardia();
}

function quitarIntegranteGuardia(clave) {
  GUARDIA_INTEGRANTES = GUARDIA_INTEGRANTES.filter(i => i.clave !== clave);
  renderListaIntegrantesGuardia();
}

function actualizarCampoIntegrante(clave, campo, valor) {
  const i = GUARDIA_INTEGRANTES.find(x => x.clave === clave);
  if (i) i[campo] = valor;
}

function renderListaIntegrantesGuardia() {
  const cont = document.getElementById('guListaIntegrantes');
  if (!GUARDIA_INTEGRANTES.length) { cont.innerHTML = '<p class="nota">Aún no agregas integrantes.</p>'; return; }
  cont.innerHTML = GUARDIA_INTEGRANTES.map(i => `
    <div class="item-material" style="align-items:flex-start;flex-wrap:wrap;">
      <div class="item-info">
        <div class="item-nombre">${escapeHtml(i.nombre)} <span class="nota">(${escapeHtml(i.clave)})</span></div>
        <div class="filtros" style="margin-top:6px;">
          <input placeholder="Pieza" value="${escapeHtml(i.pieza)}" style="flex:1 1 90px;"
            oninput="actualizarCampoIntegrante('${escapeHtml(i.clave)}','pieza',this.value)">
          <input placeholder="Cama" value="${escapeHtml(i.cama)}" style="flex:1 1 90px;"
            oninput="actualizarCampoIntegrante('${escapeHtml(i.clave)}','cama',this.value)">
          <label class="check-fila" style="flex:1 1 90px;">
            <input type="checkbox" ${i.deTurno ? 'checked' : ''}
              onchange="actualizarCampoIntegrante('${escapeHtml(i.clave)}','deTurno',this.checked)"> Turno
          </label>
          <input placeholder="Observación" value="${escapeHtml(i.observacion)}" style="flex:2 1 160px;"
            oninput="actualizarCampoIntegrante('${escapeHtml(i.clave)}','observacion',this.value)">
        </div>
        <button type="button" class="btn-secundario" style="margin-top:8px;"
          onclick="quitarIntegranteGuardia('${escapeHtml(i.clave)}')">Quitar</button>
      </div>
    </div>`).join('');
}

async function guardarGuardia() {
  const msg = document.getElementById('guMensaje');
  msg.textContent = ''; msg.className = 'mensaje';

  leerCamposRolFijo('guJefe');
  leerCamposRolFijo('guConductor');

  if (!GUARDIA_JEFE) { msg.textContent = 'Falta el Jefe de Guardia.'; msg.className = 'mensaje mensaje-error'; return; }
  if (!GUARDIA_CONDUCTOR) { msg.textContent = 'Falta el Conductor.'; msg.className = 'mensaje mensaje-error'; return; }

  const mismaClave = GUARDIA_JEFE.clave === GUARDIA_CONDUCTOR.clave;
  const integrantesFinal = [
    { ...GUARDIA_JEFE, esJefe: true, esConductor: mismaClave },
  ];
  if (!mismaClave) integrantesFinal.push({ ...GUARDIA_CONDUCTOR, esJefe: false, esConductor: true });
  GUARDIA_INTEGRANTES.forEach(i => integrantesFinal.push({ ...i, esJefe: false, esConductor: false }));

  const parteIds = Array.from(document.querySelectorAll('.guEmergenciaChk:checked')).map(cb => cb.value);
  const payload = {
    fecha: val('guFecha'), tipo: val('guTipo'), observaciones: val('guObservaciones'),
    versionBase: GUARDIA_ACTUAL.version === null ? null : String(GUARDIA_ACTUAL.version),
    integrantes: integrantesFinal.map(i => ({
      clave: i.clave, esJefe: i.esJefe, esConductor: i.esConductor,
      pieza: i.pieza, cama: i.cama, observacion: i.observacion, deTurno: i.deTurno
    })),
    parteIds
  };

  msg.textContent = 'Guardando...';
  const { data, error } = await cliente.rpc('pd_guardar_guardia', { p_token: SESION.token, p_datos: payload });
  if (error) {
    msg.textContent = error.message.includes('CONFLICTO')
      ? 'Alguien más modificó esta guardia mientras la editabas. Vuelve a cargar la fecha para ver los cambios.'
      : error.message;
    msg.className = 'mensaje mensaje-error';
    return;
  }
  GUARDIA_ACTUAL = { id: data.id, version: data.version };
  msg.textContent = `Guardia ${data.uid} guardada correctamente (v${data.version}).`;
  msg.className = 'mensaje';
}

// ============================================================
// MI PERFIL Y CONFIGURACIÓN DE CUENTA
// ============================================================

let MI_CLAVE_PERFIL = null;

function abrirPerfil() {
  const cont = document.getElementById('contenidoPerfil');
  const hoy = new Date();
  cont.innerHTML = `
    <!-- Sección Separada: Mi Cuenta, Cambio de Foto y Contraseña -->
    <div class="item-material" style="flex-direction:column; align-items:stretch; margin-bottom: 20px; background: var(--color-tarjeta); border: 1px solid var(--color-borde); border-radius: 12px; padding: 16px;">
      <h3 style="margin-top:0; margin-bottom:10px; color: var(--color-primario); font-size: 1rem;">⚙️ Mi Cuenta y Configuración de Perfil</h3>
      <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
        <div id="pfMiAvatarContainer"></div>
        <div>
          <button type="button" class="btn-secundario" onclick="elegirFotoMiPerfil()">📷 Cambiar mi foto</button>
          <p class="nota" style="margin: 4px 0 0;">Actualiza tu foto de perfil visible en los rankings.</p>
        </div>
      </div>
      <form id="formContrasenaPerfil" onsubmit="return cambiarContrasenaPerfilUI(event)" style="border-top: 1px solid var(--color-borde); padding-top: 12px; margin-top: 4px;">
        <h4 style="margin: 0 0 8px; font-size: 0.9rem;">Cambiar contraseña</h4>
        <input id="pfActual" type="password" placeholder="Contraseña actual" required autocomplete="current-password">
        <input id="pfNueva" type="password" placeholder="Contraseña nueva" required autocomplete="new-password">
        <button type="submit" class="btn-secundario" style="width:auto; margin-bottom:0;">Actualizar contraseña</button>
        <p id="pfPassMensaje" class="mensaje" style="margin-top:6px; margin-bottom:0;"></p>
      </form>
    </div>

    <div class="filtros">
      <select id="pfModo">
        <option value="actual">Mes actual</option>
        <option value="mes">Un mes específico</option>
        <option value="anual">Todo el año</option>
      </select>
      <select id="pfMes" class="oculto">
        ${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
          .map((m, i) => `<option value="${i}">${m}</option>`).join('')}
      </select>
      <input id="pfAnio" type="number" class="oculto" style="width:100px;" value="${hoy.getFullYear()}">
      <button class="btn-secundario" onclick="cargarPerfil()">Ver</button>
    </div>
    <input type="file" id="pfFotoInput" accept="image/*" class="oculto" onchange="subirFotoPerfil(this)">
    <p id="pfFotoMensaje" class="mensaje"></p>
    <div id="pfContenido"></div>
  `;
  document.getElementById('pfModo').addEventListener('change', () => {
    const modo = val('pfModo');
    document.getElementById('pfMes').classList.toggle('oculto', modo !== 'mes');
    document.getElementById('pfAnio').classList.toggle('oculto', modo === 'actual');
  });
  cargarPerfil();
}

function elegirFotoMiPerfil() {
  if (!MI_CLAVE_PERFIL) {
    alert('Cargando perfil, intenta de nuevo en un momento.');
    return;
  }
  elegirFotoPerfil(MI_CLAVE_PERFIL);
}

async function cambiarContrasenaPerfilUI(event) {
  event.preventDefault();
  const msg = document.getElementById('pfPassMensaje');
  msg.textContent = 'Guardando...';
  msg.className = 'mensaje';

  const { error } = await cliente.rpc('cambiar_contrasena', {
    p_token: SESION.token, p_actual: val('pfActual'), p_nueva: val('pfNueva')
  });
  if (error) { msg.textContent = error.message; msg.className = 'mensaje mensaje-error'; return false; }

  msg.textContent = 'Contraseña actualizada.';
  document.getElementById('formContrasenaPerfil').reset();
  return false;
}

function rangoPerfil() {
  const modo = val('pfModo'); const hoy = new Date();
  if (modo === 'anual') {
    const anio = Number(val('pfAnio')) || hoy.getFullYear();
    return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
  }
  if (modo === 'mes') {
    const anio = Number(val('pfAnio')) || hoy.getFullYear();
    const mes = Number(val('pfMes'));
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    return { desde: `${anio}-${String(mes + 1).padStart(2, '0')}-01`, hasta: `${anio}-${String(mes + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}` };
  }
  return { desde: null, hasta: null };
}

async function cargarPerfil() {
  const cont = document.getElementById('pfContenido');
  cont.innerHTML = '<p class="nota">Cargando...</p>';
  const { desde, hasta } = rangoPerfil();

  const [{ data: perfil, error: e1 }, { data: podio, error: e2 }] = await Promise.all([
    cliente.rpc('pd_perfil', { p_token: SESION.token, p_clave: null, p_desde: desde, p_hasta: hasta }),
    cliente.rpc('pd_ranking_asistencia', { p_token: SESION.token, p_desde: desde, p_hasta: hasta })
  ]);

  if (e1) { cont.innerHTML = `<p class="mensaje-error">${escapeHtml(e1.message)}</p>`; return; }

  if (!e2 && podio && podio.yo) {
    MI_CLAVE_PERFIL = podio.yo.clave;
    const avatarCont = document.getElementById('pfMiAvatarContainer');
    if (avatarCont) {
      avatarCont.innerHTML = avatarPersona(podio.yo, 56);
    }
  }

  const podioHtml = !e2 ? renderRankingPerfil(podio) : `<p class="mensaje-error">${escapeHtml(e2.message)}</p>`;

  cont.innerHTML = `
    <p class="nota">Del ${formatearFecha(perfil.desde)} al ${formatearFecha(perfil.hasta)}</p>
    <div class="filtros">
      <div class="item-material" style="flex:1 1 140px;flex-direction:column;align-items:flex-start;">
        <strong>Diurna</strong><span class="nota">Vol. ${perfil.diurnaV} · Cond. ${perfil.diurnaC} · Jefe ${perfil.diurnaJ}</span>
      </div>
      <div class="item-material" style="flex:1 1 140px;flex-direction:column;align-items:flex-start;">
        <strong>Nocturna</strong><span class="nota">Vol. ${perfil.nocturnaV} · Cond. ${perfil.nocturnaC} · Jefe ${perfil.nocturnaJ}</span>
      </div>
    </div>
    <div class="filtros">
      <div class="item-material" style="flex:1 1 140px;flex-direction:column;align-items:flex-start;">
        <strong>${perfil.totalGuardias}</strong><span class="nota">Guardias asistidas</span>
      </div>
      <div class="item-material" style="flex:1 1 140px;flex-direction:column;align-items:flex-start;">
        <strong>${perfil.emergenciasEnGuardia}</strong><span class="nota">Emergencias en guardia</span>
      </div>
      <div class="item-material" style="flex:1 1 140px;flex-direction:column;align-items:flex-start;">
        <strong>${perfil.pctAsistencia}%</strong><span class="nota">Asistencia (vs. total)</span>
      </div>
    </div>
    ${podioHtml}
    <h3 class="categoria-titulo">Emergencias fuera de guardia</h3>
    ${perfil.emergenciasFuera.length ? perfil.emergenciasFuera.map(e => `
      <div class="item-material"><div class="item-info">
        <div class="item-nombre">${escapeHtml(e.codigo)}${e.enGuardia ? '<span class="badge badge-success">En guardia</span>' : ''}</div>
        <div class="item-detalle">${formatearFecha(e.fecha)} ·${escapeHtml(e.tipoActo)}</div>
      </div></div>`).join('') : '<p class="nota">No hay emergencias registradas en este período.</p>'}
  `;
}

// ============================================================
// CLASIFICACION DE ASISTENCIA + FOTOS
// ============================================================

let PF_FOTO_CLAVE = null;

function inicialesPersona(nombre) {
  const partes = String(nombre || '?').replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  return ((partes[0] || '?')[0] + ((partes[1] || '')[0] || '')).toUpperCase();
}

function colorPersona(clave) {
  let h = 0;
  String(clave || '').split('').forEach(ch => { h = (h * 31 + ch.charCodeAt(0)) % 360; });
  return `hsl(${h}, 45%, 38%)`;
}

function avatarPersona(p, tam) {
  const t = tam || 44;
  if (p.foto_url) {
    return `<img class="avatar" width="${t}" height="${t}" style="width:${t}px;height:${t}px;" src="${escapeHtml(p.foto_url)}" alt="" loading="lazy">`;
  }
  return `<div class="avatar-ini" style="width:${t}px;height:${t}px;font-size:${Math.round(t * 0.38)}px;background:${colorPersona(p.clave)};">${escapeHtml(inicialesPersona(p.nombre))}</div>`;
}

function botonCamaraPerfil(clave) {
  const esAdmin = SESION.permisos === 'Administrador de sistema';
  if (!esAdmin) return '';
  return `<button type="button" class="gp-cam" title="Cambiar foto" onclick="event.stopPropagation(); elegirFotoPerfil('${escapeHtml(clave)}')">📷</button>`;
}

function claseColorPos(pos) {
  return pos === 1 ? 'gp-oro' : pos === 2 ? 'gp-plata' : pos === 3 ? 'gp-bronce' : 'gp-otro';
}

function filaClasificacion(p, opciones) {
  const o = opciones || {};
  return `<div class="gp-fila ${claseColorPos(p.pos)} ${o.yo ? 'gp-yo' : ''}">
    <div class="gp-pos">P${p.pos}</div>
    ${avatarPersona(p, 38)}
    <div class="gp-info">
      <div class="gp-nombre">${escapeHtml(p.nombre)}</div>
      <div class="gp-detalle">${escapeHtml(o.detalle || p.clave)}</div>
    </div>
    ${botonCamaraPerfil(p.clave)}
    <div class="gp-total">${p.total}<small>emerg.</small></div>
  </div>`;
}

function renderRankingPerfil(r) {
  if (!r) return '';
  const top = r.top || [];
  const yo = r.yo;

  let podioHtml = '';
  if (top.length) {
    const slot = (p, altura) => {
      if (!p) return '<div class="gp-slot gp-vacio"></div>';
      return `<div class="gp-slot ${claseColorPos(p.pos)}">
        <div class="gp-slot-av">${avatarPersona(p, 56)}${botonCamaraPerfil(p.clave)}</div>
        <div class="gp-slot-nombre">${escapeHtml(p.nombre)}</div>
        <div class="gp-slot-total">${p.total} emerg.</div>
        <div class="gp-bloque ${altura}">P${p.pos}</div>
      </div>`;
    };
    podioHtml = `<div class="gp-card"><div class="gp-podio">
      ${slot(top[1], 'gp-h2')}${slot(top[0], 'gp-h1')}${slot(top[2], 'gp-h3')}
    </div></div>`;
  }

  const resto = top.slice(3).map(p => filaClasificacion(p, { yo: yo && p.clave === yo.clave })).join('');

  let torre = '';
  if (yo) {
    const arriba = r.arriba
      ? filaClasificacion(r.arriba, { detalle: `A ${r.arriba.total - yo.total} emergencia(s)` })
      : '<div class="gp-hueco">🏁 Nadie tiene más asistencias que tú en este período.</div>';
    const abajo = r.abajo
      ? filaClasificacion(r.abajo, { detalle: `Te sigue a ${yo.total - r.abajo.total} emergencia(s)` })
      : '<div class="gp-hueco">Nadie tiene menos asistencias que tú.</div>';
    torre = `<h3 class="categoria-titulo gp-titulo">Tu posición</h3>
      <div class="gp-torre">
        ${arriba}
        ${filaClasificacion(yo, { yo: true })}
        ${abajo}
      </div>
      <button type="button" class="btn-secundario" style="margin-top:10px;" onclick="elegirFotoPerfil('${escapeHtml(yo.clave)}')">📷 Cambiar mi foto</button>`;
  }

  const sinDatos = !top.length ? '<p class="nota">Todavía no hay asistencias registradas en este período.</p>' : '';

  return `<h3 class="categoria-titulo gp-titulo">🏆 Clasificación de asistencia</h3>
    <p class="nota" style="margin-top:0;">Emergencias asistidas en el período.</p>
    ${sinDatos}${podioHtml}
    <div class="gp-torre">${resto}</div>
    ${torre}`;
}

function elegirFotoPerfil(clave) {
  PF_FOTO_CLAVE = clave;
  document.getElementById('pfFotoInput').click();
}

function recortarCuadrado(file, lado) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = lado;
      canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, lado, lado);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.')), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('El archivo no es una imagen válida.')); };
    img.src = url;
  });
}

async function subirFotoPerfil(input) {
  const file = input.files[0];
  input.value = '';
  const clave = PF_FOTO_CLAVE;
  const msg = document.getElementById('pfFotoMensaje');
  if (!file || !clave) return;

  msg.textContent = 'Subiendo foto...'; msg.className = 'mensaje';
  try {
    const blob = await recortarCuadrado(file, 320);
    const nombreArchivo = 'perfil-' + String(clave).replace(/[^A-Za-z0-9_-]/g, '_') + '-' + Date.now() + '.jpg';
    const { error: eSubida } = await cliente.storage
      .from(CONFIG.NOMBRE_BUCKET_FOTOS)
      .upload(nombreArchivo, new File([blob], nombreArchivo, { type: 'image/jpeg' }), { upsert: true });
    if (eSubida) throw new Error(eSubida.message);

    const { data: urlData } = cliente.storage.from(CONFIG.NOMBRE_BUCKET_FOTOS).getPublicUrl(nombreArchivo);
    const { error } = await cliente.rpc('pd_set_foto_perfil', {
      p_token: SESION.token, p_clave: clave, p_url: urlData.publicUrl
    });
    if (error) throw new Error(error.message);

    msg.textContent = 'Foto actualizada.';
    cargarPerfil();
  } catch (err) {
    msg.textContent = 'No se pudo actualizar la foto: ' + ((err && err.message) || err);
    msg.className = 'mensaje mensaje-error';
  }
}

// ============================================================
// PANEL ADMINISTRADOR
// ============================================================

let ADMIN_TAB_ACTUAL = 'emergencias';

function mostrarAdminTab(nombre) {
  ADMIN_TAB_ACTUAL = nombre;
  document.querySelectorAll('[data-admintab]').forEach(b => b.classList.toggle('activo', b.dataset.admintab === nombre));
  if (nombre === 'emergencias') renderAdminEmergencias();
  if (nombre === 'guardias') renderAdminGuardias();
  if (nombre === 'auditoria') renderAdminAuditoria();
}

function renderAdminEmergencias() {
  const cont = document.getElementById('contenidoAdmin');
  cont.innerHTML = `
    <div class="auditoria-filtros">
      <input id="adEmTexto" placeholder="Buscar por código, dirección, tipo de acto, nombre o clave...">
      <input id="adEmDesde" type="date">
      <input id="adEmHasta" type="date">
      <select id="adEmPruebas">
        <option value="reales">Solo reales</option>
        <option value="pruebas">Solo de prueba</option>
        <option value="todas">Todas</option>
      </select>
      <button class="btn-secundario" onclick="cargarAdminEmergencias()">Filtrar</button>
    </div>
    <div id="adEmLista"></div>
  `;
  ['adEmTexto', 'adEmDesde', 'adEmHasta', 'adEmPruebas'].forEach(id =>
    document.getElementById(id).addEventListener('change', cargarAdminEmergencias));
  cargarAdminEmergencias();
}

async function cargarAdminEmergencias() {
  const lista = document.getElementById('adEmLista');
  lista.innerHTML = '<p class="nota">Cargando...</p>';
  const { data, error } = await cliente.rpc('pd_admin_emergencias', {
    p_token: SESION.token, p_texto: val('adEmTexto') || null,
    p_desde: val('adEmDesde') || null, p_hasta: val('adEmHasta') || null, p_pruebas: val('adEmPruebas')
  });
  if (error) { lista.innerHTML = `<p class="mensaje-error">${escapeHtml(error.message)}</p>`; return; }
  if (!data.length) { lista.innerHTML = '<p class="nota">Sin resultados.</p>'; return; }

  lista.innerHTML = data.map(p => `
    <div class="audit-card" onclick="this.querySelector('.audit-details-preview').classList.toggle('oculto')">
      <div class="audit-header">
        <strong>${escapeHtml(p.codigo)}</strong>
        <span class="badge ${p.es_prueba ? 'badge-warning' : 'badge-success'}">${p.es_prueba ? 'PRUEBA' : 'REAL'}</span>
        <span class="badge ${p.pdf_estado === 'ok' ? 'badge-success' : p.pdf_estado === 'error' ? 'badge-danger' : 'badge-warning'}">PDF: ${escapeHtml(p.pdf_estado)}</span>
      </div>
      <div class="audit-meta">
        <span>${formatearFecha(p.fecha_inicio)} ${escapeHtml(p.hora_inicio ? p.hora_inicio.slice(0,5) : '')}</span>
        <span>${escapeHtml(p.tipo_acto)}</span>
        <span>${escapeHtml(p.direccion)}</span>
      </div>
      <div class="audit-details-preview oculto">
        <p><strong>Reportado por:</strong> ${escapeHtml(p.reportado_por_nombre)} (${escapeHtml(p.reportado_por)})</p>
        <p><strong>Mando CBPM:</strong> ${escapeHtml(p.mando_cbpm)} · <strong>Mando Compañía:</strong> ${escapeHtml(p.mando_compania)}</p>
        <p><strong>Material mayor:</strong> ${(p.material_mayor || []).join(', ')}</p>
        <button class="btn-secundario" onclick="event.stopPropagation(); marcarPruebaAdmin(${p.id}, ${!p.es_prueba})">
          ${p.es_prueba ? 'Quitar marca de prueba' : 'Marcar como prueba'}
        </button>
      </div>
    </div>
  `).join('');
}

async function marcarPruebaAdmin(id, valor) {
  const { error } = await cliente.rpc('pd_admin_marcar_prueba', { p_token: SESION.token, p_id: id, p_valor: valor });
  if (error) { alert(error.message); return; }
  cargarAdminEmergencias();
}

function renderAdminGuardias() {
  const cont = document.getElementById('contenidoAdmin');
  cont.innerHTML = `
    <div class="auditoria-filtros">
      <input id="adGuDesde" type="date">
      <input id="adGuHasta" type="date">
      <button class="btn-secundario" onclick="cargarAdminGuardias()">Filtrar</button>
    </div>
    <div id="adGuLista"></div>
  `;
  cargarAdminGuardias();
}

async function cargarAdminGuardias() {
  const lista = document.getElementById('adGuLista');
  lista.innerHTML = '<p class="nota">Cargando...</p>';
  const { data, error } = await cliente.rpc('pd_admin_guardias', {
    p_token: SESION.token, p_desde: val('adGuDesde') || null, p_hasta: val('adGuHasta') || null
  });
  if (error) { lista.innerHTML = `<p class="mensaje-error">${escapeHtml(error.message)}</p>`; return; }
  if (!data.length) { lista.innerHTML = '<p class="nota">Sin resultados.</p>'; return; }

  lista.innerHTML = data.map(g => `
    <div class="audit-card" onclick="this.querySelector('.audit-details-preview').classList.toggle('oculto')">
      <div class="audit-header">
        <strong>${escapeHtml(g.uid)}</strong>
        <span class="badge badge-success">v${g.version}</span>
      </div>
      <div class="audit-meta"><span>${formatearFecha(g.fecha)}</span><span>${escapeHtml(g.tipo)}</span></div>
      <div class="audit-details-preview oculto">
        <p><strong>Creada por:</strong> ${escapeHtml(g.creado_por)}</p>
      </div>
    </div>
  `).join('');
}

function renderAdminAuditoria() {
  const cont = document.getElementById('contenidoAdmin');
  cont.innerHTML = `
    <div class="auditoria-filtros">
      <select id="adAuEntidad">
        <option value="">Todo</option>
        <option value="parte">Emergencias</option>
        <option value="guardia">Guardias</option>
      </select>
      <input id="adAuTexto" placeholder="Buscar por nombre, clave...">
      <button class="btn-secundario" onclick="cargarAdminAuditoria()">Filtrar</button>
    </div>
    <div id="adAuLista"></div>
  `;
  cargarAdminAuditoria();
}

async function cargarAdminAuditoria() {
  const lista = document.getElementById('adAuLista');
  lista.innerHTML = '<p class="nota">Cargando...</p>';
  const { data, error } = await cliente.rpc('pd_admin_auditoria', {
    p_token: SESION.token, p_entidad: val('adAuEntidad') || null, p_texto: val('adAuTexto') || null
  });
  if (error) { lista.innerHTML = `<p class="mensaje-error">${escapeHtml(error.message)}</p>`; return; }
  if (!data.length) { lista.innerHTML = '<p class="nota">Sin registros.</p>'; return; }

  lista.innerHTML = data.map(a => `
    <div class="audit-card" onclick="this.querySelector('.audit-details-preview').classList.toggle('oculto')">
      <div class="audit-header">
        <strong>${escapeHtml(a.nombre)}</strong>
        <span class="badge badge-warning">${escapeHtml(a.accion)}</span>
      </div>
      <div class="audit-meta"><span>${new Date(a.fecha).toLocaleString('es-CL')}</span><span>${escapeHtml(a.entidad)}</span></div>
      <div class="audit-details-preview oculto">
        <p><strong>Cambios registrados</strong></p>
      </div>
    </div>
  `).join('');
}

// ============================================================
// GESTIÓN DE PERSONAL EN EL PANEL ADMINISTRADOR
// ============================================================

function mostrarAdminTab(nombre) {
  ADMIN_TAB_ACTUAL = nombre;
  document.querySelectorAll('[data-admintab]').forEach(b => b.classList.toggle('activo', b.dataset.admintab === nombre));
  if (nombre === 'emergencias') renderAdminEmergencias();
  if (nombre === 'guardias') renderAdminGuardias();
  if (nombre === 'auditoria') renderAdminAuditoria();
  if (nombre === 'personal') renderAdminPersonal();
}

function renderAdminPersonal() {
  const cont = document.getElementById('contenidoAdmin');
  cont.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
      <div>
        <h3 style="margin:0;">Gestión de Personal y Usuarios</h3>
        <p class="nota" style="margin:0;">Haz clic en cualquier tarjeta para editar su información o usa el botón para agregar.</p>
      </div>
      <button class="btn-secundario" onclick="abrirModalAdminPersonal('nuevo')" style="margin-bottom:0;">+ Agregar Persona</button>
    </div>
    
    <div class="auditoria-filtros" style="margin-bottom: 15px;">
      <input id="adPerTexto" placeholder="Buscar por nombre, usuario o permisos..." oninput="filtrarListaPersonalAdmin()">
    </div>
    <div id="adPerLista"></div>
  `;
  cargarAdminPersonalLista();
}

let ADMIN_PERSONAL_CACHE = [];

async function cargarAdminPersonalLista() {
  const lista = document.getElementById('adPerLista');
  if (!lista) return;
  lista.innerHTML = '<p class="nota">Cargando personal...</p>';

  const { data, error } = await cliente.rpc('listar_usuarios', { p_token: SESION.token });
  if (error) {
    lista.innerHTML = `<p class="mensaje-error">${escapeHtml(error.message)}</p>`;
    return;
  }
  ADMIN_PERSONAL_CACHE = data || [];
  renderizarTarjetasPersonalAdmin(ADMIN_PERSONAL_CACHE);
}

function filtrarListaPersonalAdmin() {
  const q = (val('adPerTexto') || '').trim().toLowerCase();
  const filtrados = ADMIN_PERSONAL_CACHE.filter(p =>
    (p.nombre_persona || p.nombre || '').toLowerCase().includes(q) ||
    (p.usuario || '').toLowerCase().includes(q) ||
    (p.permisos || '').toLowerCase().includes(q)
  );
  renderizarTarjetasPersonalAdmin(filtrados);
}

function renderizarTarjetasPersonalAdmin(items) {
  const lista = document.getElementById('adPerLista');
  if (!items.length) {
    lista.innerHTML = '<p class="nota">No se encontró personal registrado.</p>';
    return;
  }

  lista.innerHTML = items.map(p => `
    <div class="audit-card" onclick='abrirModalAdminPersonal("editar", ${JSON.stringify(p)})'>
      <div class="audit-header">
        <strong>${escapeHtml(p.nombre_persona || p.nombre)}</strong>
        <span class="badge badge-success">${escapeHtml(p.permisos)}</span>
      </div>
      <div class="audit-meta">
        <span>Usuario/Clave: <strong>${escapeHtml(p.usuario)}</strong></span>
        <span>Categoría: <strong>${escapeHtml(p.categoria || 'activos')}</strong></span>
      </div>
    </div>
  `).join('');
}

function abrirModalAdminPersonal(modo, persona) {
  const modal = document.getElementById('modalAdminPersonal');
  const titulo = document.getElementById('adminPersonalTitulo');
  const btnEliminar = document.getElementById('btnEliminarPersona');
  document.getElementById('adminPersonalMensaje').textContent = '';

  document.getElementById('formAdminPersonal').reset();

  if (modo === 'nuevo') {
    titulo.textContent = 'Registrar Nuevo Personal';
    document.getElementById('apUsuarioOriginal').value = '';
    document.getElementById('apUsuario').disabled = false;
    document.getElementById('apEsEncargado').checked = false;
    document.getElementById('apEsConductor').checked = false;
    document.getElementById('apLista').checked = true;
    document.getElementById('apCategoria').value = 'activos';
    btnEliminar.classList.add('oculto');
  } else {
    titulo.textContent = 'Editar Información de Personal';
    document.getElementById('apUsuarioOriginal').value = persona.usuario;
    document.getElementById('apUsuario').value = persona.usuario;
    document.getElementById('apUsuario').disabled = true;
    document.getElementById('apNombre').value = persona.nombre_persona || persona.nombre || '';
    document.getElementById('apPermisos').value = persona.permisos;
    document.getElementById('apContrasena').value = '';
    document.getElementById('apEsEncargado').checked = persona.es_encargado === true;
    document.getElementById('apEsConductor').checked = persona.es_conductor === true;
    document.getElementById('apLista').checked = persona.lista !== false;
    document.getElementById('apCategoria').value = persona.categoria || 'activos';
    btnEliminar.classList.remove('oculto');
  }
  modal.classList.remove('oculto');
}

function cerrarModalAdminPersonal() {
  document.getElementById('modalAdminPersonal').classList.add('oculto');
}

async function guardarAdminPersonal(event) {
  event.preventDefault();
  const original = val('apUsuarioOriginal');
  const usuario = val('apUsuario').trim();
  const nombre = val('apNombre').trim();
  const contrasena = val('apContrasena');
  const permisos = val('apPermisos');
  const msg = document.getElementById('adminPersonalMensaje');

  msg.textContent = 'Guardando...';
  msg.className = 'mensaje';

  const payload = {
    p_token: SESION.token,
    p_usuario: original ? original : usuario,
    p_nombre: nombre,
    p_contrasena: contrasena ? contrasena : (original ? null : ''),
    p_permisos: permisos,
    p_es_encargado: document.getElementById('apEsEncargado').checked,
    p_es_conductor: document.getElementById('apEsConductor').checked,
    p_lista: document.getElementById('apLista').checked,
    p_categoria: val('apCategoria')
  };

  if (!original && !contrasena) {
    msg.textContent = 'La contraseña es obligatoria para nuevos usuarios.';
    msg.className = 'mensaje mensaje-error';
    return false;
  }

  let error = null;
  if (!original) {
    const res = await cliente.rpc('agregar_usuario', payload);
    error = res.error;
  } else {
    const res = await cliente.rpc('editar_usuario', payload);
    error = res.error;
  }

  if (error) {
    msg.textContent = error.message;
    msg.className = 'mensaje mensaje-error';
    return false;
  }

  msg.textContent = '¡Guardado con éxito!';
  msg.className = 'mensaje';
  setTimeout(() => {
    cerrarModalAdminPersonal();
    cargarAdminPersonalLista();
  }, 800);
  return false;
}

async function eliminarPersonaAdmin() {
  const usuario = val('apUsuarioOriginal');
  if (!usuario) return;
  if (!confirm(`¿Estás seguro de eliminar al usuario "${usuario}" del sistema?`)) return;

  const msg = document.getElementById('adminPersonalMensaje');
  msg.textContent = 'Eliminando...';

  const { error } = await cliente.rpc('eliminar_usuario', {
    p_token: SESION.token,
    p_usuario: usuario
  });

  if (error) {
    msg.textContent = error.message;
    msg.className = 'mensaje mensaje-error';
    return;
  }

  cerrarModalAdminPersonal();
  cargarAdminPersonalLista();
}