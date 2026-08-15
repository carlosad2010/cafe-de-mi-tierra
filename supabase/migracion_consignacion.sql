-- ============================================================
-- MIGRACIÓN: pedidos de consignación → cuentas x cobrar
-- ============================================================
-- Requiere haber corrido antes `cuentas_cobrar.sql`.
--
-- Qué hace: los pedidos con método "Consignación" nunca fueron ventas
-- cobradas —son mercancía entregada que sigue en la calle—, pero hoy
-- figuran como facturas y su plata está sumada en la caja "Consignación"
-- ($373.300 al momento de escribir esto). Esto los convierte en cuentas
-- pendientes, saca ese dinero de la caja y retira la caja del uso.
--
-- HAZ UN RESPALDO ANTES. Borra filas de `orders`, lo cual deja huecos
-- en la numeración de facturas (#19, #20, #22). Es correcto —nunca
-- debieron ser facturas— pero es irreversible.
--
-- El stock NO se toca: el producto salió del inventario cuando se
-- entregó, y sigue afuera. Los `inventory_movements` de esas ventas
-- se conservan como historia.
-- ============================================================

begin;

-- ── 1. Verificar qué se va a migrar ─────────────────────────
-- Revisa este resultado antes de seguir.
select o.order_number, c.full_name as cliente, o.total, o.created_at
  from public.orders o
  left join public.customers c on c.id = o.customer_id
 where o.payment_method = 'Consignación' and o.status = 'completado'
 order by o.order_number;

-- ── 2. Crear las cuentas a partir de esos pedidos ───────────
-- `order_id` queda NULL a propósito: son cuentas PENDIENTES, todavía
-- no facturadas. Solo se llena cuando el cliente pague.
--
-- Se recorre pedido por pedido para llevar el vínculo cuenta↔pedido en
-- una variable, en vez de deducirlo después desde el texto de las notas.
do $$
declare
  v_order  record;
  v_cuenta uuid;
begin
  for v_order in
    select * from public.orders
     where payment_method = 'Consignación'
       and status = 'completado'
       and customer_id is not null
     order by order_number
  loop
    insert into public.cuentas_cobrar
      (customer_id, seller_id, estado, fecha_entrega, subtotal, discount, total,
       notas, created_by, created_at)
    values
      (v_order.customer_id, v_order.seller_id, 'pendiente', v_order.created_at,
       v_order.subtotal, v_order.discount, v_order.total,
       trim(coalesce(v_order.notes || ' · ', '') || 'Migrado del pedido #' || v_order.order_number),
       v_order.seller_id, v_order.created_at)
    returning id into v_cuenta;

    insert into public.cuentas_cobrar_items
      (cuenta_id, product_id, product_name, product_presentation, product_type,
       cantidad_entregada, cantidad_devuelta, unit_price, cost_price, subtotal)
    select v_cuenta, oi.product_id, oi.product_name, oi.product_presentation, oi.product_type,
           oi.quantity, 0, oi.unit_price, oi.cost_price, oi.subtotal
      from public.order_items oi
     where oi.order_id = v_order.id;
  end loop;
end $$;

-- ── 3. Sacar la plata de la caja Consignación ───────────────
delete from public.movimientos_caja
 where orden_id in (
   select id from public.orders
    where payment_method = 'Consignación' and status = 'completado'
 );

-- ── 4. Borrar los pedidos (order_items cae por cascade) ─────
-- No dispara el trigger de stock: `on_order_status_change` es de UPDATE.
delete from public.orders
 where payment_method = 'Consignación' and status = 'completado';

-- ── 5. Retirar la caja y el método de pago ──────────────────
-- La consignación ya no es una forma de pago. Se desactivan en vez de
-- borrarse para no romper referencias históricas.
update public.cajas        set activa = false where nombre = 'Consignación';
update public.metodos_pago set activo = false where nombre = 'Consignación';

-- ── 6. Verificación — revisar ANTES de confirmar ────────────
select 'cuentas creadas' as chequeo, count(*)::text as valor
  from public.cuentas_cobrar where estado = 'pendiente'
union all
select 'total pendiente por cobrar', to_char(coalesce(sum(total), 0), 'FM999,999,999')
  from public.cuentas_cobrar where estado = 'pendiente'
union all
select 'ítems migrados', count(*)::text from public.cuentas_cobrar_items
union all
select 'saldo caja Consignación', to_char(
    coalesce((select saldo_inicial from public.cajas where nombre = 'Consignación'), 0)
  + coalesce((select sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end)
                from public.movimientos_caja m
                join public.cajas c on c.id = m.caja_id
               where c.nombre = 'Consignación'), 0), 'FM999,999,999')
union all
select 'pedidos de consignación restantes', count(*)::text
  from public.orders where payment_method = 'Consignación';

-- Esperado: 3 cuentas, $373.300 pendientes, saldo de caja en 0,
-- y 0 pedidos de consignación restantes.
--
-- Si algo no cuadra: `rollback;` en vez de `commit;`

commit;

notify pgrst, 'reload schema';
