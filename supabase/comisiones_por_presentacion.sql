-- Comisión de venta administrable por presentación.
--
-- Hasta ahora la comisión vivía como una tabla fija en el código y se resolvía
-- parseando el gramaje del nombre de la presentación ("250g" -> 250). Eso impide
-- crear una presentación nueva (300g) sin tocar código, y deja sin tarifa a
-- cualquier nombre que el parser no entienda (hoy: 18g).
--
-- Se guardan DOS valores, no uno:
--
--   presentations.comision        -> tarifa vigente, la que se administra
--   order_items.comision_unitaria -> tarifa aplicada en esa venta, congelada
--
-- El congelado es el mismo patrón que la tabla ya usa con order_items.cost_price:
-- sin él, subir una tarifa reescribiría las liquidaciones de meses ya pagados y
-- un informe histórico dejaría de ser reproducible.
--
-- NULL significa "sin tarifa definida", que no es lo mismo que 0 ("no paga
-- comisión"). El informe no estima ni aproxima una presentación sin tarifa:
-- la liquida en cero y la reporta aparte para que la decida una persona.
--
-- Idempotente: se puede correr más de una vez sin duplicar ni pisar datos.

BEGIN;

-- ── 1. Columnas ─────────────────────────────────────────────────────────────
ALTER TABLE public.presentations
  ADD COLUMN IF NOT EXISTS comision numeric(12,2);

COMMENT ON COLUMN public.presentations.comision IS
  'Comisión vigente en COP por bolsa vendida. NULL = sin tarifa definida.';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS comision_unitaria numeric(12,2);

COMMENT ON COLUMN public.order_items.comision_unitaria IS
  'Comisión por unidad aplicada al momento de la venta. Congelada: no se '
  'recalcula si luego cambia la tarifa de la presentación.';

-- No se aceptan comisiones negativas.
ALTER TABLE public.presentations
  DROP CONSTRAINT IF EXISTS presentations_comision_check;
ALTER TABLE public.presentations
  ADD CONSTRAINT presentations_comision_check CHECK (comision IS NULL OR comision >= 0);

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_comision_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_comision_check CHECK (comision_unitaria IS NULL OR comision_unitaria >= 0);

-- ── 2. Tarifas vigentes ─────────────────────────────────────────────────────
-- Fuente: Google Drive «Recetas Generales» › Nueva Hoja de Costos ›
-- fila "Comision Vendedor". Verificadas a septiembre 2026.
-- Solo siembra donde aún no hay valor, para no pisar ediciones posteriores.
UPDATE public.presentations SET comision = v.valor
FROM (VALUES
  ('45g',    1110.75),
  ('125g',   1626.23),
  ('250g',   2611.95),
  ('500g',   3983.40),
  ('2500g', 13287.00)
) AS v(nombre, valor)
WHERE lower(replace(public.presentations.nombre, ' ', '')) = v.nombre
  AND public.presentations.comision IS NULL;

-- 18g queda deliberadamente en NULL: no tiene tarifa oficial definida.
-- Debe fijarse desde el módulo de administración antes de liquidarla.

-- ── 3. Backfill del histórico ───────────────────────────────────────────────
-- Congela en cada línea ya vendida la tarifa vigente, que es la misma con la
-- que se calcularon los informes existentes. Solo toca filas sin valor.
UPDATE public.order_items oi
SET comision_unitaria = p.comision
FROM public.presentations p
WHERE lower(replace(oi.product_presentation, ' ', '')) = lower(replace(p.nombre, ' ', ''))
  AND p.comision IS NOT NULL
  AND oi.comision_unitaria IS NULL;

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Tarifas por presentación (18g debe aparecer en NULL):
--   SELECT nombre, comision FROM public.presentations ORDER BY orden;
--
-- Líneas de venta que quedaron sin comisión congelada y por qué:
--   SELECT product_presentation, count(*) AS lineas
--   FROM public.order_items WHERE comision_unitaria IS NULL
--   GROUP BY product_presentation ORDER BY lineas DESC;
