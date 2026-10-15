import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generarCuentaCobroPDF } from '@/lib/pdf/cuentaCobro'
import type { CuentaCobro } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Regenera el PDF a partir de una cuenta de cobro ya emitida (congelada en
 * la BD) y lo entrega como descarga. Es puro: no inserta ni modifica nada —
 * la emisión real pasa por POST /api/cuenta-cobro. Se puede volver a
 * descargar tantas veces como haga falta sin gastar un número nuevo.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: cc } = await supabase.from('cuentas_cobro').select('*').eq('id', id).single()
  if (!cc) return NextResponse.json({ error: 'Cuenta de cobro no encontrada' }, { status: 404 })

  const pdfBuffer = await generarCuentaCobroPDF(cc as CuentaCobro)
  const filename = `Cuenta_de_cobro_${String(cc.numero).padStart(3, '0')}.pdf`

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
