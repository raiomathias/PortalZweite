-- PortalZweite v1.3: RPCs para consultar y editar la ficha completa de partes.
-- Ejecutar una sola vez en Supabase SQL Editor.
CREATE OR REPLACE FUNCTION public.pd_admin_obtener_parte(p_token uuid, p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion public.sesiones%ROWTYPE;
  v_parte public.partes_emergencia%ROWTYPE;
  v_unidades jsonb;
  v_asistencia jsonb;
  v_guardias jsonb;
BEGIN
  SELECT * INTO v_sesion FROM public.sesiones
  WHERE token = p_token AND expira_en > now()
    AND permisos = 'Administrador de sistema';
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión inválida o sin permisos de administrador'; END IF;

  SELECT * INTO v_parte FROM public.partes_emergencia WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe el parte solicitado'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY u.id), '[]'::jsonb)
    INTO v_unidades FROM public.partes_unidades u WHERE u.parte_id = p_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
    INTO v_asistencia FROM public.partes_asistencia a WHERE a.parte_id = p_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',g.id,'uid',g.uid,'fecha',g.fecha,'tipo',g.tipo) ORDER BY g.fecha DESC), '[]'::jsonb)
    INTO v_guardias
    FROM public.guardias_emergencias ge
    JOIN public.guardias g ON g.id = ge.guardia_id
    WHERE ge.parte_id = p_id;

  RETURN jsonb_build_object('parte',to_jsonb(v_parte),'unidades',v_unidades,'asistencia',v_asistencia,'guardias',v_guardias);
END;
$$;

CREATE OR REPLACE FUNCTION public.pd_admin_guardar_parte(p_token uuid, p_id bigint, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion public.sesiones%ROWTYPE;
  v_antes jsonb;
  v_despues jsonb;
  v_parte jsonb;
BEGIN
  SELECT * INTO v_sesion FROM public.sesiones
  WHERE token = p_token AND expira_en > now()
    AND permisos = 'Administrador de sistema';
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión inválida o sin permisos de administrador'; END IF;
  IF p_datos IS NULL OR jsonb_typeof(p_datos->'parte') <> 'object' THEN
    RAISE EXCEPTION 'Los datos del parte tienen un formato inválido';
  END IF;

  SELECT to_jsonb(p) INTO v_antes FROM public.partes_emergencia p WHERE p.id = p_id FOR UPDATE;
  IF v_antes IS NULL THEN RAISE EXCEPTION 'No existe el parte solicitado'; END IF;
  v_parte := p_datos->'parte';

  UPDATE public.partes_emergencia SET
    codigo = COALESCE(v_parte->>'codigo',codigo),
    anio = COALESCE(NULLIF(v_parte->>'anio','')::integer,anio),
    numero = COALESCE(NULLIF(v_parte->>'numero','')::integer,numero),
    es_prueba = COALESCE(NULLIF(v_parte->>'es_prueba','')::boolean,es_prueba),
    reportado_por = COALESCE(v_parte->>'reportado_por',reportado_por),
    reportado_por_nombre = COALESCE(v_parte->>'reportado_por_nombre',reportado_por_nombre),
    fecha_inicio = COALESCE(NULLIF(v_parte->>'fecha_inicio','')::date,fecha_inicio),
    hora_inicio = COALESCE(NULLIF(v_parte->>'hora_inicio','')::time,hora_inicio),
    hora_termino = COALESCE(NULLIF(v_parte->>'hora_termino','')::time,hora_termino),
    hora_cierre = COALESCE(NULLIF(v_parte->>'hora_cierre','')::time,hora_cierre),
    mando_cbpm = COALESCE(v_parte->>'mando_cbpm',mando_cbpm),
    mando_compania = COALESCE(v_parte->>'mando_compania',mando_compania),
    maquinas_concurrentes = v_parte->>'maquinas_concurrentes',
    tipo_acto = COALESCE(v_parte->>'tipo_acto',tipo_acto),
    direccion = COALESCE(v_parte->>'direccion',direccion),
    ciudad = COALESCE(v_parte->>'ciudad',ciudad),
    propietario_rut = v_parte->>'propietario_rut',
    encargado_rut = v_parte->>'encargado_rut',
    contacto = v_parte->>'contacto',
    observaciones_antecedentes = v_parte->>'observaciones_antecedentes',
    material_mayor = ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_parte->'material_mayor','[]'::jsonb))),
    bomba_interna = ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_parte->'bomba_interna','[]'::jsonb))),
    observaciones_material_mayor = v_parte->>'observaciones_material_mayor'
  WHERE id = p_id;

  DELETE FROM public.partes_unidades WHERE parte_id = p_id;
  INSERT INTO public.partes_unidades(parte_id,unidad,conductor,km_salida,km_regreso,bomba_interna,material_menor)
  SELECT p_id,x.unidad,x.conductor,x.km_salida,x.km_regreso,COALESCE(x.bomba_interna,false),x.material_menor
  FROM jsonb_to_recordset(COALESCE(p_datos->'unidades','[]'::jsonb))
    AS x(unidad text,conductor text,km_salida text,km_regreso text,bomba_interna boolean,material_menor text);

  DELETE FROM public.partes_asistencia WHERE parte_id = p_id;
  INSERT INTO public.partes_asistencia(parte_id,clave,nombre,categoria)
  SELECT p_id,x.clave,x.nombre,x.categoria
  FROM jsonb_to_recordset(COALESCE(p_datos->'asistencia','[]'::jsonb))
    AS x(clave text,nombre text,categoria text);

  SELECT to_jsonb(p) INTO v_despues FROM public.partes_emergencia p WHERE p.id = p_id;
  INSERT INTO public.auditoria_pd(fecha,entidad,accion,referencia,clave,nombre,antes,despues)
  VALUES(now(),'parte','actualizar_admin',v_despues->>'codigo',v_sesion.usuario,
    v_despues->>'reportado_por_nombre',v_antes,v_despues);

  RETURN jsonb_build_object('ok',true,'id',p_id,'codigo',v_despues->>'codigo');
END;
$$;

REVOKE ALL ON FUNCTION public.pd_admin_obtener_parte(uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pd_admin_guardar_parte(uuid,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pd_admin_obtener_parte(uuid,bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pd_admin_guardar_parte(uuid,bigint,jsonb) TO anon, authenticated;
