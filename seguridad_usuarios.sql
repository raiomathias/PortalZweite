-- PortalZweite · Gestión de usuarios con validación de sesión (ya aplicada en Supabase; respaldo).
-- Antes, editar_usuario / agregar_usuario / eliminar_usuario (variantes con p_token text) NO validaban
-- la sesión: cualquiera con la clave pública podía cambiar permisos, contraseñas o borrar usuarios.
-- Ahora exigen sesión válida y el permiso acceso_panel_usuarios (solo Administrador de sistema),
-- igual que listar_usuarios y las variantes con token uuid.

CREATE OR REPLACE FUNCTION public.editar_usuario(p_token text, p_usuario text, p_nombre text, p_permisos text, p_contrasena text DEFAULT NULL::text, p_es_encargado boolean DEFAULT false, p_es_conductor boolean DEFAULT false, p_lista boolean DEFAULT true, p_categoria text DEFAULT 'activos'::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_sesion jsonb;
BEGIN
  v_sesion := _validar_sesion(p_token::uuid);
  IF NOT _tiene_permiso(v_sesion->>'permisos', 'acceso_panel_usuarios') THEN
    RAISE EXCEPTION 'No tienes acceso al panel de usuarios';
  END IF;
  IF p_contrasena IS NOT NULL AND p_contrasena <> '' THEN
    UPDATE usuarios SET nombre_persona = p_nombre, permisos = p_permisos, contrasena = p_contrasena,
      es_encargado = p_es_encargado, es_conductor = p_es_conductor, lista = p_lista, categoria = p_categoria
    WHERE usuario = p_usuario;
  ELSE
    UPDATE usuarios SET nombre_persona = p_nombre, permisos = p_permisos,
      es_encargado = p_es_encargado, es_conductor = p_es_conductor, lista = p_lista, categoria = p_categoria
    WHERE usuario = p_usuario;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.editar_usuario(p_token text, p_usuario text, p_nombre text, p_permisos text, p_contrasena text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_sesion jsonb;
BEGIN
  v_sesion := _validar_sesion(p_token::uuid);
  IF NOT _tiene_permiso(v_sesion->>'permisos', 'acceso_panel_usuarios') THEN
    RAISE EXCEPTION 'No tienes acceso al panel de usuarios';
  END IF;
  IF p_contrasena IS NOT NULL AND p_contrasena <> '' THEN
    UPDATE usuarios SET nombre_persona = p_nombre, permisos = p_permisos, contrasena = p_contrasena WHERE usuario = p_usuario;
  ELSE
    UPDATE usuarios SET nombre_persona = p_nombre, permisos = p_permisos WHERE usuario = p_usuario;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agregar_usuario(p_token text, p_usuario text, p_nombre text, p_contrasena text, p_permisos text, p_es_encargado boolean DEFAULT false, p_es_conductor boolean DEFAULT false, p_lista boolean DEFAULT true, p_categoria text DEFAULT 'activos'::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_sesion jsonb;
BEGIN
  v_sesion := _validar_sesion(p_token::uuid);
  IF NOT _tiene_permiso(v_sesion->>'permisos', 'acceso_panel_usuarios') THEN
    RAISE EXCEPTION 'No tienes acceso al panel de usuarios';
  END IF;
  INSERT INTO usuarios (usuario, nombre_persona, contrasena, permisos, es_encargado, es_conductor, lista, categoria)
  VALUES (p_usuario, p_nombre, p_contrasena, p_permisos, p_es_encargado, p_es_conductor, p_lista, p_categoria);
END;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_usuario(p_token text, p_usuario text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_sesion jsonb;
BEGIN
  v_sesion := _validar_sesion(p_token::uuid);
  IF NOT _tiene_permiso(v_sesion->>'permisos', 'acceso_panel_usuarios') THEN
    RAISE EXCEPTION 'No tienes acceso al panel de usuarios';
  END IF;
  DELETE FROM usuarios WHERE usuario = p_usuario;
END;
$function$;
