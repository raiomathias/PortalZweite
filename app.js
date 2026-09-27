// ============================================================
// CLIENTE SUPABASE
// ============================================================
const cliente = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

let SESION = { token: null, nombre: null, permisos: null, permisosObj: null };
let DB = { inventario: [], categorias: [], cortinas: [], posiciones: [], estados: [], maquinas: [] };
let ITEM_EN_EDICION = null;
let ITEM_BITACORA_EN_EDICION = null;
let streamQR = null;
let animFrameQR = null;

function val(id) { return document.getElementById(id).value; }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.addEventListener('DOMContentLoaded', function () {
  const token = sessionStorage.getItem('token');
  if (token) {
    SESION.token = token;
    cargarDatosIniciales(true);
  }
});

// ---------------- LOGIN / SESION ----------------

async function hacerLogin() {
  const usuario = val('loginUsuario').trim();
  const contrasena = val('loginContrasena');
  document.getElementById('loginError').textContent = '';

  const { data, error } = await cliente.rpc('login', { p_usuario: usuario, p_contrasena: contrasena });
  if (error) {
    document.getElementById('loginError').textContent = error.message;
    return;
  }
  SESION.token = data.token;
  sessionStorage.setItem('token', data.token);
  await cargarDatosIniciales(false);
}

async function cargarDatosIniciales(esRecarga) {
  const { data, error } = await cliente.rpc('obtener_datos_iniciales', { p_token: SESION.token });
  if (error) {
    if (esRecarga) { sessionStorage.removeItem('token'); return; }
    document.getElementById('loginError').textContent = error.message;
    return;
  }

  SESION.nombre = data.sesion.nombre;
  SESION.permisos = data.sesion.permisos;
  SESION.permisosObj = data.permisos_rol;
  DB.inventario = data.inventario;
  DB.categorias = data.categorias;
  DB.cortinas = data.cortinas;
  DB.posiciones = data.posiciones;
  DB.estados = data.estados;
  DB.maquinas = data.maquinas;

  iniciarApp();
}

async function cerrarSesionUI() {
  await cliente.rpc('cerrar_sesion', { p_token: SESION.token });
  sessionStorage.removeItem('token');
  SESION = { token: null, nombre: null, permisos: null, permisosObj: null };
  DB.inventario = [];
  document.getElementById('app').classList.add('oculto');
  document.getElementById('pantallaLogin').classList.remove('oculto');
  document.getElementById('loginUsuario').value = '';
  document.getElementById('loginContrasena').value = '';
}

function iniciarApp() {
  document.getElementById('pantallaLogin').classList.add('oculto');
  document.getElementById('app').classList.remove('oculto');
  document.getElementById('nombreUsuarioTop').textContent = SESION.nombre;
  document.getElementById('rolUsuarioTop').textContent = SESION.permisos;

  document.getElementById('tabBtnAgregar').classList.toggle('oculto', SESION.permisosObj.puede_agregar_eliminar_material !== true);
  document.getElementById('tabBtnUsuarios').classList.toggle('oculto', SESION.permisosObj.acceso_panel_usuarios !== true);
  document.getElementById('tabBtnBitacora').classList.toggle('oculto', SESION.permisosObj.puede_ver !== true);
  document.getElementById('tabBtnAuditoria').classList.toggle('oculto', SESION.permisos !== 'Administrador de sistema');

  poblarSelectsMaquina();
  poblarFiltrosInventario();

  // Iniciar directamente en el mapa del carro
  mostrarTab('mapa');

  iniciarRealtimeInventario();
}

// ---------------- TABS ----------------

function mostrarTab(nombre) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('activo', b.dataset.tab === nombre));
  document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
  document.getElementById('vista' + nombre.charAt(0).toUpperCase() + nombre.slice(1)).classList.remove('oculto');

  if (nombre === 'mapa') inicializarMapaCarro();
  if (nombre === 'inventario') renderInventario();
  if (nombre === 'bitacora') {
    renderBitacora();
    inicializarHistorialGlobalEnBitacora();
  }
  if (nombre === 'agregar') actualizarOpcionesPorMaquina('ag');
  if (nombre === 'usuarios') cargarUsuarios();
}

// ---------------- SELECTS / DROPDOWNS ----------------

function poblarSelectsMaquina() {
  document.getElementById('agMaquina').innerHTML = DB.maquinas.map(m => `<option value="${m}">${m}</option>`).join('');

  document.getElementById('filtroMaquina').innerHTML = '<option value="">Todas las maquinas</option>' +
    DB.maquinas.map(m => `<option value="${m}">${m}</option>`).join('');

  document.getElementById('filtroMaquinaBitacora').innerHTML = '<option value="">Todas las maquinas</option>' +
    DB.maquinas.map(m => `<option value="${m}">${m}</option>`).join('');

  actualizarOpcionesPorMaquina('ag');
  actualizarFiltrosBitacora();
}

function actualizarFiltrosBitacora() {
  const maquina = val('filtroMaquinaBitacora');
  
  const cats = [...new Set(DB.categorias.filter(c => !maquina || c.maquina === maquina).map(c => c.categoria))];
  document.getElementById('filtroCategoriaBitacora').innerHTML = '<option value="">Todas las categorias</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  const corts = [...new Set(DB.cortinas.filter(c => !maquina || c.maquina === maquina).map(c => c.cortina))];
  document.getElementById('filtroCortinaBitacora').innerHTML = '<option value="">Todas las cortinas</option>' +
    corts.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  renderBitacora();
}

function poblarFiltrosInventario() {
  const cats = [...new Set(DB.categorias.map(c => c.categoria))];
  document.getElementById('filtroCategoria').innerHTML = '<option value="">Todas las categorias</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  const corts = [...new Set(DB.cortinas.map(c => c.cortina))];
  document.getElementById('filtroCortina').innerHTML = '<option value="">Todas las cortinas</option>' +
    corts.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

function llenarSelect(id, valores) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = valores.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function actualizarOpcionesPorMaquina(prefijo, maquinaForzada) {
  const campoMaquina = document.getElementById(prefijo + 'Maquina');
  const maquina = maquinaForzada || (campoMaquina ? campoMaquina.value : document.getElementById('filtroMaquina').value);

  llenarSelect(prefijo + 'Categoria', DB.categorias.filter(c => c.maquina === maquina).map(c => c.categoria));
  llenarSelect(prefijo + 'Cortina', DB.cortinas.filter(c => c.maquina === maquina).map(c => c.cortina));
  llenarSelect(prefijo + 'Posicion', DB.posiciones);
  llenarSelect(prefijo + 'EstadoAsignacion', DB.estados.filter(e => e.tipo === 'Estado Asignacion').map(e => e.opcion));
  llenarSelect(prefijo + 'EstadoOperativo', DB.estados.filter(e => e.tipo === 'Estado Operativo').map(e => e.opcion));
  llenarSelect(prefijo + 'Condicion', DB.estados.filter(e => e.tipo === 'Condicion').map(e => e.opcion));

  // Actualizar las sugerencias de subcategoría según la máquina y categoría actual
  actualizarSubcategorias(prefijo);
}

// ---------------- INVENTARIO ----------------

function renderInventario() {
  const maquina = val('filtroMaquina');
  const categoria = val('filtroCategoria');
  const cortina = val('filtroCortina');
  const texto = val('filtroTexto').trim().toLowerCase();

  let items = DB.inventario.filter(it => {
    if (maquina && it.maquina !== maquina) return false;
    if (categoria && it.categoria !== categoria) return false;
    if (cortina && it.cortina !== cortina) return false;
    if (texto && !((it.nombre || '').toLowerCase().includes(texto) || (it.uid_inventario || '').toLowerCase().includes(texto))) return false;
    return true;
  });

  items.sort((a, b) =>
    (a.categoria || '').localeCompare(b.categoria || '') ||
    (a.subcategoria || '').localeCompare(b.subcategoria || '') ||
    (a.nombre || '').localeCompare(b.nombre || '')
  );

  const contenedor = document.getElementById('listaInventario');
  contenedor.innerHTML = '';
  if (!items.length) {
    contenedor.innerHTML = '<p class="nota">No hay materiales que coincidan con el filtro.</p>';
    return;
  }

  let categoriaActual = null;
  const puedeEditar = SESION.permisosObj.puede_editar_basico === true;

  items.forEach(item => {
    if (item.categoria !== categoriaActual) {
      categoriaActual = item.categoria;
      const titulo = document.createElement('div');
      titulo.className = 'categoria-titulo';
      titulo.textContent = categoriaActual;
      contenedor.appendChild(titulo);
    }
    contenedor.appendChild(crearTarjetaMaterial(item, puedeEditar));
  });
}

function crearTarjetaMaterial(item, puedeEditar) {
  const div = document.createElement('div');
  div.className = 'item-material';
  const puntoClase = item.estado_operativo === 'Operativo' ? 'estado-operativo' : 'estado-no-operativo';
  const fotoHtml = item.foto_url ? '<img class="item-foto-mini" src="' + escapeHtml(item.foto_url) + '">' : '';

  div.innerHTML =
    fotoHtml +
    '<div class="item-info">' +
      '<div class="item-nombre"><span class="estado-punto ' + puntoClase + '"></span>' + escapeHtml(item.nombre) + '</div>' +
      '<div class="item-detalle">' + escapeHtml(item.subcategoria || '') + ' · ' + escapeHtml(item.uid_inventario) +
        ' · ' + escapeHtml(item.cortina || '') + ' · ' + escapeHtml(item.maquina) + '</div>' +
    '</div>';

  if (puedeEditar) {
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => abrirModalEditar(item));
  }
  return div;
}

function actualizarItemLocal(uidAnterior, nuevoItem) {
  const idx = DB.inventario.findIndex(i => i.uid_inventario === uidAnterior);
  if (idx !== -1) DB.inventario[idx] = nuevoItem;
  else DB.inventario.push(nuevoItem);
}

// ---------------- AGREGAR MATERIAL ----------------

async function agregarMaterialUI(event) {
  event.preventDefault();

  const maquina = val('agMaquina');
  const cortina = val('agCortina');

  // Si existe el campo de ubicación en el formulario y tiene texto se usa, de lo contrario se aplica el valor por defecto (Máquina + Cortina)
  const campoUbicacion = document.getElementById('agUbicacionActual');
  const ubicacionIngresada = campoUbicacion ? campoUbicacion.value.trim() : '';
  const ubicacionPorDefecto = (maquina + ' ' + (cortina || '')).trim();
  const ubicacionFinal = ubicacionIngresada !== '' ? ubicacionIngresada : ubicacionPorDefecto;

  const datos = {
    maquina: maquina, 
    nombre: val('agNombre'), 
    categoria: val('agCategoria'),
    subcategoria: val('agSubcategoria'), 
    marca: val('agMarca'), 
    modelo: val('agModelo'),
    numeroSerie: val('agNumeroSerie'), 
    anoFabricacion: val('agAnoFabricacion'),
    fechaAdquirida: val('agFechaAdquirida'), 
    cortina: cortina, 
    posicion: val('agPosicion'),
    estadoAsignacion: val('agEstadoAsignacion'), 
    estadoOperativo: val('agEstadoOperativo'), 
    condicion: val('agCondicion'),
    ubicacionActual: ubicacionFinal
  };

  const msg = document.getElementById('agregarMensaje');
  msg.textContent = 'Guardando...';
  msg.className = 'mensaje';

  const { data, error } = await cliente.rpc('agregar_material', { p_token: SESION.token, p_datos: datos });
  if (error) {
    msg.textContent = error.message;
    msg.className = 'mensaje mensaje-error';
    return false;
  }

  DB.inventario.push(data);
  msg.textContent = 'Material agregado: ' + data.uid_inventario;
  msg.className = 'mensaje';
  document.getElementById('formAgregar').reset();
  actualizarOpcionesPorMaquina('ag');
  return false;
}

// ---------------- EDITAR / MOVER / ELIMINAR MATERIAL ----------------

function abrirModalEditar(item) {
  ITEM_EN_EDICION = item;
  document.getElementById('editarUidTexto').textContent = item.uid_inventario + ' (' + item.maquina + ')';
  document.getElementById('editarMensaje').textContent = '';

  actualizarOpcionesPorMaquina('ed', item.maquina);
  document.getElementById('edCategoria').value = item.categoria || '';
  
  // Cargar las sugerencias de subcategoría correspondientes a esta categoría
  actualizarSubcategorias('ed');

  document.getElementById('edSubcategoria').value = item.subcategoria || '';
  document.getElementById('edMarca').value = item.marca || '';
  document.getElementById('edModelo').value = item.modelo || '';
  document.getElementById('edCortina').value = item.cortina || '';
  document.getElementById('edPosicion').value = item.posicion || '';
  document.getElementById('edEstadoAsignacion').value = item.estado_asignacion || '';
  document.getElementById('edEstadoOperativo').value = item.estado_operativo || '';
  document.getElementById('edCondicion').value = item.condicion || '';

  const preview = document.getElementById('edFotoPreview');
  if (item.foto_url) { preview.src = item.foto_url; preview.classList.remove('oculto'); }
  else { preview.classList.add('oculto'); }

  const bloqueMover = document.getElementById('bloqueMoverMaquina');
  if (SESION.permisosObj.puede_cambiar_uid_maquina) {
    bloqueMover.classList.remove('oculto');
    const otras = DB.maquinas.filter(m => m !== item.maquina);
    document.getElementById('edMaquinaDestino').innerHTML = otras.map(m => `<option value="${m}">${m}</option>`).join('');
  } else {
    bloqueMover.classList.add('oculto');
  }

  document.getElementById('btnEliminarMaterial').classList.toggle('oculto', SESION.permisosObj.puede_agregar_eliminar_material !== true);

  document.getElementById('modalEditar').classList.remove('oculto');
}

function cerrarModalEditar() {
  document.getElementById('modalEditar').classList.add('oculto');
  ITEM_EN_EDICION = null;
}

async function guardarEdicionUI() {
  if (!ITEM_EN_EDICION) return;
  const cambios = {
    categoria: val('edCategoria'), subcategoria: val('edSubcategoria'), marca: val('edMarca'),
    modelo: val('edModelo'), cortina: val('edCortina'), posicion: val('edPosicion'),
    estadoAsignacion: val('edEstadoAsignacion'), estadoOperativo: val('edEstadoOperativo'), condicion: val('edCondicion')
  };

  const msg = document.getElementById('editarMensaje');
  msg.textContent = 'Guardando...';

  const { data, error } = await cliente.rpc('editar_material_basico', {
    p_token: SESION.token, p_uid: ITEM_EN_EDICION.uid_inventario, p_cambios: cambios
  });
  if (error) { msg.textContent = error.message; msg.className = 'mensaje mensaje-error'; return; }

  actualizarItemLocal(ITEM_EN_EDICION.uid_inventario, data);
  cerrarModalEditar();
  renderInventario();
}

async function moverMaterialUI() {
  if (!ITEM_EN_EDICION) return;
  const destino = val('edMaquinaDestino');
  if (!destino) return;
  if (!confirm('¿Mover este material a ' + destino + '? Su UID cambiará.')) return;

  const msg = document.getElementById('editarMensaje');
  msg.textContent = 'Moviendo...';

  const { data, error } = await cliente.rpc('mover_material', {
    p_token: SESION.token, p_uid: ITEM_EN_EDICION.uid_inventario, p_maquina_nueva: destino
  });
  if (error) { msg.textContent = error.message; msg.className = 'mensaje mensaje-error'; return; }

  actualizarItemLocal(ITEM_EN_EDICION.uid_inventario, data);
  cerrarModalEditar();
  renderInventario();
}

async function eliminarMaterialUI() {
  if (!ITEM_EN_EDICION) return;
  if (!confirm('¿Eliminar este material definitivamente? Esta accion no se puede deshacer.')) return;

  const { error } = await cliente.rpc('eliminar_material', { p_token: SESION.token, p_uid: ITEM_EN_EDICION.uid_inventario });
  if (error) { document.getElementById('editarMensaje').textContent = error.message; return; }

  DB.inventario = DB.inventario.filter(i => i.uid_inventario !== ITEM_EN_EDICION.uid_inventario);
  cerrarModalEditar();
  renderInventario();
}

// ---------------- FOTO CON CAMARA INTERNA ----------------

let streamCamaraFoto = null;

async function abrirCamaraFoto() {
  if (!ITEM_EN_EDICION) return;
  document.getElementById('modalCamaraFoto').classList.remove('oculto');
  document.getElementById('camaraFotoMensaje').textContent = '';
  try {
    streamCamaraFoto = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
    });
    const video = document.getElementById('videoCamaraFoto');
    video.srcObject = streamCamaraFoto;
    await video.play();
  } catch (e) {
    document.getElementById('camaraFotoMensaje').textContent = 'No se pudo acceder a la cámara: ' + e.message;
  }
}

function cerrarCamaraFoto() {
  if (streamCamaraFoto) {
    streamCamaraFoto.getTracks().forEach(t => t.stop());
    streamCamaraFoto = null;
  }
  document.getElementById('modalCamaraFoto').classList.add('oculto');
}

async function capturarYSubirFoto() {
  const video = document.getElementById('videoCamaraFoto');
  const canvas = document.getElementById('canvasCamaraFoto');
  if (!video || !video.srcObject) return;

  const msg = document.getElementById('editarMensaje');
  msg.textContent = 'Procesando foto...';
  msg.className = 'mensaje';

  // Recortar automáticamente en formato cuadrado centrado para que encaje perfecto en la miniatura
  const size = Math.min(video.videoWidth, video.videoHeight);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  const startX = (video.videoWidth - size) / 2;
  const startY = (video.videoHeight - size) / 2;
  ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size);

  cerrarCamaraFoto();

  canvas.toBlob(async (blob) => {
    if (!blob) {
      msg.textContent = 'Error al procesar la imagen.';
      msg.className = 'mensaje mensaje-error';
      return;
    }

    const uid = ITEM_EN_EDICION.uid_inventario;
    const nombreArchivo = uid + '-' + Date.now() + '.jpg';
    const file = new File([blob], nombreArchivo, { type: 'image/jpeg' });

    msg.textContent = 'Subiendo foto...';

    const { error: errorSubida } = await cliente.storage
      .from(CONFIG.NOMBRE_BUCKET_FOTOS)
      .upload(nombreArchivo, file, { upsert: true });

    if (errorSubida) {
      msg.textContent = 'No se pudo subir la foto: ' + errorSubida.message;
      msg.className = 'mensaje mensaje-error';
      return;
    }

    const { data: urlData } = cliente.storage.from(CONFIG.NOMBRE_BUCKET_FOTOS).getPublicUrl(nombreArchivo);
    const url = urlData.publicUrl;

    const { error } = await cliente.rpc('set_foto_material', { p_token: SESION.token, p_uid: uid, p_url: url });
    if (error) { msg.textContent = error.message; msg.className = 'mensaje mensaje-error'; return; }

    ITEM_EN_EDICION.foto_url = url;
    actualizarItemLocal(uid, Object.assign({}, ITEM_EN_EDICION));

    document.getElementById('edFotoPreview').src = url;
    document.getElementById('edFotoPreview').classList.remove('oculto');
    msg.textContent = 'Foto actualizada.';
    renderInventario();
  }, 'image/jpeg', 0.85);
}

// Función alternativa por si prefieren subir un archivo guardado del dispositivo
async function subirFotoArchivoUI(event) {
  const file = event.target.files[0];
  if (!file || !ITEM_EN_EDICION) return;

  const msg = document.getElementById('editarMensaje');
  msg.textContent = 'Subiendo foto...';
  msg.className = 'mensaje';

  const uid = ITEM_EN_EDICION.uid_inventario;
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const nombreArchivo = uid + '-' + Date.now() + '.' + extension;

  const { error: errorSubida } = await cliente.storage
    .from(CONFIG.NOMBRE_BUCKET_FOTOS)
    .upload(nombreArchivo, file, { upsert: true });

  if (errorSubida) {
    msg.textContent = 'No se pudo subir la foto: ' + errorSubida.message;
    msg.className = 'mensaje mensaje-error';
    return;
  }

  const { data: urlData } = cliente.storage.from(CONFIG.NOMBRE_BUCKET_FOTOS).getPublicUrl(nombreArchivo);
  const url = urlData.publicUrl;

  const { error } = await cliente.rpc('set_foto_material', { p_token: SESION.token, p_uid: uid, p_url: url });
  if (error) { msg.textContent = error.message; msg.className = 'mensaje mensaje-error'; return; }

  ITEM_EN_EDICION.foto_url = url;
  actualizarItemLocal(uid, Object.assign({}, ITEM_EN_EDICION));

  document.getElementById('edFotoPreview').src = url;
  document.getElementById('edFotoPreview').classList.remove('oculto');
  msg.textContent = 'Foto actualizada.';
  renderInventario();
}

// ---------------- BITACORA ----------------

function renderBitacora() {
  const maquina = val('filtroMaquinaBitacora');
  const categoria = val('filtroCategoriaBitacora');
  const cortina = val('filtroCortinaBitacora');
  const texto = val('filtroTextoBitacora').trim().toLowerCase();

  let items = DB.inventario.filter(it => {
    if (maquina && it.maquina !== maquina) return false;
    if (categoria && it.categoria !== categoria) return false;
    if (cortina && it.cortina !== cortina) return false;
    if (texto && !((it.nombre || '').toLowerCase().includes(texto) || (it.uid_inventario || '').toLowerCase().includes(texto))) return false;
    return true;
  });

  items.sort((a, b) =>
    (a.categoria || '').localeCompare(b.categoria || '') ||
    (a.subcategoria || '').localeCompare(b.subcategoria || '') ||
    (a.nombre || '').localeCompare(b.nombre || '')
  );

  const contenedor = document.getElementById('listaBitacora');
  contenedor.innerHTML = '';
  if (!items.length) {
    contenedor.innerHTML = '<p class="nota">No hay materiales que coincidan con los filtros.</p>';
    return;
  }

  let categoriaActual = null;
  const puedeEditar = SESION.permisosObj.puede_editar_bitacora === true;

  items.forEach(item => {
    if (item.categoria !== categoriaActual) {
      categoriaActual = item.categoria;
      const t = document.createElement('div');
      t.className = 'categoria-titulo';
      t.textContent = categoriaActual;
      contenedor.appendChild(t);
    }
    contenedor.appendChild(crearTarjetaBitacora(item, puedeEditar));
  });
}

function crearTarjetaBitacora(item, puedeEditar) {
  const div = document.createElement('div');
  div.className = 'item-material';
  
  // Punto indicador de estado operativo (igual que en inventario)
  const puntoClase = item.estado_operativo === 'Operativo' ? 'estado-operativo' : 'estado-no-operativo';
  const fotoHtml = item.foto_url ? '<img class="item-foto-mini" src="' + escapeHtml(item.foto_url) + '">' : '';

  // Determinar si la ubicación actual es diferente al valor por defecto (Máquina + Cortina)
  const ubicacionDefault = (item.maquina + ' ' + (item.cortina || '')).trim();
  const tieneUbicacionPersonalizada = item.ubicacion_actual && 
                                      item.ubicacion_actual.trim() !== '' && 
                                      item.ubicacion_actual.trim() !== ubicacionDefault;

  // Construir detalles: solo se muestra la ubicación si fue especificada de forma personalizada
  let detalleTexto = '';
  if (tieneUbicacionPersonalizada) {
    detalleTexto += escapeHtml(item.ubicacion_actual) + ' · ';
  }
  detalleTexto += escapeHtml(item.uid_inventario);
  if (item.cortina) detalleTexto += ' · ' + escapeHtml(item.cortina);
  detalleTexto += ' · ' + escapeHtml(item.maquina);

  div.innerHTML =
    fotoHtml +
    '<div class="item-info">' +
      '<div class="item-nombre"><span class="estado-punto ' + puntoClase + '"></span>' + escapeHtml(item.nombre) + '</div>' +
      '<div class="item-detalle">' + detalleTexto + '</div>' +
    '</div>';

  if (puedeEditar) {
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => abrirModalBitacora(item));
  }
  return div;
}

function abrirModalBitacora(item) {
  ITEM_BITACORA_EN_EDICION = item;
  document.getElementById('bitacoraUidTexto').textContent = item.uid_inventario + ' (' + item.maquina + ')';
  document.getElementById('bitacoraMensaje').textContent = '';
  
  // Por defecto poner la fecha de hoy en formato YYYY-MM-DD
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('biFechaRegistro').value = hoy;

  // Limpiar o precargar valores por defecto
  const ubicacionPorDefecto = (item.maquina + ' ' + (item.cortina || '')).trim();
  document.getElementById('biUbicacionActual').value = item.ubicacion_actual || ubicacionPorDefecto;
  document.getElementById('biNivelCarga').value = '';
  document.getElementById('biHistorialCalibracion').value = '';
  document.getElementById('biUltimaIntervencion').value = '';
  document.getElementById('biProximaIntervencion').value = '';
  document.getElementById('biHistorialDanos').value = '';
  document.getElementById('biUltimoUso').value = '';
  document.getElementById('biUltimoLavado').value = '';
  document.getElementById('biObservacionesAdicionales').value = '';

  document.getElementById('modalBitacora').classList.remove('oculto');
}

function cerrarModalBitacora() {
  document.getElementById('modalBitacora').classList.add('oculto');
  ITEM_BITACORA_EN_EDICION = null;
}

async function guardarBitacoraUI() {
  if (!ITEM_BITACORA_EN_EDICION) return;

  const fechaReg = val('biFechaRegistro');
  if (!fechaReg) {
    alert('Debes seleccionar una fecha antes de registrar la bitácora.');
    return;
  }

  const cambios = {
    fechaRegistro: fechaReg,
    ubicacionActual: val('biUbicacionActual'),
    nivelCarga: val('biNivelCarga'),
    historialCalibracion: val('biHistorialCalibracion'),
    ultimaIntervencion: val('biUltimaIntervencion'),
    proximaIntervencion: val('biProximaIntervencion'),
    historialDanos: val('biHistorialDanos'),
    ultimoUso: val('biUltimoUso'),
    ultimoLavado: val('biUltimoLavado'),
    observacionesAdicionales: val('biObservacionesAdicionales')
    
  };

  const msg = document.getElementById('bitacoraMensaje');
  msg.textContent = 'Guardando registro histórico...';

  const { data, error } = await cliente.rpc('registrar_bitacora', {
    p_token: SESION.token, 
    p_uid: ITEM_BITACORA_EN_EDICION.uid_inventario, 
    p_datos: cambios
  });

  if (error) { 
    // Agrega este console.error detallado
    console.error("--- DEBUG ERROR SUPABASE ---", JSON.stringify(error, null, 2));
    
    msg.textContent = error.message; 
    msg.className = 'mensaje mensaje-error'; 
    return; 
  }

  msg.textContent = '¡Registro de bitácora guardado con éxito!';
  msg.className = 'mensaje';
  setTimeout(() => {
    cerrarModalBitacora();
    renderBitacora();
  }, 1000);
}

async function abrirHistorialBitacora() {
  if (!ITEM_BITACORA_EN_EDICION) return;
  
  const uid = ITEM_BITACORA_EN_EDICION.uid_inventario;
  document.getElementById('historialUidTexto').textContent = 'Material: ' + uid + ' (' + ITEM_BITACORA_EN_EDICION.nombre + ')';
  
  const contenedor = document.getElementById('listaHistorialFechas');
  contenedor.innerHTML = '<p class="nota">Cargando historial...</p>';
  
  document.getElementById('modalHistorialBitacora').classList.remove('oculto');

  const { data, error } = await cliente.rpc('obtener_historial_bitacora', {
    p_token: SESION.token,
    p_uid: uid
  });

  if (error) {
    contenedor.innerHTML = '<p class="mensaje-error">Error al cargar historial: ' + escapeHtml(error.message) + '</p>';
    return;
  }

  if (!data || data.length === 0) {
    contenedor.innerHTML = '<p class="nota">No hay registros históricos de bitácora para este material todavía.</p>';
    return;
  }

  contenedor.innerHTML = '';
  data.forEach(reg => {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'item-material';
    tarjeta.style.flexDirection = 'column';
    tarjeta.style.alignItems = 'flex-start';
    tarjeta.style.gap = '6px';

    tarjeta.innerHTML = `
      <div style="font-weight: 700; color: var(--color-primario); border-bottom: 1px solid var(--color-borde); width: 100%; padding-bottom: 4px;">
        📅 Fecha: ${escapeHtml(reg.fecha_registro)} <span style="font-size:0.75rem; color:#666; font-weight:normal;">(Por: ${escapeHtml(reg.usuario_registro || 'Sistema')})</span>
      </div>
      <div style="font-size: 0.85rem;"><strong>Ubicación:</strong> ${escapeHtml(reg.ubicacion_actual || 'No especificada')}</div>
      <div style="font-size: 0.85rem;"><strong>Nivel de carga:</strong> ${escapeHtml(reg.nivel_carga || 'N/A')}</div>
      <div style="font-size: 0.85rem;"><strong>Calibración:</strong> ${escapeHtml(reg.historial_calibracion || 'N/A')}</div>
      <div style="font-size: 0.85rem;"><strong>Intervención (Última / Próx):</strong> ${escapeHtml(reg.ultima_intervencion || '-')} / ${escapeHtml(reg.proxima_intervencion || '-')}</div>
      <div style="font-size: 0.85rem;"><strong>Daños:</strong> ${escapeHtml(reg.historial_danos || 'Ninguno')}</div>
      <div style="font-size: 0.85rem;"><strong>Último uso / lavado:</strong> ${escapeHtml(reg.ultimo_uso || '-')} / ${escapeHtml(reg.ultimo_lavado || '-')}</div>
      ${reg.observaciones_adicionales ? `<div style="font-size: 0.85rem; background: rgba(0,0,0,0.03); width: 100%; padding: 6px; border-radius: 6px; margin-top: 4px;"><strong>Observaciones:</strong> ${escapeHtml(reg.observaciones_adicionales)}</div>` : ''}
    `;
    contenedor.appendChild(tarjeta);
  });
}

function cerrarHistorialBitacora() {
  document.getElementById('modalHistorialBitacora').classList.add('oculto');
}

// ---------------- USUARIOS ----------------

async function cargarUsuarios() {
  const contenedor = document.getElementById('listaUsuarios');
  contenedor.innerHTML = '<p class="nota">Cargando...</p>';

  const { data, error } = await cliente.rpc('listar_usuarios', { p_token: SESION.token });
  if (error) { contenedor.innerHTML = '<p class="mensaje-error">' + error.message + '</p>'; return; }

  contenedor.innerHTML = '';
  data.forEach(u => {
    const div = document.createElement('div');
    div.className = 'item-material';
    
    // Ocultar contraseña por defecto y agregar botón para mostrar/ocultar
    let passHtml = '';
    if (u.contrasena !== null) {
      const uidSeguro = escapeHtml(u.usuario);
      const passSeguro = escapeHtml(u.contrasena);
      passHtml = ` · Contraseña: <span id="pass-${uidSeguro}" data-pass="${passSeguro}">••••••••</span> ` +
                 `<button type="button" class="btn-secundario" style="padding: 2px 6px; font-size: 0.75rem; margin-left: 6px; margin-bottom: 0;" onclick="togglePassword('${uidSeguro}')">👁️ Ver</button>`;
    }

    div.innerHTML =
      '<div class="item-info">' +
        '<div class="item-nombre">' + escapeHtml(u.nombre) + ' (' + escapeHtml(u.usuario) + ')</div>' +
        '<div class="item-detalle">' + escapeHtml(u.permisos) + passHtml + '</div>' +
      '</div>';
    contenedor.appendChild(div);
  });
}

function togglePassword(usuarioId) {
  const span = document.getElementById('pass-' + usuarioId);
  if (!span) return;
  const passwordReal = span.getAttribute('data-pass');
  
  if (span.textContent === '••••••••') {
    span.textContent = passwordReal;
  } else {
    span.textContent = '••••••••';
  }
}

function mostrarFormularioUsuario() {
  document.getElementById('formNuevoUsuario').classList.toggle('oculto');
}

async function agregarUsuarioUI(event) {
  event.preventDefault();
  const { error } = await cliente.rpc('agregar_usuario', {
    p_token: SESION.token, p_usuario: val('nuUsuario'), p_nombre: val('nuNombre'),
    p_contrasena: val('nuContrasena'), p_permisos: val('nuPermisos')
  });
  if (error) { alert(error.message); return false; }

  document.getElementById('formNuevoUsuario').reset();
  document.getElementById('formNuevoUsuario').classList.add('oculto');
  cargarUsuarios();
  return false;
}

// ---------------- CUENTA ----------------

async function cambiarContrasenaUI(event) {
  event.preventDefault();
  const msg = document.getElementById('cuentaMensaje');
  msg.textContent = 'Guardando...';
  msg.className = 'mensaje';

  const { error } = await cliente.rpc('cambiar_contrasena', {
    p_token: SESION.token, p_actual: val('ccActual'), p_nueva: val('ccNueva')
  });
  if (error) { msg.textContent = error.message; msg.className = 'mensaje mensaje-error'; return false; }

  msg.textContent = 'Contraseña actualizada.';
  document.getElementById('formContrasena').reset();
  return false;
}

// ---------------- ESCANER QR ----------------
// El QR contiene el UID Inventario. Como todo el inventario ya esta
// en memoria (DB.inventario), la busqueda es instantanea, sin red.

async function abrirEscanerQR() {
  document.getElementById('modalQR').classList.remove('oculto');
  document.getElementById('qrMensaje').textContent = '';
  try {
    streamQR = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = document.getElementById('videoQR');
    video.srcObject = streamQR;
    await video.play();
    escanearFrame();
  } catch (e) {
    document.getElementById('qrMensaje').textContent = 'No se pudo acceder a la cámara: ' + e.message;
  }
}

function escanearFrame() {
  const video = document.getElementById('videoQR');
  const canvas = document.getElementById('canvasQR');
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const codigo = jsQR(imgData.data, imgData.width, imgData.height);
    if (codigo && codigo.data) {
      manejarCodigoQR(codigo.data);
      return;
    }
  }
  animFrameQR = requestAnimationFrame(escanearFrame);
}

function manejarCodigoQR(uidLeido) {
  cerrarEscanerQR();
  const uid = uidLeido.trim();
  const item = DB.inventario.find(i => i.uid_inventario === uid);
  if (!item) { alert('No se encontró ningún material con UID ' + uid); return; }

  // Verificar si el usuario se encuentra actualmente en la pestaña de Bitácora
  const tabActiva = document.querySelector('.tab.activo');
  const esBitacora = tabActiva && tabActiva.dataset.tab === 'bitacora';

  if (esBitacora) {
    document.getElementById('filtroMaquinaBitacora').value = item.maquina;
    actualizarFiltrosBitacora();
    document.getElementById('filtroCategoriaBitacora').value = '';
    document.getElementById('filtroCortinaBitacora').value = '';
    document.getElementById('filtroTextoBitacora').value = '';
    renderBitacora();

    if (SESION.permisosObj.puede_editar_bitacora) abrirModalBitacora(item);
  } else {
    document.getElementById('filtroMaquina').value = item.maquina;
    document.getElementById('filtroCategoria').value = '';
    document.getElementById('filtroCortina').value = '';
    document.getElementById('filtroTexto').value = '';
    mostrarTab('inventario');

    if (SESION.permisosObj.puede_editar_basico) abrirModalEditar(item);
  }
}

function cerrarEscanerQR() {
  if (animFrameQR) cancelAnimationFrame(animFrameQR);
  animFrameQR = null;
  if (streamQR) { streamQR.getTracks().forEach(t => t.stop()); streamQR = null; }
  document.getElementById('modalQR').classList.add('oculto');
}
// Cerrar modales al hacer clic fuera del contenido
window.addEventListener('click', function(evento) {
  // Verifica si el clic ocurrió exactamente en el fondo oscuro
  if (evento.target.classList.contains('modal')) {
    // Ejecuta la función de cierre correcta para limpiar variables (como ITEM_EN_EDICION o la cámara)
    if (evento.target.id === 'modalEditar') {
      cerrarModalEditar();
    } else if (evento.target.id === 'modalBitacora') {
      cerrarModalBitacora();
    } else if (evento.target.id === 'modalQR') {
      cerrarEscanerQR();
    }
  }
});
// ---------------- TIEMPO REAL (SUPABASE REALTIME) ----------------

function iniciarRealtimeInventario() {
  cliente
    .channel('cambios-inventario-global')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventario_materiales' },
      async (payload) => {
        // Sincronizar el inventario completo desde el servidor para mantener la estructura exacta
        const { data, error } = await cliente.rpc('obtener_datos_iniciales', { p_token: SESION.token });
        if (!error && data && data.inventario) {
          DB.inventario = data.inventario;
          renderInventario();
          
          // Si estás viendo la bitácora, también actualizarla
          const vistaBitacora = document.getElementById('vistaBitacora');
          if (vistaBitacora && !vistaBitacora.classList.contains('oculto')) {
            renderBitacora();
          }
        }
      }
    )
    .subscribe();
}

// ---------------- SUBCATEGORIAS DINAMICAS ----------------

function actualizarSubcategorias(prefijo) {
  const campoMaquina = document.getElementById(prefijo + 'Maquina');
  const maquina = campoMaquina ? campoMaquina.value : '';
  const categoria = val(prefijo + 'Categoria');

  // Filtrar subcategorías que pertenezcan estrictamente a esta máquina y categoría
  const subs = [...new Set(
    DB.inventario
      .filter(i => (!maquina || i.maquina === maquina) && (!categoria || i.categoria === categoria))
      .map(i => i.subcategoria)
      .filter(Boolean)
  )].sort();

  const datalistId = prefijo === 'ag' ? 'listaSubcategorias' : 'listaSubcategoriasEd';
  const datalist = document.getElementById(datalistId);
  if (datalist) {
    datalist.innerHTML = subs.map(s => `<option value="${escapeHtml(s)}">`).join('');
  }
}


  // Auditoria

async function cargarAuditoriaConFiltros() {
  const fechaInicio = document.getElementById('filtro-fecha-inicio').value || null;
  const fechaFin = document.getElementById('filtro-fecha-fin').value || null;
  const maquina = document.getElementById('filtro-maquina').value || null;

  const contenedor = document.getElementById('lista-auditoria');
  contenedor.innerHTML = `<div class="text-center p-4">Cargando registros de auditoría...</div>`;

  try {
    const { data, error } = await cliente.rpc('obtener_auditoria_sistema', {
      p_token: SESION.token,
      p_fecha_inicio: fechaInicio,
      p_fecha_fin: fechaFin,
      p_maquina: maquina
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      contenedor.innerHTML = `<div class="text-center p-4 text-muted">No se encontraron registros de auditoría con estos filtros.</div>`;
      return;
    }

    contenedor.innerHTML = data.map(log => {
      let badgeClass = 'badge-secondary';
      if (log.accion === 'CREAR') badgeClass = 'badge-success';
      if (log.accion === 'ACTUALIZAR') badgeClass = 'badge-warning';
      if (log.accion === 'ELIMINAR') badgeClass = 'badge-danger';

      const fechaLegible = new Date(log.created_at).toLocaleString();
      
      // Formatear los detalles JSON de forma limpia para visualización
      const detallesStr = JSON.stringify(log.detalles, null, 2);

      return `
        <div class="audit-card" onclick="toggleDetalleAuditoria(this)">
          <div class="audit-header">
            <div>
              <span class="badge ${badgeClass}">${log.accion}</span>
              <strong style="margin-left: 8px;">${log.tabla_afectada}</strong> 
              <span class="text-muted">(${log.registro_afectado || 'General'})</span>
            </div>
            <div class="audit-meta">
              <span>👤 ${log.usuario_responsable}</span>
              <span>📅 ${fechaLegible}</span>
            </div>
          </div>
          
          <div class="audit-details-preview">
            <small>Haz clic para ver el detalle completo de la modificación...</small>
            <div class="audit-diff-box" style="display: none;">
              ${detallesStr}
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error("Error al cargar auditoría:", err.message);
    contenedor.innerHTML = `<div class="text-center text-error p-4">Error al cargar la auditoría o permisos insuficientes.</div>`;
  }
}

// Función interactiva para expandir/contraer la tarjeta al hacer clic
function toggleDetalleAuditoria(cardElement) {
  const diffBox = cardElement.querySelector('.audit-diff-box');
  const preview = cardElement.querySelector('.audit-details-preview small');
  
  if (diffBox.style.display === 'none') {
    diffBox.style.display = 'block';
    preview.style.display = 'none';
    cardElement.style.borderColor = '#3b82f6'; // Resaltar borde al abrir
  } else {
    diffBox.style.display = 'none';
    preview.style.display = 'block';
    cardElement.style.borderColor = '#e2e8f0';
  }
}

async function cargarAuditoriaSistema() {
  const contenedorTabla = document.getElementById('cuerpo-tabla-auditoria');
  contenedorTabla.innerHTML = `<tr><td colspan="6" class="text-center">Cargando registros de auditoría...</td></tr>`;

  try {
    const { data, error } = await cliente.rpc('obtener_auditoria_sistema', {
      p_token: SESION.token
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      contenedorTabla.innerHTML = `<tr><td colspan="6" class="text-center">No hay registros de auditoría disponibles.</td></tr>`;
      return;
    }

    contenedorTabla.innerHTML = data.map(log => {
      // Definir color del badge según la acción
      let badgeClass = 'badge-secondary';
      if (log.accion === 'CREAR') badgeClass = 'badge-success';
      if (log.accion === 'ACTUALIZAR') badgeClass = 'badge-warning';
      if (log.accion === 'ELIMINAR') badgeClass = 'badge-danger';

      // Formatear fecha legible
      const fechaLocal = new Date(log.created_at).toLocaleString();

      return `
        <tr>
          <td>${fechaLocal}</td>
          <td><strong>${log.usuario_responsable || 'Desconocido'}</strong></td>
          <td><span class="badge ${badgeClass}">${log.accion}</span></td>
          <td><code>${log.tabla_afectada}</code></td>
          <td><code>${log.registro_afectado || 'N/A'}</code></td>
          <td>
            <button class="btn-icon" onclick='verDetallesAuditoria(${JSON.stringify(log.detalles)})' title="Ver detalles">
              🔍
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("Error al cargar auditoría:", err.message);
    contenedorTabla.innerHTML = `<tr><td colspan="6" class="text-center text-error">Acceso restringido o error al cargar los datos.</td></tr>`;
  }
}

function verDetallesAuditoria(detallesJSON) {
  // Aquí puedes abrir tu modal existente para mostrar el JSON formateado de forma bonita con JSON.stringify(detallesJSON, null, 2)
  alert("Detalles del cambio:\n" + JSON.stringify(detallesJSON, null, 2));
}

  // Bitacora

function inicializarHistorialGlobalEnBitacora() {
  const selectMaquina = document.getElementById('filtroHistorialMaquina');
  if (selectMaquina && DB.maquinas) {
    selectMaquina.innerHTML = '<option value="">Todas las máquinas</option>' +
      DB.maquinas.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  }
}

async function cargarHistorialGlobalBitacoras() {
  const desde = document.getElementById('filtroHistorialDesde').value || null;
  const hasta = document.getElementById('filtroHistorialHasta').value || null;
  const maquina = document.getElementById('filtroHistorialMaquina').value || null;

  const contenedor = document.getElementById('listaHistorialGlobal');
  contenedor.innerHTML = `<p class="nota text-center">Cargando registros históricos...</p>`;

  const { data, error } = await cliente.rpc('obtener_todas_las_bitacoras', {
    p_token: SESION.token,
    p_fecha_inicio: desde,
    p_fecha_fin: hasta,
    p_maquina: maquina
  });

  if (error) {
    contenedor.innerHTML = `<p class="mensaje-error text-center">Error al cargar bitácoras: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    contenedor.innerHTML = `<p class="nota text-center">No se encontraron registros de bitácora para los filtros seleccionados.</p>`;
    return;
  }

  contenedor.innerHTML = '';
  data.forEach(reg => {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'item-material';
    tarjeta.style.flexDirection = 'column';
    tarjeta.style.alignItems = 'flex-start';
    tarjeta.style.gap = '6px';

    tarjeta.innerHTML = `
      <div style="font-weight: 700; color: var(--color-primario); border-bottom: 1px solid var(--color-borde); width: 100%; padding-bottom: 4px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 5px;">
        <span>🚒 ${escapeHtml(reg.nombre_material || 'Material')} (<code style="font-size:0.85rem;">${escapeHtml(reg.uid_inventario)}</code>)</span>
        <span>📅 Fecha reg: <strong>${escapeHtml(reg.fecha_registro)}</strong></span>
      </div>
      <div style="font-size: 0.85rem;"><strong>Máquina:</strong> ${escapeHtml(reg.maquina || 'N/A')} · <strong>Ubicación:</strong> ${escapeHtml(reg.ubicacion_actual || 'No especificada')}</div>
      <div style="font-size: 0.85rem;"><strong>Nivel de carga:</strong> ${escapeHtml(reg.nivel_carga || 'N/A')} · <strong>Calibración:</strong> ${escapeHtml(reg.historial_calibracion || 'N/A')}</div>
      <div style="font-size: 0.85rem;"><strong>Intervención (Última / Próx):</strong> ${escapeHtml(reg.ultima_intervencion || '-')} / ${escapeHtml(reg.proxima_intervencion || '-')}</div>
      <div style="font-size: 0.85rem;"><strong>Daños:</strong> ${escapeHtml(reg.historial_danos || 'Ninguno')}</div>
      <div style="font-size: 0.85rem;"><strong>Último uso / lavado:</strong> ${escapeHtml(reg.ultimo_uso || '-')} / ${escapeHtml(reg.ultimo_lavado || '-')}</div>
      ${reg.observaciones_adicionales ? `<div style="font-size: 0.85rem; background: rgba(0,0,0,0.03); width: 100%; padding: 6px; border-radius: 6px; margin-top: 4px;"><strong>Observaciones:</strong> ${escapeHtml(reg.observaciones_adicionales)}</div>` : ''}
      <div style="font-size: 0.75rem; color: #666; width: 100%; text-align: right; margin-top: 4px;">Registrado por: <strong>${escapeHtml(reg.usuario_registro || 'Sistema')}</strong></div>
    `;
    contenedor.appendChild(tarjeta);
  });
}

function mostrarAyuda(tipo) {
  const mensajes = {
    operativo: "• Operativo: Indica si el equipo está 100% listo o fuera de servicio (daños/mantención).\n• Asignación: Muestra si está posicionado y asignado en el carro.",
    uid: "Código alfanumérico único del equipo para su control estricto y registro en la bitácora.",
    qr: "Escanea el código QR de cualquier equipo para acceder directamente a su control de inventario o bitácora según la pestaña en la que estés.",
    permisos: "Mover de carro, eliminar y agregar materiales es posible solo por encargados de material menor. ¡Contacta a uno si necesitas ayuda!"
  };

  alert(mensajes[tipo] || "Información de ayuda no disponible.");
}

let MAPA_SELECCIONADO = { maquina: '', cortina: '' };

function inicializarMapaCarro() {
  const select = document.getElementById('mapaMaquina');
  if (select && DB.maquinas) {
    const actual = select.value;
    select.innerHTML = DB.maquinas.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    if (actual && DB.maquinas.includes(actual)) {
      select.value = actual;
    }
  }
}

function clicCompartimentoMapa(cortinaNombre) {
  const maquinaActiva = document.getElementById('mapaMaquina').value;
  if (!maquinaActiva) {
    alert('Por favor selecciona una máquina primero.');
    return;
  }

  MAPA_SELECCIONADO = { maquina: maquinaActiva, cortina: cortinaNombre };

  document.getElementById('mapaAccionTitulo').textContent = `${cortinaNombre} (${maquinaActiva})`;
  document.getElementById('modalMapaAccion').classList.remove('oculto');
}

function cerrarModalMapaAccion() {
  document.getElementById('modalMapaAccion').classList.add('oculto');
}

function irDesdeMapa(destino) {
  cerrarModalMapaAccion();
  const { maquina, cortina } = MAPA_SELECCIONADO;

  if (destino === 'inventario') {
    document.getElementById('filtroMaquina').value = maquina;
    document.getElementById('filtroCategoria').value = '';
    document.getElementById('filtroCortina').value = cortina;
    document.getElementById('filtroTexto').value = '';
    mostrarTab('inventario');
  } else if (destino === 'bitacora') {
    document.getElementById('filtroMaquinaBitacora').value = maquina;
    actualizarFiltrosBitacora();
    document.getElementById('filtroCategoriaBitacora').value = '';
    document.getElementById('filtroCortinaBitacora').value = cortina;
    document.getElementById('filtroTextoBitacora').value = '';
    mostrarTab('bitacora');
  }
}