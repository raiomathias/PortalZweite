// PORTAL ZWEITE · Panel administrador de partes · v1.3
// Se carga después de portal.js y amplía/sobrescribe sus vistas de administración.
function mostrarAdminTab(nombre) {
  if (!SESION || SESION.permisos !== 'Administrador de sistema') { alert('Acceso exclusivo al administrador de sistema.'); return; }
  ADMIN_TAB_ACTUAL = nombre;
  document.querySelectorAll('[data-admintab]').forEach(b => b.classList.toggle('activo', b.dataset.admintab === nombre));
  if (nombre === 'emergencias') renderAdminEmergencias();
  if (nombre === 'guardias') renderAdminGuardias();
  if (nombre === 'auditoria') renderAdminAuditoria();
  if (nombre === 'personal') renderAdminPersonal();
}
function renderAdminEmergencias() {
  const cont = document.getElementById('contenidoAdmin');
  cont.innerHTML = '<section class="admin-resumen"><div class="admin-resumen-cabecera"><div><h2>Partes de emergencia</h2><p>Consulta y administra la ficha completa de cada parte.</p></div><button class="btn-secundario" onclick="cargarAdminEmergencias()">↻ Actualizar</button></div><div class="admin-kpis" id="adEmKpis"></div></section><div class="auditoria-filtros admin-em-filtros"><input id="adEmTexto" placeholder="Buscar código, dirección, acto, reportante o ciudad..." aria-label="Buscar partes"><input id="adEmDesde" type="date" aria-label="Fecha desde"><input id="adEmHasta" type="date" aria-label="Fecha hasta"><select id="adEmPruebas" aria-label="Tipo de parte"><option value="reales">Solo reales</option><option value="pruebas">Solo de prueba</option><option value="todas">Todas</option></select><button class="btn-secundario" onclick="cargarAdminEmergencias()">Aplicar filtros</button><button class="btn-texto" onclick="limpiarFiltrosAdminEmergencias()">Limpiar</button></div><div id="adEmEstado" class="nota" role="status"></div><div id="adEmLista" class="admin-partes-lista"></div>';
  ['adEmTexto','adEmDesde','adEmHasta','adEmPruebas'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener(id === 'adEmTexto' ? 'input' : 'change', () => {
      if (id === 'adEmTexto') { clearTimeout(window.__adminParteFiltroTimer); window.__adminParteFiltroTimer = setTimeout(cargarAdminEmergencias, 250); }
      else cargarAdminEmergencias();
    });
  });
  cargarAdminEmergencias();
}
function limpiarFiltrosAdminEmergencias() {
  ['adEmTexto','adEmDesde','adEmHasta'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const p = document.getElementById('adEmPruebas'); if (p) p.value = 'reales';
  cargarAdminEmergencias();
}
async function cargarAdminEmergencias() {
  const lista = document.getElementById('adEmLista'); if (!lista) return;
  lista.innerHTML = '<p class="nota">Cargando partes...</p>';
  const { data, error } = await cliente.rpc('pd_admin_emergencias', {
    p_token: SESION.token, p_texto: val('adEmTexto') || null,
    p_desde: val('adEmDesde') || null, p_hasta: val('adEmHasta') || null, p_pruebas: val('adEmPruebas') || 'reales'
  });
  if (error) { lista.innerHTML = '<div class="admin-vacio admin-error"><strong>No se pudieron cargar los partes</strong><p>' + escapeHtml(error.message) + '</p><p class="nota">Comprueba que las funciones SQL estén instaladas.</p></div>'; return; }
  const partes = Array.isArray(data) ? data : [], reales = partes.filter(p => !p.es_prueba).length;
  document.getElementById('adEmKpis').innerHTML =
    '<div class="admin-kpi"><span>Partes encontrados</span><strong>' + partes.length + '</strong></div>' +
    '<div class="admin-kpi"><span>Reales</span><strong>' + reales + '</strong></div>' +
    '<div class="admin-kpi"><span>De prueba</span><strong>' + (partes.length-reales) + '</strong></div>' +
    '<div class="admin-kpi"><span>PDF con error</span><strong>' + partes.filter(p => p.pdf_estado === 'error').length + '</strong></div>';
  document.getElementById('adEmEstado').textContent = partes.length + ' parte(s). Abre la ficha para consultar y editar todos sus datos.';
  if (!partes.length) { lista.innerHTML = '<div class="admin-vacio"><strong>No hay partes que coincidan</strong><p>Prueba otras fechas o limpia los filtros.</p></div>'; return; }
  lista.innerHTML = partes.map(p => {
    const mat = Array.isArray(p.material_mayor) ? p.material_mayor : [];
    return '<article class="admin-parte-card"><div class="admin-parte-principal"><div class="admin-parte-titulo"><strong>' + escapeHtml(p.codigo || ('Parte #' + p.id)) + '</strong><span class="badge ' + (p.es_prueba ? 'badge-warning':'badge-success') + '">' + (p.es_prueba?'PRUEBA':'REAL') + '</span><span class="badge ' + (p.pdf_estado==='ok'?'badge-success':p.pdf_estado==='error'?'badge-danger':'badge-warning') + '">PDF: ' + escapeHtml(p.pdf_estado || 'sin estado') + '</span></div><div class="admin-parte-datos"><span><b>Fecha:</b> ' + escapeHtml((p.fecha_inicio ? formatearFecha(p.fecha_inicio) : 'Sin fecha') + ' ' + (p.hora_inicio || '').slice(0,5)) + '</span><span><b>Acto:</b> ' + escapeHtml(p.tipo_acto || 'Sin especificar') + '</span><span><b>Ubicación:</b> ' + escapeHtml([p.direccion,p.ciudad].filter(Boolean).join(', ') || 'Sin ubicación') + '</span><span><b>Reportante:</b> ' + escapeHtml(p.reportado_por_nombre || p.reportado_por || 'Sin reportante') + '</span><span><b>Material mayor:</b> ' + escapeHtml(mat.join(', ') || 'No indicado') + '</span></div></div><div class="admin-parte-acciones"><button class="btn-secundario" onclick="abrirEditorParteAdmin(' + Number(p.id) + ')">Ver y editar ficha completa →</button><button class="btn-texto" onclick="marcarPruebaAdmin(' + Number(p.id) + ', ' + (!p.es_prueba) + ')">' + (p.es_prueba ? 'Marcar como real':'Marcar como prueba') + '</button></div></article>';
  }).join('');
}
function adminCampoParte(k,label,value,type) {
  const v = value === null || value === undefined ? '' : String(value);
  return '<label class="admin-campo">' + escapeHtml(label) + '<input id="apd_' + k + '" type="' + (type || 'text') + '" value="' + escapeHtml(v) + '"></label>';
}
function adminAreaParte(k,label,value) {
  const v = value === null || value === undefined ? '' : String(value);
  return '<label class="admin-campo admin-campo-ancho">' + escapeHtml(label) + '<textarea id="apd_' + k + '" rows="3">' + escapeHtml(v) + '</textarea></label>';
}
async function abrirEditorParteAdmin(id) {
  const modal = document.getElementById('modalAdminParte'), cuerpo = document.getElementById('adminParteModalContenido');
  cuerpo.innerHTML = '<p class="nota">Cargando ficha completa...</p>'; modal.classList.remove('oculto');
  const {data,error} = await cliente.rpc('pd_admin_obtener_parte',{p_token:SESION.token,p_id:id});
  if (error || !data || !data.parte) { cuerpo.innerHTML = '<h3>No se pudo abrir el parte</h3><p class="mensaje-error">' + escapeHtml(error ? error.message : 'No se recibieron los datos.') + '</p><button type="button" class="btn-secundario" onclick="cerrarEditorParteAdmin()">Cerrar</button>'; return; }
  const p=data.parte, unidades=(data.unidades||[]).map(u=>[u.unidad,u.conductor,u.km_salida,u.km_regreso,u.bomba_interna?'sí':'no',u.material_menor].map(x=>String(x||'').replace(/[|\r\n]/g,' ')).join(' | ')).join('\n');
  const asistencia=(data.asistencia||[]).map(x=>[x.clave,x.nombre,x.categoria].map(v=>String(v||'').replace(/[|\r\n]/g,' ')).join(' | ')).join('\n');
  cuerpo.innerHTML = '<div class="admin-editor-cabecera"><div><p class="nota">FICHA DE EMERGENCIA · ID ' + escapeHtml(p.id) + '</p><h2>Editar ' + escapeHtml(p.codigo||'parte') + '</h2><p>Los cambios incluyen los datos principales, unidades y asistencia.</p></div><button type="button" class="btn-icono admin-cerrar" onclick="cerrarEditorParteAdmin()" aria-label="Cerrar">✕</button></div>' +
  '<form id="formAdminParte" onsubmit="return guardarParteAdmin(event,'+Number(p.id)+')"><section class="admin-editor-seccion"><h3>Identificación y tiempos</h3><div class="admin-campos-grid">' +
  adminCampoParte('codigo','Código',p.codigo)+adminCampoParte('anio','Año',p.anio,'number')+adminCampoParte('numero','Número correlativo',p.numero,'number')+adminCampoParte('reportado_por','Usuario / clave reportante',p.reportado_por)+adminCampoParte('reportado_por_nombre','Nombre del reportante',p.reportado_por_nombre)+adminCampoParte('fecha_inicio','Fecha de inicio',p.fecha_inicio,'date')+adminCampoParte('hora_inicio','Hora de inicio',p.hora_inicio,'time')+adminCampoParte('hora_termino','Hora término',p.hora_termino,'time')+adminCampoParte('hora_cierre','Hora de cierre',p.hora_cierre,'time')+'<label class="admin-campo admin-check"><input type="checkbox" id="apd_es_prueba" '+(p.es_prueba?'checked':'')+'> Parte de prueba</label></div></section>' +
  '<section class="admin-editor-seccion"><h3>Mando, ubicación y clasificación</h3><div class="admin-campos-grid">'+adminCampoParte('mando_cbpm','Mando CBPM',p.mando_cbpm)+adminCampoParte('mando_compania','Mando de compañía',p.mando_compania)+adminCampoParte('maquinas_concurrentes','Máquinas concurrentes (separadas por coma)',p.maquinas_concurrentes)+adminCampoParte('tipo_acto','Tipo de acto',p.tipo_acto)+adminCampoParte('direccion','Dirección',p.direccion)+adminCampoParte('ciudad','Ciudad',p.ciudad)+adminCampoParte('propietario_rut','RUT propietario',p.propietario_rut)+adminCampoParte('encargado_rut','RUT encargado',p.encargado_rut)+adminCampoParte('contacto','Contacto',p.contacto)+'</div></section>' +
  '<section class="admin-editor-seccion"><h3>Antecedentes y recursos</h3><div class="admin-campos-grid">'+adminAreaParte('observaciones_antecedentes','Antecedentes y observaciones',p.observaciones_antecedentes)+adminCampoParte('material_mayor','Material mayor (separado por coma)',(p.material_mayor||[]).join(', '))+adminCampoParte('bomba_interna','Bomba interna (separada por coma)',(p.bomba_interna||[]).join(', '))+adminAreaParte('observaciones_material_mayor','Observaciones de material mayor',p.observaciones_material_mayor)+'</div></section>' +
  '<section class="admin-editor-seccion"><h3>Unidades participantes</h3><p class="nota">Una unidad por línea: Unidad | Conductor | KM salida | KM regreso | Bomba interna (sí/no) | Material menor. Unidades válidas: B-2, HX-2, H-2.</p><textarea id="apd_unidades" rows="5" spellcheck="false">'+escapeHtml(unidades)+'</textarea></section>' +
  '<section class="admin-editor-seccion"><h3>Asistencia</h3><p class="nota">Una persona por línea: Clave | Nombre completo | Categoría. Categorías válidas: activos, honorarios, confederados, aspirantes.</p><textarea id="apd_asistencia" rows="7" spellcheck="false">'+escapeHtml(asistencia)+'</textarea></section>' +
  '<section class="admin-editor-seccion admin-metadatos"><h3>Documentos y trazabilidad</h3><div class="admin-campos-grid"><div><span class="nota">Creado en</span><strong>'+escapeHtml(p.creado_en||'—')+'</strong></div><div><span class="nota">Estado PDF</span><strong>'+escapeHtml(p.pdf_estado||'pendiente')+'</strong></div><div><span class="nota">PDF</span>'+(p.pdf_url?'<a href="'+escapeHtml(p.pdf_url)+'" target="_blank" rel="noopener noreferrer">Abrir PDF</a>':'Sin archivo')+'</div><div><span class="nota">Presentación</span>'+(p.slides_url?'<a href="'+escapeHtml(p.slides_url)+'" target="_blank" rel="noopener noreferrer">Abrir presentación</a>':'Sin archivo')+'</div>'+(p.pdf_error?'<div class="admin-campo-ancho"><span class="nota">Error PDF</span><p>'+escapeHtml(p.pdf_error)+'</p></div>':'')+(p.legacy?'<div class="admin-campo-ancho"><span class="nota">Datos heredados</span><pre class="admin-legacy">'+escapeHtml(JSON.stringify(p.legacy,null,2))+'</pre></div>':'')+'<div class="admin-campo-ancho"><span class="nota">Guardias asociadas</span><p>'+escapeHtml((data.guardias||[]).map(g=>g.uid).join(', ')||'Sin guardia asociada')+'</p></div></div></section>' +
  '<p id="adminParteMensaje" class="mensaje" role="status"></p><div class="admin-editor-acciones"><button type="button" class="btn-texto" onclick="cerrarEditorParteAdmin()">Cancelar</button><button type="submit" class="btn-principal" id="btnGuardarAdminParte">Guardar todos los cambios</button></div></form>';
}
function cerrarEditorParteAdmin() { const m=document.getElementById('modalAdminParte'); if(m)m.classList.add('oculto'); }
function parsearLineasAdmin(texto,tipo) {
  return String(texto||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map((linea,i)=>{
    const c=linea.split('|').map(v=>v.trim());
    if(tipo==='unidad') {
      const unidad=(c[0]||'').toUpperCase(), bomba=(c[4]||'no').toLowerCase();
      if(!['B-2','HX-2','H-2'].includes(unidad)) throw new Error('Unidad inválida en línea '+(i+1)+'. Usa B-2, HX-2 o H-2.');
      if(!['si','sí','no','true','false','1','0',''].includes(bomba)) throw new Error('Bomba interna inválida en línea '+(i+1)+'.');
      return {unidad,conductor:c[1]||null,km_salida:c[2]||null,km_regreso:c[3]||null,bomba_interna:['si','sí','true','1'].includes(bomba),material_menor:c.slice(5).join(' | ')||null};
    }
    const categoria=(c[2]||'activos').toLowerCase();
    if(!c[1]) throw new Error('Falta el nombre en la línea '+(i+1)+'.');
    if(!['activos','honorarios','confederados','aspirantes'].includes(categoria)) throw new Error('Categoría inválida en la línea '+(i+1)+'.');
    return {clave:c[0]||null,nombre:c[1],categoria};
  });
}
async function guardarParteAdmin(evento,id) {
  evento.preventDefault();
  const boton=document.getElementById('btnGuardarAdminParte'),msg=document.getElementById('adminParteMensaje');
  const mensaje=t=>{if(msg)msg.textContent=t;};
  let unidades,asistencia;
  try {unidades=parsearLineasAdmin(val('apd_unidades'),'unidad');asistencia=parsearLineasAdmin(val('apd_asistencia'),'asistencia');}
  catch(err){mensaje(err.message);msg.className='mensaje mensaje-error';return false;}
  const leer=k=>{const e=document.getElementById('apd_'+k);return e?e.value.trim():'';};
  const req=['codigo','reportado_por','reportado_por_nombre','fecha_inicio','hora_inicio','hora_termino','hora_cierre','mando_cbpm','mando_compania','tipo_acto','direccion','ciudad'];
  const faltan=req.filter(k=>!leer(k));if(faltan.length){mensaje('Completa los campos obligatorios: '+faltan.join(', '));msg.className='mensaje mensaje-error';return false;}
  const lista=t=>t.split(',').map(s=>s.trim()).filter(Boolean);
  const parte={codigo:leer('codigo'),anio:Number(leer('anio')),numero:Number(leer('numero')),es_prueba:document.getElementById('apd_es_prueba').checked,reportado_por:leer('reportado_por'),reportado_por_nombre:leer('reportado_por_nombre'),fecha_inicio:leer('fecha_inicio'),hora_inicio:leer('hora_inicio'),hora_termino:leer('hora_termino'),hora_cierre:leer('hora_cierre'),mando_cbpm:leer('mando_cbpm'),mando_compania:leer('mando_compania'),maquinas_concurrentes:leer('maquinas_concurrentes')||null,tipo_acto:leer('tipo_acto'),direccion:leer('direccion'),ciudad:leer('ciudad'),propietario_rut:leer('propietario_rut')||null,encargado_rut:leer('encargado_rut')||null,contacto:leer('contacto')||null,observaciones_antecedentes:leer('observaciones_antecedentes')||null,material_mayor:lista(leer('material_mayor')),bomba_interna:lista(leer('bomba_interna')),observaciones_material_mayor:leer('observaciones_material_mayor')||null};
  if(!Number.isInteger(parte.anio)||!Number.isInteger(parte.numero)||parte.anio<2000||parte.numero<1){mensaje('El año debe ser válido y el número correlativo mayor que cero.');msg.className='mensaje mensaje-error';return false;}
  boton.disabled=true;boton.textContent='Guardando…';
  try {const {error}=await cliente.rpc('pd_admin_guardar_parte',{p_token:SESION.token,p_id:id,p_datos:{parte,unidades,asistencia}});if(error)throw new Error(error.message);mensaje('Parte actualizado correctamente.');msg.className='mensaje mensaje-ok';await cargarAdminEmergencias();setTimeout(cerrarEditorParteAdmin,500);}
  catch(err){mensaje('No se pudo guardar: '+(err.message||err));msg.className='mensaje mensaje-error';}
  finally{boton.disabled=false;boton.textContent='Guardar todos los cambios';}
  return false;
}
async function marcarPruebaAdmin(id,valor) {
  const {error}=await cliente.rpc('pd_admin_marcar_prueba',{p_token:SESION.token,p_id:id,p_valor:valor});
  if(error){alert(error.message);return;} cargarAdminEmergencias();
}
