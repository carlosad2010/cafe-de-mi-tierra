import { createClient } from '@/lib/supabase/server'
import { ProductsClient } from './ProductsClient'

export default async function ProductsPage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('presentation')
    .order('type')

  return <ProductsClient initialProducts={products ?? []} />
}
