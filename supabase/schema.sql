-- ============================================================
-- CAFÉ DE MI TIERRA — Schema Supabase
-- ============================================================

-- Extensión para UUIDs
create extension if not exists "uuid-ossp";

-- ============================================================
-- PERFILES DE USUARIO
-- ============================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'seller')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each user can fully manage their own profile row; admin UI controls are enforced at app layer.
-- Avoids recursive subquery (existence check on same table with RLS active causes infinite recursion).
create policy "Users can access own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Trigger para crear perfil automáticamente al registrar usuario
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- PRESENTACIONES (lookup table, administrable desde la UI)
-- ============================================================
create table public.presentations (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null unique,
  activa boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.presentations enable row level security;
create policy "Authenticated users can manage presentations"
  on public.presentations for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

insert into public.presentations (nombre, orden) values
  ('45g', 1), ('250g', 2), ('500g', 3);

-- ============================================================
-- TIPOS DE PRODUCTO (lookup table, administrable desde la UI)
-- ============================================================
create table public.tipos_producto (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null unique,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tipos_producto enable row level security;
create policy "Authenticated users can manage tipos_producto"
  on public.tipos_producto for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

insert into public.tipos_producto (nombre, orden) values
  ('grano', 1), ('molido', 2);

-- ============================================================
-- PRODUCTOS
-- ============================================================
create table public.products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  presentation_id uuid not null references public.presentations(id) on delete restrict,
  tipo_id uuid not null references public.tipos_producto(id) on delete restrict,
  cost_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  stock integer not null default 0,
  min_stock integer not null default 5,
  active boolean not null default true,
  sku text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Authenticated users can manage products"
  on public.products for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- CLIENTES
-- ============================================================
create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text,
  phone text,
  document_type text check (document_type in ('CC', 'NIT', 'CE', 'PPN', 'otro')),
  document_number text,
  address text,
  city text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "Authenticated users can manage customers"
  on public.customers for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- PEDIDOS / VENTAS
-- ============================================================
create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  order_number serial,
  customer_id uuid references public.customers(id),
  seller_id uuid references public.profiles(id),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'completado', 'cancelado')),
  payment_method text not null
    check (payment_method in ('efectivo', 'transferencia', 'tarjeta', 'nequi', 'daviplata', 'otro')),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  pdf_url text,
  email_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Authenticated users can manage orders"
  on public.orders for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- ITEMS DE PEDIDO
-- ============================================================
create table public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  product_presentation text not null,
  product_type text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  cost_price numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null,
  created_at timestamptz not null default now()
);

alter table public.order_items enable row level security;

create policy "Authenticated users can manage order items"
  on public.order_items for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- MOVIMIENTOS DE INVENTARIO
-- ============================================================
create table public.inventory_movements (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id),
  type text not null check (type in ('entrada', 'salida', 'ajuste')),
  quantity integer not null,
  previous_stock integer not null,
  new_stock integer not null,
  reason text,
  reference_id uuid,
  reference_type text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.inventory_movements enable row level security;

create policy "Authenticated users can manage inventory"
  on public.inventory_movements for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- FUNCIÓN: actualizar stock al completar pedido
-- ============================================================
create or replace function public.update_stock_on_order()
returns trigger language plpgsql security definer as $$
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

create trigger on_order_status_change
  after update of status on public.orders
  for each row execute procedure public.update_stock_on_order();

-- ============================================================
-- FUNCIÓN: updated_at automático
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_products_updated_at before update on public.products
  for each row execute procedure public.set_updated_at();
create trigger set_customers_updated_at before update on public.customers
  for each row execute procedure public.set_updated_at();
create trigger set_orders_updated_at before update on public.orders
  for each row execute procedure public.set_updated_at();
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- VISTAS ÚTILES
-- ============================================================

-- Vista: resumen de ventas por día
create or replace view public.daily_sales as
  select
    date_trunc('day', created_at) as day,
    count(*) as total_orders,
    sum(total) as total_revenue,
    sum(total - discount - (
      select coalesce(sum(oi.cost_price * oi.quantity), 0)
      from public.order_items oi
      where oi.order_id = o.id
    )) as gross_profit
  from public.orders o
  where status = 'completado'
  group by date_trunc('day', created_at);

-- Vista: productos con stock bajo (incluye nombres de presentación y tipo como strings)
create or replace view public.low_stock_products as
  select
    p.id, p.name, p.presentation_id, p.tipo_id, p.stock, p.min_stock,
    p.active, p.sku, p.cost_price, p.sale_price, p.description,
    p.created_at, p.updated_at,
    pr.nombre as presentation,
    tp.nombre as type
  from public.products p
  join public.presentations pr on pr.id = p.presentation_id
  join public.tipos_producto tp on tp.id = p.tipo_id
  where p.stock <= p.min_stock and p.active = true;

-- ============================================================
-- CONFIGURACIÓN DEL NEGOCIO (fila única)
-- ============================================================
create table public.configuracion (
  id uuid primary key default uuid_generate_v4(),
  nombre_negocio text not null default 'Café de mi Tierra',
  nit text,
  direccion text,
  telefono text,
  email text,
  mensaje_factura text,
  updated_at timestamptz not null default now()
);

alter table public.configuracion enable row level security;
create policy "Authenticated users can read configuracion"
  on public.configuracion for select using (auth.role() = 'authenticated');
create policy "Authenticated users can update configuracion"
  on public.configuracion for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users can insert configuracion"
  on public.configuracion for insert with check (auth.role() = 'authenticated');

insert into public.configuracion (nombre_negocio, mensaje_factura)
  values ('Café de mi Tierra', 'Gracias por su compra. ¡Vuelva pronto!');

-- ============================================================
-- DATOS INICIALES: Productos
-- ============================================================
insert into public.products (name, description, presentation_id, tipo_id, cost_price, sale_price, stock, min_stock, sku)
select name, description, pr.id, tp.id, cost_price, sale_price, stock, min_stock, sku
from (values
  ('Café de mi Tierra Grano 45g',   'Café colombiano selecto en grano', '45g',  'grano',  3500,  7000,  50, 10, 'CMT-G-45'),
  ('Café de mi Tierra Grano 250g',  'Café colombiano selecto en grano', '250g', 'grano',  16000, 28000, 30, 5,  'CMT-G-250'),
  ('Café de mi Tierra Grano 500g',  'Café colombiano selecto en grano', '500g', 'grano',  28000, 50000, 20, 5,  'CMT-G-500'),
  ('Café de mi Tierra Molido 45g',  'Café colombiano selecto molido',   '45g',  'molido', 3800,  7500,  50, 10, 'CMT-M-45'),
  ('Café de mi Tierra Molido 250g', 'Café colombiano selecto molido',   '250g', 'molido', 17000, 30000, 30, 5,  'CMT-M-250'),
  ('Café de mi Tierra Molido 500g', 'Café colombiano selecto molido',   '500g', 'molido', 30000, 54000, 20, 5,  'CMT-M-500')
) as v(name, description, pres_nombre, tipo_nombre, cost_price, sale_price, stock, min_stock, sku)
join public.presentations pr on pr.nombre = v.pres_nombre
join public.tipos_producto tp on tp.nombre = v.tipo_nombre;
