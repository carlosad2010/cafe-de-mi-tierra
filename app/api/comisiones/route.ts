import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { liquidar, type LineaVenta } from '@/lib/comisiones'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function parseFecha(valor: unknown): string | null {
  if (typeof valor !== 'string' || !FECHA_RE.test(valor)) return null
  const d = new Date(`${valor}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  // Rechaza fechas imposibles que Date normaliza en silencio (2026-02-31).
  return d.toISOString().slice(0, 10) === valor ? valor : null
}

/** Día siguiente, para usar el límite superior como exclusivo. */
function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const MONEDA = '"$"#,##0'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 })
  }

  const desde = parseFecha((body as { desde?: unknown })?.desde)
  const hasta = parseFecha((body as { hasta?: unknown })?.hasta)
  if (!desde || !hasta) {
    return NextResponse.json({ error: 'Rango de fechas inválido (se espera YYYY-MM-DD)' }, { status: 400 })
  }
  if (desde > hasta) {
    return NextResponse.json({ error: 'La fecha inicial no puede ser posterior a la final' }, { status: 400 })
  }

  // Solo pedidos completados: los reversados se anulan y se regeneran, así que
  // el filtro por estado ya evita contar dos veces la misma venta.
  const [{ data: orders, error }, { data: tarifas }] = await Promise.all([
    supabase
      .from('orders')
      .select('order_number, created_at, customer:customers(full_name), seller:profiles(full_name), items:order_items(product_name, product_presentation, product_type, quantity, unit_price, subtotal, comision_unitaria)')
      .eq('status', 'completado')
      .gte('created_at', `${desde}T00:00:00`)
      .lt('created_at', `${diaSiguiente(hasta)}T00:00:00`)
      .order('order_number', { ascending: true }),
    supabase
      .from('presentations')
      .select('nombre, comision, orden')
      .order('orden'),
  ])

  if (error) {
    return NextResponse.json({ error: 'No se pudieron leer las ventas' }, { status: 500 })
  }

  const lineas: LineaVenta[] = (orders ?? []).flatMap((o: any) =>
    (o.items ?? []).map((i: any): LineaVenta => ({
      order_number: o.order_number,
      fecha: String(o.created_at).slice(0, 10),
      cliente: o.customer?.full_name ?? 'Sin cliente',
      vendedor: o.seller?.full_name ?? 'Sin vendedor',
      producto: i.product_name ?? '',
      presentacion: i.product_presentation ?? '',
      tipo: i.product_type ?? '',
      cantidad: Number(i.quantity) || 0,
      precio_unitario: Number(i.unit_price) || 0,
      subtotal: Number(i.subtotal) || 0,
      comision_unitaria: i.comision_unitaria == null ? null : Number(i.comision_unitaria),
    }))
  )

  const liq = liquidar(lineas)

  const wb = new ExcelJS.Workbook()
  wb.created = new Date()

  // ── Hoja 1: Resumen y Notas ────────────────────────────────────────────────
  const resumen = wb.addWorksheet('Resumen y Notas')
  resumen.columns = [{ width: 32 }, { width: 46 }]

  const titulo = resumen.addRow(['Informe de Comisiones de Venta', ''])
  titulo.font = { bold: true, size: 14 }
  resumen.addRow(['Café de mi Tierra', ''])
  resumen.addRow([])
  resumen.addRow(['Período liquidado', `${desde} a ${hasta}`])
  resumen.addRow(['Pedidos incluidos', (orders ?? []).length])
  resumen.addRow(['Líneas de producto', liq.lineas.length])
  resumen.addRow([])

  const filaVentas = resumen.addRow(['Total ventas (subtotales)', liq.totalVentas])
  filaVentas.getCell(2).numFmt = MONEDA
  const filaComision = resumen.addRow(['TOTAL COMISIÓN A PAGAR', liq.totalComision])
  filaComision.font = { bold: true }
  filaComision.getCell(2).numFmt = MONEDA
  resumen.addRow([])

  resumen.addRow(['Criterios aplicados', '']).font = { bold: true }
  resumen.addRow(['Estado de pedidos', 'Solo "completado" (excluye cancelados y reversados)'])
  resumen.addRow(['Comisión', 'Valor fijo en COP por bolsa, congelado al momento de la venta'])
  resumen.addRow([])

  resumen.addRow(['Advertencias', '']).font = { bold: true }
  if (liq.presentacionesSinTarifa.length > 0) {
    resumen.addRow([
      'Presentaciones sin tarifa',
      liq.presentacionesSinTarifa.join(', '),
    ]).getCell(2).font = { color: { argb: 'FF92400E' } }
    resumen.addRow([
      '',
      'Liquidadas en $0 y resaltadas en la hoja Detalle. Definir cómo tratarlas antes de pagar.',
    ])
  } else {
    resumen.addRow(['', 'Ninguna: todas las presentaciones vendidas tienen tarifa definida.'])
  }
  resumen.addRow([])

  resumen.addRow(['Fuentes', '']).font = { bold: true }
  resumen.addRow(['Ventas', 'Base de datos administrativa (Supabase)'])
  resumen.addRow(['Comisión', 'La congelada en cada venta; las tarifas se administran en Configuración › Presentaciones'])
  resumen.addRow(['Generado', new Date().toISOString().slice(0, 16).replace('T', ' ')])

  // ── Hoja 2: Detalle de Ventas ──────────────────────────────────────────────
  const detalle = wb.addWorksheet('Detalle de Ventas')
  detalle.columns = [
    { header: 'N° Pedido',         key: 'pedido',   width: 11 },
    { header: 'Fecha',             key: 'fecha',    width: 12 },
    { header: 'Cliente',           key: 'cliente',  width: 28 },
    { header: 'Vendedor',          key: 'vendedor', width: 22 },
    { header: 'Producto',          key: 'producto', width: 26 },
    { header: 'Presentación',      key: 'pres',     width: 14 },
    { header: 'Tipo',              key: 'tipo',     width: 14 },
    { header: 'Cantidad',          key: 'cant',     width: 10 },
    { header: 'Precio Unitario',   key: 'precio',   width: 15 },
    { header: 'Subtotal',          key: 'subtotal', width: 15 },
    { header: 'Comisión Unitaria', key: 'comUnit',  width: 17 },
    { header: 'Comisión Línea',    key: 'comLinea', width: 16 },
    { header: 'Observación',       key: 'obs',      width: 42 },
  ]
  detalle.getRow(1).font = { bold: true }
  detalle.views = [{ state: 'frozen', ySplit: 1 }]

  liq.lineas.forEach(l => {
    const fila = detalle.addRow({
      pedido: l.order_number,
      fecha: l.fecha,
      cliente: l.cliente,
      vendedor: l.vendedor,
      producto: l.producto,
      pres: l.presentacion,
      tipo: l.tipo,
      cant: l.cantidad,
      precio: l.precio_unitario,
      subtotal: l.subtotal,
      obs: l.sinTarifa ? 'Sin tarifa de comisión al momento de la venta: liquida en $0' : '',
    })
    const n = fila.number

    // La comisión unitaria va como valor, no como fórmula contra la hoja de
    // tarifas: es la que se congeló en la venta. Si se resolviera contra la
    // tarifa vigente, reabrir el informe de un mes ya pagado después de un
    // ajuste de tarifas daría cifras distintas a las que se pagaron.
    fila.getCell('comUnit').value = l.comision_unitaria ?? 0

    // La comisión de línea sí es fórmula: es aritmética dentro del archivo y
    // deja ver de dónde sale el número.
    fila.getCell('comLinea').value = { formula: `H${n}*K${n}`, result: l.comisionLinea }

    fila.getCell('precio').numFmt = MONEDA
    fila.getCell('subtotal').numFmt = MONEDA
    fila.getCell('comUnit').numFmt = MONEDA
    fila.getCell('comLinea').numFmt = MONEDA

    if (l.sinTarifa) {
      fila.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }
      })
    }
  })

  if (liq.lineas.length > 0) {
    const primera = 2
    const ultima = liq.lineas.length + 1
    const totales = detalle.addRow({ obs: '' })
    totales.getCell('cliente').value  = 'TOTALES'
    totales.getCell('cant').value     = { formula: `SUM(H${primera}:H${ultima})`, result: liq.lineas.reduce((s, l) => s + l.cantidad, 0) }
    totales.getCell('subtotal').value = { formula: `SUM(J${primera}:J${ultima})`, result: liq.totalVentas }
    totales.getCell('comLinea').value = { formula: `SUM(L${primera}:L${ultima})`, result: liq.totalComision }
    totales.font = { bold: true }
    totales.getCell('subtotal').numFmt = MONEDA
    totales.getCell('comLinea').numFmt = MONEDA
  }

  // ── Hoja 3: Resumen por Vendedor ───────────────────────────────────────────
  const porVendedor = wb.addWorksheet('Resumen por Vendedor')
  porVendedor.columns = [
    { header: 'Vendedor',        key: 'vendedor', width: 26 },
    { header: 'Unidades',        key: 'unidades', width: 12 },
    { header: 'Ventas',          key: 'ventas',   width: 16 },
    { header: 'Comisión a pagar', key: 'comision', width: 18 },
  ]
  porVendedor.getRow(1).font = { bold: true }

  const rangoDetalle = liq.lineas.length > 0
    ? { desde: 2, hasta: liq.lineas.length + 1 }
    : null

  liq.porVendedor.forEach(v => {
    const fila = porVendedor.addRow({ vendedor: v.vendedor })
    const n = fila.number
    if (rangoDetalle) {
      const criterio = `'Detalle de Ventas'!$D$${rangoDetalle.desde}:$D$${rangoDetalle.hasta},A${n}`
      fila.getCell('unidades').value = { formula: `SUMIF(${criterio},'Detalle de Ventas'!$H$${rangoDetalle.desde}:$H$${rangoDetalle.hasta})`, result: v.unidades }
      fila.getCell('ventas').value   = { formula: `SUMIF(${criterio},'Detalle de Ventas'!$J$${rangoDetalle.desde}:$J$${rangoDetalle.hasta})`, result: v.ventas }
      fila.getCell('comision').value = { formula: `SUMIF(${criterio},'Detalle de Ventas'!$L$${rangoDetalle.desde}:$L$${rangoDetalle.hasta})`, result: v.comision }
    } else {
      fila.getCell('unidades').value = v.unidades
      fila.getCell('ventas').value   = v.ventas
      fila.getCell('comision').value = v.comision
    }
    fila.getCell('ventas').numFmt   = MONEDA
    fila.getCell('comision').numFmt = MONEDA
  })

  if (liq.porVendedor.length > 0) {
    const total = porVendedor.addRow({ vendedor: 'TOTAL GENERAL' })
    const n = total.number
    total.getCell('unidades').value = { formula: `SUM(B2:B${n - 1})`, result: liq.porVendedor.reduce((s, v) => s + v.unidades, 0) }
    total.getCell('ventas').value   = { formula: `SUM(C2:C${n - 1})`, result: liq.totalVentas }
    total.getCell('comision').value = { formula: `SUM(D2:D${n - 1})`, result: liq.totalComision }
    total.font = { bold: true }
    total.getCell('ventas').numFmt   = MONEDA
    total.getCell('comision').numFmt = MONEDA
  }

  // ── Hoja 4: Tarifas Comisión ───────────────────────────────────────────────
  const hojaTarifas = wb.addWorksheet('Tarifas Comisión')
  hojaTarifas.columns = [
    { header: 'Presentación',       key: 'pres',     width: 18 },
    { header: 'Comisión por bolsa', key: 'comision', width: 20 },
  ]
  hojaTarifas.getRow(1).font = { bold: true }

  for (const t of (tarifas ?? [])) {
    const valor = t.comision == null ? null : Number(t.comision)
    const fila = hojaTarifas.addRow({ pres: t.nombre, comision: valor ?? 'Sin definir' })
    if (valor == null) {
      fila.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } } })
    } else {
      fila.getCell('comision').numFmt = '"$"#,##0.00'
    }
  }

  hojaTarifas.addRow([])
  hojaTarifas.addRow(['Nota:', 'Tarifas vigentes al momento de generar este informe.'])
  hojaTarifas.addRow(['', 'La hoja Detalle usa la comisión congelada en cada venta, que puede diferir'])
  hojaTarifas.addRow(['', 'si la tarifa se ajustó después. Se administran en Configuración › Presentaciones.'])

  const buffer = await wb.xlsx.writeBuffer()
  const nombre = `Informe_Comisiones_Ventas_${desde}_a_${hasta}.xlsx`

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'X-Total-Comision': String(Math.round(liq.totalComision)),
      'X-Total-Lineas': String(liq.lineas.length),
      'X-Sin-Tarifa': encodeURIComponent(liq.presentacionesSinTarifa.join('|')),
    },
  })
}
