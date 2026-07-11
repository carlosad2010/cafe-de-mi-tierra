import { createClient } from '@/lib/supabase/server'
import { ProductsClient } from './ProductsClient'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const supabase = await createClient()
  const [{ data: products }, { data: presentations }] = await Promise.all([
    supabase
      .from('products')
      .select('*, presentation:presentations(id, nombre, activa, orden)')
      .order('name'),
    supabase
      .from('presentations')
      .select('*')
      .eq('activa', true)
      .order('orden'),
  ])

  const sorted = (products ?? []).sort((a: any, b: any) =>
    (a.presentation?.orden ?? 99) - (b.presentation?.orden ?? 99) || a.type.localeCompare(b.type)
  )

  return <ProductsClient initialProducts={sorted} presentations={presentations ?? []} />
}
