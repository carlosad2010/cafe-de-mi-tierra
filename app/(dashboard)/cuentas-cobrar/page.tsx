import { createClient } from '@/lib/supabase/server'
import { CuentasCobrarClient } from './CuentasCobrarClient'
import { Caja, CuentaCobrar, Customer, MetodoPago, Product } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function CuentasCobrarPage() {
  const supabase = await createClient()

  const [{ data: cuentas, error: cuentasErr }, { data: customers }, { data: products }, { data: cajas }, { data: metodos }] =
    await Promise.all([
      supabase
        .from('cuentas_cobrar')
        // `seller:profiles` a secas es ambiguo: esta tabla tiene DOS llaves
        // foráneas hacia profiles (seller_id y created_by), así que hay que
        // nombrar la constraint o PostgREST responde PGRST201 y no trae nada.
        .select('*, customer:customers(full_name, phone, email), seller:profiles!cuentas_cobrar_seller_id_fkey(full_name), order:orders(order_number), items:cuentas_cobrar_items(*)')
        .order('fecha_entrega', { ascending: false })
        .limit(200),
      supabase
        .from('customers')
        .select('*')
        .eq('active', true)
        .order('full_name'),
      supabase
        .from('products')
        .select('*, presentation:presentations(nombre), tipo:tipos_producto(nombre)')
        .eq('active', true)
        .order('name'),
      supabase
        .from('cajas')
        .select('id, nombre, tipo')
        .eq('activa', true)
        .order('created_at', { ascending: true }),
      supabase
        .from('metodos_pago')
        .select('*')
        .eq('activo', true)
        .order('orden'),
    ])

  // Sin esto, un fallo de la consulta se vuelve `data: null` y la página
  // muestra "no hay cuentas" —indistinguible de estar realmente vacía—.
  if (cuentasErr) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>Cuentas x Cobrar</h1>
        <p className="text-sm p-4 rounded-xl" style={{ background: '#fef2f2', color: '#dc2626' }}>
          No se pudieron cargar las cuentas: {cuentasErr.message}
        </p>
      </div>
    )
  }

  return (
    <CuentasCobrarClient
      cuentas={(cuentas ?? []) as CuentaCobrar[]}
      customers={(customers ?? []) as Customer[]}
      products={(products ?? []) as Product[]}
      cajas={(cajas ?? []) as Pick<Caja, 'id' | 'nombre' | 'tipo'>[]}
      metodosPago={(metodos ?? []) as MetodoPago[]}
    />
  )
}
