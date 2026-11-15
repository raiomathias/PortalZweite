-- PortalZweite · Estadísticas del panel administrador (solo lectura).
-- Ya aplicada en Supabase; se guarda aquí como respaldo. Valida token de Administrador de sistema.
CREATE OR REPLACE FUNCTION public.pd_admin_stats_datos(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ok boolean; v jsonb;
BEGIN
  SELECT true INTO v_ok FROM public.sesiones
   WHERE token = p_token AND expira_en > now() AND permisos = 'Administrador de sistema';
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'Sesión inválida o sin permisos de administrador'; END IF;
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
REVOKE ALL ON FUNCTION public.pd_admin_stats_datos(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pd_admin_stats_datos(uuid) TO anon, authenticated;
