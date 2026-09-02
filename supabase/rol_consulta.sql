-- ============================================================
-- ROL "CONSULTA" — acceso de solo lectura
-- ============================================================
-- Hasta ahora `profiles.role` solo decidía qué links se veían en el
-- sidebar. En la base, TODA política era de la forma
--   `for all using (auth.role() = 'authenticated')`
-- y `auth.role()` devuelve 'authenticated' para cualquier sesión, sin
-- relación con el rol de la app. Es decir: cualquier usuario logueado
-- podía escribir en cualquier tabla escribiendo la URL a mano o
-- llamando la API desde la consola del navegador.
--
-- Esto lo hace real en tres frentes:
--   1. Políticas partidas: SELECT abierto, escritura condicionada.
--   2. Guardas en las RPC. Son `security definer`, o sea que se saltan
--      RLS por completo: sin esto, un usuario de consulta podría
--      facturar una cuenta llamando la función directamente.
--   3. Cierre de una escalada de privilegios que ya existía: la
--      política de `profiles` permitía a cualquiera editar su propia
--      fila... incluido su propio `role`.
-- ============================================================

begin;

-- ── 1. El rol nuevo ─────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
    check (role in ('admin', 'seller', 'consulta'));

-- ── 2. ¿Este usuario puede escribir? ────────────────────────
-- `security definer` a propósito: leer `profiles` desde una política de
-- otra tabla es justo el tipo de subconsulta que causó recursión
-- infinita en este proyecto. Así se evita, y al ser `stable` Postgres
-- la evalúa una vez por sentencia en vez de una vez por fila.
create or replace function public.puede_escribir()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.role <> 'consulta' and p.active
       from public.profiles p
      where p.id = auth.uid()),
    false)
$$;

comment on function public.puede_escribir() is
  'true si el usuario actual puede modificar datos. Los de rol consulta y los inactivos no.';

grant execute on function public.puede_escribir() to authenticated;

-- ── 3. Políticas: lectura para todos, escritura restringida ─
-- Se generan en bucle para que ninguna tabla quede olvidada y para no
-- depender de los nombres que tengan hoy las políticas.
do $$
declare
  t    text;
  pol  record;
  -- `profiles` va aparte (regla propia) y las vistas no llevan RLS.
  tablas text[] := array[
    'cajas', 'compras', 'configuracion',
    'cuentas_cobrar', 'cuentas_cobrar_items', 'cuentas_cobrar_facturas',
    'customers', 'inventory_movements', 'metodos_pago', 'movimientos_caja',
    'order_items', 'orders', 'presentations', 'products', 'tipos_producto'
  ];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabla % no existe, se omite', t;
      continue;
    end if;

    for pol in select policyname from pg_policies
                where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);

    execute format($f$
      create policy "lectura_autenticados" on public.%I
        for select using (auth.role() = 'authenticated')$f$, t);

    execute format($f$
      create policy "insercion_escritores" on public.%I
        for insert with check (public.puede_escribir())$f$, t);

    execute format($f$
      create policy "actualizacion_escritores" on public.%I
        for update using (public.puede_escribir())
                   with check (public.puede_escribir())$f$, t);

    execute format($f$
      create policy "borrado_escritores" on public.%I
        for delete using (public.puede_escribir())$f$, t);
  end loop;
end $$;

-- ── 4. profiles: cerrar la escalada de privilegios ──────────
-- No se tocan sus políticas para no alterar lo que hoy ve /usuarios.
-- El control va por trigger, que es lo único capaz de comparar el valor
-- viejo contra el nuevo (una política RLS no puede).
create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_admin boolean;
begin
  if new.role is distinct from old.role
     or new.active is distinct from old.active then

    select coalesce((select p.role = 'admin' from public.profiles p
                      where p.id = auth.uid()), false)
      into v_es_admin;

    -- auth.uid() es null cuando corre la service_role (rutas de API con
    -- clave de servicio, o mantenimiento desde el SQL Editor).
    if auth.uid() is not null and not v_es_admin then
      raise exception 'Solo un administrador puede cambiar el rol o el estado de un usuario';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_rol_perfil on public.profiles;
create trigger proteger_rol_perfil
  before update on public.profiles
  for each row execute procedure public.proteger_rol_perfil();

commit;

-- ============================================================
-- 5. GUARDAS EN LAS RPC
-- ============================================================
-- Las funciones son `security definer`: se saltan RLS, así que las
-- políticas de arriba no las cubren. Cada una se renombra a `_impl` y
-- se recrea un envoltorio con la misma firma que valida primero.
--
-- Se hace de forma genérica, leyendo firma y tipo de retorno del
-- catálogo, para no depender de conocer el cuerpo de cada función
-- (`reversar_factura` y `trasladar_fondos` se escribieron directo en
-- Supabase y no están versionadas aquí).
--
-- La guarda usa `raise exception` y no un jsonb de error porque debe
-- servir para cualquier tipo de retorno (recalcular_cuenta_cobrar
-- devuelve numeric, no jsonb).

do $$
declare
  fn        text;
  v_oid     oid;
  v_args    text;
  v_ident   text;
  v_ret     text;
  v_named   text;
  v_count   int;
  funciones text[] := array[
    'crear_cuenta_cobrar', 'registrar_devolucion', 'facturar_cuenta_cobrar',
    'anular_cuenta_cobrar', 'recalcular_cuenta_cobrar',
    'reversar_factura', 'trasladar_fondos'
  ];
begin
  foreach fn in array funciones loop
    select count(*) into v_count from pg_proc
     where proname = fn and pronamespace = 'public'::regnamespace;

    if v_count = 0 then
      raise notice 'Función % no existe, se omite', fn;
      continue;
    elsif v_count > 1 then
      raise exception 'Hay % versiones de %: resuélvelo a mano antes de continuar', v_count, fn;
    end if;

    -- Ya envuelta en una corrida anterior: no volver a envolver.
    if exists (select 1 from pg_proc
                where proname = fn || '_impl' and pronamespace = 'public'::regnamespace) then
      raise notice 'Función % ya tiene guarda, se omite', fn;
      continue;
    end if;

    select p.oid,
           pg_get_function_arguments(p.oid),
           pg_get_function_identity_arguments(p.oid),
           pg_get_function_result(p.oid),
           (select string_agg(format('%I => %I', a, a), ', ' order by ord)
              from unnest(p.proargnames) with ordinality as t(a, ord))
      into v_oid, v_args, v_ident, v_ret, v_named
      from pg_proc p
     where p.proname = fn and p.pronamespace = 'public'::regnamespace;

    -- `regprocedure` reconstruye la firma exacta, así no hay que
    -- adivinar el orden ni los tipos de los argumentos.
    execute format('alter function %s rename to %I', v_oid::regprocedure, fn || '_impl');

    -- `security definer` es obligatorio: abajo se le revoca a
    -- `authenticated` el permiso sobre el _impl, así que un envoltorio
    -- que corriera como el usuario que llama no podría invocarlo y
    -- dejaría a TODOS sin RPC, no solo a los de consulta.
    -- `auth.uid()` sale del JWT, no del rol efectivo, así que la guarda
    -- sigue identificando al usuario real.
    execute format($f$
      create function public.%I(%s) returns %s
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.%I(%s);
      end;
      $body$;
    $f$, fn, v_args, v_ret, fn || '_impl', v_named);

    -- Se le quita el acceso directo al _impl: si quedara expuesto en
    -- PostgREST, saltarse la guarda sería tan simple como llamarlo.
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated',
                   fn || '_impl', v_ident);
    execute format('grant execute on function public.%I(%s) to authenticated', fn, v_ident);

    raise notice 'Guarda añadida a %', fn;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICACIÓN — revisar después de correr
-- ============================================================
-- Todas las tablas deben mostrar 4 políticas (1 select + 3 escritura):
--
--   select tablename, count(*) from pg_policies
--    where schemaname = 'public' group by tablename order by tablename;
--
-- Y cada RPC debe tener su pareja _impl:
--
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace and proname like '%cuenta%'
--    order by proname;
