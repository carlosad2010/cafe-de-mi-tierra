// Reglas de liquidación de comisiones de venta.
// Fuente oficial de las tarifas: Google Drive «Recetas Generales»
// (1RqOjTV57CpkwP5pPJBqkqwjE_hRa_LYOE_0K-jDnIVs), hoja "Nueva Hoja de Costos",
// fila "Comision Vendedor". Valores verificados a septiembre 2026.
// La comisión es un valor fijo en COP por bolsa según el gramaje; no depende
// de si el producto es grano o molido, ni del precio de venta.

export const TARIFAS: { gramos: number; comision: number }[] = [
  { gramos: 45,   comision: 1110.75 },
  { gramos: 125,  comision: 1626.23 },
  { gramos: 250,  comision: 2611.95 },
  { gramos: 500,  comision: 3983.40 },
  { gramos: 2500, comision: 13287.00 },
]

const TARIFA_POR_GRAMOS = new Map(TARIFAS.map(t => [t.gramos, t.comision]))

/**
 * Extrae el gramaje de un nombre de presentación ("250 g", "2.500 g", "45g").
 *
 * Los separadores de miles deben limpiarse antes de parsear: un `\d+` ingenuo
 * sobre "2.500 g" captura "500" y liquidaría esa bolsa a $3.983 en vez de
 * $13.287.
 */
export function extraerGramos(presentation: string | null | undefined): number | null {
  if (!presentation) return null
  const match = presentation.match(/([\d.,]*\d)\s*g\b/i)
  if (!match) return null
  const gramos = Number(match[1].replace(/[.,]/g, ''))
  return Number.isFinite(gramos) && gramos > 0 ? gramos : null
}

/** Comisión por unidad para una presentación, o null si no hay tarifa definida. */
export function comisionUnitaria(presentation: string | null | undefined): number | null {
  const gramos = extraerGramos(presentation)
  if (gramos === null) return null
  return TARIFA_POR_GRAMOS.get(gramos) ?? null
}

export type LineaVenta = {
  order_number: number
  fecha: string
  cliente: string
  vendedor: string
  producto: string
  presentacion: string
  tipo: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export type LineaLiquidada = LineaVenta & {
  gramos: number | null
  comisionUnitaria: number | null
  comisionLinea: number
  sinTarifa: boolean
}

export type Liquidacion = {
  lineas: LineaLiquidada[]
  porVendedor: { vendedor: string; ventas: number; comision: number; unidades: number }[]
  totalVentas: number
  totalComision: number
  presentacionesSinTarifa: string[]
}

/**
 * Liquida las líneas de venta contra la tabla de tarifas.
 *
 * Una presentación sin tarifa definida no se estima ni se aproxima: liquida en
 * cero y se reporta aparte para que alguien decida cómo tratarla.
 */
export function liquidar(lineas: LineaVenta[]): Liquidacion {
  const sinTarifa = new Set<string>()

  const liquidadas: LineaLiquidada[] = lineas.map(l => {
    const unitaria = comisionUnitaria(l.presentacion)
    if (unitaria === null) sinTarifa.add(l.presentacion || '(sin presentación)')
    return {
      ...l,
      gramos: extraerGramos(l.presentacion),
      comisionUnitaria: unitaria,
      comisionLinea: unitaria === null ? 0 : unitaria * l.cantidad,
      sinTarifa: unitaria === null,
    }
  })

  const porVendedorMap = new Map<string, { vendedor: string; ventas: number; comision: number; unidades: number }>()
  for (const l of liquidadas) {
    const actual = porVendedorMap.get(l.vendedor)
    if (actual) {
      actual.ventas += l.subtotal
      actual.comision += l.comisionLinea
      actual.unidades += l.cantidad
    } else {
      porVendedorMap.set(l.vendedor, {
        vendedor: l.vendedor,
        ventas: l.subtotal,
        comision: l.comisionLinea,
        unidades: l.cantidad,
      })
    }
  }

  return {
    lineas: liquidadas,
    porVendedor: Array.from(porVendedorMap.values()).sort((a, b) => b.comision - a.comision),
    totalVentas: liquidadas.reduce((s, l) => s + l.subtotal, 0),
    totalComision: liquidadas.reduce((s, l) => s + l.comisionLinea, 0),
    presentacionesSinTarifa: Array.from(sinTarifa),
  }
}
