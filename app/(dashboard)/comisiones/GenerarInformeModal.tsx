'use client'

import { useEffect, useRef, useState } from 'react'
import { formatCOP } from '@/lib/utils'
import { useEscKey } from '@/lib/hooks/useEscKey'
import { X, Send, FileSpreadsheet, Loader2, AlertTriangle } from 'lucide-react'

type Mensaje = { de: 'bot' | 'yo'; texto: string; alerta?: boolean }
type Paso = 'periodo' | 'custom' | 'generando' | 'listo'

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mesActual() {
  const hoy = new Date()
  return {
    desde: ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: ymd(hoy),
  }
}

function mesAnterior() {
  const hoy = new Date()
  return {
    desde: ymd(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
    hasta: ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
  }
}

function etiquetaRango(desde: string, hasta: string) {
  return `${desde} a ${hasta}`
}

export function GenerarInformeModal({ onClose }: { onClose: () => void }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { de: 'bot', texto: '¿Qué período deseas liquidar?' },
  ])
  const [paso, setPaso] = useState<Paso>('periodo')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const finRef = useRef<HTMLDivElement>(null)

  useEscKey(() => { if (paso !== 'generando') onClose() })

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, paso])

  function di(texto: string, de: Mensaje['de'] = 'bot', alerta = false) {
    setMensajes(m => [...m, { de, texto, alerta }])
  }

  async function generar(d: string, h: string, etiqueta: string) {
    di(etiqueta, 'yo')
    setPaso('generando')
    di('Consultando las ventas completadas y aplicando la tabla de tarifas…')

    try {
      const res = await fetch('/api/comisiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde: d, hasta: h }),
      })

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error inesperado' }))
        di(error ?? 'No se pudo generar el informe.', 'bot', true)
        setPaso('periodo')
        return
      }

      const total    = Number(res.headers.get('X-Total-Comision') ?? 0)
      const lineas   = Number(res.headers.get('X-Total-Lineas') ?? 0)
      const sinTarifa = decodeURIComponent(res.headers.get('X-Sin-Tarifa') ?? '')
        .split('|').filter(Boolean)

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `Informe_Comisiones_Ventas_${d}_a_${h}.xlsx`
      a.click()
      URL.revokeObjectURL(url)

      if (lineas === 0) {
        di('No hay ventas completadas en ese período. El archivo se descargó vacío.', 'bot', true)
      } else {
        di(`Listo. ${lineas} líneas de venta · comisión total a pagar: ${formatCOP(total)}. El archivo ya se descargó.`)
      }
      if (sinTarifa.length > 0) {
        di(`Ojo: ${sinTarifa.join(', ')} no tiene tarifa definida. Esas líneas quedaron en $0 y están resaltadas en la hoja Detalle.`, 'bot', true)
      }
      setPaso('listo')
    } catch {
      di('Falló la conexión con el servidor. Intenta de nuevo.', 'bot', true)
      setPaso('periodo')
    }
  }

  function reiniciar() {
    setDesde(''); setHasta('')
    di('¿Qué otro período deseas liquidar?')
    setPaso('periodo')
  }

  return (
    <div className="modal-overlay" onClick={() => { if (paso !== 'generando') onClose() }}>
      <div className="modal-box modal-box-flush" onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', height: '32rem' }}>

        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet size={17} style={{ color: 'var(--primary)' }} />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Generar informe de comisiones</h3>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Excel con detalle, resumen por vendedor y tarifas</p>
            </div>
          </div>
          <button onClick={onClose} disabled={paso === 'generando'} className="btn-icon" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        {/* Conversación */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5" style={{ background: '#FAFAF9' }}>
          {mensajes.map((m, i) => (
            <div key={i} className={m.de === 'yo' ? 'flex justify-end' : 'flex justify-start'}>
              <div className="max-w-[80%] px-3.5 py-2.5 text-xs leading-relaxed"
                style={m.de === 'yo'
                  ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: '0.9rem 0.9rem 0.25rem 0.9rem' }
                  : {
                      background: m.alerta ? '#FFFBEB' : '#fff',
                      color: m.alerta ? '#92400E' : 'var(--foreground)',
                      border: `1px solid ${m.alerta ? '#FDE68A' : 'var(--border-light)'}`,
                      borderRadius: '0.9rem 0.9rem 0.9rem 0.25rem',
                    }}>
                {m.alerta && <AlertTriangle size={12} className="inline mr-1.5 -mt-0.5" />}
                {m.texto}
              </div>
            </div>
          ))}
          {paso === 'generando' && (
            <div className="flex items-center gap-2 text-xs px-1" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={12} className="animate-spin" /> Generando…
            </div>
          )}
          <div ref={finRef} />
        </div>

        {/* Acciones */}
        <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border-light)' }}>
          {paso === 'periodo' && (
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary btn-sm"
                onClick={() => { const r = mesActual(); generar(r.desde, r.hasta, `Este mes (${etiquetaRango(r.desde, r.hasta)})`) }}>
                Este mes
              </button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => { const r = mesAnterior(); generar(r.desde, r.hasta, `Mes anterior (${etiquetaRango(r.desde, r.hasta)})`) }}>
                Mes anterior
              </button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => { di('Prefiero elegir las fechas', 'yo'); di('Indica la fecha inicial y la final.'); setPaso('custom') }}>
                Personalizado
              </button>
            </div>
          )}

          {paso === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={desde} max={hasta || undefined}
                onChange={e => setDesde(e.target.value)}
                className="input-field" style={{ width: 'auto', padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }} />
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>a</span>
              <input type="date" value={hasta} min={desde || undefined}
                onChange={e => setHasta(e.target.value)}
                className="input-field" style={{ width: 'auto', padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }} />
              <button className="btn btn-primary btn-sm" disabled={!desde || !hasta}
                onClick={() => generar(desde, hasta, etiquetaRango(desde, hasta))}>
                <Send size={12} /> Generar
              </button>
            </div>
          )}

          {paso === 'listo' && (
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={reiniciar}>Generar otro período</button>
              <button className="btn btn-primary btn-sm" onClick={onClose}>Cerrar</button>
            </div>
          )}

          {paso === 'generando' && (
            <p className="text-xs" style={{ color: 'var(--muted-subtle)' }}>Procesando, no cierres esta ventana…</p>
          )}
        </div>
      </div>
    </div>
  )
}
