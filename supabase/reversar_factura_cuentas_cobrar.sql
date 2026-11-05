-- ============================================================================
-- Reversar una factura también deshace su efecto en cuentas por cobrar
--
-- PROBLEMA (confirmado en la cuenta 7, pedido #61, 05/nov/2026):
--   Una factura generada desde una cuenta por cobrar (facturar_cuenta_cobrar)
--   suma cantidad_facturada en cuentas_cobrar_items y crea una fila en
--   cuentas_cobrar_facturas. reversar_factura_impl solo revertía el pedido,
--   el stock y la caja: la cuenta seguía contando esas unidades como cobradas.
--   Cancelar el pedido después tampoco tocaba la cuenta.
--
-- ARREGLO:
--   Al reversar, por cada factura de cuenta ligada al pedido:
--     1. Resta de cantidad_facturada las unidades de cada ítem del pedido
--        (match por product_id; si el producto aparece dos veces en la
--        cuenta, aborta en vez de adivinar).
--     2. Borra la fila de cuentas_cobrar_facturas.
--     3. Recalcula totales con recalcular_cuenta_cobrar_impl.
--     4. Si la cuenta estaba liquidada y ahora tiene saldo, la reabre.
--
-- Ojo: recalcular_cuenta_cobrar_impl no reabre cuentas ya liquidadas; por
-- eso el paso 4 vive aquí y no dentro de esa función.
--
-- Cuerpo original: pg_get_functiondef de producción, sin cambios salvo el
-- bloque "2b" agregado. Se aplica con apply_migration, no con el SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reversar_factura_impl(p_order_id uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $function$
declare
  v_order     record;
  v_item      record;
  v_mov       record;
  v_prev      integer;
  v_new       integer;
  v_cf        record;
  v_oi        record;
  v_matches   integer;
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

  -- 2b. Deshacer la facturación en cuentas por cobrar, si el pedido vino de una.
  for v_cf in select * from public.cuentas_cobrar_facturas where order_id = p_order_id loop

    for v_oi in select product_id, quantity from public.order_items where order_id = p_order_id loop
      select count(*) into v_matches
        from public.cuentas_cobrar_items
       where cuenta_id = v_cf.cuenta_id and product_id = v_oi.product_id;

      if v_matches <> 1 then
        raise exception 'No se puede reversar: el producto % aparece % veces en la cuenta por cobrar',
          v_oi.product_id, v_matches;
      end if;

      -- Si la resta dejara cantidad_facturada < 0, el check de la tabla aborta
      -- toda la reversión. Mejor eso que un saldo inventado.
      update public.cuentas_cobrar_items
         set cantidad_facturada = cantidad_facturada - v_oi.quantity
       where cuenta_id = v_cf.cuenta_id and product_id = v_oi.product_id;
    end loop;

    delete from public.cuentas_cobrar_facturas where id = v_cf.id;

    perform public.recalcular_cuenta_cobrar_impl(v_cf.cuenta_id);

    -- Reabrir si ya estaba liquidada y ahora vuelve a tener saldo por cobrar.
    update public.cuentas_cobrar
       set estado = 'pendiente', fecha_pago = null
     where id = v_cf.cuenta_id and estado = 'liquidada' and total > 0;
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
$function$;
