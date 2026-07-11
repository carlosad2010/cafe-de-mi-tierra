import { createClient } from '@/lib/supabase/server'
import { ComprasClient } from './ComprasClient'
import { Caja, Compra } from '@/lib/types'

export default async function ComprasPage() {
  const supabase = await createClient()

  const [{ data: compras }, { data: cajas }] = await Promise.all([
    supabase
      .from('compras')
      .select('*, caja:cajas(nombre, tipo), creator:profiles(full_name)')
      .order('fecha', { ascending: false })
      .limit(200),
    supabase
      .from('cajas')
      .select('id, nombre, tipo')
      .eq('activa', true)
      .order('created_at', { ascending: true }),
  ])

  return (
    <ComprasClient
      compras={(compras ?? []) as Compra[]}
      cajas={(cajas ?? []) as Pick<Caja, 'id' | 'nombre' | 'tipo'>[]}
    />
  )
}
