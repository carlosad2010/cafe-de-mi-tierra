import { createClient } from '@/lib/supabase/server'
import { ProductsClient } from './ProductsClient'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const supabase = await createClient()
  const [{ data: products }, { data: presentations }, { data: tiposProducto }] = await Promise.all([
    supabase
      .from('products')
      .select('*, presentation:presentations(id, nombre, activa, orden), tipo:tipos_producto(id, nombre, activo, orden)')
      .order('name'),
    supabase.from('presentations').select('*').eq('activa', true).order('orden'),
    supabase.from('tipos_producto').select('*').eq('activo', true).order('orden'),
  ])

  const sorted = (products ?? []).sort((a: any, b: any) =>
    (a.presentation?.orden ?? 99) - (b.presentation?.orden ?? 99) || (a.tipo?.orden ?? 99) - (b.tipo?.orden ?? 99)
  )

  return <ProductsClient initialProducts={sorted} presentations={presentations ?? []} tiposProducto={tiposProducto ?? []} />
}
