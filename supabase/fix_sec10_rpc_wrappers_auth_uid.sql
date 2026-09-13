-- ============================================================
-- SEC-10: la traza de auditoría de las RPC era falsificable
-- ============================================================
-- Los envoltorios RPC recibían `p_user_id` del cliente y lo pasaban tal
-- cual a *_impl como autor del movimiento. La guarda `puede_escribir()`
-- valida a quien llama de verdad, pero nadie comprobaba que el autor
-- declarado fuera esa misma persona: un vendedor podía registrar un
-- traslado de fondos, una factura o una devolución a nombre de otro
-- compañero.
--
-- Fix mínimo: cada envoltorio ignora el p_user_id que envía el cliente y
-- usa auth.uid() al llamar a su _impl. El parámetro se mantiene en la
-- firma (compatible con las llamadas existentes desde la app, que siguen
-- enviándolo) pero su valor ya no se usa. Los *_impl no cambian.
--
-- Aplicado el 13 sep 2026 vía Supabase MCP (apply_migration), verificado
-- función por función después. Ver el informe de seguridad para el
-- detalle completo (hallazgo SEC-10).
-- ============================================================

create or replace function public.trasladar_fondos(p_origen_id uuid, p_destino_id uuid, p_monto numeric, p_concepto text default null::text, p_user_id uuid default null::uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.trasladar_fondos_impl(p_origen_id => p_origen_id, p_destino_id => p_destino_id, p_monto => p_monto, p_concepto => p_concepto, p_user_id => auth.uid());
      end;
      $function$;

create or replace function public.reversar_factura(p_order_id uuid, p_user_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.reversar_factura_impl(p_order_id => p_order_id, p_user_id => auth.uid());
      end;
      $function$;

create or replace function public.anular_cuenta_cobrar(p_cuenta_id uuid, p_user_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.anular_cuenta_cobrar_impl(p_cuenta_id => p_cuenta_id, p_user_id => auth.uid());
      end;
      $function$;

create or replace function public.crear_cuenta_cobrar(p_customer_id uuid, p_items jsonb, p_notas text default null::text, p_user_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.crear_cuenta_cobrar_impl(p_customer_id => p_customer_id, p_items => p_items, p_notas => p_notas, p_user_id => auth.uid());
      end;
      $function$;

create or replace function public.facturar_cuenta_cobrar(p_cuenta_id uuid, p_items jsonb, p_metodo_pago text, p_caja_id uuid, p_idempotency_key uuid, p_discount numeric default 0, p_user_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.facturar_cuenta_cobrar_impl(p_cuenta_id => p_cuenta_id, p_items => p_items, p_metodo_pago => p_metodo_pago, p_caja_id => p_caja_id, p_idempotency_key => p_idempotency_key, p_discount => p_discount, p_user_id => auth.uid());
      end;
      $function$;

create or replace function public.registrar_devolucion(p_cuenta_id uuid, p_items jsonb, p_user_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
      begin
        if not public.puede_escribir() then
          raise exception 'Tu usuario es de solo consulta: no puede registrar ni modificar información';
        end if;
        return public.registrar_devolucion_impl(p_cuenta_id => p_cuenta_id, p_items => p_items, p_user_id => auth.uid());
      end;
      $function$;
