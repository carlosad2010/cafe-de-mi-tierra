---
name: comisiones-cafe-de-mi-tierra
description: "Genera el informe mensual de comisiones de venta de Café de mi Tierra desde Supabase; siempre pregunta primero el rango de fechas (mes a mes u otro periodo)."
---

# Informe de Comisiones de Venta — Café de mi Tierra

Genera un informe en Excel de ventas y comisiones a pagar, a partir de la base de datos administrativa en Supabase (proyecto `ggtmdtmkiabqfkehxtqc`), aplicando la tabla oficial de comisión por presentación.

## Paso 0 — SIEMPRE preguntar el rango de fechas primero

Antes de tocar Supabase, pregunta (con AskUserQuestion si está disponible, si no en texto) qué rango de fechas se va a liquidar. Nunca asumas "el mes actual" ni reutilices un rango de una vez anterior sin confirmar. Ofrece algo como:
- Mes calendario específico (ej. "Septiembre 2026")
- Rango personalizado (fecha inicio - fecha fin)
- Repetir el último rango usado (solo si el usuario lo menciona explícitamente)

Convierte el rango a filtros `created_at >= 'YYYY-MM-01'` y `created_at < 'YYYY-(MM+1)-01'` (o las fechas exactas si es un rango personalizado, con el límite superior exclusivo).

## Paso 1 — Consultar Supabase (solo lectura)

Proyecto: `ggtmdtmkiabqfkehxtqc` ("carlosad2010's Project"). El acceso es **solo lectura** — nunca uses `apply_migration`, `pause_project`, ni ninguna operación de escritura sobre este proyecto salvo que el usuario lo pida explícitamente en esa conversación.

Tablas relevantes: `orders`, `order_items`, `customers`, `profiles` (vendedor vía `orders.seller_id -> profiles.id`).

Filtra siempre `o.status = 'completado'` — esto excluye automáticamente pedidos cancelados/anulados/reversados (Carlos confirmó que las facturas reversadas se anulan y se regeneran, así que el filtro por estado ya resuelve la duplicación, no hace falta lógica adicional).

Query base (ajustar rango de fechas según el Paso 0):

```sql
select
  o.order_number,
  o.created_at::date as fecha,
  c.full_name as cliente,
  p.full_name as vendedor,
  oi.product_name,
  oi.product_presentation,
  oi.product_type,
  oi.quantity,
  oi.unit_price,
  oi.subtotal
from orders o
join customers c on c.id = o.customer_id
join order_items oi on oi.order_id = o.id
left join profiles p on p.id = o.seller_id
where o.created_at >= '<inicio>' and o.created_at < '<fin_exclusivo>'
  and o.status = 'completado'
order by o.order_number, oi.id;
```

Si el usuario menciona que hubo pedidos cancelados/reversados en el periodo, coméntale explícitamente en la respuesta final que quedaron excluidos por el filtro de estado (dale los números de pedido si son pocos).

## Paso 2 — Tabla de tarifas de comisión

Fuente oficial: Google Drive, archivo "Recetas Generales" (ID `1RqOjTV57CpkwP5pPJBqkqwjE_hRa_LYOE_0K-jDnIVs`), hoja **"Nueva Hoja de Costos"**, fila "Comision Vendedor". La comisión es un valor fijo en COP por bolsa, según la presentación (independiente de si el producto es grano o molido).

Valores vigentes verificados (septiembre 2026) — úsalos por defecto sin volver a descargar el archivo, salvo que el usuario diga que las tarifas cambiaron o que confirme que quiere refrescarlas:

| Presentación | Comisión por bolsa (COP) | % sobre precio distribuidor |
|---|---|---|
| 45 g | $1.110,75 | 14,06% |
| 125 g | $1.626,23 | 9,09% |
| 250 g | $2.611,95 | 8,74% |
| 500 g | $3.983,40 | 7,98% |
| 2.500 g | $13.287,00 | 6,65% |

Si el usuario pide refrescar la tarifa: la exportación de texto plano de Google Sheets para este archivo puede venir incompleta o desactualizada (ya pasó una vez). Para obtener el valor real, usa `download_file_content` con `exportMimeType: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, decodifica el base64 a un `.xlsx` y léelo con `openpyxl` (no confíes en `read_file_content`/`get_file_metadata` en texto plano para esta hoja).

**Presentaciones sin tarifa definida** (ej. 18 g, o cualquier otra que aparezca en `order_items` y no esté en la tabla): no asumas ni inventes una tarifa. Márcalas y pregúntale al usuario cómo manejarlas (excluir de la comisión, usar la tarifa más cercana, prorratear por gramaje, o que él indique el valor). Por defecto, si el usuario no da instrucción distinta en esa conversación, exclúyelas de la comisión (comisión = 0) y resáltalas en amarillo en el detalle con una nota explicando por qué.

## Paso 3 — Construir el Excel

Usa la skill `xlsx` (Read su SKILL.md antes de construir: fórmulas reales, no valores fijos; `recalc.py` obligatorio antes de entregar). Estructura de 4 hojas:

1. **Resumen y Notas** (primera hoja): periodo cubierto, total de ventas, total de comisión a pagar, pedidos excluidos por cancelación (con número y motivo), advertencias de presentaciones sin tarifa, y las fuentes de los datos (Supabase + Google Drive).
2. **Detalle de Ventas**: una fila por línea de producto — N° Pedido, Fecha, Cliente, Vendedor, Producto, Presentación, Tipo, Cantidad, Precio Unitario, Subtotal, Comisión Unitaria (fórmula `INDEX/MATCH` contra la hoja de Tarifas), Comisión Línea (`=Cantidad*ComisiónUnitaria`), Observación. Fila de totales al final con `SUM`. Resalta en amarillo las líneas sin tarifa definida.
3. **Resumen por Vendedor**: una fila por vendedor con `SUMIF` de subtotal de ventas y de comisión total, más fila de TOTAL GENERAL.
4. **Tarifas Comisión**: la tabla de tarifas del Paso 2, con la fuente citada, para que las fórmulas de la hoja de Detalle referencien esta tabla (así si cambia una tarifa, todo el archivo recalcula solo).

Nombra el archivo `Informe_Comisiones_Ventas_<rango>.xlsx` (ej. `Informe_Comisiones_Ventas_Sep_2026.xlsx`).

## Paso 4 — Entregar y resumir

Envía el archivo con SendUserFile. En el mensaje de respuesta (sin repetir todo el detalle que ya está en el Excel), menciona: el total de comisión a pagar, el desglose por vendedor si hay más de uno, y cualquier pedido excluido por cancelación o presentación sin tarifa que haya aparecido en ese periodo.

## Notas de contexto

- `precio1` en la tabla `products` de Supabase es el precio para distribuidores/hoteles/gift shops (el que se usa en portafolios comerciales); `precio2` es el precio al consumidor final en punto de venta propio — no confundir al analizar subtotales.
- El acceso a Supabase es solo lectura por decisión explícita de Carlos; nunca hacer escrituras aunque parezca conveniente para "corregir" un dato.