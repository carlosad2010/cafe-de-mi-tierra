'use client'

import { useRef, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, InventoryMovement } from '@/lib/types'
import { formatCOP, formatDateTime } from '@/lib/utils'
import {
  Plus,
  Warehouse,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCcw,
  BarChart2,
  Package,
  ClipboardList,
  History,
  Search,
  ShoppingBag,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Edit,
} from 'lucide-react'
import { useEscKey } from '@/lib/hooks/useEscKey'
import { EmptyState } from '@/components/ui/EmptyState'
import { StockBar } from '@/components/ui/StockBar'
import { useCanWrite } from '@/lib/perfil-context'
import { InventoryDashboard } from './InventoryDashboard'
import { PhysicalCountView } from './PhysicalCountView'
import { RestockReportModal } from './RestockReportModal'

const MOVEMENT_TYPES = [
  { value: 'entrada', label: 'Entrada', icon: ArrowDownCircle, color: '#16a34a' },
  { value: 'salida', label: 'Salida', icon: ArrowUpCircle, color: '#dc2626' },
  { value: 'ajuste', label: 'Ajuste', icon: RefreshCcw, color: '#c4832a' },
]

const PREDEFINED_REASONS = [
  'Compra / Recepción de proveedor',
  'Vencimiento / Caducidad',
  'Daño / Rotura / Merma',
  'Pérdida / Faltante no registrado',
  'Muestra / Obsequio / Degustación',
  'Conteo Físico / Auditoría',
  'Ajuste de Saldo Inicial',
  'Otro (especificar)',
]

type StockFilterState = 'all' | 'low' | 'out' | 'normal'
type TabType = 'dashboard' | 'stock' | 'physical_count' | 'movements'

export function InventoryClient({
  initialProducts,
  initialMovements,
}: {
  initialProducts: Product[]
  initialMovements: InventoryMovement[]
}) {
  const canWrite = useCanWrite()
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements)

  // Control de pestañas
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')

  // Filtros de la tabla de stock
  const [stockFilter, setStockFilter] = useState<StockFilterState>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('')

  // Modal de ajuste manual
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    product_id: '',
    type: 'entrada',
    quantity: '',
    reasonSelect: PREDEFINED_REASONS[0],
    customReason: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Modal de reporte de reabastecimiento
  const [showRestockModal, setShowRestockModal] = useState(false)

  // Filtro de historial de movimientos
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all')

  const savingRef = useRef(false)
  useEscKey(() => {
    setShowModal(false)
    setShowRestockModal(false)
  })

  // Conteo de items para badges de stock
  const counts = useMemo(() => {
    let low = 0
    let out = 0
    let normal = 0

    products.forEach((p) => {
      if (p.stock === 0) out++
      else if (p.stock <= p.min_stock) low++
      else normal++
    })

    return { total: products.length, low, out, normal }
  }, [products])

  // Lista de tipos de producto para filtro
  const productTypes = useMemo(() => {
    const map = new Map<string, string>()
    products.forEach((p) => {
      if (p.tipo?.id && p.tipo?.nombre) {
        map.set(p.tipo.id, p.tipo.nombre)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [products])

  // Filtrado de productos para la tabla de stock
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // 1. Filtro de búsqueda
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))

      if (!matchSearch) return false

      // 2. Filtro por tipo de producto
      if (selectedTypeFilter && p.tipo_id !== selectedTypeFilter) {
        return false
      }

      // 3. Filtro por estado de stock
      if (stockFilter === 'out') return p.stock === 0
      if (stockFilter === 'low') return p.stock > 0 && p.stock <= p.min_stock
      if (stockFilter === 'normal') return p.stock > p.min_stock

      return true
    })
  }, [products, searchTerm, selectedTypeFilter, stockFilter])

  // Filtrado del historial de movimientos
  const filteredMovements = useMemo(() => {
    if (movementTypeFilter === 'all') return movements
    return movements.filter((m) => m.type === movementTypeFilter)
  }, [movements, movementTypeFilter])

  const selectedProduct = products.find((p) => p.id === form.product_id)

  // Abrir modal de movimiento pre-seleccionando un producto
  const handleOpenAdjustmentForProduct = (product: Product, defaultType: string = 'ajuste') => {
    setForm({
      product_id: product.id,
      type: defaultType,
      quantity: '',
      reasonSelect: PREDEFINED_REASONS[0],
      customReason: '',
    })
    setError('')
    setShowModal(true)
  }

  // Recargar movimientos y productos desde Supabase
  const refreshInventoryData = async () => {
    const supabase = createClient()
    const [{ data: newProds }, { data: newMovs }] = await Promise.all([
      supabase
        .from('products')
        .select('*, presentation:presentations(id, nombre, activa, orden), tipo:tipos_producto(id, nombre, activo, orden)')
        .eq('active', true)
        .order('name'),
      supabase
        .from('inventory_movements')
        .select('*, product:products(name, presentation:presentations(nombre), tipo:tipos_producto(nombre)), creator:profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (newProds) setProducts(newProds)
    if (newMovs) setMovements(newMovs)
  }

  function finishSaving() {
    savingRef.current = false
    setSaving(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (savingRef.current) return
    if (!selectedProduct) return
    savingRef.current = true
    setSaving(true)
    setError('')

    const supabase = createClient()
    const qty = Number(form.quantity)
    const prevStock = selectedProduct.stock

    let newStock = prevStock
    if (form.type === 'entrada') newStock = prevStock + qty
    else if (form.type === 'salida') newStock = prevStock - qty
    else newStock = qty // ajuste directo a nuevo total

    if (newStock < 0) {
      setError('El stock no puede quedar en un número negativo')
      finishSaving()
      return
    }

    const finalReason =
      form.reasonSelect === 'Otro (especificar)'
        ? form.customReason.trim()
        : form.reasonSelect

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const movementQuantity = form.type === 'ajuste' ? qty - prevStock : qty

    const { error: err } = await supabase.from('inventory_movements').insert({
      product_id: form.product_id,
      type: form.type,
      quantity: movementQuantity,
      previous_stock: prevStock,
      new_stock: newStock,
      reason: finalReason || null,
      created_by: user?.id,
    })

    if (err) {
      setError(err.message)
      finishSaving()
      return
    }

    await supabase.from('products').update({ stock: newStock }).eq('id', form.product_id)

    setProducts((prev) =>
      prev.map((p) => (p.id === form.product_id ? { ...p, stock: newStock } : p))
    )

    await refreshInventoryData()

    setShowModal(false)
    finishSaving()
    setForm({
      product_id: '',
      type: 'entrada',
      quantity: '',
      reasonSelect: PREDEFINED_REASONS[0],
      customReason: '',
    })
  }

  return (
    <div className="page-wrapper">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Gestión de Inventario</h1>
          <p className="page-subtitle">Valorización, control de stock, auditoría física y movimientos</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowRestockModal(true)}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
            title="Ver lista sugerida de compras"
          >
            <ShoppingBag size={15} /> Sugerido de Compras
          </button>

          {canWrite && (
            <button
              onClick={() => {
                setForm({
                  product_id: '',
                  type: 'entrada',
                  quantity: '',
                  reasonSelect: PREDEFINED_REASONS[0],
                  customReason: '',
                })
                setError('')
                setShowModal(true)
              }}
              className="btn btn-primary text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={16} /> Registrar Movimiento / Ajuste
            </button>
          )}
        </div>
      </div>

      {/* Navegación por Pestañas */}
      <div className="border-b mb-6" style={{ borderColor: 'var(--border)' }}>
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto pb-px scrollbar-none">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'border-amber-700 text-amber-900 bg-amber-50/50 rounded-t-lg'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart2 size={16} /> Dashboard & Valorización
          </button>

          <button
            onClick={() => setActiveTab('stock')}
            className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap relative ${
              activeTab === 'stock'
                ? 'border-amber-700 text-amber-900 bg-amber-50/50 rounded-t-lg'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Package size={16} /> Stock de Productos
            {(counts.low > 0 || counts.out > 0) && (
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('physical_count')}
            className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'physical_count'
                ? 'border-amber-700 text-amber-900 bg-amber-50/50 rounded-t-lg'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ClipboardList size={16} /> Conteos Físicos & Auditoría
          </button>

          <button
            onClick={() => setActiveTab('movements')}
            className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'movements'
                ? 'border-amber-700 text-amber-900 bg-amber-50/50 rounded-t-lg'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History size={16} /> Historial de Movimientos
          </button>
        </nav>
      </div>

      {/* PESTAÑA 1: DASHBOARD & VALORIZACIÓN */}
      {activeTab === 'dashboard' && (
        <InventoryDashboard
          products={products}
          onSelectFilter={(filter) => {
            setStockFilter(filter)
            setActiveTab('stock')
          }}
          onOpenRestockModal={() => setShowRestockModal(true)}
        />
      )}

      {/* PESTAÑA 2: CONTROL DE STOCK & FILTROS */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          {/* Barra de Filtros Rápido y Búsqueda */}
          <div
            className="p-4 rounded-xl border space-y-4"
            style={{ background: '#fff', borderColor: 'var(--border)' }}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Pills de Estado de Stock */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setStockFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    stockFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todos ({counts.total})
                </button>

                <button
                  onClick={() => setStockFilter('low')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    stockFilter === 'low'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  <AlertTriangle size={13} /> Stock Bajo ({counts.low})
                </button>

                <button
                  onClick={() => setStockFilter('out')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    stockFilter === 'out'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  <XCircle size={13} /> Agotados ({counts.out})
                </button>

                <button
                  onClick={() => setStockFilter('normal')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    stockFilter === 'normal'
                      ? 'bg-green-700 text-white shadow-xs'
                      : 'bg-green-50 text-green-800 hover:bg-green-100 border border-green-200'
                  }`}
                >
                  <CheckCircle2 size={13} /> Normal ({counts.normal})
                </button>
              </div>

              {/* Filtro por Tipo de Producto */}
              {productTypes.length > 0 && (
                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-muted-foreground hidden sm:block" />
                  <select
                    value={selectedTypeFilter}
                    onChange={(e) => setSelectedTypeFilter(e.target.value)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border outline-none bg-slate-50 text-slate-800"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <option value="">Todas las categorías</option>
                    {productTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Campo Búsqueda */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Buscar producto por nombre o código SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border text-xs outline-none bg-slate-50 focus:bg-white transition-colors"
                style={{ borderColor: 'var(--border)' }}
              />
            </div>
          </div>

          {/* Tabla de Productos e Inventario */}
          <div
            className="rounded-xl border"
            style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}
          >
            <div
              className="px-5 py-3.5 border-b font-semibold flex items-center justify-between text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              <span>Mostrando {filteredProducts.length} de {products.length} productos</span>
            </div>

            <div className="table-wrap">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Producto / SKU</th>
                    <th className="hidden sm:table-cell">Presentación</th>
                    <th className="hidden md:table-cell">Categoría</th>
                    <th>Nivel de Stock</th>
                    <th className="text-right hidden lg:table-cell">Valor Costo</th>
                    <th className="text-right hidden lg:table-cell">Valor Venta</th>
                    <th>Estado</th>
                    {canWrite && <th className="text-center">Acción</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const low = p.stock <= p.min_stock
                    const out = p.stock === 0
                    const valCost = p.stock * Number(p.cost_price || 0)
                    const valSale = p.stock * Number(p.precio1 || 0)

                    return (
                      <tr key={p.id}>
                        <td className="font-medium">
                          <div style={{ color: 'var(--foreground)' }}>{p.name}</div>
                          {p.sku && (
                            <div className="text-[11px] text-muted-foreground">SKU: {p.sku}</div>
                          )}
                        </td>
                        <td className="hidden sm:table-cell">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: 'var(--secondary)', color: 'var(--primary)' }}
                          >
                            {p.presentation?.nombre}
                          </span>
                        </td>
                        <td
                          className="capitalize hidden md:table-cell text-xs"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          {p.tipo?.nombre}
                        </td>

                        {/* Stock con Barra Visual */}
                        <td>
                          <StockBar stock={p.stock} minStock={p.min_stock} />
                        </td>

                        {/* Valorizaciones */}
                        <td className="text-right font-mono text-xs hidden lg:table-cell text-slate-700">
                          {formatCOP(valCost)}
                        </td>
                        <td className="text-right font-mono text-xs hidden lg:table-cell text-slate-900 font-semibold">
                          {formatCOP(valSale)}
                        </td>

                        {/* Estado Badge */}
                        <td>
                          <span
                            className="text-xs px-2.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"
                            style={{
                              background: out ? '#fee2e2' : low ? '#fef3c7' : '#dcfce7',
                              color: out ? '#dc2626' : low ? '#d97706' : '#16a34a',
                            }}
                          >
                            {out ? 'Agotado' : low ? 'Stock bajo' : 'Normal'}
                          </span>
                        </td>

                        {/* Acción rápida de Ajuste */}
                        {canWrite && (
                          <td className="text-center">
                            <button
                              onClick={() => handleOpenAdjustmentForProduct(p, 'ajuste')}
                              className="px-2.5 py-1 rounded-lg border text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors inline-flex items-center gap-1"
                              title="Ajustar stock de este producto"
                            >
                              <Edit size={13} /> Ajustar
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filteredProducts.length === 0 && (
              <EmptyState
                icon={Warehouse}
                title="No se encontraron productos"
                description="Intenta cambiar los términos de búsqueda o los filtros seleccionados."
              />
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 3: CONTEOS FÍSICOS & AUDITORÍA */}
      {activeTab === 'physical_count' && (
        <PhysicalCountView
          products={products}
          canWrite={canWrite}
          onSuccessReconciliation={refreshInventoryData}
        />
      )}

      {/* PESTAÑA 4: HISTORIAL DE MOVIMIENTOS */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          {/* Filtros de Historial */}
          <div
            className="p-4 rounded-xl border flex items-center justify-between gap-3"
            style={{ background: '#fff', borderColor: 'var(--border)' }}
          >
            <div className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
              Filtrar por tipo de movimiento:
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setMovementTypeFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${
                  movementTypeFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos
              </button>
              {MOVEMENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setMovementTypeFilter(t.value)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize ${
                    movementTypeFilter === t.value
                      ? 'bg-amber-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}s
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-xl border"
            style={{ background: '#fff', borderColor: 'var(--border)', overflow: 'hidden' }}
          >
            <div
              className="px-5 py-4 border-b font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              Registro Histórico de Movimientos
            </div>

            <div className="table-wrap">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th className="hidden sm:table-cell">Fecha</th>
                    <th>Producto</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th className="hidden sm:table-cell">Stock anterior</th>
                    <th className="hidden sm:table-cell">Stock nuevo</th>
                    <th>Motivo / Razón</th>
                    <th className="hidden md:table-cell">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((m) => {
                    const mt = MOVEMENT_TYPES.find((t) => t.value === m.type)
                    return (
                      <tr key={m.id}>
                        <td
                          className="text-xs hidden sm:table-cell"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          {formatDateTime(m.created_at)}
                        </td>
                        <td style={{ color: 'var(--foreground)' }}>
                          {(m as any).product?.name ?? '—'}
                        </td>
                        <td>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                            style={{ background: mt?.color + '20', color: mt?.color }}
                          >
                            {mt?.label}
                          </span>
                        </td>
                        <td className="font-bold" style={{ color: mt?.color }}>
                          {m.quantity > 0 ? '+' : ''}
                          {m.quantity}
                        </td>
                        <td
                          className="hidden sm:table-cell text-xs"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          {m.previous_stock}
                        </td>
                        <td
                          className="font-semibold hidden sm:table-cell text-xs"
                          style={{ color: 'var(--foreground)' }}
                        >
                          {m.new_stock}
                        </td>
                        <td className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                          {m.reason ?? '—'}
                        </td>
                        <td
                          className="hidden md:table-cell text-xs"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          {(m as any).creator?.full_name ?? 'Sistema'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filteredMovements.length === 0 && (
              <EmptyState
                icon={Warehouse}
                title="Sin movimientos registrados"
                description="Las entradas, salidas y ajustes de stock quedarán registrados aquí."
              />
            )}
          </div>
        </div>
      )}

      {/* MODAL DE REGISTRO / AJUSTE MANUAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '28rem' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--foreground)' }}>
              Registrar Movimiento / Ajuste
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <Field label="Producto *">
                <select
                  required
                  value={form.product_id}
                  onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Seleccionar producto...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock actual: {p.stock})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tipo de movimiento">
                <div className="grid grid-cols-3 gap-2">
                  {MOVEMENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                      className="py-2 rounded-lg text-xs font-bold border transition-all"
                      style={{
                        borderColor: form.type === t.value ? t.color : 'var(--border)',
                        background: form.type === t.value ? t.color + '15' : 'transparent',
                        color: form.type === t.value ? t.color : 'var(--muted-foreground)',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={form.type === 'ajuste' ? 'Nuevo Stock Total Absoluto *' : 'Cantidad *'}>
                <input
                  type="number"
                  required
                  min="0"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="input-field font-bold"
                  placeholder="0"
                />
                {selectedProduct && (
                  <div className="text-xs mt-1.5 p-2 rounded bg-slate-50 border border-slate-200">
                    <div>
                      Stock actual en sistema: <strong>{selectedProduct.stock}</strong>
                    </div>
                    {form.quantity !== '' && (
                      <div className="text-amber-800 font-semibold mt-0.5">
                        ➔ Nuevo Stock resultante:{' '}
                        {form.type === 'entrada'
                          ? selectedProduct.stock + Number(form.quantity)
                          : form.type === 'salida'
                          ? selectedProduct.stock - Number(form.quantity)
                          : Number(form.quantity)}
                      </div>
                    )}
                  </div>
                )}
              </Field>

              <Field label="Causa / Motivo del ajuste">
                <select
                  value={form.reasonSelect}
                  onChange={(e) => setForm((f) => ({ ...f, reasonSelect: e.target.value }))}
                  className="input-field mb-2 text-xs"
                >
                  {PREDEFINED_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {form.reasonSelect === 'Otro (especificar)' && (
                  <input
                    type="text"
                    required
                    placeholder="Detalla el motivo del movimiento..."
                    value={form.customReason}
                    onChange={(e) => setForm((f) => ({ ...f, customReason: e.target.value }))}
                    className="input-field text-xs"
                  />
                )}
              </Field>

              {error && (
                <p
                  className="text-xs p-3 rounded-lg border font-medium"
                  style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}
                >
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary flex-1 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary flex-1 text-xs shadow-sm"
                >
                  {saving ? 'Guardando...' : 'Guardar Ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE REPORTE DE REABASTECIMIENTO */}
      {showRestockModal && (
        <RestockReportModal products={products} onClose={() => setShowRestockModal(false)} />
      )}

      <style>{`.input-field { width:100%; border-radius:0.5rem; border:1px solid var(--border); padding:0.5rem 0.75rem; font-size:0.875rem; background:var(--background); outline:none; }`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block text-xs font-semibold mb-1.5"
        style={{ color: 'var(--foreground)' }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}
