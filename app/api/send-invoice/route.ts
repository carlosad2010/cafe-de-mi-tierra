import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { formatCOP, formatDate, PAYMENT_METHODS } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { orderId } = await req.json()

  const { data: order } = await supabase
    .from('orders')
    .select('*, customer:customers(full_name, email, phone, city), items:order_items(*)')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const customer = (order as any).customer
  if (!customer?.email) return NextResponse.json({ error: 'Cliente sin correo' }, { status: 400 })

  const items = ((order as any).items ?? [])
    .map((i: any) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f5e8d8;">${i.product_name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f5e8d8;text-align:right;">${formatCOP(i.unit_price)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f5e8d8;text-align:center;">${i.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f5e8d8;text-align:right;font-weight:600;">${formatCOP(i.subtotal)}</td>
    </tr>`).join('')

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#fdf8f3;padding:24px;border-radius:16px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#8b5e3c;font-size:22px;margin:0;">Café de mi Tierra</h1>
        <p style="color:#6b4423;margin:4px 0 0;">Pedido #${order.order_number}</p>
      </div>
      <p style="color:#2c1810;">Hola <strong>${customer.full_name}</strong>,</p>
      <p style="color:#6b4423;">Gracias por tu compra. Aquí está el detalle de tu pedido del ${formatDate(order.created_at)}:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff;border-radius:12px;overflow:hidden;">
        <thead>
          <tr style="background:#8b5e3c;color:#fdf8f3;">
            <th style="padding:10px 12px;text-align:left;">Producto</th>
            <th style="padding:10px 12px;text-align:right;">Precio</th>
            <th style="padding:10px 12px;text-align:center;">Cant.</th>
            <th style="padding:10px 12px;text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${items}</tbody>
      </table>
      ${order.discount > 0 ? `<p style="text-align:right;color:#6b4423;margin:4px 0;">Descuento: -${formatCOP(order.discount)}</p>` : ''}
      <p style="text-align:right;font-size:18px;font-weight:bold;color:#8b5e3c;margin:8px 0;">Total: ${formatCOP(order.total)}</p>
      <p style="color:#6b4423;">Método de pago: <strong>${PAYMENT_METHODS[order.payment_method]}</strong></p>
      <p style="text-align:center;color:#8b5e3c;margin-top:24px;">☕ ¡Gracias por elegir Café de mi Tierra!</p>
    </div>
  `

  const { error } = await resend.emails.send({
    from: 'Café de mi Tierra <onboarding@resend.dev>',
    to: customer.email,
    subject: `Pedido #${order.order_number} — Café de mi Tierra`,
    html,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('orders').update({ email_sent: true }).eq('id', orderId)

  return NextResponse.json({ success: true })
}
