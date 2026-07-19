import { useEffect, useRef } from 'react'

export function useEscKey(handler: () => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') ref.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
