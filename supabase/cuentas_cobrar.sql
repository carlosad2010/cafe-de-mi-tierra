-- ============================================================
-- MÓDULO CUENTAS X COBRAR (CONSIGNACIÓN)
-- ============================================================
-- La consignación deja de ser un método de pago y pasa a ser un
-- estado de la mercancía: se entrega producto, se descuenta stock,
-- el cliente puede devolver lo que no vendió, y solo cuando paga
-- se genera la factura real (una fila en `orders` ya completada).
--
-- PRE-FLIGHT — correr esto ANTES y confirmar el resultado:
--
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--   where tgrelid = 'public.orders'::regclass and not tgisinternal;
--
-- `facturar_cuenta_cobrar` inserta la orden directamente en estado
-- 'completado'. Eso NO dispara `on_order_status_change` porque es un
-- trigger `after update of status`, y por eso el stock no se descuenta
-- dos veces (ya salió al entregar). Si el trigger llegara a ser también
-- `after insert`, hay que añadirle una guarda antes de usar este módulo.
-- ============================================================

-- ============================================================
-- TABLAS
-- ============================================================

create table if not exists public.cuentas_cobrar (
  id uuid primary key default uuid_generate_v4(),
  numero serial,
  customer_id uuid not null references public.customers(id),
  seller_id   uuid references public.profiles(id),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'pagada', 'anulada')),
  fecha_entrega timestamptz not null default now(),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total    numeric(12,2) not null default 0,
  notas text,
  -- Factura generada al momento de pagar. Null mientras esté pendiente.
  order_id   uuid references public.orders(id) on delete set null,
  fecha_pago timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cuentas_cobrar_items (
  id uuid primary key default uuid_generate_v4(),
  cuenta_id  uuid not null references public.cuentas_cobrar(id) on delete cascade,
  product_id uuid not null references public.products(id),
  -- Snapshot del producto al momento de entregar, igual que en order_items:
  -- si el producto cambia de nombre o precio después, la cuenta no se altera.
  product_name         text not null,
  product_presentation text not null default '',
  product_type         text not null default '',
  cantidad_entregada integer not null check (cantidad_entregada > 0),
  cantidad_devuelta  integer not null default 0 check (cantidad_devuelta >= 0),
  unit_price numeric(12,2) not null,
  cost_price numeric(12,2) not null default 0,
  subtotal   numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint devuelta_no_excede_entregada
    check (cantidad_devuelta <= cantidad_entregada)
);

create index if not exists idx_cuentas_cobrar_estado   on public.cuentas_cobrar(estado);
create index if not exists idx_cuentas_cobrar_customer on public.cuentas_cobrar(customer_id);
create index if not exists idx_cc_items_cuenta         on public.cuentas_cobrar_items(cuenta_id);

-- ============================================================
-- RLS — sin subqueries a la misma tabla (evita recursión infinita)
-- ============================================================

alter table public.cuentas_cobrar       enable row level security;
alter table public.cuentas_cobrar_items enable row level security;

drop policy if exists "Authenticated users can manage cuentas_cobrar" on public.cuentas_cobrar;
create policy "Authenticated users can manage cuentas_cobrar"
  on public.cuentas_cobrar for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage cuentas_cobrar_items" on public.cuentas_cobrar_items;
create policy "Authenticated users can manage cuentas_cobrar_items"
  on public.cuentas_cobrar_items for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop trigger if exists set_cuentas_cobrar_updated_at on public.cuentas_cobrar;
create trigger set_cuentas_cobrar_updated_at
  before update on public.cuentas_cobrar
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- HELPER: recalcular totales de una cuenta
-- ============================================================
-- El subtotal de cada ítem es lo que queda vigente tras devoluciones:
-- (entregada - devuelta) * precio. Devolver baja el monto sin borrar
-- el rastro de lo que originalmente se entregó.

create or replace function public.recalcular_cuenta_cobrar(p_cuenta_id uuid)
returns numeric language plpgsql security definer as $$
declare
  v_subtotal numeric;
  v_discount numeric;
  v_total    numeric;
begin
  update public.cuentas_cobrar_items
     set subtotal = (cantidad_entregada - cantidad_devuelta) * unit_price
   where cuenta_id = p_cuenta_id;

  select coalesce(sum(subtotal), 0) into v_subtotal
    from public.cuentas_cobrar_items where cuenta_id = p_cuenta_id;

  select discount into v_discount
    from public.cuentas_cobrar where id = p_cuenta_id;

  -- El descuento nunca puede dejar la cuenta en negativo: si las
  -- devoluciones bajaron el subtotal por debajo del descuento pactado,
  -- el descuento se recorta hasta donde alcance.
  v_discount := least(coalesce(v_discount, 0), v_subtotal);
  v_total    := v_subtotal - v_discount;

  update public.cuentas_cobrar
     set subtotal = v_subtotal, discount = v_discount, total = v_total
   where id = p_cuenta_id;

  return v_total;
end;
$$;

-- ============================================================
-- 1. CREAR CUENTA — entrega de producto en consignación
-- ============================================================
-- p_items: [{ "product_id": uuid, "quantity": int, "unit_price": numeric }, ...]

create or replace function public.crear_cuenta_cobrar(
  p_customer_id uuid,
  p_items       jsonb,
  p_discount    numeric default 0,
  p_notas       text    default null,
  p_user_id     uuid    default null
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

  insert into public.cuentas_cobrar (customer_id, seller_id, created_by, notas, discount)
  values (p_customer_id, p_user_id, p_user_id, nullif(trim(coalesce(p_notas, '')), ''),
          greatest(coalesce(p_discount, 0), 0))
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
      left join public.presentations   pr on pr.id = p.presentation_id
      left join public.tipos_producto  tp on tp.id = p.tipo_id
     where p.id = v_product_id;

    -- El stock sale al entregar, no al facturar.
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
-- 2. REGISTRAR DEVOLUCIÓN — producto que el cliente no vendió
-- ============================================================
-- p_items: [{ "item_id": uuid, "cantidad": int }, ...]

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
  -- Bloquea la cuenta para que dos devoluciones simultáneas no
  -- lean el mismo "disponible" y devuelvan de más.
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

    select product_id, cantidad_entregada - cantidad_devuelta
      into v_product_id, v_disponible
      from public.cuentas_cobrar_items
     where id = v_item_id and cuenta_id = p_cuenta_id;

    if not found then
      raise exception 'El ítem % no pertenece a esta cuenta', v_item_id;
    end if;

    if v_cantidad > v_disponible then
      raise exception 'No puedes devolver % unidades: solo quedan % pendientes', v_cantidad, v_disponible;
    end if;

    update public.cuentas_cobrar_items
       set cantidad_devuelta = cantidad_devuelta + v_cantidad
     where id = v_item_id;

    -- La mercancía regresa al inventario.
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
-- 3. FACTURAR — el cliente paga y la cuenta se vuelve factura
-- ============================================================

create or replace function public.facturar_cuenta_cobrar(
  p_cuenta_id     uuid,
  p_metodo_pago   text,
  p_caja_id       uuid,
  p_user_id       uuid default null
) returns jsonb language plpgsql security definer as $$
declare
  v_customer_id uuid;
  v_subtotal    numeric;
  v_discount    numeric;
  v_total       numeric;
  v_numero      integer;
  v_notas       text;
  v_order_id    uuid;
  v_order_num   integer;
  v_items_count integer;
begin
  if p_caja_id is null then
    return jsonb_build_object('error', 'Selecciona la caja donde entra el dinero');
  end if;
  if p_metodo_pago is null or trim(p_metodo_pago) = '' then
    return jsonb_build_object('error', 'Selecciona el método de pago');
  end if;

  -- Reclama la cuenta de forma atómica ANTES de crear nada. De dos
  -- peticiones concurrentes solo una afecta una fila; la otra sale por
  -- `not found` sin generar una segunda factura ni un segundo ingreso.
  update public.cuentas_cobrar
     set estado = 'pagada', fecha_pago = now()
   where id = p_cuenta_id and estado = 'pendiente'
  returning customer_id, subtotal, discount, total, numero, notas
       into v_customer_id, v_subtotal, v_discount, v_total, v_numero, v_notas;

  if not found then
    return jsonb_build_object('error', 'Esta cuenta ya fue facturada o anulada');
  end if;

  select count(*) into v_items_count
    from public.cuentas_cobrar_items
   where cuenta_id = p_cuenta_id and (cantidad_entregada - cantidad_devuelta) > 0;

  if v_items_count = 0 then
    raise exception 'La cuenta no tiene producto vigente: se devolvió todo. Anúlala en vez de facturarla.';
  end if;

  -- Insert directo en 'completado': no dispara on_order_status_change,
  -- así que el stock NO se descuenta otra vez (ya salió al entregar).
  insert into public.orders
    (customer_id, seller_id, status, payment_method, subtotal, discount, total, notes)
  values
    (v_customer_id, p_user_id, 'completado', p_metodo_pago, v_subtotal, v_discount, v_total,
     nullif(trim(coalesce(v_notas || ' · ', '') || 'Consignación #' || v_numero), ''))
  returning id, order_number into v_order_id, v_order_num;

  insert into public.order_items
    (order_id, product_id, product_name, product_presentation, product_type,
     quantity, unit_price, cost_price, subtotal)
  select v_order_id, product_id, product_name, product_presentation, product_type,
         cantidad_entregada - cantidad_devuelta, unit_price, cost_price, subtotal
    from public.cuentas_cobrar_items
   where cuenta_id = p_cuenta_id and (cantidad_entregada - cantidad_devuelta) > 0;

  insert into public.movimientos_caja
    (caja_id, tipo, concepto, monto, referencia, orden_id, created_by)
  values
    (p_caja_id, 'ingreso', 'Venta #' || v_order_num, v_total,
     'Consignación #' || v_numero, v_order_id, p_user_id);

  update public.cuentas_cobrar set order_id = v_order_id where id = p_cuenta_id;

  return jsonb_build_object(
    'ok', true, 'order_id', v_order_id, 'order_number', v_order_num, 'total', v_total
  );
end;
$$;

-- ============================================================
-- 4. ANULAR — se cae el negocio y vuelve toda la mercancía
-- ============================================================

create or replace function public.anular_cuenta_cobrar(
  p_cuenta_id uuid,
  p_user_id   uuid default null
) returns jsonb language plpgsql security definer as $$
declare
  v_numero     integer;
  v_item       record;
  v_prev_stock integer;
begin
  update public.cuentas_cobrar
     set estado = 'anulada'
   where id = p_cuenta_id and estado = 'pendiente'
  returning numero into v_numero;

  if not found then
    return jsonb_build_object('error', 'Solo se pueden anular cuentas pendientes');
  end if;

  -- Regresa al inventario todo lo que siguiera vigente.
  for v_item in
    select id, product_id, cantidad_entregada - cantidad_devuelta as pendiente
      from public.cuentas_cobrar_items
     where cuenta_id = p_cuenta_id and (cantidad_entregada - cantidad_devuelta) > 0
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
       set cantidad_devuelta = cantidad_entregada
     where id = v_item.id;
  end loop;

  perform public.recalcular_cuenta_cobrar(p_cuenta_id);

  return jsonb_build_object('ok', true);
end;
$$;

notify pgrst, 'reload schema';
