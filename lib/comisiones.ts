// Reglas de liquidación de comisiones de venta.
//
// La comisión es un valor fijo en COP por bolsa vendida, definido por
// presentación: no es un porcentaje y no depende de si el café es grano o
// molido. Se administra en Configuración › Presentaciones.
//
// Cada línea de venta guarda la comisión con la que se liquidó
// (order_items.comision_unitaria). Cambiar una tarifa afecta solo a las ventas
// futuras — las pasadas conservan la suya, para que un informe de un mes ya
// pagado siga dando la misma cifra.

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
  /** Comisión congelada en la venta. null = la línea no tenía tarifa. */
  comision_unitaria: number | null
}

export type LineaLiquidada = LineaVenta & {
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
 * Liquida las líneas de venta con la comisión que cada una tiene congelada.
 *
 * Una línea sin tarifa no se estima ni se aproxima a la presentación más
 * parecida: liquida en cero y se reporta aparte, para que la decisión de cuánto
 * pagar la tome una persona.
 */
export function liquidar(lineas: LineaVenta[]): Liquidacion {
  const sinTarifa = new Set<string>()

  const liquidadas: LineaLiquidada[] = lineas.map(l => {
    const falta = l.comision_unitaria == null
    if (falta) sinTarifa.add(l.presentacion || '(sin presentación)')
    return {
      ...l,
      comisionLinea: falta ? 0 : (l.comision_unitaria as number) * l.cantidad,
      sinTarifa: falta,
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
