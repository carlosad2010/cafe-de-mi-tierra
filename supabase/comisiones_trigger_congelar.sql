-- Congela la comisión al registrar una línea de venta.
--
-- La comisión aplicada debe quedar fija en la venta (ver
-- comisiones_por_presentacion.sql). Hacerlo desde la aplicación obligaría a
-- recordarlo en cada camino que inserte líneas — hoy son dos, crear y editar
-- pedido — y cualquier camino nuevo nacería sin congelar, dejando la venta con
-- comisión nula sin que nadie lo note hasta la liquidación.
--
-- El trigger lo resuelve en un solo lugar: no importa quién inserte.
--
-- Si la línea ya trae comision_unitaria, se respeta: permite corregir o
-- importar datos con un valor distinto al vigente.
--
-- Idempotente.

BEGIN;

CREATE OR REPLACE FUNCTION public.congelar_comision_order_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.comision_unitaria IS NULL THEN
    SELECT p.comision
      INTO NEW.comision_unitaria
      FROM public.presentations p
     WHERE lower(replace(p.nombre, ' ', '')) = lower(replace(NEW.product_presentation, ' ', ''))
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.congelar_comision_order_item() IS
  'Copia la comisión vigente de la presentación a la línea de venta al insertarla.';

DROP TRIGGER IF EXISTS congelar_comision ON public.order_items;

CREATE TRIGGER congelar_comision
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.congelar_comision_order_item();

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Registra una venta de prueba desde la aplicación y confirma que la línea
-- quedó con su comisión:
--   SELECT product_presentation, comision_unitaria, created_at
--   FROM public.order_items ORDER BY created_at DESC LIMIT 5;
