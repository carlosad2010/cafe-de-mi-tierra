import type { Metadata } from 'next'
import { Inter, Outfit } from 'next/font/google'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Café de mi Tierra — Sistema de Gestión',
  description: 'Sistema integral de gestión comercial, ventas e inventario para Café de mi Tierra. Control de pedidos, clientes, productos y finanzas en tiempo real.',
  keywords: ['café', 'gestión', 'ventas', 'inventario', 'Colombia'],
  icons: { icon: '/logo.png' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${inter.variable} ${outfit.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
