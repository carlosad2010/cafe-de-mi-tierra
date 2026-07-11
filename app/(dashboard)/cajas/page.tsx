import { createClient } from '@/lib/supabase/server'
import { CajasClient } from './CajasClient'
import { Caja, MovimientoCaja } from '@/lib/types'

export default async function CajasPage() {
  const supabase = await createClient()

  const { data: rawCajas } = await supabase
    .from('cajas')
    .select('*, movimientos:movimientos_caja(tipo, monto)')
    .order('created_at', { ascending: true })

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

  const { data: movimientos } = await supabase
    .from('movimientos_caja')
    .select('*, caja:cajas(nombre, tipo)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <CajasClient
      cajas={cajas}
      movimientos={(movimientos ?? []) as (MovimientoCaja & { caja: Pick<Caja, 'nombre' | 'tipo'> })[]}
    />
  )
}
