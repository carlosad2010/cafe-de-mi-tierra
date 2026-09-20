'use client'

import { useMemo, useState } from 'react'
import { Product } from '@/lib/types'
import { formatCOP } from '@/lib/utils'
import { X, Download, ShoppingCart, AlertTriangle } from 'lucide-react'
import ExcelJS from 'exceljs'

interface RestockReportModalProps {
  products: Product[]
  onClose: () => void
}

export function RestockReportModal({ products, onClose }: RestockReportModalProps) {
  const [exporting, setExporting] = useState(false)

  // Productos que requieren reabastecimiento (stock <= min_stock)
  const restockItems = useMemo(() => {
    return products
      .filter((p) => p.stock <= p.min_stock)
      .map((p) => {
        // Sugerimos pedir suficiente para alcanzar 2x el mínimo (o mínimo 5 unids)
        const target = Math.max(p.min_stock * 2, 10)
        const suggestedQty = Math.max(target - p.stock, p.min_stock)
        const estimatedCost = suggestedQty * Number(p.cost_price || 0)

        return {
          ...p,
          suggestedQty,
          estimatedCost,
          isOut: p.stock === 0,
        }
      })
      .sort((a, b) => (a.isOut === b.isOut ? a.stock - b.stock : a.isOut ? -1 : 1))
  }, [products])

  const totals = useMemo(() => {
    const totalQty = restockItems.reduce((acc, item) => acc + item.suggestedQty, 0)
    const totalCost = restockItems.reduce((acc, item) => acc + item.estimatedCost, 0)
    const outCount = restockItems.filter((item) => item.isOut).length
    const lowCount = restockItems.length - outCount

    return { totalQty, totalCost, outCount, lowCount }
  }, [restockItems])

  // Exportación del informe de compras a Excel con ExcelJS
  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Reabastecimiento')

      // 1. Título
      worksheet.mergeCells('A1:I1')
      const titleCell = worksheet.getCell('A1')
      titleCell.value = 'Café de mi Tierra - Sugerido de Reabastecimiento de Inventario'
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: '7C5C42' } }
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' }

      // Fecha
      worksheet.mergeCells('A2:I2')
      const dateCell = worksheet.getCell('A2')
      dateCell.value = `Generado el: ${new Date().toLocaleDateString('es-CO')} ${new Date().toLocaleTimeString('es-CO')}`
      dateCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: '555555' } }

      worksheet.addRow([])

      // 2. Encabezados de Columna
      const headerRow = worksheet.addRow([
        'SKU',
        'Producto',
        'Presentación',
        'Tipo',
        'Stock Actual',
        'Stock Mínimo',
        'Cant. Sugerida',
        'Costo Unitario (COP)',
        'Total Estimado (COP)',
      ])

      headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '7C5C42' },
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })

      // 3. Filas de datos
      restockItems.forEach((item) => {
        const row = worksheet.addRow([
          item.sku || 'N/A',
          item.name,
          item.presentation?.nombre || '',
          item.tipo?.nombre || '',
          item.stock,
          item.min_stock,
          item.suggestedQty,
          Number(item.cost_price),
          item.estimatedCost,
        ])

        // Formatos numéricos
        row.getCell(5).alignment = { horizontal: 'center' }
        row.getCell(6).alignment = { horizontal: 'center' }
        row.getCell(7).alignment = { horizontal: 'center' }
        row.getCell(7).font = { bold: true }
        row.getCell(8).numFmt = '"$"#,##0'
        row.getCell(9).numFmt = '"$"#,##0'
        row.getCell(9).font = { bold: true }

        // Resaltar si está agotado
        if (item.isOut) {
          row.getCell(5).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FEE2E2' },
          }
        }
      })

      // 4. Fila de Totales
      worksheet.addRow([])
      const totalRow = worksheet.addRow([
        'TOTALES',
        '',
        '',
        '',
        '',
        '',
        totals.totalQty,
        '',
        totals.totalCost,
      ])

      totalRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 11, bold: true }
        if (colNumber === 7) cell.alignment = { horizontal: 'center' }
        if (colNumber === 9) cell.numFmt = '"$"#,##0'
      })

      // Ancho automático de columnas
      worksheet.columns.forEach((column) => {
        column.width = 18
      })
      worksheet.getColumn(2).width = 30

      // Generar descarga en el navegador
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `reabastecimiento_inventario_${new Date().toISOString().slice(0, 10)}.xlsx`
      anchor.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error al exportar Excel:', err)
      alert('Error al generar el archivo Excel de reabastecimiento.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '52rem' }}>
        <div className="flex items-center justify-between pb-4 mb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
                Sugerido de Reabastecimiento
              </h2>
              <p className="text-xs text-muted-foreground">
                Lista de compras sugeridas para reponer productos en stock bajo o agotados
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Resumen de pedido */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500 font-medium">Productos a Pedir</div>
            <div className="text-lg font-bold text-slate-800">
              {restockItems.length} <span className="text-xs font-normal">referencias</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {totals.outCount} agotados / {totals.lowCount} en stock bajo
            </div>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="text-xs text-amber-700 font-medium">Unidades Totales Sugeridas</div>
            <div className="text-lg font-bold text-amber-900">{totals.totalQty} unids</div>
          </div>
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <div className="text-xs text-green-700 font-medium">Inversión Estimada (Costo)</div>
            <div className="text-lg font-bold text-green-900">{formatCOP(totals.totalCost)}</div>
          </div>
        </div>

        {/* Tabla de sugeridos */}
        <div
          className="border rounded-xl mb-4"
          style={{ borderColor: 'var(--border)', maxHeight: '22rem', overflowY: 'auto' }}
        >
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-center">Stock Actual</th>
                <th className="text-center">Mínimo</th>
                <th className="text-center">Pedir Sugerido</th>
                <th className="text-right">Costo Unit.</th>
                <th className="text-right">Total Estimado</th>
              </tr>
            </thead>
            <tbody>
              {restockItems.map((item) => (
                <tr key={item.id} className={item.isOut ? 'bg-red-50/50' : ''}>
                  <td>
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      {item.sku && <span>SKU: {item.sku}</span>}
                      <span>{item.presentation?.nombre}</span>
                    </div>
                  </td>
                  <td className="text-center">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        item.isOut
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.stock}
                    </span>
                  </td>
                  <td className="text-center text-xs text-muted-foreground">{item.min_stock}</td>
                  <td className="text-center">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-900 text-white font-extrabold">
                      +{item.suggestedQty}
                    </span>
                  </td>
                  <td className="text-right text-xs text-slate-600">
                    {formatCOP(Number(item.cost_price))}
                  </td>
                  <td className="text-right font-bold text-slate-900">
                    {formatCOP(item.estimatedCost)}
                  </td>
                </tr>
              ))}

              {restockItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                    🎉 ¡Excelente! No hay productos con stock bajo o agotados en este momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">
            Cerrar
          </button>

          {restockItems.length > 0 && (
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting}
              className="btn btn-primary text-xs flex items-center gap-2 shadow-sm"
            >
              <Download size={15} />
              {exporting ? 'Generando Excel...' : 'Exportar Lista a Excel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
