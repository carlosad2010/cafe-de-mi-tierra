-- ============================================================
-- PARCHE: los envoltorios de las RPC necesitan SECURITY DEFINER
-- ============================================================
-- `rol_consulta.sql` creó los envoltorios sin `security definer`, así
-- que corrían como el usuario que llamaba (`authenticated`) — el mismo
-- al que se le revoca el permiso sobre `_impl` unas líneas después.
-- Resultado: el envoltorio no podía invocar su propia implementación y
-- NINGÚN usuario podía usar las RPC, ni siquiera los administradores:
--
--   permission denied for function crear_cuenta_cobrar_impl
--
-- Esto los recrea con `security definer`. La guarda sigue siendo
-- correcta porque `auth.uid()` se lee del JWT, no del rol efectivo:
-- aunque la función corra como su dueño, sigue sabiendo quién llamó.
--
-- Solo hace falta si ya se corrió la versión anterior de
-- `rol_consulta.sql`. El archivo original quedó corregido, así que en
-- una base nueva no se necesita.
-- ============================================================

do $$
declare
  fn      text;
  v_oid   oid;
  v_args  text;
  v_ident text;
  v_ret   text;
  v_named text;
  funciones text[] := array[
    'crear_cuenta_cobrar', 'registrar_devolucion', 'facturar_cuenta_cobrar',
    'anular_cuenta_cobrar', 'recalcular_cuenta_cobrar',
    'reversar_factura', 'trasladar_fondos'
  ];
begin
  foreach fn in array funciones loop
    -- La firma se toma del _impl, que es el que conserva la original.
    select p.oid,
           pg_get_function_arguments(p.oid),
           pg_get_function_identity_arguments(p.oid),
           pg_get_function_result(p.oid),
           (select string_agg(format('%I => %I', a, a), ', ' order by ord)
              from unnest(p.proargnames) with ordinality as t(a, ord))
      into v_oid, v_args, v_ident, v_ret, v_named
      from pg_proc p
     where p.proname = fn || '_impl'
       and p.pronamespace = 'public'::regnamespace;

    if v_oid is null then
      raise notice 'No existe %_impl, se omite', fn;
      continue;
    end if;

    execute format('drop function if exists public.%I(%s)', fn, v_ident);

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

    execute format('revoke all on function public.%I(%s) from public, anon, authenticated',
                   fn || '_impl', v_ident);
    execute format('grant execute on function public.%I(%s) to authenticated', fn, v_ident);

    raise notice 'Envoltorio de % recreado con security definer', fn;
  end loop;
end $$;

notify pgrst, 'reload schema';
