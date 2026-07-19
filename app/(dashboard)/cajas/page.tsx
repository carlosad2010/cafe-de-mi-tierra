import { createClient } from '@/lib/supabase/server'
import { CajasClient } from './CajasClient'
import { Caja, MovimientoCaja } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function CajasPage() {
  const supabase = await createClient()

  const [{ data: rawCajas }, { data: movimientos }, { data: metodosPago }] = await Promise.all([
    supabase
      .from('cajas')
      .select('*, movimientos:movimientos_caja(tipo, monto), metodo_pago:metodos_pago(id, nombre, tipo)')
      .order('created_at', { ascending: true }),
    supabase
      .from('movimientos_caja')
      .select('*, caja:cajas(nombre, tipo), orden:orders(customer:customers(full_name))')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('metodos_pago')
      .select('*')
      .eq('activo', true)
      .order('orden'),
  ])

  const cajas: (Caja & { saldo_actual: number })[] = (rawCajas ?? []).map((c: any) => ({
    ...c,
    saldo_actual:
      c.saldo_inicial +
      (c.movimientos as { tipo: string; monto: number }[]).reduce(
        (acc, m) => (m.tipo === 'ingreso' ? acc + m.monto : acc - m.monto),
        0
      ),
    movimientos: undefined,
  }))

  return (
    <CajasClient
      cajas={cajas}
      movimientos={(movimientos ?? []) as any}
      metodosPago={(metodosPago ?? []) as any}
    />
  )
}
