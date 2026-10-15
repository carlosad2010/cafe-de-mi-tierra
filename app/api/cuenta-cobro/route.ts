import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { CuentaCobro } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// El envío por correo está en pausa (ver app/api/send-invoice/route.ts): el
// remitente sandbox de Resend solo entrega al dueño de la cuenta, nunca a un
// cliente real, y acá no hay dominio propio verificado todavía. Mientras
// tanto, la cuenta de cobro se genera y se descarga directo — no se manda.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Emitir una cuenta de cobro consume un número correlativo, documento
  // legal — mismo criterio de permisos que cualquier otra escritura.
  const { data: profile } = await supabase
    .from('profiles').select('role, active').eq('id', user.id).single()
  if (profile?.role === 'consulta' || profile?.active === false) {
    return NextResponse.json(
      { error: 'Tu usuario es de solo consulta: no puede emitir cuentas de cobro' },
      { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 })
  }
  const orderId = (body as { orderId?: unknown })?.orderId
  if (typeof orderId !== 'string' || !UUID_RE.test(orderId)) {
    return NextResponse.json({ error: 'orderId inválido' }, { status: 400 })
  }

  // Idempotente a propósito: un segundo clic nunca debe gastar un número
  // nuevo, solo devolver la misma que ya se emitió para descargarla de nuevo.
  const { data: existente } = await supabase
    .from('cuentas_cobro').select('*').eq('order_id', orderId).maybeSingle()

  if (existente) {
    return NextResponse.json({ success: true, reutilizada: true, cuentaCobro: existente })
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, total, customer:customers(id, full_name, document_type, document_number, address, city)')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  if (order.status !== 'completado') {
    return NextResponse.json({ error: 'Solo se puede emitir una cuenta de cobro para un pedido completado' }, { status: 400 })
  }

  const customer = (order as any).customer
  if (!customer) return NextResponse.json({ error: 'El pedido no tiene cliente asociado' }, { status: 400 })
  if (customer.document_type !== 'NIT' || !customer.document_number) {
    return NextResponse.json({ error: 'El cliente debe tener NIT registrado para emitir una cuenta de cobro' }, { status: 400 })
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, quantity, unit_price, subtotal')
    .eq('order_id', orderId)

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'El pedido no tiene productos' }, { status: 400 })
  }

  const { data: config } = await supabase.from('configuracion').select('*').single()
  if (!config?.ciudad || !config?.representante_legal_nombre || !config?.representante_legal_documento) {
    return NextResponse.json(
      { error: 'Falta completar Ciudad y Representante legal en Configuración › Negocio antes de emitir cuentas de cobro' },
      { status: 400 })
  }

  const objeto = Array.from(new Set(items.map(i => i.product_name))).join(', ')

  const { data: inserted, error: insertError } = await supabase
    .from('cuentas_cobro')
    .insert({
      order_id: orderId,
      customer_id: customer.id,
      cliente_nombre: customer.full_name,
      cliente_nit: customer.document_number,
      cliente_direccion: customer.address,
      cliente_ciudad: customer.city,
      objeto,
      monto: order.total,
      items,
      ciudad_emision: config.ciudad,
      representante_nombre: config.representante_legal_nombre,
      representante_documento: config.representante_legal_documento,
      representante_firma_url: config.representante_legal_firma_url,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'No se pudo crear la cuenta de cobro' }, { status: 500 })
  }

  return NextResponse.json({ success: true, reutilizada: false, cuentaCobro: inserted as CuentaCobro })
}
