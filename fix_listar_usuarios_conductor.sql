-- PortalZweite: corrección de Administración > Personal.
-- La interfaz ya enviaba p_es_conductor a editar_usuario, pero listar_usuarios
-- no devolvía es_conductor (ni es_encargado/lista/categoria). Al reabrir la
-- ficha, el frontend interpretaba el campo ausente como false y desmarcaba
-- "Es Conductor", aunque el valor estuviera guardado en public.usuarios.
--
-- Aplicado en Supabase el 2026-10-21.
CREATE OR REPLACE FUNCTION public.listar_usuarios(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sesion jsonb;
  v_puede_ver_pass boolean;
  v_result jsonb;
BEGIN
  v_sesion := _validar_sesion(p_token);

  IF NOT _tiene_permiso(v_sesion->>'permisos', 'acceso_panel_usuarios') THEN
    RAISE EXCEPTION 'No tienes acceso al panel de usuarios';
  END IF;

  v_puede_ver_pass := _tiene_permiso(v_sesion->>'permisos', 'puede_ver_contrasenas');

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'usuario', usuario,
        'nombre', nombre_persona,
        'nombre_persona', nombre_persona,
        'permisos', permisos,
        'contrasena', CASE WHEN v_puede_ver_pass THEN contrasena ELSE NULL END,
        'es_encargado', es_encargado,
        'es_conductor', es_conductor,
        'lista', lista,
        'categoria', categoria,
        'foto_url', foto_url
      )
      ORDER BY nombre_persona, usuario
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.usuarios;

  RETURN v_result;
END;
$function$;
