import { createClient } from '@/lib/supabase/server'
import { CuentasCobrarClient } from './CuentasCobrarClient'
import { Caja, CuentaCobrar, Customer, MetodoPago, Product } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function CuentasCobrarPage() {
  const supabase = await createClient()

  const [{ data: cuentas }, { data: customers }, { data: products }, { data: cajas }, { data: metodos }] =
    await Promise.all([
      supabase
        .from('cuentas_cobrar')
        .select('*, customer:customers(full_name, phone, email), seller:profiles(full_name), order:orders(order_number), items:cuentas_cobrar_items(*)')
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
