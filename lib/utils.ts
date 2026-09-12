import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

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
