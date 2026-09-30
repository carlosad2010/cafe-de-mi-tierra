# Café de mi Tierra — Panel Administrativo

Sistema administrativo interno para la gestión operativa y financiera de Café de
mi Tierra: ventas, facturación, inventario, cuentas por cobrar, comisiones de
vendedores e informes gerenciales.

> Sistema en producción con datos reales. Los cambios de esquema en Supabase se
> ejecutan manualmente y con cuidado — ver [Base de datos](#base-de-datos).

## Stack

- **[Next.js 16](https://nextjs.org)** (App Router) + React 19 + TypeScript
- **[Supabase](https://supabase.com)** — Postgres, Auth y RLS como backend
- **Tailwind CSS 4**
- **Recharts** para gráficos, **ExcelJS** para informes descargables, **Resend** para envío de facturas por correo

## Requisitos previos

- Node.js 20+
- Un proyecto de Supabase (URL, anon key y service role key)

## Puesta en marcha

```bash
npm install
cp .env.local.example .env.local   # completar con las credenciales de Supabase/Resend
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

### Variables de entorno

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente público (respeta RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo server-side; usada en rutas API que necesitan bypass de RLS |
| `RESEND_API_KEY` | Envío de facturas por correo |
| `NEXT_PUBLIC_APP_URL` | Base URL de la app (links en correos, callbacks de auth) |

## Módulos

Todo el panel vive bajo `app/(dashboard)/`, protegido por sesión de Supabase Auth:

| Módulo | Descripción |
|---|---|
| `dashboard` | Vista general del negocio |
| `pedidos` | Registro y consulta de pedidos, con filtro por rango de fechas |
| `facturas` | Facturación y envío por correo (Resend) |
| `clientes` | Gestión de clientes |
| `productos` | Catálogo de productos |
| `inventario` | Movimientos de stock |
| `compras` | Registro de compras a proveedores |
| `cajas` | Control de caja y movimientos |
| `cuentas-cobrar` | Cartera de clientes, pagos parciales |
| `comisiones` | Liquidación de comisiones de vendedores (ver detalle abajo) |
| `informes` | Reportes con rango de fechas personalizado y desempeño por vendedor |
| `configuracion` | Administración de catálogos (presentaciones, tipos de producto, tarifas) |
| `usuarios` | Gestión de usuarios y roles |

### Roles

`profiles.role` es uno de: `admin`, `seller`, `consulta`. El rol `consulta` es de
solo lectura (ver `lib/perfil-context.tsx`); las políticas RLS en Supabase son la
fuente de verdad de los permisos, no el cliente.

### Comisiones de venta

Modelo clave del sistema, documentado aquí porque no es obvio desde el código:

- La comisión es un **valor fijo en COP por bolsa vendida**, definido por
  **presentación** (no por producto ni por porcentaje).
- `presentations.comision` guarda la **tarifa vigente**, editable en
  *Configuración › Presentaciones*.
- `order_items.comision_unitaria` guarda la comisión **congelada al momento de
  la venta** — un trigger en Postgres (`supabase/comisiones_trigger_congelar.sql`)
  la copia desde `presentations` en cada `INSERT`.
- Los informes y liquidaciones siempre usan el valor congelado, nunca la tarifa
  vigente. Esto es intencional: cambiar una tarifa hoy no debe alterar una
  liquidación de un mes ya pagado.
- `NULL` y `0` significan cosas distintas: `NULL` es "sin tarifa definida" (se
  reporta como advertencia y liquida en $0 sin estimar nada); `0` es "definida,
  no paga comisión".
- El informe mensual se genera en Excel (`app/api/comisiones/route.ts`) con
  hoja de detalle, resumen por vendedor y tarifas vigentes.

## Base de datos

El esquema completo y las migraciones incrementales viven en `supabase/`:

- `schema.sql` — esquema base (tablas, RLS, funciones)
- El resto son migraciones puntuales aplicadas manualmente en el SQL Editor de
  Supabase, en orden cronológico según su nombre/commit.

No hay un runner de migraciones automatizado: cada script se revisa y se
ejecuta a mano contra la base de producción.

## Scripts

```bash
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm run start    # servidor de producción
npm run lint     # eslint
```

## Despliegue

Optimizado para [Vercel](https://vercel.com), pero cualquier plataforma con
soporte para Next.js 16 funciona. Recordar configurar las mismas variables de
entorno en el entorno de despliegue.
