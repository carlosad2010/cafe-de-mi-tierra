-- ============================================================
-- SEC-03: escalada a admin borrando y recreando el propio perfil
-- ============================================================
-- El campo `role` estaba protegido por el trigger `proteger_rol_perfil`,
-- que es BEFORE UPDATE y compara old.role con new.role. Pero las políticas
-- de `profiles` permitían a cada usuario borrar su propia fila (auth.uid()
-- = id) e insertarla de nuevo con cualquier rol (auth.uid() = id, sin mirar
-- el valor). Un DELETE seguido de un INSERT nunca dispara un trigger de
-- UPDATE, así que un usuario de consulta (o cualquier cuenta recién
-- creada, sin historial que bloqueara el DELETE por llaves foráneas) podía
-- reinsertarse a sí mismo con role = 'admin'.
--
-- Ningún flujo de la app borra su propia fila de `profiles` (confirmado
-- por grep sobre el código fuente), así que la política de DELETE no
-- protegía ninguna funcionalidad real. El autoaprovisionamiento en
-- app/(dashboard)/layout.tsx siempre inserta exactamente
-- role='seller', sin tocar `active` (que por defecto es true), así que
-- fijar esos dos valores en el CHECK del INSERT no rompe ese flujo.
--
-- Aplicado el 13 sep 2026 vía Supabase MCP (apply_migration), verificado
-- releyendo pg_policies después. Ver el informe de seguridad para el
-- detalle completo (hallazgo SEC-03).
-- ============================================================

drop policy if exists "Users can update own profile data" on public.profiles;

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'seller' and active = true);

-- Única política de la tabla sin WITH CHECK. No cambiaba el comportamiento
-- (el trigger ya protegía role/active en cualquier UPDATE), pero cierra el
-- hueco por completo en vez de depender sólo del trigger.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
