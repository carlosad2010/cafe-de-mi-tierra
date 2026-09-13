-- ============================================================
-- SEC-12: el botón «Inactivo» de /usuarios no escribía en la base
-- ============================================================
-- Hallazgo nuevo, no estaba en la auditoría original — apareció al
-- revisar las políticas de `profiles` para SEC-03. El botón que
-- activa/desactiva un usuario en /usuarios llama a
--   supabase.from('profiles').update({ active: !p.active }).eq('id', p.id)
-- con el cliente del navegador, sobre el id del usuario objetivo, no el
-- propio. Pero la política de UPDATE de `profiles` (incluso después de
-- fix_sec03_profiles_policies.sql) era `auth.uid() = id`: sólo dejaba
-- modificar la propia fila.
--
-- Cuando RLS bloquea una fila en un UPDATE, PostgREST no lo reporta como
-- error — simplemente afecta cero filas. El código de UsersClient.tsx sólo
-- revisa `if (!error)` para actualizar el estado local, así que la
-- interfaz mostraba el cambio como exitoso aunque la base de datos no
-- hubiera cambiado nada.
--
-- Esto no era sólo un bug de UX: significaba que el arreglo de SEC-06
-- (cerrar la sesión de un usuario inactivo en cuanto vuelve a navegar,
-- ver app/(dashboard)/layout.tsx) nunca llegaba a dispararse, porque nadie
-- más que el propio usuario podía realmente ponerse active = false.
--
-- es_admin() sigue el mismo patrón que puede_escribir(): security definer
-- para poder leer el propio perfil del llamante sin depender de las
-- políticas de SELECT (evita cualquier problema de evaluación circular).
--
-- Depende de fix_sec03_profiles_policies.sql (reemplaza la misma política
-- de UPDATE que crea ese archivo). Aplicado el 13 sep 2026 vía Supabase
-- MCP (apply_migration), verificado releyendo la política después y
-- confirmando que los perfiles existentes no se alteraron. Ver el informe
-- de seguridad para el detalle completo (hallazgo SEC-12).
-- ============================================================

create or replace function public.es_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select p.role = 'admin'
       from public.profiles p
      where p.id = auth.uid()),
    false)
$function$;

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id or public.es_admin())
  with check (auth.uid() = id or public.es_admin());
