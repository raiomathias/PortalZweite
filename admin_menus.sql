-- PortalZweite · Acceso por menú al Panel Administrador (solo lectura).
-- Cada usuario puede tener una lista de menús del panel (usuarios.admin_menus).
-- Menús delegables: estadisticas, emergencias, guardias, auditoria.
-- "Personal" NO es delegable (muestra contraseñas y gestiona usuarios).
-- Escrituras (editar/eliminar partes, personal, etc.) siguen siendo solo del Administrador de sistema.

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS admin_menus text[] NOT NULL DEFAULT '{}';

-- Exige sesión válida y: ser Administrador de sistema, o tener el menú asignado.
CREATE OR REPLACE FUNCTION public._pd_exigir_menu(p_token uuid, p_menu text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (s.permisos = 'Administrador de sistema') OR (p_menu = ANY (COALESCE(u.admin_menus, '{}')))
    INTO v_ok
    FROM public.sesiones s JOIN public.usuarios u ON u.usuario = s.usuario
   WHERE s.token = p_token AND s.expira_en > now();
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'No tienes acceso a este menú del panel de administración';
  END IF;
END $$;

-- Menús a los que puede entrar la sesión actual.
CREATE OR REPLACE FUNCTION public.pd_admin_menus_de(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_perm text; v_menus text[];
BEGIN
  SELECT s.permisos, COALESCE(u.admin_menus, '{}') INTO v_perm, v_menus
    FROM public.sesiones s JOIN public.usuarios u ON u.usuario = s.usuario
   WHERE s.token = p_token AND s.expira_en > now();
  IF v_perm IS NULL THEN RAISE EXCEPTION 'Sesión inválida o expirada'; END IF;
  IF v_perm = 'Administrador de sistema' THEN
    RETURN jsonb_build_object('admin', true, 'menus', to_jsonb(ARRAY['emergencias','guardias','auditoria','personal','estadisticas']));
  END IF;
  RETURN jsonb_build_object('admin', false, 'menus', to_jsonb(v_menus));
END $$;

-- Lista (usuario -> menús) para el editor de Personal. Solo administrador.
CREATE OR REPLACE FUNCTION public.pd_admin_menus_usuarios(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._pd_exigir_admin(public._pd_actor(p_token));
  RETURN COALESCE((SELECT jsonb_object_agg(usuario, to_jsonb(admin_menus)) FROM public.usuarios WHERE COALESCE(cardinality(admin_menus),0) > 0), '{}'::jsonb);
END $$;

-- Asigna menús a un usuario. Solo administrador. Deja registro en auditoría.
CREATE OR REPLACE FUNCTION public.pd_admin_set_menus(p_token uuid, p_usuario text, p_menus text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE a jsonb; v_antes text[]; v_nuevo text[]; v_nombre text;
BEGIN
  a := public._pd_actor(p_token);
  PERFORM public._pd_exigir_admin(a);
  v_nuevo := ARRAY(SELECT DISTINCT m FROM unnest(COALESCE(p_menus, '{}')) m ORDER BY m);
  IF EXISTS (SELECT 1 FROM unnest(v_nuevo) m WHERE m NOT IN ('estadisticas','emergencias','guardias','auditoria')) THEN
    RAISE EXCEPTION 'Menú no permitido. Opciones: estadisticas, emergencias, guardias, auditoria';
  END IF;
  SELECT admin_menus, nombre_persona INTO v_antes, v_nombre FROM public.usuarios WHERE usuario = p_usuario FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe el usuario %', p_usuario; END IF;
  UPDATE public.usuarios SET admin_menus = v_nuevo WHERE usuario = p_usuario;
  INSERT INTO public.auditoria_pd(fecha, entidad, accion, referencia, clave, nombre, antes, despues)
  VALUES (now(), 'usuario', 'menus_admin', p_usuario, a->>'clave', a->>'nombre',
          jsonb_build_object('menus', to_jsonb(v_antes)), jsonb_build_object('menus', to_jsonb(v_nuevo), 'persona', v_nombre));
  RETURN jsonb_build_object('ok', true, 'usuario', p_usuario, 'menus', to_jsonb(v_nuevo));
END $$;

-- ─── Lecturas del panel: ahora aceptan administrador O el menú asignado ───

CREATE OR REPLACE FUNCTION public.pd_admin_stats_datos(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public._pd_exigir_menu(p_token, 'estadisticas');
  SELECT jsonb_build_object(
    'partes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'c', p.codigo, 'f', p.fecha_inicio, 'hi', to_char(p.hora_inicio,'HH24:MI'),
        'ht', to_char(p.hora_termino,'HH24:MI'), 't', p.tipo_acto, 'd', p.direccion,
        'm', COALESCE(to_jsonb(p.material_mayor), '[]'::jsonb), 'p', p.es_prueba, 'x', (p.legacy->>'origen') = 'excel_2026',
        'a', COALESCE((SELECT jsonb_agg(jsonb_build_array(s.clave, s.categoria)) FROM public.partes_asistencia s WHERE s.parte_id = p.id), '[]'::jsonb)
      ) ORDER BY p.fecha_inicio, p.id) FROM public.partes_emergencia p), '[]'::jsonb),
    'guardias', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'f', g.fecha, 't', g.tipo, 'x', g.creado_por = 'Importación Excel',
        'i', COALESCE((SELECT jsonb_agg(jsonb_build_array(i.clave, COALESCE(i.de_turno,false), COALESCE(i.observacion,''), COALESCE(i.es_jefe,false), COALESCE(i.es_conductor,false))) FROM public.guardias_integrantes i WHERE i.guardia_id = g.id), '[]'::jsonb)
      ) ORDER BY g.fecha, g.tipo) FROM public.guardias g), '[]'::jsonb),
    'personas', COALESCE((SELECT jsonb_agg(jsonb_build_array(u.usuario, u.nombre_persona, u.categoria, COALESCE(u.lista,false), u.permisos) ORDER BY u.nombre_persona) FROM public.usuarios u), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $$;

-- Emergencias: quien no es administrador no recibe RUT ni contacto de las personas involucradas.
CREATE OR REPLACE FUNCTION public.pd_admin_emergencias(p_token uuid, p_texto text, p_desde date, p_hasta date, p_pruebas text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_admin boolean;
BEGIN
  PERFORM public._pd_exigir_menu(p_token, 'emergencias');
  v_admin := (public._pd_actor(p_token)->>'admin')::boolean;
  RETURN coalesce((
    SELECT jsonb_agg(
      (CASE WHEN v_admin THEN to_jsonb(p) ELSE to_jsonb(p) - 'propietario_rut' - 'encargado_rut' - 'contacto' END) || jsonb_build_object(
        'unidades', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM partes_unidades u WHERE u.parte_id = p.id), '[]'::jsonb),
        'asistentes', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.categoria, s.nombre) FROM partes_asistencia s WHERE s.parte_id = p.id), '[]'::jsonb))
      ORDER BY p.fecha_inicio DESC, p.id DESC)
    FROM (
      SELECT * FROM partes_emergencia pe
      WHERE (p_desde IS NULL OR pe.fecha_inicio >= p_desde)
        AND (p_hasta IS NULL OR pe.fecha_inicio <= p_hasta)
        AND (coalesce(p_pruebas, 'reales') = 'todas'
             OR (p_pruebas = 'pruebas' AND pe.es_prueba)
             OR (coalesce(p_pruebas, 'reales') = 'reales' AND NOT pe.es_prueba))
        AND (p_texto IS NULL OR p_texto = ''
             OR pe.codigo ILIKE '%' || p_texto || '%' OR pe.direccion ILIKE '%' || p_texto || '%'
             OR pe.tipo_acto ILIKE '%' || p_texto || '%' OR pe.reportado_por_nombre ILIKE '%' || p_texto || '%'
             OR pe.reportado_por ILIKE '%' || p_texto || '%'
             OR EXISTS (SELECT 1 FROM partes_asistencia s
                        WHERE s.parte_id = pe.id
                          AND (s.nombre ILIKE '%' || p_texto || '%' OR s.clave ILIKE '%' || p_texto || '%')))
      ORDER BY pe.fecha_inicio DESC, pe.id DESC
      LIMIT 500) p
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.pd_admin_guardias(p_token uuid, p_desde date, p_hasta date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._pd_exigir_menu(p_token, 'guardias');
  RETURN coalesce((
    SELECT jsonb_agg(_pd_guardia_json(g.id) ORDER BY g.fecha DESC, g.tipo)
    FROM guardias g
    WHERE (p_desde IS NULL OR g.fecha >= p_desde) AND (p_hasta IS NULL OR g.fecha <= p_hasta)
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.pd_admin_auditoria(p_token uuid, p_entidad text, p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._pd_exigir_menu(p_token, 'auditoria');
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.fecha DESC) FROM (
      SELECT nombre, clave, accion, referencia, fecha, entidad, antes, despues
      FROM auditoria_pd
      WHERE (p_entidad IS NULL OR p_entidad = '' OR entidad = p_entidad)
        AND (p_texto IS NULL OR p_texto = ''
             OR nombre ILIKE '%' || p_texto || '%' OR clave ILIKE '%' || p_texto || '%'
             OR referencia ILIKE '%' || p_texto || '%')
      ORDER BY fecha DESC
      LIMIT 300) t), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public._pd_exigir_menu(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.pd_admin_menus_de(uuid) FROM public;
REVOKE ALL ON FUNCTION public.pd_admin_menus_usuarios(uuid) FROM public;
REVOKE ALL ON FUNCTION public.pd_admin_set_menus(uuid, text, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.pd_admin_menus_de(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pd_admin_menus_usuarios(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pd_admin_set_menus(uuid, text, text[]) TO anon, authenticated;
