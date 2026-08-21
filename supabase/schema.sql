-- ============================================================
-- ESQUEMA DE LA BASE DE DATOS — Café de mi Tierra
-- ============================================================
-- ARCHIVO GENERADO. No editar a mano: se regenera desde la base real.
--
-- Generado: 2026-08-21
-- Origen:   Supabase, proyecto ggtmdtmkiabqfkehxtqc, esquema `public`
--
-- Para regenerarlo (requiere SUPABASE_DB_URL en .env.local, con el
-- pooler en session mode — el host directo db.<ref>.supabase.co es
-- IPv6-only y Docker en Windows no lo alcanza):
--
--   set -a && . ./.env.local && set +a
--   docker run --rm -e PGURL="$SUPABASE_DB_URL" postgres:17 \
--     sh -c 'pg_dump "$PGURL" --schema-only --schema=public --no-owner' \
--     > supabase/schema.sql
--
-- ── Por qué existe este archivo ─────────────────────────────
-- Buena parte del esquema se aplicó ejecutando SQL directo en Supabase,
-- y la versión anterior de este archivo quedó tan desactualizada que ya
-- no servía para reconstruir la base: le faltaban cajas, movimientos de
-- caja, métodos de pago, compras y todo el módulo de cuentas x cobrar.
-- Dos funciones (reversar_factura y trasladar_fondos) solo existían en
-- producción y su código no estaba en ningún archivo del repositorio.
--
-- ── Cómo leerlo ─────────────────────────────────────────────
-- Es un volcado de pg_dump, así que el orden es el suyo: extensiones,
-- funciones, tablas, vistas, restricciones, índices, triggers, y al
-- final las políticas RLS. Los objetos con sufijo `_impl` son las
-- implementaciones originales de las RPC; las funciones sin sufijo son
-- envoltorios que validan el rol del usuario antes de delegar (ver
-- supabase/rol_consulta.sql).
--
-- ── Archivos relacionados ───────────────────────────────────
-- Las migraciones que produjeron este estado, en orden cronológico:
--   cuentas_cobrar.sql          módulo de consignación
--   migracion_consignacion.sql  paso de pedidos a cuentas x cobrar
--   cuentas_cobrar_parcial.sql  liquidación parcial
--   rol_consulta.sql            rol de solo lectura
--   rol_consulta_fix.sql        parche: envoltorios security definer
-- ============================================================

--
-- PostgreSQL database dump
--

\restrict GDf4rXhe1oHteNni5qFgOBFKdIxzWrJfipLYmI3S1q8IKgPXeACvKxI1oCuzlyk

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: anular_cuenta_cobrar(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anular_cuenta_cobrar(p_cuenta_id uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.anular_cuenta_cobrar_impl(p_cuenta_id => p_cuenta_id, p_user_id => p_user_id);
      end;
      $$;


--
-- Name: anular_cuenta_cobrar_impl(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anular_cuenta_cobrar_impl(p_cuenta_id uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_numero     integer;
  v_facturado  integer;
  v_item       record;
  v_prev_stock integer;
begin
  select count(*) into v_facturado
    from public.cuentas_cobrar_items
   where cuenta_id = p_cuenta_id and cantidad_facturada > 0;

  if v_facturado > 0 then
    return jsonb_build_object(
      'error', 'Esta cuenta ya tiene unidades cobradas. Registra una devolución del resto en vez de anularla.');
  end if;

  update public.cuentas_cobrar
     set estado = 'anulada'
   where id = p_cuenta_id and estado = 'pendiente'
  returning numero into v_numero;

  if not found then
    return jsonb_build_object('error', 'Solo se pueden anular cuentas pendientes');
  end if;

  for v_item in
    select id, product_id, cantidad_entregada - cantidad_devuelta - cantidad_facturada as pendiente
      from public.cuentas_cobrar_items
     where cuenta_id = p_cuenta_id
       and (cantidad_entregada - cantidad_devuelta - cantidad_facturada) > 0
  loop
    select stock into v_prev_stock from public.products where id = v_item.product_id for update;

    update public.products
       set stock = stock + v_item.pendiente, updated_at = now()
     where id = v_item.product_id;

    insert into public.inventory_movements
      (product_id, type, quantity, previous_stock, new_stock, reason,
       reference_id, reference_type, created_by)
    values
      (v_item.product_id, 'entrada', v_item.pendiente, v_prev_stock, v_prev_stock + v_item.pendiente,
       'Anulación consignación #' || v_numero, p_cuenta_id, 'cuenta_cobrar', p_user_id);

    update public.cuentas_cobrar_items
       set cantidad_devuelta = cantidad_devuelta + v_item.pendiente
     where id = v_item.id;
  end loop;

  perform public.recalcular_cuenta_cobrar(p_cuenta_id);

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: crear_cuenta_cobrar(uuid, jsonb, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_cuenta_cobrar(p_customer_id uuid, p_items jsonb, p_notas text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.crear_cuenta_cobrar_impl(p_customer_id => p_customer_id, p_items => p_items, p_notas => p_notas, p_user_id => p_user_id);
      end;
      $$;


--
-- Name: crear_cuenta_cobrar_impl(uuid, jsonb, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_cuenta_cobrar_impl(p_customer_id uuid, p_items jsonb, p_notas text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_cuenta_id  uuid;
  v_numero     integer;
  v_item       jsonb;
  v_product_id uuid;
  v_qty        integer;
  v_price      numeric;
  v_prev_stock integer;
  v_total      numeric;
begin
  if p_customer_id is null then
    return jsonb_build_object('error', 'Selecciona el cliente que recibe la mercancía');
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('error', 'Agrega al menos un producto');
  end if;

  insert into public.cuentas_cobrar (customer_id, seller_id, created_by, notas)
  values (p_customer_id, p_user_id, p_user_id, nullif(trim(coalesce(p_notas, '')), ''))
  returning id, numero into v_cuenta_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'quantity')::integer;
    v_price      := (v_item->>'unit_price')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida para el producto %', v_product_id;
    end if;

    select stock into v_prev_stock from public.products where id = v_product_id for update;
    if not found then
      raise exception 'Producto % no existe', v_product_id;
    end if;

    insert into public.cuentas_cobrar_items (
      cuenta_id, product_id, product_name, product_presentation, product_type,
      cantidad_entregada, unit_price, cost_price, subtotal
    )
    select v_cuenta_id, p.id, p.name,
           coalesce(pr.nombre, ''), coalesce(tp.nombre, ''),
           v_qty, v_price, p.cost_price, v_qty * v_price
      from public.products p
      left join public.presentations  pr on pr.id = p.presentation_id
      left join public.tipos_producto tp on tp.id = p.tipo_id
     where p.id = v_product_id;

    update public.products
       set stock = stock - v_qty, updated_at = now()
     where id = v_product_id;

    insert into public.inventory_movements
      (product_id, type, quantity, previous_stock, new_stock, reason,
       reference_id, reference_type, created_by)
    values
      (v_product_id, 'salida', v_qty, v_prev_stock, v_prev_stock - v_qty,
       'Consignación #' || v_numero, v_cuenta_id, 'cuenta_cobrar', p_user_id);
  end loop;

  v_total := public.recalcular_cuenta_cobrar(v_cuenta_id);

  return jsonb_build_object('id', v_cuenta_id, 'numero', v_numero, 'total', v_total);
end;
$$;


--
-- Name: facturar_cuenta_cobrar(uuid, jsonb, text, uuid, uuid, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.facturar_cuenta_cobrar(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric DEFAULT 0, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.facturar_cuenta_cobrar_impl(p_cuenta_id => p_cuenta_id, p_items => p_items, p_metodo_pago => p_metodo_pago, p_caja_id => p_caja_id, p_idempotency_key => p_idempotency_key, p_discount => p_discount, p_user_id => p_user_id);
      end;
      $$;


--
-- Name: facturar_cuenta_cobrar_impl(uuid, jsonb, text, uuid, uuid, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.facturar_cuenta_cobrar_impl(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric DEFAULT 0, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_estado      text;
  v_numero      integer;
  v_customer_id uuid;
  v_existente   record;
  v_item        jsonb;
  v_item_id     uuid;
  v_cantidad    integer;
  v_disponible  integer;
  v_row         record;
  v_subtotal    numeric := 0;
  v_discount    numeric;
  v_total       numeric;
  v_order_id    uuid;
  v_order_num   integer;
begin
  if p_idempotency_key is null then
    return jsonb_build_object('error', 'Falta la clave de idempotencia');
  end if;
  if p_caja_id is null then
    return jsonb_build_object('error', 'Selecciona la caja donde entra el dinero');
  end if;
  if p_metodo_pago is null or trim(p_metodo_pago) = '' then
    return jsonb_build_object('error', 'Selecciona el método de pago');
  end if;

  -- Doble clic: la misma clave ya generó una factura. Se devuelve esa en
  -- vez de cobrar otra vez las mismas unidades.
  select f.*, o.order_number into v_existente
    from public.cuentas_cobrar_facturas f
    join public.orders o on o.id = f.order_id
   where f.idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'ok', true, 'duplicado', true,
      'order_id', v_existente.order_id,
      'order_number', v_existente.order_number,
      'total', v_existente.monto
    );
  end if;

  -- Serializa los cobros concurrentes sobre la misma cuenta, para que dos
  -- no lean el mismo "disponible" y facturen de más entre ambos.
  select estado, numero, customer_id into v_estado, v_numero, v_customer_id
    from public.cuentas_cobrar where id = p_cuenta_id for update;

  if not found then
    return jsonb_build_object('error', 'La cuenta no existe');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('error', 'Esta cuenta ya está liquidada o anulada');
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('error', 'Indica qué unidades se están cobrando');
  end if;

  -- Ítems repetidos harían que la validación de disponibilidad se evalúe
  -- contra el mismo saldo dos veces y se cobre de más.
  if (select count(*) from jsonb_array_elements(p_items) e
       where (e->>'cantidad')::integer > 0)
     <> (select count(distinct e->>'item_id') from jsonb_array_elements(p_items) e
          where (e->>'cantidad')::integer > 0) then
    raise exception 'Hay ítems repetidos en la solicitud de cobro';
  end if;

  -- Primera pasada: validar todo y calcular el subtotal. No se escribe
  -- nada hasta saber que el cobro completo es válido.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id  := (v_item->>'item_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::integer;

    continue when v_cantidad is null or v_cantidad <= 0;

    select * into v_row from public.cuentas_cobrar_items
     where id = v_item_id and cuenta_id = p_cuenta_id;

    if not found then
      raise exception 'El ítem % no pertenece a esta cuenta', v_item_id;
    end if;

    v_disponible := v_row.cantidad_entregada - v_row.cantidad_devuelta - v_row.cantidad_facturada;

    if v_cantidad > v_disponible then
      raise exception 'No puedes cobrar % unidades de %: solo quedan % vigentes',
        v_cantidad, v_row.product_name, v_disponible;
    end if;

    v_subtotal := v_subtotal + v_cantidad * v_row.unit_price;
  end loop;

  if v_subtotal = 0 then
    raise exception 'No se seleccionó ninguna unidad para cobrar';
  end if;

  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_subtotal);
  v_total    := v_subtotal - v_discount;

  -- Insert directo en 'completado': no dispara on_order_status_change,
  -- así que el stock no se descuenta otra vez (salió al entregar).
  insert into public.orders
    (customer_id, seller_id, status, payment_method, subtotal, discount, total, notes)
  values
    (v_customer_id, p_user_id, 'completado', p_metodo_pago, v_subtotal, v_discount, v_total,
     'Consignación #' || v_numero)
  returning id, order_number into v_order_id, v_order_num;

  -- Segunda pasada: ya validado, se escriben los ítems de la factura y
  -- se acumula lo cobrado en la cuenta.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id  := (v_item->>'item_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::integer;

    continue when v_cantidad is null or v_cantidad <= 0;

    select * into v_row from public.cuentas_cobrar_items where id = v_item_id;

    insert into public.order_items
      (order_id, product_id, product_name, product_presentation, product_type,
       quantity, unit_price, cost_price, subtotal)
    values
      (v_order_id, v_row.product_id, v_row.product_name,
       v_row.product_presentation, v_row.product_type,
       v_cantidad, v_row.unit_price, v_row.cost_price, v_cantidad * v_row.unit_price);

    update public.cuentas_cobrar_items
       set cantidad_facturada = cantidad_facturada + v_cantidad
     where id = v_item_id;
  end loop;

  insert into public.movimientos_caja
    (caja_id, tipo, concepto, monto, referencia, orden_id, created_by)
  values
    (p_caja_id, 'ingreso', 'Venta #' || v_order_num, v_total,
     'Consignación #' || v_numero, v_order_id, p_user_id);

  insert into public.cuentas_cobrar_facturas
    (cuenta_id, order_id, monto, idempotency_key, created_by)
  values
    (p_cuenta_id, v_order_id, v_total, p_idempotency_key, p_user_id);

  perform public.recalcular_cuenta_cobrar(p_cuenta_id);

  return jsonb_build_object(
    'ok', true, 'order_id', v_order_id, 'order_number', v_order_num, 'total', v_total
  );
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'seller')
  );
  return new;
end;
$$;


--
-- Name: proteger_rol_perfil(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_rol_perfil() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: puede_escribir(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_escribir() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select p.role <> 'consulta' and p.active
       from public.profiles p
      where p.id = auth.uid()),
    false)
$$;


--
-- Name: FUNCTION puede_escribir(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.puede_escribir() IS 'true si el usuario actual puede modificar datos. Los de rol consulta y los inactivos no.';


--
-- Name: recalcular_cuenta_cobrar(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalcular_cuenta_cobrar(p_cuenta_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.recalcular_cuenta_cobrar_impl(p_cuenta_id => p_cuenta_id);
      end;
      $$;


--
-- Name: recalcular_cuenta_cobrar_impl(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalcular_cuenta_cobrar_impl(p_cuenta_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_entregado numeric;
  v_pendiente numeric;
  v_facturado numeric;
  v_estado    text;
begin
  -- Lo vigente es lo que sigue en poder del cliente sin cobrar:
  -- ni devuelto ni facturado todavía.
  update public.cuentas_cobrar_items
     set subtotal = (cantidad_entregada - cantidad_devuelta - cantidad_facturada) * unit_price
   where cuenta_id = p_cuenta_id;

  select coalesce(sum(cantidad_entregada * unit_price), 0),
         coalesce(sum((cantidad_entregada - cantidad_devuelta - cantidad_facturada) * unit_price), 0)
    into v_entregado, v_pendiente
    from public.cuentas_cobrar_items where cuenta_id = p_cuenta_id;

  select coalesce(sum(monto), 0) into v_facturado
    from public.cuentas_cobrar_facturas where cuenta_id = p_cuenta_id;

  select estado into v_estado from public.cuentas_cobrar where id = p_cuenta_id;

  -- Sin nada vigente la cuenta se cierra sola, sea porque se cobró todo,
  -- porque se devolvió todo, o por una mezcla.
  if v_estado = 'pendiente' and v_pendiente = 0 then
    v_estado := 'liquidada';
  end if;

  update public.cuentas_cobrar
     set total_entregado = v_entregado,
         total_facturado = v_facturado,
         total           = v_pendiente,
         estado          = v_estado,
         fecha_pago      = case when v_estado = 'liquidada' and fecha_pago is null
                                then now() else fecha_pago end
   where id = p_cuenta_id;

  return v_pendiente;
end;
$$;


--
-- Name: registrar_devolucion(uuid, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_devolucion(p_cuenta_id uuid, p_items jsonb, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.registrar_devolucion_impl(p_cuenta_id => p_cuenta_id, p_items => p_items, p_user_id => p_user_id);
      end;
      $$;


--
-- Name: registrar_devolucion_impl(uuid, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_devolucion_impl(p_cuenta_id uuid, p_items jsonb, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_estado     text;
  v_numero     integer;
  v_item       jsonb;
  v_item_id    uuid;
  v_cantidad   integer;
  v_product_id uuid;
  v_disponible integer;
  v_prev_stock integer;
  v_total      numeric;
begin
  select estado, numero into v_estado, v_numero
    from public.cuentas_cobrar where id = p_cuenta_id for update;

  if not found then
    return jsonb_build_object('error', 'La cuenta no existe');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('error', 'Solo se puede registrar devoluciones en cuentas pendientes');
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('error', 'Indica qué producto se devuelve');
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id  := (v_item->>'item_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::integer;

    continue when v_cantidad is null or v_cantidad <= 0;

    select product_id, cantidad_entregada - cantidad_devuelta - cantidad_facturada
      into v_product_id, v_disponible
      from public.cuentas_cobrar_items
     where id = v_item_id and cuenta_id = p_cuenta_id;

    if not found then
      raise exception 'El ítem % no pertenece a esta cuenta', v_item_id;
    end if;
    if v_cantidad > v_disponible then
      raise exception 'No puedes devolver % unidades: solo quedan % sin cobrar', v_cantidad, v_disponible;
    end if;

    update public.cuentas_cobrar_items
       set cantidad_devuelta = cantidad_devuelta + v_cantidad
     where id = v_item_id;

    select stock into v_prev_stock from public.products where id = v_product_id for update;

    update public.products
       set stock = stock + v_cantidad, updated_at = now()
     where id = v_product_id;

    insert into public.inventory_movements
      (product_id, type, quantity, previous_stock, new_stock, reason,
       reference_id, reference_type, created_by)
    values
      (v_product_id, 'entrada', v_cantidad, v_prev_stock, v_prev_stock + v_cantidad,
       'Devolución consignación #' || v_numero, p_cuenta_id, 'cuenta_cobrar', p_user_id);
  end loop;

  v_total := public.recalcular_cuenta_cobrar(p_cuenta_id);

  return jsonb_build_object('ok', true, 'total', v_total);
end;
$$;


--
-- Name: reversar_factura(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reversar_factura(p_order_id uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.reversar_factura_impl(p_order_id => p_order_id, p_user_id => p_user_id);
      end;
      $$;


--
-- Name: reversar_factura_impl(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reversar_factura_impl(p_order_id uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_order     record;
  v_item      record;
  v_mov       record;
  v_prev      integer;
  v_new       integer;
begin
  -- Validar orden
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('error', 'Pedido no encontrado');
  end if;
  if v_order.status != 'completado' then
    return jsonb_build_object('error', 'Solo se pueden reversar pedidos completados');
  end if;

  -- 1. Orden → pendiente
  update public.orders
    set status = 'pendiente', updated_at = now()
    where id = p_order_id;

  -- 2. Restaurar stock por cada ítem
  for v_item in select * from public.order_items where order_id = p_order_id loop
    select stock into v_prev from public.products where id = v_item.product_id;
    v_new := coalesce(v_prev, 0) + v_item.quantity;

    update public.products
      set stock = v_new, updated_at = now()
      where id = v_item.product_id;

    insert into public.inventory_movements
      (product_id, type, quantity, previous_stock, new_stock, reason, reference_id, reference_type, created_by)
    values
      (v_item.product_id, 'entrada', v_item.quantity, coalesce(v_prev,0), v_new,
       'Reversión venta #' || v_order.order_number::text,
       p_order_id, 'order_reversal', p_user_id);
  end loop;

  -- 3. Reversar movimiento de caja (crear egreso compensatorio)
  select * into v_mov
    from public.movimientos_caja
    where orden_id = p_order_id and tipo = 'ingreso'
    order by created_at desc limit 1;

  if found then
    insert into public.movimientos_caja
      (caja_id, tipo, concepto, monto, referencia, fecha, orden_id, created_by)
    values
      (v_mov.caja_id, 'egreso',
       'Reversión venta #' || v_order.order_number::text,
       v_mov.monto, 'Reversión de factura', now(),
       p_order_id, p_user_id);
  end if;

  return jsonb_build_object('ok', true, 'order_number', v_order.order_number);
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: sp_renombrar_producto(text, text); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.sp_renombrar_producto(IN p_texto_viejo text, IN p_texto_nuevo text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_filas INT;
BEGIN
    UPDATE products
    SET name = REPLACE(name, p_texto_viejo, p_texto_nuevo)
    WHERE name LIKE '%' || p_texto_viejo || '%';

    GET DIAGNOSTICS v_filas = ROW_COUNT;
    RAISE NOTICE 'Filas actualizadas: %', v_filas;
END;
$$;


--
-- Name: trasladar_fondos(uuid, uuid, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trasladar_fondos(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.trasladar_fondos_impl(p_origen_id => p_origen_id, p_destino_id => p_destino_id, p_monto => p_monto, p_concepto => p_concepto, p_user_id => p_user_id);
      end;
      $$;


--
-- Name: trasladar_fondos_impl(uuid, uuid, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trasladar_fondos_impl(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_origen_nombre  text;
  v_destino_nombre text;
  v_concepto       text;
BEGIN
  -- Validaciones básicas
  IF p_origen_id = p_destino_id THEN
    RETURN json_build_object('error', 'La caja origen y destino deben ser diferentes');
  END IF;
  IF p_monto <= 0 THEN
    RETURN json_build_object('error', 'El monto debe ser mayor a cero');
  END IF;

  SELECT nombre INTO v_origen_nombre  FROM cajas WHERE id = p_origen_id;
  SELECT nombre INTO v_destino_nombre FROM cajas WHERE id = p_destino_id;

  IF v_origen_nombre IS NULL THEN
    RETURN json_build_object('error', 'Caja origen no encontrada');
  END IF;
  IF v_destino_nombre IS NULL THEN
    RETURN json_build_object('error', 'Caja destino no encontrada');
  END IF;

  v_concepto := COALESCE(p_concepto, 'Traslado entre cajas');

  -- Egreso de la caja origen
  INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, referencia, fecha, created_by)
  VALUES (
    p_origen_id, 'egreso',
    v_concepto || ' → ' || v_destino_nombre,
    p_monto,
    'traslado',
    NOW(),
    p_user_id
  );

  -- Ingreso a la caja destino
  INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, referencia, fecha, created_by)
  VALUES (
    p_destino_id, 'ingreso',
    v_concepto || ' ← ' || v_origen_nombre,
    p_monto,
    'traslado',
    NOW(),
    p_user_id
  );

  RETURN json_build_object('ok', true);
END;
$$;


--
-- Name: update_stock_on_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_stock_on_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  item record;
  prev_stock integer;
begin
  if new.status = 'completado' and old.status != 'completado' then
    for item in
      select * from public.order_items where order_id = new.id
    loop
      select stock into prev_stock from public.products where id = item.product_id;

      update public.products
        set stock = stock - item.quantity,
            updated_at = now()
        where id = item.product_id;

      insert into public.inventory_movements
        (product_id, type, quantity, previous_stock, new_stock, reason, reference_id, reference_type)
      values
        (item.product_id, 'salida', item.quantity, prev_stock, prev_stock - item.quantity,
         'Venta #' || new.order_number, new.id, 'order');
    end loop;
  end if;

  if new.status = 'cancelado' and old.status = 'completado' then
    for item in
      select * from public.order_items where order_id = new.id
    loop
      select stock into prev_stock from public.products where id = item.product_id;

      update public.products
        set stock = stock + item.quantity,
            updated_at = now()
        where id = item.product_id;

      insert into public.inventory_movements
        (product_id, type, quantity, previous_stock, new_stock, reason, reference_id, reference_type)
      values
        (item.product_id, 'entrada', item.quantity, prev_stock, prev_stock + item.quantity,
         'Cancelación pedido #' || new.order_number, new.id, 'order');
    end loop;
  end if;

  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cajas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cajas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    tipo text NOT NULL,
    saldo_inicial numeric(12,2) DEFAULT 0 NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    metodo_pago_id uuid,
    CONSTRAINT cajas_tipo_check CHECK ((tipo = ANY (ARRAY['efectivo'::text, 'bancaria'::text])))
);


--
-- Name: compras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    concepto text NOT NULL,
    proveedor text,
    monto numeric(12,2) NOT NULL,
    caja_id uuid NOT NULL,
    movimiento_id uuid,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    notas text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    tipo text DEFAULT 'compra'::text NOT NULL,
    CONSTRAINT compras_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT compras_tipo_check CHECK ((tipo = ANY (ARRAY['compra'::text, 'gasto'::text])))
);


--
-- Name: configuracion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    nombre_negocio text DEFAULT 'Café de mi Tierra'::text NOT NULL,
    nit text,
    direccion text,
    telefono text,
    email text,
    mensaje_factura text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cuentas_cobrar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_cobrar (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    numero integer NOT NULL,
    customer_id uuid NOT NULL,
    seller_id uuid,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    fecha_entrega timestamp with time zone DEFAULT now() NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    notas text,
    fecha_pago timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    total_entregado numeric(12,2) DEFAULT 0 NOT NULL,
    total_facturado numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT cuentas_cobrar_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'liquidada'::text, 'anulada'::text])))
);


--
-- Name: COLUMN cuentas_cobrar.total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cuentas_cobrar.total IS 'Valor aún pendiente de facturar (vigente). Ver total_facturado y total_entregado.';


--
-- Name: cuentas_cobrar_facturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_cobrar_facturas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    cuenta_id uuid NOT NULL,
    order_id uuid NOT NULL,
    monto numeric(12,2) NOT NULL,
    idempotency_key uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cuentas_cobrar_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_cobrar_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    cuenta_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    product_presentation text DEFAULT ''::text NOT NULL,
    product_type text DEFAULT ''::text NOT NULL,
    cantidad_entregada integer NOT NULL,
    cantidad_devuelta integer DEFAULT 0 NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    cost_price numeric(12,2) DEFAULT 0 NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cantidad_facturada integer DEFAULT 0 NOT NULL,
    CONSTRAINT cuentas_cobrar_items_cantidad_devuelta_check CHECK ((cantidad_devuelta >= 0)),
    CONSTRAINT cuentas_cobrar_items_cantidad_entregada_check CHECK ((cantidad_entregada > 0)),
    CONSTRAINT cuentas_cobrar_items_cantidad_facturada_check CHECK ((cantidad_facturada >= 0)),
    CONSTRAINT movimiento_no_excede_entregada CHECK (((cantidad_devuelta + cantidad_facturada) <= cantidad_entregada))
);


--
-- Name: cuentas_cobrar_numero_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuentas_cobrar_numero_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuentas_cobrar_numero_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuentas_cobrar_numero_seq OWNED BY public.cuentas_cobrar.numero;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    document_type text,
    document_number text,
    address text,
    city text,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contacto text,
    telefono_contacto text,
    CONSTRAINT customers_document_type_check CHECK ((document_type = ANY (ARRAY['CC'::text, 'NIT'::text, 'CE'::text, 'PPN'::text, 'otro'::text])))
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    product_presentation text NOT NULL,
    product_type text NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    cost_price numeric(12,2) DEFAULT 0 NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    order_number integer NOT NULL,
    customer_id uuid,
    seller_id uuid,
    status text DEFAULT 'pendiente'::text NOT NULL,
    payment_method text NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    pdf_url text,
    email_sent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pendiente'::text, 'completado'::text, 'cancelado'::text])))
);


--
-- Name: daily_sales; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.daily_sales AS
 SELECT date_trunc('day'::text, created_at) AS day,
    count(*) AS total_orders,
    sum(total) AS total_revenue,
    sum(((total - discount) - ( SELECT COALESCE(sum((oi.cost_price * (oi.quantity)::numeric)), (0)::numeric) AS "coalesce"
           FROM public.order_items oi
          WHERE (oi.order_id = o.id)))) AS gross_profit
   FROM public.orders o
  WHERE (status = 'completado'::text)
  GROUP BY (date_trunc('day'::text, created_at));


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    type text NOT NULL,
    quantity integer NOT NULL,
    previous_stock integer NOT NULL,
    new_stock integer NOT NULL,
    reason text,
    reference_id uuid,
    reference_type text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_movements_type_check CHECK ((type = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste'::text])))
);


--
-- Name: presentations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presentations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    nombre text NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    cost_price numeric(12,2) DEFAULT 0 NOT NULL,
    precio1 numeric(12,2) DEFAULT 0 NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 5 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sku text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    presentation_id uuid NOT NULL,
    tipo_id uuid NOT NULL,
    precio2 numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: tipos_producto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_producto (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: low_stock_products; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.low_stock_products AS
 SELECT p.id,
    p.name,
    p.presentation_id,
    p.tipo_id,
    p.stock,
    p.min_stock,
    p.active,
    p.sku,
    p.cost_price,
    p.precio1,
    p.precio2,
    p.description,
    p.created_at,
    p.updated_at,
    pr.nombre AS presentation,
    tp.nombre AS type
   FROM ((public.products p
     JOIN public.presentations pr ON ((pr.id = p.presentation_id)))
     JOIN public.tipos_producto tp ON ((tp.id = p.tipo_id)))
  WHERE ((p.stock <= p.min_stock) AND (p.active = true));


--
-- Name: metodos_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metodos_pago (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    tipo text DEFAULT 'efectivo'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: movimientos_caja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_caja (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caja_id uuid NOT NULL,
    tipo text NOT NULL,
    concepto text NOT NULL,
    monto numeric(12,2) NOT NULL,
    referencia text,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    orden_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT movimientos_caja_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT movimientos_caja_tipo_check CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'egreso'::text])))
);


--
-- Name: orders_order_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_order_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_order_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_order_number_seq OWNED BY public.orders.order_number;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'seller'::text, 'consulta'::text])))
);


--
-- Name: cuentas_cobrar numero; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar ALTER COLUMN numero SET DEFAULT nextval('public.cuentas_cobrar_numero_seq'::regclass);


--
-- Name: orders order_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN order_number SET DEFAULT nextval('public.orders_order_number_seq'::regclass);


--
-- Name: cajas cajas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cajas
    ADD CONSTRAINT cajas_pkey PRIMARY KEY (id);


--
-- Name: compras compras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_pkey PRIMARY KEY (id);


--
-- Name: configuracion configuracion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_pkey PRIMARY KEY (id);


--
-- Name: cuentas_cobrar_facturas cuentas_cobrar_facturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar_facturas
    ADD CONSTRAINT cuentas_cobrar_facturas_pkey PRIMARY KEY (id);


--
-- Name: cuentas_cobrar_items cuentas_cobrar_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar_items
    ADD CONSTRAINT cuentas_cobrar_items_pkey PRIMARY KEY (id);


--
-- Name: cuentas_cobrar cuentas_cobrar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar
    ADD CONSTRAINT cuentas_cobrar_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: metodos_pago metodos_pago_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metodos_pago
    ADD CONSTRAINT metodos_pago_nombre_key UNIQUE (nombre);


--
-- Name: metodos_pago metodos_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metodos_pago
    ADD CONSTRAINT metodos_pago_pkey PRIMARY KEY (id);


--
-- Name: movimientos_caja movimientos_caja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_caja
    ADD CONSTRAINT movimientos_caja_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: presentations presentations_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentations
    ADD CONSTRAINT presentations_nombre_key UNIQUE (nombre);


--
-- Name: presentations presentations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentations
    ADD CONSTRAINT presentations_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: tipos_producto tipos_producto_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_producto
    ADD CONSTRAINT tipos_producto_nombre_key UNIQUE (nombre);


--
-- Name: tipos_producto tipos_producto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_producto
    ADD CONSTRAINT tipos_producto_pkey PRIMARY KEY (id);


--
-- Name: idx_cc_facturas_cuenta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cc_facturas_cuenta ON public.cuentas_cobrar_facturas USING btree (cuenta_id);


--
-- Name: idx_cc_facturas_idem; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cc_facturas_idem ON public.cuentas_cobrar_facturas USING btree (idempotency_key);


--
-- Name: idx_cc_items_cuenta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cc_items_cuenta ON public.cuentas_cobrar_items USING btree (cuenta_id);


--
-- Name: idx_cuentas_cobrar_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cuentas_cobrar_customer ON public.cuentas_cobrar USING btree (customer_id);


--
-- Name: idx_cuentas_cobrar_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cuentas_cobrar_estado ON public.cuentas_cobrar USING btree (estado);


--
-- Name: orders on_order_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_order_status_change AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_stock_on_order();


--
-- Name: profiles proteger_rol_perfil; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_rol_perfil BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.proteger_rol_perfil();


--
-- Name: cuentas_cobrar set_cuentas_cobrar_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_cuentas_cobrar_updated_at BEFORE UPDATE ON public.cuentas_cobrar FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customers set_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: orders set_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products set_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles set_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: cajas cajas_metodo_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cajas
    ADD CONSTRAINT cajas_metodo_pago_id_fkey FOREIGN KEY (metodo_pago_id) REFERENCES public.metodos_pago(id);


--
-- Name: compras compras_caja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES public.cajas(id);


--
-- Name: compras compras_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: compras compras_movimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_movimiento_id_fkey FOREIGN KEY (movimiento_id) REFERENCES public.movimientos_caja(id) ON DELETE SET NULL;


--
-- Name: cuentas_cobrar cuentas_cobrar_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar
    ADD CONSTRAINT cuentas_cobrar_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: cuentas_cobrar cuentas_cobrar_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar
    ADD CONSTRAINT cuentas_cobrar_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: cuentas_cobrar_facturas cuentas_cobrar_facturas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar_facturas
    ADD CONSTRAINT cuentas_cobrar_facturas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: cuentas_cobrar_facturas cuentas_cobrar_facturas_cuenta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar_facturas
    ADD CONSTRAINT cuentas_cobrar_facturas_cuenta_id_fkey FOREIGN KEY (cuenta_id) REFERENCES public.cuentas_cobrar(id) ON DELETE CASCADE;


--
-- Name: cuentas_cobrar_facturas cuentas_cobrar_facturas_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar_facturas
    ADD CONSTRAINT cuentas_cobrar_facturas_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: cuentas_cobrar_items cuentas_cobrar_items_cuenta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar_items
    ADD CONSTRAINT cuentas_cobrar_items_cuenta_id_fkey FOREIGN KEY (cuenta_id) REFERENCES public.cuentas_cobrar(id) ON DELETE CASCADE;


--
-- Name: cuentas_cobrar_items cuentas_cobrar_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar_items
    ADD CONSTRAINT cuentas_cobrar_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cuentas_cobrar cuentas_cobrar_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cobrar
    ADD CONSTRAINT cuentas_cobrar_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id);


--
-- Name: inventory_movements inventory_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: inventory_movements inventory_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: movimientos_caja movimientos_caja_caja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_caja
    ADD CONSTRAINT movimientos_caja_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES public.cajas(id) ON DELETE CASCADE;


--
-- Name: movimientos_caja movimientos_caja_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_caja
    ADD CONSTRAINT movimientos_caja_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: movimientos_caja movimientos_caja_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_caja
    ADD CONSTRAINT movimientos_caja_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: orders orders_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id);


--
-- Name: products products_presentation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_presentation_id_fkey FOREIGN KEY (presentation_id) REFERENCES public.presentations(id) ON DELETE RESTRICT;


--
-- Name: products products_tipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES public.tipos_producto(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: profiles Users can update own profile data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile data" ON public.profiles FOR DELETE USING ((auth.uid() = id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: cajas actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.cajas FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: compras actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.compras FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: configuracion actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.configuracion FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: cuentas_cobrar actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.cuentas_cobrar FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: cuentas_cobrar_facturas actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.cuentas_cobrar_facturas FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: cuentas_cobrar_items actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.cuentas_cobrar_items FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: customers actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.customers FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: inventory_movements actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.inventory_movements FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: metodos_pago actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.metodos_pago FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: movimientos_caja actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.movimientos_caja FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: order_items actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.order_items FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: orders actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.orders FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: presentations actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.presentations FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: products actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.products FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: tipos_producto actualizacion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actualizacion_escritores ON public.tipos_producto FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());


--
-- Name: cajas borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.cajas FOR DELETE USING (public.puede_escribir());


--
-- Name: compras borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.compras FOR DELETE USING (public.puede_escribir());


--
-- Name: configuracion borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.configuracion FOR DELETE USING (public.puede_escribir());


--
-- Name: cuentas_cobrar borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.cuentas_cobrar FOR DELETE USING (public.puede_escribir());


--
-- Name: cuentas_cobrar_facturas borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.cuentas_cobrar_facturas FOR DELETE USING (public.puede_escribir());


--
-- Name: cuentas_cobrar_items borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.cuentas_cobrar_items FOR DELETE USING (public.puede_escribir());


--
-- Name: customers borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.customers FOR DELETE USING (public.puede_escribir());


--
-- Name: inventory_movements borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.inventory_movements FOR DELETE USING (public.puede_escribir());


--
-- Name: metodos_pago borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.metodos_pago FOR DELETE USING (public.puede_escribir());


--
-- Name: movimientos_caja borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.movimientos_caja FOR DELETE USING (public.puede_escribir());


--
-- Name: order_items borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.order_items FOR DELETE USING (public.puede_escribir());


--
-- Name: orders borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.orders FOR DELETE USING (public.puede_escribir());


--
-- Name: presentations borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.presentations FOR DELETE USING (public.puede_escribir());


--
-- Name: products borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.products FOR DELETE USING (public.puede_escribir());


--
-- Name: tipos_producto borrado_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY borrado_escritores ON public.tipos_producto FOR DELETE USING (public.puede_escribir());


--
-- Name: cajas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cajas ENABLE ROW LEVEL SECURITY;

--
-- Name: compras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;

--
-- Name: cuentas_cobrar; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cuentas_cobrar ENABLE ROW LEVEL SECURITY;

--
-- Name: cuentas_cobrar_facturas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cuentas_cobrar_facturas ENABLE ROW LEVEL SECURITY;

--
-- Name: cuentas_cobrar_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cuentas_cobrar_items ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: cajas insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.cajas FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: compras insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.compras FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: configuracion insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.configuracion FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: cuentas_cobrar insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.cuentas_cobrar FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: cuentas_cobrar_facturas insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.cuentas_cobrar_facturas FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: cuentas_cobrar_items insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.cuentas_cobrar_items FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: customers insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.customers FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: inventory_movements insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.inventory_movements FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: metodos_pago insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.metodos_pago FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: movimientos_caja insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.movimientos_caja FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: order_items insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.order_items FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: orders insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.orders FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: presentations insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.presentations FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: products insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.products FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: tipos_producto insercion_escritores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insercion_escritores ON public.tipos_producto FOR INSERT WITH CHECK (public.puede_escribir());


--
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: cajas lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.cajas FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: compras lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.compras FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: configuracion lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.configuracion FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: cuentas_cobrar lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.cuentas_cobrar FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: cuentas_cobrar_facturas lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.cuentas_cobrar_facturas FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: cuentas_cobrar_items lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.cuentas_cobrar_items FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: customers lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.customers FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_movements lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.inventory_movements FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: metodos_pago lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.metodos_pago FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: movimientos_caja lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.movimientos_caja FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: order_items lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.order_items FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: orders lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.orders FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: presentations lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.presentations FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: products lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.products FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: tipos_producto lectura_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectura_autenticados ON public.tipos_producto FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: metodos_pago; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metodos_pago ENABLE ROW LEVEL SECURITY;

--
-- Name: movimientos_caja; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.movimientos_caja ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: presentations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_producto; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_producto ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION anular_cuenta_cobrar(p_cuenta_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.anular_cuenta_cobrar(p_cuenta_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.anular_cuenta_cobrar(p_cuenta_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.anular_cuenta_cobrar(p_cuenta_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION anular_cuenta_cobrar_impl(p_cuenta_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.anular_cuenta_cobrar_impl(p_cuenta_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.anular_cuenta_cobrar_impl(p_cuenta_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION crear_cuenta_cobrar(p_customer_id uuid, p_items jsonb, p_notas text, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.crear_cuenta_cobrar(p_customer_id uuid, p_items jsonb, p_notas text, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.crear_cuenta_cobrar(p_customer_id uuid, p_items jsonb, p_notas text, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.crear_cuenta_cobrar(p_customer_id uuid, p_items jsonb, p_notas text, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION crear_cuenta_cobrar_impl(p_customer_id uuid, p_items jsonb, p_notas text, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.crear_cuenta_cobrar_impl(p_customer_id uuid, p_items jsonb, p_notas text, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.crear_cuenta_cobrar_impl(p_customer_id uuid, p_items jsonb, p_notas text, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION facturar_cuenta_cobrar(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.facturar_cuenta_cobrar(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.facturar_cuenta_cobrar(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.facturar_cuenta_cobrar(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION facturar_cuenta_cobrar_impl(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.facturar_cuenta_cobrar_impl(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.facturar_cuenta_cobrar_impl(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION proteger_rol_perfil(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.proteger_rol_perfil() TO anon;
GRANT ALL ON FUNCTION public.proteger_rol_perfil() TO authenticated;
GRANT ALL ON FUNCTION public.proteger_rol_perfil() TO service_role;


--
-- Name: FUNCTION puede_escribir(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.puede_escribir() TO anon;
GRANT ALL ON FUNCTION public.puede_escribir() TO authenticated;
GRANT ALL ON FUNCTION public.puede_escribir() TO service_role;


--
-- Name: FUNCTION recalcular_cuenta_cobrar(p_cuenta_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recalcular_cuenta_cobrar(p_cuenta_id uuid) TO anon;
GRANT ALL ON FUNCTION public.recalcular_cuenta_cobrar(p_cuenta_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recalcular_cuenta_cobrar(p_cuenta_id uuid) TO service_role;


--
-- Name: FUNCTION recalcular_cuenta_cobrar_impl(p_cuenta_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recalcular_cuenta_cobrar_impl(p_cuenta_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recalcular_cuenta_cobrar_impl(p_cuenta_id uuid) TO service_role;


--
-- Name: FUNCTION registrar_devolucion(p_cuenta_id uuid, p_items jsonb, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.registrar_devolucion(p_cuenta_id uuid, p_items jsonb, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.registrar_devolucion(p_cuenta_id uuid, p_items jsonb, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_devolucion(p_cuenta_id uuid, p_items jsonb, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION registrar_devolucion_impl(p_cuenta_id uuid, p_items jsonb, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_devolucion_impl(p_cuenta_id uuid, p_items jsonb, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_devolucion_impl(p_cuenta_id uuid, p_items jsonb, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION reversar_factura(p_order_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reversar_factura(p_order_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.reversar_factura(p_order_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reversar_factura(p_order_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION reversar_factura_impl(p_order_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reversar_factura_impl(p_order_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reversar_factura_impl(p_order_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: PROCEDURE sp_renombrar_producto(IN p_texto_viejo text, IN p_texto_nuevo text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON PROCEDURE public.sp_renombrar_producto(IN p_texto_viejo text, IN p_texto_nuevo text) TO anon;
GRANT ALL ON PROCEDURE public.sp_renombrar_producto(IN p_texto_viejo text, IN p_texto_nuevo text) TO authenticated;
GRANT ALL ON PROCEDURE public.sp_renombrar_producto(IN p_texto_viejo text, IN p_texto_nuevo text) TO service_role;


--
-- Name: FUNCTION trasladar_fondos(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trasladar_fondos(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.trasladar_fondos(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.trasladar_fondos(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION trasladar_fondos_impl(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trasladar_fondos_impl(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.trasladar_fondos_impl(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION update_stock_on_order(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_stock_on_order() TO anon;
GRANT ALL ON FUNCTION public.update_stock_on_order() TO authenticated;
GRANT ALL ON FUNCTION public.update_stock_on_order() TO service_role;


--
-- Name: TABLE cajas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cajas TO anon;
GRANT ALL ON TABLE public.cajas TO authenticated;
GRANT ALL ON TABLE public.cajas TO service_role;


--
-- Name: TABLE compras; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.compras TO anon;
GRANT ALL ON TABLE public.compras TO authenticated;
GRANT ALL ON TABLE public.compras TO service_role;


--
-- Name: TABLE configuracion; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.configuracion TO anon;
GRANT ALL ON TABLE public.configuracion TO authenticated;
GRANT ALL ON TABLE public.configuracion TO service_role;


--
-- Name: TABLE cuentas_cobrar; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cuentas_cobrar TO anon;
GRANT ALL ON TABLE public.cuentas_cobrar TO authenticated;
GRANT ALL ON TABLE public.cuentas_cobrar TO service_role;


--
-- Name: TABLE cuentas_cobrar_facturas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cuentas_cobrar_facturas TO anon;
GRANT ALL ON TABLE public.cuentas_cobrar_facturas TO authenticated;
GRANT ALL ON TABLE public.cuentas_cobrar_facturas TO service_role;


--
-- Name: TABLE cuentas_cobrar_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cuentas_cobrar_items TO anon;
GRANT ALL ON TABLE public.cuentas_cobrar_items TO authenticated;
GRANT ALL ON TABLE public.cuentas_cobrar_items TO service_role;


--
-- Name: SEQUENCE cuentas_cobrar_numero_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.cuentas_cobrar_numero_seq TO anon;
GRANT ALL ON SEQUENCE public.cuentas_cobrar_numero_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cuentas_cobrar_numero_seq TO service_role;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_items TO anon;
GRANT ALL ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE daily_sales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_sales TO anon;
GRANT ALL ON TABLE public.daily_sales TO authenticated;
GRANT ALL ON TABLE public.daily_sales TO service_role;


--
-- Name: TABLE inventory_movements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_movements TO anon;
GRANT ALL ON TABLE public.inventory_movements TO authenticated;
GRANT ALL ON TABLE public.inventory_movements TO service_role;


--
-- Name: TABLE presentations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.presentations TO anon;
GRANT ALL ON TABLE public.presentations TO authenticated;
GRANT ALL ON TABLE public.presentations TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE tipos_producto; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tipos_producto TO anon;
GRANT ALL ON TABLE public.tipos_producto TO authenticated;
GRANT ALL ON TABLE public.tipos_producto TO service_role;


--
-- Name: TABLE low_stock_products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.low_stock_products TO anon;
GRANT ALL ON TABLE public.low_stock_products TO authenticated;
GRANT ALL ON TABLE public.low_stock_products TO service_role;


--
-- Name: TABLE metodos_pago; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.metodos_pago TO anon;
GRANT ALL ON TABLE public.metodos_pago TO authenticated;
GRANT ALL ON TABLE public.metodos_pago TO service_role;


--
-- Name: TABLE movimientos_caja; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.movimientos_caja TO anon;
GRANT ALL ON TABLE public.movimientos_caja TO authenticated;
GRANT ALL ON TABLE public.movimientos_caja TO service_role;


--
-- Name: SEQUENCE orders_order_number_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.orders_order_number_seq TO anon;
GRANT ALL ON SEQUENCE public.orders_order_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.orders_order_number_seq TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict GDf4rXhe1oHteNni5qFgOBFKdIxzWrJfipLYmI3S1q8IKgPXeACvKxI1oCuzlyk

