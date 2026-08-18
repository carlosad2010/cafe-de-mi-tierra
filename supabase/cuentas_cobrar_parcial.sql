-- ============================================================
-- FACTURACIÓN PARCIAL DE CUENTAS X COBRAR
-- ============================================================
-- Antes: una cuenta se facturaba completa y se cerraba.
-- Ahora: se liquida por partes. El cliente vende 5 de 10 unidades,
-- se factura solo eso, y las 5 restantes siguen abiertas en la cuenta
-- para facturarse después o devolverse.
--
-- Cambios de fondo:
--  1. Los ítems llevan `cantidad_facturada`. Lo vigente (pendiente de
--     cobro) es entregada - devuelta - facturada.
--  2. Una cuenta genera VARIAS facturas → tabla `cuentas_cobrar_facturas`
--     en lugar de la columna `order_id`.
--  3. El descuento deja de ser de la cuenta y pasa a cada factura: con
--     cobros parciales, un descuento global no tiene a qué aplicarse.
--  4. Clave de idempotencia por cobro. Con la cuenta quedando 'pendiente'
--     tras un cobro parcial, `where estado = 'pendiente'` ya no distingue
--     un doble clic de un segundo cobro legítimo.
--
-- Requiere `cuentas_cobrar.sql` ya aplicado.
-- ============================================================

begin;

-- ── 1. Ítems: cuánto se ha facturado de cada uno ────────────
alter table public.cuentas_cobrar_items
  add column if not exists cantidad_facturada integer not null default 0
    check (cantidad_facturada >= 0);

-- Lo devuelto más lo facturado no puede exceder lo entregado.
alter table public.cuentas_cobrar_items
  drop constraint if exists devuelta_no_excede_entregada;
alter table public.cuentas_cobrar_items
  drop constraint if exists movimiento_no_excede_entregada;
alter table public.cuentas_cobrar_items
  add constraint movimiento_no_excede_entregada
    check (cantidad_devuelta + cantidad_facturada <= cantidad_entregada);

-- ── 2. Cuenta: totales y estados nuevos ─────────────────────
alter table public.cuentas_cobrar
  add column if not exists total_entregado numeric(12,2) not null default 0,
  add column if not exists total_facturado numeric(12,2) not null default 0;

-- `total` pasa a significar "pendiente por facturar". El KPI del
-- dashboard suma esta columna, así que sigue siendo correcto sin tocarlo.
comment on column public.cuentas_cobrar.total is
  'Valor aún pendiente de facturar (vigente). Ver total_facturado y total_entregado.';

-- 'pagada' se renombra a 'liquidada': una cuenta puede quedar cerrada
-- por cobro, por devolución, o por una mezcla de ambos.
update public.cuentas_cobrar set estado = 'liquidada' where estado = 'pagada';

alter table public.cuentas_cobrar drop constraint if exists cuentas_cobrar_estado_check;
alter table public.cuentas_cobrar
  add constraint cuentas_cobrar_estado_check
    check (estado in ('pendiente', 'liquidada', 'anulada'));

-- El descuento ahora vive en cada factura, no en la cuenta.
alter table public.cuentas_cobrar drop column if exists discount;
alter table public.cuentas_cobrar drop column if exists subtotal;

-- ── 3. Facturas generadas por una cuenta (1:N) ──────────────
create table if not exists public.cuentas_cobrar_facturas (
  id uuid primary key default uuid_generate_v4(),
  cuenta_id uuid not null references public.cuentas_cobrar(id) on delete cascade,
  order_id  uuid not null references public.orders(id) on delete cascade,
  monto numeric(12,2) not null,
  -- Enviada por el cliente en cada intento de cobro. El índice único de
  -- abajo es lo que convierte un doble clic en un no-op en vez de en una
  -- segunda factura por las mismas unidades.
  idempotency_key uuid not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_cc_facturas_idem
  on public.cuentas_cobrar_facturas(idempotency_key);
create index if not exists idx_cc_facturas_cuenta
  on public.cuentas_cobrar_facturas(cuenta_id);

-- Se migra el vínculo viejo antes de eliminar la columna.
insert into public.cuentas_cobrar_facturas (cuenta_id, order_id, monto, idempotency_key)
select c.id, c.order_id, c.total, uuid_generate_v4()
  from public.cuentas_cobrar c
 where c.order_id is not null
   and not exists (
     select 1 from public.cuentas_cobrar_facturas f where f.order_id = c.order_id
   );

alter table public.cuentas_cobrar drop column if exists order_id;

alter table public.cuentas_cobrar_facturas enable row level security;
drop policy if exists "Authenticated users can manage cc_facturas" on public.cuentas_cobrar_facturas;
create policy "Authenticated users can manage cc_facturas"
  on public.cuentas_cobrar_facturas for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

commit;

-- ============================================================
-- RECALCULAR — ahora distingue entregado / facturado / vigente
-- ============================================================

create or replace function public.recalcular_cuenta_cobrar(p_cuenta_id uuid)
returns numeric language plpgsql security definer as $$
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

-- ============================================================
-- CREAR — sin descuento a nivel de cuenta
-- ============================================================

drop function if exists public.crear_cuenta_cobrar(uuid, jsonb, numeric, text, uuid);

create or replace function public.crear_cuenta_cobrar(
  p_customer_id uuid,
  p_items       jsonb,
  p_notas       text default null,
  p_user_id     uuid default null
) returns jsonb language plpgsql security definer as $$
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

-- ============================================================
-- DEVOLUCIÓN — lo vigente ahora descuenta también lo facturado
-- ============================================================

create or replace function public.registrar_devolucion(
  p_cuenta_id uuid,
  p_items     jsonb,
  p_user_id   uuid default null
) returns jsonb language plpgsql security definer as $$
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

-- ============================================================
-- FACTURAR PARCIAL — el corazón del cambio
-- ============================================================
-- p_items: [{ "item_id": uuid, "cantidad": int }, ...]
-- p_idempotency_key: uuid generado por el cliente al abrir el modal.

drop function if exists public.facturar_cuenta_cobrar(uuid, text, uuid, uuid);

create or replace function public.facturar_cuenta_cobrar(
  p_cuenta_id       uuid,
  p_items           jsonb,
  p_metodo_pago     text,
  p_caja_id         uuid,
  p_idempotency_key uuid,
  p_discount        numeric default 0,
  p_user_id         uuid default null
) returns jsonb language plpgsql security definer as $$
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

-- ============================================================
-- ANULAR — solo si no se ha cobrado nada
-- ============================================================
-- Con parte ya facturada, el resto se cierra devolviéndolo: anular
-- borraría el sentido de una cuenta que ya generó ingresos reales.

create or replace function public.anular_cuenta_cobrar(
  p_cuenta_id uuid,
  p_user_id   uuid default null
) returns jsonb language plpgsql security definer as $$
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

-- ── Recalcular las cuentas existentes con el esquema nuevo ──
do $$
declare c record;
begin
  for c in select id from public.cuentas_cobrar loop
    perform public.recalcular_cuenta_cobrar(c.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
