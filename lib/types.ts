export type Role = 'admin' | 'seller'

export type Profile = {
  id: string
  email: string
  full_name: string
  role: Role
  active: boolean
  created_at: string
  updated_at: string
}

export type Presentation = {
  id: string
  nombre: string
  activa: boolean
  orden: number
  created_at: string
}

export type CoffeeType = 'grano' | 'molido'

export type Product = {
  id: string
  name: string
  description: string | null
  presentation_id: string
  presentation?: Presentation
  type: CoffeeType
  cost_price: number
  sale_price: number
  stock: number
  min_stock: number
  active: boolean
  sku: string | null
  created_at: string
  updated_at: string
}

export type DocumentType = 'CC' | 'NIT' | 'CE' | 'PPN' | 'otro'

export type Customer = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  document_type: DocumentType | null
  document_number: string | null
  address: string | null
  city: string | null
  contacto: string | null
  telefono_contacto: string | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type OrderStatus = 'pendiente' | 'completado' | 'cancelado'
export type PaymentMethod = 'efectivo' | 'transferencia' | 'tarjeta' | 'nequi' | 'daviplata' | 'otro'

export type Order = {
  id: string
  order_number: number
  customer_id: string | null
  seller_id: string | null
  status: OrderStatus
  payment_method: PaymentMethod
  subtotal: number
  discount: number
  total: number
  notes: string | null
  pdf_url: string | null
  email_sent: boolean
  created_at: string
  updated_at: string
  customer?: Customer
  seller?: Profile
  items?: OrderItem[]
}

export type OrderItem = {
  id: string
  order_id: string
  product_id: string
  product_name: string
  product_presentation: string
  product_type: string
  quantity: number
  unit_price: number
  cost_price: number
  subtotal: number
  created_at: string
  product?: Product
}

export type InventoryMovementType = 'entrada' | 'salida' | 'ajuste'

export type InventoryMovement = {
  id: string
  product_id: string
  type: InventoryMovementType
  quantity: number
  previous_stock: number
  new_stock: number
  reason: string | null
  reference_id: string | null
  reference_type: string | null
  created_by: string | null
  created_at: string
  product?: Product
  creator?: Profile
}

export type DashboardStats = {
  today_revenue: number
  today_orders: number
  month_revenue: number
  month_orders: number
  month_profit: number
  low_stock_count: number
  total_customers: number
}

export type CajaTipo = 'efectivo' | 'bancaria'
export type MovimientoTipo = 'ingreso' | 'egreso'

export type Caja = {
  id: string
  nombre: string
  tipo: CajaTipo
  saldo_inicial: number
  activa: boolean
  created_at: string
  updated_at: string
  saldo_actual?: number
}

export type MovimientoCaja = {
  id: string
  caja_id: string
  tipo: MovimientoTipo
  concepto: string
  monto: number
  referencia: string | null
  fecha: string
  orden_id: string | null
  created_by: string | null
  created_at: string
  caja?: Pick<Caja, 'nombre' | 'tipo'>
}

export type TipoGasto = 'compra' | 'gasto'

export type Compra = {
  id: string
  concepto: string
  proveedor: string | null
  tipo: TipoGasto
  monto: number
  caja_id: string
  movimiento_id: string | null
  fecha: string
  notas: string | null
  created_by: string | null
  created_at: string
  caja?: Pick<Caja, 'nombre' | 'tipo'>
  creator?: Pick<Profile, 'full_name'>
}
