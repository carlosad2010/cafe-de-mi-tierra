'use client'

import { useState, useMemo } from 'react'
import { Product } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Search, Printer, CheckCircle2, AlertCircle, RefreshCw, Save, HelpCircle } from 'lucide-react'

interface PhysicalCountViewProps {
  products: Product[]
  canWrite: boolean
  onSuccessReconciliation: () => void
}

export function PhysicalCountView({
  products,
  canWrite,
  onSuccessReconciliation,
}: PhysicalCountViewProps) {
  // Estado local para los valores contados por producto ID
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filtrado de productos en el formulario de conteo
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
      return matchSearch
    })
  }, [products, searchTerm])

  // Pre-llenar todos los campos con el stock del sistema
  const handlePrefillSystemStock = () => {
    const initialCounts: Record<string, string> = {}
    products.forEach((p) => {
      initialCounts[p.id] = String(p.stock)
    })
    setCounts(initialCounts)
  }

  // Resetea todas las lecturas
  const handleClearCounts = () => {
    setCounts({})
    setReasons({})
  }

  // Cambio de cantidad contada
  const handleCountChange = (productId: string, val: string) => {
    setCounts((prev) => ({ ...prev, [productId]: val }))
  }

  // Cambio de motivo de la diferencia
  const handleReasonChange = (productId: string, val: string) => {
    setReasons((prev) => ({ ...prev, [productId]: val }))
  }

  // Cálculo en tiempo real de discrepancias
  const summary = useMemo(() => {
    let itemsWithCount = 0
    let itemsMatching = 0
    let itemsShortage = 0 // Faltante (físico < sistema)
    let itemsSurplus = 0 // Sobrante (físico > sistema)
    let totalUnitsDifference = 0

    products.forEach((p) => {
      const val = counts[p.id]
      if (val !== undefined && val !== '') {
        const physical = Number(val)
        const system = p.stock
        const diff = physical - system

        itemsWithCount++
        if (diff === 0) {
          itemsMatching++
        } else if (diff < 0) {
          itemsShortage++
          totalUnitsDifference += diff
        } else {
          itemsSurplus++
          totalUnitsDifference += diff
        }
      }
    })

    const totalDiscrepancies = itemsShortage + itemsSurplus

    return {
      itemsWithCount,
      itemsMatching,
      itemsShortage,
      itemsSurplus,
      totalDiscrepancies,
      totalUnitsDifference,
    }
  }, [products, counts])

  // Imprimir planilla limpia de conteo físico
  const handlePrintWorksheet = () => {
    window.print()
  }

  // Procesar reconciliación y guardar ajustes en base de datos
  const handleApplyReconciliation = async () => {
    if (!canWrite) return
    if (summary.totalDiscrepancies === 0) {
      setMessage({
        type: 'error',
        text: 'No hay discrepancias registradas entre el stock del sistema y el conteo físico para procesar.',
      })
      return
    }

    const confirmMsg = `¿Desea aplicar los ajustes para ${summary.totalDiscrepancies} productos con discrepancias de conteo físico?\n\nEsta acción registrará los movimientos de tipo 'ajuste' y actualizará el stock oficial en la base de datos.`
    if (!window.confirm(confirmMsg)) return

    setSaving(true)
    setMessage(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      // Colección de ítems a ajustar
      const itemsToAdjust = products
        .map((p) => {
          const val = counts[p.id]
          if (val === undefined || val === '') return null
          const physical = Number(val)
          const system = p.stock
          const diff = physical - system

          if (diff === 0) return null

          const reasonText =
            reasons[p.id] ||
            `Reconciliación por conteo físico (Diferencia: ${diff > 0 ? '+' : ''}${diff} unids)`

          return {
            product_id: p.id,
            previous_stock: system,
            new_stock: physical,
            quantity: diff, // la diferencia (+ o -)
            type: 'ajuste',
            reason: reasonText,
            created_by: user?.id,
          }
        })
        .filter(Boolean)

      if (itemsToAdjust.length === 0) {
        setSaving(false)
        return
      }

      // 1. Insertar todos los movimientos de inventario
      const { error: insertErr } = await supabase
        .from('inventory_movements')
        .insert(itemsToAdjust as any)

      if (insertErr) throw insertErr

      // 2. Actualizar el stock de cada producto en la tabla products
      for (const item of itemsToAdjust) {
        if (!item) continue
        const { error: updateErr } = await supabase
          .from('products')
          .update({ stock: item.new_stock })
          .eq('id', item.product_id)

        if (updateErr) throw updateErr
      }

      setMessage({
        type: 'success',
        text: `¡Reconciliación exitosa! Se actualizaron ${itemsToAdjust.length} productos en el inventario.`,
      })

      // Limpiar formulario y llamar callback de recarga
      setCounts({})
      setReasons({})
      onSuccessReconciliation()
    } catch (err: any) {
      console.error('Error al aplicar reconciliación:', err)
      setMessage({
        type: 'error',
        text: `Error al guardar los ajustes: ${err.message || 'Error desconocido'}`,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Estilos específicos para impresión de planilla limpia de laboratorio/almacén */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-worksheet, .printable-worksheet * { visibility: visible; }
          .printable-worksheet { position: absolute; left: 0; top: 0; width: 100%; font-size: 12px; }
          .no-print { display: none !important; }
          .data-table th, .data-table td { padding: 8px 12px !important; border: 1px solid #ddd !important; }
        }
      `}</style>

      {/* Header instructivo y barra de herramientas */}
      <div
        className="p-5 rounded-xl border no-print"
        style={{ background: '#fff', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
              Auditoría y Toma de Conteo Físico
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Registra los resultados de los conteos reales en bodega para identificar y corregir diferencias con el sistema.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintWorksheet}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
              title="Imprimir planilla en papel para tomar datos físicamente"
            >
              <Printer size={15} /> Imprimir Planilla de Conteo
            </button>
            <button
              type="button"
              onClick={handlePrefillSystemStock}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={15} /> Pre-llenar con Stock Actual
            </button>
            {Object.keys(counts).length > 0 && (
              <button
                type="button"
                onClick={handleClearCounts}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-900 border border-slate-200"
              >
                Limpiar Formulario
              </button>
            )}
          </div>
        </div>

        {/* Resumen de Discrepancias */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500 font-medium">Ítems Evaluados</div>
            <div className="text-lg font-bold text-slate-800">
              {summary.itemsWithCount} / {products.length}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <div className="text-xs text-green-700 font-medium flex items-center gap-1">
              <CheckCircle2 size={13} /> Coincidencias Exactas
            </div>
            <div className="text-lg font-bold text-green-800">{summary.itemsMatching}</div>
          </div>
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <div className="text-xs text-red-700 font-medium flex items-center gap-1">
              <AlertCircle size={13} /> Faltantes (Pérdidas)
            </div>
            <div className="text-lg font-bold text-red-800">{summary.itemsShortage} ítems</div>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="text-xs text-amber-700 font-medium flex items-center gap-1">
              <AlertCircle size={13} /> Sobrantes (Excedentes)
            </div>
            <div className="text-lg font-bold text-amber-800">{summary.itemsSurplus} ítems</div>
          </div>
        </div>
      </div>

      {/* Banner de mensajes de estado */}
      {message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between no-print ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs underline font-medium">
            Cerrar
          </button>
        </div>
      )}

      {/* Tabla de Conteo Físico */}
      <div
        className="printable-worksheet rounded-xl border"
        style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}
      >
        {/* Barra de búsqueda interna */}
        <div
          className="px-5 py-3 border-b flex flex-col sm:flex-row items-center justify-between gap-3 no-print"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="relative w-full sm:w-72">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Buscar producto o SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs outline-none bg-slate-50 focus:bg-white"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>

          {canWrite && summary.totalDiscrepancies > 0 && (
            <button
              onClick={handleApplyReconciliation}
              disabled={saving}
              className="btn btn-primary text-xs flex items-center gap-2 shadow-sm w-full sm:w-auto justify-center"
            >
              <Save size={15} />
              {saving ? 'Aplicando Reconciliación...' : `Aplicar ${summary.totalDiscrepancies} Ajustes`}
            </button>
          )}
        </div>

        {/* Encabezado visible SOLO al imprimir */}
        <div className="hidden print:block p-4 border-b">
          <h1 className="text-xl font-bold">Café de mi Tierra - Planilla de Conteo Físico</h1>
          <p className="text-sm text-slate-600">
            Fecha de Auditoría: ____________________ | Responsable: ____________________
          </p>
        </div>

        <div className="table-wrap">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="hidden sm:table-cell">Categoría</th>
                <th className="text-center">Stock Sistema</th>
                <th className="text-center w-36">Conteo Físico Real</th>
                <th className="text-center">Diferencia</th>
                <th className="hidden md:table-cell no-print">Causa / Observación</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const countVal = counts[p.id] ?? ''
                const hasValue = countVal !== ''
                const physical = hasValue ? Number(countVal) : p.stock
                const diff = hasValue ? physical - p.stock : 0

                return (
                  <tr key={p.id} className={diff !== 0 ? 'bg-amber-50/40' : ''}>
                    <td>
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        {p.sku && <span>SKU: {p.sku}</span>}
                        <span>{p.presentation?.nombre}</span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell text-xs text-muted-foreground capitalize">
                      {p.tipo?.nombre}
                    </td>
                    <td className="text-center font-semibold text-slate-700">{p.stock}</td>
                    <td className="text-center">
                      <div className="no-print">
                        <input
                          type="number"
                          min="0"
                          value={countVal}
                          onChange={(e) => handleCountChange(p.id, e.target.value)}
                          placeholder={String(p.stock)}
                          className={`w-24 text-center py-1 px-2 rounded-lg border text-sm font-bold outline-none transition-all ${
                            diff < 0
                              ? 'border-red-400 bg-red-50 text-red-700'
                              : diff > 0
                              ? 'border-green-400 bg-green-50 text-green-700'
                              : 'border-slate-300 bg-white text-slate-800'
                          }`}
                        />
                      </div>
                      {/* Espacio visible solo en impresión en papel */}
                      <div className="hidden print:block h-8 border-b border-dashed border-slate-400 w-20 mx-auto"></div>
                    </td>
                    <td className="text-center font-bold">
                      {!hasValue ? (
                        <span className="text-slate-400 text-xs">—</span>
                      ) : diff === 0 ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          OK
                        </span>
                      ) : (
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full ${
                            diff > 0
                              ? 'bg-green-100 text-green-800 font-extrabold'
                              : 'bg-red-100 text-red-800 font-extrabold'
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </td>
                    <td className="hidden md:table-cell no-print">
                      {diff !== 0 && (
                        <input
                          type="text"
                          placeholder="Motivo (daño, robo, error...)"
                          value={reasons[p.id] ?? ''}
                          onChange={(e) => handleReasonChange(p.id, e.target.value)}
                          className="w-full text-xs px-2.5 py-1 rounded border border-slate-200 outline-none bg-white focus:border-amber-400"
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Botón flotante inferior de reconciliación */}
        {canWrite && summary.totalDiscrepancies > 0 && (
          <div className="p-4 border-t bg-slate-50 flex items-center justify-between no-print">
            <div className="text-xs text-slate-600">
              Hay <strong className="text-slate-900 font-bold">{summary.totalDiscrepancies} diferencias</strong> registradas por ajustar.
            </div>
            <button
              onClick={handleApplyReconciliation}
              disabled={saving}
              className="btn btn-primary text-xs flex items-center gap-2 shadow-md"
            >
              <Save size={15} />
              {saving ? 'Aplicando...' : `Aplicar Reconciliación de Stock`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
