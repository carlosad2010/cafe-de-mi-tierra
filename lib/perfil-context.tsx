'use client'

import { createContext, useContext } from 'react'
import { Profile } from '@/lib/types'

const PerfilContext = createContext<Profile | null>(null)

export function PerfilProvider({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return <PerfilContext.Provider value={profile}>{children}</PerfilContext.Provider>
}

export function usePerfil() {
  return useContext(PerfilContext)
}

/**
 * Si el usuario puede modificar datos. Espeja `public.puede_escribir()`
 * en la base, que es donde de verdad se aplica la restricción: esto solo
 * evita mostrar botones que igual serían rechazados.
 */
export function useCanWrite() {
  const perfil = usePerfil()
  if (!perfil) return true          // sin contexto, no estorbar
  return perfil.role !== 'consulta' && perfil.active
}
