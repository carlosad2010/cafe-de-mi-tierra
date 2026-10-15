import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { NumerosALetras } from 'numero-a-letras'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function calcMargin(salePrice: number, costPrice: number): number {
  if (salePrice === 0) return 0
  return ((salePrice - costPrice) / salePrice) * 100
}

export function calcProfit(salePrice: number, costPrice: number): number {
  return salePrice - costPrice
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

/**
 * "23 de septiembre de 2026" — para documentos formales (cuentas de cobro).
 *
 * `fecha_emision` en la BD es columna `date` (sin hora), así que llega como
 * "2026-10-15" a secas. `new Date("2026-10-15")` la interpreta como
 * medianoche UTC (así lo define el estándar ECMAScript para fechas sin
 * hora) — y como Colombia es UTC-5, al formatear en hora local esa
 * medianoche UTC cae en las 7pm del día ANTERIOR: se veía "14 de octubre"
 * en vez de "15". Agregar 'T00:00:00' (sin 'Z') hace que se interprete como
 * medianoche LOCAL, no UTC, y el día nunca se corre.
 */
export function formatDateLarga(date: string | Date): string {
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00`)
    : new Date(date)
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(d)
}

/**
 * "Ciento setenta y siete mil pesos" — numero-a-letras solo soporta pesos
 * mexicanos con sufijo de centavos ("00/100 M.N."); se descarta esa parte
 * porque acá se cobra en pesos enteros y el formato local no la usa.
 */
export function montoEnLetras(monto: number): string {
  const texto = NumerosALetras(Math.round(monto))
    .replace(/\s+\d{2}\/100\s*M\.N\.$/i, '')
    .trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase()
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

/**
 * Escapa texto para insertarlo en HTML armado como string (plantillas de
 * factura y de correo). Sin esto, un nombre de cliente con `<script>` o un
 * atributo `onerror=` se ejecutaría al imprimirse o al abrirse el correo.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function getWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, '')
  const number = cleaned.startsWith('57') ? cleaned : `57${cleaned}`
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

/**
 * Cuenta para pagos por transferencia. Se muestra al final de la factura en
 * PDF y del mensaje de WhatsApp; cámbiala aquí si el negocio cambia de banco.
 */
export const CUENTA_PAGO = {
  banco: 'Bancolombia',
  tipo: 'Ahorros',
  numero: '33487159404',
}

export const PAYMENT_METHODS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  otro: 'Otro',
}

export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  completado: { label: 'Completado', color: 'bg-green-100 text-green-800' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
}
