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
    // Aviso temprano si el backend devolvió algo pero alguna categoría vino vacía,
    // para no volver a depurar "a ciegas" por qué no aparece nadie en las listas.
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
// Reemplaza los <select> gigantes por un campo de texto con resultados
// en vivo. Se usa tanto para agregar asistencia (multiple) como para
// elegir Mando de Compañía, Jefe de Guardia y Conductor (unico).

const BUSCADOR_PERSONA_CTX = {};

/** tipo: 'multi' (agrega a un array y sigue mostrando el buscador) o
 *  'unico' (reemplaza una selección única y oculta el buscador). */
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

  // Sin texto: se muestra la lista completa (scrolleable). Con texto: se filtra por clave o nombre.
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

/** Botón "▾ Lista": abre/cierra el desplegable completo sin necesidad de escribir. */
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

// Cierra cualquier dropdown de resultados si se hace clic fuera de él.
document.addEventListener('click', function (e) {
  document.querySelectorAll('.resultados-busqueda:not(.oculto)').forEach(cont => {
    const contenedorPadre = cont.closest('.buscador-persona');
    if (contenedorPadre && !contenedorPadre.contains(e.target)) {
      cont.classList.add('oculto');
    }
  });
});

// ============================================================
// TAGS DE TEXTO SIMPLE (ej: Máquinas concurrentes)
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

/** Convierte en tag el texto que quedó escrito sin coma ni Enter. */
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
// TAGS DE MATERIAL + CANTIDAD (Material menor utilizado)
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
// HORA EN TEXTO FORZADO A FORMATO 24H (evita el selector nativo
// de 12h/AM-PM que algunos celulares muestran para type="time")
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

function opcionesPersonas(lista) {
  return '<option value="">-- Selecciona --</option>' +
    (lista || []).map(p => `<option value="${escapeHtml(p.clave)}">${escapeHtml(p.nombreConClave)}</option>`).join('');
}

// ============================================================
// EMERGENCIA
// ============================================================

let EMERG_ASISTENTES = { honorarios: [], activos: [], confederados: [], aspirantes: [] };
let EMERG_MANDO_COMPANIA = null; // { clave, nombre }
let EMERG_CONDUCTORES = {}; // { 'B-2': {clave,nombre} | null, ... }

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
    <p class="nota" style="margin:0 0 6px;">Escribe una máquina y presiona <strong>coma ( , )</strong> o <strong>Enter</strong> para agregarla a la lista. Repite con cada máquina.</p>
    ${tplTagsTexto('emMaquinas', 'Ej: B1, B2, HX2, R4')}

    <label>Tipo de acto <input id="emTipoActo" placeholder="Ej: 10-5-1"></label>
    <label>Dirección <input id="emDireccion"></label>
    <label>Ciudad <input id="emCiudad" value="Puerto Montt"></label>
    <label>Propietario y RUT <input id="emPropietario"></label>
    <label>Encargado y RUT <input id="emEncargado"></label>
    <label>Número de contacto <input id="emContacto"></label>
    <label>Observaciones / antecedentes <textarea id="emObsAntecedentes" rows="2"></textarea></label>

    <h3 class="categoria-titulo">Material mayor concurrente</h3>
    <p class="nota">Opcional — deja todo sin marcar si el parte no involucró máquinas (ej. asambleas).</p>
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
  EMERG_MANDO_COMPANIA = null;
  EMERG_CONDUCTORES = {};
  document.getElementById('emMandoCompaniaElegido').innerHTML = '';

  ['honorarios', 'activos', 'confederados', 'aspirantes'].forEach(cat => {
    registrarBuscadorPersona('em_' + cat, DB.directorio[cat], persona => agregarAsistente(cat, persona));
    document.getElementById('emChips_' + cat).innerHTML = '';
  });
  registrarBuscadorPersona('emMandoCompania', DB.directorio.todos, persona => {
    EMERG_MANDO_COMPANIA = persona;
    renderMandoCompaniaElegido();
  });

  iniciarTagsTexto('emMaquinas', []);
  document.querySelectorAll('.emMatMayor').forEach(cb => cb.addEventListener('change', renderUnidadesEmergencia));
  renderUnidadesEmergencia();
}

function renderMandoCompaniaElegido() {
  const cont = document.getElementById('emMandoCompaniaElegido');
  cont.innerHTML = EMERG_MANDO_COMPANIA
    ? `<div class="persona-elegida"><span>${escapeHtml(EMERG_MANDO_COMPANIA.nombre)} <span class="nota">(${escapeHtml(EMERG_MANDO_COMPANIA.clave)})</span></span>
        <span class="quitar" onclick="EMERG_MANDO_COMPANIA=null; renderMandoCompaniaElegido();">✕</span></div>`
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
  confirmarTagTexto('emMaquinas'); // si quedó una máquina escrita sin coma, se agrega igual
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
  if (!EMERG_MANDO_COMPANIA) {
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
    horaCierre: val('emHoraCierre'), mandoCBPM: val('emMandoCBPM'), mandoCompania: EMERG_MANDO_COMPANIA.clave,
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
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita el preflight CORS en Apps Script
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
    msg.innerHTML = `⚠️ El parte <strong>${escapeHtml(codigo)}</strong> quedó guardado: ` +
      `${escapeHtml(texto)}..`;
    msg.className = 'mensaje mensaje-error';
  }
}

// ============================================================
// GUARDIA
// ============================================================

let GUARDIA_ACTUAL = { id: null, version: null };
let GUARDIA_JEFE = null;      // { clave, nombre, pieza, cama, observacion, deTurno }
let GUARDIA_CONDUCTOR = null; // idem
let GUARDIA_INTEGRANTES = []; // idem, sin esJefe/esConductor (siempre resto de la lista)

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

/** Cualquiera del directorio general, excepto quien ya sea Jefe o Conductor. */
function listaDisponibleIntegrantes() {
  const excluidas = new Set([GUARDIA_JEFE && GUARDIA_JEFE.clave, GUARDIA_CONDUCTOR && GUARDIA_CONDUCTOR.clave].filter(Boolean));
  return (DB.directorio.todos || []).filter(p => !excluidas.has(p.clave));
}

function seleccionarRolFijo(idBase, persona) {
  const datos = { clave: persona.clave, nombre: persona.nombre, pieza: '', cama: '', observacion: '', deTurno: true };
  if (idBase === 'guJefe') GUARDIA_JEFE = datos; else GUARDIA_CONDUCTOR = datos;
  // Si esa persona ya estaba como integrante suelto, se saca de ahí (ahora tiene un rol fijo).
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
    estado.textContent = `Editando guardia existente (v${guardia.version}) — creada por ${guardia.creado_por}. Guardar la actualizará.`;
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
// MI PERFIL
// ============================================================

function abrirPerfil() {
  const cont = document.getElementById('contenidoPerfil');
  const hoy = new Date();
  cont.innerHTML = `
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
    <div id="pfContenido"></div>
  `;
  document.getElementById('pfModo').addEventListener('change', () => {
    const modo = val('pfModo');
    document.getElementById('pfMes').classList.toggle('oculto', modo !== 'mes');
    document.getElementById('pfAnio').classList.toggle('oculto', modo === 'actual');
  });
  cargarPerfil();
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
  return { desde: null, hasta: null }; // mes actual: el backend usa el mes calendario en curso
}

async function cargarPerfil() {
  const cont = document.getElementById('pfContenido');
  cont.innerHTML = '<p class="nota">Cargando...</p>';
  const { desde, hasta } = rangoPerfil();

  const [{ data: perfil, error: e1 }, { data: podio, error: e2 }] = await Promise.all([
    cliente.rpc('pd_perfil', { p_token: SESION.token, p_clave: null, p_desde: desde, p_hasta: hasta }),
    cliente.rpc('pd_top3_podio', { p_token: SESION.token, p_desde: desde, p_hasta: hasta })
  ]);

  if (e1) { cont.innerHTML = `<p class="mensaje-error">${escapeHtml(e1.message)}</p>`; return; }

  const podioHtml = (!e2 && podio && podio.length)
    ? '<h3 class="categoria-titulo">🏆 Podio del período</h3>' + podio.map((p, idx) =>
        `<div class="item-material"><div class="item-info"><div class="item-nombre">${'🥇🥈🥉'[idx] || ''} ${escapeHtml(p.nombre)}</div>
         <div class="item-detalle">${p.total} guardia(s)</div></div></div>`).join('')
    : '';

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
        <strong>${perfil.pctAsistencia}%</strong><span class="nota">Asistencia (vs. total de guardias del período)</span>
      </div>
    </div>
    ${podioHtml}
    <h3 class="categoria-titulo">Emergencias fuera de guardia</h3>
    ${perfil.emergenciasFuera.length ? perfil.emergenciasFuera.map(e => `
      <div class="item-material"><div class="item-info">
        <div class="item-nombre">${escapeHtml(e.codigo)} ${e.enGuardia ? '<span class="badge badge-success">En guardia</span>' : ''}</div>
        <div class="item-detalle">${formatearFecha(e.fecha)} · ${escapeHtml(e.tipoActo)}</div>
      </div></div>`).join('') : '<p class="nota">No hay emergencias registradas en este período.</p>'}
  `;
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
        <p><strong>Material mayor:</strong> ${(p.material_mayor || []).join(', ')} · <strong>Bomba interna:</strong> ${(p.bomba_interna || []).join(', ') || '—'}</p>
        <p><strong>Unidades:</strong></p>
        <div class="audit-diff-box">${(p.unidades || []).map(u =>
          `${u.unidad}: conductor ${u.conductor || '—'}, km ${u.km_salida || '—'} → ${u.km_regreso || '—'}, material: ${u.material_menor || '—'}`
        ).join('\n') || 'Sin unidades registradas.'}</div>
        <p><strong>Asistencia:</strong> ${(p.asistentes || []).map(a => a.nombre).join(', ') || '—'}</p>
        ${p.pdf_url ? `<p><a href="${p.pdf_url}" target="_blank" rel="noopener">Abrir PDF</a></p>` : ''}
        ${p.pdf_estado === 'error' ? `<p class="mensaje-error">Error PDF: ${escapeHtml(p.pdf_error || '')}</p>` : ''}
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
        <p><strong>Última modificación:</strong> ${escapeHtml(g.modificado_por)}</p>
        <p><strong>Integrantes:</strong></p>
        <div class="audit-diff-box">${(g.integrantes || []).map(i =>
          `${i.nombre}${i.es_jefe ? ' (Jefe)' : ''}${i.es_conductor ? ' (Conductor)' : ''} — Pieza ${i.pieza || '—'}, Cama ${i.cama || '—'}${i.de_turno ? '' : ' [NO estaba de turno]'}`
        ).join('\n') || 'Sin integrantes.'}</div>
        <p><strong>Emergencias vinculadas:</strong> ${(g.emergencias || []).map(e => e.codigo).join(', ') || '—'}</p>
        ${g.observaciones ? `<p><strong>Observaciones:</strong> ${escapeHtml(g.observaciones)}</p>` : ''}
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
      <input id="adAuTexto" placeholder="Buscar por nombre, clave o referencia...">
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
        <span class="nota">${escapeHtml(a.referencia || '')}</span>
      </div>
      <div class="audit-meta"><span>${new Date(a.fecha).toLocaleString('es-CL')}</span><span>${escapeHtml(a.entidad)}</span></div>
      <div class="audit-details-preview oculto">
        <p><strong>Antes:</strong></p><div class="audit-diff-box">${escapeHtml(JSON.stringify(a.antes, null, 2))}</div>
        <p><strong>Después:</strong></p><div class="audit-diff-box">${escapeHtml(JSON.stringify(a.despues, null, 2))}</div>
      </div>
    </div>
  `).join('');
}

// formatearFecha(fecha) ya existe en app.js (Niveles de Carga) — se reutiliza aquí.