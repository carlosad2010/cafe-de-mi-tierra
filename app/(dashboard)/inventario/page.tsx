import { createClient } from '@/lib/supabase/server'
import { InventoryClient } from './InventoryClient'

export default async function InventoryPage() {
  const supabase = await createClient()

  const [{ data: products }, { data: movements }] = await Promise.all([
    supabase
      .from('products')
      .select('*, presentation:presentations(id, nombre, activa, orden), tipo:tipos_producto(id, nombre, activo, orden)')
      .eq('active', true)
      .order('name'),
    supabase
      .from('inventory_movements')
      .select('*, product:products(name, presentation:presentations(nombre), tipo:tipos_producto(nombre)), creator:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return <InventoryClient initialProducts={products ?? []} initialMovements={movements ?? []} />
}
